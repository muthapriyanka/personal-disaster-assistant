const { query } = require('./db');

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS hazard (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('earthquake','flood','wildfire','tsunami')),
      severity NUMERIC,
      occurred_at TIMESTAMPTZ NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      source TEXT NOT NULL,
      source_event_id TEXT NOT NULL,
      attributes JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS hazard_source_event_idx ON hazard(source, source_event_id);`);

  await query(`
    CREATE TABLE IF NOT EXISTS earthquake_event (
      id BIGSERIAL PRIMARY KEY,
      hazard_id BIGINT NOT NULL REFERENCES hazard(id) ON DELETE CASCADE,
      magnitude NUMERIC,
      depth_km NUMERIC,
      place TEXT
    );
  `);

  console.log('Hazard migration complete');
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { migrate };
