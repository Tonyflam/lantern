/**
 * Lantern web server — an accessible local app.
 *
 * Binds to loopback only by default. Endpoints:
 *   GET  /api/health   Status (engine, device, delegation, capabilities).
 *   GET  /api/events   Server-Sent Events stream of content-free audit activity.
 *   POST /api/ask      The main loop: optional speech-to-text → orchestrate →
 *                      optional text-to-speech. Accepts an image and/or audio as
 *                      base64 so the browser camera/microphone work with no
 *                      native browser plugins.
 *
 * Temp files for uploaded image/audio are written to the OS temp dir and removed
 * immediately after the request, so captured media never lingers on disk.
 */
import express from "express";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.js";
import { delegationSummary } from "../p2p/delegate.js";
import { pcmInt16ToWav, toWav16kMono, hasFfmpeg } from "../engine/audio-utils.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ cfg: import("../engine/types.js").LanternConfig, logger: import("../logger.js").AuditLogger }} deps
 */
export async function startServer({ cfg, logger }) {
  const app = await createApp({ cfg, logger });
  const server = express();
  server.use(express.json({ limit: "30mb" }));
  server.use(express.static(join(here, "public")));

  server.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      engine: app.engine.kind,
      mock: app.engine.kind === "mock",
      device: cfg.device,
      capabilities: app.engine.capabilities,
      delegation: delegationSummary(cfg),
      voice: cfg.voice,
      ffmpeg: hasFfmpeg(),
      memoryCount: app.memory.size(),
    });
  });

  // Live, content-free activity stream for the UI's "on-device activity" panel.
  server.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ engine: app.engine.kind })}\n\n`);
    const unsubscribe = logger.subscribe((line) => {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    });
    req.on("close", unsubscribe);
  });

  server.post("/api/ask", async (req, res) => {
    const { text = "", imageBase64, imageMime, audioBase64, speak = true } = req.body || {};
    /** @type {string[]} */
    const temps = [];
    try {
      let utterance = String(text || "");
      let transcript = "";

      // 1) Speech-to-text (optional).
      if (audioBase64) {
        const raw = Buffer.from(stripDataUrl(audioBase64), "base64");
        const wav = hasFfmpeg() ? toWav16kMono(raw) : raw;
        const audioPath = await writeTemp(wav, ".wav", temps);
        const r = await app.engine.transcribe({ audioPath });
        transcript = String(r.text || "").trim();
        if (transcript) utterance = utterance ? `${utterance} ${transcript}` : transcript;
      }

      // 2) Image (optional).
      let imagePath = null;
      if (imageBase64) {
        const buf = Buffer.from(stripDataUrl(imageBase64), "base64");
        imagePath = await writeTemp(buf, mimeToExt(imageMime), temps);
      }

      // 3) Orchestrate.
      const result = await app.orchestrator.handle({ text: utterance, imagePath });

      // 4) Text-to-speech (optional).
      let audioOut = null;
      let audioSampleRate = null;
      if (speak && cfg.voice?.enabled !== false && result.speech) {
        const tts = await app.engine.synthesize({ text: result.speech });
        audioOut = pcmInt16ToWav(tts.pcm, tts.sampleRate).toString("base64");
        audioSampleRate = tts.sampleRate;
      }

      res.json({ ...result, transcript, audioBase64: audioOut, audioSampleRate });
    } catch (err) {
      logger.event({
        op: "request_error",
        engine: app.engine.kind,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      await Promise.all(temps.map((t) => unlink(t).catch(() => {})));
    }
  });

  const { host, port } = cfg.server;
  return new Promise((resolve) => {
    const listener = server.listen(port, host, () => {
      const banner = app.engine.kind === "mock" ? "  [SIMULATION — mock engine, no real inference]" : "";
      console.log(`\n  Lantern is ready.${banner}`);
      console.log(`  Open  http://${host}:${port}\n`);
      logger.event({ op: "server_start", engine: app.engine.kind, ok: true, meta: { host, port } });
      resolve(listener);
    });
    const shutdown = async () => {
      logger.event({ op: "server_stop", engine: app.engine.kind, ok: true });
      listener.close();
      await app.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

/**
 * @param {Buffer} buf
 * @param {string} ext
 * @param {string[]} temps
 * @returns {Promise<string>}
 */
async function writeTemp(buf, ext, temps) {
  const p = join(tmpdir(), `lantern-${randomUUID()}${ext}`);
  await writeFile(p, buf);
  temps.push(p);
  return p;
}

/** @param {string} [mime] */
function mimeToExt(mime) {
  switch (mime) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".jpg";
  }
}

/** Strip a `data:...;base64,` prefix if present. @param {string} s */
function stripDataUrl(s) {
  const i = String(s).indexOf("base64,");
  return i >= 0 ? String(s).slice(i + 7) : String(s);
}
