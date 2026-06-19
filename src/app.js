/**
 * Application bootstrap shared by the web and CLI modes: build the engine,
 * load personal memory, and wire up the orchestrator.
 */
import { createEngine } from "./engine/engine-factory.js";
import { MemoryStore } from "./memory/store.js";
import { Orchestrator } from "./core/orchestrator.js";
import { resolvePath } from "./config.js";

/**
 * @param {{ cfg: import("./engine/types.js").LanternConfig, logger: import("./logger.js").AuditLogger }} deps
 */
export async function createApp({ cfg, logger }) {
  const engine = createEngine(cfg, logger);
  await engine.init();

  const memory = new MemoryStore(resolvePath(cfg, cfg.memory.store)).load();
  const orchestrator = new Orchestrator({ engine, logger, memory, cfg });

  return {
    engine,
    memory,
    orchestrator,
    async close() {
      try {
        await engine.close?.();
      } finally {
        logger.end();
      }
    },
  };
}
