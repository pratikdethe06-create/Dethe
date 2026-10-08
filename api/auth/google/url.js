const crypto = require('node:crypto');
const auth = require('../../../shared/auth');
const { handle, json, fail } = require('../../../shared/http');
module.exports = handle('GET', async (req, res) => {
  auth.sameOrigin(req); auth.secret();
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GITHUB_DB_TOKEN) throw fail(503, 'Google sign-in is temporarily unavailable. Please try again later.');
  const state = crypto.randomBytes(32).toString('hex');
  const url = new URL(process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth');
  const redirect = process.env.GOOGLE_REDIRECT_URI || auth.origin() + '/api/auth/google/callback';
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', prompt: 'select_account', state }).toString();
  json(res, 200, { configured: true, url: url.toString() }, { 'Set-Cookie': auth.cookie('dethe_oauth_state', state, 600) });
});
