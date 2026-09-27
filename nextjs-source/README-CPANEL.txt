DetheAI — static build for GoDaddy cPanel (public_html)
========================================================

WHAT THIS IS
------------
A pure HTML / CSS / JavaScript export of the DetheAI website. It needs NO Node.js
server, no `next start`, no database. Upload → done.

HOW TO UPLOAD (cPanel File Manager)
-----------------------------------
1. cPanel → File Manager → open  public_html
   (delete the default index.html / placeholder files GoDaddy put there)
2. Upload  detheai-static-cpanel.zip  into public_html
3. Right-click the zip → Extract → into public_html
4. Delete the zip. Make sure  public_html/index.html  and  public_html/.htaccess  exist
   (enable "Show hidden files" in File Manager settings to see .htaccess)
5. Open your domain. Pages:  /  /pricing/  /login/  /video-to-text/  /intro/  /dashboard/
6. SSL: cPanel → SSL/TLS Status → run AutoSSL (the .htaccess redirects http → https).
   If you don't have SSL yet, comment out the three "Force HTTPS" lines in .htaccess.

WHAT WORKS ON STATIC HOSTING
----------------------------
✔ Every page, the full design, mobile + desktop layout, fonts, logo, favicon, social card
✔ Pricing page with Monthly/Yearly toggle and plan comparison
✔ Intro scroll animation (procedural version; drop frames + frames.json into /frames to use originals)
✔ Voice-library browsing (names, languages, styles)

WHAT CANNOT WORK ON STATIC HOSTING (and is NOT faked)
-----------------------------------------------------
These need the DetheAI server + PostgreSQL database. On this static copy they show an
honest "not active on this hosting" notice instead of pretending to work:

✘ Login / Sign-up / Google sign-in / password reset   (needs server sessions + database)
✘ Voice generation & voice previews (TTS)             (needs server-side voice engine key)
✘ Credits, monthly resets, usage tracking             (database)
✘ Video to Text                                       (ffmpeg + speech engine on server)
✘ Subscriptions & payments (Pro / Business)           (Razorpay checkout verification)
✘ Razorpay WEBHOOKS                                   (Razorpay must POST to a live server URL;
                                                       static files cannot receive webhooks)
✘ Dashboard (projects, transcripts, subscription)     (database)

HOW TO GET THE FULL SITE WORKING WITH THIS STATIC FRONTEND
----------------------------------------------------------
Host the SAME project's backend (the Node.js app) somewhere that runs Node, e.g. Vercel,
Railway, Render, or a GoDaddy VPS — with your env vars (DATABASE_URL, AUTH_SECRET,
PREMIUM_TTS_KEY, RAZORPAY_*). Then rebuild this static site pointing at it:

    NEXT_PUBLIC_API_BASE=https://api.yourdomain.com \
    NEXT_PUBLIC_SITE_URL=https://yourdomain.com \
    npm run build:static

and upload the new zip. The static pages will call that backend for login, voices,
video-to-text and payments (cookies are sent cross-origin; set APP_URL on the backend to
your site URL so Google OAuth and reset emails point back correctly).

Simplest option: deploy the whole project to Vercel (free tier works) and point your
GoDaddy domain's DNS at it — then everything works with zero static-hosting limits.
