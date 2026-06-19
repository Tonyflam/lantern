import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.js";

function tmpStorePath() {
  const dir = mkdtempSync(join(tmpdir(), "lantern-store-"));
  return join(dir, "memory-store.json");
}

describe("MemoryStore — on-device personal memory", () => {
  it("starts empty when no file exists", () => {
    const store = new MemoryStore(tmpStorePath()).load();
    expect(store.size()).toBe(0);
    expect(store.all()).toEqual([]);
  });

  it("adds a note, returns it with an id + timestamp, and persists to disk", () => {
    const path = tmpStorePath();
    const store = new MemoryStore(path).load();
    const item = store.add({ text: "parked in section B12", embedding: [1, 0, 0], tags: ["parking"] });
    expect(item.id).toBeTruthy();
    expect(item.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(store.size()).toBe(1);
    expect(existsSync(path)).toBe(true);
  });

  it("persists across instances (reload from disk)", () => {
    const path = tmpStorePath();
    const a = new MemoryStore(path).load();
    a.add({ text: "front door code is 1975", embedding: [0, 1, 0] });
    const b = new MemoryStore(path).load();
    expect(b.size()).toBe(1);
    expect(b.all()[0].text).toBe("front door code is 1975");
  });

  it("ranks recall results by cosine similarity to the query", () => {
    const store = new MemoryStore(tmpStorePath()).load();
    store.add({ text: "car is in B12", embedding: [1, 0, 0] });
    store.add({ text: "milk in the fridge", embedding: [0, 1, 0] });
    store.add({ text: "garage spot near B12", embedding: [0.95, 0.05, 0] });
    const hits = store.search([1, 0, 0], 2, 0.25);
    expect(hits).toHaveLength(2);
    expect(hits[0].item.text).toBe("car is in B12");
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
    expect(hits.every((h) => h.item.text !== "milk in the fridge")).toBe(true);
  });

  it("honours k and minScore", () => {
    const store = new MemoryStore(tmpStorePath()).load();
    store.add({ text: "a", embedding: [1, 0] });
    store.add({ text: "b", embedding: [0, 1] });
    expect(store.search([1, 0], 1, 0).length).toBe(1);
    expect(store.search([1, 0], 5, 0.99).length).toBe(1); // only the exact match clears 0.99
  });

  it("clear() empties the store and persists the empty state", () => {
    const path = tmpStorePath();
    const store = new MemoryStore(path).load();
    store.add({ text: "temp", embedding: [1, 0] });
    store.clear();
    expect(store.size()).toBe(0);
    expect(new MemoryStore(path).load().size()).toBe(0);
  });

  it("tolerates a corrupt store file by starting empty (never throws)", () => {
    const path = tmpStorePath();
    writeFileSync(path, "{ this is not valid json ]");
    let store;
    expect(() => {
      store = new MemoryStore(path).load();
    }).not.toThrow();
    expect(store.size()).toBe(0);
  });
});
