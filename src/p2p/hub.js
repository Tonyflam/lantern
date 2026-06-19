/**
 * Lantern Hub — a QVAC P2P provider you run on a trusted machine (your home
 * laptop/desktop). A lightweight field device (a laptop, phone, or Raspberry Pi
 * in your bag) can then offload heavy vision inference to the hub over QVAC's
 * encrypted hyperswarm link, while still falling back to fully local inference if
 * the hub is unreachable.
 *
 * - Set QVAC_HYPERSWARM_SEED to keep a STABLE hub identity (public key) across
 *   restarts, so the field device's config keeps working.
 * - Restrict who may use the hub with an allow-list (LANTERN_HUB_ALLOW, comma
 *   separated, or config.p2p.allow). An empty allow-list means any peer that
 *   knows the hub's public key may connect — set it for real deployments.
 */

/**
 * Start the hub provider.
 * @param {{ cfg: import("../engine/types.js").LanternConfig, logger: import("../logger.js").AuditLogger }} deps
 * @returns {Promise<{ publicKey: string, allow: string[], stop: () => Promise<void> }>}
 */
export async function startHub({ cfg, logger }) {
  let sdk;
  try {
    sdk = await import("@qvac/sdk");
  } catch (err) {
    throw new Error(
      "Lantern Hub requires @qvac/sdk on a QVAC-supported platform (Node >= 22.17).\n" +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const allow = parseAllowList(cfg);
  const elapsed = logger.startTimer();
  // IMPORTANT: an "allow" firewall with an EMPTY list rejects every peer. To allow
  // any peer that knows the hub's public key, the firewall must be omitted entirely
  // (this mirrors the official QVAC provider example). Only enable the allow-list
  // when the user has actually specified one or more consumer public keys.
  const { publicKey } = await sdk.startQVACProvider(
    allow.length ? { firewall: { mode: "allow", publicKeys: allow } } : {},
  );
  logger.event({
    op: "hub_start",
    engine: "qvac",
    ok: true,
    durationMs: elapsed(),
    meta: { publicKey, allowCount: allow.length },
  });

  return {
    publicKey,
    allow,
    async stop() {
      try {
        await sdk.stopQVACProvider();
      } finally {
        logger.event({ op: "hub_stop", engine: "qvac", ok: true });
      }
    },
  };
}

/**
 * @param {import("../engine/types.js").LanternConfig} cfg
 * @returns {string[]}
 */
function parseAllowList(cfg) {
  const fromEnv = String(process.env.LANTERN_HUB_ALLOW || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fromCfg = Array.isArray(cfg.p2p?.allow) ? cfg.p2p.allow : [];
  return [...new Set([...fromCfg, ...fromEnv])];
}
