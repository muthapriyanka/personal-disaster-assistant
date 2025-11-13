// const bcrypt = require('bcryptjs');
// const { parseJson } = require('./utils/json');
// const { send, sendError } = require('./utils/send');
// const { match } = require('./utils/url');
// const { query } = require('./db');
// const { signJwt, getUserFromAuthHeader } = require('./jwt');
// //const { query } = require('./db');

// async function router(req, res) {
//   try {
//     // ---- HEALTH
//     if (req.method === 'GET' && req.url === '/health') {
//       return send(res, 200, { ok: true, ts: new Date().toISOString() });
//     }

//     // -------- AUTH: REGISTER
//     {
//       const m = match(req.method, req.url, { method: 'POST', path: '/auth/register' });
//       if (m) {
//         const body = await parseJson(req);
//         const { name, email, password, phone } = body || {};
//         if (!name || !email || !password) {
//           return send(res, 400, { error: 'name, email, password required' });
//         }
//         const hash = await bcrypt.hash(password, 10);
//         try {
//           const result = await query(
//             `INSERT INTO user_account(name,email,password_hash,phone)
//              VALUES ($1,$2,$3,$4) RETURNING id,name,email`,
//             [name, email, hash, phone || null]
//           );
//           const user = result.rows[0];
//           const token = signJwt({ uid: user.id, email: user.email });
//           return send(res, 201, { user, token });
//         } catch (e) {
//           if (e.code === '23505') return send(res, 409, { error: 'email already exists' });
//           throw e;
//         }
//       }
//     }

//     // -------- AUTH: LOGIN
//     {
//       const m = match(req.method, req.url, { method: 'POST', path: '/auth/login' });
//       if (m) {
//         const body = await parseJson(req);
//         const { email, password } = body || {};
//         if (!email || !password) return send(res, 400, { error: 'email, password required' });

//         const r = await query(
//           `SELECT id, email, password_hash, name FROM user_account WHERE email=$1`,
//           [email]
//         );
//         if (r.rowCount === 0) return send(res, 401, { error: 'invalid credentials' });

//         const user = r.rows[0];
//         const ok = await bcrypt.compare(password, user.password_hash);
//         if (!ok) return send(res, 401, { error: 'invalid credentials' });

//         const token = signJwt({ uid: user.id, email: user.email });
//         delete user.password_hash;
//         return send(res, 200, { user, token });
//       }
//     }

//     // ---- AUTH GUARD helper
//     const requireAuth = () => {
//       const u = getUserFromAuthHeader(req);
//       if (!u) {
//         const err = new Error('Unauthorized');
//         err.status = 401;
//         throw err;
//       }
//       return u;
//     };

//     // -------- PLACES: CREATE
//     {
//       const m = match(req.method, req.url, { method: 'POST', path: '/places' });
//       if (m) {
//         const auth = requireAuth();
//         const body = await parseJson(req);
//         const { label, lat, lon } = body || {};
//         if (!label || typeof lat !== 'number' || typeof lon !== 'number') {
//           return send(res, 400, { error: 'label, lat (number), lon (number) required' });
//         }
//         const r = await query(
//           `INSERT INTO user_place(user_id,label,lat,lon)
//            VALUES ($1,$2,$3,$4)
//            RETURNING id,label,lat,lon,created_at`,
//           [auth.uid, label, lat, lon]
//         );
//         return send(res, 201, r.rows[0]);
//       }
//     }


//     // -------- SHELTERS: query near lat/lon
// {
//   const m = match(req.method, req.url, { method: 'GET', path: '/shelters' });
//   if (m) {
//     const lat = Number(m.search.get('lat'));
//     const lon = Number(m.search.get('lon'));
//     const radiusKm = Number(m.search.get('radius_km') || 50);
//     const status = m.search.get('status'); // optional: open|full|closed

//     if (Number.isNaN(lat) || Number.isNaN(lon)) {
//       return send(res, 400, { error: 'lat and lon (numbers) are required' });
//     }

//     const limit = Number(m.search.get('limit') || 10);

//         const sql = `
//         WITH params AS (
//             SELECT radians($1)::float8 AS lat1,
//                 radians($2)::float8 AS lon1,
//                 NULLIF($3::float8, 0) AS radius_km -- if 0, treat as no radius filter
//         ),
//         calc AS (
//             SELECT
//             s.id, s.name, s.address, s.lat, s.lon, s.capacity, s.status, s.phone, s.updated_at,
//             (
//                 2 * 6371 * ASIN(
//                 SQRT(
//                     POWER(SIN((RADIANS(s.lat) - (SELECT lat1 FROM params)) / 2), 2) +
//                     COS((SELECT lat1 FROM params)) * COS(RADIANS(s.lat)) *
//                     POWER(SIN((RADIANS(s.lon) - (SELECT lon1 FROM params)) / 2), 2)
//                 )
//                 )
//             ) AS dist_km
//             FROM shelter s
//             ${status ? `WHERE s.status = $4` : ``}
//         )
//         SELECT * FROM calc
//         ${status
//             ? `WHERE ((SELECT radius_km FROM params) IS NULL OR dist_km <= (SELECT radius_km FROM params))`
//             : `WHERE ((SELECT radius_km FROM params) IS NULL OR dist_km <= (SELECT radius_km FROM params))`}
//         ORDER BY dist_km ASC, capacity DESC
//         LIMIT ${Number.isFinite(limit) ? limit : 10};
//         `;

//         const radiusParam = Number.isNaN(radiusKm) ? 0 : radiusKm; // pass 0 to disable radius
//         const params = status ? [lat, lon, radiusParam, status] : [lat, lon, radiusParam];

//     const r = await query(sql, params);
//     return send(res, 200, r.rows);
//   }
// }

// // -------- OVERVIEW: show both hazards and shelters
// {
//   const m = match(req.method, req.url, { method: 'GET', path: '/overview' });
//   if (m) {
//     const lat = Number(m.search.get('lat'));
//     const lon = Number(m.search.get('lon'));
//     const radiusKm = Number(m.search.get('radius_km') || 100);

//     if (Number.isNaN(lat) || Number.isNaN(lon)) {
//       return send(res, 400, { error: 'lat and lon (numbers) are required' });
//     }

//     // Query hazards (earthquakes)
//     const hazardSql = `
//       WITH params AS (
//         SELECT radians($1)::float8 AS lat1,
//                radians($2)::float8 AS lon1,
//                $3::float8 AS radius_km
//       ),
//       calc AS (
//         SELECT
//           h.id, h.type, h.severity, h.occurred_at, h.lat, h.lon,
//           h.source, h.source_event_id, h.attributes,
//           (
//             2 * 6371 * ASIN(
//               SQRT(
//                 POWER(SIN((RADIANS(h.lat) - (SELECT lat1 FROM params)) / 2), 2) +
//                 COS((SELECT lat1 FROM params)) * COS(RADIANS(h.lat)) *
//                 POWER(SIN((RADIANS(h.lon) - (SELECT lon1 FROM params)) / 2), 2)
//               )
//             )
//           ) AS dist_km
//         FROM hazard h
//         WHERE h.type = 'earthquake'
//       )
//       SELECT * FROM calc
//       WHERE dist_km <= (SELECT radius_km FROM params)
//       ORDER BY occurred_at DESC
//       LIMIT 10;
//     `;

//     // Query shelters
//     const shelterSql = `
//       WITH params AS (
//         SELECT radians($1)::float8 AS lat1,
//                radians($2)::float8 AS lon1,
//                $3::float8 AS radius_km
//       ),
//       calc AS (
//         SELECT
//           s.id, s.name, s.address, s.lat, s.lon, s.capacity, s.status, s.phone,
//           (
//             2 * 6371 * ASIN(
//               SQRT(
//                 POWER(SIN((RADIANS(s.lat) - (SELECT lat1 FROM params)) / 2), 2) +
//                 COS((SELECT lat1 FROM params)) * COS(RADIANS(s.lat)) *
//                 POWER(SIN((RADIANS(s.lon) - (SELECT lon1 FROM params)) / 2), 2)
//               )
//             )
//           ) AS dist_km
//         FROM shelter s
//       )
//       SELECT * FROM calc
//       WHERE dist_km <= (SELECT radius_km FROM params)
//       ORDER BY dist_km ASC
//       LIMIT 10;
//     `;

//     // Run both queries in parallel
//     const [hazards, shelters] = await Promise.all([
//       query(hazardSql, [lat, lon, radiusKm]),
//       query(shelterSql, [lat, lon, radiusKm]),
//     ]);

//     return send(res, 200, {
//       location: { lat, lon, radius_km: radiusKm },
//       hazards: hazards.rows,
//       shelters: shelters.rows,
//     });
//   }
// }


//     // -------- PLACES: LIST
//     {
//       const m = match(req.method, req.url, { method: 'GET', path: '/places' });
//       if (m) {
//         const auth = requireAuth();
//         const r = await query(
//           `SELECT id,label,lat,lon,created_at
//            FROM user_place
//            WHERE user_id=$1
//            ORDER BY created_at DESC`,
//           [auth.uid]
//         );
//         return send(res, 200, r.rows);
//       }
//     }

//     // -------- HAZARDS: query near lat/lon
// {
//   const m = match(req.method, req.url, { method: 'GET', path: '/hazards' });
//   if (m) {
//     const lat = Number(m.search.get('lat'));
//     const lon = Number(m.search.get('lon'));
//     const type = m.search.get('type') || 'earthquake';
//     const radiusKm = Number(m.search.get('radius_km') || 50);
//     const since = m.search.get('since'); // ISO optional

//     if (Number.isNaN(lat) || Number.isNaN(lon)) {
//       return send(res, 400, { error: 'lat and lon (numbers) are required' });
//     }

//     // Haversine in SQL (no PostGIS)
//     const sql = `
//         WITH params AS (
//             SELECT radians($1)::float8 AS lat1,
//                 radians($2)::float8 AS lon1,
//                 $3::float8 AS radius_km
//         ),
//         calc AS (
//             SELECT
//             h.id, h.type, h.severity, h.occurred_at, h.lat, h.lon,
//             h.source, h.source_event_id, h.attributes,
//             (
//                 2 * 6371 * ASIN(
//                 SQRT(
//                     POWER(SIN((RADIANS(h.lat) - (SELECT lat1 FROM params)) / 2), 2) +
//                     COS((SELECT lat1 FROM params)) * COS(RADIANS(h.lat)) *
//                     POWER(SIN((RADIANS(h.lon) - (SELECT lon1 FROM params)) / 2), 2)
//                 )
//                 )
//             ) AS dist_km
//             FROM hazard h
//             WHERE h.type = $4
//             ${since ? `AND h.occurred_at >= $6` : ``}
//         )
//         SELECT *
//         FROM calc
//         WHERE dist_km <= (SELECT radius_km FROM params)
//         ORDER BY occurred_at DESC
//         LIMIT 200;
//         `;

//         const params = since
//         ? [lat, lon, radiusKm, type, null, since]
//         : [lat, lon, radiusKm, type];


//     const r = await query(sql, params);
//     return send(res, 200, r.rows);
//   }
// }


// // -------- ALERTS: list my alerts
// {
//   const m = match(req.method, req.url, { method: 'GET', path: '/alerts' });
//   if (m) {
//     const { getUserFromAuthHeader } = require('./jwt');
//     const { query } = require('./db');

//     const u = getUserFromAuthHeader(req);
//     if (!u) return send(res, 401, { error: 'Unauthorized' });

//     const r = await query(
//       `SELECT a.id, a.hazard_id, a.message, a.channel, a.created_at
//        FROM alert a
//        WHERE a.user_id = $1
//        ORDER BY a.created_at DESC
//        LIMIT 200`,
//       [u.uid]
//     );
//     return send(res, 200, r.rows);
//   }
// }

//     // -------- ECHO (debug)
//     {
//       const m = match(req.method, req.url, { method: 'POST', path: '/echo' });
//       if (m) {
//         const body = await parseJson(req);
//         return send(res, 200, { you_sent: body });
//       }
//     }

//     // -------- (OPTIONAL) Placeholder endpoints you had:
//     {
//       const m = match(req.method, req.url, { method: 'GET', path: '/hazards' });
//       if (m) return send(res, 200, []);
//     }
//     {
//       const m = match(req.method, req.url, { method: 'GET', path: '/alerts' });
//       if (m) return send(res, 200, []);
//     }

//     return send(res, 404, { error: 'Not Found' });
//   } catch (err) {
//     return sendError(res, err);
//   }
// }

// module.exports = { router };


const bcrypt = require('bcryptjs');
const { parseJson } = require('./utils/json');
const { send, sendError } = require('./utils/send');
const { match } = require('./utils/url');
const { query } = require('./db');
const { signJwt, getUserFromAuthHeader } = require('./jwt');

async function router(req, res) {
  try {
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

        const r = await query(`SELECT id, email, password_hash, name FROM user_account WHERE email=$1`, [email]);
        if (r.rowCount === 0) return send(res, 401, { error: 'invalid credentials' });

        const user = r.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return send(res, 401, { error: 'invalid credentials' });

        const token = signJwt({ uid: user.id, email: user.email });
        delete user.password_hash;
        return send(res, 200, { user, token });
      }
    }

    // ---- AUTH GUARD helper
    const requireAuth = () => {
      const u = getUserFromAuthHeader(req);
      if (!u) { const err = new Error('Unauthorized'); err.status = 401; throw err; }
      return u;
    };

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

    // -------- SHELTERS: query near lat/lon (supports radius_km=0 to disable radius, and limit)
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/shelters' });
      if (m) {
        const lat = Number(m.search.get('lat'));
        const lon = Number(m.search.get('lon'));
        const radiusKm = Number(m.search.get('radius_km') || 50);
        const status = m.search.get('status'); // optional: open|full|closed
        const limit = Number(m.search.get('limit') || 10);

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
        const radiusParam = Number.isNaN(radiusKm) ? 0 : radiusKm; // pass 0 to disable radius
        const params = status ? [lat, lon, radiusParam, status] : [lat, lon, radiusParam];

        const r = await query(sql, params);
        return send(res, 200, r.rows);
      }
    }

   // -------- OVERVIEW: earthquakes + adaptive shelters
{
  const m = match(req.method, req.url, { method: 'GET', path: '/overview' });
  if (m) {
    const lat = Number(m.search.get('lat'));
    const lon = Number(m.search.get('lon'));
    const radiusKm = Number(m.search.get('radius_km') || 100); // starting radius for hazards
    const city = (m.search.get('city') || '').trim();          // optional fallback
    const limit = Number(m.search.get('limit') || 5);          // how many shelters to return

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return send(res, 400, { error: 'lat and lon (numbers) are required' });
    }

    // 1) hazards (earthquakes) within the provided radius
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

    // helper: nearest shelters with optional radius (if radiusKm=null -> no radius filter)
    const sheltersSql = (withRadius) => `
      WITH params AS (
        SELECT radians($1)::float8 AS lat1,
               radians($2)::float8 AS lon1
      )
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
      ${withRadius ? `-- radius filter applied later in outer WHERE` : ``}
    `;

    // 2) run hazards query
    const hazardsRes = await query(hazardSql, [lat, lon, radiusKm]);
    const hazards = hazardsRes.rows;

    // 3) adaptive shelters strategy
    // try: given radius -> 100 -> 300 -> 1000 -> (optional city) -> nearest-anywhere
    const tryRadii = [];
    if (Number.isFinite(radiusKm) && radiusKm > 0) tryRadii.push(radiusKm);
    for (const r of [100, 300, 1000]) if (!tryRadii.includes(r)) tryRadii.push(r);

    let shelters = [];
    let strategy = null;

    // try radii
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

    // fallback to city match (address ILIKE) if provided
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

    // final fallback: nearest anywhere (no radius)
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


    // -------- HAZARDS: query near lat/lon
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/hazards' });
      if (m) {
        const lat = Number(m.search.get('lat'));
        const lon = Number(m.search.get('lon'));
        const type = m.search.get('type') || 'earthquake';
        const radiusKm = Number(m.search.get('radius_km') || 50);
        const since = m.search.get('since'); // ISO optional

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
            ${since ? `AND h.occurred_at >= $6` : ``}
          )
          SELECT *
          FROM calc
          WHERE dist_km <= (SELECT radius_km FROM params)
          ORDER BY occurred_at DESC
          LIMIT 200;
        `;
        const params = since ? [lat, lon, radiusKm, type, null, since] : [lat, lon, radiusKm, type];
        const r = await query(sql, params);
        return send(res, 200, r.rows);
      }
    }

    // -------- ALERTS: list my alerts
    {
      const m = match(req.method, req.url, { method: 'GET', path: '/alerts' });
      if (m) {
        const u = getUserFromAuthHeader(req);
        if (!u) return send(res, 401, { error: 'Unauthorized' });

        const r = await query(
          `SELECT a.id, a.hazard_id, a.message, a.channel, a.created_at
           FROM alert a
           WHERE a.user_id = $1
           ORDER BY a.created_at DESC
           LIMIT 200`,
          [u.uid]
        );
        return send(res, 200, r.rows);
      }
    }

    // -------- ECHO (debug)
    {
      const m = match(req.method, req.url, { method: 'POST', path: '/echo' });
      if (m) {
        const body = await parseJson(req);
        return send(res, 200, { you_sent: body });
      }
    }

    // ---- 404
    return send(res, 404, { error: 'Not Found' });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { router };
