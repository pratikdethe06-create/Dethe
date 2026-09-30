/**
 * DetheAI — dynamic route: /api/keys/:action
 * One serverless function serving all three key-management actions
 * (keeps us under the Hobby plan's 12-function limit):
 *   POST /api/keys/issue   → issue an API key (payment proof required)
 *   POST /api/keys/info    → key balance & expiry
 *   POST /api/keys/revoke  → permanently delete a key
 */
const handlers = {
  issue: require('../../shared/keys/issue'),
  info: require('../../shared/keys/info'),
  revoke: require('../../shared/keys/revoke'),
};

module.exports = async (req, res) => {
  let action = '';
  try {
    const u = new URL(req.url || '/', 'https://www.dethe.in');
    action = u.pathname.split('/').filter(Boolean).pop() || '';
  } catch {}
  const h = handlers[action];
  if (!h) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, message: 'Unknown action. Use /api/keys/issue | /api/keys/info | /api/keys/revoke' }));
  }
  return h(req, res);
};
