#!/usr/bin/env node
/**
 * Lantern — a private, fully on-device sight & voice assistant for blind and
 * low-vision people, built entirely on Tether's QVAC edge-AI SDK.
 *
 * Modes:
 *   lantern web        Start the accessible local web app (default).
 *   lantern cli ...    One-shot headless request (see src/cli/cli.js).
 *   lantern hub        Run the Lantern Hub P2P provider (offload target).
 *
 * The camera never leaves your hand: all inference runs locally, or is delegated
 * only to a peer you control over an encrypted P2P link.
 */
import { loadConfig } from "./config.js";
import { AuditLogger } from "./logger.js";

async function main() {
  const [, , modeArg, ...rest] = process.argv;
  const mode = modeArg || "web";
  const cfg = loadConfig();
  const logger = new AuditLogger({
    dir: cfg.logging.dir,
    console: cfg.logging.console,
    root: cfg.__root,
    engine: cfg.engine,
  });

  switch (mode) {
    case "web": {
      const { startServer } = await import("./web/server.js");
      await startServer({ cfg, logger });
      break;
    }
    case "cli": {
      const { runCli } = await import("./cli/cli.js");
      await runCli({ cfg, logger, args: rest });
      break;
    }
    case "hub": {
      const { startHub } = await import("./p2p/hub.js");
      const hub = await startHub({ cfg, logger });
      console.log("\n  Lantern Hub is running.");
      console.log("  Give this public key to your field device as LANTERN_PROVIDER_PUBLIC_KEY:\n");
      console.log("      " + hub.publicKey + "\n");
      if (!hub.allow.length) {
        console.log("  ⚠  No allow-list set. Any peer with this key can connect.");
        console.log("     Set LANTERN_HUB_ALLOW to your device's public key for production.\n");
      }
      console.log("  Press Ctrl+C to stop.\n");
      const shutdown = async () => {
        await hub.stop();
        logger.end();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      break;
    }
    case "--help":
    case "-h":
    case "help":
      printHelp();
      break;
    default:
      console.error(`Unknown mode "${mode}".`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`Lantern — on-device sight & voice assistant (QVAC)

Usage: lantern <mode>

Modes:
  web        Start the accessible local web app (default).
  cli ...    One-shot headless request, e.g.:
               lantern cli --image photo.jpg --text "what is this?"
               lantern cli --text "remember I parked in B12"
  hub        Run the Lantern Hub P2P provider for delegated vision.

Environment: copy .env.example to .env to configure engine/device/port.
Set LANTERN_ENGINE=mock to run the offline simulation (no models needed).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
