/**
 * Deterministic intent classifier.
 *
 * Maps a spoken or typed request to one of Lantern's skills using transparent
 * keyword rules. Routing stays predictable and fully offline; the orchestrator
 * may consult the LLM only when confidence is "low".
 */

/** @typedef {"describe"|"read"|"translate"|"identify"|"remember"|"recall"|"hazard"} Intent */

/** Supported translation target languages (name → ISO code). */
export const LANGUAGES = {
  spanish: "es",
  english: "en",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  dutch: "nl",
  chinese: "zh",
  japanese: "ja",
  korean: "ko",
  arabic: "ar",
  hindi: "hi",
  russian: "ru",
};

const LANG_NAMES = Object.keys(LANGUAGES).join("|");

/**
 * Ordered rules. Earlier rules win, so more specific intents (translate, read)
 * are checked before broad ones (describe).
 * @type {Array<{intent: Intent, re: RegExp}>}
 */
const RULES = [
  { intent: "translate", re: new RegExp(`\\b(translate|in (?:${LANG_NAMES})\\b|what does (?:this|it) say in)\\b`, "i") },
  { intent: "read", re: /\b(read (?:this|the|it|that|aloud)|read it|what does (?:this|that|it|the)\b.*?\bsay\b|the text)\b/i },
  { intent: "remember", re: /\b(remember|note that|save this|keep this|don'?t forget|make a note|store this)\b/i },
  { intent: "recall", re: /\b(recall|where (?:did|is|are|do)|what(?:'?s| is| are| was) my\b|what did i (?:say|note|put)|do i have|remind me|find my|did i)\b/i },
  { intent: "hazard", re: /\b(is it safe|safe to|any (?:danger|hazard|hazards)|hazard|dangerous|obstacle|can i (?:walk|step|go))\b/i },
  { intent: "identify", re: /\b(what (?:is|are) (?:this|that|these)|identify|how much (?:money|is this)|what (?:denomination|currency|colou?r|medication|medicine|pill|note|bill)|which (?:note|bill|medicine))\b/i },
  { intent: "describe", re: /\b(describe|what(?:'?s| is) (?:in front|around|there|here|this)|look around|what do you see|where am i|surroundings)\b/i },
];

/**
 * Classify a request into an intent with confidence and extracted slots.
 * @param {string} text
 * @returns {{ intent: Intent, confidence: "high"|"low", matched: boolean, slots: { language?: string, languageName?: string, note?: string } }}
 */
export function classifyIntent(text) {
  const str = String(text || "").trim();
  /** @type {{language?: string, languageName?: string, note?: string}} */
  const slots = {};

  // Slot: translation target language.
  const langMatch = str.match(new RegExp(`\\b(?:in|to|into) (${LANG_NAMES})\\b`, "i")) || str.match(new RegExp(`\\b(${LANG_NAMES})\\b`, "i"));
  if (langMatch) {
    const name = langMatch[1].toLowerCase();
    slots.languageName = name;
    slots.language = LANGUAGES[/** @type {keyof typeof LANGUAGES} */ (name)];
  }

  for (const rule of RULES) {
    if (rule.re.test(str)) {
      // Slot: note text for "remember ...".
      if (rule.intent === "remember") {
        const noteMatch = str.match(/\b(?:remember(?: that)?|note that|save this|keep this|make a note(?: that)?|store this)\b[:,]?\s*(.*)/i);
        if (noteMatch && noteMatch[1]) slots.note = noteMatch[1].trim();
      }
      return { intent: rule.intent, confidence: "high", matched: true, slots };
    }
  }

  // Fallback: describe the scene (most common request), but flag low confidence
  // so the orchestrator can ask the LLM to re-route if needed.
  return { intent: "describe", confidence: "low", matched: false, slots };
}
