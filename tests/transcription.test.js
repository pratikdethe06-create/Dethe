const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/assets/transcribe-real.js'), 'utf8');
function client(duration, text = 'First. Second. Third.') {
  let requests = 0;
  class AudioContext {
    async decodeAudioData() { return { duration }; }
    async close() {}
  }
  class OfflineAudioContext {
    constructor(channels, frames) { this.frames = frames; }
    createBufferSource() { return { connect() {}, start() {} }; }
    async startRendering() { return { getChannelData: () => new Float32Array(this.frames) }; }
  }
  class FileReader {
    async readAsDataURL(blob) { this.result = 'data:audio/wav;base64,' + Buffer.from(await blob.arrayBuffer()).toString('base64'); this.onload(); }
  }
  const window = { AudioContext, OfflineAudioContext };
  vm.runInNewContext(source, { window, FileReader, Blob, ArrayBuffer, DataView, Uint8Array, AbortSignal, fetch: async (url, options) => {
    const body = JSON.parse(options.body); requests++;
    assert.equal(url, '/api/transcribe'); assert.equal(body.mode, 'stt');
    assert.equal(Buffer.from(body.audioBase64, 'base64').subarray(0, 4).toString(), 'RIFF');
    return { ok: true, json: async () => ({ transcript: { text } }) };
  } });
  return { run: window.__detheRealTranscribe, requests: () => requests };
}
const file = { size: 100, arrayBuffer: async () => new ArrayBuffer(10) };
test('Short transcript retains all sentences with bounded timestamps and UI metadata', async () => {
  const c = client(2); const out = await c.run(file, 'English');
  assert.equal(out.wordCount, 3); assert.equal(out.durationSec, 2); assert.equal(out.segments.length, 3);
  assert.equal(out.segments[0].start, 0); assert.equal(out.segments.at(-1).end, 2);
  for (const segment of out.segments) assert.ok(segment.end > segment.start && segment.end <= 2);
});
test('Audio longer than ten minutes is rejected before upload, never truncated', async () => {
  const c = client(601);
  await assert.rejects(c.run(file, 'English'), /10 minutes or less/); assert.equal(c.requests(), 0);
});
test('File larger than the advertised 85MB limit is rejected before decoding', async () => {
  const c = client(1);
  await assert.rejects(c.run({ size: 86 * 1024 * 1024 }, 'Hindi'), /85MB/); assert.equal(c.requests(), 0);
});
