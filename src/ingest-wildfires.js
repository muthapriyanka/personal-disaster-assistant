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

// NIFC URL
const BASE_URL = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations/FeatureServer/0';

async function fetchMetadata() {
    const url = `${BASE_URL}?f=json`;
    console.log(`Fetching metadata: ${url}`);
    const res = await fetch(url, { headers: { 'user-agent': 'pda-backend/1.0' } });
    if (!res.ok) throw new Error(`Metadata fetch failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`Metadata Error: ${json.error.code} ${json.error.message}`);
    return json;
}

async function fetchWildfires() {
    console.log('Fetching NIFC Wildfires...');
    // Validating Metadata first
    try {
        const meta = await fetchMetadata();
        console.log(`Layer Name: ${meta.name}, Type: ${meta.type}`);
    } catch (e) {
        console.warn(`Metadata check failed: ${e.message}. Trying query anyway...`);
    }

    // Query
    // Note: removing outFields=* and listing specific fields to be safe
    const queryUrl = `${BASE_URL}/query?where=1%3D1&outFields=UniqueFireIdentifier,IncidentName,IncidentSize,PercentContained,POOCounty,POOState,OBJECTID,FireDiscoveryDateTime&orderByFields=FireDiscoveryDateTime DESC&f=json&resultRecordCount=500`;

    const res = await fetch(queryUrl, { headers: { 'user-agent': 'pda-backend/1.0' } });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Wildfire fetch failed: ${res.status} ${text.substring(0, 200)}`);
    }
    const json = await res.json();
    if (json.error) {
        throw new Error(`ArcGIS Error: ${json.error.code} ${json.error.message}`);
    }
    return json;
}

async function upsertWildfire(client, feature) {
    const p = feature.attributes || {};
    const g = feature.geometry || {};

    // Need valid point geometry
    if (!g || !g.x || !g.y) return;

    const sourceEventId = p.UniqueFireIdentifier || `nifc:${p.OBJECTID}`;
    const title = p.IncidentName || 'Unknown Fire';
    const acres = p.IncidentSize || 0;
    const contained = p.PercentContained || 0;

    // Calculate severity
    let severity = 0.3; // moderate default
    if (acres > 1000) severity = 0.6; // high
    if (acres > 10000) severity = 0.9; // critical

    // Prepare attributes for frontend
    const attributes = {
        title: title,
        place: `${p.POOCounty || ''}, ${p.POOState || ''}`.trim(),
        description: `Acres: ${acres}, Contained: ${contained}%`,
        url: null,
        ...p
    };

    const occurredAt = p.FireDiscoveryDateTime ? new Date(p.FireDiscoveryDateTime).toISOString() : new Date().toISOString();

    // type, severity, occurred_at, lat, lon, source, source_event_id, attributes
    const query = `
    INSERT INTO hazard (
      type, severity, occurred_at, lat, lon, source, source_event_id, attributes
    )
    VALUES ('wildfire', $1, $2, $3, $4, 'NIFC', $5, $6)
    ON CONFLICT (source, source_event_id) DO UPDATE SET
      severity = EXCLUDED.severity,
      occurred_at = EXCLUDED.occurred_at,
      lat = EXCLUDED.lat,
      lon = EXCLUDED.lon,
      attributes = EXCLUDED.attributes;
  `;

    await client.query(query, [
        severity,
        occurredAt,
        g.y, // lat
        g.x, // lon
        sourceEventId,
        attributes
    ]);
}

async function main() {
    const client = await pool.connect();
    try {
        const data = await fetchWildfires();
        console.log(`Fetched data from NIFC.`);

        if (!data.features || data.features.length === 0) {
            console.log('No features found in NIFC response.');
            return;
        }

        const features = data.features;
        const firstDate = features[0].attributes.FireDiscoveryDateTime;
        const lastDate = features[features.length - 1].attributes.FireDiscoveryDateTime;
        console.log(`Date range: ${new Date(firstDate).toISOString()} to ${new Date(lastDate).toISOString()}`);

        console.log(`Processing ${features.length} wildfires...`);

        await client.query('BEGIN');
        let count = 0;
        for (const feature of data.features) {
            await upsertWildfire(client, feature);
            count++;
        }
        await client.query('COMMIT');
        console.log(`Successfully ingested ${count} wildfires.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error ingest wildfires:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
