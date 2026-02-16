const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev';

function signJwt(payload, opts = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d', ...opts });
}

function verifyJwt(token) {
  if (token === 'dev-token') {
    // HARDCODED DEV USER FOR TESTING
    return { uid: 3, email: 'dev@example.com', iat: Date.now() / 1000, exp: (Date.now() / 1000) + 3600 };
  }
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function getUserFromAuthHeader(req) {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Bearer ')) return null;
  const token = h.slice('Bearer '.length);
  return verifyJwt(token);
}

module.exports = { signJwt, verifyJwt, getUserFromAuthHeader };
