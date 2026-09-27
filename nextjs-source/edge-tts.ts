// Microsoft Edge "Read Aloud" neural voices (server-side only).
// Produces natural MP3 speech for Indian languages without an API key.

import { createHash, randomUUID } from "crypto";
import WebSocket from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split(".")[0];
const BASE = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

let clockSkewSeconds = 0;

function secMsGec(): string {
  let ticks = Math.floor(Date.now() / 1000 + clockSkewSeconds) + 11644473600;
  ticks -= ticks % 300;
  // Windows FILETIME (100-ns units) — BigInt keeps the 17-digit value exact.
  const payload = (BigInt(ticks) * BigInt(10000000)).toString() + TRUSTED_CLIENT_TOKEN;
  return createHash("sha256").update(payload, "ascii").digest("hex").toUpperCase();
}

function timestamp(): string {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface EdgeSynthOptions {
  text: string;
  voice: string; // e.g. hi-IN-SwaraNeural
  locale: string; // e.g. hi-IN
  /** Percent, e.g. 10 => +10% faster, -10 => slower */
  ratePct?: number;
  /** Hz, e.g. 15 => +15Hz higher pitch */
  pitchHz?: number;
  /** Percent volume change */
  volumePct?: number;
}

function fmtSigned(n: number, unit: string): string {
  const v = Math.round(n);
  return `${v >= 0 ? "+" : ""}${v}${unit}`;
}

function synthOnce(opts: EdgeSynthOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const connectionId = randomUUID().replace(/-/g, "");
    const url = `wss://${BASE}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}&ConnectionId=${connectionId}`;
    const ws = new WebSocket(url, {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
      },
      handshakeTimeout: 12000,
    });

    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      finish(new Error("Edge TTS timed out"));
    }, 40000);

    ws.on("open", () => {
      ws.send(
        `X-Timestamp:${timestamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}\r\n`
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${opts.locale}'>` +
        `<voice name='${opts.voice}'>` +
        `<prosody pitch='${fmtSigned(opts.pitchHz ?? 0, "Hz")}' rate='${fmtSigned(opts.ratePct ?? 0, "%")}' volume='${fmtSigned(opts.volumePct ?? 0, "%")}'>` +
        escapeXml(opts.text) +
        `</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp()}Z\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on("message", (data, isBinary) => {
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      if (isBinary) {
        if (buf.length < 2) return;
        const headerLength = buf.readUInt16BE(0);
        const header = buf.subarray(2, 2 + headerLength).toString("utf8");
        if (header.includes("Path:audio")) chunks.push(buf.subarray(2 + headerLength));
        return;
      }
      const text = buf.toString("utf8");
      if (text.includes("Path:turn.end")) finish();
    });

    ws.on("unexpected-response", (_req, res) => {
      // Adjust for clock skew if Microsoft rejects the time-based token.
      const serverDate = res.headers.date;
      if (serverDate) {
        const parsed = Date.parse(serverDate);
        if (!Number.isNaN(parsed)) {
          clockSkewSeconds += parsed / 1000 - Date.now() / 1000;
        }
      }
      finish(new Error(`Edge TTS handshake failed (HTTP ${res.statusCode})`));
    });

    ws.on("error", (err) => finish(err instanceof Error ? err : new Error(String(err))));
    ws.on("close", () => {
      if (!settled) {
        if (chunks.length > 0) finish();
        else finish(new Error("Edge TTS connection closed early"));
      }
    });
  });
}

export async function edgeSynthesize(opts: EdgeSynthOptions): Promise<Buffer> {
  try {
    return await synthOnce(opts);
  } catch (err) {
    // One retry (covers clock-skew token refresh and transient drops).
    if (err instanceof Error && /handshake|closed early|timed out/i.test(err.message)) {
      return synthOnce(opts);
    }
    throw err;
  }
}
