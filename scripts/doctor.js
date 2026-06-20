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

// Vulkan loader — QVAC's native llama.cpp worker links the Vulkan backend and
// needs libvulkan.so.1 present on Linux EVEN IN CPU MODE. Without it the worker
// aborts (SIGABRT) and you see a cryptic RPC init timeout. This check turns that
// hard-to-diagnose failure into a one-line fix.
checkVulkan();

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

/**
 * Verify the Vulkan loader is available. QVAC's native worker requires it on
 * Linux/Windows even when running on CPU; macOS uses Metal and does not.
 */
function checkVulkan() {
  if (process.platform === "darwin") {
    line(PASS, "Vulkan loader", "not required on macOS (QVAC uses Metal)");
    return;
  }

  if (process.platform === "win32") {
    const sysRoot = process.env.SystemRoot || "C:\\Windows";
    const loader = join(sysRoot, "System32", "vulkan-1.dll");
    if (existsSync(loader)) {
      // Loader present — try to confirm a usable device (hardware or software).
      try {
        const info = execFileSync("vulkaninfo", ["--summary"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const m = info.match(/deviceName\s*=\s*(.+)/);
        const dev = m ? m[1].trim() : "device detected";
        const software = /llvmpipe|lavapipe|SwiftShader/i.test(info);
        line(PASS, "Vulkan loader", `vulkan-1.dll present — ${dev}${software ? " (software fallback, slower)" : ""}`);
      } catch {
        line(
          PASS,
          "Vulkan loader",
          "vulkan-1.dll present. If a real run aborts with an RPC timeout, update your GPU driver " +
            "(Intel/AMD/NVIDIA — integrated GPUs count) so a Vulkan device is available.",
        );
      }
      return;
    }
    line(
      FAIL,
      "Vulkan loader",
      "vulkan-1.dll missing — QVAC's native worker needs it even on CPU. " +
        "Install or update your GPU driver (Intel/AMD/NVIDIA — integrated GPUs count), or install the " +
        "LunarG Vulkan Runtime. With no Vulkan-capable GPU at all, add Mesa lavapipe (software fallback).",
    );
    return;
  }

  // Linux: is the loader library on the system?
  let loaderFound = false;
  try {
    const out = execFileSync("ldconfig", ["-p"], { encoding: "utf8" });
    loaderFound = /libvulkan\.so\.1/.test(out);
  } catch {
    // ldconfig missing (e.g. Windows) — fall back to known file locations.
    loaderFound = [
      "/lib/x86_64-linux-gnu/libvulkan.so.1",
      "/usr/lib/x86_64-linux-gnu/libvulkan.so.1",
      "/usr/lib/libvulkan.so.1",
    ].some((p) => existsSync(p));
  }

  if (!loaderFound) {
    line(
      FAIL,
      "Vulkan loader",
      "libvulkan.so.1 missing — QVAC's native worker needs it even on CPU. " +
        "On Debian/Ubuntu: sudo apt-get install -y libvulkan1 mesa-vulkan-drivers",
    );
    return;
  }

  // Loader present — see if any device (hardware or software) is usable.
  try {
    const info = execFileSync("vulkaninfo", ["--summary"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const m = info.match(/deviceName\s*=\s*(.+)/);
    const dev = m ? m[1].trim() : "device detected";
    const software = /llvmpipe|lavapipe|SwiftShader/i.test(info);
    line(PASS, "Vulkan loader", `libvulkan.so.1 present — ${dev}${software ? " (software fallback, slower)" : ""}`);
  } catch {
    // Loader is there but no enumerable device / vulkan-tools not installed.
    line(
      WARN,
      "Vulkan loader",
      "libvulkan.so.1 present but no device enumerated. If a real run aborts, install a driver " +
        "(GPU vendor driver, or mesa-vulkan-drivers for a software fallback).",
    );
  }
}

