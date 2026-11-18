// ═══ late-bound callbacks ═══════════════════════════════════════════════
// Low-level simulation modules call these instead of importing UI / game
// layers directly. main.js wires the real implementations at boot.
const noop = () => {};
export const hooks = {
  toast: noop,          // (msg, kind)
  closeStation: noop,   // ()
  onDock: noop,         // (body, type)
  onKill: noop,         // (victimShip, killerShip|null)
  playerDied: noop,     // ()
  rescue: noop,         // (pod pick)
  armor: () => 1,       // () → incoming-damage multiplier for the player (demo director)
};
