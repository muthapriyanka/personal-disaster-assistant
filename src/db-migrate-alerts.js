const { query } = require('./db');

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS alert (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
      hazard_id BIGINT NOT NULL REFERENCES hazard(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'push', -- placeholder for later
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      delivered_at TIMESTAMPTZ
    );
  `);

  //-- prevent duplicates for same user+hazard
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'alert_user_hazard_uniq' AND n.nspname = 'public'
      ) THEN
        CREATE UNIQUE INDEX alert_user_hazard_uniq ON alert(user_id, hazard_id);
      END IF;
    END$$;
  `);

  console.log('Alert migration complete');
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
}

module.exports = { migrate };
