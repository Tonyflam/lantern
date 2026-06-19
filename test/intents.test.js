import { describe, it, expect } from "vitest";
import { classifyIntent, LANGUAGES } from "../src/core/intents.js";

describe("intents — deterministic classifier", () => {
  /** @type {Array<[string, string]>} */
  const cases = [
    ["describe what is in front of me", "describe"],
    ["what do you see", "describe"],
    ["look around the room", "describe"],
    ["where am i", "describe"],
    ["read this sign", "read"],
    ["what does this label say", "read"],
    ["read it aloud", "read"],
    ["what is this", "identify"],
    ["how much money is this", "identify"],
    ["what denomination is this note", "identify"],
    ["which medicine is this", "identify"],
    ["is it safe ahead", "hazard"],
    ["is it safe to cross", "hazard"],
    ["any hazards in my path", "hazard"],
    ["can i walk forward", "hazard"],
    ["remember I parked in B12", "remember"],
    ["make a note that the wifi password is sunflower", "remember"],
    ["where did I park", "recall"],
    ["what is my front door code", "recall"],
    ["what's my wifi password", "recall"],
    ["remind me where my wallet is", "recall"],
    ["do i have any notes about the dentist", "recall"],
    ["translate this to spanish", "translate"],
  ];

  for (const [text, expected] of cases) {
    it(`classifies "${text}" as ${expected}`, () => {
      expect(classifyIntent(text).intent).toBe(expected);
    });
  }

  // Every supported language must route to translate and extract the ISO code.
  for (const [name, code] of Object.entries(LANGUAGES)) {
    it(`routes "translate this to ${name}" → translate (${code})`, () => {
      const r = classifyIntent(`translate this to ${name}`);
      expect(r.intent).toBe("translate");
      expect(r.slots.language).toBe(code);
      expect(r.slots.languageName).toBe(name);
    });
  }

  it("extracts a note slot for remember", () => {
    const r = classifyIntent("remember that my keys are in the blue bowl");
    expect(r.intent).toBe("remember");
    expect(r.slots.note).toBe("my keys are in the blue bowl");
  });

  it("extracts a note slot from a 'note that ...' phrasing", () => {
    const r = classifyIntent("note that the gas bill is due on Friday");
    expect(r.intent).toBe("remember");
    expect(r.slots.note).toBe("the gas bill is due on Friday");
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

  it("matched intents report high confidence", () => {
    expect(classifyIntent("read this sign").confidence).toBe("high");
    expect(classifyIntent("where did i park").confidence).toBe("high");
  });

  it("prefers translate over read when a language is named", () => {
    expect(classifyIntent("read this in german").intent).toBe("translate");
  });

  it("prefers read over describe for a text request", () => {
    expect(classifyIntent("read the text in front of me").intent).toBe("read");
  });

  it("handles empty, whitespace, and null input as low-confidence describe", () => {
    for (const input of ["", "   ", null, undefined]) {
      const r = classifyIntent(/** @type {any} */ (input));
      expect(r.intent).toBe("describe");
      expect(r.matched).toBe(false);
    }
  });
});
