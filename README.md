# 🏮 Lantern

### Your eyes, on your device. The camera never leaves your hand.

[![CI](https://github.com/Tonyflam/qvak/actions/workflows/ci.yml/badge.svg)](https://github.com/Tonyflam/qvak/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![On-device](https://img.shields.io/badge/AI-100%25_on--device-green.svg)](remote-apis.json)
[![No build step](https://img.shields.io/badge/build-none_(plain_ESM)-success.svg)](#how-its-built)

**Lantern** is a private, fully **on-device** sight & voice assistant for blind
and low-vision people, built entirely on **[Tether QVAC](https://qvac.tether.io)**
edge-AI. Point your camera and ask — Lantern describes scenes, reads text and
labels aloud, identifies money and medication, warns about hazards, remembers
things for you, and talks back. **No cloud. No account. Nothing leaves your
device** unless you explicitly delegate to a second machine *you* own.

> Built for the **QVAC Hackathon — Unleash Edge AI** (General Purpose track).

---

## For judges — verify in 60 seconds

```bash
npm install
npm run check     # ESLint + 42 no-egress checks + 158 tests, one command
npm run demo      # LANTERN_ENGINE=mock works on ANY machine, no model download
```

- **No cloud, provably.** `npm run verify:offline` statically scans every source
  file and `package.json`, fails the build if any cloud-AI SDK (OpenAI, Anthropic,
  Gemini, Cohere, Pinecone, LangChain, `axios`/`node-fetch`, analytics…) is
  imported, and asserts the server is loopback-only with local P2P fallback.
  Declared in [remote-apis.json](remote-apis.json); enforced in
  [scripts/offline-scan.js](scripts/offline-scan.js).
- **Real on-device proof, not a mock.** [evidence/real-run.qvac.jsonl](evidence/real-run.qvac.jsonl)
  is a committed capture where every line is `"engine":"qvac"`. The mock engine is
  always clearly labelled and can never be mistaken for it.
- **Where to look first:** the deterministic safety spine in
  [src/core/safety.js](src/core/safety.js), the injection guard in
  [src/core/injection-guard.js](src/core/injection-guard.js), and their tests
  ([test/safety.test.js](test/safety.test.js),
  [test/injection-guard.test.js](test/injection-guard.test.js)).

| Judging criterion | Where Lantern delivers |
| ----------------- | ---------------------- |
| Edge-AI / on-device | 100% `@qvac/sdk`; enforced no-egress audit ([scripts/offline-scan.js](scripts/offline-scan.js)). |
| Originality | Accessibility — **white space** across the field; the use-case that needs on-device AI most. |
| Technical depth | Full 8-capability QVAC stack + deterministic safety spine + P2P delegation + on-device RAG. |
| Real-world impact | A daily-use assistant for 250M+ blind & low-vision people. |
| Trust / honesty | `✓ verified` vs `AI estimate` badges; content-free audit log; injection resistance; labelled mock. |
| Reproducibility | No build step; `npm run check`; 0 `npm audit` vulnerabilities. |

See **[Honest limitations](#honest-limitations)** below — we say plainly what is
and isn't done.

---

## Why this matters

A blind person's camera sees their *entire private life* — their home, their
mail, their medication, the faces of their family. Sending that to a cloud AI is
a privacy catastrophe. Lantern proves you don't have to: **every model runs
locally** through QVAC. The most sensitive assistant imaginable becomes the most
private.

And it's original: across the competing submissions, **accessibility was
white space** — nobody else is building the assistant that arguably *needs*
on-device AI more than any other.

## What makes it hard to beat

1. **Authentic full-stack QVAC use.** Lantern genuinely uses the whole edge
   stack — LLM, multimodal vision, OCR, speech-to-text, text-to-speech,
   translation, and embeddings — because a sight-and-voice assistant truly needs
   all of them, not as a checkbox.
2. **Accuracy by construction (a deterministic safety spine).** Money,
   medication doses, and hazards are decided by **transparent code**, not a model
   guess. The LLM only *phrases* verified facts. Results carry a **`✓ verified`**
   vs **`AI estimate`** badge so the user always knows what to trust.
3. **Prompt-injection resistant.** Text captured from the world (a sign that says
   *"ignore your instructions"*) is treated strictly as **data, never
   commands** — read aloud, never obeyed. Enforced in code and covered by tests.
4. **Privacy you can audit.** A JSONL audit log records timing and throughput for
   every on-device inference but **never** records your photos, audio, or text —
   only content-free fingerprints. A committed **real** capture
   ([evidence/real-run.qvac.jsonl](evidence/real-run.qvac.jsonl), every line
   `"engine":"qvac"`) proves the on-device path runs, not just a mock. (Schema:
   [evidence/SCHEMA.md](evidence/SCHEMA.md).)
5. **Live P2P edge.** A light field device (laptop/Pi) can offload heavy vision
   to a **Lantern Hub** you run at home over QVAC's encrypted peer-to-peer link —
   with automatic **local fallback**. The flagship QVAC differentiator, used for
   real.

## Quickstart

> Requires **Node ≥ 22.17** and **npm ≥ 10.9**. `ffmpeg` is needed for voice
> (microphone in / speaker out).
>
> **Linux/Windows real-engine prerequisite — the Vulkan loader.** QVAC's native
> worker links llama.cpp's Vulkan backend and needs the Vulkan **loader** present
> **even when running on CPU**; without it the worker aborts with a cryptic RPC
> timeout (`RPC Initialization times out after 30000 ms`).
> • **Linux** (`libvulkan.so.1`): `sudo apt-get install -y libvulkan1`; with no
> GPU, add `mesa-vulkan-drivers` for a software fallback (`llvmpipe`/`lavapipe`).
> • **Windows** (`vulkan-1.dll`): install or update your GPU driver from Intel,
> AMD, or NVIDIA — **integrated GPUs count and run Vulkan fine**; alternatively
> install the LunarG Vulkan Runtime. With no Vulkan-capable GPU at all, add Mesa
> `lavapipe` (software).
> • **macOS** uses Metal and needs nothing extra. `npm run doctor` checks this.

```bash
npm install
npm run doctor        # check your environment (incl. the Vulkan loader)
npm start             # open http://127.0.0.1:4173
```

The first real run downloads the QVAC models into `~/.qvac/models` (~1 GB each),
then works **fully offline**.

### Try it right now with no models (offline simulation)

```bash
LANTERN_ENGINE=mock npm start         # the UI shows a clear SIMULATION banner
LANTERN_ENGINE=mock npm run demo      # scripted walkthrough of every skill
```

The **mock engine** lets you (and judges) run the whole app and test-suite on any
machine without downloading models. Every simulated output is clearly labelled
(`[MOCK]`, a UI banner, and `"engine":"mock"` in the log) so it can never be
mistaken for real inference.

### Command line

```bash
node src/index.js cli --image photo.jpg --text "what is this?"
node src/index.js cli --text "remember I parked in section B12"
node src/index.js cli --text "where did I park"
```

### Run the Lantern Hub (optional P2P offload target)

```bash
# On your home machine:
npm run hub                 # prints a public key

# On the field device, in .env:
LANTERN_DELEGATE_VISION=true
LANTERN_PROVIDER_PUBLIC_KEY=<the hub's public key>
```

## What Lantern can do

| Say… | Skill | Verified? |
| ---- | ----- | --------- |
| "What's in front of me?" | Describe scene + hazard scan | AI estimate (+ rule-based safety) |
| "Read this." | Read text (OCR) aloud | ✓ verbatim |
| "How much money is this?" | Identify currency | ✓ deterministic |
| "What medication is this?" | Read dose + safety disclaimer | ✓ deterministic |
| "Is it safe ahead?" | Hazard check | ✓ rule-based |
| "What does this say in Spanish?" | OCR + translate | ✓ source shown |
| "Remember I parked in B12." | Personal memory | ✓ stored |
| "Where did I park?" | Recall (semantic search) | ✓ verbatim note |

## Scripts

| Command | What it does |
| ------- | ------------ |
| `npm start` / `npm run web` | Accessible local web app (loopback only). |
| `npm run cli -- ...` | One-shot headless request. |
| `npm run hub` | Run the Lantern Hub P2P provider. |
| `npm run demo` | Scripted walkthrough; writes a **real** audit log. |
| `npm run doctor` | Environment & readiness report. |
| `npm run bench` | Real TTFT / tokens-per-second on your hardware. |
| `npm test` | Vitest suite (158 tests; deterministic spine + injection invariants). |
| `npm run verify:offline` | Static no-egress audit (42 checks; bans cloud-AI SDKs, proves loopback + local P2P fallback). |
| `npm run check` | Everything: lint + offline audit + tests (the one command judges should run). |
| `npm run lint` | ESLint. |

## How it's built

Plain **ES-module JavaScript** with JSDoc types — **no build step**, so it runs
identically on a laptop or a Raspberry Pi and is trivial to reproduce. The only
runtime dependencies are `@qvac/sdk` (the AI) and `express` (the local UI).

```
You ── voice/camera ──▶ Orchestrator ──▶ Skill (agent)
                            │                 │
                     deterministic       QVAC engine  ──▶ on-device models
                     safety spine        (or P2P hub)      (or your Lantern Hub)
                            │                 │
                            └──── content-free audit log ◀┘
```

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the design and
**[QVAC-USAGE.md](QVAC-USAGE.md)** for exactly how each QVAC capability is used.

## Accessibility

Designed screen-reader-first: semantic HTML with ARIA live regions, large
high-contrast controls, full keyboard operation (hold **Space** to talk), honours
`prefers-reduced-motion` and `prefers-contrast`, and — most importantly — works
hands-free by **voice**.

## Privacy & security

- All AI runs on-device; **no cloud AI, no telemetry, no analytics** (see
  [remote-apis.json](remote-apis.json)).
- The web server binds to **127.0.0.1** only.
- The audit log never stores user content.
- Captured photos/audio are written to a temp file only for the duration of one
  request, then deleted.

## Honest limitations

We build a tool blind people might rely on, so we are precise about what it does
**not** do:

- **Lantern is an aid, not a certified safety device.** Hazard detection and the
  scene description help with awareness; they are **not** a substitute for a cane,
  a guide dog, or sighted assistance. The UI says so, and high-stakes answers
  carry a disclaimer.
- **Currency and medication reads are deterministic but best-effort.** They are
  decided by transparent rules over OCR text (so they never *hallucinate* a
  value), but OCR can still misread a worn note or a glare-covered label. Lantern
  shows what it read and asks the user to confirm anything that matters — it will
  not pretend to be a counterfeit detector or a pharmacist.
- **Vision quality is the model's.** Scene descriptions are an `AI estimate` and
  are labelled as such; only the rule-checked facts get a `✓ verified` badge.
- **Real inference needs the QVAC models and the Vulkan loader** (see Quickstart).
  Where those aren't present, the clearly-labelled **mock engine** lets anyone run
  the full app and test-suite — it is a simulation, never real output.
- **P2P offload requires a second machine you own.** Without a Lantern Hub,
  everything runs locally on the one device (which is the default).
- **Languages.** Translation covers the languages the bundled QVAC translation
  model supports; OCR is tuned for Latin-script text today.

## License

[Apache-2.0](LICENSE). Fully open source and reproducible.