const crypto = require('node:crypto');
const accounts = require('../../shared/accounts');
const auth = require('../../shared/auth');
const kv = require('../../shared/kv');
const billing = require('../../shared/billing');
const { handle, json, body, fail } = require('../../shared/http');
module.exports = handle('POST', async (req, res) => {
  const user = await accounts.requireAccount(req);
  const input = body(req);
  const orderId = input.razorpay_order_id || input.orderId;
  const paymentId = input.razorpay_payment_id || input.paymentId;
  if (!/^order_[a-zA-Z0-9]+$/.test(orderId || '') || !/^pay_[a-zA-Z0-9]+$/.test(paymentId || '')) throw fail(400, 'Valid payment details are required.');
  if (!billing.configured()) throw fail(503, 'Payment verification is temporarily unavailable.');
  let order = await kv.get(`order_${orderId}`);
  let restored = false;
  // Older purchases had no server account. Restore only from the provider's order
  // and verified payer email, retaining the original expiry rather than renewing it.
  if (!order) {
    const remote = await billing.request('/orders/' + orderId);
    const plan = remote.notes?.plan, cycle = remote.notes?.cycle;
    if (remote.id !== orderId || remote.notes?.product !== 'DetheAI' || !Object.hasOwn(billing.PRICES, plan) || !['monthly', 'yearly'].includes(cycle) || remote.amount !== billing.PRICES[plan][cycle] || remote.currency !== 'INR') throw fail(403, 'This order does not match a DetheAI plan.');
    if (remote.notes.account_id && remote.notes.account_id !== user.id) throw fail(403, 'This order belongs to a different account.');
    order = { owner: user.id, plan, cycle, amount: remote.amount, currency: remote.currency, createdAt: remote.created_at * 1000 };
    restored = true;
  }
  if (order.owner !== user.id) throw fail(403, 'This order belongs to a different account.');
  const hmac = text => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(text).digest('hex');
  const validSignature = auth.equal(input.razorpay_signature, hmac(`${orderId}|${paymentId}`));
  const validLegacyToken = restored && auth.equal(input.token, hmac(`${order.plan}|${order.cycle}|${orderId}|${paymentId}`));
  if (!validSignature && !validLegacyToken) throw fail(403, 'Payment verification failed.');
  const payment = await billing.request('/payments/' + paymentId);
  if (payment.id !== paymentId || payment.order_id !== orderId || payment.status !== 'captured' || payment.amount !== order.amount || payment.currency !== order.currency || Number(payment.amount_refunded || 0) !== 0) throw fail(409, 'Payment is not captured or does not match this order. Please retry after payment completes.');
  if (restored && String(payment.email || '').trim().toLowerCase() !== user.email) throw fail(403, 'Sign in with the email used for this payment to restore it.');
  const now = Date.now();
  const paidUntil = (restored ? order.createdAt : now) + (order.cycle === 'yearly' ? 365 : 30) * auth.DAY;
  if (!Number.isFinite(paidUntil) || paidUntil <= now) throw fail(403, 'This purchase has expired. Please renew your plan.');
  // An order can grant an entitlement only once, even across retries/concurrency.
  const account = await kv.update(accounts.key(user.id), current => {
    const a = accounts.refresh(current, now);
    a.payments ||= {};
    if (a.payments[orderId]) return a;
    a.payments[orderId] = { paymentId, paidUntil };
    a.plan = order.plan; a.cycle = order.cycle; a.paidUntil = paidUntil;
    a.credits = accounts.CREDITS[order.plan]; a.apiCredits = accounts.CREDITS[order.plan]; a.refillAt = now; a.period = orderId;
    return a;
  });
  json(res, 200, { ok: true, plan: account.plan, cycle: account.cycle, credits: account.credits, user: accounts.publicUser(account) });
});
