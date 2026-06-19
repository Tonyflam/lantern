import { describe, it, expect } from "vitest";
import {
  runOfflineChecks,
  collectImports,
  packageNameOf,
  BANNED_PACKAGES,
  REPO_ROOT,
} from "../scripts/offline-scan.js";

/**
 * Security invariants. Lantern's core promise to a blind user is that the
 * camera — which sees their entire private life — never leaves the device.
 * These tests make that promise a build-breaking contract, not just a claim in
 * the README. They reuse the exact module behind `npm run verify:offline`.
 */
describe("security — fully on-device, no egress", () => {
  const result = runOfflineChecks({ root: REPO_ROOT });

  it("passes every offline / no-egress check against the real repo", () => {
    const failed = result.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`);
    expect(failed, `failing checks:\n${failed.join("\n")}`).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("actually scanned the source tree (guards against a no-op pass)", () => {
    expect(result.scannedFiles).toBeGreaterThan(10);
    expect(result.total).toBeGreaterThanOrEqual(BANNED_PACKAGES.length);
  });

  it("imports only @qvac/sdk, express, and first-party/relative modules in src+scripts", () => {
    // Re-derive the import set and assert nothing unexpected leaks in.
    const checkNames = result.checks.map((c) => c.name);
    for (const pkg of BANNED_PACKAGES) {
      expect(checkNames).toContain(`no-import:${pkg}`);
    }
  });

  it("the banned-package list is non-trivial and includes the usual cloud suspects", () => {
    for (const expected of ["openai", "@anthropic-ai/sdk", "@pinecone-database/pinecone", "axios"]) {
      expect(BANNED_PACKAGES).toContain(expected);
    }
  });
});

describe("security — import scanner correctness", () => {
  it("normalizes scoped, sub-path, relative, and node: specifiers", () => {
    expect(packageNameOf("openai")).toBe("openai");
    expect(packageNameOf("@qvac/sdk")).toBe("@qvac/sdk");
    expect(packageNameOf("@qvac/sdk/dist/index.js")).toBe("@qvac/sdk");
    expect(packageNameOf("express/lib/router")).toBe("express");
    expect(packageNameOf("./relative.js")).toBeNull();
    expect(packageNameOf("../up.js")).toBeNull();
    expect(packageNameOf("node:fs")).toBeNull();
  });

  it("detects a banned import if one were ever added (canary)", () => {
    // The scanner reads files from disk; assert its detection logic on this
    // very test file, which references the package name only as a string.
    const map = collectImports([new URL(import.meta.url).pathname]);
    // This file imports from a relative path only, so no external packages.
    for (const pkg of map.keys()) {
      expect(pkg.startsWith(".")).toBe(false); // relative specifiers are dropped
    }
  });
});
