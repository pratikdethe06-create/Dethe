const crypto = require('node:crypto');
const kv = require('../../shared/kv');
const engine = require('../../shared/synthesis');
const accounts = require('../../shared/accounts');
const { body, fail, json } = require('../../shared/http');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' };
module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (req.method !== 'POST') throw fail(405, 'POST only');
    const apiKey = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!/^dth_live_[a-f0-9]{36,48}$/.test(apiKey)) throw fail(401, 'A valid API key is required.');
    const input = body(req), text = String(input.text || '').trim();
    if (!text || text.length > 3000) throw fail(400, 'Text must contain 1–3,000 characters.');
    const voice = input.voice || 'priya', languageCode = input.languageCode || 'hi-IN';
    if (!engine.SPEAKERS.has(voice) || !engine.LANGUAGES.has(languageCode)) throw fail(400, 'Unsupported voice or language.');
    const id = crypto.randomUUID(), cost = accounts.cost(text), now = Date.now(), recordKey = `key_${apiKey}`;
    const credential = await kv.get(recordKey);
    if (!credential || credential.revoked || !credential.expiresAt || credential.expiresAt <= now) throw fail(401, 'Your API key is invalid or expired.');
    if (credential.owner) {
      // Newly issued keys share one account quota; rotating a key cannot refill it.
      const reservation = await accounts.charge(credential.owner, cost, account => {
        if (account.plan === 'Free' || !account.apiKeys?.some(k => k.key === apiKey && k.expiresAt > now)) throw fail(401, 'Your API key is invalid or expired.');
      }, 'apiCredits');
      let audio;
      try {
        audio = await engine.synthesize({ text, voice, languageCode, speed: input.speed });
        if (!audio.audioBase64) throw new Error('No audio');
      } catch {
        await accounts.refund(credential.owner, reservation.requestId);
        throw fail(503, 'Synthesis failed. Credits were refunded; please retry.');
      }
      return json(res, 200, { ...audio, languageCode, creditsUsed: cost, creditsRemaining: reservation.account.apiCredits, plan: reservation.account.plan, quotaScope: 'account' }, CORS);
    }
    // Pre-migration keys retain their original finite quota and expiry.
    const record = await kv.update(recordKey, rec => {
      if (!rec || rec.revoked || !rec.expiresAt || rec.expiresAt <= now) throw fail(401, 'Your API key is invalid or expired.');
      if (now - (rec.lastRefillAt || rec.createdAt) >= 30 * 86400000) { rec.creditsLeft = rec.creditsTotal; rec.lastRefillAt = now; }
      if (rec.creditsLeft < cost) throw fail(402, 'Insufficient API credits.');
      rec.charges = Object.fromEntries(Object.entries(rec.charges || {}).filter(([, c]) => now - c.at < 86400000));
      rec.charges[id] = { at: now, period: rec.lastRefillAt, cost };
      rec.creditsLeft -= cost; rec.requests = (rec.requests || 0) + 1; rec.lastUsedAt = now;
      return rec;
    });
    let output;
    try {
      output = await engine.synthesize({ text, voice, languageCode, speed: input.speed });
      if (!output.audioBase64) throw new Error('No audio');
    } catch {
      await kv.update(recordKey, rec => {
        if (rec?.charges?.[id] && !rec.revoked) {
          if (rec.charges[id].period === rec.lastRefillAt) rec.creditsLeft = Math.min(rec.creditsTotal, rec.creditsLeft + cost);
          rec.requests = Math.max(0, rec.requests - 1); delete rec.charges[id];
        }
        return rec || undefined;
      });
      throw fail(503, 'Synthesis failed. Credits were refunded; please retry.');
    }
    json(res, 200, { ...output, languageCode, creditsUsed: cost, creditsRemaining: record.creditsLeft, plan: record.plan }, CORS);
  } catch (error) {
    json(res, error.status || 503, { error: { code: error.status === 401 ? 'unauthorized' : 'request_failed', message: error.status ? error.message : 'Service temporarily unavailable. Please retry.' } }, CORS);
  }
};
