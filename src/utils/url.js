function match(method, url, pattern) {
  // pattern like /hazards/:id
  if (method !== pattern.method) return null;
  const u = new URL(url, 'http://x');
  const pSeg = pattern.path.split('/').filter(Boolean);
  const uSeg = u.pathname.split('/').filter(Boolean);
  if (pSeg.length !== uSeg.length) return null;
  const params = {};
  for (let i = 0; i < pSeg.length; i++) {
    if (pSeg[i].startsWith(':')) {
      params[pSeg[i].slice(1)] = decodeURIComponent(uSeg[i]);
    } else if (pSeg[i] !== uSeg[i]) {
      return null;
    }
  }
  return { params, search: u.searchParams };
}

module.exports = { match };
