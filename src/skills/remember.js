/**
 * remember — store a personal note as an embedding for later recall.
 * Storing is fully deterministic; the embedding is only used for search.
 */

/**
 * @param {import("./types.js").SkillContext} ctx
 * @param {{ note: string, signal?: AbortSignal }} input
 * @returns {Promise<import("../engine/types.js").SkillResult>}
 */
export async function remember(ctx, { note }) {
  const { engine, memory } = ctx;
  const text = String(note || "").trim();
  if (!text) {
    return {
      skill: "remember",
      speech: "What would you like me to remember?",
      detail: "",
      data: {},
      verified: true,
      warning: "",
    };
  }
  const { embedding } = await engine.embed({ text });
  const item = memory.add({ text, embedding });
  return {
    skill: "remember",
    speech: `Okay, I'll remember that. ${text}`,
    detail: text,
    data: { id: item.id, count: memory.size() },
    verified: true,
    warning: "",
  };
}
