const fetch = require('node-fetch');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// Bay Area Bounding Box (covering SF, San Jose, Oakland)
// 37.10,-122.60,38.00,-121.50
const QUERY = `
[out:json][timeout:25];
(
  node["amenity"~"hospital|clinic|doctors"](37.10,-122.60,38.00,-121.50);
  way["amenity"~"hospital|clinic|doctors"](37.10,-122.60,38.00,-121.50);
  relation["amenity"~"hospital|clinic|doctors"](37.10,-122.60,38.00,-121.50);
);
out center;
`;

async function fetchHospitals() {
    console.log('Fetching hospitals from Overpass API (Bay Area)...');
    const params = new URLSearchParams();
    params.append('data', QUERY);

    try {
        const res = await fetch(OVERPASS_URL, {
            method: 'POST',
            body: params,
            headers: {
                'User-Agent': 'PersonalDisasterAssistant/1.0 (contact@example.com)'
            }
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Overpass API failed: ${res.status} ${res.statusText}\nBody: ${text.substring(0, 200)}`);
        }

        const text = await res.text();
        try {
            const data = JSON.parse(text);
            return data.elements || [];
        } catch (e) {
            throw new Error(`JSON Parse Error: ${e.message}\nResponse start: ${text.substring(0, 100)}`);
        }
    } catch (err) {
        throw err;
    }
}

async function upsertHospital(client, node) {
    // Handle 'center' from 'out center' for ways/relations
    const lat = node.lat || (node.center && node.center.lat);
    const lon = node.lon || (node.center && node.center.lon);

    if (!node.tags || !lat || !lon) return;

    const name = node.tags.name || `Medical Facility ${node.id}`;
    let type = 'hospital';
    if (node.tags.amenity === 'clinic') type = 'clinic';
    if (node.tags.amenity === 'doctors') type = 'clinic'; // Group doctors as clinics for simplicity

    const address = [
        node.tags['addr:housenumber'],
        node.tags['addr:street'],
        node.tags['addr:city'],
        node.tags['addr:state']
    ].filter(Boolean).join(' ') || 'Unknown Address';

    const phone = node.tags.phone || node.tags['contact:phone'] || null;
    const capacity = parseInt(node.tags.beds, 10) || 0;

    // Check existence by Name + Location (Approx)
    // deduplication strategy since we lack external_id column
    const existing = await client.query(
        `SELECT id FROM shelter 
     WHERE name = $1 
       AND lat BETWEEN $2 - 0.001 AND $2 + 0.001
       AND lon BETWEEN $3 - 0.001 AND $3 + 0.001`,
        [name, lat, lon]
    );

    if (existing.rows.length > 0) {
        // Update
        const id = existing.rows[0].id;
        await client.query(
            `UPDATE shelter SET 
       address = $1, lat = $2, lon = $3, 
       capacity = $4, type = $7, status = 'active', phone = $5, updated_at = NOW()
       WHERE id = $6`,
            [address, lat, lon, capacity, phone, id, type]
        );
    } else {
        // Insert
        await client.query(
            `INSERT INTO shelter (
        name, address, lat, lon, capacity, type, status, phone
       ) VALUES ($1, $2, $3, $4, $5, $7, 'active', $6)`,
            [name, address, lat, lon, capacity, phone, type]
        );
    }
}

async function main() {
    const client = await pool.connect();
    try {
        const nodes = await fetchHospitals();
        console.log(`Fetched ${nodes.length} elements from Overpass.`);

        let count = 0;
        await client.query('BEGIN');
        for (const node of nodes) {
            // Overpass 'out center' returns nodes, ways, relations. 
            // We process all of them if they have tags.
            if (node.tags) {
                await upsertHospital(client, node);
                count++;
            }
        }
        await client.query('COMMIT');
        console.log(`Successfully ingested ${count} hospitals.`);
        // ...
        await client.query('COMMIT');
        console.log(`Successfully ingested ${count} hospitals.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error ingest hospitals:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
