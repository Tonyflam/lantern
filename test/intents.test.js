import { describe, it, expect } from "vitest";
import { classifyIntent, LANGUAGES } from "../src/core/intents.js";

describe("intents — deterministic classifier", () => {
  /** @type {Array<[string, string]>} */
  const cases = [
    ["describe what is in front of me", "describe"],
    ["what do you see", "describe"],
    ["read this sign", "read"],
    ["what does this label say", "read"],
    ["what is this", "identify"],
    ["how much money is this", "identify"],
    ["is it safe ahead", "hazard"],
    ["remember I parked in B12", "remember"],
    ["where did I park", "recall"],
    ["what is my front door code", "recall"],
    ["what's my wifi password", "recall"],
    ["translate this to spanish", "translate"],
  ];

  for (const [text, expected] of cases) {
    it(`classifies "${text}" as ${expected}`, () => {
      expect(classifyIntent(text).intent).toBe(expected);
    });
  }

  it("extracts a note slot for remember", () => {
    const r = classifyIntent("remember that my keys are in the blue bowl");
    expect(r.intent).toBe("remember");
    expect(r.slots.note).toBe("my keys are in the blue bowl");
  });

  it("extracts a language slot for translate", () => {
    const r = classifyIntent("what does this say in french");
    expect(r.intent).toBe("translate");
    expect(r.slots.language).toBe(LANGUAGES.french);
  });

  it("falls back to describe with low confidence for unknown input", () => {
    const r = classifyIntent("hmm okay then");
    expect(r.intent).toBe("describe");
    expect(r.confidence).toBe("low");
    expect(r.matched).toBe(false);
  });

  it("prefers translate over read when a language is named", () => {
    expect(classifyIntent("read this in german").intent).toBe("translate");
  });
});
