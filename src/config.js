/**
 * Lantern configuration loader.
 *
 * Loads config/lantern.config.json, applies environment overrides (incl. a tiny
 * dependency-free .env reader), validates the result, and resolves paths.
 *
 * No external dependencies — keeping install/reproducibility bulletproof.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the project root. */
export const ROOT = resolve(__dirname, "..");

/**
 * Minimal .env reader. Only sets keys that are not already present in the
 * environment (real env wins). Supports `KEY=value` and quoted values.
 */
function loadDotEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/**
 * Load and validate the Lantern configuration with environment overrides.
 * @returns {import("./engine/types.js").LanternConfig}
 */
export function loadConfig() {
  loadDotEnv();

  const configPath = process.env.LANTERN_CONFIG
    ? resolve(process.env.LANTERN_CONFIG)
    : join(ROOT, "config", "lantern.config.json");

  if (!existsSync(configPath)) {
    throw new Error(`Lantern config not found at: ${configPath}`);
  }

  /** @type {any} */
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));

  // ── Environment overrides ──────────────────────────────────────────────
  if (process.env.LANTERN_ENGINE) cfg.engine = process.env.LANTERN_ENGINE;
  if (process.env.LANTERN_DEVICE) cfg.device = process.env.LANTERN_DEVICE;

  cfg.server = cfg.server || {};
  if (process.env.LANTERN_HOST) cfg.server.host = process.env.LANTERN_HOST;
  if (process.env.LANTERN_PORT) cfg.server.port = Number(process.env.LANTERN_PORT);

  cfg.p2p = cfg.p2p || {};
  if (process.env.LANTERN_DELEGATE_VISION !== undefined && process.env.LANTERN_DELEGATE_VISION !== "") {
    cfg.p2p.delegateVision = process.env.LANTERN_DELEGATE_VISION === "true";
  }
  if (process.env.LANTERN_PROVIDER_PUBLIC_KEY) {
    cfg.p2p.providerPublicKey = process.env.LANTERN_PROVIDER_PUBLIC_KEY;
  }

  validateConfig(cfg);

  cfg.__root = ROOT;
  cfg.__path = configPath;
  return cfg;
}

/** @param {any} cfg */
function validateConfig(cfg) {
  /** @type {string[]} */
  const errors = [];

  if (!["qvac", "mock"].includes(cfg.engine)) {
    errors.push(`engine must be "qvac" or "mock" (got ${JSON.stringify(cfg.engine)})`);
  }
  if (!["gpu", "cpu"].includes(cfg.device)) {
    errors.push(`device must be "gpu" or "cpu" (got ${JSON.stringify(cfg.device)})`);
  }

  if (!cfg.models || typeof cfg.models !== "object") {
    errors.push("models block is missing");
  } else {
    for (const cap of ["llm", "vision", "ocr", "stt", "tts", "embeddings", "translate"]) {
      if (!cfg.models[cap] || !cfg.models[cap].src) {
        errors.push(`models.${cap}.src is missing`);
      }
    }
    if (cfg.models.vision && !cfg.models.vision.projection) {
      errors.push("models.vision.projection (mmproj) is required for multimodal");
    }
  }

  const port = cfg.server?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`server.port is invalid (${port})`);
  }

  if (errors.length) {
    throw new Error("Invalid Lantern configuration:\n  - " + errors.join("\n  - "));
  }
}

/**
 * Resolve a possibly-relative path against the project root.
 * @param {import("./engine/types.js").LanternConfig} cfg
 * @param {string} p
 */
export function resolvePath(cfg, p) {
  return isAbsolute(p) ? p : join(cfg.__root, p);
}
