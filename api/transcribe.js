/**
 * DetheAI — POST /api/transcribe
 *
 *  A) mode:'stt' + audioBase64 → REAL transcription (Sarvam AI saarika STT)
 *     Browser video ka audio (16kHz mono WAV, ≤30s chunk) bhejta hai.
 *  Unsupported inputs return an error; no synthetic transcripts are returned.
 *
 * Response: { transcript: { text, language, duration, segments: [{ start, end, text }] } }
 */

const CORS = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/* ── Sarvam Speech-to-Text (saarika) ─────────────────────────────────── */
const SARVAM_KEY = process.env.PREMIUM_TTS_KEY || process.env.SARVAM_API_KEY || process.env.SARVAM_KEY || '';
const SARVAM_STT_URL = process.env.SARVAM_STT_URL || 'https://api.sarvam.ai/speech-to-text';
const STT_MODEL = process.env.SARVAM_STT_MODEL || 'saarika:v2.5';

const LANG_CODE = new Set(['hi-IN', 'en-IN', 'od-IN', 'ta-IN', 'te-IN', 'mr-IN', 'bn-IN', 'gu-IN', 'pa-IN', 'kn-IN', 'ml-IN']);

async function sarvamSTT(wavBuf, languageCode) {
  const form = new FormData();
  form.append('file', new Blob([wavBuf], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', STT_MODEL);
  form.append('language_code', LANG_CODE.has(languageCode) ? languageCode : 'unknown');

  let res;
  try {
    res = await fetch(SARVAM_STT_URL, {
      method: 'POST', signal: AbortSignal.timeout(45000),
      headers: { 'api-subscription-key': SARVAM_KEY },
      body: form,
    });
  } catch (e) {
    throw new Error('Transcription service tak nahi pahunch pa rahe hain — thodi der baad try karein.');
  }

  if (res.status === 401 || res.status === 403) throw new Error('Transcription service key ka issue hai — owner ko batayein.');
  if (res.status === 429) throw new Error('Bahut zyada requests — 1 minute ruk ke dobara try karein.');
  if (res.status === 413) throw new Error('Audio chunk bahut bada — chhota clip try karein.');
  if (!res.ok) throw new Error('Transcription service busy hai — thodi der baad try karein.');

  let data = {};
  try { data = await res.json(); } catch (e) { throw new Error('Transcription response samajh nahi aaya — dobara try karein.'); }

  const text = String(data.transcript || '').trim();
  return { text, language_code: data.language_code || '' };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  /* ── A) REAL speech-to-text ── */
  if (body.mode === 'stt' && body.audioBase64) {
    try {
      const account = await require('../shared/accounts').requireAccount(req);
      await require('../shared/accounts').dailyLimit(account.id, 'transcriptionChunks', 60, 600);
    } catch (error) { return sendJSON(res, error.status || 503, { message: error.status ? error.message : 'Account service is unavailable.' }); }
    if (!SARVAM_KEY) return sendJSON(res, 503, { message: 'Transcription service abhi setup nahi hai — thodi der baad try karein.' });

    let wavBuf;
    try { wavBuf = Buffer.from(String(body.audioBase64), 'base64'); } catch (e) { return sendJSON(res, 400, { message: 'Audio data galat format me hai.' }); }
    if (!wavBuf.length || wavBuf.length < 100) return sendJSON(res, 400, { message: 'Audio chunk khaali hai.' });
    if (wavBuf.length > 6 * 1024 * 1024) return sendJSON(res, 413, { message: 'Audio chunk bahut bada hai.' });

    try {
      const { text, language_code } = await sarvamSTT(wavBuf, body.languageCode);
      return sendJSON(res, 200, {
        transcript: {
          text,
          language: language_code || body.languageCode || 'Auto',
          mode: 'real',
          duration: null,
          segments: [],
        },
        chunk: body.chunk || 1,
        chunks: body.chunks || 1,
      });
    } catch (e) {
      return sendJSON(res, 502, { message: e.message || 'Transcription fail ho gayi — dobara try karein.' });
    }
  }

  return sendJSON(res, 400, { message: 'Upload an audio or video file to transcribe. Link transcription is unavailable.' });
};
