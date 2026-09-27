/**
 * DetheAI — POST /api/billing/verify
 * Verifies the Razorpay checkout signature server-side (HMAC SHA256) and
 * returns a signed token that the frontend uses to unlock the paid plan.
 *
 * Request : { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, cycle }
 * Response: { ok, plan, cycle, credits, token } | { ok:false, message }
 */

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const CREDITS = { Pro: 50000, Business: 200000 };

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { message: 'POST only' });

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
  if (!KEY_SECRET) return sendJSON(res, 200, { ok: false, message: 'Payment gateway not configured.' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  const plan = body.plan === 'Business' ? 'Business' : 'Pro';
  const cycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return sendJSON(res, 400, { ok: false, message: 'Missing payment details.' });
  }

  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return sendJSON(res, 200, { ok: false, message: 'Payment verification failed. If money was deducted, contact pratikdethe06@gmail.com with your payment ID.' });
  }

  // Signed unlock token — proves this plan was paid for on this order
  const token = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${plan}|${cycle}|${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  return sendJSON(res, 200, {
    ok: true,
    plan,
    cycle,
    credits: CREDITS[plan],
    paymentId: razorpay_payment_id,
    token,
  });
};
