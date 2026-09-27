/**
 * DetheAI — GET /api/auth/google/url
 *
 * Without GOOGLE_CLIENT_ID we return 501, and the frontend gracefully opens
 * its built-in account picker (login keeps working for the demo studio).
 * With GOOGLE_CLIENT_ID set we return a real Google OAuth consent URL.
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
      message: 'Google login not configured. Add GOOGLE_CLIENT_ID in Vercel Environment Variables.',
    });
  }

  const origin =
    process.env.GOOGLE_REDIRECT_ORIGIN ||
    (req.headers && (req.headers.origin || req.headers.referer || '').replace(/\/$/, '')) ||
    'https://www.dethe.in';

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');

  return sendJSON(res, 200, { configured: true, url: url.toString() });
};
