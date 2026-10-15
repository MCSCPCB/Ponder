/**
 * Java PonderLocalization. Fixed UI text lives in RP/texts/*.lang under Java's keys and is
 * sent to the client as { translate } so the game resolves it.
 */
export const LANG_PREFIX = "ponder.";
export const UI_PREFIX = `${LANG_PREFIX}ui.`;

/** Lang key for fixed UI text, e.g. ui("pondering") -> "ponder.ui.pondering". */
export const ui = key => `${UI_PREFIX}${key}`;

/** A raw message the client translates. */
export const translate = (key, ...args) => args.length ? { translate: key, with: args.map(String) } : { translate: key };
/** Concatenates literal strings and raw messages into one raw message. */
export const raw = (...parts) => ({
  rawtext: parts.filter(part => part !== undefined && part !== "").map(part => typeof part === "string" ? { text: part } : part),
});
