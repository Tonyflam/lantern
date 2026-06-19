/**
 * Consumer-side P2P helpers.
 *
 * Builds the delegate config Lantern uses to offload the heavy vision model to a
 * trusted "Lantern Hub" over QVAC's encrypted peer-to-peer link — always with
 * local fallback so the field device keeps working if the hub is unreachable.
 * This is the single source of truth for delegation, shared by the engine and UI.
 */

/**
 * @param {import("../engine/types.js").LanternConfig} cfg
 * @returns {{ providerPublicKey: string, timeout: number, fallbackToLocal: boolean } | null}
 */
export function buildVisionDelegate(cfg) {
  const p2p = cfg.p2p || {};
  if (p2p.delegateVision && p2p.providerPublicKey) {
    return {
      providerPublicKey: p2p.providerPublicKey,
      timeout: p2p.timeoutMs ?? 60000,
      fallbackToLocal: p2p.fallbackToLocal !== false,
    };
  }
  return null;
}

/**
 * Human-readable, content-free summary of the current delegation setup.
 * @param {import("../engine/types.js").LanternConfig} cfg
 * @returns {string}
 */
export function delegationSummary(cfg) {
  const d = buildVisionDelegate(cfg);
  if (!d) return "Vision runs locally on this device.";
  const key = d.providerPublicKey.slice(0, 8);
  return `Vision is delegated to hub ${key}… (timeout ${d.timeout}ms, ${d.fallbackToLocal ? "local fallback on" : "no fallback"}).`;
}
