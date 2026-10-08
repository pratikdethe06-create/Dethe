/**
 * DetheAI — POST /api/ai/script
 *
 * Request : { action: "write" | "enhance", prompt, currentScript, language, tone, length }
 * Response: { script }
 *
 * Provider chain:
 *   1. Sarvam Chat (sarvam-105b) — Indian-language LLM  [SARVAM_API_KEY / PREMIUM_TTS_KEY — same key as voices]
 *   2. Google Gemini  [GEMINI_API_KEY — free at aistudio.google.com]
 *   3. OpenAI         [OPENAI_API_KEY]
 *   4. Built-in template generator (no key required)
 */

const SARVAM_KEY = process.env.PREMIUM_TTS_KEY || process.env.SARVAM_API_KEY || process.env.SARVAM_KEY || '';
const SARVAM_CHAT_URL = process.env.SARVAM_CHAT_URL || 'https://api.sarvam.ai/v1/chat/completions';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GIMINI_APU_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

const CORS = {
  'Cache-Control': 'no-store',
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

/* ── Sarvam Chat — Indian-language LLM (sarvam-105b → sarvam-30b) ── */
async function sarvamScript(prompt) {
  const models = [process.env.SARVAM_CHAT_MODEL, 'sarvam-105b', 'sarvam-30b'].filter(Boolean);
  let lastErr;
  for (const model of models) {
    try {
      const r = await fetch(SARVAM_CHAT_URL, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': SARVAM_KEY },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: "You are DetheAI's professional voiceover script writer for Indian creators. You write engaging, natural, speakable scripts in any Indian language. Output ONLY the script text — no titles, no headings, no quotes, no explanations, no markdown.",
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 1500,
        }),
      });
      if (!r.ok) { lastErr = new Error(`Sarvam ${model} ${r.status}: ${(await r.text().catch(() => '')).slice(0, 120)}`); continue; }
      const data = await r.json();
      const text = String(data.choices?.[0]?.message?.content || '').trim();
      if (text) return text;
      lastErr = new Error('Sarvam empty response');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Sarvam failed');
}

async function geminiScript(prompt) {
  const models = [process.env.GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'].filter(Boolean);
  let lastErr;
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST', signal: AbortSignal.timeout(8000),
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
    method: 'POST', signal: AbortSignal.timeout(8000),
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

  try {
    const account = await require('../../shared/accounts').requireAccount(req);
    await require('../../shared/accounts').dailyLimit(account.id, 'scripts', 20, 200);
  } catch (error) { return sendJSON(res, error.status || 503, { message: error.status ? error.message : 'Account service is unavailable.' }); }

  const prompt = buildPrompt(o);

  if (SARVAM_KEY) {
    try {
      const script = await sarvamScript(prompt);
      if (script) return sendJSON(res, 200, { script, provider: 'sarvam' });
    } catch (e) { console.error('[ai/script] Sarvam failed:', e.message); }
  }
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

  return sendJSON(res, 503, { message: 'AI writing is temporarily unavailable. Please try again later or write your script in the voice studio.' });
};
