const accounts = require('../accounts');
const kv = require('../kv');
const { handle, json, body, fail } = require('../http');
module.exports = handle('POST', async (req, res) => {
  const account = await accounts.requireAccount(req);
  const apiKey = String(body(req).apiKey || '');
  if (!/^dth_live_[a-f0-9]{36,48}$/.test(apiKey)) throw fail(400, 'A valid API key is required.');
  await kv.update(`key_${apiKey}`, record => {
    if (record && record.email !== account.email) throw fail(403, 'This key belongs to a different account.');
    return { ...(record || {}), revoked: true, creditsLeft: 0, expiresAt: 1 };
  });
  await kv.update(accounts.key(account.id), current => {
    current.apiKeys = (current.apiKeys || []).filter(k => k.key !== apiKey); return current;
  });
  json(res, 200, { ok: true, revoked: true });
});
