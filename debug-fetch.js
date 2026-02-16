async function main() {
    console.log('Checking NIFC Metadata...');
    const nifcMeta = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Current_Wildland_Fire_Incident_Locations_Current/FeatureServer/0?f=json';
    await fetch(nifcMeta).then(r => r.json()).then(j => {
        if (j.error) console.log('NIFC Error:', j.error);
        else console.log('NIFC Metadata Success:', j.name);
    }).catch(e => console.error('Fetch Error:', e.message));
}

if (require.main === module) {
    main();
}
