const { query } = require('./db');

async function migrate() {
    console.log('Fixing hazard table constraints...');

    try {
        // 1. Drop existing check constraint if it exists (default name is usually hazard_type_check)
        // We'll try to drop common names, or just alter column type directly if possible, 
        // but dropping constraint is safer for extending allowed values.

        // This query attempts to drop the constraint by name. 
        // If the name is unknown, we might need to look it up, but 'hazard_type_check' is the standard default.
        await query(`
            ALTER TABLE hazard 
            DROP CONSTRAINT IF EXISTS hazard_type_check;
        `);

        // 2. Add new constraint with all required types
        await query(`
            ALTER TABLE hazard 
            ADD CONSTRAINT hazard_type_check 
            CHECK (type IN ('earthquake', 'flood', 'wildfire', 'tsunami'));
        `);

        console.log('Migration successful: Updated hazard type constraint.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
