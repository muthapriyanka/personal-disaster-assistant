const { query } = require('./src/db');

async function seedAlerts() {
    try {
        console.log('Seeding alerts...');

        // 1. Get the most recently created user
        const userRes = await query(`SELECT id, name, email FROM user_account ORDER BY id DESC LIMIT 1`);
        if (userRes.rowCount === 0) {
            console.log('No users found. Please sign in to the app first.');
            process.exit(1);
        }
        const user = userRes.rows[0];
        console.log(`Found user: ${user.name} (${user.email})`);

        // 2. Clear existing alerts for this user (to avoid duplicates if re-running)
        await query('DELETE FROM alert WHERE user_id = $1', [user.id]);
        console.log('Cleared existing alerts.');

        // 3. Insert dummy alerts
        const alerts = [
            {
                message: 'CRITICAL: Wildfire approaching your zone. Evacuate immediately.',
                channel: 'push',
                offset: 0 // now
            },
            {
                message: 'WARNING: Flash flood warning in effect until 8 PM.',
                channel: 'sms',
                offset: 3600 // 1 hour ago
            },
            {
                message: 'Advisory: Strong winds expected tonight.',
                channel: 'in_app',
                offset: 7200 // 2 hours ago
            }
        ];

        // Fetch multiple hazards
        const hazRes = await query('SELECT id FROM hazard LIMIT 10');
        const hazardIds = hazRes.rows.map(r => r.id);

        if (hazardIds.length === 0) {
            console.log('No hazards found to link alerts to.');
            // optionally create a hazard?
        }

        for (let i = 0; i < alerts.length; i++) {
            if (i >= hazardIds.length) {
                console.log('Not enough hazards for more alerts, skipping...');
                break;
            }
            const alert = alerts[i];
            const hId = hazardIds[i];

            try {
                await query(
                    `INSERT INTO alert (user_id, hazard_id, message, channel, created_at)
                 VALUES ($1, $2, $3, $4, NOW() - interval '${alert.offset} seconds')`,
                    [user.id, hId, alert.message, alert.channel]
                );
                console.log(`Inserted alert: ${alert.message.substring(0, 20)}... (Hazard ${hId})`);
            } catch (e) {
                console.error(`Failed to insert alert: ${e.message} (Code: ${e.code})`);
                if (e.code === '23505') {
                    console.log('Duplicate alert skipped.');
                }
            }
        }

        console.log(`Successfully seeded alerts for user ${user.id}.`);

    } catch (err) {
        console.error('Seeding failed:', err);
    } finally {
        process.exit();
    }
}

seedAlerts();
