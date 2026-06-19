/**
 * Lantern audit logger.
 *
 * Writes one JSON object per line (JSONL) to logs/lantern-<date>.jsonl for every
 * model load/unload and every inference, with timing and throughput metrics.
 *
 * PRIVACY BY DESIGN: the audit log NEVER stores user content (no transcripts,
 * no image bytes, no recognized text). At most it records a content-free
 * fingerprint (character count + an 8-char SHA-256 prefix) so runs are
 * verifiable without leaking what the user saw, said, or read.
 *
 * Every line carries `"engine": "qvac"` for real on-device inference or
 * `"engine": "mock"` for the offline simulation, so the two can never be
 * confused when evaluating evidence.
 */
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export class AuditLogger {
  /**
   * @param {Object} opts
   * @param {string} [opts.dir]      Directory for log files (relative to root).
   * @param {boolean} [opts.console] Also pretty-print to the console.
   * @param {string} [opts.root]     Project root for resolving `dir`.
   * @param {"qvac"|"mock"} [opts.engine] Default engine tag for events.
   */
  constructor({ dir = "logs", console: toConsole = true, root = process.cwd(), engine = "qvac" } = {}) {
    this.dir = join(root, dir);
    this.toConsole = toConsole;
    this.engine = engine;
    this.sessionId = randomUUID();
    this.startedAt = new Date().toISOString();
    /** @type {Set<(line: Record<string, any>) => void>} Live subscribers (e.g. the UI activity stream). */
    this.subscribers = new Set();

    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    this.file = join(this.dir, `lantern-${this.startedAt.slice(0, 10)}.jsonl`);

    this.event({
      op: "session_start",
      ok: true,
      meta: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  }

  /**
   * Content-free fingerprint of an input. Records *how much* without recording *what*.
   * @param {unknown} input
   * @returns {{chars: number, sha256_8: string} | undefined}
   */
  fingerprint(input) {
    if (input == null) return undefined;
    const str = typeof input === "string" ? input : JSON.stringify(input);
    return {
      chars: str.length,
      sha256_8: createHash("sha256").update(str).digest("hex").slice(0, 8),
    };
  }

  /** Start a high-resolution timer; returns a function that yields elapsed ms. */
  startTimer() {
    const t0 = performance.now();
    return () => Math.round(performance.now() - t0);
  }

  /**
   * Append a structured event to the audit log (and optionally the console).
   * @param {Record<string, unknown>} record
   */
  event(record) {
    const line = {
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      engine: record.engine ?? this.engine,
      ...record,
    };
    try {
      appendFileSync(this.file, JSON.stringify(line) + "\n");
    } catch (err) {
      if (this.toConsole) {
        console.error("[audit] failed to write log line:", /** @type {Error} */ (err)?.message);
      }
    }
    if (this.toConsole) this.#pretty(line);
    for (const cb of this.subscribers) {
      try {
        cb(line);
      } catch {
        /* a broken subscriber must never break logging */
      }
    }
    return line;
  }

  /**
   * Subscribe to live audit events (content-free). Returns an unsubscribe fn.
   * @param {(line: Record<string, any>) => void} cb
   * @returns {() => void}
   */
  subscribe(cb) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  /** Record a graceful shutdown marker. */
  end() {
    this.event({ op: "session_end", ok: true });
  }

  /** @param {Record<string, any>} line */
  #pretty(line) {
    const tag = line.engine === "mock" ? "MOCK" : "qvac";
    const op = line.op || "event";
    const bits = [];
    if (line.capability) bits.push(line.capability);
    if (line.model) bits.push(line.model);
    if (line.device) bits.push(line.device + (line.delegated ? " (p2p)" : ""));
    if (line.durationMs != null) bits.push(`${line.durationMs}ms`);
    if (line.ttftMs != null) bits.push(`ttft ${line.ttftMs}ms`);
    if (line.tokens != null) bits.push(`${line.tokens} tok`);
    if (line.tokensPerSecond != null) bits.push(`${line.tokensPerSecond} tok/s`);
    if (line.ok === false) bits.push(`ERROR: ${line.error}`);
    console.log(`[${tag}] ${op}${bits.length ? " · " + bits.join(" · ") : ""}`);
  }
}

export { randomUUID };
