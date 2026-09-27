/**
 * DetheAI — GET /api/auth/google/url
 *
 * Without GOOGLE_CLIENT_ID we return 501 and the frontend opens its built-in
 * demo account picker. With GOOGLE_CLIENT_ID set, the real Google consent
 * screen opens and the popup flow completes via /api/auth/google/callback.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return sendJSON(res, 501, {
      configured: false,
      message: 'Google login not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables.',
    });
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || 'https://www.dethe.in/api/auth/google/callback';

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('access_type', 'online');

  return sendJSON(res, 200, { configured: true, url: url.toString() });
};
