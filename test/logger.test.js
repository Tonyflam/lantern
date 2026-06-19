import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLogger } from "../src/logger.js";

function tmpLogger() {
  const dir = mkdtempSync(join(tmpdir(), "lantern-log-"));
  return new AuditLogger({ dir, console: false, root: dir, engine: "qvac" });
}

describe("audit logger — privacy by design", () => {
  it("fingerprint records size and a hash prefix, never the content", () => {
    const logger = tmpLogger();
    const fp = logger.fingerprint("a secret medical letter the user photographed");
    expect(fp).toBeTruthy();
    expect(fp.chars).toBe("a secret medical letter the user photographed".length);
    expect(fp.sha256_8).toMatch(/^[0-9a-f]{8}$/);
    // The raw text must not appear anywhere in the fingerprint.
    expect(JSON.stringify(fp)).not.toContain("secret");
  });

  it("tags every event with the engine and a session id", () => {
    const logger = tmpLogger();
    const line = logger.event({ op: "test", ok: true });
    expect(line.engine).toBe("qvac");
    expect(line.sessionId).toBeTruthy();
    expect(line.ts).toBeTruthy();
  });

  it("notifies live subscribers and supports unsubscribe", () => {
    const logger = tmpLogger();
    /** @type {any[]} */
    const seen = [];
    const off = logger.subscribe((l) => seen.push(l));
    logger.event({ op: "one", ok: true });
    off();
    logger.event({ op: "two", ok: true });
    const ops = seen.map((l) => l.op);
    expect(ops).toContain("one");
    expect(ops).not.toContain("two");
  });

  it("a throwing subscriber never breaks logging", () => {
    const logger = tmpLogger();
    logger.subscribe(() => {
      throw new Error("boom");
    });
    expect(() => logger.event({ op: "safe", ok: true })).not.toThrow();
  });
});
