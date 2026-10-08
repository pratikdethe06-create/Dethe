const { fail } = require('./http');
const PRICES = { Pro: { monthly: 79900, yearly: 799000 }, Business: { monthly: 249900, yearly: 2398800 } };
function configured() { return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET); }
async function request(path, body) {
  if (!configured()) throw fail(503, 'Payments are temporarily unavailable.');
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch((process.env.RAZORPAY_API_URL || 'https://api.razorpay.com/v1') + path, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw fail(502, 'Payment provider could not complete this request. Please try again.');
  return res.json();
}
module.exports = { PRICES, configured, request };
