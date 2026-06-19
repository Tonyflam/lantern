/**
 * Deterministic safety spine.
 *
 * Hazard detection and medication-label analysis are done in CODE (transparent
 * keyword rules + regex), not by asking a model "is this dangerous?". That makes
 * the safety behavior predictable, auditable, and impossible to hijack with text
 * placed inside an image. The language model never overrides these results — it
 * only phrases them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data", "reference");

const hazards = JSON.parse(readFileSync(join(dataDir, "hazards.json"), "utf8"));
const med = JSON.parse(readFileSync(join(dataDir, "medication-safety.json"), "utf8"));

const SEVERITY_ORDER = /** @type {const} */ ({ low: 1, medium: 2, high: 3 });

/**
 * Deterministically scan a scene/description for hazards using the rules table.
 * @param {string} text
 * @returns {{ hazards: Array<{type:string,severity:string,phrase:string,advice:string}>, topSeverity: ("low"|"medium"|"high"|null) }}
 */
export function scanHazards(text) {
  const str = String(text || "").toLowerCase();
  /** @type {Array<{type:string,severity:string,phrase:string,advice:string}>} */
  const found = [];
  for (const rule of hazards.rules) {
    for (const kw of rule.keywords) {
      if (str.includes(String(kw).toLowerCase())) {
        found.push({ type: rule.type, severity: rule.severity, phrase: kw, advice: rule.advice });
        break; // at most one hit per rule
      }
    }
  }
  found.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  return { hazards: found, topSeverity: found[0]?.severity ?? null };
}

/**
 * Build a single spoken safety sentence from a hazard scan (empty if none).
 * @param {{hazards: Array<{advice:string}>}} scan
 * @returns {string}
 */
export function hazardSpeech(scan) {
  if (!scan.hazards.length) return "";
  const top = scan.hazards.slice(0, 2).map((h) => h.advice);
  return "Safety note. " + top.join(" ");
}

/** @returns {string} */
export function medicationDisclaimer() {
  return med.disclaimer;
}

/**
 * Deterministically extract dosage / frequency / high-alert info from label text.
 * @param {string} text
 * @returns {{dosages:string[], frequencies:string[], highAlert:string[], isHighAlert:boolean, highAlertAdvice:string, disclaimer:string}}
 */
export function analyzeMedicationLabel(text) {
  const str = String(text || "");
  const lower = str.toLowerCase();
  const dosages = matchAll(str, med.dosagePatterns);
  const frequencies = matchAll(lower, med.frequencyPatterns);
  const highAlert = med.highAlert.filter((/** @type {string} */ name) => lower.includes(name));
  return {
    dosages,
    frequencies,
    highAlert,
    isHighAlert: highAlert.length > 0,
    highAlertAdvice: highAlert.length ? med.highAlertAdvice : "",
    disclaimer: med.disclaimer,
  };
}

/**
 * @param {string} text
 * @param {string[]} patterns
 * @returns {string[]}
 */
function matchAll(text, patterns) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const p of patterns) {
    const re = new RegExp(p, "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      out.add(m[0].trim());
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width matches
    }
  }
  return [...out];
}
