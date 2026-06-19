/**
 * identify — "what is this?" with a deterministic-first strategy.
 *
 * Order of preference:
 *   1. Currency  — OCR the printed denomination and validate it against a known
 *      table (verified, not a model guess).
 *   2. Medication label — extract dose/frequency with regex and ALWAYS attach the
 *      safety disclaimer; flag high-alert drugs.
 *   3. General object — fall back to the vision model (clearly unverified), with
 *      any label text appended verbatim.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzeMedicationLabel } from "../core/safety.js";

const here = dirname(fileURLToPath(import.meta.url));
const currency = JSON.parse(
  readFileSync(join(here, "..", "data", "reference", "currency.json"), "utf8"),
);

/**
 * Deterministically detect a banknote from OCR text: a known denomination plus
 * a currency marker (symbol, ISO code, or name).
 * @param {string} ocrText
 */
function detectCurrency(ocrText) {
  const text = String(ocrText || "");
  for (const [code, info] of Object.entries(currency.currencies)) {
    const firstWord = info.name.split(" ")[0];
    const hasMarker =
      text.includes(info.symbol) ||
      new RegExp(`\\b${code}\\b`).test(text) ||
      new RegExp(firstWord, "i").test(text);
    if (!hasMarker) continue;
    // Prefer the largest matching denomination (notes print their value prominently).
    const denoms = [...info.denominations].sort((a, b) => b - a);
    for (const denom of denoms) {
      if (new RegExp(`\\b${denom}\\b`).test(text)) {
        return { code, denom, info, note: info.notes[String(denom)] || null };
      }
    }
  }
  return null;
}

/**
 * @param {import("./types.js").SkillContext} ctx
 * @param {{ imagePath: string, hint?: "currency"|"medication"|"object", signal?: AbortSignal }} input
 * @returns {Promise<import("../engine/types.js").SkillResult>}
 */
export async function identify(ctx, { imagePath, hint, signal }) {
  const { engine } = ctx;
  const { text: ocrText, blocks } = await engine.ocr({ imagePath });

  // 1) Currency (deterministic, verified).
  if (hint !== "medication" && hint !== "object") {
    const cur = detectCurrency(ocrText);
    if (cur) {
      const speech = `This looks like a ${cur.info.symbol}${cur.denom} ${cur.info.name} note. ${currency.disclaimer}`;
      return {
        skill: "identify",
        speech,
        detail: speech,
        data: { kind: "currency", code: cur.code, denomination: cur.denom, note: cur.note, disclaimer: currency.disclaimer },
        verified: true,
        warning: "",
      };
    }
  }

  // 2) Medication label (deterministic extraction + mandatory disclaimer).
  const med = analyzeMedicationLabel(ocrText);
  const looksMedical =
    hint === "medication" ||
    med.dosages.length > 0 ||
    med.isHighAlert ||
    /\b(tablet|capsule|mg|mcg|dose|dosage|pharmacy|prescription|rx)\b/i.test(ocrText || "");
  if (looksMedical && hint !== "object") {
    const parts = [];
    if (med.dosages.length) parts.push(`Dosage shown: ${med.dosages.join(", ")}.`);
    if (med.frequencies.length) parts.push(`Instructions: ${med.frequencies.join(", ")}.`);
    if (med.isHighAlert) parts.push(med.highAlertAdvice);
    const body = parts.length ? parts.join(" ") : "I can read the label, but I couldn't find a clear dose.";
    const speech = `${body} ${med.disclaimer}`;
    return {
      skill: "identify",
      speech,
      detail: `${(ocrText || "").trim()}\n\n${speech}`,
      data: { kind: "medication", ...med, ocrText },
      verified: med.dosages.length > 0,
      warning: med.isHighAlert ? med.highAlertAdvice : "",
    };
  }

  // 3) General object — vision model (unverified), with any label text appended.
  const ask = "What is this object? Answer in one short, literal sentence for a blind user.";
  const { text: vis } = await engine.describeImage({ imagePath, prompt: ask, signal });
  const visText = (vis || "").trim();
  const label = (ocrText || "").trim();
  const speech = label ? `${visText} The label reads: ${label}.` : visText;
  return {
    skill: "identify",
    speech,
    detail: speech,
    data: { kind: "object", ocrText: label, blocks },
    verified: false,
    warning: "",
  };
}
