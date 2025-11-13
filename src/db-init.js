const { query } = require('./db');

async function init() {
  // users
  await query(`
    CREATE TABLE IF NOT EXISTS user_account (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // user saved places (lat/lon for now)
  await query(`
    CREATE TABLE IF NOT EXISTS user_place (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
      label TEXT NOT NULL,         -- 'home', 'work', etc
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  console.log('DB init complete');
}

if (require.main === module) {
  init().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { init };
