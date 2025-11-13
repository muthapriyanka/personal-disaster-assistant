const MAX = 1 * 1024 * 1024; // 1MB

async function parseJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(body);
      } catch (e) {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { parseJson };
