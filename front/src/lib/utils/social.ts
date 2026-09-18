// Client-side social constants — mirrors the server allowlist in
// $lib/server/engine.ts. The server re-validates everything; these are
// display-only so the UI never offers an emoji the server would reject.

/** Must stay in sync with EMOJI_ALLOWLIST on the server. */
export const EMOJI_PRESETS = ['😂', '😭', '😡', '🎉', '👍', '👏', '🔥', '💸'] as const;

/** Must stay in sync with REACT_COOLDOWN_MS on the server. */
export const REACT_COOLDOWN_MS = 3000;

/** How long a received reaction floats over the board. */
export const FLOAT_MS = 4000;

/** Max concurrent floats — oldest are dropped beyond this. */
export const FLOAT_MAX = 5;
