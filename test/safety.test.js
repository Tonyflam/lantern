import { describe, it, expect } from "vitest";
import {
  scanHazards,
  hazardSpeech,
  analyzeMedicationLabel,
  medicationDisclaimer,
} from "../src/core/safety.js";

describe("safety — hazard detection (deterministic)", () => {
  it("detects high-severity hazards and orders by severity", () => {
    const scan = scanHazards("There is a knife on the counter and steps leading down to the road.");
    const types = scan.hazards.map((h) => h.type);
    expect(types).toContain("sharp");
    expect(types).toContain("fall");
    expect(types).toContain("traffic");
    expect(scan.topSeverity).toBe("high"); // fall/traffic outrank sharp
  });

  it("returns no hazards for a safe scene", () => {
    const scan = scanHazards("A soft sofa, a bookshelf, and a cup of tea on a low table.");
    // "low table" is a low-severity obstacle hint; ensure no false high hazard.
    expect(scan.topSeverity === null || scan.topSeverity === "low").toBe(true);
  });

  it("produces a spoken safety note only when hazards exist", () => {
    expect(hazardSpeech({ hazards: [] })).toBe("");
    const speech = hazardSpeech(scanHazards("the stove has an open flame"));
    expect(speech.toLowerCase()).toContain("safety note");
  });
});

describe("safety — medication label analysis (deterministic)", () => {
  it("extracts dosage and frequency", () => {
    const r = analyzeMedicationLabel("Amoxicillin 500 mg. Take one capsule three times a day with food.");
    expect(r.dosages.some((d) => /500\s?mg/i.test(d))).toBe(true);
    expect(r.frequencies.some((f) => /three times/i.test(f))).toBe(true);
    expect(r.disclaimer).toBe(medicationDisclaimer());
  });

  it("flags high-alert medications", () => {
    const r = analyzeMedicationLabel("Warfarin 5 mg tablet, once daily.");
    expect(r.isHighAlert).toBe(true);
    expect(r.highAlert).toContain("warfarin");
    expect(r.highAlertAdvice).not.toBe("");
  });

  it("always returns the disclaimer, even with no dosage found", () => {
    const r = analyzeMedicationLabel("Some unrelated text.");
    expect(r.disclaimer.length).toBeGreaterThan(10);
    expect(r.isHighAlert).toBe(false);
  });
});
