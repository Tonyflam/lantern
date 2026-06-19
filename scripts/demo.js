#!/usr/bin/env node
/**
 * lantern demo — a scripted, end-to-end walkthrough that exercises every skill
 * and writes REAL audit-log lines to logs/. Use it to (a) sanity-check an
 * install and (b) generate genuine evidence for the submission.
 *
 *   npm run demo               # uses the configured engine (qvac by default)
 *   LANTERN_ENGINE=mock npm run demo   # offline simulation, no models needed
 *
 * Image/OCR/STT steps use small fixtures under src/data/samples. With the mock
 * engine, OCR/STT read the sidecar .txt fixtures so the walkthrough is
 * deterministic; with the real engine they run actual models.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { AuditLogger } from "../src/logger.js";
import { createApp } from "../src/app.js";

const cfg = loadConfig();
// Use an isolated, throwaway memory store so the walkthrough is deterministic
// and never accumulates duplicates from earlier runs.
const memDir = mkdtempSync(join(tmpdir(), "lantern-demo-mem-"));
cfg.memory = { ...cfg.memory, store: join(memDir, "memory-store.json") };
const logger = new AuditLogger({ dir: cfg.logging.dir, console: true, root: cfg.__root, engine: cfg.engine });
const app = await createApp({ cfg, logger });

const banner = cfg.engine === "mock" ? "  (SIMULATION — mock engine)\n" : "  (real QVAC on-device engine)\n";
console.log("\n=== Lantern demo walkthrough ===");
console.log(banner);

// Use the committed sample images under src/data/samples. Each has a sidecar
// .txt with the exact printed text: the mock engine reads the sidecar so the
// walkthrough is deterministic, while the real engine OCRs / sees the actual PNG.
const samples = join(cfg.__root, "src", "data", "samples");
const noteImg = join(samples, "sample-note.png");
const signImg = join(samples, "sample-sign.png");
const medImg = join(samples, "sample-med.png");
const evilImg = join(samples, "sample-evil.png");

/** @type {Array<{title:string, text?:string, image?:string|null}>} */
const steps = [
  { title: "Describe the scene", text: "what is in front of me", image: signImg },
  { title: "Read text aloud", text: "read this", image: signImg },
  { title: "Identify currency (verified)", text: "how much money is this", image: noteImg },
  { title: "Identify medication (verified + disclaimer)", text: "what medication is this", image: medImg },
  { title: "Check for hazards", text: "is it safe ahead", image: signImg },
  { title: "Remember a personal note", text: "remember I parked in section B12", image: null },
  { title: "Recall it later", text: "where did I park", image: null },
  { title: "Prompt-injection resistance", text: "read this", image: evilImg },
];

let i = 1;
for (const step of steps) {
  console.log(`\n[${i++}/${steps.length}] ${step.title}`);
  const r = await app.orchestrator.handle({ text: step.text, imagePath: step.image });
  console.log(`     intent=${r.intent} skill=${r.skill} verified=${r.verified}`);
  console.log(`     → ${r.speech}`);
  if (r.warning) console.log(`     ⚠ ${r.warning}`);
}

await app.close();
console.log(`\n✅ Demo complete. Real audit log written under: ${join(cfg.__root, cfg.logging.dir)}\n`);
