const { query } = require('./src/db');

async function describeTable() {
    try {
        const res = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'alert';
    `);
        console.log('Columns:', res.rows);

        const constraints = await query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'public.alert'::regclass;
    `);
        console.log('Constraints:', constraints.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

describeTable();
