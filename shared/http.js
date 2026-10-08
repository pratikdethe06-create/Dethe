function fail(status, message) { return Object.assign(new Error(message), { status }); }
function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function body(req) {
  try {
    const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw fail(400, 'A JSON object is required.'); }
}
function handle(method, action) {
  return async (req, res) => {
    try {
      if (req.method !== method) throw fail(405, `${method} only`);
      await action(req, res);
    } catch (error) {
      json(res, error.status || 503, { ok: false, message: error.status ? error.message : 'Service temporarily unavailable. Please try again.' });
    }
  };
}
module.exports = { fail, json, body, handle };
