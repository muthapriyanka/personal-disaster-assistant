const { query } = require('./db');

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS shelter (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      capacity INTEGER,
      status TEXT NOT NULL DEFAULT 'open',  -- open | full | closed
      phone TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (name, lat, lon)              -- needed for ON CONFLICT in ingest
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS shelter_lat_lon_idx ON shelter(lat, lon);`);

  console.log('Shelter migration complete');
}

if (require.main === module) {
  migrate().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
}

module.exports = { migrate };
