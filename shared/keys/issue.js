/**
 * DetheAI — POST /api/keys/issue
 * Issues a Developer API key to a paying member (Pro / Business).
 *
 * Request : { email, plan, cycle, orderId, paymentId, token }
 *   token = HMAC token returned by /api/billing/verify after a REAL Razorpay payment.
 * Response: { ok, apiKey, plan, cycle, credits, expiresAt, docsUrl } | { ok:false, message }
 *
 * Limits  : max 3 API keys per payment · monthly-cycle keys valid 30 days, yearly 365 days.
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

const API_CREDITS = { Pro: 50000, Business: 200000 };
const DAY = 86400000;
const userKey = (email) => `user_${crypto.createHash('sha1').update(String(email).toLowerCase()).digest('hex')}`;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { ok: false, message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const email = String(body.email || '').trim().toLowerCase();
  const plan = body.plan === 'Business' ? 'Business' : body.plan === 'Pro' ? 'Pro' : null;
  const cycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';
  const { orderId, paymentId, token } = body;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return sendJSON(res, 400, { ok: false, message: 'Valid email required — login on dethe.in first.' });
  }
  if (!plan) return sendJSON(res, 400, { ok: false, message: 'API keys are available on Pro & Business plans only.' });
  if (!orderId || !paymentId || !token) {
    return sendJSON(res, 400, { ok: false, message: 'Payment proof missing — upgrade first, then issue a key.' });
  }

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
  if (!KEY_SECRET) return sendJSON(res, 503, { ok: false, message: 'Payment gateway not configured.' });

  // 1) Verify the payment token (minted by /api/billing/verify after a real Razorpay payment)
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${plan}|${cycle}|${orderId}|${paymentId}`)
    .digest('hex');
  if (expected !== token) {
    return sendJSON(res, 403, { ok: false, message: 'Payment verification failed — key not issued.' });
  }

  try {
    // 2) Anti-abuse: max 3 keys per payment, single owner
    const payId = `pay_${String(paymentId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const pay = await kv.get(payId);
    if (pay) {
      if (pay.email && pay.email !== email) {
        return sendJSON(res, 403, { ok: false, message: 'This payment belongs to a different account.' });
      }
      if ((pay.count || 0) >= 3) {
        return sendJSON(res, 429, { ok: false, message: 'This payment already has 3 API keys — revoke one or make a new payment.' });
      }
    }

    // 3) Create the key
    const apiKey = 'dth_live_' + crypto.randomBytes(18).toString('hex');
    const now = Date.now();
    const record = {
      email,
      plan,
      cycle,
      creditsLeft: API_CREDITS[plan],
      creditsTotal: API_CREDITS[plan],
      createdAt: now,
      lastRefillAt: now,
      expiresAt: now + (cycle === 'yearly' ? 365 : 30) * DAY,
      requests: 0,
    };
    await kv.put(`key_${apiKey}`, record);

    // 4) Payment counter + user index (best-effort)
    try { await kv.put(payId, { email, count: ((pay && pay.count) || 0) + 1 }); } catch (e) { console.error('[keys/issue] pay counter:', e.message); }
    try {
      const idx = (await kv.get(userKey(email))) || { email, keys: [] };
      idx.keys = [{ key: apiKey, plan, cycle, createdAt: now }, ...idx.keys].slice(0, 10);
      await kv.put(userKey(email), idx);
    } catch (e) { console.error('[keys/issue] user index:', e.message); }

    return sendJSON(res, 200, {
      ok: true,
      apiKey,
      plan,
      cycle,
      credits: API_CREDITS[plan],
      expiresAt: new Date(record.expiresAt).toISOString(),
      docsUrl: 'https://www.dethe.in/api',
      note: 'Save this key now — it will not be shown again.',
    });
  } catch (e) {
    console.error('[keys/issue] failed:', e.message);
    return sendJSON(res, 500, { ok: false, message: 'Key registry busy — please try again in a moment.' });
  }
};
