/**
 * DetheAI — POST /api/billing/checkout
 * Creates a REAL Razorpay order so premium plans can only be unlocked after payment.
 *
 * Env needed (Vercel → Settings → Environment Variables):
 *   RAZORPAY_KEY_ID     — from dashboard.razorpay.com → Settings → API Keys
 *   RAZORPAY_KEY_SECRET — same place
 *
 * Request : { plan: "Pro" | "Business", cycle: "monthly" | "yearly" }
 * Response: { configured, order_id, amount, currency, key_id, plan, cycle }
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

// Official DetheAI pricing (₹, per pricing section)
const PRICES = {
  Pro:      { monthly: 799,  yearly: 7990  },
  Business: { monthly: 2499, yearly: 23988 },
};

const CREDITS = { Pro: 50000, Business: 200000 };

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { message: 'POST only' });

  const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const plan = body.plan === 'Business' ? 'Business' : 'Pro';
  const cycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';
  const amount = PRICES[plan][cycle] * 100; // ₹ → paise

  if (!KEY_ID || !KEY_SECRET) {
    return sendJSON(res, 200, {
      configured: false,
      message: 'Payment gateway is being set up. Please try again shortly.',
    });
  }

  try {
    const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: `dethe_${plan.toLowerCase()}_${Date.now()}`,
        notes: { product: 'DetheAI', plan, cycle },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json();
    if (!r.ok || !data.id) {
      return sendJSON(res, 502, { configured: true, message: 'Could not create payment order. ' + (data.error && data.error.description ? data.error.description : `Razorpay ${r.status}`) });
    }
    return sendJSON(res, 200, {
      configured: true,
      order_id: data.id,
      amount: data.amount,
      currency: data.currency,
      key_id: KEY_ID,
      plan,
      cycle,
      credits: CREDITS[plan],
    });
  } catch (e) {
    return sendJSON(res, 502, { configured: true, message: 'Payment gateway unreachable: ' + e.message });
  }
};
