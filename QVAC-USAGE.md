# How Lantern uses QVAC

Lantern is built **end-to-end** on `@qvac/sdk` — every piece of AI is QVAC, and
all of it runs on-device. This document maps each QVAC capability to where and
why Lantern uses it. All calls live behind `QvacEngine`
([src/engine/qvac-engine.js](src/engine/qvac-engine.js)).

## Capability coverage

| QVAC capability | Model (default) | Where in Lantern | Why it's needed |
| --------------- | --------------- | ---------------- | --------------- |
| **LLM completion** | `LLAMA_3_2_1B_INST_Q4_0` | phrasing read-aloud text, scene Q&A | natural, concise spoken replies |
| **Multimodal vision** | `SMOLVLM2_500M_MULTIMODAL_Q8_0` (+ mmproj) | describe-scene, hazard-check, object identify | "what's in front of me?" |
| **OCR** | `OCR_LATIN_RECOGNIZER_1` | read-text, currency & medication identify, translate | verbatim, *verified* text — the trust anchor |
| **Speech-to-text** | `WHISPER_TINY` (+ `VAD_SILERO_5_1_2`) | hands-free voice input | the primary, eyes-free interface |
| **Text-to-speech** | `TTS_EN_SUPERTONIC_Q8_0` | every spoken reply | the output channel for a blind user |
| **Translation** | `BERGAMOT_EN_ES` | translate-text skill | read foreign signs/menus |
| **Embeddings** | `GTE_LARGE_FP16` | personal memory recall (RAG) | "where did I park?" |
| **P2P delegation** | provider/consumer | Lantern Hub offload of vision | edge scaling with local fallback |
| **Profiler-style metrics** | — | audit log timing/throughput | verifiable on-device evidence |

That is the **full QVAC inference surface**, used because a sight-and-voice
assistant genuinely requires all of it.

## Exact call shapes used

These mirror the official QVAC examples. Model **type is inferred from the
registry constants**, so it is omitted at `loadModel` (only ambiguous raw GGUFs
would need an explicit type). For translation, the type is passed at the
`translate()` call.

### LLM
```js
const modelId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  modelConfig: { ctx_size: 4096, device }, onProgress });
const result = completion({ modelId, history, stream: true });
for await (const tok of result.tokenStream) { /* stream */ }
```

### Multimodal vision
```js
const modelId = await loadModel({ modelSrc: SMOLVLM2_500M_MULTIMODAL_Q8_0,
  modelConfig: { ctx_size: 1024, projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0, device } });
const history = [{ role: "user", content: prompt, attachments: [{ path: imagePath }] }];
completion({ modelId, history, stream: true });
```

### OCR
```js
const modelId = await loadModel({ modelSrc: OCR_LATIN_RECOGNIZER_1,
  modelConfig: { langList: ["en"], useGPU, magRatio: 1.5,
                 defaultRotationAngles: [90,180,270], lowConfidenceThreshold: 0.5 } });
const { blocks } = ocr({ modelId, image: imagePath, options: { paragraph: false } });
const result = await blocks; // [{ text, bbox?, confidence? }]
```

### Speech-to-text
```js
const modelId = await loadModel({ modelSrc: WHISPER_TINY,
  modelConfig: { vadModelSrc: VAD_SILERO_5_1_2, audio_format: "f32le",
                 strategy: "greedy", language: "en",
                 contextParams: { use_gpu, flash_attn, gpu_device: 0 } } });
const text = await transcribe({ modelId, audioChunk: wavPathOrBuffer });
```

### Text-to-speech
```js
const modelId = await loadModel({ modelSrc: TTS_EN_SUPERTONIC_Q8_0,
  modelConfig: { ttsEngine: "supertonic", language: "en", voice: "F1",
                 ttsSpeed: 1.05, ttsNumInferenceSteps: 5 } });
const r = textToSpeech({ modelId, text, inputType: "text", stream: false });
const pcm = await r.buffer; // Int16 PCM @ 44.1 kHz
```

### Translation
```js
const modelId = await loadModel({ modelSrc: BERGAMOT_EN_ES,
  modelConfig: { engine: "Bergamot", from: "en", to: "es" } });
const r = translate({ modelId, text, modelType: "nmtcpp-translation", stream: true });
for await (const tok of r.tokenStream) { /* stream */ }
```

### Embeddings
```js
const modelId = await loadModel({ modelSrc: GTE_LARGE_FP16, modelConfig: {} });
const { embedding } = await embed({ modelId, text }); // 1024-dim
```

### P2P (Lantern Hub)
```js
// Provider (your home machine) — src/p2p/hub.js
const { publicKey } = await startQVACProvider({ firewall: { mode: "allow", publicKeys } });

// Consumer (field device) — delegate only the heavy vision model
await loadModel({ modelSrc: SMOLVLM2_500M_MULTIMODAL_Q8_0, modelConfig: {...},
  delegate: { providerPublicKey, timeout: 60000, fallbackToLocal: true } });
```

## On-device guarantees

- Models download once into `~/.qvac/models` and then run **fully offline**.
- No third-party AI APIs, telemetry, or analytics — see
  [remote-apis.json](remote-apis.json).
- The only optional network path is P2P delegation **to a peer you own**, always
  with local fallback.

## Configuration

All model choices live in
[config/lantern.config.json](config/lantern.config.json) and can be overridden
via environment variables (see [.env.example](.env.example)). Set
`LANTERN_DEVICE=cpu` on machines without a supported GPU, or `LANTERN_ENGINE=mock`
to run the offline simulation.
