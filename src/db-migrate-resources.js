const { query } = require('./db');

async function migrate() {
    console.log('Migrating shelter table to support types...');

    try {
        // 1. Add 'type' column if it doesn't exist
        await query(`
      ALTER TABLE shelter 
      ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'shelter';
    `);

        // 2. Add index on type for faster filtering
        await query(`
      CREATE INDEX IF NOT EXISTS idx_shelter_type ON shelter(type);
    `);

        console.log('Migration successful: Added type column to shelter table.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
