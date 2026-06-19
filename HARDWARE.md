# Hardware & on-device evidence

Lantern runs entirely on-device via Tether QVAC. Fill in this template with your
machine's specs and attach the screenshots/log excerpts listed below — this is
the hardware evidence for the submission.

## Test machine (field device)

| Item             | Your value                                  |
| ---------------- | ------------------------------------------- |
| Track            | General Purpose (laptop, ≤ 32 GB RAM)       |
| Device           | _e.g. MacBook Air M2 / ThinkPad X1_         |
| OS               | _e.g. macOS 14.5 / Ubuntu 24.04_            |
| CPU              | _e.g. Apple M2 (8-core) / Intel i7-1260P_   |
| GPU / accelerator| _e.g. Apple Metal / none (CPU only)_        |
| RAM              | _e.g. 16 GB_                                 |
| Node.js          | _output of `node --version` (≥ 22.17)_      |
| QVAC SDK         | `@qvac/sdk` _version from package-lock_     |

## Optional second machine (Lantern Hub — P2P provider)

| Item        | Your value                                |
| ----------- | ----------------------------------------- |
| Device      | _e.g. desktop with RTX 4070_              |
| Role        | P2P provider for delegated vision         |
| Public key  | _printed by `npm run hub` (first 8 chars)_|

## Models used (cached under `~/.qvac/models`)

| Capability | Model constant                          |
| ---------- | --------------------------------------- |
| LLM        | `LLAMA_3_2_1B_INST_Q4_0`                |
| Vision     | `SMOLVLM2_500M_MULTIMODAL_Q8_0` (+ mmproj) |
| OCR        | `OCR_LATIN_RECOGNIZER_1`                |
| STT        | `WHISPER_TINY` (+ `VAD_SILERO_5_1_2`)   |
| TTS        | `TTS_EN_SUPERTONIC_Q8_0`                |
| Translate  | `BERGAMOT_EN_ES`                        |
| Embeddings | `GTE_LARGE_FP16`                        |

## Evidence to attach

1. **System profiler screenshot** — your OS "About this Mac" / `System
   Information` / `lscpu` + `free -h` showing CPU/GPU/RAM.
2. **`npm run doctor` output** — proves Node, ffmpeg, the QVAC SDK, and the model
   cache are present.
3. **`npm run bench` output** — real TTFT and tokens/second on your hardware.
4. **A real `logs/lantern-<date>.jsonl`** from your demo run — every inference
   line tagged `"engine":"qvac"` (see `evidence/SCHEMA.md`).
5. **Network capture (optional but powerful)** — run the demo with Wi-Fi/Ethernet
   **off** after models are cached, to prove inference is fully offline.

## Measured performance (fill in after `npm run bench`)

| Capability | TTFT (ms) | Tokens/s | Notes |
| ---------- | --------- | -------- | ----- |
| chat       |           |          |       |
| vision     |           |          |       |
| ocr        | —         | —        | ms/image |
| tts        | —         | —        | ms/utterance |

## Reference numbers — CPU-only dev container (NOT the target machine)

These are **real** QVAC measurements captured during development on a constrained
2-core Linux container with **no GPU** (software Vulkan / `llvmpipe`). They prove
the real-engine path works end-to-end and set a worst-case floor; your laptop or
Hub will be substantially faster. A captured log of the demo walkthrough is
committed at [evidence/real-run.qvac.jsonl](evidence/real-run.qvac.jsonl) (every
line `"engine":"qvac"`).

| Capability | Model | Cold load | Per-op | Throughput |
| ---------- | ----- | --------- | ------ | ---------- |
| Embeddings | `GTE_LARGE_FP16` (1024-d) | ~7.5 s | ~185–265 ms / embed | — |
| LLM chat   | `LLAMA_3_2_1B_INST_Q4_0`  | ~48 s | ttft ~1.6 s | 11.5 tok/s |
| Vision     | `SMOLVLM2_500M…Q8_0` (+ mmproj) | ~3 s (cached) | ttft ~7.3 s, decode ~0.95 s | 22–23 tok/s |
| OCR        | `OCR_LATIN_RECOGNIZER_1`  | ~1–7 s | ~5.7–6.2 s / image | 5–7 blocks |
| TTS        | `TTS_EN_SUPERTONIC_Q8_0`  | ~13 s | ~1.95 s for 4.0 s audio | 44.1 kHz PCM |
| Translate  | `BERGAMOT_EN_ES`          | <1 s (cached) | ~0.42 s / sentence | — |
| STT        | `WHISPER_TINY`            | — | ~23 s / clip (CPU, tiny) | — |

> Verified behaviours on this run: remember→recall RAG matched at **91–93 %**
> cosine; a `$20` note read as **verified** currency from OCR text (robust to the
> recogniser mangling "USD"); medication dose/frequency extracted
> deterministically; a TTS→STT voice round-trip returned *"The front door code is
> 1975."*; and prompt-injection text was read aloud but **never obeyed**.

> Cold load includes the one-time model download into `~/.qvac/models`; warm runs
> load from cache.

> **Prerequisite reminder (Linux/Windows):** the QVAC native worker needs the
> Vulkan loader (`libvulkan.so.1`) present even on CPU. `npm run doctor` checks
> it; install `libvulkan1` (+ `mesa-vulkan-drivers` for a software fallback) if
> it reports missing.
