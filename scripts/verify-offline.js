#!/usr/bin/env node
/**
 * `npm run verify:offline` — prove Lantern is fully on-device.
 *
 * Statically audits the repository for any cloud-AI, hosted vector-DB, cloud
 * speech, telemetry, or outbound-HTTP dependency, and confirms the server binds
 * loopback and P2P always falls back to local. Prints a per-check report and
 * exits non-zero if anything fails, so it can gate CI.
 *
 * Runs with zero network access and no third-party packages.
 */
import { runOfflineChecks } from "./offline-scan.js";

const { checks, ok, scannedFiles, passed, total } = runOfflineChecks();

console.log(`\nLantern offline / no-egress audit — scanned ${scannedFiles} source file(s)\n`);
for (const c of checks) {
  const mark = c.ok ? "✓" : "✗";
  const pad = c.name.padEnd(34, " ");
  console.log(`  ${mark} ${pad} ${c.detail}`);
}
console.log(`\n${passed}/${total} offline checks passed.`);

if (!ok) {
  console.error("\n✗ Offline guarantee FAILED — an off-device dependency or non-loopback binding was found.\n");
  process.exit(1);
}
console.log("✓ Fully on-device: no cloud AI, no telemetry, loopback-only, local P2P fallback.\n");
