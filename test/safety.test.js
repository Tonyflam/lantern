import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  scanHazards,
  hazardSpeech,
  analyzeMedicationLabel,
  medicationDisclaimer,
} from "../src/core/safety.js";

const here = dirname(fileURLToPath(import.meta.url));
const hazards = JSON.parse(
  readFileSync(join(here, "../src/data/reference/hazards.json"), "utf8"),
);
const med = JSON.parse(
  readFileSync(join(here, "../src/data/reference/medication-safety.json"), "utf8"),
);

describe("safety — hazard detection (deterministic)", () => {
  it("detects high-severity hazards and orders by severity", () => {
    const scan = scanHazards("There is a knife on the counter and steps leading down to the road.");
    const types = scan.hazards.map((h) => h.type);
    expect(types).toContain("sharp");
    expect(types).toContain("fall");
    expect(types).toContain("traffic");
    expect(scan.topSeverity).toBe("high"); // fall/traffic outrank sharp
  });

  // Every shipped rule must fire on its own first keyword, with the right severity.
  for (const rule of hazards.rules) {
    const keyword = rule.keywords[0];
    it(`detects the "${rule.type}" rule via "${keyword}" (severity ${rule.severity})`, () => {
      const scan = scanHazards(`I think there is ${keyword} just ahead of me.`);
      const hit = scan.hazards.find((h) => h.type === rule.type);
      expect(hit, `expected a ${rule.type} hazard`).toBeTruthy();
      expect(hit.severity).toBe(rule.severity);
      expect(hit.advice).toBe(rule.advice);
    });
  }

  it("returns no high hazard for a safe scene", () => {
    const scan = scanHazards("A soft sofa, a bookshelf, and a cup of tea on a low table.");
    expect(scan.topSeverity === null || scan.topSeverity === "low").toBe(true);
  });

  it("returns an empty result for plain, hazard-free text", () => {
    const scan = scanHazards("A framed photograph hangs on a painted wall.");
    expect(scan.hazards).toHaveLength(0);
    expect(scan.topSeverity).toBeNull();
  });

  it("records at most one hit per rule even if several keywords appear", () => {
    const scan = scanHazards("a knife, a blade, and a razor are on the table");
    const sharpHits = scan.hazards.filter((h) => h.type === "sharp");
    expect(sharpHits).toHaveLength(1);
  });

  it("orders mixed-severity hazards high → low", () => {
    const scan = scanHazards("there is clutter on the floor, a wet floor sign, and an open flame");
    const severities = scan.hazards.map((h) => h.severity);
    const rank = { low: 1, medium: 2, high: 3 };
    for (let i = 1; i < severities.length; i++) {
      expect(rank[severities[i - 1]]).toBeGreaterThanOrEqual(rank[severities[i]]);
    }
  });

  it("handles null/empty input safely", () => {
    expect(scanHazards(null).hazards).toHaveLength(0);
    expect(scanHazards("").topSeverity).toBeNull();
  });
});

describe("safety — hazard speech", () => {
  it("produces a spoken safety note only when hazards exist", () => {
    expect(hazardSpeech({ hazards: [] })).toBe("");
    const speech = hazardSpeech(scanHazards("the stove has an open flame"));
    expect(speech.toLowerCase()).toContain("safety note");
  });

  it("summarizes at most two hazards in the spoken note", () => {
    const scan = scanHazards("stairs, a road, a knife, and a wet floor are all around");
    const speech = hazardSpeech(scan);
    expect(scan.hazards.length).toBeGreaterThan(2);
    // Only the top two advices are spoken; both come from the highest severities.
    const spokenAdvices = scan.hazards.slice(0, 2).map((h) => h.advice);
    for (const a of spokenAdvices) expect(speech).toContain(a);
  });

  it("is deterministic for the same input", () => {
    const a = hazardSpeech(scanHazards("a knife near the stairs"));
    const b = hazardSpeech(scanHazards("a knife near the stairs"));
    expect(a).toBe(b);
  });
});

describe("safety — medication label analysis (deterministic)", () => {
  it("extracts dosage and frequency", () => {
    const r = analyzeMedicationLabel("Amoxicillin 500 mg. Take one capsule three times a day with food.");
    expect(r.dosages.some((d) => /500\s?mg/i.test(d))).toBe(true);
    expect(r.frequencies.some((f) => /three times/i.test(f))).toBe(true);
    expect(r.disclaimer).toBe(medicationDisclaimer());
  });

  // Each dose unit the parser claims to support must actually be extracted.
  /** @type {Array<[string, RegExp]>} */
  const doseCases = [
    ["Tablet X 250 mg once daily", /250\s?mg/i],
    ["Levothyroxine 75 mcg in the morning", /75\s?mcg/i],
    ["Cough syrup 10 ml twice a day", /10\s?ml/i],
    ["Paracetamol 1 g every 6 hours", /1\s?g/i],
    ["Insulin 20 units at bedtime", /20\s?units?/i],
    ["Take 2 tablets after food", /2\s?tablets?/i],
  ];
  for (const [label, re] of doseCases) {
    it(`extracts a dose from "${label}"`, () => {
      const r = analyzeMedicationLabel(label);
      expect(r.dosages.some((d) => re.test(d)), `expected ${re}`).toBe(true);
    });
  }

  // Every declared high-alert drug must be flagged.
  for (const drug of med.highAlert) {
    it(`flags the high-alert medication "${drug}"`, () => {
      const r = analyzeMedicationLabel(`${drug} 5 mg, once daily.`);
      expect(r.isHighAlert).toBe(true);
      expect(r.highAlert).toContain(drug);
      expect(r.highAlertAdvice).not.toBe("");
    });
  }

  it("deduplicates repeated dose strings", () => {
    const r = analyzeMedicationLabel("Take 500 mg now and another 500 mg tonight.");
    const fiveHundreds = r.dosages.filter((d) => /500\s?mg/i.test(d));
    expect(fiveHundreds).toHaveLength(1);
  });

  it("extracts multiple distinct frequencies", () => {
    const r = analyzeMedicationLabel("Take with food in the morning and again at bedtime.");
    expect(r.frequencies).toContain("with food");
    expect(r.frequencies).toContain("in the morning");
    expect(r.frequencies).toContain("at bedtime");
  });

  it("always returns the disclaimer, even with no dosage found", () => {
    const r = analyzeMedicationLabel("Some unrelated text.");
    expect(r.disclaimer.length).toBeGreaterThan(10);
    expect(r.isHighAlert).toBe(false);
    expect(r.dosages).toHaveLength(0);
  });

  it("returns the disclaimer and no crash on null/empty input", () => {
    const r = analyzeMedicationLabel(null);
    expect(r.disclaimer).toBe(medicationDisclaimer());
    expect(r.dosages).toHaveLength(0);
    expect(r.frequencies).toHaveLength(0);
  });
});
