/**
 * DetheAI — POST /api/keys/info
 * Returns the status of an API key (plan, credits remaining, expiry, usage).
 *
 * Request : { apiKey }
 * Response: { ok, plan, email(masked), creditsLeft, creditsTotal, requests, expiresAt, valid }
 */

const kv = require('../kv');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const maskEmail = (e) => {
  const [u, d] = String(e).split('@');
  if (!d) return '•••';
  return `${u.slice(0, 2)}•••@${d}`;
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const apiKey = String(body.apiKey || '').trim();
  if (!apiKey.startsWith('dth_live_')) return sendJSON(res, 400, { ok: false, message: 'Valid apiKey required.' });

  try {
    const rec = await kv.get(`key_${apiKey}`);
    if (!rec) return sendJSON(res, 200, { ok: true, valid: false, message: 'Key not found (or revoked).' });
    const now = Date.now();
    const refillDue = now - (rec.lastRefillAt || rec.createdAt) >= 30 * 86400000;
    return sendJSON(res, 200, {
      ok: true,
      valid: !rec.expiresAt || rec.expiresAt > now,
      plan: rec.plan,
      cycle: rec.cycle,
      email: maskEmail(rec.email),
      creditsLeft: refillDue ? rec.creditsTotal : rec.creditsLeft, // shows post-refill amount
      creditsTotal: rec.creditsTotal,
      requests: rec.requests || 0,
      expiresAt: rec.expiresAt ? new Date(rec.expiresAt).toISOString() : null,
      createdAt: rec.createdAt ? new Date(rec.createdAt).toISOString() : null,
    });
  } catch (e) {
    console.error('[keys/info] failed:', e.message);
    return sendJSON(res, 500, { ok: false, message: 'Key registry busy — try again shortly.' });
  }
};
