// ═══ shared mutable game state ═══════════════════════════════════════════
// ES-module live bindings: every importer sees the current value of these
// `let`s; only this module may reassign them (through the setters).
export let W = null;   // world: bodies, ships, picks, fx …
export let G = null;   // run/meta state: credits, career, story, missions, mode …
export let pl = null;  // the ship the player is currently flying (null on foot / riding)
export let ev = null;  // the player's suit (null when aboard a ship or riding)
export let AG = [];    // named NPC agents

export const setW = v => (W = v);
export const setG = v => (G = v);
export const setPl = v => (pl = v);
export const setEv = v => (ev = v);
export const setAG = v => (AG = v);

/** camera; `rot` turns the view so local "up" (away from the Moon) is screen-up */
export const cam = { x: 0, y: -3000, z: 1, tz: 1, rot: 0, shake: 0, lx: 0, ly: 0, lt: 0, flash: 0 };

/** player-cockpit transient state */
export const PC = {
  tgt: null, scan: false, freq: 110, lock: 0, lockC: null, list: [], sig: 0, assist: null, survey: null,
  ctx: { l: '—', f: null, ok: false }, alt: null, breach: null, match: false, hints: new Set(), traj: null,
};

/** the control frame obeyed this tick — filled from human input or the AI pilot (stick axes are SCREEN-frame) */
export const CTL = { lx: 0, ly: 0, rx: 0, ry: 0, thr: 0, fire: false, mine: false, brake: false, ai: false };

/** whatever the camera and HUD should follow: suit, ship, or the vehicle the player rides */
export const focus = () => ev || pl || (G && G.ride && G.ride.v) || null;
