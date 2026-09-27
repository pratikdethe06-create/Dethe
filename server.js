/**
 * DetheAI local server — runs the exact same api/ functions Vercel will run,
 * plus serves the static frontend from public/. Used for local testing &
 * the live preview. On Vercel this file is not needed (api/ is auto-detected).
 *
 *   node server.js          → http://localhost:8080
 *   PORT=3000 node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HANDLERS = {
  '/api/voice/generate': require('./api/voice/generate'),
  '/api/ai/script': require('./api/ai/script'),
  '/api/transcribe': require('./api/transcribe'),
  '/api/auth/google/url': require('./api/auth/google/url'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8080;

function readBody(req) {
  return new Promise((resolve) => {
    const parts = [];
    req.on('data', (d) => parts.push(d));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { pathname = '/'; }

  // --- API routes (same handler signature as Vercel functions) ---
  const handler = HANDLERS[pathname.replace(/\/+$/, '')];
  if (handler) {
    try {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const buf = await readBody(req);
        let body = {};
        try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch {}
        req.body = body;
      }
      await handler(req, res);
    } catch (e) {
      console.error(`[api] ${pathname} crashed:`, e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ message: 'Internal server error: ' + e.message }));
    }
    return;
  }

  // --- static files from public/ (SPA fallback to index.html) ---
  let filePath = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html'); // SPA fallback (mirrors vercel.json rewrites)
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`DetheAI fix running at http://0.0.0.0:${PORT}`);
  console.log('API endpoints:');
  Object.keys(HANDLERS).forEach((h) => console.log('  POST/GET ' + h));
});
