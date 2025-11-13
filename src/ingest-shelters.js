const { query } = require('./db');
const fetch = require('node-fetch');


async function fetchShelters() {
  const url = 'https://services.arcgis.com/pGfbNJoYypmNq86F/arcgis/rest/services/Open_Shelters/FeatureServer/0/query?where=1%3D1&outFields=*&f=json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch shelters: ${res.status}`);
  const data = await res.json();
  return data.features || [];
}

async function upsertShelter(s) {
  const attrs = s.attributes;
  const geom = s.geometry || {};
  if (!geom.x || !geom.y) return;

  const name = attrs.SHELTER_NAME || 'Unknown';
  const address = attrs.ADDRESS || attrs.ADDRESS1 || '';
  const lat = geom.y;
  const lon = geom.x;
  const capacity = attrs.CAPACITY || null;
  const status = attrs.STATUS ? attrs.STATUS.toLowerCase() : 'open';
  const phone = attrs.PHONE || null;

  await query(
    `
    INSERT INTO shelter(name, address, lat, lon, capacity, status, phone)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (name, lat, lon)
    DO UPDATE SET status = EXCLUDED.status, capacity = EXCLUDED.capacity, updated_at = now()
    `,
    [name, address, lat, lon, capacity, status, phone]
  );
}

async function main() {
  console.log('Fetching FEMA/NAPSG Open Shelters…');
  const shelters = await fetchShelters();
  console.log(`Fetched ${shelters.length} shelters`);
  let count = 0;
  for (const s of shelters) {
    try {
      await upsertShelter(s);
      count++;
    } catch (err) {
      console.error('Error saving shelter:', err.message);
    }
  }
  console.log(`Shelters saved/updated: ${count}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { main };
