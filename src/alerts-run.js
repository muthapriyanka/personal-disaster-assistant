const { query } = require('./db');

const LOOKBACK_MINUTES = Number(process.env.ALERT_LOOKBACK_MINUTES || 60);

/**
 * Radius rule (km) for earthquakes:
 *  - base 15 km, grows with magnitude (~10 km per magnitude)
 */
// function radiusKmExpr() {
//   return `GREATEST(15, 10 * COALESCE((h.attributes->>'magnitude')::numeric, 3))`;
// }

function radiusKmExpr() {
  return `500`;
}


async function runAlerts() {
  // 1) recent earthquakes
  const recentQuakes = await query(
    `
    SELECT h.*
    FROM hazard h
    WHERE h.type = 'earthquake'
      AND h.occurred_at >= NOW() - make_interval(mins => $1)
    ORDER BY h.occurred_at DESC
    `,
    [LOOKBACK_MINUTES]
  );

  let created = 0;

  // 2) for each quake, find nearby user places (Haversine) and insert alerts
  for (const h of recentQuakes.rows) {
    const params = [h.id];

    // compute distance for every user_place; filter by dynamic radius
    const candidates = await query(
      `
      WITH quake AS (
        SELECT id, lat AS qlat, lon AS qlon,
               COALESCE((attributes->>'magnitude')::numeric, NULL) AS mag
        FROM hazard WHERE id = $1
      ),
      -- 1. Check Saved Places
      places AS (
        SELECT
          up.user_id,
          (
            2 * 6371 * ASIN(
              SQRT(
                POWER(SIN((RADIANS(up.lat) - RADIANS(q.qlat)) / 2), 2) +
                COS(RADIANS(up.lat)) * COS(RADIANS(q.qlat)) *
                POWER(SIN((RADIANS(up.lon) - RADIANS(q.qlon)) / 2), 2)
              )
            )
          ) AS dist_km,
          500 AS radius_km,
          (SELECT mag FROM quake) AS magnitude
        FROM user_place up CROSS JOIN quake q
      ),
      -- 2. Check Live Location
      live AS (
        SELECT
          ua.id AS user_id,
          (
            2 * 6371 * ASIN(
              SQRT(
                POWER(SIN((RADIANS(ua.last_lat) - RADIANS(q.qlat)) / 2), 2) +
                COS(RADIANS(ua.last_lat)) * COS(RADIANS(q.qlat)) *
                POWER(SIN((RADIANS(ua.last_lon) - RADIANS(q.qlon)) / 2), 2)
              )
            )
          ) AS dist_km,
          500 AS radius_km,
          (SELECT mag FROM quake) AS magnitude
        FROM user_account ua CROSS JOIN quake q
        WHERE ua.last_lat IS NOT NULL AND ua.last_lon IS NOT NULL
      ),
      combined AS (
        SELECT * FROM places
        UNION
        SELECT * FROM live
      )
      SELECT DISTINCT ON (user_id) user_id, dist_km, radius_km, magnitude
      FROM combined
      WHERE dist_km <= radius_km
      `,
      params
    );

    if (candidates.rowCount === 0) continue;

    // 3) insert alerts (dedup by unique index)
    for (const c of candidates.rows) {
      const msg =
        c.magnitude != null
          ? `Earthquake M${Number(c.magnitude).toFixed(1)} detected ~${Math.round(c.dist_km)} km from your saved place.`
          : `Earthquake detected ~${Math.round(c.dist_km)} km from your saved place.`;

      try {
        const result = await query(
          `
          INSERT INTO alert(user_id, hazard_id, message)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, hazard_id) DO NOTHING
          `,
          [c.user_id, h.id, msg]
        );
        if (result.rowCount > 0) created++;
      } catch (e) {
        // ignore duplicates or transient errors
      }
    }
  }

  console.log(`New alerts inserted: ${created}`);

  // 4) Cleanup old alerts (> 24 hours)
  try {
    const cleanup = await query(`DELETE FROM alert WHERE created_at < NOW() - INTERVAL '24 hours'`);
    if (cleanup.rowCount > 0) {
      console.log(`Cleaned up ${cleanup.rowCount} old alerts.`);
    }
  } catch (e) {
    console.error('Alert cleanup failed:', e.message);
  }
}

if (require.main === module) {
  runAlerts()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runAlerts };
