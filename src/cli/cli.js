/**
 * Headless CLI — one-shot requests for demos, scripting, and CI smoke tests.
 *
 *   lantern cli --text "remember I parked in B12"
 *   lantern cli --image photo.jpg --text "what is this?"
 *   lantern cli --image sign.jpg --text "read this" --speak
 */
import { playWav, pcmInt16ToWav, hasFfplay } from "../engine/audio-utils.js";
import { createApp } from "../app.js";

/**
 * @param {{ cfg: import("../engine/types.js").LanternConfig, logger: import("../logger.js").AuditLogger, args: string[] }} deps
 */
export async function runCli({ cfg, logger, args }) {
  const opts = parseArgs(args);
  if (opts.help) {
    printHelp();
    return;
  }

  const app = await createApp({ cfg, logger });
  try {
    const result = await app.orchestrator.handle({ text: opts.text, imagePath: opts.image });
    printResult(result);

    if (opts.speak && result.speech) {
      const tts = await app.engine.synthesize({ text: result.speech });
      if (hasFfplay()) {
        playWav(pcmInt16ToWav(tts.pcm, tts.sampleRate));
      } else {
        console.log("\n(install ffmpeg to hear spoken output: `npm run doctor`)");
      }
    }
  } finally {
    await app.close();
  }
}

/** @param {string[]} args */
function parseArgs(args) {
  const opts = { text: "", image: /** @type {string|null} */ (null), speak: false, help: false };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--text":
      case "-t":
        opts.text = args[++i] || "";
        break;
      case "--image":
      case "-i":
        opts.image = args[++i] || null;
        break;
      case "--speak":
      case "-s":
        opts.speak = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (!a.startsWith("-")) positional.push(a);
    }
  }
  if (!opts.text && positional.length) opts.text = positional.join(" ");
  return opts;
}

/** @param {import("../engine/types.js").SkillResult & {intent?: string, confidence?: string}} r */
function printResult(r) {
  const mark = r.verified ? "✓ verified" : "~ AI estimate";
  console.log("\n──────────────────────────────────────────────");
  if (r.intent) console.log(`intent : ${r.intent}${r.confidence ? ` (${r.confidence})` : ""}`);
  console.log(`skill  : ${r.skill}  [${mark}]`);
  console.log("──────────────────────────────────────────────");
  console.log(r.speech || "(no response)");
  if (r.warning) console.log(`\n⚠ ${r.warning}`);
  if (r.detail && r.detail !== r.speech) {
    console.log("\n--- detail ---");
    console.log(r.detail);
  }
  console.log("");
}

function printHelp() {
  console.log(`Lantern CLI

Usage:
  lantern cli [--text "..."] [--image <path>] [--speak]

Options:
  -t, --text   The spoken/typed request (or pass it as the final argument).
  -i, --image  Path to an image for vision/OCR skills.
  -s, --speak  Speak the reply aloud with TTS (needs ffmpeg/ffplay).
  -h, --help   Show this help.

Examples:
  lantern cli "remember I parked in B12"
  lantern cli --image photo.jpg --text "what is this?"
  lantern cli --image sign.jpg --text "read this" --speak`);
}
