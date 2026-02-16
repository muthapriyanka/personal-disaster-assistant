const bcrypt = require('bcryptjs');
const { parseJson } = require('./utils/json');
const { send, sendError } = require('./utils/send');
const { match } = require('./utils/url');
const { query } = require('./db');
const { signJwt, getUserFromAuthHeader } = require('./jwt');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getSafeRoute } = require('./services/route-service');

async function router(req, res) {
  try {
    // Defines requireAuth helper for this request
    const requireAuth = () => {
      const u = getUserFromAuthHeader(req);
      if (!u) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
      }
      return u;
    };

    // ---- LOGGING (DEBUG)
    console.log(`[REQUEST] ${req.method} ${req.url}`);

    // ---- HEALTH
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, ts: new Date().toISOString() });
    }

    // -------- AUTH: REGISTER
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/auth/register' });
      if (m) {
        const body = await parseJson(req);
        const { name, email, password, phone } = body || {};
        if (!name || !email || !password) return send(res, 400, { error: 'name, email, password required' });
        const hash = await bcrypt.hash(password, 10);
        try {
          const result = await query(
            `INSERT INTO user_account(name,email,password_hash,phone)
             VALUES ($1,$2,$3,$4) RETURNING id,name,email`,
            [name, email, hash, phone || null]
          );
          const user = result.rows[0];
          const token = signJwt({ uid: user.id, email: user.email });
          return send(res, 201, { user, token });
        } catch (e) {
          if (e.code === '23505') return send(res, 409, { error: 'email already exists' });
          throw e;
        }
      }
    }

    // -------- AUTH: LOGIN
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/auth/login' });
      if (m) {
        const body = await parseJson(req);
        const { email, password } = body || {};
        if (!email || !password) return send(res, 400, { error: 'email, password required' });

        const r = await query(
          `SELECT id, email, password_hash, name FROM user_account WHERE email=$1`,
          [email]
        );
        if (r.rowCount === 0) return send(res, 401, { error: 'invalid credentials' });

        const user = r.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return send(res, 401, { error: 'invalid credentials' });

        const token = signJwt({ uid: user.id, email: user.email });
        delete user.password_hash;
        return send(res, 200, { user, token });
      }
    }

    // -------- AUTH: GOOGLE SYNC
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/auth/google-sync' });
      if (m) {
        const body = await parseJson(req);
        const { email, name, google_id } = body || {};
        if (!email) return send(res, 400, { error: 'email required' });

        // Check if user exists
        let r = await query(
          `SELECT id, email, name FROM user_account WHERE email=$1`,
          [email]
        );

        let user;
        if (r.rowCount === 0) {
          // Create new user (password is null/dummy since they use Google)
          const insertRes = await query(
            `INSERT INTO user_account(name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, name, email`,
            [name || 'Google User', email, 'google-oauth-user']
          );
          user = insertRes.rows[0];
        } else {
          user = r.rows[0];
        }

        const token = signJwt({ uid: user.id, email: user.email });
        return send(res, 200, { user, token });
      }
    }

    // -------- FAMILY: JOIN
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/family/join' });
      if (m) {
        const auth = requireAuth();
        const body = await parseJson(req);
        const { code } = body || {};
        if (!code) return send(res, 400, { error: 'code required' });

        // Check if family exists (has members) before joining
        const checkRes = await query(`SELECT COUNT(*) as count FROM user_account WHERE family_id = $1`, [code]);
        const countBefore = parseInt(checkRes.rows[0].count, 10);
        const action = countBefore === 0 ? 'created' : 'joined';

        // Join family with the provided code
        await query(
          `UPDATE user_account SET family_id = $1 WHERE id = $2`,
          [code, auth.uid]
        );
        return send(res, 200, { success: true, family_id: code, action, member_count: countBefore + 1 });
      }
    }

    // -------- FAMILY: LEAVE
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/family/leave' });
      if (m) {
        const auth = requireAuth();
        await query(
          `UPDATE user_account SET family_id = NULL WHERE id = $1`,
          [auth.uid]
        );
        return send(res, 200, { success: true });
      }
    }

    // -------- FAMILY: GET MEMBERS
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/family' });
      if (m) {
        const auth = requireAuth();

        // precise user's family_id first
        const userRes = await query(`SELECT family_id FROM user_account WHERE id=$1`, [auth.uid]);
        if (userRes.rowCount === 0) return send(res, 404, { error: 'User not found' });
        const family_id = userRes.rows[0].family_id;

        if (!family_id) {
          return send(res, 200, { family_id: null, members: [] });
        }

        // Get other members
        const r = await query(
          `SELECT id, name, email, phone, last_lat, last_lon, safety_status, battery_level, last_location_update
           FROM user_account
           WHERE family_id = $1 AND id != $2`,
          [family_id, auth.uid]
        );
        return send(res, 200, { family_id, members: r.rows });
      }
    }

    // -------- USER: UPDATE STATUS
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/user/status' });
      if (m) {
        const auth = requireAuth();
        const body = await parseJson(req);
        const { lat, lon, status, battery_level } = body || {};

        if (lat === undefined || lon === undefined) {
          return send(res, 400, { error: 'lat and lon required' });
        }

        await query(
          `UPDATE user_account 
           SET last_lat=$1, last_lon=$2, safety_status=$3, battery_level=$4, last_location_update=NOW()
           WHERE id=$5`,
          [lat, lon, status || 'safe', battery_level || null, auth.uid]
        );
        return send(res, 200, { success: true });
      }
    }

    // -------- USER: UPDATE PUSH TOKEN
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/user/push-token' });
      if (m) {
        const auth = requireAuth();
        const body = await parseJson(req);
        const { token } = body || {};

        if (!token) {
          return send(res, 400, { error: 'token required' });
        }

        await query(
          `UPDATE user_account SET push_token=$1 WHERE id=$2`,
          [token, auth.uid]
        );
        return send(res, 200, { success: true });
      }
    }

    // -------- PLACES: CREATE
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/places' });
      if (m) {
        const auth = requireAuth();
        const body = await parseJson(req);
        const { label, lat, lon } = body || {};
        if (!label || typeof lat !== 'number' || typeof lon !== 'number') {
          return send(res, 400, { error: 'label, lat (number), lon (number) required' });
        }
        const r = await query(
          `INSERT INTO user_place(user_id,label,lat,lon)
           VALUES ($1,$2,$3,$4)
           RETURNING id,label,lat,lon,created_at`,
          [auth.uid, label, lat, lon]
        );
        return send(res, 201, r.rows[0]);
      }
    }

    // -------- PLACES: LIST
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/places' });
      if (m) {
        const auth = requireAuth();
        const r = await query(
          `SELECT id,label,lat,lon,created_at
           FROM user_place
           WHERE user_id=$1
           ORDER BY created_at DESC`,
          [auth.uid]
        );
        return send(res, 200, r.rows);
      }
    }

    // -------- SHELTERS
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/shelters' });
      if (m) {
        const lat = Number(m.search.get('lat'));
        const lon = Number(m.search.get('lon'));
        const radiusKm = Number(m.search.get('radius_km') || 300);
        const city = m.search.get('city');
        const limit = Number(m.search.get('limit') || 100);

        if (Number.isNaN(lat) || Number.isNaN(lon)) {
          return send(res, 400, { error: 'lat and lon (numbers) are required' });
        }

        const sql = `
          WITH params AS (
            SELECT radians($1)::float8 AS lat1,
                   radians($2)::float8 AS lon1,
                   NULLIF($3::float8, 0) AS radius_km
          ),
          calc AS (
            SELECT
              s.id, s.name, s.address, s.lat, s.lon, s.capacity, s.status, s.phone, s.updated_at,
              (
                2 * 6371 * ASIN(
                  SQRT(
                    POWER(SIN((RADIANS(s.lat) - (SELECT lat1 FROM params)) / 2), 2) +
                    COS((SELECT lat1 FROM params)) * COS(RADIANS(s.lat)) *
                    POWER(SIN((RADIANS(s.lon) - (SELECT lon1 FROM params)) / 2), 2)
                  )
                )
              ) AS dist_km
            FROM shelter s
            ${status ? `WHERE s.status = $4` : ``}
          )
          SELECT * FROM calc
          WHERE ((SELECT radius_km FROM params) IS NULL OR dist_km <= (SELECT radius_km FROM params))
          ORDER BY dist_km ASC, capacity DESC
          LIMIT ${Number.isFinite(limit) ? limit : 10};
        `;
        const radiusParam = Number.isNaN(radiusKm) ? 0 : radiusKm;
        const params = status ? [lat, lon, radiusParam, status] : [lat, lon, radiusParam];

        const r = await query(sql, params);
        return send(res, 200, r.rows);
      }
    }

    // -------- OVERVIEW: hazards + adaptive shelters
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/overview' });
      if (m) {
        const lat = Number(m.search.get('lat'));
        const lon = Number(m.search.get('lon'));
        const radiusKm = Number(m.search.get('radius_km') || 100);
        const city = (m.search.get('city') || '').trim();
        const limit = Number(m.search.get('limit') || 5);

        if (Number.isNaN(lat) || Number.isNaN(lon)) {
          return send(res, 400, { error: 'lat and lon (numbers) are required' });
        }

        const hazardSql = `
          WITH params AS (
            SELECT radians($1)::float8 AS lat1,
                   radians($2)::float8 AS lon1,
                   $3::float8 AS radius_km
          ),
          calc AS (
            SELECT
              h.id, h.type, h.severity, h.occurred_at, h.lat, h.lon,
              h.source, h.source_event_id, h.attributes,
              (
                2 * 6371 * ASIN(
                  SQRT(
                    POWER(SIN((RADIANS(h.lat) - (SELECT lat1 FROM params)) / 2), 2) +
                    COS((SELECT lat1 FROM params)) * COS(RADIANS(h.lat)) *
                    POWER(SIN((RADIANS(h.lon) - (SELECT lon1 FROM params)) / 2), 2)
                  )
                )
              ) AS dist_km
            FROM hazard h
            WHERE h.type = 'earthquake'
          )
          SELECT * FROM calc
          WHERE dist_km <= (SELECT radius_km FROM params)
          ORDER BY occurred_at DESC
          LIMIT 10;
        `;

        const sheltersSql = (withRadius) => `
          WITH params AS (
            SELECT radians($1)::float8 AS lat1,
                   radians($2)::float8 AS lon1
          )
          SELECT
            s.id, s.name, s.address, s.lat, s.lon, s.capacity, s.status, s.phone, s.updated_at, s.type,
            (
              2 * 6371 * ASIN(
                SQRT(
                  POWER(SIN((RADIANS(s.lat) - (SELECT lat1 FROM params)) / 2), 2) +
                  COS((SELECT lat1 FROM params)) * COS(RADIANS(s.lat)) *
                  POWER(SIN((RADIANS(s.lon) - (SELECT lon1 FROM params)) / 2), 2)
                )
              )
            ) AS dist_km
          FROM shelter s
          ${withRadius ? `` : ``}
        `;

        const hazardsRes = await query(hazardSql, [lat, lon, radiusKm]);
        const hazards = hazardsRes.rows;

        const tryRadii = [];
        if (Number.isFinite(radiusKm) && radiusKm > 0) tryRadii.push(radiusKm);
        for (const r of [100, 300, 1000]) if (!tryRadii.includes(r)) tryRadii.push(r);

        let shelters = [];
        let strategy = null;

        for (const r of tryRadii) {
          const sql = `
            WITH src AS (${sheltersSql(true)})
            SELECT * FROM src
            WHERE dist_km <= $3
            ORDER BY dist_km ASC, capacity DESC NULLS LAST
            LIMIT $4;
          `;
          const rRes = await query(sql, [lat, lon, r, limit]);
          if (rRes.rowCount > 0) {
            shelters = rRes.rows;
            strategy = `radius_${r}km`;
            break;
          }
        }

        if (shelters.length === 0 && city) {
          const cityRes = await query(
            `
            SELECT
              s.id, s.name, s.address, s.lat, s.lon, s.capacity, s.status, s.phone, s.updated_at,
              (
                2 * 6371 * ASIN(
                  SQRT(
                    POWER(SIN((RADIANS(s.lat) - RADIANS($1)) / 2), 2) +
                    COS(RADIANS($1)) * COS(RADIANS(s.lat)) *
                    POWER(SIN((RADIANS(s.lon) - RADIANS($2)) / 2), 2)
                  )
                )
              ) AS dist_km
            FROM shelter s
            WHERE s.address ILIKE $3
            ORDER BY dist_km ASC, capacity DESC NULLS LAST
            LIMIT $4;
            `,
            [lat, lon, `%${city}%`, limit]
          );
          if (cityRes.rowCount > 0) {
            shelters = cityRes.rows;
            strategy = `city_match_${city}`;
          }
        }

        if (shelters.length === 0) {
          const anyRes = await query(
            `
            WITH src AS (${sheltersSql(false)})
            SELECT * FROM src
            ORDER BY dist_km ASC, capacity DESC NULLS LAST
            LIMIT $3;
            `,
            [lat, lon, limit]
          );
          shelters = anyRes.rows;
          strategy = 'nearest_anywhere';
        }

        return send(res, 200, {
          location: { lat, lon, radius_km: radiusKm, city: city || null },
          hazards,
          shelters: { items: shelters, strategy }
        });
      }
    }

    // -------- HAZARDS
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/hazards' });
      if (m) {
        const lat = Number(m.search.get('lat'));
        const lon = Number(m.search.get('lon'));
        const type = m.search.get('type') || 'earthquake';
        const radiusKm = Number(m.search.get('radius_km') || 50);
        const since = m.search.get('since');

        if (Number.isNaN(lat) || Number.isNaN(lon)) {
          return send(res, 400, { error: 'lat and lon (numbers) are required' });
        }

        const sql = `
          WITH params AS (
            SELECT radians($1)::float8 AS lat1,
                   radians($2)::float8 AS lon1,
                   $3::float8 AS radius_km
          ),
          calc AS (
            SELECT
              h.id, h.type, h.severity, h.occurred_at, h.lat, h.lon,
              h.source, h.source_event_id, h.attributes,
              (
                2 * 6371 * ASIN(
                  SQRT(
                    POWER(SIN((RADIANS(h.lat) - (SELECT lat1 FROM params)) / 2), 2) +
                    COS((SELECT lat1 FROM params)) * COS(RADIANS(h.lat)) *
                    POWER(SIN((RADIANS(h.lon) - (SELECT lon1 FROM params)) / 2), 2)
                  )
                )
              ) AS dist_km
            FROM hazard h
            WHERE h.type = $4
            ${since ? `AND h.occurred_at >= $5` : ``}
          )
          SELECT *
          FROM calc
          WHERE dist_km <= (SELECT radius_km FROM params)
          ORDER BY occurred_at DESC
          LIMIT 200;
        `;
        // fixed params index. if since is present, it is $5
        const params = since ? [lat, lon, radiusKm, type, since] : [lat, lon, radiusKm, type];
        const r = await query(sql, params);
        return send(res, 200, r.rows);
      }
    }

    // -------- ALERTS
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/alerts' });
      if (m) {
        const auth = requireAuth();
        const r = await query(
          `SELECT a.id, a.hazard_id, a.message, a.channel, a.created_at,
                  h.lat AS hazard_lat, h.lon AS hazard_lon, h.type AS hazard_type, h.attributes
           FROM alert a
           LEFT JOIN hazard h ON a.hazard_id = h.id
           WHERE a.user_id = $1
           ORDER BY a.created_at DESC
           LIMIT 200`,
          [auth.uid]
        );
        return send(res, 200, r.rows);
      }
    }

    // -------- ECHO
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/echo' });
      if (m) {
        const body = await parseJson(req);
        return send(res, 200, { you_sent: body });
      }
    }

    // -------- CHAT (AI-Enhanced)
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/chat' });
      if (m) {
        const body = await parseJson(req);
        const { message, lat, lon } = body || {};
        const userMsg = (message || '').toLowerCase();

        // 1. Check if Gemini API Key is configured
        if (!process.env.GEMINI_API_KEY) {
          console.warn("GEMINI_API_KEY is missing. Falling back to keyword bot.");
          // Fallback to simple logic if key is missing
          let responseText = "I functionality is limited. Please add a GEMINI_API_KEY to your backend .env file to enable smart chat.";
          if (userMsg.includes('fire')) responseText = "I can't check for fires smartly without my AI brain enabled, but check the map layer!";
          return send(res, 200, { response: responseText });
        }

        try {
          // 2. Gather Context (Hazards & Shelters)
          let context = `User Location: Lat ${lat || 'Unknown'}, Lon ${lon || 'Unknown'}.\n`;

          if (typeof lat === 'number' && typeof lon === 'number') {
            // Fetch nearby hazards (< 300km)
            const hazardRes = await query(`
                    SELECT type, severity, attributes, occurred_at,
                           (6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lon) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) AS dist_km
                    FROM hazard
                    WHERE occurred_at > NOW() - INTERVAL '7 days'
                    ORDER BY dist_km ASC
                    LIMIT 5
                `, [lat, lon]);

            if (hazardRes.rows.length > 0) {
              context += "Nearby Active Hazards:\n";
              hazardRes.rows.forEach(h => {
                context += `- ${h.severity} ${h.type} (${Math.round(h.dist_km)}km away). Details: ${JSON.stringify(h.attributes)}\n`;
              });
            } else {
              context += "No reported hazards found nearby (within 300km).\n";
            }

            // Fetch nearby shelters (< 50km)
            const shelterRes = await query(`
                    SELECT name, type, address, status, phone,
                           (6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lon) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) AS dist_km
                    FROM shelter
                    WHERE status = 'active'
                    ORDER BY dist_km ASC
                    LIMIT 3
                `, [lat, lon]);

            if (shelterRes.rows.length > 0) {
              context += "Nearby Emergency Shelters:\n";
              shelterRes.rows.forEach(s => {
                context += `- ${s.name} (${s.type}) at ${s.address} (${Math.round(s.dist_km)}km away). Phone: ${s.phone || 'N/A'}\n`;
              });
            } else {
              context += "No active shelters found nearby.\n";
            }
          } else {
            context += "Location not provided. Remind user to enable location for better help.\n";
          }

          // 3. Call Gemini
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

          const prompt = `
            You are Guardian AI, a helpful disaster assistant. 
            CONTEXT:
            ${context}
            
            USER QUESTION: "${message}"
            
            INSTRUCTION:
            Answer the user's question based on the context provided. 
            - If there are hazards nearby, WARN them first.
            - If they ask for help/shelter, refer to the specific shelters listed.
            - If no data is available, give general safety advice.
            - Keep the answer concise (under 3 sentences if possible) and supportive.
            `;

          console.log("Creating AI response...");
          const result = await model.generateContent(prompt);
          const responseText = result.response.text();

          return send(res, 200, { response: responseText });

        } catch (error) {
          console.error("Gemini AI Error:", error);
          return send(res, 200, { response: "I'm having trouble connecting to my AI brain right now. Please try again later." });
        }
      }
    }

    // -------- ROUTING (Safe Evacuation)
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/route' });
      if (m) {
        const startLat = Number(m.search.get('startLat'));
        const startLon = Number(m.search.get('startLon'));
        const endLat = Number(m.search.get('endLat'));
        const endLon = Number(m.search.get('endLon'));
        const mode = m.search.get('mode') || 'driving';

        if ([startLat, startLon, endLat, endLon].some(isNaN)) {
          return send(res, 400, { error: 'startLat, startLon, endLat, endLon required' });
        }

        const routeData = await getSafeRoute(startLat, startLon, endLat, endLon, mode);
        return send(res, 200, routeData);
      }
    }

    // ---- 404
    return send(res, 404, { error: 'Not Found' });

  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { router };
