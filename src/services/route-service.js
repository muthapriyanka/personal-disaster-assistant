const fetch = require('node-fetch');
const { pool } = require('../db');

async function getSafeRoute(startLat, startLon, endLat, endLon, mode = 'driving') {
    // 1. Fetch Route from OSRM
    const url = `https://router.project-osrm.org/route/v1/${mode}/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true`;

    console.log(`[Router] Fetching OSRM: ${url}`);
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok') {
        throw new Error(data.message || 'Routing failed');
    }

    const route = data.routes[0];
    const geometry = route.geometry; // GeoJSON LineString
    const coords = geometry.coordinates; // [[lon, lat], ...]

    // 2. Check for Hazards along the route
    const warnings = [];

    // Optimization: Calculate bbox of route to filter DB query
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [lon, lat] of coords) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    }

    // Buffer bbox by ~50km (approx 0.5 deg)
    minLat -= 0.5; maxLat += 0.5;
    minLon -= 0.5; maxLon += 0.5;

    // Fetch active hazards in this bbox
    const hazardRes = await pool.query(`
        SELECT id, type, severity, lat, lon, attributes 
        FROM hazard 
        WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4
        AND occurred_at > NOW() - INTERVAL '3 days'
    `, [minLat, maxLat, minLon, maxLon]);

    const hazards = hazardRes.rows;

    // Check each hazard against route points
    // Simple verification: if any point on route is < 5km from a hazard
    const SAFE_DISTANCE_KM = 5;

    for (const hazard of hazards) {
        let isDangerous = false;

        // Simple distance check against all route points (can be optimized)
        // Sampling every 10th point for performance
        for (let i = 0; i < coords.length; i += 10) {
            const [rLon, rLat] = coords[i];
            const dist = getDistanceFromLatLonInKm(hazard.lat, hazard.lon, rLat, rLon);
            if (dist < SAFE_DISTANCE_KM) {
                isDangerous = true;
                break;
            }
        }

        if (isDangerous) {
            warnings.push({
                type: 'hazard_proximity',
                message: `Route passes near a ${hazard.severity} ${hazard.type}`,
                hazard: hazard
            });
        }
    }

    return {
        ...route,
        warnings: warnings,
        isSafe: warnings.length === 0
    };
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

module.exports = { getSafeRoute };
