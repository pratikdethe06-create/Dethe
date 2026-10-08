const crypto = require('node:crypto');
const { fail } = require('./http');
const COOKIE = 'dethe_session';
const DAY = 86400000;
function origin() { return new URL(process.env.APP_ORIGIN || process.env.GOOGLE_REDIRECT_URI || 'https://www.dethe.in').origin; }
function secret() {
  const key = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!key || key.length < 20) throw fail(503, 'Secure login is not configured.');
  return key;
}
function equal(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}
function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';').map(pair => {
    const i = pair.indexOf('='); return i < 0 ? ['', ''] : [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
  }));
}
function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${origin().startsWith('https:') ? '; Secure' : ''}`;
}
function sameOrigin(req) {
  if ((req.headers?.origin && req.headers.origin !== origin()) || req.headers?.['sec-fetch-site'] === 'cross-site') {
    throw fail(403, 'Please make this request from the DetheAI website.');
  }
}
function sign(user, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, exp: now + 7 * DAY })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}
function session(req) {
  const token = cookies(req)[COOKIE];
  if (!token) throw fail(401, 'Please sign in with Google to continue.');
  const [payload, signature, extra] = token.split('.');
  if (extra || !equal(signature, crypto.createHmac('sha256', secret()).update(payload || '').digest('base64url'))) throw fail(401, 'Your session is invalid. Please sign in again.');
  let user;
  try { user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw fail(401, 'Please sign in again.'); }
  if (!/^[a-f0-9]{64}$/.test(user.sub) || typeof user.email !== 'string' || !Number.isFinite(user.exp) || user.exp <= Date.now()) throw fail(401, 'Your session has expired. Please sign in again.');
  return user;
}
function identify(email) { return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex'); }
module.exports = { COOKIE, DAY, origin, secret, equal, cookies, cookie, sameOrigin, sign, session, identify };
