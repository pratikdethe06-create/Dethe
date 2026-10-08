const accounts = require('../../shared/accounts');
const kv = require('../../shared/kv');
const billing = require('../../shared/billing');
const { handle, json, body, fail } = require('../../shared/http');
module.exports = handle('POST', async (req, res) => {
  const account = await accounts.requireAccount(req);
  const { plan, cycle } = body(req);
  if (!Object.hasOwn(billing.PRICES, plan) || !['monthly', 'yearly'].includes(cycle)) throw fail(400, 'Choose a valid plan and billing cycle.');
  const amount = billing.PRICES[plan][cycle];
  const order = await billing.request('/orders', { amount, currency: 'INR', receipt: `dethe_${Date.now()}`, notes: { product: 'DetheAI', account_id: account.id, plan, cycle } });
  if (!/^order_[a-zA-Z0-9]+$/.test(order.id) || order.amount !== amount || order.currency !== 'INR') throw fail(502, 'Invalid payment order. Please try again.');
  await kv.update(`order_${order.id}`, old => old || { owner: account.id, plan, cycle, amount, currency: 'INR', createdAt: Date.now() });
  json(res, 200, { configured: true, order_id: order.id, amount, currency: 'INR', key_id: process.env.RAZORPAY_KEY_ID, plan, cycle });
});
