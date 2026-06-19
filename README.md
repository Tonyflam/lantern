# 🏮 Lantern

### Your eyes, on your device. The camera never leaves your hand.

**Lantern** is a private, fully **on-device** sight & voice assistant for blind
and low-vision people, built entirely on **[Tether QVAC](https://qvac.tether.io)**
edge-AI. Point your camera and ask — Lantern describes scenes, reads text and
labels aloud, identifies money and medication, warns about hazards, remembers
things for you, and talks back. **No cloud. No account. Nothing leaves your
device** unless you explicitly delegate to a second machine *you* own.

> Built for the **QVAC Hackathon — Unleash Edge AI** (General Purpose track).

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
> worker links llama.cpp's Vulkan backend and needs `libvulkan.so.1` present
> **even when running on CPU**; without it the worker aborts with a cryptic RPC
> timeout. On Debian/Ubuntu: `sudo apt-get install -y libvulkan1`. With no GPU,
> add `mesa-vulkan-drivers` for a software fallback (`llvmpipe`). macOS uses
> Metal and needs nothing extra. `npm run doctor` checks this for you.

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
| `npm test` | Vitest suite (44 tests; deterministic spine + injection invariants). |
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

## License

[Apache-2.0](LICENSE). Fully open source and reproducible.