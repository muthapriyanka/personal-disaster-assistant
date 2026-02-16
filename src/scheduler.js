const cron = require('node-cron');
const fetch = require('node-fetch');
const { pool } = require('./db');
const { main: ingestUSGS } = require('./ingest-usgs');
const { main: ingestWildfires } = require('./ingest-wildfires');
// const { main: ingestTsunamis } = require('./ingest-tsunamis'); // Not implemented yet
const { main: ingestHospitals } = require('./ingest-hospitals');
const { main: ingestFireStations } = require('./ingest-firestations');
const { main: runAlerts } = require('./alerts-run');

const INGEST_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WILDFIRE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const TSUNAMI_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RESOURCES_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (static data mostly)
const ALERTS_INTERVAL_MS = 1 * 60 * 1000; // 1 minute

function startScheduler() {
    console.log('[Scheduler] Starting background tasks...');

    // Run immediately
    safeRun(ingestUSGS, 'USGS Ingest');
    safeRun(ingestWildfires, 'Wildfire Ingest');
    // safeRun(ingestTsunamis, 'Tsunami Ingest');

    // Resources run once on startup, then daily
    safeRun(ingestHospitals, 'Hospital Ingest');
    safeRun(ingestFireStations, 'Fire Station Ingest');

    // Give ingestors a moment to finish before checking alerts? 
    // Actually alerts-run runs independently, so it's fine.
    setTimeout(() => safeRun(runAlerts, 'Alert Generation'), 2000);

    // Schedule
    // USGS
    cron.schedule('*/5 * * * *', async () => {
        await safeRun(ingestUSGS, 'USGS Ingest');
    });

    // Wildfires
    cron.schedule('*/15 * * * *', async () => {
        await safeRun(ingestWildfires, 'Wildfire Ingest');
    });

    // Tsunamis (Future)
    /*
    cron.schedule('0 *\/1 * * *', async () => {
        await safeRun(ingestTsunamis, 'Tsunami Ingest');
    });
    */

    // Resources (Daily at midnight)
    cron.schedule('0 0 * * *', async () => {
        await safeRun(ingestHospitals, 'Hospital Ingest');
        await safeRun(ingestFireStations, 'Fire Station Ingest');
    });

    // Alerts (Every minute)
    cron.schedule('* * * * *', async () => {
        await safeRun(runAlerts, 'Alert Generation');
        await safeRun(checkAndNotifyHazards, 'Push Notifications');
    });
}

async function safeRun(fn, name) {
    try {
        console.log(`[Scheduler] Running ${name}...`);
        await fn();
        console.log(`[Scheduler] ${name} completed.`);
    } catch (err) {
        console.error(`[Scheduler] ${name} failed:`, err);
    }
}

async function checkAndNotifyHazards() {
    // 1. Find hazards created in the last minute (or scheduled interval)
    // For robust production, you'd track the last check time in DB. 
    // Here we'll just look back 2 minutes to be safe.
    try {
        const res = await pool.query(`
            SELECT id, type, severity, lat, lon, attributes, occurred_at 
            FROM hazard 
            WHERE occurred_at > NOW() - INTERVAL '2 minutes'
        `);

        if (res.rows.length === 0) return;

        console.log(`[Notify] Found ${res.rows.length} new hazards. Checking for users...`);

        // 2. Find users near these hazards (e.g., 50km) who have a push token
        for (const hazard of res.rows) {
            const userRes = await pool.query(`
                SELECT id, push_token, 
                       (6371 * acos(cos(radians($1)) * cos(radians(last_lat)) * cos(radians(last_lon) - radians($2)) + sin(radians($1)) * sin(radians(last_lat)))) AS dist_km
                FROM user_account
                WHERE push_token IS NOT NULL
                AND last_lat IS NOT NULL AND last_lon IS NOT NULL
                HAVING (6371 * acos(cos(radians($1)) * cos(radians(last_lat)) * cos(radians(last_lon) - radians($2)) + sin(radians($1)) * sin(radians(last_lat)))) < 50
            `, [hazard.lat, hazard.lon]);

            if (userRes.rows.length === 0) continue;

            const tokens = userRes.rows.map(u => u.push_token);
            const message = `⚠️ New ${hazard.severity} ${hazard.type} reported ${Math.round(userRes.rows[0].dist_km)}km away!`;

            console.log(`[Notify] Sending alert to ${tokens.length} users near hazard ${hazard.id}`);

            // 3. Send to Expo
            await sendExpoPush(tokens, message, { hazardId: hazard.id });
        }
    } catch (err) {
        console.error('[Notify] Error:', err);
    }
}

async function sendExpoPush(tokens, body, data) {
    const messages = tokens.map(token => ({
        to: token,
        sound: 'default',
        title: 'Guardian AI Alert',
        body: body,
        data: data,
    }));

    // Chunking is recommended for large batches, but simple here
    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });
    } catch (err) {
        console.error('Expo Push Error:', err);
    }
}

module.exports = { startScheduler };

if (require.main === module) {
    startScheduler();
}
