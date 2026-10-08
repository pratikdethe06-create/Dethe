const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.SESSION_SECRET = 'synthetic-test-session-secret-not-for-deployment';
process.env.GOOGLE_CLIENT_ID = 'synthetic-client';
process.env.GOOGLE_CLIENT_SECRET = 'synthetic-google-client-secret';
process.env.GITHUB_DB_TOKEN = 'synthetic-db-token';
process.env.RAZORPAY_KEY_ID = 'synthetic-payment-id';
process.env.RAZORPAY_KEY_SECRET = 'synthetic-payment-secret';
process.env.APP_ORIGIN = 'http://localhost:8080';
const originalFetch = global.fetch;
const kv = require('../shared/kv');
const auth = require('../shared/auth');
const accounts = require('../shared/accounts');
const engine = require('../shared/synthesis');
const originalSynthesize = engine.synthesize;
const generate = require('../api/voice/generate');
const checkout = require('../api/billing/checkout');
const verify = require('../api/billing/verify');
const tts = require('../api/v1/tts');
const issue = require('../shared/keys/issue');
const revoke = require('../shared/keys/revoke');
const callback = require('../api/auth/google/callback');
const googleURL = require('../api/auth/google/url');
const session = require('../api/auth/session');
let db, orders, payments, writes, loseWriteResponse, verifiedEmail;
const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  db = new Map(); orders = new Map(); payments = new Map(); writes = 0; loseWriteResponse = false; verifiedEmail = true;
  engine.synthesize = async input => ({ audioBase64: Buffer.from('synthetic audio').toString('base64'), mimeType: 'audio/mpeg', voice: input.voice, provider: 'test' });
  global.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      const recordKey = u.pathname.split('/').pop();
      const record = db.get(recordKey);
      if (!options.method || options.method === 'GET') return record ? response(200, { sha: record.sha, content: record.content }) : response(404, {});
      assert.equal(options.method, 'PUT');
      const input = JSON.parse(options.body);
      if (record ? input.sha !== record.sha : !!input.sha) return response(409, {});
      db.set(recordKey, { sha: String(++writes), content: input.content });
      if (loseWriteResponse) { loseWriteResponse = false; throw new Error('Lost acknowledgement'); }
      return response(200, {});
    }
    if (u.hostname === 'api.razorpay.com') {
      if (u.pathname === '/v1/orders' && options.method === 'POST') {
        const order = { ...JSON.parse(options.body), id: 'order_test' + (orders.size + 1), created_at: Math.floor(Date.now() / 1000) };
        orders.set(order.id, order); return response(200, order);
      }
      const id = u.pathname.split('/').pop();
      return response(200, u.pathname.includes('/payments/') ? payments.get(id) || {} : orders.get(id) || {});
    }
    if (u.hostname === 'oauth2.googleapis.com') return response(200, { access_token: 'synthetic-token' });
    if (u.hostname === 'www.googleapis.com') return response(200, { sub: 'google-subject', email: 'audit@example.invalid', email_verified: verifiedEmail, name: '</script><script>bad()</script>' });
    throw new Error('Unexpected external request: ' + u.origin);
  };
});
after(() => { global.fetch = originalFetch; engine.synthesize = originalSynthesize; });
async function call(handler, input = {}, extra = {}) {
  let status, headers, output;
  await handler({ method: 'POST', body: input, headers: {}, ...extra }, { writeHead(s, h) { status = s; headers = h; }, end(value) { output = value; } });
  let data; try { data = JSON.parse(output); } catch { data = output; }
  return { status, headers, data };
}
async function user(email = 'audit@example.invalid') { return accounts.login({ email, name: 'Audit' }); }
function signed(account) { return { headers: { origin: auth.origin(), cookie: auth.COOKIE + '=' + auth.sign(account) } }; }
function proof(order, email = 'audit@example.invalid') {
  const payment = { id: 'pay_test' + (payments.size + 1), order_id: order.order_id, amount: order.amount, currency: 'INR', status: 'captured', email, amount_refunded: 0 };
  payments.set(payment.id, payment);
  return { razorpay_order_id: payment.order_id, razorpay_payment_id: payment.id, razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(payment.order_id + '|' + payment.id).digest('hex') };
}
async function purchase(account, plan = 'Pro') {
  const order = await call(checkout, { plan, cycle: 'monthly' }, signed(account));
  assert.equal(order.status, 200);
  const receipt = proof(order.data, account.email);
  const verified = await call(verify, receipt, signed(account));
  assert.equal(verified.status, 200);
  return { receipt, user: verified.data.user };
}
test('Unsigned browser plan and credits never authenticate a user', async () => {
  const result = await call(generate, { text: 'hello', voice: 'pooja', plan: 'Business', credits: 999999 });
  assert.equal(result.status, 401);
});
test('Tampered or expired session cannot grant access', async () => {
  const a = await user();
  const expired = auth.sign(a, Date.now() - 8 * auth.DAY);
  for (const token of [expired, auth.sign(a) + 'tampered']) {
    const result = await call(generate, { text: 'hello' }, { headers: { cookie: auth.COOKIE + '=' + token } });
    assert.equal(result.status, 401);
  }
});
test('Cross-origin cookie writes are rejected', async () => {
  const a = await user(); const options = signed(a); options.headers.origin = 'https://evil.example';
  assert.equal((await call(checkout, { plan: 'Pro', cycle: 'monthly' }, options)).status, 403);
});
test('Free user cannot claim a paid voice or bypass character limits', async () => {
  const a = await user();
  assert.equal((await call(generate, { text: 'hello', voice: 'pooja', plan: 'Business' }, signed(a))).status, 402);
  assert.equal((await call(generate, { text: 'x'.repeat(1001), voice: 'priya' }, signed(a))).status, 400);
});
test('Public preview only speaks a fixed sample and charges zero', async () => {
  let received;
  engine.synthesize = async input => { received = input; return { audioBase64: 'YQ==' }; };
  const result = await call(generate, { preview: true, text: 'malicious arbitrary long text', voice: 'kavya', languageCode: 'hi-IN' });
  assert.equal(result.status, 200); assert.equal(result.data.creditsCharged, 0);
  assert.ok(!received.text.includes('arbitrary')); assert.equal(db.size, 0);
});
test('Successful voice generation charges 500 and returns authoritative balance', async () => {
  const a = await user();
  const result = await call(generate, { text: 'hello world', voice: 'priya' }, signed(a));
  assert.equal(result.status, 200); assert.equal(result.data.creditsCharged, 500); assert.equal(result.data.creditsRemaining, 9500);
});
test('Failed synthesis refunds credits, with no repeated refund', async () => {
  const a = await user(); engine.synthesize = async () => { throw new Error('provider down'); };
  assert.equal((await call(generate, { text: 'hello' }, signed(a))).status, 503);
  assert.equal((await kv.get(accounts.key(a.id))).credits, 10000);
  const c = await accounts.charge(a.id, 500);
  await accounts.refund(a.id, c.requestId); await accounts.refund(a.id, c.requestId);
  assert.equal((await kv.get(accounts.key(a.id))).credits, 10000);
});
test('Concurrent requests cannot spend the same last 500 credits', async () => {
  const a = await user(); await kv.update(accounts.key(a.id), current => ({ ...current, credits: 500 }));
  const results = await Promise.all([call(generate, { text: 'one' }, signed(a)), call(generate, { text: 'two' }, signed(a))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 402]);
  assert.equal((await kv.get(accounts.key(a.id))).credits, 0);
});
test('A lost storage write acknowledgement does not double debit', async () => {
  const a = await user(); loseWriteResponse = true;
  await accounts.charge(a.id, 500);
  assert.equal((await kv.get(accounts.key(a.id))).credits, 9500);
});
test('Repeated login does not reset credits', async () => {
  const a = await user(); await accounts.charge(a.id, 500); await user();
  assert.equal((await kv.get(accounts.key(a.id))).credits, 9500);
});
test('Expired plan downgrades and rejects premium voices', async () => {
  const a = await user(); await kv.update(accounts.key(a.id), current => ({ ...current, plan: 'Pro', paidUntil: Date.now() - 1 }));
  assert.equal((await call(generate, { text: 'hello', voice: 'pooja' }, signed(a))).status, 402);
});
test('Payment plan and cycle come from stored order, not the request', async () => {
  const a = await user(); const order = await call(checkout, { plan: 'Pro', cycle: 'monthly' }, signed(a));
  const result = await call(verify, { ...proof(order.data), plan: 'Business', cycle: 'yearly' }, signed(a));
  assert.equal(result.status, 200); assert.equal(result.data.plan, 'Pro'); assert.equal(result.data.cycle, 'monthly'); assert.equal(result.data.credits, 50000);
});
test('Payment verification is idempotent after spending credits', async () => {
  const a = await user(); const paid = await purchase(a); await accounts.charge(a.id, 500);
  const repeat = await call(verify, paid.receipt, signed(a));
  assert.equal(repeat.data.credits, 49500);
});
test('Other users cannot claim an order', async () => {
  const a = await user(); const b = await user('second@example.invalid');
  const order = await call(checkout, { plan: 'Pro', cycle: 'monthly' }, signed(a));
  assert.equal((await call(verify, proof(order.data), signed(b))).status, 403);
});
test('Wrong amount, uncaptured or refunded payment never grants a plan', async () => {
  const a = await user(); const order = await call(checkout, { plan: 'Pro', cycle: 'monthly' }, signed(a)); const receipt = proof(order.data);
  const original = { ...payments.get(receipt.razorpay_payment_id) };
  for (const invalid of [{ amount: 1 }, { status: 'authorized' }, { amount_refunded: 100 }]) {
    payments.set(original.id, { ...original, ...invalid });
    assert.equal((await call(verify, receipt, signed(a))).status, 409);
  }
  assert.equal((await kv.get(accounts.key(a.id))).plan, 'Free');
});
test('Legacy purchase requires actual price, payer email, proof and original expiry', async () => {
  const a = await user(); const created = Math.floor(Date.now() / 1000) - 86400;
  orders.set('order_legacy', { id: 'order_legacy', amount: 79900, currency: 'INR', created_at: created, notes: { product: 'DetheAI', plan: 'Pro', cycle: 'monthly' } });
  const receipt = proof({ order_id: 'order_legacy', amount: 79900 });
  const legacy = { orderId: receipt.razorpay_order_id, paymentId: receipt.razorpay_payment_id, token: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`Pro|monthly|${receipt.razorpay_order_id}|${receipt.razorpay_payment_id}`).digest('hex') };
  const result = await call(verify, legacy, signed(a));
  assert.equal(result.status, 200); assert.equal(result.data.user.paidUntil, created * 1000 + 30 * auth.DAY);
  const other = await user('other@example.invalid');
  assert.equal((await call(verify, legacy, signed(other))).status, 403);
});
test('Google callback requires matching state and verified email', async () => {
  const invalid = await call(callback, {}, { method: 'GET', url: '/api/auth/google/callback?code=test&state=bad', headers: { cookie: 'dethe_oauth_state=good' } });
  assert.equal(invalid.status, 400);
  verifiedEmail = false;
  const result = await call(callback, {}, { method: 'GET', url: '/api/auth/google/callback?code=test&state=good', headers: { cookie: 'dethe_oauth_state=good' } });
  assert.equal(result.status, 401); assert.equal(db.size, 0);
});
test('Google success sets HttpOnly session and reveals no profile through callback script', async () => {
  const result = await call(callback, {}, { method: 'GET', url: '/api/auth/google/callback?code=test&state=good', headers: { cookie: 'dethe_oauth_state=good' } });
  assert.equal(result.status, 200); assert.ok(result.headers['Set-Cookie'].some(c => c.startsWith('dethe_session=') && c.includes('HttpOnly')));
  assert.ok(!result.data.includes('bad()')); assert.ok(!result.data.includes('audit@example.invalid'));
});
test('OAuth URL sets state, session endpoint ignores browser user data, logout clears cookie', async () => {
  const url = await call(googleURL, {}, { method: 'GET' });
  assert.equal(url.status, 200); assert.ok(new URL(url.data.url).searchParams.get('state'));
  assert.equal((await call(session, { user: { plan: 'Business' } }, { method: 'GET' })).status, 401);
  const a = await user(); const result = await call(session, {}, { method: 'GET', ...signed(a) });
  assert.equal(result.data.user.plan, 'Free');
  const logout = await call(session, {}, signed(a)); assert.match(logout.headers['Set-Cookie'], /Max-Age=0/);
});
test('Free accounts cannot issue keys; paid keys use account expiry', async () => {
  const a = await user(); assert.equal((await call(issue, { plan: 'Business' }, signed(a))).status, 402);
  const paid = await purchase(a);
  const result = await call(issue, { plan: 'Business' }, signed(a));
  assert.equal(result.status, 200); assert.equal(result.data.plan, 'Pro'); assert.equal(Date.parse(result.data.expiresAt), paid.user.paidUntil);
});
test('Concurrent key issuance enforces the three-key account limit', async () => {
  const a = await user(); await purchase(a);
  for (let i = 0; i < 2; i++) assert.equal((await call(issue, {}, signed(a))).status, 200);
  const results = await Promise.all([call(issue, {}, signed(a)), call(issue, {}, signed(a))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
});
test('Developer API rejects unknown keys and atomically spends/refunds credits', async () => {
  const a = await user(); await purchase(a); const issued = await call(issue, {}, signed(a)); const apiKey = issued.data.apiKey;
  const request = { headers: { authorization: 'Bearer ' + apiKey } };
  const first = await call(tts, { text: 'hello' }, request); assert.equal(first.status, 200); assert.equal(first.data.creditsRemaining, 49500);
  engine.synthesize = async () => { throw new Error('unavailable'); };
  assert.equal((await call(tts, { text: 'hello' }, request)).status, 503);
  assert.equal((await kv.get(accounts.key(a.id))).apiCredits, 49500);
  await call(revoke, { apiKey }, signed(a));
  assert.equal((await call(tts, { text: 'hello' }, request)).status, 401);
});
test('A different signed-in user cannot revoke a key using an email in the body', async () => {
  const a = await user(); await purchase(a); const issued = await call(issue, {}, signed(a)); const b = await user('other@example.invalid');
  assert.equal((await call(revoke, { apiKey: issued.data.apiKey, email: a.email }, signed(b))).status, 403);
});
test('Unavailable AI returns an error rather than a made-up template', async () => {
  const a = await user(); const handler = require('../api/ai/script');
  const result = await call(handler, { prompt: 'Write about reading', language: 'English' }, signed(a));
  assert.equal(result.status, 503); assert.equal(result.data.script, undefined);
});
test('Link or malformed transcription input never returns a demo transcript', async () => {
  const result = await call(require('../api/transcribe'), { mode: 'transcribe', language: 'Hindi' });
  assert.equal(result.status, 400); assert.equal(result.data.transcript, undefined);
});

test('Rotating API keys cannot reset the shared account quota', async () => {
  const a = await user(); await purchase(a);
  const first = await call(issue, {}, signed(a));
  await call(tts, { text: 'hello' }, { headers: { authorization: 'Bearer ' + first.data.apiKey } });
  await call(revoke, { apiKey: first.data.apiKey }, signed(a));
  const second = await call(issue, {}, signed(a));
  const result = await call(tts, { text: 'hello' }, { headers: { authorization: 'Bearer ' + second.data.apiKey } });
  assert.equal(result.data.creditsRemaining, 49000);
});
