# 🧠 DetheAI Backend — Poora Guide (Simple Hinglish)

> **Backend kya hota hai?** Restaurant ki analogy samjho:
> - **Frontend** = dining area 😋 (jo customers dekhte hain — design, buttons, colors) → `public/` folder
> - **Backend** = kitchen 👨‍🍳 (jahan asli kaam hota hai — orders process, khana banta hai, paise count hote hain) → `api/` folder
>
> Backend **server par** chalta hai — user ka browser use dekh nahi sakta. Isliye wo **secure** hota hai: API keys, payment verification, credit counting — sab backend me, taaki koi cheat na kar sake.

---

## 📁 Aapka backend (14 files, ~1,355 lines) — sab LIVE hai

| File | Kaam (simple me) |
|---|---|
| `api/voice/generate.js` | 🎙️ **Main TTS engine** — text lekar Sarvam AI ki API se ultra-realistic awaaz banata hai. Sarvam fail ho to Microsoft Edge neural, wo bhi fail ho to Google Translate — 3-engine chain, kabhi band nahi hota. Yahi website + Developer API dono use karte hain. |
| `api/v1/tts.js` | ⚡ **Public Developer API** (`POST /api/v1/tts`) — developers apne apps se awaaz banate hain API key se. Credits server par hi count hote hain (cheat impossible). |
| `api/v1/voices.js` | 📋 37 voices + 11 languages ka public list (docs ke liye) |
| `api/keys/[action].js` | 🔑 API keys ka manager — issue (nayi key), info (balance), revoke (delete) |
| `shared/keys/issue.js` | Key banata hai — **sirf real payment proof par** (Razorpay signature verify karke) |
| `shared/keys/info.js` | Key ka balance/expiry batata hai |
| `shared/keys/revoke.js` | Key permanently delete karta hai |
| `shared/kv.js` | 🗄️ **Database** — private GitHub repo (`dethe-api-db`) me API keys + credits store karta hai. Bilkul free, koi paid database nahi. |
| `api/billing/checkout.js` | 💳 Razorpay order banata hai (₹799 Pro / ₹2,499 Business) |
| `api/billing/verify.js` | 🔒 Payment verify karta hai (HMAC signature) — **bina payment plan kabhi nahi khulta** |
| `api/auth/google/url.js` + `callback.js` | 🔐 Google login (OAuth) — user ka email lena (fake guests band) |
| `api/ai/script.js` | ✍️ AI Script Writer (Gemini) — topic se voiceover script likhwata hai |
| `api/transcribe.js` | 🎬 Video to Text — video/audio ko text me badalta hai |
| `server.js` | 🧪 Local testing server (laptop par chalane ke liye; Vercel par zaroorat nahi) |

---

## 💰 Credits economy (backend enforce karta hai)

```
500 credits = har 100-word block (minimum 500/request)
─────────────────────────────────────────────────
Free       → 10,000/month  (≈ 10 videos, 6 voices, 1,000 chars limit)
Pro        → 50,000/month  (≈ 50 videos, sab 37 voices, unlimited chars)
Business   → 200,000/month (≈ 200 videos, API access)
```

- **Website credits** browser me track hote hain (login ke baad hi milte hain)
- **API credits** server par track hote hain (GitHub DB me) — har 30 din auto-refill
- Preview sunna **sabke liye free** (credits nahi kat te)

## 🛡️ Security features (backend me hi)

1. **Payment proof verify** — Razorpay ka HMAC signature server par check hota hai; fake plan kholna impossible
2. **API keys encrypted nahi, private repo me** — sirf owner dekh sakta hai
3. **Max 3 API keys per payment** — abuse prevention
4. **Plan checks server par** — PRO voices Free users ke liye backend se hi block (402 error)
5. **Failed generation = credits refund** (API me auto)

## 🔑 Environment Variables (Vercel → Settings → Environment Variables)

| Key | Kis liye |
|---|---|
| `SARVAM_API_KEY` | 37 realistic voices (api.sarvam.ai) |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | Payments |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google login |
| `GIMINI_APU_KEY` | AI Script Writer |
| `GITHUB_DB_TOKEN` | API keys database (⚠️ **delete mat karna — API isi se chalti hai**) |

## 🚀 Deploy kaise hota hai

- **Vercel serverless** — har file ek chhota function hai (max 60 sec)
- `vercel.json` me routing: `/api/*` → backend, `/api` → docs page, baaki → website
- Deploy: REST API se (project git-connected nahi hai)
- **Hobby plan limit: 12 functions** — abhi 10 use me hain ✅

## 🧪 Backend test karna ho to

```bash
# sab endpoints ka live check:
curl -s https://www.dethe.in/api/v1/voices | head -c 200

# TTS test (key chahiye):
curl -X POST https://www.dethe.in/api/v1/tts \
  -H "Authorization: Bearer dth_live_AAPKI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"नमस्ते","voice":"priya","languageCode":"hi-IN"}'
```

---

*Last updated: v11 (Nov 2025) — zoom fix + mobile proportions + separate pages + Developer API + real Razorpay checkout*
