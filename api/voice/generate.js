/**
 * DetheAI — POST /api/voice/generate   (rebuilt from the original Next.js source)
 *
 * Request : { text, language, languageCode, voice, style, speed, pitch, emotion, purpose }
 * Response: { audioBase64, mimeType, filename, charCount, words, creditsCharged, quality, provider }
 *
 * Engine chain (same order as the original app):
 *   1. Sarvam AI bulbul:v3 — premium natural voices (all 37 DetheAI speakers)  [PREMIUM_TTS_KEY / SARVAM_API_KEY]
 *   2. Google Translate TTS — free fallback, no key (10 of 11 languages)
 *   3. Browser speechSynthesis — the frontend handles this automatically when audioBase64 is absent
 */

const SARVAM_KEY = process.env.PREMIUM_TTS_KEY || process.env.SARVAM_API_KEY || process.env.SARVAM_KEY || '';
const SARVAM_MODEL = process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech';
const MAX_INPUT_CHARS = 480;        // provider limit: 500 per input
const MAX_INPUTS_PER_CALL = 3;      // batch up to 3 inputs per API call

// If the Sarvam key is rejected, pause it for 10 min instead of failing every request
let premiumPausedUntil = 0;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Sarvam bulbul:v3 speaker catalogue — identical to the original premium-tts.ts
const FEMALE = new Set(['priya','ritu','neha','pooja','simran','kavya','ishita','shreya','roopa','tanya','shruti','suhani','kavitha','rupali']);
const MALE = new Set(['shubh','aditya','rahul','rohan','amit','dev','ratan','varun','manan','sumit','kabir','aayan','ashutosh','advait','anand','tarun','sunny','mani','gokul','vijay','mohit','rehan','soham']);

const SARVAM_CODES = new Set(['hi-IN','en-IN','od-IN','ta-IN','te-IN','mr-IN','bn-IN','gu-IN','pa-IN','kn-IN','ml-IN']);
const GTTS_CODES = { 'hi-IN':'hi','en-IN':'en','ta-IN':'ta','te-IN':'te','mr-IN':'mr','bn-IN':'bn','gu-IN':'gu','pa-IN':'pa','kn-IN':'kn','ml-IN':'ml' };

function sendJSON(res, code, obj) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const clamp = (n, min, max) => (Number.isNaN(n) ? min : Math.min(max, Math.max(min, n)));

/* ---------- sentence-aware chunking (original chunkText logic) ---------- */
function splitLong(s, maxLen) {
  const out = [];
  let rest = String(s);
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(' ', maxLen);
    if (cut <= 0 || cut < maxLen * 0.5) cut = maxLen;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function chunkText(text, max) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[.!?।॥;:\n])\s+/);
  const chunks = [];
  let cur = '';
  for (let part of sentences) {
    part = part.trim();
    if (!part) continue;
    if (part.length > max) {
      if (cur) { chunks.push(cur); cur = ''; }
      for (const piece of splitLong(part, max)) {
        if ((cur + ' ' + piece).trim().length > max) { if (cur) chunks.push(cur); cur = piece; }
        else cur = cur ? cur + ' ' + piece : piece;
      }
      continue;
    }
    if ((cur + ' ' + part).trim().length > max) { if (cur) chunks.push(cur); cur = part; }
    else cur = cur ? cur + ' ' + part : part;
  }
  if (cur) chunks.push(cur);
  return chunks.filter(Boolean);
}

/* ---------- WAV merge (only needed if a provider returns WAV despite mp3 codec) ---------- */
function parseWav(buf) {
  if (!buf || buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12, fmt = null, pcm = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    } else if (id === 'data') pcm = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  return fmt && pcm ? { ...fmt, pcm } : null;
}

function buildWav(pcm, { channels, sampleRate, bits }) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function mergeAudioBuffers(bufs) {
  const parsed = bufs.map(parseWav);
  if (parsed.some((p) => !p)) return { audio: Buffer.concat(bufs), mimeType: 'audio/mpeg' }; // mp3 → plain concat
  const { channels, sampleRate, bits } = parsed[0];
  return { audio: buildWav(Buffer.concat(parsed.map((p) => p.pcm)), { channels, sampleRate, bits }), mimeType: 'audio/wav' };
}

/* ---------- engine 1: Sarvam AI (premium natural voices) ---------- */
async function synthPremium({ text, speaker, languageCode, pace, temperature }) {
  const chunks = chunkText(text, MAX_INPUT_CHARS);
  if (!chunks.length) throw new Error('Empty script');
  const parts = [];
  for (let i = 0; i < chunks.length; i += MAX_INPUTS_PER_CALL) {
    const inputs = chunks.slice(i, i + MAX_INPUTS_PER_CALL);
    const res = await fetch(SARVAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-subscription-key': SARVAM_KEY },
      body: JSON.stringify({
        inputs,
        target_language_code: languageCode,
        speaker,
        model: SARVAM_MODEL,
        pace: clamp(pace ?? 1, 0.5, 2),
        temperature: clamp(temperature ?? 0.6, 0.01, 2),
        speech_sample_rate: 24000,
        output_audio_codec: 'mp3',
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        premiumPausedUntil = Date.now() + 10 * 60 * 1000; // pause 10 min on bad key
        throw new Error('PREMIUM_AUTH');
      }
      throw new Error(`Sarvam ${res.status}: ${(await res.text().catch(() => '')).slice(0, 180)}`);
    }
    const data = await res.json();
    const audios = (data && data.audios) || [];
    for (const b64 of audios) if (b64) parts.push(Buffer.from(b64, 'base64'));
  }
  if (!parts.length) throw new Error('Sarvam: no audio in response');
  return mergeAudioBuffers(parts);
}

/* ---------- engine 2: Google Translate TTS (free, no key) ---------- */
async function gttsChunk(text, tl, idx, total) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob' +
    `&tl=${encodeURIComponent(tl)}&total=${total}&idx=${idx}&textlen=${text.length}` +
    `&q=${encodeURIComponent(text)}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Referer: 'https://translate.google.com/',
  };
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500) return buf;
        throw new Error(`tiny response (${buf.length}b)`);
      }
      throw new Error(`gTTS ${res.status}`);
    } catch (e) {
      lastErr = e;
      await new Promise((ok) => setTimeout(ok, 350 + attempt * 450));
    }
  }
  throw lastErr || new Error('gTTS failed');
}

/* ---------- handler ---------- */
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const text = String(body.text || '').trim();
  const languageCode = String(body.languageCode || body.locale || 'hi-IN');
  const speakerRaw = String(body.voice || '').toLowerCase();
  const speaker = FEMALE.has(speakerRaw) || MALE.has(speakerRaw) ? speakerRaw : 'shubh';
  const speed = Number(body.speed) || 1;
  const emotion = Number(body.emotion ?? 64);
  // emotion slider (0–100) → Sarvam temperature (expressiveness)
  const temperature = clamp(0.2 + (emotion / 100) * 1.4, 0.01, 2);

  if (!text) return sendJSON(res, 400, { message: 'Write something first — your voice is waiting.' });
  if (text.length > 20000) return sendJSON(res, 400, { message: 'This script exceeds the 20,000 character safety limit.' });

  const words = text.split(/\s+/).filter(Boolean).length;
  const creditsCharged = Math.max(1, Math.ceil(words / 100) * 5); // DetheAI pricing: 5 credits per 100-word block
  const respond = (audio, mimeType, provider, quality) =>
    sendJSON(res, 200, {
      audioBase64: audio.toString('base64'),
      mimeType,
      filename: `dethe-${speaker}-${Date.now()}.${mimeType === 'audio/wav' ? 'wav' : 'mp3'}`,
      charCount: text.length,
      words,
      creditsCharged,
      quality,
      provider,
      voice: speaker,
    });

  /* 1) Premium natural voices — Sarvam AI bulbul:v3 */
  if (SARVAM_KEY && SARVAM_CODES.has(languageCode) && Date.now() > premiumPausedUntil) {
    try {
      const { audio, mimeType } = await synthPremium({ text, speaker, languageCode, pace: speed, temperature });
      return respond(audio, mimeType, 'sarvam', 'natural');
    } catch (e) {
      console.error('[voice/generate] premium failed:', e.message);
    }
  }

  /* 2) Standard fallback — Google Translate TTS (no key) */
  const gCode = GTTS_CODES[languageCode] || null;
  if (gCode) {
    try {
      const chunks = chunkText(text, 180);
      const bufs = [];
      for (let i = 0; i < chunks.length; i++) {
        bufs.push(await gttsChunk(chunks[i], gCode, i, chunks.length));
        if (i < chunks.length - 1) await new Promise((ok) => setTimeout(ok, 120));
      }
      if (bufs.length) return respond(Buffer.concat(bufs), 'audio/mpeg', 'google-translate', 'standard');
    } catch (e) {
      console.error('[voice/generate] standard failed:', e.message);
    }
  }

  /* 3) Nothing produced → let the browser speak (frontend handles this) */
  return sendJSON(res, 200, {
    provider: 'browser',
    words,
    creditsCharged: 0,
    message: 'Our voice servers are busy right now. Nothing was charged — please try again in a moment.',
  });
};
