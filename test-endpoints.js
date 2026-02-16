const http = require('http');

function get(path, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8000,
            path: path,
            method: 'GET',
            headers: headers
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log(`[${res.statusCode}] GET ${path}`);
                console.log(data);
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`Problem with request to ${path}: ${e.message}`);
            resolve(); // resolve anyway to continue
        });

        req.end();
    });
}

async function run() {
    console.log('Testing /health...');
    await get('/health');

    console.log('\nTesting /family (authorized)...');
    await get('/family', { 'Authorization': 'Bearer dev-token' });
}

run();
