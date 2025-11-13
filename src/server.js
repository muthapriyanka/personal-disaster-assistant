const http = require('http');
const { router } = require('./router');

function createServer() {
  return http.createServer((req, res) => {
    // basic security headers
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    router(req, res);
  });
}

module.exports = { createServer };
