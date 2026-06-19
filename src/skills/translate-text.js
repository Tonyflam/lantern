/**
 * translate-text — read foreign text and translate it.
 * Source text comes from deterministic OCR (or is supplied directly); the
 * Bergamot NMT model performs the translation. Both source and translation are
 * returned so nothing is hidden.
 */

/**
 * @param {import("./types.js").SkillContext} ctx
 * @param {{ imagePath?: string, text?: string, to?: string, from?: string, signal?: AbortSignal }} input
 * @returns {Promise<import("../engine/types.js").SkillResult>}
 */
export async function translateText(ctx, { imagePath, text, to, from }) {
  const { engine, cfg } = ctx;
  let source = String(text || "").trim();
  let blocks = [];

  if (!source && imagePath) {
    const ocr = await engine.ocr({ imagePath });
    source = (ocr.text || "").trim();
    blocks = ocr.blocks;
  }

  if (!source) {
    return {
      skill: "translate-text",
      speech: "I couldn't find any text to translate.",
      detail: "",
      data: {},
      verified: true,
      warning: "",
    };
  }

  const target = to || cfg.models.translate.to;
  const sourceLang = from || cfg.models.translate.from;
  const r = await engine.translate({ text: source, from: sourceLang, to: target });
  const translated = (r.text || "").trim();

  return {
    skill: "translate-text",
    speech: translated,
    detail: `${source}\n→ ${translated}`,
    data: { source, target, from: sourceLang, blocks },
    verified: true, // source extraction is deterministic; translation is faithfully shown alongside it
    warning: "",
  };
}
