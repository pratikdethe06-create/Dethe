// Optimistic concurrency: rerun the mutation against the latest record on conflicts.
const crypto = require('node:crypto');
const { fail } = require('./http');
function url(key) {
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw fail(400, 'Invalid record identifier.');
  const base = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  return `${base}/repos/${process.env.GITHUB_DB_REPO || 'pratikdethe06-create/dethe-api-db'}/contents/k_${key}.json`;
}
function headers() {
  if (!process.env.GITHUB_DB_TOKEN) throw fail(503, 'Account storage is not configured.');
  return { Authorization: `Bearer ${process.env.GITHUB_DB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'dethe-ai', 'Content-Type': 'application/json' };
}
async function read(key) {
  const r = await fetch(url(key), { headers: headers(), signal: AbortSignal.timeout(12000) });
  if (r.status === 404) return { value: null, sha: null };
  if (!r.ok) throw fail(503, 'Account storage is temporarily unavailable.');
  const data = await r.json();
  return { value: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')), sha: data.sha };
}
async function get(key) { return (await read(key)).value; }
async function update(key, mutate) {
  const operation = crypto.randomUUID();
  for (let attempt = 0; attempt < 6; attempt++) {
    const { value, sha } = await read(key);
    if (value?._writes?.includes(operation)) return value;
    const next = mutate(value); // Must be synchronous and safe to retry.
    if (next === undefined) return value;
    next._writes = [...(value?._writes || []).slice(-63), operation];
    let r;
    try { r = await fetch(url(key), {
      method: 'PUT', headers: headers(), signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ message: 'Update application record', content: Buffer.from(JSON.stringify(next)).toString('base64'), ...(sha ? { sha } : {}) })
    }); } catch {
      // The write might have committed before its response was lost. Re-read
      // the operation marker before applying a non-idempotent mutation again.
      continue;
    }
    if (r.ok) return next;
    if (r.status !== 409 && r.status !== 422) throw fail(503, 'Could not save account changes.');
    await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
  }
  throw fail(503, 'Account is busy. Please try again.');
}
module.exports = { get, update };
