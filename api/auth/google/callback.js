/**
 * DetheAI — GET /api/auth/google/callback
 *
 * Google redirects the login popup here with ?code=...
 * We exchange the code for tokens, fetch the user's Google profile and
 * postMessage it back to the DetheAI studio window (which completes login).
 *
 * Env needed:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  (console.cloud.google.com)
 *   GOOGLE_REDIRECT_URI (optional, default https://www.dethe.in/api/auth/google/callback)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'https://www.dethe.in/api/auth/google/callback';

function page(res, status, title, script) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fffdf8;color:#17231f;text-align:center;padding:20px}h2{font-size:18px}p{font-size:14px;color:#81766c}</style>
</head><body>
<div>
<h2>${title}</h2>
<p id="msg">Aap is window ko band kar sakte hain.</p>
</div>
<script>${script}</script>
</body></html>`);
}

function jsSafe(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  let u;
  try { u = new URL(req.url || '/', 'https://www.dethe.in'); } catch { u = new URL('/', 'https://www.dethe.in'); }
  const code = u.searchParams.get('code');
  const oauthError = u.searchParams.get('error');

  if (oauthError) {
    return page(res, 200, 'Login cancel ho gaya', `
      try{window.opener&&window.opener.postMessage(${jsSafe({ type: 'OAUTH_AUTH_CANCEL' })}, "*")}catch(e){}
      setTimeout(function(){window.close()}, 900);`);
  }

  if (!code) {
    return page(res, 400, 'Login link galat hai', `setTimeout(function(){window.close()}, 1500);`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    return page(res, 500, 'Google login setup baaki hai', `
      document.getElementById("msg").textContent = "Server par GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET set karna zaroori hai.";`);
  }

  try {
    // 1) code → tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
      signal: AbortSignal.timeout(20000),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      const why = (tokens.error_description || tokens.error || `HTTP ${tokenRes.status}`).slice(0, 120);
      return page(res, 200, 'Google se login fail hua', `
        document.getElementById("msg").textContent = ${jsSafe(why)};`);
    }

    // 2) profile
    const profRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    const prof = await profRes.json();
    if (!profRes.ok || !prof.email) {
      return page(res, 200, 'Profile nahi mil saki', `
        document.getElementById("msg").textContent = "Google account se email nahi mili — dubara try karein.";`);
    }

    // 3) success → postMessage to opener (DetheAI studio) + close popup
    const user = {
      name: prof.name || prof.given_name || (prof.email || '').split('@')[0] || 'Google User',
      email: prof.email,
      avatar: prof.picture || '',
    };
    return page(res, 200, 'Login ho gaya! ✓', `
      try{window.opener&&window.opener.postMessage(${jsSafe({ type: 'OAUTH_AUTH_SUCCESS', user })}, "*")}catch(e){}
      document.getElementById("msg").textContent = "Welcome, ${String(user.name).replace(/["'<>\\\\]/g, '')}! Yeh window khud band ho jayegi…";
      setTimeout(function(){window.close()}, 700);`);
  } catch (e) {
    return page(res, 200, 'Network error', `
      document.getElementById("msg").textContent = ${jsSafe(String(e.message || e).slice(0, 140))};`);
  }
};
