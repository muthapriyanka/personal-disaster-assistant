const { ENV } = require('./env');
const { createServer } = require('./server');

const server = createServer();
server.listen(ENV.port, '0.0.0.0', () => {
  console.log(`HTTP server running on :${ENV.port}`);
});
