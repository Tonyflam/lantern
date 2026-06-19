import { describe, it, expect } from "vitest";
import { cosineSim, dot, magnitude, topK } from "../src/memory/vector.js";

describe("vector math", () => {
  it("cosineSim is 1 for identical, 0 for orthogonal, -1 for opposite", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it("guards against empty/mismatched vectors", () => {
    expect(cosineSim([], [1, 2])).toBe(0);
    expect(cosineSim([0, 0], [0, 0])).toBe(0);
  });

  it("dot and magnitude are correct", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(magnitude([3, 4])).toBe(5);
  });

  it("topK returns the most similar items above minScore, sorted desc", () => {
    const items = [
      { id: "a", embedding: [1, 0, 0] },
      { id: "b", embedding: [0.9, 0.1, 0] },
      { id: "c", embedding: [0, 1, 0] },
    ];
    const res = topK([1, 0, 0], items, 2, 0.5);
    expect(res).toHaveLength(2);
    expect(res[0].item.id).toBe("a");
    expect(res[1].item.id).toBe("b");
    expect(res[0].score).toBeGreaterThanOrEqual(res[1].score);
  });
});

describe("vector math — properties and edge cases", () => {
  it("cosineSim is symmetric", () => {
    const a = [0.2, 0.8, -0.3];
    const b = [0.5, -0.1, 0.9];
    expect(cosineSim(a, b)).toBeCloseTo(cosineSim(b, a), 12);
  });

  it("cosineSim is invariant to positive scaling", () => {
    const a = [1, 2, 3];
    expect(cosineSim(a, a.map((x) => x * 7))).toBeCloseTo(1, 12);
  });

  it("dot uses the shorter length when vectors mismatch", () => {
    expect(dot([1, 2, 3], [4, 5])).toBe(1 * 4 + 2 * 5);
  });

  it("topK returns everything (sorted) when k exceeds the item count", () => {
    const items = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0, 1] },
    ];
    const res = topK([1, 0], items, 10);
    expect(res).toHaveLength(2);
    expect(res[0].item.id).toBe("a");
  });

  it("topK excludes negatively-similar items at the default threshold", () => {
    const items = [
      { id: "same", embedding: [1, 0] },
      { id: "opposite", embedding: [-1, 0] },
    ];
    const res = topK([1, 0], items, 5);
    expect(res.map((r) => r.item.id)).toEqual(["same"]);
  });

  it("topK with an impossible threshold returns nothing", () => {
    const items = [{ id: "a", embedding: [1, 0] }];
    expect(topK([1, 0], items, 5, 1.1)).toHaveLength(0);
  });

  it("topK on an empty corpus returns nothing", () => {
    expect(topK([1, 0], [], 5)).toHaveLength(0);
  });
});
