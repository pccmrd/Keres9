// ═══ tuning constants & static data tables ═══════════════════════════════
// KERES-9 // CATALOG ZERO — the world is a slice of cislunar space seen
// edge-on. The Moon sits at the origin. Everything is simulated in a frame
// that co-rotates with the synchronous orbit, so parked bodies, the orbital
// station and the cable lift hang still while the physics stays honest:
// gravity falls off with altitude, centrifugal and Coriolis terms appear,
// and a ship has to *climb* out of the well to reach the prospecting band.

const RM = 3000;            // mean lunar radius (m, game scale)
const G0 = 4.0;             // surface gravity before rotation (m/s²)
const GM = G0 * RM * RM;    // gravitational parameter
const RS = 4500;            // synchronous radius: the prospecting band
const OM = Math.sqrt(GM / (RS * RS * RS)); // frame angular velocity (rad/s)

export const C = {
  RM, GM, RS, OM,
  BAND: 420,                 // half-thickness of the band where bodies are parked
  TH0: -Math.PI / 2,         // longitude of Shackleton Rim (home) — straight "up" on screen
  CS: 3, SS: 2.5, TS: 4,     // cell size: rock, ship, station
  DT: 1 / 60,
  DOCK: { v: 2.5, a: 0.18, l: 10, r: 0.15, d: 11 },
  LAND: { v: 2.2, a: 0.26, l: 10, r: 0.15, d: 10 },
  TOUCH: { v: 3.2, a: 0.42 },   // bare-regolith touchdown limits (gear down)
  ANCH: { v: 3, d: 18 },
  SCAN: { rng: 520, cone: 0.42, band: 4.5, survey: 2.6 },
  MINE: { rng: 95, dps: 30 },
  CUT: { rng: 24, dps: 15 },    // EVA hand cutter
  EVA: { acc: 15, air: 150, ping: 120, walk: 13, sack: 8 },
  LIFT: { v: 78, a: 7 },
  SHIFT: 240,                    // crew-shift length (s)
};

export const PAL = {
  amber: '#ffb347', ember: '#ff8c1a', rust: '#c96f2f', cyan: '#53d9ff', red: '#ff4a3d', green: '#6df08f',
  gold: '#ffd166', ice: '#a8ecff', bio: '#8cff9e', mag: '#ff5ec4', text: '#d8e2ec', dim: '#7d8fa3', steel: '#41546b',
  helion: '#ff7a3d',
};
/** faction / operator colours */
export const FC = { selene: '#53d9ff', crew: '#ffb347', helion: '#ff7a3d', transit: '#d8e2ec', rim: '#6df08f', free: '#d8e2ec' };

/** terrain materials (index = sol value) */
export const MAT = [null,
  { hp: 26, c: '#5a5148' },                       // 1 rock
  { hp: 60, c: '#3f3a36' },                       // 2 dense rock
  { hp: 16, c: '#bfe8f2', ore: 'ice' },           // 3 water ice
  { hp: 46, c: '#c98a5b', ore: 'fe' },            // 4 nickel-iron
  { hp: 80, c: '#ffd166', ore: 'pgm' },           // 5 platinum-group
  { hp: 52, c: '#c77dff', ore: 'ree' },           // 6 rare-earth crystal
  { hp: 110, c: '#8b98a8', ore: 'parts' },        // 7 structure / hull plate
  { hp: 12, c: '#7fa88f', ore: 'vol' },           // 8 frozen volatiles (comets)
];
export const FLR = ['', '#10141d', '#151c28', '#121824', '#0d1119', '#12202c', '#141c18', '#171226', '#1a2028'];

/** trade goods */
export const GD = {
  ice: { n: 'Water Ice', p: 14, c: '#a8ecff', m: 1 },
  fe: { n: 'Nickel-Iron', p: 20, c: '#c98a5b', m: 1 },
  vol: { n: 'Comet Volatiles', p: 28, c: '#7fa88f', m: 1 },
  pgm: { n: 'Platinum Group', p: 92, c: '#ffd166', m: 1 },
  ree: { n: 'Rare-Earth Crystal', p: 130, c: '#c77dff', m: 1 },
  food: { n: 'Greenhouse Food', p: 20, c: '#8cff9e', m: 1 },
  parts: { n: 'Fab Parts', p: 36, c: '#8b98a8', m: 1 },
  fuel: { n: 'Propellant', p: 2.5, c: '#ffb347', m: 1 },
  core: { n: 'KERES-9 Core Shard', p: 260, c: '#53d9ff', m: 1, story: 1 },
};

/** ship modules */
export const MD = {
  cock: { hp: 40, c: '#3f6f8f' }, hull: { hp: 30, c: '#41546b' }, eng: { hp: 35, c: '#6b5a3f' }, rcs: { hp: 15, c: '#5a6a7c' },
  cargo: { hp: 25, c: '#6b6156' }, fuel: { hp: 25, c: '#7d5a2f' }, clamp: { hp: 20, c: '#8a6a2f' }, gear: { hp: 18, c: '#4f5a68' },
  mine: { hp: 22, c: '#1f6f8f' }, scan: { hp: 18, c: '#2f6f7d' }, hab: { hp: 25, c: '#4f6f5a' }, gun: { hp: 22, c: '#7d3a34' },
};

/** hull classes: thrust (N-ish), rcs accel, torque, base cargo/fuel, fuel burn at full throttle */
export const CLS = {
  wren: { n: 'WREN-class orbital tug', thr: 34, rcs: 2.2, tq: 2.4, cargo: 26, fuel: 100, burn: 0.55, gear: false, price: 2400 },
  hare: { n: 'HARE-class surface lander', thr: 215, rcs: 2.6, tq: 3, cargo: 44, fuel: 150, burn: 2.6, gear: true, price: 6500 },
  mule: { n: 'MULE crew shuttle', thr: 120, rcs: 3, tq: 2.6, cargo: 60, fuel: 400, burn: 0.4, gear: true },
  hauler: { n: 'ore hauler', thr: 140, rcs: 4, tq: 2.4, cargo: 60, fuel: 400, burn: 0.4, gear: true },
  pros: { n: 'prospector', thr: 60, rcs: 4, tq: 2.6, cargo: 30, fuel: 300, burn: 0.4, gear: false },
  lander: { n: 'colony lander', thr: 230, rcs: 3, tq: 3, cargo: 40, fuel: 600, burn: 0.6, gear: true },
  tug: { n: 'automated haul engine', thr: 60, rcs: 2, tq: 1.6, cargo: 0, fuel: 1e5, burn: 0, gear: false },
  drone: { n: 'catalog drone', thr: 40, rcs: 6, tq: 3, cargo: 0, fuel: 1e5, burn: 0, gear: false },
};

// ─── gravity in the co-rotating frame ───────────────────────────────────
/** acceleration on a body at (x,y) moving (vx,vy) — Newtonian gravity + centrifugal + Coriolis */
export function gacc(x, y, vx, vy, out) {
  const r2 = x * x + y * y, r = Math.sqrt(r2) || 1, g = -GM / r2 + OM * OM * r;
  out.x = (g * x) / r + 2 * OM * vy;
  out.y = (g * y) / r - 2 * OM * vx;
  return out;
}
/** effective radial pull (+ = toward the Moon) at radius r */
export const geff = r => GM / (r * r) - OM * OM * r;
/** helpers in polar terms */
export const radius = (x, y) => Math.sqrt(x * x + y * y);
export const lon = (x, y) => Math.atan2(y, x);
export const polar = (th, r) => ({ x: Math.cos(th) * r, y: Math.sin(th) * r });
/** unit "up" (away from the Moon) at a point */
export const upv = (x, y) => { const r = Math.sqrt(x * x + y * y) || 1; return { x: x / r, y: y / r }; };
