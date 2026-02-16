const { query } = require('./src/db');
const bcrypt = require('bcryptjs');

async function seedFamily() {
    try {
        console.log('Starting seed process...');

        // 1. Get the Dev User (ID 3)
        const devRes = await query('SELECT * FROM user_account WHERE id = 3');
        if (devRes.rowCount === 0) {
            console.error('Error: Dev user (ID 3) not found. Run ensure-dev-user.js first.');
            process.exit(1);
        }
        const devUser = devRes.rows[0];
        const familyId = devUser.family_id;

        if (!familyId) {
            console.error('Error: Dev user is not in a family. Please create or join a family in the app first.');
            process.exit(1);
        }

        console.log(`Found Dev User in family: ${familyId}`);

        // 2. Define dummy users
        const passwordHash = await bcrypt.hash('password', 10);
        const dummies = [
            { name: 'Mom', email: 'mom@test.com', phone: '555-0101', role: 'parent' },
            { name: 'Dad', email: 'dad@test.com', phone: '555-0102', role: 'parent' },
            { name: 'Sis', email: 'sis@test.com', phone: '555-0103', role: 'child' }
        ];

        // 3. Insert them
        for (const d of dummies) {
            // Check if exists
            const check = await query('SELECT id FROM user_account WHERE email = $1', [d.email]);
            let uid;

            if (check.rowCount > 0) {
                uid = check.rows[0].id;
                console.log(`User ${d.name} already exists (ID: ${uid}). Updating...`);
            } else {
                const ins = await query(
                    `INSERT INTO user_account(name, email, password_hash, phone) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
                    [d.name, d.email, passwordHash, d.phone]
                );
                uid = ins.rows[0].id;
                console.log(`Created user ${d.name} (ID: ${uid})`);
            }

            // 4. Add to family and set simulated location/status
            // Random offset from a base location (e.g., SF)
            const baseLat = 37.7749;
            const baseLon = -122.4194;
            const latOffset = (Math.random() - 0.5) * 0.05;
            const lonOffset = (Math.random() - 0.5) * 0.05;
            const status = Math.random() > 0.7 ? 'pending' : 'safe';
            const battery = Math.floor(Math.random() * 100);

            await query(
                `UPDATE user_account 
         SET family_id = $1, 
             last_lat = $2, 
             last_lon = $3, 
             safety_status = $4, 
             battery_level = $5,
             last_location_update = NOW()
         WHERE id = $6`,
                [familyId, baseLat + latOffset, baseLon + lonOffset, status, battery, uid]
            );
            console.log(`Added ${d.name} to family ${familyId} with status ${status}`);
        }

        console.log('✅ Seeding complete! Reload the app family screen to see members.');
        process.exit(0);

    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seedFamily();
