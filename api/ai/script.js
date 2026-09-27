/**
 * DetheAI — POST /api/ai/script
 *
 * Request : { action: "write" | "enhance", prompt, currentScript, language, tone, length }
 * Response: { script }
 *
 * Provider chain:
 *   1. Google Gemini  [GEMINI_API_KEY — free at aistudio.google.com]
 *   2. OpenAI         [OPENAI_API_KEY]
 *   3. Built-in template generator (no key required)
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const TARGET_WORDS = { short: 60, medium: 130, long: 280 };

function buildPrompt(o) {
  const target = TARGET_WORDS[o.length] || 130;
  const task = o.action === 'enhance'
    ? `Improve and rewrite the following script. Keep its core idea but make it more engaging and natural to speak.\n\nCURRENT SCRIPT:\n${o.currentScript || o.prompt}`
    : `Write a brand-new voiceover script about:\n${o.prompt}`;
  return [
    `You are DetheAI's scriptwriter for Indian creators.`,
    task,
    ``,
    `Requirements:`,
    `- Language: write the script in ${o.language || 'Hindi'}`,
    `- Tone: ${o.tone || 'natural and conversational'}`,
    `- Length: about ${target} words (${o.length === 'short' ? '30 seconds' : o.length === 'long' ? '2-3 minutes' : '60 seconds'})`,
    `- Strong opening hook in the first line, natural flow, ending with a short call-to-action.`,
    `- Output ONLY the script text. No titles, no headings, no quotes, no explanations.`,
  ].join('\n');
}

async function geminiScript(prompt) {
  const models = [process.env.GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'].filter(Boolean);
  let lastErr;
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!r.ok) { lastErr = new Error(`Gemini ${model} ${r.status}`); continue; }
      const data = await r.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (text) return text;
      lastErr = new Error('Gemini empty response');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Gemini failed');
}

async function openaiScript(prompt) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const data = await r.json();
  const text = (data.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('OpenAI empty response');
  return text;
}

/* ---------- offline template fallback (works with no API key) ---------- */
const L = {
  hindi:      { greet: 'नमस्ते दोस्तों!', cta: 'ऐसे ही वीडियो के लिए DetheAI को फॉलो करें!' },
  english:    { greet: 'Hey everyone!', cta: 'Follow DetheAI for more videos like this!' },
  odia:       { greet: 'ନମସ୍କାର ବନ୍ଧୁଗଣ!', cta: 'ଏପରି ଭିଡିଓ ପାଇଁ DetheAI କୁ ଫଲୋ କରନ୍ତୁ!' },
  tamil:      { greet: 'வணக்கம் நண்பர்களே!', cta: 'இப்படியான வீடியோக்களுக்கு DetheAI-ஐ பின்தொடருங்கள்!' },
  telugu:     { greet: 'నమస్కారం మిత్రులారా!', cta: 'ఇలాంటి వీడియోల కోసం DetheAI ను ఫాలో చేయండి!' },
  marathi:    { greet: 'नमस्कार मित्रांनो!', cta: 'अशाच व्हिडिओंसाठी DetheAI ला फॉलो करा!' },
  bengali:    { greet: 'নমস্কার বন্ধুরা!', cta: 'এমন ভিডিওর জন্য DetheAI ফলো করুন!' },
  gujarati:   { greet: 'નમસ્તે મિત્રો!', cta: 'આવા વિડિયો માટે DetheAI ને ફોલો કરો!' },
  punjabi:    { greet: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਦੋਸਤੋ!', cta: 'ਐਸੇ ਵੀਡੀਓ ਲਈ DetheAI ਨੂੰ ਫਾਲੋ ਕਰੋ!' },
  kannada:    { greet: 'ನಮಸ್ಕಾರ ಗೆಳೆಯರೇ!', cta: 'ಹೀಗಾದ ವೀಡಿಯೊಗಳಿಗಾಗಿ DetheAI ಅನ್ನು ಫಾಲೋ ಮಾಡಿ!' },
  malayalam:  { greet: 'നമസ്കാരം സുഹൃത്തുക്കളേ!', cta: 'ഇത്തരം വീഡിയോകൾക്ക് DetheAI ഫോളോ ചെയ്യൂ!' },
};

function templateScript(o) {
  const langKey = String(o.language || 'Hindi').toLowerCase();
  const t = L[langKey] || L.hindi;
  const prompt = String(o.prompt || o.currentScript || '').trim();
  const topic = (prompt.split(/[.!?\n।]/)[0] || 'this topic').slice(0, 120);
  const tone = String(o.tone || 'natural');
  const target = TARGET_WORDS[o.length] || 130;

  const lines = [
    `${t.greet} ${topic}.`,
    ``,
    `आज की इस वीडियो में हम इस विषय को गहराई से समझेंगे — ${tone} अंदाज़ में, बिल्कुल आसान भाषा में।`,
    ``,
    `सुरुआत में एक सवाल: क्या आपने कभी सोचा है कि यह असल में कैसे काम करता है?`,
    `${prompt}`,
    ``,
    `अगर यह वीडियो अच्छा लगा, तो लाइक और शेयर ज़रूर करें।`,
    `${t.cta}`,
  ];
  let script = lines.filter(Boolean).join('\n');
  // top up length for medium/long targets
  while (script.split(/\s+/).length < target * 0.85) {
    script += `\n\nऔर एक बात — ${topic} को लेकर अपने अनुभव कमेंट में ज़रूर बताइए, ताकि अगले वीडियो में उसी पर गहराई से बात कर सकें।`;
  }
  return script;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return sendJSON(res, 405, { message: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const o = {
    action: body.action === 'enhance' ? 'enhance' : 'write',
    prompt: String(body.prompt || '').slice(0, 2000),
    currentScript: String(body.currentScript || '').slice(0, 6000),
    language: String(body.language || 'Hindi'),
    tone: String(body.tone || 'Natural & Relaxed'),
    length: ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium',
  };

  if (!o.prompt && !o.currentScript) {
    return sendJSON(res, 400, { message: 'Please describe what the script should be about.' });
  }

  const prompt = buildPrompt(o);

  if (GEMINI_KEY) {
    try {
      const script = await geminiScript(prompt);
      if (script) return sendJSON(res, 200, { script, provider: 'gemini' });
    } catch (e) { console.error('[ai/script] Gemini failed:', e.message); }
  }
  if (OPENAI_KEY) {
    try {
      const script = await openaiScript(prompt);
      if (script) return sendJSON(res, 200, { script, provider: 'openai' });
    } catch (e) { console.error('[ai/script] OpenAI failed:', e.message); }
  }

  // offline fallback
  return sendJSON(res, 200, { script: templateScript(o), provider: 'template' });
};
