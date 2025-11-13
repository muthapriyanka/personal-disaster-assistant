const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev';

function signJwt(payload, opts = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d', ...opts });
}

function verifyJwt(token) {
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
