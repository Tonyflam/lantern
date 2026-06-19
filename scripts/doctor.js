#!/usr/bin/env node
/**
 * lantern doctor — environment & readiness check.
 *
 * Verifies Node version, ffmpeg/ffplay (for voice), the QVAC SDK, GPU hints,
 * config validity, and the model cache. Prints a clear PASS/WARN/FAIL report so
 * a judge or user can confirm their machine is ready before recording a demo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig } from "../src/config.js";
import { hasFfmpeg, hasFfplay } from "../src/engine/audio-utils.js";

const PASS = "✅";
const WARN = "⚠️ ";
const FAIL = "❌";
let warnings = 0;
let failures = 0;

/** @param {string} mark @param {string} label @param {string} [detail] */
function line(mark, label, detail = "") {
  if (mark === WARN) warnings++;
  if (mark === FAIL) failures++;
  console.log(`  ${mark} ${label}${detail ? " — " + detail : ""}`);
}

console.log("\nLantern doctor — checking your environment\n");

// Node version
const major = Number(process.versions.node.split(".")[0]);
line(major >= 22 ? PASS : FAIL, `Node.js ${process.version}`, major >= 22 ? "" : "QVAC needs Node >= 22.17");

// npm
try {
  const npmV = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
  line(PASS, `npm ${npmV}`);
} catch {
  line(WARN, "npm not detected on PATH");
}

// ffmpeg / ffplay (voice)
line(hasFfmpeg() ? PASS : WARN, "ffmpeg", hasFfmpeg() ? "" : "needed for microphone/voice input; install to enable voice");
line(hasFfplay() ? PASS : WARN, "ffplay", hasFfplay() ? "" : "needed to play spoken replies on the CLI");

// QVAC SDK
try {
  await import("@qvac/sdk");
  line(PASS, "@qvac/sdk", "loadable — real on-device inference available");
} catch (err) {
  line(WARN, "@qvac/sdk", "not loadable here; use LANTERN_ENGINE=mock or install on supported hardware");
  if (process.env.LANTERN_DOCTOR_VERBOSE) console.log("     " + (err instanceof Error ? err.message : String(err)));
}

// GPU hint (best-effort, non-fatal)
let gpuHint = "unknown";
try {
  if (process.platform === "linux" && existsSync("/dev/nvidia0")) gpuHint = "NVIDIA device present";
  else if (process.platform === "darwin") gpuHint = "Apple Silicon / Metal likely";
  else gpuHint = "no obvious discrete GPU; CPU is fine (set LANTERN_DEVICE=cpu)";
} catch {
  /* ignore */
}
line(PASS, "GPU hint", gpuHint);

// Config
try {
  const cfg = loadConfig();
  line(PASS, "Config", `engine=${cfg.engine}, device=${cfg.device}, port=${cfg.server.port}`);

  // Model cache
  const cacheDir = process.env.QVAC_MODELS_DIR || join(homedir(), ".qvac", "models");
  if (existsSync(cacheDir)) {
    let bytes = 0;
    let count = 0;
    for (const f of walk(cacheDir)) {
      try {
        bytes += statSync(f).size;
        count++;
      } catch {
        /* ignore */
      }
    }
    line(PASS, "Model cache", `${count} files, ${(bytes / 1e9).toFixed(2)} GB at ${cacheDir}`);
  } else {
    line(WARN, "Model cache", `empty (models download on first real run) — ${cacheDir}`);
  }
} catch (err) {
  line(FAIL, "Config", err instanceof Error ? err.message : String(err));
}

console.log("");
if (failures) {
  console.log(`${FAIL} ${failures} blocking issue(s). Fix these before a real run.\n`);
  process.exit(1);
} else if (warnings) {
  console.log(`${WARN}Ready with ${warnings} note(s). Mock mode works now; address notes for full real-engine + voice.\n`);
} else {
  console.log(`${PASS} All good. You're ready for a real on-device run.\n`);
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}
