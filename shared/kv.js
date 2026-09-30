/**
 * DetheAI — GitHub-backed KV store (private repo as a tiny database)
 * Powers the Developer API: API keys, server-side credit quotas, payment records.
 *
 * Env : GITHUB_DB_TOKEN  (classic PAT with repo access)
 * Repo: GITHUB_DB_REPO (default pratikdethe06-create/dethe-api-db, private)
 *
 * Layout (one JSON file per record):
 *   k_key_<apiKey>.json     → { email, plan, cycle, creditsLeft, creditsTotal, ... }
 *   k_user_<sha1(email)>.json → { email, keys: [...] }
 *   k_pay_<paymentId>.json  → { email, count }  (max 3 keys per payment)
 */

const REPO = process.env.GITHUB_DB_REPO || 'pratikdethe06-create/dethe-api-db';
const TOKEN = () => process.env.GITHUB_DB_TOKEN || '';
const BASE = () => `https://api.github.com/repos/${REPO}/contents`;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function headers() {
  return {
    Authorization: `token ${TOKEN()}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dethe-ai-api',
  };
}
const filePath = (key) => `${BASE()}/k_${key}.json`;

/** get(key) → parsed JSON value, or null when the record does not exist. */
async function get(key) {
  const r = await fetch(filePath(key), { headers: headers(), signal: AbortSignal.timeout(12000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`kv get ${key}: HTTP ${r.status}`);
  const d = await r.json();
  return JSON.parse(Buffer.from(d.content, 'base64').toString('utf-8'));
}

/** put(key, value) → creates or updates the record (retries on commit conflicts). */
async function put(key, value) {
  const content = Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');
  for (let i = 0; i < 3; i++) {
    let sha;
    const g = await fetch(filePath(key), { headers: headers(), signal: AbortSignal.timeout(12000) });
    if (g.ok) sha = (await g.json()).sha;
    else if (g.status !== 404) throw new Error(`kv put-get ${key}: HTTP ${g.status}`);
    const p = await fetch(filePath(key), {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `kv: ${key}`, content, ...(sha ? { sha } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    if (p.ok || p.status === 201) return true;
    if (p.status === 409 || p.status === 422) { await sleep(120 * (i + 1)); continue; } // concurrent write → retry
    throw new Error(`kv put ${key}: HTTP ${p.status}`);
  }
  throw new Error(`kv put ${key}: conflict retries exhausted`);
}

/** del(key) → removes the record (idempotent). */
async function del(key) {
  const g = await fetch(filePath(key), { headers: headers(), signal: AbortSignal.timeout(12000) });
  if (g.status === 404) return true;
  if (!g.ok) throw new Error(`kv del-get ${key}: HTTP ${g.status}`);
  const { sha } = await g.json();
  const d = await fetch(filePath(key), {
    method: 'DELETE',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `kv del: ${key}`, sha }),
    signal: AbortSignal.timeout(15000),
  });
  return d.ok || d.status === 404;
}

module.exports = { get, put, del };
