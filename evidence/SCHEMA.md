# Audit log schema

Lantern writes one JSON object per line (JSONL) to `logs/lantern-<date>.jsonl`
for every model load/unload and every inference. The log is designed to be
**verifiable evidence** that work happened on-device, while **never** recording
what the user saw, said, or read.

## Privacy guarantee

The log contains **no user content** — no photos, no audio, no recognized text,
no transcripts. At most it records a *content-free fingerprint*:

```json
"input": { "chars": 142, "sha256_8": "9f3a1c08" }
```

i.e. *how much* text was processed and an 8-character hash prefix — enough to
correlate a run, never enough to reconstruct the content.

## Common fields (every line)

| Field       | Type    | Meaning                                                        |
| ----------- | ------- | -------------------------------------------------------------- |
| `ts`        | string  | ISO-8601 timestamp.                                            |
| `sessionId` | string  | UUID for the process/session.                                  |
| `engine`    | string  | `"qvac"` (real on-device) or `"mock"` (offline simulation).    |
| `op`        | string  | Operation — see below.                                         |
| `ok`        | boolean | Whether the operation succeeded.                               |

## Operation-specific fields

| Field             | Appears on            | Meaning                                          |
| ----------------- | --------------------- | ------------------------------------------------ |
| `capability`      | inference ops         | `llm`, `vision`, `ocr`, `stt`, `tts`, `translate`, `embeddings`. |
| `model`           | load / inference      | Model identifier (constant name).                |
| `device`          | load / inference      | `gpu` or `cpu`.                                   |
| `delegated`       | vision                | `true` if run on a P2P hub, else `false`.        |
| `durationMs`      | timed ops             | Wall-clock duration.                             |
| `ttftMs`          | completion            | Time to first token.                             |
| `tokens`          | completion            | Tokens generated.                                |
| `tokensPerSecond` | completion            | Throughput.                                      |
| `input`           | ocr / stt / chat      | Content-free fingerprint (see above).            |
| `meta`            | various               | Extra structured detail (block counts, etc.).    |
| `error`           | failures (`ok:false`) | Error message.                                   |

## `op` values

- `session_start`, `session_end` — process lifecycle.
- `engine_init`, `engine_close` — backend lifecycle.
- `model_download` — periodic download progress (`meta.percentage`).
- `model_load`, `model_unload` — model lifecycle with timing.
- `completion`, `ocr`, `transcribe`, `tts`, `translate`, `embed` — inference.
- `skill`, `skill_skipped`, `skill_error` — orchestrator routing outcomes.
- `injection_detected` — untrusted text contained instruction-like wording
  (recorded as a count only; the text is never logged and is never obeyed).
- `hub_start`, `hub_stop` — P2P provider lifecycle.
- `server_start`, `server_stop`, `request_error` — web server lifecycle.

## Verifying a run

1. Run `npm run demo` (or use the app), then open the newest file in `logs/`.
2. Confirm every inference line is tagged `"engine":"qvac"` for a real run.
3. Confirm `device`, `durationMs`, `ttftMs`, and `tokensPerSecond` are present
   on `completion` lines — these are genuine on-device performance numbers.
4. Confirm **no** field anywhere contains readable user content.

> A real, freshly-generated log is the authoritative evidence. The file
> `sample-run.example.jsonl` in this folder is an **illustrative** excerpt
> (clearly tagged `"engine":"mock"`); regenerate your own with `npm run demo`.

## Committed real-engine capture

`real-run.qvac.jsonl` in this folder is a **genuine** capture from the real QVAC
engine (every line `"engine":"qvac"`), recorded on a CPU-only Linux container
with software Vulkan (`llvmpipe`). It shows a full remember → recall flow:
`model_download` → `model_load` → `embed` → `skill` → `model_unload` for
`GTE_LARGE_FP16`, with the note recalled at **91 %** cosine similarity. It
contains **no** user content — only content-free fingerprints, timing, and model
metadata — and demonstrates that the on-device path runs for real, not just the
mock. (See [../HARDWARE.md](../HARDWARE.md) for the measured numbers, including
the `LLAMA_3_2_1B_INST_Q4_0` chat run at ttft 1625 ms / 11.5 tok/s.)
