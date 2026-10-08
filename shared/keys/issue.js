const crypto = require('node:crypto');
const accounts = require('../accounts');
const kv = require('../kv');
const { handle, json, fail } = require('../http');
module.exports = handle('POST', async (req, res) => {
  const account = await accounts.requireAccount(req);
  if (account.plan === 'Free') throw fail(402, 'An active Pro or Business plan is required.');
  const apiKey = 'dth_live_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const active = await kv.update(accounts.key(account.id), current => {
    const a = accounts.refresh(current, now);
    if (a.plan === 'Free') throw fail(402, 'Please renew your plan.');
    a.apiKeys = (a.apiKeys || []).filter(k => k.expiresAt > now);
    if (a.apiKeys.length >= 3) throw fail(429, 'You already have three API keys. Revoke one before creating another.');
    a.apiKeys.push({ key: apiKey, createdAt: now, expiresAt: a.paidUntil });
    return a;
  });
  try {
    await kv.update(`key_${apiKey}`, old => old || {
      owner: account.id, email: account.email, plan: active.plan, cycle: active.cycle,
      creditsLeft: accounts.CREDITS[active.plan], creditsTotal: accounts.CREDITS[active.plan],
      createdAt: now, lastRefillAt: now, expiresAt: active.paidUntil, requests: 0
    });
  } catch (error) {
    // If the write's outcome is uncertain, leave the reservation in place. Never
    // release a slot while a key might already exist. The owner can revoke it.
    throw fail(503, 'Key creation could not be confirmed. Refresh your key list before retrying.');
  }
  json(res, 200, { ok: true, apiKey, plan: active.plan, cycle: active.cycle, credits: accounts.CREDITS[active.plan], expiresAt: new Date(active.paidUntil).toISOString() });
});
