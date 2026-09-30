/**
 * DetheAI Developer API — POST /api/v1/tts
 * Public REST endpoint: ultra-realistic Indian studio voices via simple HTTP.
 *
 * Auth    : Authorization: Bearer dth_live_...   (issued at https://www.dethe.in/api-keys)
 * Request : { text, voice?, languageCode?, speed? }
 * Response: { audioBase64, mimeType, provider, voice, languageCode, words,
 *             creditsUsed, creditsRemaining, plan, docs }
 *
 * Economy : 500 credits per 100-word block (same as the website).
 *           Monthly quota = plan credits (Pro 50,000 / Business 200,000), auto-refill every 30 days.
 * Limits  : max 3,000 characters per request. Keys are Pro/Business only → all 37 voices.
 * Engine  : reuses /api/voice/generate's full chain (Sarvam bulbul:v3 → Edge neural → gTTS),
 *           so every engine fix lands on the API automatically.
 */

const kv = require('../../shared/kv');
const generate = require('../voice/generate');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const DAY = 86400000;

/** Invokes the site's battle-tested generate handler with a captured response. */
function callGenerate(body) {
  return new Promise((resolve, reject) => {
    const fake = {
      _code: 200,
      writeHead(code) { this._code = code; },
      end(payload) {
        try { resolve({ code: this._code, body: payload ? JSON.parse(payload) : null }); }
        catch (e) { reject(e); }
      },
    };
    try { generate({ method: 'POST', body: JSON.stringify(body) }, fake); }
    catch (e) { reject(e); }
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') {
    return sendJSON(res, 405, { error: { code: 'method_not_allowed', message: 'POST only. Docs: https://www.dethe.in/api' } });
  }

  /* ---------- 1) Authentication ---------- */
  const auth = String((req.headers && req.headers.authorization) || '');
  const apiKey = auth.replace(/^Bearer\s+/i, '').trim();
  if (!apiKey.startsWith('dth_live_')) {
    return sendJSON(res, 401, { error: { code: 'unauthorized', message: 'Missing API key. Get yours at https://www.dethe.in/api-keys' } });
  }

  let rec;
  try {
    rec = await kv.get(`key_${apiKey}`);
  } catch (e) {
    console.error('[v1/tts] kv read failed:', e.message);
    return sendJSON(res, 503, { error: { code: 'storage_unavailable', message: 'Key registry temporarily unavailable — try again shortly.' } });
  }
  if (!rec) {
    return sendJSON(res, 401, { error: { code: 'invalid_key', message: 'Invalid or revoked API key. Manage keys at https://www.dethe.in/api-keys' } });
  }
  const now = Date.now();
  if (rec.expiresAt && rec.expiresAt < now) {
    return sendJSON(res, 401, { error: { code: 'key_expired', message: 'This API key has expired. Renew your plan and issue a fresh key at https://www.dethe.in/api-keys' } });
  }

  /* ---------- 2) Monthly refill (30-day rolling window) ---------- */
  if (now - (rec.lastRefillAt || rec.createdAt || now) >= 30 * DAY) {
    rec.creditsLeft = rec.creditsTotal;
    rec.lastRefillAt = now;
  }

  /* ---------- 3) Request validation ---------- */
  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const text = String(body.text || '').trim();
  const languageCode = String(body.languageCode || body.locale || 'hi-IN');
  const voice = String(body.voice || 'shubh').toLowerCase();
  const speed = Math.min(2, Math.max(0.5, Number(body.speed) || 1));

  if (!text) return sendJSON(res, 400, { error: { code: 'empty_text', message: 'Field "text" is required.' } });
  if (text.length > 3000) {
    return sendJSON(res, 413, { error: { code: 'text_too_long', message: `Text is ${text.length} characters — the API limit is 3,000 per request. Split it into multiple requests.` } });
  }

  /* ---------- 4) Credits (fail-closed: charge before synthesis) ---------- */
  const words = text.split(/\s+/).filter(Boolean).length;
  const cost = Math.max(1, Math.ceil(words / 100) * 500);
  if ((rec.creditsLeft ?? 0) < cost) {
    return sendJSON(res, 402, {
      error: {
        code: 'insufficient_credits',
        message: `This request needs ${cost} credits but your key has ${rec.creditsLeft} left this month. Upgrade at https://www.dethe.in/#pricing`,
        creditsRemaining: rec.creditsLeft,
        creditsNeeded: cost,
      },
    });
  }

  rec.creditsLeft -= cost;
  rec.requests = (rec.requests || 0) + 1;
  rec.lastUsedAt = now;
  try {
    await kv.put(`key_${apiKey}`, rec);
  } catch (e) {
    console.error('[v1/tts] kv write failed:', e.message);
    return sendJSON(res, 503, { error: { code: 'storage_unavailable', message: 'Could not save credits — request not charged. Please retry.' } });
  }

  /* ---------- 5) Synthesis via the site engine ---------- */
  let out = null;
  try {
    out = await callGenerate({
      text,
      voice,
      languageCode,
      speed,
      plan: rec.plan === 'Business' ? 'Business' : 'Pro', // API keys → all 37 voices
    });
  } catch (e) {
    console.error('[v1/tts] engine crashed:', e.message);
  }

  if (!out || out.code !== 200 || !out.body || !out.body.audioBase64) {
    // Engine failed → refund the credits we just charged
    try {
      const fresh = { ...rec, creditsLeft: rec.creditsLeft + cost, requests: Math.max(0, (rec.requests || 1) - 1) };
      await kv.put(`key_${apiKey}`, fresh);
    } catch (e) { console.error('[v1/tts] refund failed:', e.message); }
    return sendJSON(res, 503, { error: { code: 'synthesis_failed', message: 'Voice engine busy — no credits were charged. Please retry in a moment.' } });
  }

  return sendJSON(res, 200, {
    audioBase64: out.body.audioBase64,
    mimeType: out.body.mimeType || 'audio/mpeg',
    provider: out.body.provider,
    quality: out.body.quality || 'natural',
    voice: out.body.voice || voice,
    languageCode,
    words,
    creditsUsed: cost,
    creditsRemaining: rec.creditsLeft,
    plan: rec.plan,
    docs: 'https://www.dethe.in/api',
  });
};
