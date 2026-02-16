const { query } = require('./src/db');

const tableName = process.argv[2];

async function run() {
    try {
        if (!tableName) {
            // List all tables
            console.log('--- Database Tables ---');
            const res = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
            if (res.rows.length === 0) {
                console.log('No tables found.');
            } else {
                res.rows.forEach(r => console.log(`- ${r.table_name}`));
                console.log('\nUsage: node view-db.js <table_name> (to view rows)');
            }
        } else {
            // Show table content
            console.log(`--- Contents of '${tableName}' ---`);
            try {
                const res = await query(`SELECT * FROM "${tableName}" LIMIT 100`);
                if (res.rows.length === 0) {
                    console.log('(Empty table)');
                } else {
                    console.table(res.rows);
                    console.log(`\n(Showing first ${res.rows.length} rows)`);
                }
            } catch (err) {
                console.error(`Error querying table '${tableName}':`, err.message);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error('Database Error:', err);
        process.exit(1);
    }
}

run();
