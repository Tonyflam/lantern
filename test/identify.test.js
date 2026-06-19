import { describe, it, expect } from "vitest";
import { MockEngine } from "../src/engine/mock-engine.js";
import { identify } from "../src/skills/identify.js";
import { makeConfig, makeLogger, imageWithText } from "./helpers.js";

function ctx() {
  const cfg = makeConfig();
  const logger = makeLogger();
  const engine = new MockEngine(cfg, logger);
  return { engine, logger, memory: /** @type {any} */ (null), cfg };
}

describe("identify — deterministic-first", () => {
  it("verifies US currency from the printed denomination", async () => {
    const { imagePath, cleanup } = imageWithText("FEDERAL RESERVE NOTE\nUSD\nTHE UNITED STATES OF AMERICA\n20\nTWENTY DOLLARS");
    try {
      const r = await identify(ctx(), { imagePath });
      expect(r.data.kind).toBe("currency");
      expect(r.data.code).toBe("USD");
      expect(r.data.denomination).toBe(20);
      expect(r.verified).toBe(true);
      expect(r.speech).toMatch(/\$20/);
    } finally {
      cleanup();
    }
  });

  it("reads a medication label, extracts dose, and always adds the disclaimer", async () => {
    const { imagePath, cleanup } = imageWithText("Ibuprofen 200 mg tablets. Take two tablets every 6 hours with food.");
    try {
      const r = await identify(ctx(), { imagePath, hint: "medication" });
      expect(r.data.kind).toBe("medication");
      expect(r.data.dosages.some((/** @type {string} */ d) => /200\s?mg/i.test(d))).toBe(true);
      expect(r.speech.toLowerCase()).toContain("pharmacist");
    } finally {
      cleanup();
    }
  });

  it("flags a high-alert medication", async () => {
    const { imagePath, cleanup } = imageWithText("Warfarin 5 mg. Take once daily.");
    try {
      const r = await identify(ctx(), { imagePath });
      expect(r.data.kind).toBe("medication");
      expect(r.data.isHighAlert).toBe(true);
      expect(r.warning).not.toBe("");
    } finally {
      cleanup();
    }
  });

  it("falls back to an unverified object description when no currency/med", async () => {
    const { imagePath, cleanup } = imageWithText("just a plain mug");
    try {
      const r = await identify(ctx(), { imagePath, hint: "object" });
      expect(r.data.kind).toBe("object");
      expect(r.verified).toBe(false);
    } finally {
      cleanup();
    }
  });
});
