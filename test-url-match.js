const { match } = require('./src/utils/url');

function test(method, url, pattern) {
    console.log(`Testing ${method} ${url} against ${JSON.stringify(pattern)}`);
    const result = match(method, url, pattern);
    console.log('Result:', result ? 'MATCH' : 'NO MATCH');
    if (result) console.log(result);
    console.log('---');
}

test('GET', '/family', { method: 'GET', path: '/family' });
test('GET', '/family/', { method: 'GET', path: '/family' });
test('POST', '/family/join', { method: 'POST', path: '/family/join' });
test('GET', '/hazards?lat=1&lon=2', { method: 'GET', path: '/hazards' });
