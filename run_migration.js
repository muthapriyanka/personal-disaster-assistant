const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Running migration...');
        await client.query('BEGIN');

        // Shelter Updates
        await client.query(`ALTER TABLE shelter ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;`);
        await client.query(`ALTER TABLE shelter ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';`);
        await client.query(`ALTER TABLE shelter ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'shelter';`);
        // Ensure info is JSON or TEXT? Ingest uses JSON.stringify, so TEXT is fine.

        // Hazard Updates
        await client.query(`ALTER TABLE hazard ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;`);
        await client.query(`ALTER TABLE hazard ADD COLUMN IF NOT EXISTS source TEXT;`);
        await client.query(`ALTER TABLE hazard ADD COLUMN IF NOT EXISTS source_timestamp TIMESTAMP;`);
        await client.query(`ALTER TABLE hazard ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'moderate';`);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
