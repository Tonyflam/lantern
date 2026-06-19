/**
 * MockEngine — an OFFLINE SIMULATION of the inference backend.
 *
 * ⚠️  This produces NO real AI output. It exists so that:
 *   1. the full app (UI, voice loop, deterministic spine, audit log) can run and
 *      be demoed without downloading multi-gigabyte models;
 *   2. the test-suite can verify Lantern's deterministic logic on any machine
 *      (including CI) with zero native dependencies.
 *
 * Every audit-log line it writes is tagged `"engine": "mock"`, the console
 * prints a `[MOCK]` prefix, and the UI shows a persistent SIMULATION banner —
 * so simulated output can never be mistaken for real on-device inference.
 *
 * For deterministic demos/tests, OCR and STT will read a sidecar text file
 * (`<image>.txt` / `<audio>.txt`) when present, so callers can supply known
 * ground-truth content.
 */
import { basename } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolvePath } from "../config.js";

export class MockEngine {
  /**
   * @param {import("./types.js").LanternConfig} cfg
   * @param {import("../logger.js").AuditLogger} logger
   */
  constructor(cfg, logger) {
    /** @type {"mock"} */
    this.kind = "mock";
    this.cfg = cfg;
    this.logger = logger;
    this.capabilities = { chat: true, vision: true, ocr: true, stt: true, tts: true, translate: true, embed: true };
  }

  async init() {
    this.logger.event({
      op: "engine_init",
      engine: "mock",
      ok: true,
      meta: { note: "OFFLINE SIMULATION — no real inference is performed" },
    });
  }

  /** @param {string} op @param {string} capability @param {Record<string, any>} [extra] */
  #log(op, capability, extra = {}) {
    this.logger.event({
      op,
      capability,
      engine: "mock",
      model: "(simulated)",
      device: "cpu",
      durationMs: extra.durationMs ?? 1,
      ok: true,
      ...extra,
    });
  }

  /** @param {{messages: import("./types.js").ChatMessage[]}} opts */
  async chat({ messages }) {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const text = `Simulated assistant reply to: "${last.slice(0, 140)}". (mock engine — no real model)`;
    this.#log("completion", "llm", { tokens: 12, ttftMs: 1 });
    return { text, stats: { mock: true, tokens: 12 } };
  }

  /** @param {{imagePath: string, prompt: string}} opts */
  async describeImage({ imagePath }) {
    const name = basename(imagePath);
    const text =
      `Simulated scene description for ${name}: a well-lit indoor setting with a few everyday ` +
      "objects on a table. Run with the real QVAC engine for genuine vision.";
    this.#log("completion", "vision", { tokens: 28, ttftMs: 2 });
    return { text, stats: { mock: true } };
  }

  /** @param {{imagePath: string}} opts */
  async ocr({ imagePath }) {
    const abs = resolvePath(this.cfg, imagePath);
    const sidecar = `${abs}.txt`;
    const text = existsSync(sidecar)
      ? readFileSync(sidecar, "utf8").trim()
      : "SAMPLE LABEL\nThis is simulated OCR text.\nUse the real engine for genuine recognition.";
    const blocks = text
      .split(/\n+/)
      .filter(Boolean)
      .map((line, i) => ({ text: line, confidence: 0.99, bbox: [0, i * 20, 100, i * 20 + 18] }));
    this.#log("ocr", "ocr", { input: this.logger.fingerprint(text), meta: { blocks: blocks.length } });
    return { blocks, text, stats: { mock: true } };
  }

  /** @param {{audioPath: string}} opts */
  async transcribe({ audioPath }) {
    const abs = resolvePath(this.cfg, audioPath);
    const sidecar = `${abs}.txt`;
    const text = existsSync(sidecar) ? readFileSync(sidecar, "utf8").trim() : "describe what is in front of me";
    this.#log("transcribe", "stt", { input: this.logger.fingerprint(text) });
    return { text, stats: { mock: true } };
  }

  /** @param {{text: string}} opts */
  async synthesize({ text }) {
    // Deterministic 0.2 s of silence at 16 kHz — exercises the audio path without a model.
    const sampleRate = 16000;
    const pcm = new Int16Array(Math.round(sampleRate * 0.2));
    this.#log("tts", "tts", { meta: { samples: pcm.length, sampleRate, simulatedSilence: true, chars: text.length } });
    return { pcm, sampleRate, stats: { mock: true } };
  }

  /** @param {{text: string, to?: string}} opts */
  async translate({ text, to }) {
    const target = to || this.cfg.models.translate.to;
    this.#log("translate", "translate", { meta: { to: target } });
    return { text: `[${target}] ${text}`, stats: { mock: true } };
  }

  /** @param {{text: string}} opts */
  async embed({ text }) {
    const dim = Math.min(this.cfg.models.embeddings.dim || 64, 64);
    const embedding = pseudoEmbedding(text, dim);
    this.#log("embed", "embeddings", { meta: { dim: embedding.length, simulated: true } });
    return { embedding, stats: { mock: true } };
  }

  async close() {
    this.logger.event({ op: "engine_close", engine: "mock", ok: true });
  }
}

/**
 * Deterministic, normalized pseudo-embedding derived from word + character
 * n-gram hashes. Including character trigrams means morphologically related
 * words ("park"/"parked") share signal — a more faithful simulation of subword
 * embeddings, so the personal-memory recall path is demonstrable offline.
 * @param {string} text
 * @param {number} dim
 * @returns {number[]}
 */
function pseudoEmbedding(text, dim) {
  const v = new Array(dim).fill(0);
  const norm = String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!norm) return v;
  /** @type {string[]} */
  const features = [];
  for (const tok of norm.split(/\s+/)) {
    features.push(tok); // whole word
    const padded = `#${tok}#`;
    for (let i = 0; i < padded.length - 2; i++) features.push(padded.slice(i, i + 3)); // char trigrams
  }
  for (const f of features) {
    const h = createHash("sha256").update(f).digest();
    for (let i = 0; i < dim; i++) v[i] += (h[i % h.length] - 128) / 128;
  }
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}
