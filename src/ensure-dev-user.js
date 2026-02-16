const { query } = require('./db');
const bcrypt = require('bcryptjs');

async function ensureDevUser() {
    const email = 'dev@example.com';
    // Check if exists
    const res = await query('SELECT id FROM user_account WHERE email=$1', [email]);
    if (res.rowCount > 0) {
        console.log(`Dev user exists. ID: ${res.rows[0].id}`);
        return res.rows[0].id;
    }

    // Create
    const hash = await bcrypt.hash('password', 10);
    const insertRes = await query(
        `INSERT INTO user_account(name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id`,
        ['Dev User', email, hash]
    );
    console.log(`Created dev user. ID: ${insertRes.rows[0].id}`);
    return insertRes.rows[0].id;
}

if (require.main === module) {
    ensureDevUser()
        .then(() => process.exit(0))
        .catch(e => {
            console.error(e);
            process.exit(1);
        });
}
