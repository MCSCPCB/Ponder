/**
 * Java PonderLocalization. Fixed UI text lives in RP/texts/*.lang under Java's keys and is
 * sent to the client as { translate } so the game resolves it. Scene text (titles, text
 * windows, tags) is registered in script with the scene, as Java's storyboards do.
 */
export const LANG_PREFIX = "ponder.";
export const UI_PREFIX = `${LANG_PREFIX}ui.`;
export const SHARED_PREFIX = `${LANG_PREFIX}ponder.shared.`;

/** Lang key for fixed UI text, e.g. ui("next_up") -> "ponder.ui.next_up". */
export const ui = key => `${UI_PREFIX}${key}`;
/** Lang key for shared text, e.g. "sneak_and". */
export const shared = key => `${SHARED_PREFIX}${key}`;

/** A raw message the client translates. */
export const translate = key => ({ translate: key });
/** Concatenates literal strings and raw messages into one raw message. */
export const raw = (...parts) => ({
  rawtext: parts.filter(part => part !== undefined && part !== "").map(part => typeof part === "string" ? { text: part } : part),
});

/**
 * Shared text drawn into the world as glyphs. Scripts cannot read the client's lang, so the
 * strings the world needs are registered here, keyed like Java's shared text.
 */
const SHARED_TEXT = {
  en_US: { sneak_and: "Sneak +", ctrl_and: "Ctrl +" },
  zh_CN: { sneak_and: "潜行 +", ctrl_and: "Ctrl +" },
};

export const localeFor = player => {
  try { return player.clientSystemInfo.locale?.startsWith("zh") ? "zh_CN" : "en_US"; }
  catch { return "en_US"; }
};
/** Scene text is a literal or { en_US, zh_CN }. */
export function localize(value, locale = "en_US") {
  if (typeof value === "string") return value;
  if (!value) return "";
  return value[locale] ?? value.en_US ?? value.zh_CN ?? "";
}
export const sharedText = (key, locale = "en_US") => SHARED_TEXT[locale]?.[key] ?? SHARED_TEXT.en_US[key] ?? key;
