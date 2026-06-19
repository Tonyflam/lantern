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
