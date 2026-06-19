/**
 * recall — answer "what did I note about …?" by semantic search over the
 * personal memory store. Lantern speaks the stored note VERBATIM, so it cannot
 * hallucinate a memory that was never saved.
 */

/**
 * @param {import("./types.js").SkillContext} ctx
 * @param {{ query: string, signal?: AbortSignal }} input
 * @returns {Promise<import("../engine/types.js").SkillResult>}
 */
export async function recall(ctx, { query }) {
  const { engine, memory, cfg } = ctx;
  const q = String(query || "").trim();
  const { embedding } = await engine.embed({ text: q });
  const hits = memory.search(embedding, cfg.memory.topK, cfg.memory.minScore);

  if (!hits.length) {
    return {
      skill: "recall",
      speech: "I don't have a note about that yet.",
      detail: "",
      data: { hits: [] },
      verified: true,
      warning: "",
    };
  }

  const top = hits[0].item;
  const others = hits.slice(1).map((h) => h.item.text);
  let speech = `You noted: ${top.text}.`;
  if (others.length) speech += ` I also have: ${others.join("; ")}.`;

  return {
    skill: "recall",
    speech,
    detail: hits.map((h) => `${Math.round(h.score * 100)}% — ${h.item.text}`).join("\n"),
    data: { hits: hits.map((h) => ({ text: h.item.text, score: h.score, ts: h.item.ts })) },
    verified: true, // the spoken answer is the literal stored note
    warning: "",
  };
}
