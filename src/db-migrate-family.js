const { query } = require('./db');

async function migrate() {
    console.log('Migrating family columns...');

    // Add family_id column (text for simple 'SMITH_FAMILY' codes)
    await query(`
    ALTER TABLE user_account 
    ADD COLUMN IF NOT EXISTS family_id TEXT DEFAULT NULL;
  `);

    // Add location columns
    await query(`
    ALTER TABLE user_account 
    ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_lon DOUBLE PRECISION DEFAULT NULL;
  `);

    // Add status column (safe, danger, etc.) with default 'safe'
    await query(`
    ALTER TABLE user_account 
    ADD COLUMN IF NOT EXISTS safety_status TEXT DEFAULT 'safe';
  `);

    // Add battery level
    await query(`
    ALTER TABLE user_account 
    ADD COLUMN IF NOT EXISTS battery_level INTEGER DEFAULT NULL;
  `);

    // Add updated_at timestamp for location freshness
    await query(`
    ALTER TABLE user_account 
    ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ DEFAULT NULL;
  `);

    console.log('Migration complete');
}

if (require.main === module) {
    migrate().then(() => process.exit(0)).catch((e) => {
        console.error(e);
        process.exit(1);
    });
}

module.exports = { migrate };
