/**
 * DetheAI — POST /api/keys/revoke
 * Permanently deletes an API key. Requires the key itself + the owner's email.
 *
 * Request : { apiKey, email }
 * Response: { ok, revoked: true } | { ok:false, message }
 */

const crypto = require('crypto');
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

const userKey = (email) => `user_${crypto.createHash('sha1').update(String(email).toLowerCase()).digest('hex')}`;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const apiKey = String(body.apiKey || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!apiKey.startsWith('dth_live_') || !email) {
    return sendJSON(res, 400, { ok: false, message: 'apiKey and email required.' });
  }

  try {
    const rec = await kv.get(`key_${apiKey}`);
    if (!rec) return sendJSON(res, 200, { ok: true, revoked: true, message: 'Key already gone.' });
    if (String(rec.email || '').toLowerCase() !== email) {
      return sendJSON(res, 403, { ok: false, message: 'This key belongs to a different account.' });
    }
    await kv.del(`key_${apiKey}`);
    // best-effort: remove from the user index too
    try {
      const idx = await kv.get(userKey(email));
      if (idx && Array.isArray(idx.keys)) {
        idx.keys = idx.keys.filter((k) => k.key !== apiKey);
        await kv.put(userKey(email), idx);
      }
    } catch (e) { console.error('[keys/revoke] index cleanup:', e.message); }
    return sendJSON(res, 200, { ok: true, revoked: true });
  } catch (e) {
    console.error('[keys/revoke] failed:', e.message);
    return sendJSON(res, 500, { ok: false, message: 'Key registry busy — try again shortly.' });
  }
};
