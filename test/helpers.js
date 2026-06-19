/**
 * Shared test helpers: a minimal config and a silent logger so tests run fast
 * and quietly, plus a temp-dir helper for sidecar OCR/STT fixtures.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLogger } from "../src/logger.js";

export function makeLogger() {
  // Silent logger writing to a throwaway temp dir.
  const dir = mkdtempSync(join(tmpdir(), "lantern-test-"));
  return new AuditLogger({ dir, console: false, root: dir, engine: "mock" });
}

/**
 * Minimal config matching the shape src/* expects.
 * @param {Partial<any>} [overrides]
 */
export function makeConfig(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "lantern-cfg-"));
  return {
    engine: "mock",
    device: "cpu",
    server: { host: "127.0.0.1", port: 4173 },
    voice: { enabled: true, ttsVoice: "F1", ttsSpeed: 1.05, ttsNumInferenceSteps: 5, language: "en" },
    models: {
      llm: { src: "LLAMA", ctx_size: 4096 },
      vision: { src: "SMOLVLM2", projection: "MMPROJ", ctx_size: 1024 },
      ocr: { src: "OCR", langList: ["en"] },
      stt: { src: "WHISPER", vad: "VAD" },
      tts: { src: "TTS", engine: "supertonic", sampleRate: 44100 },
      embeddings: { src: "GTE", dim: 64 },
      translate: { src: "BERGAMOT", engine: "Bergamot", from: "en", to: "es" },
    },
    p2p: { delegateVision: false, providerPublicKey: "", timeoutMs: 60000, fallbackToLocal: true },
    memory: { store: join(root, "memory-store.json"), topK: 4, minScore: 0.25 },
    logging: { dir: join(root, "logs"), console: false },
    __root: root,
    __path: join(root, "config.json"),
    ...overrides,
  };
}

/**
 * Create an image fixture path with a sidecar `.txt` the MockEngine reads as OCR.
 * @param {string} ocrText
 * @returns {{ imagePath: string, cleanup: () => void }}
 */
export function imageWithText(ocrText) {
  const dir = mkdtempSync(join(tmpdir(), "lantern-img-"));
  const imagePath = join(dir, "fixture.jpg");
  writeFileSync(imagePath, "fake-jpeg-bytes");
  writeFileSync(imagePath + ".txt", ocrText);
  return { imagePath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
