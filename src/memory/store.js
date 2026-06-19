/**
 * Personal memory store — a JSON-backed list of notes with embeddings.
 *
 * Stays entirely on-device (the file is git-ignored). This is the user's own
 * data, so it is stored as plain text on their machine; Lantern's audit log,
 * by contrast, never records note content. Recall uses in-memory cosine
 * similarity (see vector.js) so there are no native database dependencies.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { topK } from "./vector.js";

/**
 * @typedef {Object} MemoryItem
 * @property {string} id
 * @property {string} text
 * @property {number[]} embedding
 * @property {string[]} tags
 * @property {string} ts  ISO timestamp
 */

export class MemoryStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
    /** @type {MemoryItem[]} */
    this.items = [];
    this.loaded = false;
  }

  /** Load from disk (tolerant of a missing or corrupt file). @returns {this} */
  load() {
    if (existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(readFileSync(this.filePath, "utf8"));
        this.items = Array.isArray(raw?.items) ? raw.items : [];
      } catch {
        this.items = [];
      }
    }
    this.loaded = true;
    return this;
  }

  /** Persist to disk, creating the directory if needed. */
  persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify({ version: 1, items: this.items }, null, 2));
  }

  /**
   * Add a note and persist.
   * @param {{ text: string, embedding: number[], tags?: string[] }} entry
   * @returns {MemoryItem}
   */
  add({ text, embedding, tags = [] }) {
    /** @type {MemoryItem} */
    const item = { id: randomUUID(), text, embedding, tags, ts: new Date().toISOString() };
    this.items.push(item);
    this.persist();
    return item;
  }

  /**
   * Semantic search over stored notes.
   * @param {number[]} queryEmbedding
   * @param {number} [k]
   * @param {number} [minScore]
   * @returns {Array<{ item: MemoryItem, score: number }>}
   */
  search(queryEmbedding, k = 4, minScore = 0.25) {
    return topK(queryEmbedding, this.items, k, minScore);
  }

  /** @returns {MemoryItem[]} */
  all() {
    return this.items;
  }

  /** @returns {number} */
  size() {
    return this.items.length;
  }

  /** Remove all notes and persist. */
  clear() {
    this.items = [];
    this.persist();
  }
}
