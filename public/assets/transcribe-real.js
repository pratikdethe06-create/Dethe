/**
 * DetheAI — REAL Video-to-Text engine (browser side)
 * Video/audio file → browser me audio decode → 16kHz mono WAV → 28s chunks
 * → /api/transcribe (mode:'stt', Sarvam saarika) → merged transcript + timestamps
 */
(function () {
  'use strict';

  var LANG = {
    'hindi': 'hi-IN', 'english': 'en-IN', 'odia': 'od-IN', 'odia (oriya)': 'od-IN',
    'tamil': 'ta-IN', 'telugu': 'te-IN', 'marathi': 'mr-IN', 'bengali': 'bn-IN',
    'gujarati': 'gu-IN', 'punjabi': 'pa-IN', 'kannada': 'kn-IN', 'malayalam': 'ml-IN'
  };

  /* Uint8Array → base64 (FileReader se — bade arrays par bhi safe) */
  function toB64(u8) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { rej(new Error('Audio encode fail')); };
      fr.readAsDataURL(new Blob([u8]));
    });
  }

  /* Float32 mono PCM → 16-bit WAV bytes */
  function wav(pcm, sr) {
    var n = pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function s(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    s(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var x = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
    }
    return new Uint8Array(buf);
  }

  /* Text ko [t0,t1] window me sentence segments me baanto (timestamps) */
  function segs(text, t0, t1) {
    var parts = String(text || '').replace(/([.!?\u0964\u0965])\s+/g, '$1\n').split('\n')
      .map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parts.length) return [];
    var tot = 0;
    for (var i = 0; i < parts.length; i++) tot += parts[i].split(/\s+/).length;
    tot = tot || 1;
    var out = [], t = t0, span = Math.max(1, t1 - t0);
    for (var j = 0; j < parts.length; j++) {
      var d = Math.max(1.2, span * (parts[j].split(/\s+/).length / tot));
      out.push({ start: Math.round(t * 100) / 100, end: Math.round(Math.min(t + d, t1) * 100) / 100, text: parts[j] });
      t += d;
      if (t >= t1 - 0.2) break;
    }
    return out;
  }

  window.__detheRealTranscribe = async function (file, language) {
    if (!file || !file.size) throw new Error('File khaali lag rahi hai — dobara select karein.');
    if (file.size > 85 * 1024 * 1024) throw new Error('File 85MB se badi hai — chhota clip ya sirf audio file upload karein.');

    var AC = window.AudioContext || window.webkitAudioContext;
    var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC || !OC) throw new Error('Is browser me audio processing support nahi — Chrome ya Safari try karein.');

    var ab = await file.arrayBuffer();
    var ctx = new AC(), audio;
    try { audio = await ctx.decodeAudioData(ab); }
    catch (e) { throw new Error('Is file ka audio track decode nahi hua — MP4, MOV, MP3, WAV ya M4A file try karein.'); }
    finally { try { ctx.close(); } catch (e) {} }
    if (!audio || !audio.duration || !isFinite(audio.duration)) throw new Error('Audio duration detect nahi hui — dusri file try karein.');

    var SR = 16000, dur = Math.min(audio.duration, 600); /* max 10 minute */
    var off = new OC(1, Math.max(1, Math.ceil(dur * SR)), SR);
    var src = off.createBufferSource();
    src.buffer = audio; src.connect(off.destination); src.start(0);
    var rend = await off.startRendering();
    var pcm = rend.getChannelData(0);

    var code = LANG[String(language || '').trim().toLowerCase()] || 'unknown';
    var CH = 28, segments = [], texts = [], n = Math.max(1, Math.ceil(dur / CH));
    for (var i = 0; i < n; i++) {
      var t0 = i * CH, t1 = Math.min(dur, t0 + CH);
      var slice = pcm.subarray(Math.floor(t0 * SR), Math.max(Math.floor(t0 * SR) + 1, Math.floor(t1 * SR)));
      var payload = await toB64(wav(slice, SR));
      var r = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'stt', audioBase64: payload, languageCode: code, chunk: i + 1, chunks: n })
      });
      var d = null;
      try { d = await r.json(); } catch (e) {}
      if (!r.ok || !d || !d.transcript) throw new Error((d && d.message) || 'Transcription service busy — thodi der baad try karein.');
      if (d.transcript.text && d.transcript.text.trim()) {
        texts.push(d.transcript.text.trim());
        var ss = segs(d.transcript.text, t0, t1);
        for (var k = 0; k < ss.length; k++) segments.push(ss[k]);
      }
    }
    if (!texts.length) throw new Error('Is audio me koi speech detect nahi hua — video me awaaz clear hai na?');
    return {
      text: texts.join(' '),
      language: language || 'Auto',
      duration: Math.round(dur * 100) / 100,
      segments: segments,
      mode: 'real'
    };
  };
})();
