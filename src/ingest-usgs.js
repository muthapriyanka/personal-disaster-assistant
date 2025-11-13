const { query } = require('./db');

function magToSeverity(mag) {
  if (mag == null || Number.isNaN(Number(mag))) return null;
  const s = (Number(mag) - 4) / 4;         // M4->0, M8->1
  return Math.max(0, Math.min(1, s));
}

async function fetchUSGS() {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
  const res = await fetch(url, { headers: { 'user-agent': 'pda-backend/1.0' } });
  if (!res.ok) throw new Error(`USGS fetch failed: ${res.status}`);
  return res.json();
}

async function upsertEarthquake(feature) {
  const id = feature.id;
  const p = feature.properties || {};
  const g = feature.geometry || {};
  if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return;

  const lon = Number(g.coordinates[0]);
  const lat = Number(g.coordinates[1]);
  const occurredAt = p.time ? new Date(p.time).toISOString() : new Date().toISOString();
  const magnitude = p.mag != null ? Number(p.mag) : null;
  const depthKm = g.coordinates.length > 2 ? Number(g.coordinates[2]) : null;
  const place = p.place || null;
  const severity = magToSeverity(magnitude);

  const upsertHazard = `
    INSERT INTO hazard(type, severity, occurred_at, lat, lon, source, source_event_id, attributes)
    VALUES ('earthquake', $1, $2, $3, $4, 'USGS', $5, $6)
    ON CONFLICT (source, source_event_id) DO UPDATE
      SET severity=EXCLUDED.severity,
          occurred_at=EXCLUDED.occurred_at,
          lat=EXCLUDED.lat,
          lon=EXCLUDED.lon,
          attributes=EXCLUDED.attributes
    RETURNING id;
  `;
  const attributes = { magnitude, depth_km: depthKm, place, url: p.url || null };
  const r = await query(upsertHazard, [severity, occurredAt, lat, lon, id, attributes]);
  const hazardId = r.rows[0].id;

  await query(
    `INSERT INTO earthquake_event(hazard_id, magnitude, depth_km, place)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [hazardId, magnitude, depthKm, place]
  );
}

async function main() {
  const data = await fetchUSGS();
  const feats = (data && data.features) || [];
  console.log(`USGS features: ${feats.length}`);
  for (const f of feats) {
    try { await upsertEarthquake(f); } catch (e) { console.error('upsert error:', e.message); }
  }
  console.log('USGS ingest done');
}

if (require.main === module) {
  main().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
}

module.exports = { main };
