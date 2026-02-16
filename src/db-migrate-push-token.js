const { query, pool } = require('./db');

async function migrate() {
    console.log('Migrating: Adding push_token to user_account...');
    try {
        await query(`
      ALTER TABLE user_account 
      ADD COLUMN IF NOT EXISTS push_token TEXT;
    `);
        console.log('Migration complete: push_token column added.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        pool.end();
    }
}

migrate();
