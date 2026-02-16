const { query } = require('./db');
const fetch = require('node-fetch');

// NOAA NWS Alerts for Tsunami
// https://www.weather.gov/documentation/services-web-api
const URL = 'https://api.weather.gov/alerts/active?event=Tsunami%20Warning,Tsunami%20Advisory,Tsunami%20Watch';

function severityToScore(severity) {
    switch (severity) {
        case 'Extreme': return 1.0;
        case 'Severe': return 0.8;
        case 'Moderate': return 0.6;
        case 'Minor': return 0.4;
        default: return 0.2;
    }
}

async function fetchTsunamis() {
    const res = await fetch(URL, { headers: { 'user-agent': 'pda-backend/1.0 (contact@example.com)' } });
    if (!res.ok) throw new Error(`Tsunami fetch failed: ${res.status}`);
    return res.json();
}

function getCentroid(geometry) {
    if (!geometry) return null;

    if (geometry.type === 'Point') {
        return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] };
    }

    if (geometry.type === 'Polygon') {
        // Simple average of first ring
        const ring = geometry.coordinates[0];
        if (!ring || ring.length === 0) return null;
        let sumLon = 0, sumLat = 0;
        for (const pt of ring) {
            sumLon += pt[0];
            sumLat += pt[1];
        }
        return { lon: sumLon / ring.length, lat: sumLat / ring.length };
    }

    if (geometry.type === 'MultiPolygon') {
        // Average of first ring of first polygon (rough approx)
        const poly = geometry.coordinates[0];
        if (!poly) return null;
        const ring = poly[0];
        if (!ring) return null;
        let sumLon = 0, sumLat = 0;
        for (const pt of ring) {
            sumLon += pt[0];
            sumLat += pt[1];
        }
        return { lon: sumLon / ring.length, lat: sumLat / ring.length };
    }

    return null;
}

async function upsertTsunami(feature) {
    const p = feature.properties || {};
    const g = feature.geometry; // might be null for some alerts

    const centroid = getCentroid(g);
    // If no geometry, we can't map it easily. Skip for now or use 0,0?
    // NWS alerts usually have geometry. If not, it might be nationwide which is tricky.
    if (!centroid) return;

    const sourceEventId = p.id || `TS-${Date.now()}-${Math.random()}`;
    const title = p.headline || p.event || 'Tsunami Alert';
    const description = p.description || p.instruction || '';
    const severity = severityToScore(p.severity);
    const occurredAt = p.sent || new Date().toISOString(); // Time alert was sent

    const attributes = {
        title,
        event: p.event,
        severity_text: p.severity,
        urgency: p.urgency,
        certainty: p.certainty,
        areaDesc: p.areaDesc
    };

    const upsertSql = `
    INSERT INTO hazard(type, severity, occurred_at, lat, lon, source, source_event_id, attributes)
    VALUES ('tsunami', $1, $2, $3, $4, 'NOAA', $5, $6)
    ON CONFLICT (source, source_event_id) DO UPDATE
      SET severity=EXCLUDED.severity,
          lat=EXCLUDED.lat,
          lon=EXCLUDED.lon,
          attributes=EXCLUDED.attributes,
          occurred_at=EXCLUDED.occurred_at
    RETURNING id;
  `;

    await query(upsertSql, [severity, occurredAt, centroid.lat, centroid.lon, sourceEventId, attributes]);
}

async function main() {
    console.log('Ingesting Tsunamis from NOAA...');
    try {
        const data = await fetchTsunamis();
        const features = data.features || [];
        console.log(`Found ${features.length} tsunami alerts.`);

        let count = 0;
        for (const f of features) {
            try {
                await upsertTsunami(f);
                count++;
            } catch (err) {
                console.error('Failed to upsert tsunami:', err.message);
            }
        }
        console.log(`Ingested ${count} tsunamis.`);
    } catch (err) {
        console.error('Tsunami ingest failed:', err);
    }
}

if (require.main === module) {
    main().then(() => process.exit(0));
}

module.exports = { main };
