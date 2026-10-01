/**
 * DetheAI — POST /api/transcribe
 *
 *  A) mode:'stt' + audioBase64 → REAL transcription (Sarvam AI saarika STT)
 *     Browser video ka audio (16kHz mono WAV, ≤30s chunk) bhejta hai.
 *  B) fallback (links / purane clients) → demo transcript — backwards compatible
 *
 * Response: { transcript: { text, language, duration, segments: [{ start, end, text }] } }
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

/* ── Sarvam Speech-to-Text (saarika) ─────────────────────────────────── */
const SARVAM_KEY = process.env.PREMIUM_TTS_KEY || process.env.SARVAM_API_KEY || process.env.SARVAM_KEY || '';
const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
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
      method: 'POST',
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

/* ── Demo fallback (link paste / no file) ────────────────────────────── */
const DEMO_LINES = {
  hindi:     ['नमस्ते! आज हम सीखेंगे कि वीडियो से टेक्स्ट कैसे बनाते हैं।', 'बस अपना वीडियो अपलोड करें और भाषा चुनें।', 'कुछ ही सेकंड में साफ़ ट्रांसक्रिप्ट तैयार।'],
  english:   ['Hello! Today we will learn how to turn videos into text.', 'Just upload your video and choose a language.', 'In a few seconds your clean transcript is ready.'],
  odia:      ['ନମସ୍କାର! ଆଜି ଆମେ ଶିଖିବା କିପରି ଭିଡିଓରୁ ଟେକ୍ସ୍ଟ ତିଆରି ହୁଏ।', 'କେବଳ ଆପଣଙ୍କ ଭିଡିଓ ଅପଲୋଡ୍ କରନ୍ତୁ ଏବଂ ଭାଷା ବାଛନ୍ତୁ।', 'କିଛି ସେକେଣ୍ଡରେ ସଫା ଟ୍ରାନ୍ସକ୍ରିପ୍ଟ ପ୍ରସ୍ତୁତ।'],
  tamil:     ['வணக்கம்! இன்று வீடியோவை டெக்ஸ்ட்டாக மாற்றுவது எப்படி என்று கற்போம்.', 'உங்கள் வீடியோவை பதிவேற்றி மொழியைத் தேர்ந்தெடுங்கள்.', 'சில விநாடிகளில் சரியான டிரான்ஸ்கிரிப்ட் தயார்.'],
  telugu:    ['నమస్కారం! ఈరోజు వీడియోను టెక్స్‌గా ఎలా మార్చాలో నేర్చుకుంటాము.', 'మీ వీడియోను అప్‌లోడ్ చేసి భాషను ఎంచుకోండి.', 'కొన్ని క్షణాల్లో స్పష్టమైన ట్రాన్స్‌క్రిప్ట్ సిద్ధం.'],
  marathi:   ['नमस्कार! आज आपण शिकणार आहोत की व्हिडिओमधून मजकूर कसा बनवायचा.', 'फक्त तुमचा व्हिडिओ अपलोड करा आणि भाषा निवडा.', 'काही सेकंदांत स्वच्छ ट्रान्सक्रिप्ट तयार.'],
  bengali:   ['নমস্কার! আজ আমরা শিখব কীভাবে ভিডিও থেকে টেক্সট তৈরি করা যায়।', 'আপনার ভিডিও আপলোড করুন এবং ভাষা বেছে নিন।', 'কয়েক সেকেন্ডেই পরিষ্কার ট্রান্সক্রিপ্ট প্রস্তুত।'],
  gujarati:  ['નમસ્તે! આજે આપણે શીખીશું કે વિડિયોમાંથી ટેક્સ્ટ કેવી રીતે બનાવવું.', 'તમારો વિડિયો અપલોડ કરો અને ભાષા પસંદ કરો.', 'કેટલાક સેકંડમાં સાફ ટ્રાન્સક્રિપ્ટ તૈયાર.'],
  punjabi:   ['ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਅੱਜ ਅਸੀਂ ਸਿੱਖਾਂਗੇ ਕਿ ਵੀਡਿਓ ਤੋਂ ਟੈਕਸਟ ਕਿਵੇਂ ਬਣਾਈਏ।', 'ਆਪਣਾ ਵੀਡਿਓ ਅਪਲੋਡ ਕਰੋ ਅਤੇ ਭਾਸ਼ਾ ਚੁਣੋ।', 'ਕੁਝ ਸਕਿੰਟਾਂ ਵਿੱਚ ਸਾਫ਼ ਟ੍ਰਾਂਸਕ੍ਰਿਪਟ ਤਿਆਰ।'],
  kannada:   ['ನಮಸ್ಕಾರ! ಇಂದು ವೀಡಿಯೊದಿಂದ ಪಠ್ಯವನ್ನು ಹೇಗೆ ಮಾಡುವುದು ಎಂದು ಕಲಿಯೋಣ.', 'ನಿಮ್ಮ ವೀಡಿಯೊವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ.', 'ಕೆಲವೇ ಸೆಕೆಂಡುಗಳಲ್ಲಿ ಸ್ಪಷ್ಟ ಪ್ರತಿಲೇಖನ ಸಿದ್ಧ.'],
  malayalam: ['നമസ്കാരം! ഇന്ന് വീഡിയോയിൽ നിന്ന് ടെക്സ്റ്റ് ഉണ്ടാക്കുന്ന വിധം പഠിക്കാം.', 'നിങ്ങളുടെ വീഡിയോ അപ്‌ലോഡ് ചെയ്ത് ഭാഷ തിരഞ്ഞെടുക്കുക.', 'അൽപ സെക്കൻഡുകൾക്കുള്ളിൽ വ്യക്തമായ ട്രാൻസ്ക്രിപ്റ്റ് തയ്യാർ.'],
};

function pickLines(language, snippet) {
  const key = String(language || 'Hindi').trim().toLowerCase();
  const lines = DEMO_LINES[key] || DEMO_LINES.hindi;
  if (snippet && snippet.trim()) {
    const cleaned = snippet.includes(':') && snippet.toLowerCase().includes('transcribed')
      ? snippet.slice(snippet.indexOf(':') + 1).trim()
      : snippet.trim();
    if (cleaned) return cleaned.split(/(?<=[.!?।॥\n])\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
  }
  return lines;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  /* ── A) REAL speech-to-text ── */
  if (body.mode === 'stt' && body.audioBase64) {
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

  /* ── B) Demo fallback ── */
  const lines = pickLines(body.language, body.textSnippet);
  if (!lines.length) return sendJSON(res, 400, { message: 'Nothing to transcribe.' });

  const segments = [];
  let t = 0;
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean).length;
    const dur = Math.max(1.6, words * 0.42);
    segments.push({ start: Math.round(t * 100) / 100, end: Math.round((t + dur) * 100) / 100, text: line });
    t += dur + 0.35;
  }

  return sendJSON(res, 200, {
    transcript: {
      text: lines.join(' '),
      language: body.language || 'Hindi',
      mode: 'demo',
      duration: Math.round(t * 100) / 100,
      segments,
    },
  });
};
