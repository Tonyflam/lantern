/**
 * Tiny vector math for the personal-memory recall path. Pure functions, zero
 * dependencies — keeps Lantern reproducible on any machine (laptop or Pi).
 */

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * @param {number[]} a
 * @returns {number}
 */
export function magnitude(a) {
  return Math.sqrt(dot(a, a));
}

/**
 * Cosine similarity in [-1, 1]; 0 when either vector is empty/mismatched.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSim(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const denom = magnitude(a) * magnitude(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}

/**
 * Return the top-K items by cosine similarity to a query vector.
 * @template {{ embedding: number[] }} T
 * @param {number[]} queryVec
 * @param {T[]} items
 * @param {number} k
 * @param {number} [minScore]
 * @returns {Array<{ item: T, score: number }>}
 */
export function topK(queryVec, items, k, minScore = 0) {
  return items
    .map((item) => ({ item, score: cosineSim(queryVec, item.embedding) }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
