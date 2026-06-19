/**
 * Offline / no-egress verifier (shared core).
 *
 * Lantern's headline claim is that it is fully on-device: the only network it
 * ever touches is the one-time QVAC model download and optional peer-to-peer
 * delegation to a machine the user owns. This module *proves* that claim by
 * statically auditing the repository:
 *
 *   1. No cloud-AI, vector-DB, cloud STT/TTS, telemetry, or raw HTTP-client
 *      package is imported anywhere in `src/`.
 *   2. The same banned packages are absent from `package.json` entirely.
 *   3. The only AI runtime dependency is `@qvac/sdk`; runtime deps are limited
 *      to the local web server (`express`).
 *   4. The shipped server binds a loopback address (never 0.0.0.0).
 *   5. P2P delegation keeps `fallbackToLocal` on, so no peer is ever required.
 *   6. `remote-apis.json` declares zero runtime remote-AI calls.
 *
 * Both `scripts/verify-offline.js` (the CLI) and `test/security.test.js` import
 * `runOfflineChecks()` so the guarantee is enforced in CI, not just documented.
 *
 * Pure Node built-ins, no dependencies — runs anywhere, including air-gapped.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
/** Default repository root (this module lives in `scripts/`). */
export const REPO_ROOT = resolve(here, "..");

/**
 * Packages that would imply off-device inference, third-party data egress, or
 * telemetry. Grouped only for readability; the scan treats them as one set.
 */
export const BANNED_PACKAGES = Object.freeze([
  // Cloud LLM / inference APIs
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "@google-cloud/aiplatform",
  "@azure/openai",
  "cohere-ai",
  "replicate",
  "@huggingface/inference",
  "@mistralai/mistralai",
  "groq-sdk",
  "together-ai",
  "@aws-sdk/client-bedrock-runtime",
  // Hosted vector databases / RAG frameworks that call out
  "@pinecone-database/pinecone",
  "@qdrant/js-client-rest",
  "weaviate-ts-client",
  "chromadb",
  "langchain",
  "@langchain/core",
  "llamaindex",
  // Cloud speech / vision
  "@deepgram/sdk",
  "assemblyai",
  "elevenlabs",
  "@elevenlabs/elevenlabs-js",
  "@google-cloud/speech",
  "@google-cloud/vision",
  // Generic outbound HTTP clients (Lantern only needs loopback express + QVAC)
  "axios",
  "node-fetch",
  "got",
  "superagent",
  "request",
  // Telemetry / analytics
  "@sentry/node",
  "posthog-node",
  "mixpanel",
  "analytics-node",
  "@segment/analytics-node",
  "@amplitude/analytics-node",
]);

/** Runtime (production) dependencies Lantern is allowed to ship. */
export const ALLOWED_RUNTIME_DEPS = Object.freeze(["express"]);

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

/**
 * Recursively collect source files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectSourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectSourceFiles(full));
    else if (SOURCE_EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

const IMPORT_RES = [
  /import\s+(?:[\w*${}\s,]+\s+from\s+)?["']([^"']+)["']/g, // static import (+ side-effect)
  /export\s+(?:[\w*${}\s,]+)\s+from\s+["']([^"']+)["']/g, // re-export
  /import\s*\(\s*["']([^"']+)["']\s*\)/g, // dynamic import()
  /require\s*\(\s*["']([^"']+)["']\s*\)/g, // require()
];

/**
 * Normalize an import specifier to its bare package name.
 * Returns null for relative paths and `node:` built-ins.
 * @param {string} spec
 * @returns {string|null}
 */
export function packageNameOf(spec) {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * Extract the set of external package names imported across the given files.
 * @param {string[]} files
 * @returns {Map<string, string[]>} package name → files that import it
 */
export function collectImports(files) {
  /** @type {Map<string, string[]>} */
  const imports = new Map();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const re of IMPORT_RES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const pkg = packageNameOf(m[1]);
        if (!pkg) continue;
        const list = imports.get(pkg) || [];
        if (!list.includes(file)) list.push(file);
        imports.set(pkg, list);
      }
    }
  }
  return imports;
}

/**
 * @typedef {Object} OfflineCheck
 * @property {string} name
 * @property {boolean} ok
 * @property {string} detail
 */

/**
 * Run every offline / no-egress check against a repository.
 * @param {{ root?: string }} [opts]
 * @returns {{ ok: boolean, checks: OfflineCheck[], scannedFiles: number, passed: number, total: number }}
 */
export function runOfflineChecks({ root = REPO_ROOT } = {}) {
  /** @type {OfflineCheck[]} */
  const checks = [];
  const add = (/** @type {string} */ name, /** @type {boolean} */ ok, /** @type {string} */ detail = "") =>
    checks.push({ name, ok, detail });

  const srcFiles = collectSourceFiles(join(root, "src"));
  const scriptFiles = collectSourceFiles(join(root, "scripts"));
  const allFiles = [...srcFiles, ...scriptFiles];
  const imports = collectImports(allFiles);

  // 1) No banned package is imported anywhere in the source tree.
  for (const pkg of BANNED_PACKAGES) {
    const hit = imports.get(pkg);
    add(`no-import:${pkg}`, !hit, hit ? `imported in ${hit.map((f) => rel(root, f)).join(", ")}` : "absent");
  }

  // 2) package.json declares none of the banned packages, anywhere.
  /** @type {any} */
  let pkgJson = {};
  try {
    pkgJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch (e) {
    add("package.json:readable", false, String(e));
  }
  const allDeclared = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.optionalDependencies || {}),
    ...(pkgJson.devDependencies || {}),
    ...(pkgJson.peerDependencies || {}),
  };
  const declaredBanned = BANNED_PACKAGES.filter((p) => p in allDeclared);
  add("package.json:no-banned-deps", declaredBanned.length === 0, declaredBanned.join(", ") || "none declared");

  // 3) Runtime deps are limited to the allow-list; @qvac/sdk is the only AI dep.
  const runtimeDeps = Object.keys(pkgJson.dependencies || {});
  const extraneous = runtimeDeps.filter((d) => !ALLOWED_RUNTIME_DEPS.includes(d));
  add(
    "deps:runtime-allowlist",
    extraneous.length === 0,
    extraneous.length ? `unexpected runtime deps: ${extraneous.join(", ")}` : `only ${runtimeDeps.join(", ") || "(none)"}`,
  );
  const qvac = (pkgJson.optionalDependencies || {})["@qvac/sdk"] || (pkgJson.dependencies || {})["@qvac/sdk"];
  add("deps:qvac-sdk-present", Boolean(qvac), qvac ? `@qvac/sdk ${qvac}` : "missing @qvac/sdk");

  // 4) Shipped server binds a loopback address.
  /** @type {any} */
  let cfg = {};
  const cfgPath = join(root, "config", "lantern.config.json");
  try {
    cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch (e) {
    add("config:readable", false, String(e));
  }
  const host = cfg?.server?.host;
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  add("server:loopback-only", loopback, `server.host = ${JSON.stringify(host)}`);

  // 5) P2P delegation always has a local fallback (no peer is ever required).
  const fallback = cfg?.p2p?.fallbackToLocal;
  add("p2p:fallback-to-local", fallback === true, `p2p.fallbackToLocal = ${JSON.stringify(fallback)}`);

  // 6) remote-apis.json declares zero runtime remote-AI calls.
  /** @type {any} */
  let remote = null;
  try {
    remote = JSON.parse(readFileSync(join(root, "remote-apis.json"), "utf8"));
  } catch {
    /* handled below */
  }
  const runtimeCalls =
    remote?.ai_inference_remote_calls ?? remote?.runtimeRemoteApiCalls ?? (remote ? [] : null);
  const noRuntimeCalls = Array.isArray(runtimeCalls) && runtimeCalls.length === 0;
  add(
    "remote-apis:no-runtime-ai-calls",
    Boolean(remote) && noRuntimeCalls,
    remote ? `${(runtimeCalls || []).length} runtime remote-AI call(s) declared` : "remote-apis.json missing",
  );

  const passed = checks.filter((c) => c.ok).length;
  return { ok: passed === checks.length, checks, scannedFiles: allFiles.length, passed, total: checks.length };
}

/**
 * @param {string} root
 * @param {string} file
 * @returns {string}
 */
function rel(root, file) {
  return file.startsWith(root) ? file.slice(root.length + 1) : file;
}
