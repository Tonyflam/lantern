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

  it("still verifies US currency when OCR mangles the ISO code (real-world noise)", async () => {
    // Real OCR misread "USD" as "asn"; detection must fall back to the printed
    // phrase "FEDERAL RESERVE NOTE" / "TWENTY DOLLARS".
    const { imagePath, cleanup } = imageWithText("FEDERAL RESERVE NOTE\nTHE UNITED STATES OF AMERICA\nTWENTY DOLLARS\nasn\n20");
    try {
      const r = await identify(ctx(), { imagePath });
      expect(r.data.kind).toBe("currency");
      expect(r.data.code).toBe("USD");
      expect(r.data.denomination).toBe(20);
      expect(r.verified).toBe(true);
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

describe("identify — currency detection across currencies", () => {
  /** @type {Array<{label:string, ocr:string, code:string, denom:number}>} */
  const cases = [
    { label: "USD via printed phrase + numeral", ocr: "FEDERAL RESERVE NOTE\nTHE UNITED STATES OF AMERICA\nTWENTY DOLLARS\n20", code: "USD", denom: 20 },
    { label: "USD via symbol + word", ocr: "$5\nFIVE DOLLARS\nFEDERAL RESERVE NOTE", code: "USD", denom: 5 },
    { label: "USD via ISO code", ocr: "USD 100\nONE HUNDRED DOLLARS\nFEDERAL RESERVE NOTE", code: "USD", denom: 100 },
    { label: "EUR via central-bank marker", ocr: "EUROPEAN CENTRAL BANK\n50\nFIFTY EURO", code: "EUR", denom: 50 },
    { label: "EUR via name + numeral", ocr: "EURO\n20", code: "EUR", denom: 20 },
    { label: "GBP via Bank of England marker", ocr: "BANK OF ENGLAND\n10\nTEN POUNDS", code: "GBP", denom: 10 },
    { label: "GBP via name + word", ocr: "POUND STERLING\nFIFTY", code: "GBP", denom: 50 },
  ];

  for (const { label, ocr, code, denom } of cases) {
    it(`verifies ${label}`, async () => {
      const { imagePath, cleanup } = imageWithText(ocr);
      try {
        const r = await identify(ctx(), { imagePath });
        expect(r.data.kind).toBe("currency");
        expect(r.data.code).toBe(code);
        expect(r.data.denomination).toBe(denom);
        expect(r.verified).toBe(true);
      } finally {
        cleanup();
      }
    });
  }

  it("prefers the largest printed denomination on a note", async () => {
    const { imagePath, cleanup } = imageWithText("FEDERAL RESERVE NOTE\n100\n50\n20\nDOLLARS");
    try {
      const r = await identify(ctx(), { imagePath });
      expect(r.data.kind).toBe("currency");
      expect(r.data.denomination).toBe(100);
    } finally {
      cleanup();
    }
  });

  it("does not hallucinate currency from a plain object label", async () => {
    const { imagePath, cleanup } = imageWithText("CERAMIC MUG\nDishwasher safe");
    try {
      const r = await identify(ctx(), { imagePath, hint: "object" });
      expect(r.data.kind).toBe("object");
      expect(r.verified).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("always carries the best-effort currency disclaimer when verified", async () => {
    const { imagePath, cleanup } = imageWithText("FEDERAL RESERVE NOTE\nTEN DOLLARS\n10");
    try {
      const r = await identify(ctx(), { imagePath });
      expect(r.data.kind).toBe("currency");
      expect(String(r.data.disclaimer).length).toBeGreaterThan(10);
      expect(r.speech.toLowerCase()).toMatch(/confirm|best-effort|trusted/);
    } finally {
      cleanup();
    }
  });
});
