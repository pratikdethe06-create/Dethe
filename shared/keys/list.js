const accounts = require('../accounts');
const { handle, json } = require('../http');
module.exports = handle('GET', async (req, res) => {
  const account = await accounts.requireAccount(req);
  json(res, 200, { ok: true, user: accounts.publicUser(account), keys: account.apiKeys || [] });
});
