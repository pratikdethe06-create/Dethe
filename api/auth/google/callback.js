const auth = require('../../../shared/auth');
const accounts = require('../../../shared/accounts');
const { fail } = require('../../../shared/http');
function safe(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
module.exports = async (req, res) => {
  const clearState = auth.cookie('dethe_oauth_state', '', 0);
  try {
    if (req.method !== 'GET') throw fail(405, 'GET only');
    const params = new URL(req.url, auth.origin()).searchParams;
    if (!auth.equal(params.get('state'), auth.cookies(req).dethe_oauth_state)) throw fail(400, 'Login link expired. Please start sign-in again.');
    if (params.get('error') || !params.get('code')) throw fail(400, 'Google sign-in was cancelled.');
    const redirect = process.env.GOOGLE_REDIRECT_URI || auth.origin() + '/api/auth/google/callback';
    const token = await fetch(process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ code: params.get('code'), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirect, grant_type: 'authorization_code' })
    });
    const credentials = await token.json();
    if (!token.ok || !credentials.access_token) throw fail(401, 'Google sign-in failed. Please try again.');
    const response = await fetch(process.env.GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${credentials.access_token}` }, signal: AbortSignal.timeout(15000)
    });
    const profile = await response.json();
    if (!response.ok || !profile.sub || !profile.email || profile.email_verified !== true) throw fail(401, 'A verified Google email is required.');
    const account = await accounts.login(profile);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Set-Cookie': [clearState, auth.cookie(auth.COOKIE, auth.sign(account), 7 * 86400)] });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signed in | DetheAI</title></head><body><p>Signed in. <a href="/">Continue to DetheAI</a></p><script>if(window.opener){window.opener.postMessage({type:"OAUTH_AUTH_SUCCESS"},${safe(auth.origin())});window.close()}else{location.replace(${safe(auth.origin() + '/')})}</script></body></html>`);
  } catch (error) {
    res.writeHead(error.status || 503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearState });
    res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign-in failed | DetheAI</title></head><body><h1>Could not sign in</h1><p>Please return to DetheAI and try again. Your Google email must be verified.</p><a href="/">Return to DetheAI</a></body></html>');
  }
};
