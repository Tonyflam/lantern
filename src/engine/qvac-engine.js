/**
 * QvacEngine — the real, 100% on-device inference backend.
 *
 * Implements the {@link import("./types.js").LanternEngine} capability interface
 * against `@qvac/sdk` (v0.13.x). The SDK is imported dynamically so the rest of
 * Lantern can boot, run and be tested without it (e.g. in mock mode).
 *
 * Models are loaded lazily on first use and cached for the process lifetime,
 * then unloaded on close(). Every load/unload/inference is recorded by the
 * AuditLogger with timing and throughput metrics.
 *
 * NOTHING here calls out to the network for inference — QVAC runs models locally
 * (optionally delegating to a peer you control over an encrypted P2P link).
 */
import { resolvePath } from "../config.js";
import { buildVisionDelegate } from "../p2p/delegate.js";

export class QvacEngine {
  /**
   * @param {import("./types.js").LanternConfig} cfg
   * @param {import("../logger.js").AuditLogger} logger
   */
  constructor(cfg, logger) {
    /** @type {"qvac"} */
    this.kind = "qvac";
    this.cfg = cfg;
    this.logger = logger;
    /** @type {any} */
    this.sdk = null;
    /** @type {Map<string, {modelId: string, model: string, delegated: boolean}>} */
    this.models = new Map();
    this.capabilities = { chat: true, vision: true, ocr: true, stt: true, tts: true, translate: true, embed: true };
  }

  async init() {
    if (this.sdk) return;
    try {
      this.sdk = await import("@qvac/sdk");
    } catch (err) {
      throw new Error(
        "Lantern is set to the real QVAC engine but @qvac/sdk could not be loaded.\n" +
          "  • Run `npm install` on a QVAC-supported platform (Node >= 22.17), or\n" +
          "  • Set LANTERN_ENGINE=mock to use the offline simulation.\n" +
          `Underlying error: ${/** @type {Error} */ (err)?.message || err}`,
      );
    }
    this.logger.event({ op: "engine_init", engine: "qvac", ok: true, meta: { device: this.cfg.device } });
  }

  // ── model management ──────────────────────────────────────────────────────

  /**
   * Resolve a config model-name string into an SDK constant, or pass through a
   * local path / URL as an escape hatch.
   * @param {string} name
   */
  #resolveModel(name) {
    if (!name) throw new Error("Model name is empty");
    if (this.sdk && name in this.sdk) return this.sdk[name];
    if (name.includes("/") || name.includes("\\") || name.startsWith("http")) return name;
    throw new Error(
      `Unknown QVAC model constant "${name}". Verify the name against the installed @qvac/sdk version, ` +
        "or use a local path / URL.",
    );
  }

  /**
   * Build the capability-specific modelConfig. Mirrors the official QVAC
   * examples; modelType is omitted because it is inferred from registry constants.
   * @param {string} capability
   * @param {any} m
   */
  #buildModelConfig(capability, m) {
    const device = this.cfg.device;
    const useGPU = device === "gpu";
    const language = this.cfg.voice?.language || "en";
    switch (capability) {
      case "llm":
        return { ctx_size: m.ctx_size ?? 4096, device };
      case "vision":
        return { ctx_size: m.ctx_size ?? 1024, projectionModelSrc: this.#resolveModel(m.projection), device };
      case "ocr":
        return {
          langList: m.langList ?? ["en"],
          useGPU,
          timeout: 30000,
          magRatio: 1.5,
          defaultRotationAngles: [90, 180, 270],
          contrastRetry: false,
          lowConfidenceThreshold: 0.5,
          recognizerBatchSize: 1,
        };
      case "stt":
        return {
          ...(m.vad ? { vadModelSrc: this.#resolveModel(m.vad) } : {}),
          audio_format: "f32le",
          strategy: "greedy",
          n_threads: 4,
          language,
          temperature: 0,
          suppress_blank: true,
          suppress_nst: true,
          contextParams: { use_gpu: useGPU, flash_attn: useGPU, gpu_device: 0 },
        };
      case "tts":
        return {
          ttsEngine: m.engine ?? "supertonic",
          language,
          voice: this.cfg.voice?.ttsVoice ?? "F1",
          ttsSpeed: this.cfg.voice?.ttsSpeed ?? 1.05,
          ttsNumInferenceSteps: this.cfg.voice?.ttsNumInferenceSteps ?? 5,
        };
      case "translate":
        return { engine: m.engine ?? "Bergamot", from: m.from ?? "en", to: m.to ?? "es" };
      case "embeddings":
        // Matches the official embeddings example (GPU-accelerated when available).
        return useGPU ? { device, gpuLayers: 99 } : { device };
      default:
        return {};
    }
  }

  /** Build a P2P delegate config for the heavy vision model when enabled. */
  #buildDelegate(capability) {
    if (capability === "vision") return buildVisionDelegate(this.cfg);
    return null;
  }

  /**
   * Ensure the model for a capability is loaded (lazy, cached).
   * @param {string} capability
   */
  async #ensureModel(capability) {
    const cached = this.models.get(capability);
    if (cached) return cached;

    const m = this.cfg.models[capability];
    if (!m) throw new Error(`No model configured for capability "${capability}"`);

    const delegate = this.#buildDelegate(capability);
    const stop = this.logger.startTimer();
    let lastPct = -10;

    /** @type {any} */
    const loadArgs = {
      modelSrc: this.#resolveModel(m.src),
      modelConfig: this.#buildModelConfig(capability, m),
      onProgress: (/** @type {any} */ p) => {
        const pct = Math.round(p?.percentage ?? 0);
        if (pct >= lastPct + 10) {
          lastPct = pct;
          this.logger.event({ op: "model_download", capability, model: m.src, ok: true, meta: { percentage: pct } });
        }
      },
    };
    if (delegate) loadArgs.delegate = delegate;

    const modelId = await this.sdk.loadModel(loadArgs);
    const durationMs = stop();
    const entry = { modelId, model: m.src, delegated: Boolean(delegate) };
    this.models.set(capability, entry);
    this.logger.event({
      op: "model_load",
      capability,
      model: m.src,
      device: this.cfg.device,
      delegated: entry.delegated,
      durationMs,
      ok: true,
    });
    return entry;
  }

  // ── completion streaming helper ───────────────────────────────────────────

  /**
   * @param {{capability: string, modelId: string, history: any[], model: string, delegated: boolean}} args
   * @param {AbortSignal} [signal]
   */
  async #streamCompletion({ capability, modelId, history, model, delegated }, signal) {
    const stop = this.logger.startTimer();
    const result = this.sdk.completion({ modelId, history, stream: true });
    let text = "";
    let tokens = 0;
    /** @type {number | null} */
    let ttftMs = null;

    for await (const tok of result.tokenStream) {
      if (signal?.aborted) break;
      if (ttftMs === null) ttftMs = stop();
      text += tok;
      tokens++;
    }

    /** @type {number | undefined} */
    let tokensPerSecond;
    try {
      const stats = await result.stats;
      if (stats?.tokensPerSecond != null) tokensPerSecond = Math.round(stats.tokensPerSecond * 10) / 10;
      if (stats?.tokens != null) tokens = stats.tokens;
    } catch {
      /* stats are best-effort */
    }

    const durationMs = stop();
    this.logger.event({
      op: "completion",
      capability,
      model,
      device: this.cfg.device,
      delegated,
      durationMs,
      ttftMs: ttftMs ?? undefined,
      tokens,
      tokensPerSecond,
      ok: true,
    });
    return { text, stats: { ttftMs: ttftMs ?? undefined, tokens, tokensPerSecond, durationMs, delegated } };
  }

  // ── capabilities ──────────────────────────────────────────────────────────

  /** @param {{system?: string, messages: import("./types.js").ChatMessage[], signal?: AbortSignal}} opts */
  async chat({ system, messages, signal }) {
    const { modelId, model } = await this.#ensureModel("llm");
    const history = system ? [{ role: "system", content: system }, ...messages] : [...messages];
    return this.#streamCompletion({ capability: "llm", modelId, history, model, delegated: false }, signal);
  }

  /** @param {{imagePath: string, prompt: string, signal?: AbortSignal}} opts */
  async describeImage({ imagePath, prompt, signal }) {
    const { modelId, model, delegated } = await this.#ensureModel("vision");
    const history = [{ role: "user", content: prompt, attachments: [{ path: resolvePath(this.cfg, imagePath) }] }];
    return this.#streamCompletion({ capability: "vision", modelId, history, model, delegated }, signal);
  }

  /** @param {{imagePath: string}} opts */
  async ocr({ imagePath }) {
    const { modelId, model } = await this.#ensureModel("ocr");
    const stop = this.logger.startTimer();
    const { blocks } = this.sdk.ocr({ modelId, image: resolvePath(this.cfg, imagePath), options: { paragraph: false } });
    const result = await blocks;
    const durationMs = stop();
    const text = result.map((/** @type {any} */ b) => b.text).join("\n");
    this.logger.event({
      op: "ocr",
      capability: "ocr",
      model,
      device: this.cfg.device,
      durationMs,
      input: this.logger.fingerprint(text),
      meta: { blocks: result.length },
      ok: true,
    });
    return { blocks: result, text, stats: { durationMs } };
  }

  /** @param {{audioPath: string, prompt?: string}} opts */
  async transcribe({ audioPath, prompt }) {
    const { modelId, model } = await this.#ensureModel("stt");
    const stop = this.logger.startTimer();
    const text = await this.sdk.transcribe({ modelId, audioChunk: resolvePath(this.cfg, audioPath), prompt });
    const durationMs = stop();
    this.logger.event({
      op: "transcribe",
      capability: "stt",
      model,
      device: this.cfg.device,
      durationMs,
      input: this.logger.fingerprint(text),
      ok: true,
    });
    return { text: String(text || "").trim(), stats: { durationMs } };
  }

  /** @param {{text: string}} opts */
  async synthesize({ text }) {
    const { modelId, model } = await this.#ensureModel("tts");
    const stop = this.logger.startTimer();
    const result = this.sdk.textToSpeech({ modelId, text, inputType: "text", stream: false });
    const pcm = await result.buffer;
    const durationMs = stop();
    const sampleRate = this.cfg.models.tts.sampleRate ?? 44100;
    this.logger.event({
      op: "tts",
      capability: "tts",
      model,
      device: this.cfg.device,
      durationMs,
      meta: { samples: pcm.length, sampleRate },
      ok: true,
    });
    return { pcm, sampleRate, stats: { durationMs } };
  }

  /** @param {{text: string, from?: string, to?: string}} opts */
  async translate({ text, from, to }) {
    const { modelId, model } = await this.#ensureModel("translate");
    const stop = this.logger.startTimer();
    const result = this.sdk.translate({ modelId, text, modelType: "nmtcpp-translation", stream: true });
    let out = "";
    for await (const tok of result.tokenStream) out += tok;
    const durationMs = stop();
    const meta = {
      from: from ?? this.cfg.models.translate.from,
      to: to ?? this.cfg.models.translate.to,
    };
    this.logger.event({ op: "translate", capability: "translate", model, device: this.cfg.device, durationMs, meta, ok: true });
    return { text: out.trim(), stats: { durationMs } };
  }

  /** @param {{text: string}} opts */
  async embed({ text }) {
    const { modelId, model } = await this.#ensureModel("embeddings");
    const stop = this.logger.startTimer();
    const { embedding } = await this.sdk.embed({ modelId, text });
    const durationMs = stop();
    this.logger.event({
      op: "embed",
      capability: "embeddings",
      model,
      device: this.cfg.device,
      durationMs,
      meta: { dim: embedding?.length },
      ok: true,
    });
    return { embedding, stats: { durationMs } };
  }

  async close() {
    for (const [capability, entry] of this.models) {
      try {
        await this.sdk.unloadModel({ modelId: entry.modelId, clearStorage: false });
        this.logger.event({ op: "model_unload", capability, model: entry.model, ok: true });
      } catch (err) {
        this.logger.event({
          op: "model_unload",
          capability,
          model: entry.model,
          ok: false,
          error: String(/** @type {Error} */ (err)?.message || err),
        });
      }
    }
    this.models.clear();
    try {
      if (this.sdk?.close) await this.sdk.close();
    } catch {
      /* ignore shutdown errors */
    }
  }
}
