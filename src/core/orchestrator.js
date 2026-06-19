/**
 * Orchestrator — routes a request to the right specialized skill ("agent").
 *
 * Routing is deterministic-first (see intents.js): a transparent classifier picks
 * the skill, the skill does the work, and every step is written to the audit log
 * with timing. Vision skills that are missing an image fail gracefully with a
 * spoken hint instead of erroring.
 */
import { classifyIntent } from "./intents.js";
import { describeScene } from "../skills/describe-scene.js";
import { readText } from "../skills/read-text.js";
import { identify } from "../skills/identify.js";
import { remember } from "../skills/remember.js";
import { recall } from "../skills/recall.js";
import { translateText } from "../skills/translate-text.js";
import { hazardCheck } from "../skills/hazard-check.js";

/** Intents that require an image to be useful. */
const NEEDS_IMAGE = new Set(["read", "identify", "hazard", "describe"]);

export class Orchestrator {
  /**
   * @param {{ engine: import("../engine/types.js").LanternEngine, logger: import("../logger.js").AuditLogger, memory: import("../memory/store.js").MemoryStore, cfg: import("../engine/types.js").LanternConfig }} deps
   */
  constructor({ engine, logger, memory, cfg }) {
    this.engine = engine;
    this.logger = logger;
    this.memory = memory;
    this.cfg = cfg;
    /** @type {import("../skills/types.js").SkillContext} */
    this.ctx = { engine, logger, memory, cfg };
  }

  /**
   * Handle a request (spoken/typed text and/or an image).
   * @param {{ text?: string, imagePath?: string|null, signal?: AbortSignal }} input
   * @returns {Promise<import("../engine/types.js").SkillResult & { intent: string, confidence: string }>}
   */
  async handle({ text = "", imagePath = null, signal } = {}) {
    const utterance = String(text || "").trim();
    const intentResult = classifyIntent(utterance);
    const { intent, slots, confidence } = intentResult;

    // Graceful guard: vision skills need a picture.
    if (NEEDS_IMAGE.has(intent) && !imagePath) {
      const speech = "I need a picture for that. Point your camera at it and try again.";
      this.logger.event({ op: "skill_skipped", skill: intent, engine: this.engine.kind, ok: true, meta: { reason: "no-image" } });
      return { skill: intent, speech, detail: "", data: {}, verified: true, warning: "", intent, confidence };
    }

    const elapsed = this.logger.startTimer();
    let result;
    try {
      result = await this.#route(intent, { utterance, imagePath, slots, signal });
    } catch (err) {
      this.logger.event({
        op: "skill_error",
        skill: intent,
        engine: this.engine.kind,
        ok: false,
        durationMs: elapsed(),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this.logger.event({
      op: "skill",
      skill: result.skill,
      intent,
      confidence,
      engine: this.engine.kind,
      durationMs: elapsed(),
      ok: true,
      meta: { verified: result.verified, hasImage: Boolean(imagePath), warned: Boolean(result.warning) },
    });

    return { ...result, intent, confidence };
  }

  /**
   * @param {string} intent
   * @param {{ utterance: string, imagePath: string|null, slots: any, signal?: AbortSignal }} args
   * @returns {Promise<import("../engine/types.js").SkillResult>}
   */
  #route(intent, { utterance, imagePath, slots, signal }) {
    const ctx = this.ctx;
    switch (intent) {
      case "read":
        return readText(ctx, {
          imagePath: /** @type {string} */ (imagePath),
          summarize: /summari[sz]e|long|too much|what.*about/i.test(utterance),
          signal,
        });
      case "translate":
        return translateText(ctx, {
          imagePath: imagePath || undefined,
          text: slots.note,
          to: slots.language,
          signal,
        });
      case "identify":
        return identify(ctx, { imagePath: /** @type {string} */ (imagePath), hint: identifyHint(utterance), signal });
      case "remember":
        return remember(ctx, { note: slots.note || utterance });
      case "recall":
        return recall(ctx, { query: utterance });
      case "hazard":
        return hazardCheck(ctx, { imagePath: /** @type {string} */ (imagePath), signal });
      case "describe":
      default:
        return describeScene(ctx, { imagePath: /** @type {string} */ (imagePath), signal });
    }
  }
}

/**
 * @param {string} utterance
 * @returns {"currency"|"medication"|undefined}
 */
function identifyHint(utterance) {
  if (/medicat|medicine|pill|tablet|dose|pharmac|prescription/i.test(utterance)) return "medication";
  if (/money|cash|\bnote\b|\bbill\b|currency|dollar|euro|pound|denomination|how much/i.test(utterance)) return "currency";
  return undefined;
}
