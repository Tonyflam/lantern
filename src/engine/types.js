/**
 * Shared JSDoc type definitions for Lantern.
 *
 * The whole app depends on the `LanternEngine` capability interface — never on
 * `@qvac/sdk` directly. This dependency inversion lets the orchestrator, skills
 * and tests run against either the real QVAC engine or the offline mock engine.
 *
 * This file is types-only; it emits no runtime code.
 */

/**
 * @typedef {Object} LanternConfig
 * @property {string} appName
 * @property {"qvac"|"mock"} engine
 * @property {"gpu"|"cpu"} device
 * @property {{host: string, port: number}} server
 * @property {{enabled: boolean, ttsVoice: string, ttsSpeed: number, ttsNumInferenceSteps?: number, language: string}} voice
 * @property {Record<string, any>} models
 * @property {{delegateVision: boolean, providerPublicKey: string, timeoutMs: number, fallbackToLocal: boolean}} p2p
 * @property {{store: string, topK: number, minScore: number}} memory
 * @property {{dir: string, console: boolean}} logging
 * @property {string} [__root]
 * @property {string} [__path]
 */

/**
 * @typedef {Object} GenStats
 * @property {number} [ttftMs]            Time to first token (streaming ops).
 * @property {number} [tokens]            Tokens generated.
 * @property {number} [tokensPerSecond]   Throughput.
 * @property {number} [durationMs]        Wall-clock duration.
 * @property {boolean} [delegated]        True if served by a P2P provider.
 */

/**
 * @typedef {Object} OcrBlock
 * @property {string} text
 * @property {number[]} [bbox]            Bounding box [x0,y0,x1,y1,...].
 * @property {number} [confidence]        Recognition score in [0,1].
 */

/**
 * @typedef {Object} ChatMessage
 * @property {"system"|"user"|"assistant"|"tool"} role
 * @property {string} content
 */

/**
 * The capability surface Lantern needs from any inference backend.
 * Implemented by {@link file://./qvac-engine.js} (real) and
 * {@link file://./mock-engine.js} (offline simulation).
 *
 * @typedef {Object} LanternEngine
 * @property {"qvac"|"mock"} kind
 * @property {() => Promise<void>} init                  Lazily load/prepare the backend.
 * @property {() => Promise<void>} close                 Unload models and shut down.
 *
 * @property {(opts: { system?: string, messages: ChatMessage[], signal?: AbortSignal }) => Promise<{text: string, stats: GenStats}>} chat
 *           Text LLM completion (used for intent routing and phrasing verified facts).
 *
 * @property {(opts: { imagePath: string, prompt: string, signal?: AbortSignal }) => Promise<{text: string, stats: GenStats}>} describeImage
 *           Multimodal vision: describe what is in an image.
 *
 * @property {(opts: { imagePath: string }) => Promise<{blocks: OcrBlock[], text: string, stats: GenStats}>} ocr
 *           Deterministic optical character recognition.
 *
 * @property {(opts: { audioPath: string, prompt?: string }) => Promise<{text: string, stats: GenStats}>} transcribe
 *           Speech-to-text.
 *
 * @property {(opts: { text: string }) => Promise<{pcm: Int16Array|number[], sampleRate: number, stats: GenStats}>} synthesize
 *           Text-to-speech. Returns PCM samples + sample rate.
 *
 * @property {(opts: { text: string, from?: string, to?: string }) => Promise<{text: string, stats: GenStats}>} translate
 *           Neural machine translation.
 *
 * @property {(opts: { text: string }) => Promise<{embedding: number[], stats: GenStats}>} embed
 *           Text embedding for personal-memory recall.
 *
 * @property {LanternEngineCapabilities} capabilities
 */

/**
 * @typedef {Object} LanternEngineCapabilities
 * @property {boolean} chat
 * @property {boolean} vision
 * @property {boolean} ocr
 * @property {boolean} stt
 * @property {boolean} tts
 * @property {boolean} translate
 * @property {boolean} embed
 */

/**
 * @typedef {Object} SkillResult
 * @property {string} speech         Text Lantern should speak aloud.
 * @property {string} [detail]       Optional longer text for the screen.
 * @property {string} skill          Which skill produced this.
 * @property {Record<string, any>} [data]  Structured, deterministic payload.
 * @property {boolean} [verified]    True when the core facts are deterministically derived.
 * @property {string} [warning]      Safety/uncertainty warning to surface.
 */

export {};
