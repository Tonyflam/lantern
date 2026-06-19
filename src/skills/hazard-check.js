/**
 * hazard-check — an explicit "is it safe ahead?" scan.
 * The vision model lists what it sees; the deterministic rule layer decides what
 * counts as a hazard and what advice to give.
 */
import { scanHazards, hazardSpeech } from "../core/safety.js";

/**
 * @param {import("./types.js").SkillContext} ctx
 * @param {{ imagePath: string, signal?: AbortSignal }} input
 * @returns {Promise<import("../engine/types.js").SkillResult>}
 */
export async function hazardCheck(ctx, { imagePath, signal }) {
  const ask =
    "List, literally and specifically, anything here that could be a safety hazard for a blind person walking: steps, edges or drops, fire or flames, hot items, sharp items, traffic or vehicles, obstacles on the floor, or wet floor. If there are none, say so.";
  const { text } = await ctx.engine.describeImage({ imagePath, prompt: ask, signal });
  const description = (text || "").trim();
  const scan = scanHazards(description);
  const speech = scan.hazards.length
    ? hazardSpeech(scan)
    : "I don't see an obvious hazard, but please stay careful.";
  return {
    skill: "hazard-check",
    speech,
    detail: description,
    data: { hazards: scan.hazards, topSeverity: scan.topSeverity },
    verified: scan.hazards.length > 0, // hazard decision is rule-based
    warning: scan.topSeverity === "high" ? "A high-severity hazard was detected." : "",
  };
}
