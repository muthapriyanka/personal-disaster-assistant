function send(res, status, data, headers = {}) {
  const payload = data === null || data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

function sendError(res, err) {
  const status = err.status || 500;
  const body = { error: err.message || 'Internal Server Error' };
  send(res, status, body);
}

module.exports = { send, sendError };
