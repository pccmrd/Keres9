// ═══ late-bound callbacks ═══════════════════════════════════════════════
// Low-level simulation modules call these instead of importing UI / game
// layers directly. main.js wires the real implementations at boot.
const noop = () => {};
export const hooks = {
  toast: noop,          // (msg, kind)
  closeStation: noop,   // ()
  onDock: noop,         // (body, type)
  onTouch: noop,        // (ship) — came to rest on bare regolith
  onCatalog: noop,      // (rock)
  shipLost: noop,       // (ship) — a player-owned hull was destroyed
  playerDied: noop,     // ()
  armor: () => 1,       // () → incoming-damage multiplier for the player (demo director)
};
