const crypto = require('node:crypto');
const kv = require('./kv');
const auth = require('./auth');
const { fail } = require('./http');
const CREDITS = { Free: 10000, Pro: 50000, Business: 200000 };
const key = id => `account_${id}`;
function refresh(account, now = Date.now()) {
  if (!account) throw fail(401, 'Please sign in again.');
  if (account.plan !== 'Free' && (!account.paidUntil || account.paidUntil <= now)) {
    account.plan = 'Free'; account.credits = CREDITS.Free; account.apiCredits = 0; account.period = `free_${now}`; account.refillAt = now;
  }
  if (now - account.refillAt >= 30 * auth.DAY) {
    account.credits = CREDITS[account.plan]; account.apiCredits = account.plan === 'Free' ? 0 : CREDITS[account.plan]; account.refillAt = now; account.period = `refill_${now}`;
  }
  return account;
}
async function login(profile) {
  const email = profile.email.trim().toLowerCase(), id = auth.identify(email);
  const now = Date.now();
  return kv.update(key(id), old => {
    const account = old ? refresh(old, now) : { id, email, plan: 'Free', credits: CREDITS.Free, apiCredits: 0, refillAt: now, period: `free_${now}`, joinedAt: new Date(now).toISOString() };
    account.name = String(profile.name || email.split('@')[0]).slice(0, 100);
    account.avatar = /^https:\/\//.test(profile.picture || '') ? profile.picture : '';
    return account;
  });
}
async function requireAccount(req) {
  auth.sameOrigin(req);
  const identity = auth.session(req);
  const account = refresh(await kv.get(key(identity.sub)));
  if (account.email !== identity.email) throw fail(401, 'Please sign in again.');
  return account;
}
function publicUser(account) {
  return { id: account.id, email: account.email, name: account.name, avatar: account.avatar, provider: 'google', plan: account.plan, credits: account.credits, creditsLimit: CREDITS[account.plan], paidUntil: account.paidUntil || null, planCycle: account.cycle || null };
}
function cost(text) { return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 100) * 500; }
async function charge(id, amount, validate = () => {}, bucket = 'credits') {
  const requestId = crypto.randomUUID(), now = Date.now();
  const account = await kv.update(key(id), current => {
    const a = refresh(current, now);
    validate(a);
    if (!Number.isFinite(a[bucket]) || a[bucket] < amount) throw fail(402, `This request needs ${amount} credits; ${a[bucket] || 0} remain.`);
    a.charges = Object.fromEntries(Object.entries(a.charges || {}).filter(([, c]) => now - c.at < auth.DAY));
    a.charges[requestId] = { amount, bucket, period: a.period, at: now }; a[bucket] -= amount;
    if (bucket === 'apiCredits') a.apiRequests = (a.apiRequests || 0) + 1;
    return a;
  });
  return { requestId, account };
}
async function refund(id, requestId) {
  return kv.update(key(id), current => {
    const a = refresh(current), charge = a.charges?.[requestId];
    if (!charge) return a;
    const bucket = charge.bucket || 'credits';
    if (charge.period === a.period) a[bucket] = Math.min(CREDITS[a.plan], a[bucket] + charge.amount);
    if (bucket === 'apiCredits') a.apiRequests = Math.max(0, (a.apiRequests || 0) - 1);
    delete a.charges[requestId]; return a;
  });
}
async function dailyLimit(id, feature, freeLimit, paidLimit) {
  const day = new Date().toISOString().slice(0, 10);
  return kv.update(key(id), current => {
    const a = refresh(current);
    if (a.usage?.day !== day) a.usage = { day };
    const limit = a.plan === 'Free' ? freeLimit : paidLimit;
    if ((a.usage[feature] || 0) >= limit) throw fail(429, 'Daily usage limit reached. Please try again tomorrow.');
    a.usage[feature] = (a.usage[feature] || 0) + 1; return a;
  });
}
module.exports = { CREDITS, key, refresh, login, requireAccount, publicUser, cost, charge, refund, dailyLimit };
