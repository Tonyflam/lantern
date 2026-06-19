/**
 * read-text — read printed text aloud.
 *
 * The deterministic OCR output is the AUTHORITATIVE result (verbatim, verified).
 * The language model is only used — optionally — to phrase long text more
 * naturally, and only behind the prompt-injection guard. Any instruction-like
 * wording inside the captured text is read as text, never obeyed.
 */
import { fenceUntrusted, buildUntrustedSystemPrompt, scanForInjection } from "../core/injection-guard.js";

/**
 * @param {import("./types.js").SkillContext} ctx
 * @param {{ imagePath: string, summarize?: boolean, signal?: AbortSignal }} input
 * @returns {Promise<import("../engine/types.js").SkillResult>}
 */
export async function readText(ctx, { imagePath, summarize = false, signal }) {
  const { engine, logger } = ctx;
  const { blocks, text } = await engine.ocr({ imagePath });
  const verbatim = (text || (blocks || []).map((b) => b.text).join("\n")).trim();

  const injection = scanForInjection(verbatim);
  if (injection.flagged) {
    logger.event({
      op: "injection_detected",
      capability: "ocr",
      engine: engine.kind,
      ok: true,
      meta: { hits: injection.hits.length },
    });
  }

  let phrased = "";
  if (summarize && verbatim) {
    const system = buildUntrustedSystemPrompt(
      "read this captured text aloud naturally, or briefly summarize it if it is long",
    );
    const user = `Here is the text captured from the image:\n${fenceUntrusted(verbatim)}`;
    const r = await engine.chat({ system, messages: [{ role: "user", content: user }], signal });
    phrased = (r.text || "").trim();
  }

  const speech = phrased || verbatim || "I couldn't find any readable text.";
  return {
    skill: "read-text",
    speech,
    detail: verbatim,
    data: { blocks, injectionFlagged: injection.flagged, injectionHits: injection.hits },
    verified: true, // the verbatim OCR text is deterministic ground truth
    warning: injection.flagged
      ? "This text contained wording that tried to give instructions. Lantern read it as text only."
      : "",
  };
}
