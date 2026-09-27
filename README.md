# DetheAI — dethe.in

Ye repo ab **deploy-ready** hai: website ka frontend (`public/`) + **working backend API functions** (`api/`) — sab kuch Vercel par seedha deploy hota hai.

## 🎙️ Voice generation — kaise kaam karti hai

| Endpoint | Kaam |
|---|---|
| `/api/voice/generate` | Voice banana (Sarvam AI bulbul:v3 → free Google TTS → browser fallback) |
| `/api/ai/script` | AI Scriptwriter (Gemini → OpenAI → offline template) |
| `/api/transcribe` | Video-to-Text (demo transcript + SRT timestamps) |
| `/api/auth/google/url` | Google login URL |

**Engine chain** (original app jaisi hi): premium Sarvam voices ke liye `SARVAM_API_KEY` ya `PREMIUM_TTS_KEY` env var, warna free Google TTS (10/11 bhashaayein), warna browser voice. Galat key ho toh bhi site nahi tootti — khud fallback kar leti hai.

## 🔑 Environment Variables (Vercel → Settings → Environment Variables)

```
SARVAM_API_KEY=      # ⭐ recommended — dashboard.sarvam.ai se free key (saari 11 bhashaayein + 37 studio voices)
GEMINI_API_KEY=      # optional — AI Scriptwriter (aistudio.google.com/apikey)
OPENAI_API_KEY=      # optional — AI script backup
GOOGLE_CLIENT_ID=    # optional — real Google login
```

Key add/change karne ke baad **Redeploy** karna zaroori hai.

## 📁 Structure

```
├── api/            ← Vercel serverless functions (backend)
├── public/         ← Website (dethe.in ka live frontend + robots.txt + ads.txt)
├── nextjs-source/  ← ⚠️ ORIGINAL full-stack Next.js source (login, DB, payments)
│                      — preserve kiya gaya hai; future me full app ke liye
├── vercel.json     ← Vercel config (framework: null → static + api functions)
├── server.js       ← local testing ke liye (node server.js → localhost:8080)
└── package.json
```

## 🧪 Local test

```bash
node server.js   # http://localhost:8080
```

## 📜 History

- **Problem:** website static deploy thi, API functions deploy nahi the → voice generate karne par 404 error
- **Fix (Sep 2026):** backend functions dobara banaye, original Next.js source `nextjs-source/` me preserve
