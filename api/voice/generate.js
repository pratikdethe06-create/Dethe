/**
 * DetheAI — POST /api/voice/generate   (rebuilt from the original Next.js source)
 *
 * Request : { text, language, languageCode, voice, style, speed, pitch, emotion, purpose }
 * Response: { audioBase64, mimeType, filename, charCount, words, creditsCharged, quality, provider }
 *
 * Engine chain (same order as the original app):
 *   1. Sarvam AI bulbul:v3 — premium natural voices (all 37 DetheAI speakers)  [PREMIUM_TTS_KEY / SARVAM_API_KEY]
 *   2. Microsoft Edge "Read Aloud" neural voices — free, no key, very natural (9 Indian languages)
 *   3. Google Translate TTS — free fallback (10 of 11 languages)
 *   4. Browser speechSynthesis — the frontend handles this automatically when audioBase64 is absent
 */

const tls = require('tls');
const crypto = require('crypto');

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

/* ── DetheAI VOICE PROFILES — har character ki BILKUL apni awaaz ────────────────
   Har bhasha ke native neural pair (Swara/Madhur etc.) ke saath ab 4 Microsoft
   MULTILINGUAL base voices (Ava, Emma, Andrew, Brian — ye har Indian bhasha bol
   sakti hain, aur inki awaaz asli me alag-alag logon jaisi hai) milte hain.
   Har speaker ka apna base voice + pitch level = har character distinct.
   Cycle: priya→Swara, ritu→Ava, neha→Emma, pooja→Swara(+pitch), simran→Ava(+pitch)... */
const ML_FEMALE = ['en-US-AvaMultilingualNeural', 'en-US-EmmaMultilingualNeural'];
const ML_MALE   = ['en-US-AndrewMultilingualNeural', 'en-US-BrianMultilingualNeural'];
const PITCH_LEVELS = [-12, 0, 12, -20, 20, -6, 6, 18];
const FEMALE_LIST = [...FEMALE];
const MALE_LIST = [...MALE];
function voiceProfile(speaker, nv) {
  const isF = FEMALE.has(speaker);
  const i = isF ? FEMALE_LIST.indexOf(speaker) : MALE_LIST.indexOf(speaker);
  if (i < 0) return { voice: nv.male, pitch: 0 };
  const bases = isF ? [nv.female, ...ML_FEMALE] : [nv.male, ...ML_MALE];
  return { voice: bases[i % 3], pitch: PITCH_LEVELS[Math.floor(i / 3) % PITCH_LEVELS.length] };
}

const SARVAM_CODES = new Set(['hi-IN','en-IN','od-IN','ta-IN','te-IN','mr-IN','bn-IN','gu-IN','pa-IN','kn-IN','ml-IN']);
const GTTS_CODES = { 'hi-IN':'hi','en-IN':'en','ta-IN':'ta','te-IN':'te','mr-IN':'mr','bn-IN':'bn','gu-IN':'gu','pa-IN':'pa','kn-IN':'kn','ml-IN':'ml' };

// Microsoft Edge neural voices (from the original voices.ts — free, no key, natural)
const NEURAL_VOICES = {
  'hi-IN': { female: 'hi-IN-SwaraNeural',   male: 'hi-IN-MadhurNeural' },
  'en-IN': { female: 'en-IN-NeerjaNeural',  male: 'en-IN-PrabhatNeural' },
  'ta-IN': { female: 'ta-IN-PallaviNeural', male: 'ta-IN-ValluvarNeural' },
  'te-IN': { female: 'te-IN-ShrutiNeural',  male: 'te-IN-MohanNeural' },
  'mr-IN': { female: 'mr-IN-AarohiNeural',  male: 'mr-IN-ManoharNeural' },
  'bn-IN': { female: 'bn-IN-TanishaaNeural',male: 'bn-IN-BashkarNeural' },
  'gu-IN': { female: 'gu-IN-DhwaniNeural',  male: 'gu-IN-NiranjanNeural' },
  'kn-IN': { female: 'kn-IN-SapnaNeural',   male: 'kn-IN-GaganNeural' },
  'ml-IN': { female: 'ml-IN-SobhanaNeural', male: 'ml-IN-MidhunNeural' },
};

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

/* ================= Engine 1: Sarvam AI (premium natural voices) ================= */
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
        temperature: clamp(temperature ?? 0.6, 0.01, 1),
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

/* ====== Engine 2: Microsoft Edge "Read Aloud" neural TTS (free, no key) ====== */
/* Dependency-free WebSocket client over TLS — port of the original edge-tts.ts */

const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
const EDGE_HOST = 'speech.platform.bing.com';
const EDGE_FORMAT = process.env.EDGE_OUTPUT_FORMAT || 'audio-24khz-96kbitrate-mono-mp3'; // double bitrate vs default 48k
const EDGE_VOLUME_BOOST = 10; // prosody volume +% — louder, fuller playback
let clockSkewSeconds = 0;

function secMsGec() {
  let ticks = Math.floor(Date.now() / 1000 + clockSkewSeconds) + 11644473600;
  ticks -= ticks % 300;
  return crypto.createHash('sha256').update((BigInt(ticks) * 10000000n).toString() + EDGE_TOKEN, 'ascii').digest('hex').toUpperCase();
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wsSendFrame(socket, text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) { header = Buffer.alloc(2); header[1] = 0x80 | payload.length; }
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  header[0] = 0x81; // FIN + text
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
  socket.write(Buffer.concat([header, mask, masked]));
}

function edgeSynthOnce({ text, voice, locale, ratePct, pitchHz, volumePct, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const connectionId = crypto.randomUUID().replace(/-/g, '');
    const path = `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connectionId}`;

    let settled = false;
    const socket = tls.connect({ host: EDGE_HOST, port: 443, servername: EDGE_HOST });
    const finish = (err, buf) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch {}
      if (err) reject(err); else resolve(buf);
    };
    const timer = setTimeout(() => finish(new Error('Edge TTS timed out')), timeoutMs || 20000);

    socket.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));

    let upgraded = false;
    let buf = Buffer.alloc(0);
    let msgType = 0;
    let msgParts = [];
    const audioChunks = [];

    const handleMessage = (opcode, payload) => {
      if (opcode === 1) {
        if (payload.toString('utf8').includes('Path:turn.end')) finish(null, Buffer.concat(audioChunks));
      } else if (opcode === 2) {
        if (payload.length < 2) return;
        const headerLen = payload.readUInt16BE(0);
        const header = payload.subarray(2, 2 + headerLen).toString('utf8');
        if (header.includes('Path:audio')) audioChunks.push(payload.subarray(2 + headerLen));
      }
    };

    const parseFrames = () => {
      for (;;) {
        if (buf.length < 2) return;
        const b0 = buf[0], b1 = buf[1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const len = b1 & 0x7f;
        let off = 2, plen;
        if (len === 126) { if (buf.length < 4) return; plen = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; plen = Number(buf.readBigUInt64BE(2)); off = 10; }
        else plen = len;
        if (buf.length < off + plen) return;
        const payload = buf.subarray(off, off + plen);
        buf = buf.subarray(off + plen);
        if (opcode === 0x9) { // ping → pong
          const mask = crypto.randomBytes(4);
          const h = Buffer.alloc(2); h[0] = 0x8a; h[1] = 0x80 | payload.length;
          const m = Buffer.alloc(payload.length);
          for (let i = 0; i < payload.length; i++) m[i] = payload[i] ^ mask[i & 3];
          socket.write(Buffer.concat([h, mask, m]));
          continue;
        }
        if (opcode === 0x8) { finish(new Error('Edge TTS closed early')); return; }
        if (opcode === 1 || opcode === 2) { msgType = opcode; msgParts = [payload]; }
        else if (opcode === 0) { msgParts.push(payload); }
        if (fin && msgParts.length) {
          handleMessage(msgType, Buffer.concat(msgParts));
          msgParts = []; msgType = 0;
          if (settled) return;
        }
      }
    };

    const noteClockSkew = (headText) => {
      const dm = /date:\s*(.+)/i.exec(headText);
      if (dm) {
        const parsed = Date.parse(dm[1]);
        if (!Number.isNaN(parsed)) clockSkewSeconds += parsed / 1000 - Date.now() / 1000;
      }
    };

    socket.on('connect', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: ${EDGE_HOST}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold\r\n` +
        `User-Agent: ${EDGE_UA}\r\n` +
        `Pragma: no-cache\r\n` +
        `Cache-Control: no-cache\r\n` +
        `Accept-Language: en-US,en;q=0.9\r\n\r\n`
      );
    });

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) {
          const nl = buf.indexOf('\r\n');
          if (nl > 0 && !buf.subarray(0, nl).toString('latin1').includes('101')) {
            noteClockSkew(buf.toString('latin1'));
            finish(new Error(`Edge TTS handshake failed (${buf.subarray(0, nl).toString('latin1')})`));
          }
          return;
        }
        const head = buf.subarray(0, idx).toString('latin1');
        if (!/^HTTP\/1\.1 101/.test(head)) {
          noteClockSkew(head);
          finish(new Error(`Edge TTS handshake failed (${head.split('\r\n')[0]})`));
          return;
        }
        buf = buf.subarray(idx + 4);
        upgraded = true;

        const ts = new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
        wsSendFrame(socket,
          `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${EDGE_FORMAT}"}}}}`);
        const fmt = (n, u) => `${n >= 0 ? '+' : ''}${Math.round(n)}${u}`;
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
          `<voice name='${voice}'>` +
          `<prosody pitch='${fmt(pitchHz || 0, 'Hz')}' rate='${fmt(ratePct || 0, '%')}' volume='${fmt((volumePct || 0) + EDGE_VOLUME_BOOST, '%')}'>` +
          escapeXml(text) +
          `</prosody></voice></speak>`;
        wsSendFrame(socket, `X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${ssml}`);
      }
      if (upgraded) parseFrames();
    });

    socket.on('close', () => {
      if (!settled) {
        if (audioChunks.length) finish(null, Buffer.concat(audioChunks));
        else finish(new Error('Edge TTS connection closed early'));
      }
    });
  });
}

async function edgeSynth(opts) {
  try {
    return await edgeSynthOnce(opts);
  } catch (err) {
    // One retry — covers clock-skew token refresh and transient drops (same as original)
    if (err instanceof Error && /handshake|closed early|timed out/i.test(err.message)) {
      return edgeSynthOnce(opts);
    }
    throw err;
  }
}

/* ================= Engine 3: Google Translate TTS (free, no key) ================= */
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

/* ============================ handler ============================ */
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const text = String(body.text || '').trim();
  const languageCode = String(body.languageCode || body.locale || 'hi-IN');
  const speakerRaw = String(body.voice || '').toLowerCase();
  const speaker = FEMALE.has(speakerRaw) || MALE.has(speakerRaw) ? speakerRaw : 'shubh';
  const isFemale = FEMALE.has(speakerRaw);
  const speed = Number(body.speed) || 1;
  const emotion = Number(body.emotion ?? 64);
  const temperature = clamp(0.2 + (emotion / 100) * 0.7, 0.01, 0.95);

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

  /* 2) Neural natural voices — Microsoft Edge Read Aloud (free, no key) */
  const nv = NEURAL_VOICES[languageCode];
  if (nv) {
    try {
      const prof = voiceProfile(speaker, nv);
      const voiceName = prof.voice;
      const chunks = chunkText(text, 1500);
      const parts = [];
      for (const c of chunks) {
        const buf = await edgeSynth({
          text: c, voice: voiceName, locale: languageCode,
          ratePct: Math.round((speed - 1) * 100), pitchHz: prof.pitch, volumePct: 0,
          timeoutMs: 20000,
        });
        if (buf.length > 200) parts.push(buf);
      }
      if (parts.length) return respond(Buffer.concat(parts), 'audio/mpeg', 'edge', 'natural');
    } catch (e) {
      console.error('[voice/generate] neural failed:', e.message);
    }
  }

  /* 3) Standard fallback — Google Translate TTS (no key) */
  const gCode = GTTS_CODES[languageCode] || null;
  if (gCode) {
    try {
      const chunks = chunkText(text, 180);
      const bufs = [];
      for (let i = 0; i < chunks.length; i++) {
        bufs.push(await gttsChunk(chunks[i], gCode, i, chunks.length));
        if (i < chunks.length - 1) await new Promise((ok) => setTimeout(ok, 100));
      }
      if (bufs.length) return respond(Buffer.concat(bufs), 'audio/mpeg', 'google-translate', 'standard');
    } catch (e) {
      console.error('[voice/generate] standard failed:', e.message);
    }
  }

  /* 4) Nothing produced → let the browser speak (frontend handles this) */
  return sendJSON(res, 200, {
    provider: 'browser',
    words,
    creditsCharged: 0,
    message: 'Our voice servers are busy right now. Nothing was charged — please try again in a moment.',
  });
};
