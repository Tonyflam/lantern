#!/usr/bin/env node
/**
 * lantern bench — measure latency and throughput of the configured engine.
 *
 * Reports time-to-first-token (TTFT) and tokens/second for chat, plus wall-clock
 * latency for OCR, embeddings, and TTS. With the real QVAC engine these are
 * genuine on-device numbers you can cite in your write-up; with the mock engine
 * they only exercise the plumbing (and are clearly labelled as such).
 *
 *   npm run bench
 *   LANTERN_ENGINE=mock npm run bench   # plumbing only
 */
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { AuditLogger } from "../src/logger.js";
import { createEngine } from "../src/engine/engine-factory.js";

const ITER = Number(process.env.LANTERN_BENCH_ITER || 3);
const cfg = loadConfig();
const logger = new AuditLogger({ dir: cfg.logging.dir, console: false, root: cfg.__root, engine: cfg.engine });
const engine = createEngine(cfg, logger);
await engine.init();

// Use the committed sample medication label: the mock engine reads its sidecar
// .txt, the real engine OCRs the actual PNG.
const img = join(cfg.__root, "src", "data", "samples", "sample-med.png");

console.log(`\n=== Lantern bench (${cfg.engine} engine, device=${cfg.device}, ${ITER} iters) ===`);
if (cfg.engine === "mock") console.log("  NOTE: mock engine — these numbers measure plumbing only, not real inference.\n");

/**
 * @param {string} label
 * @param {() => Promise<any>} fn
 * @param {(r:any)=>string} [extra]
 */
async function bench(label, fn, extra) {
  /** @type {number[]} */
  const times = [];
  let last;
  for (let i = 0; i < ITER; i++) {
    const t0 = performance.now();
    last = await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  const p50 = times[Math.floor(times.length / 2)];
  console.log(`  ${label.padEnd(14)} mean ${mean.toFixed(1)}ms · p50 ${p50.toFixed(1)}ms${extra ? " · " + extra(last) : ""}`);
}

await bench(
  "chat",
  () => engine.chat({ system: "Reply in one short sentence.", messages: [{ role: "user", content: "Say hello to a friend." }] }),
  (r) => `ttft ${r?.stats?.ttftMs ?? "?"}ms · ${r?.stats?.tokensPerSecond ?? "?"} tok/s`,
);
await bench("ocr", () => engine.ocr({ imagePath: img }), (r) => `${r?.blocks?.length ?? 0} blocks`);
await bench("embed", () => engine.embed({ text: "the quick brown fox jumps over the lazy dog" }), (r) => `dim ${r?.embedding?.length ?? 0}`);
await bench("tts", () => engine.synthesize({ text: "This is a short spoken sentence." }), (r) => `${r?.pcm?.length ?? 0} samples`);

await engine.close();
console.log("\nDone. (Real audit metrics are also appended to your logs/ directory.)\n");
