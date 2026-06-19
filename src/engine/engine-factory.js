/**
 * Engine factory — selects the real QVAC backend or the offline mock.
 */
import { QvacEngine } from "./qvac-engine.js";
import { MockEngine } from "./mock-engine.js";

/**
 * @param {import("./types.js").LanternConfig} cfg
 * @param {import("../logger.js").AuditLogger} logger
 * @returns {import("./types.js").LanternEngine}
 */
export function createEngine(cfg, logger) {
  if (cfg.engine === "mock") return /** @type {any} */ (new MockEngine(cfg, logger));
  return /** @type {any} */ (new QvacEngine(cfg, logger));
}
