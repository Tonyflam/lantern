/**
 * describe-scene — the core "what's in front of me?" skill.
 * Vision model produces the description; the deterministic hazard layer scans
 * that description and appends a rule-based safety note.
 */
import { scanHazards, hazardSpeech } from "../core/safety.js";

/**
 * @param {import("./types.js").SkillContext} ctx
 * @param {{ imagePath: string, prompt?: string, signal?: AbortSignal }} input
 * @returns {Promise<import("../engine/types.js").SkillResult>}
 */
export async function describeScene(ctx, { imagePath, prompt, signal }) {
  const ask =
    prompt ||
    "Briefly describe what is in front of me for a blind person. Mention the most important things first, in two or three short sentences. Be literal and concrete.";
  const { text } = await ctx.engine.describeImage({ imagePath, prompt: ask, signal });
  const description = (text || "").trim();
  const scan = scanHazards(description);
  const safety = hazardSpeech(scan);
  const speech = safety ? `${description} ${safety}` : description;
  return {
    skill: "describe-scene",
    speech,
    detail: description,
    data: { hazards: scan.hazards, topSeverity: scan.topSeverity },
    verified: false, // the description is model-generated; the hazard layer is deterministic
    warning: scan.topSeverity === "high" ? "A high-severity hazard keyword was detected." : "",
  };
}
