const auth = require('../../shared/auth');
const accounts = require('../../shared/accounts');
const { json, fail } = require('../../shared/http');
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      auth.sameOrigin(req);
      return json(res, 200, { user: null }, { 'Set-Cookie': auth.cookie(auth.COOKIE, '', 0) });
    }
    if (req.method !== 'GET') throw fail(405, 'GET or POST only');
    const account = await accounts.requireAccount(req);
    return json(res, 200, { user: accounts.publicUser(account) });
  } catch (error) {
    json(res, error.status || 503, { user: null, message: error.status ? error.message : 'Login service unavailable.' });
  }
};
