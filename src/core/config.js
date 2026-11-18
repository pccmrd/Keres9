// ═══ tuning constants & static data tables ═══════════════════════════════
export const C = {
  W: 8000, H: 6000,          // sector size (m)
  CS: 3, SS: 2.5, TS: 4,     // cell size: rock, ship, station
  G: 1.1, DT: 1 / 60, DEBT: 25000,
  DOCK: { v: 2.5, a: 0.18, l: 10, r: 0.15, d: 11 },
  LAND: { v: 1.8, a: 0.22, l: 9, r: 0.12, d: 9 },
  ANCH: { v: 3, d: 18 },
  SCAN: { rng: 520, cone: 0.42, band: 4.5 },
  MINE: { rng: 95, dps: 30 },
  GUN: { rof: 0.15, spd: 280, dmg: 9, life: 1.4 },
  EVA: { acc: 16, air: 120, ping: 130 },
};

export const PAL = {
  amber: '#ffb347', ember: '#ff8c1a', rust: '#c96f2f', cyan: '#53d9ff', red: '#ff4a3d', green: '#6df08f',
  gold: '#ffd166', ice: '#a8ecff', bio: '#8cff9e', mag: '#ff5ec4', text: '#d8e2ec', dim: '#7d8fa3', steel: '#41546b',
};
/** faction colours */
export const FC = { coop: '#53d9ff', miners: '#ffb347', kings: '#ff4a3d', scrappers: '#6df08f', free: '#d8e2ec' };

/** terrain materials (index = sol value) */
export const MAT = [null,
  { hp: 26, c: '#5a5148' }, { hp: 60, c: '#3f3a36' }, { hp: 16, c: '#bfe8f2', ore: 'ice' }, { hp: 46, c: '#c98a5b', ore: 'fe' },
  { hp: 80, c: '#ffd166', ore: 'au' }, { hp: 52, c: '#c77dff', ore: 'crys' }, { hp: 110, c: '#8b98a8', ore: 'parts' }, { hp: 8, c: '#4f8f5a', ore: 'food' }];
export const FLR = ['', '#10141d', '#151c28', '#121824', '#0d1119', '#12202c', '#0f1c14', '#171226', '#1a2028'];

/** trade goods */
export const GD = {
  fe: { n: 'Ferrite Ore', p: 14, c: '#c98a5b', m: 1 }, ice: { n: 'Water Ice', p: 9, c: '#a8ecff', m: 1 },
  au: { n: 'Au-Pt Fines', p: 96, c: '#ffd166', m: 1 }, crys: { n: 'Resonant Crystal', p: 140, c: '#c77dff', m: 1 },
  food: { n: 'Hydroponic Food', p: 22, c: '#8cff9e', m: 1 }, fuel: { n: 'Reaction Mass', p: 6, c: '#ffb347', m: 1 },
  parts: { n: 'Fab Parts', p: 38, c: '#8b98a8', m: 1 }, stims: { n: 'Void Stims', p: 120, c: '#ff5ec4', m: 1, bad: 1 },
  art: { n: 'Belt Artifact', p: 300, c: '#53d9ff', m: 2 },
};

/** ship modules */
export const MD = {
  cock: { hp: 40, c: '#3f6f8f' }, hull: { hp: 30, c: '#41546b' }, eng: { hp: 35, c: '#6b5a3f' }, rcs: { hp: 15, c: '#5a6a7c' },
  cargo: { hp: 25, c: '#6b6156' }, fuel: { hp: 25, c: '#7d5a2f' }, clamp: { hp: 20, c: '#8a6a2f' }, gear: { hp: 18, c: '#4f5a68' },
  gun: { hp: 22, c: '#7d3a34' }, mine: { hp: 22, c: '#1f6f8f' }, scan: { hp: 18, c: '#2f6f7d' }, hab: { hp: 25, c: '#4f6f5a' },
};

/** Typhon's pull grows toward the bottom of the sector */
export const grav = y => C.G * (1 + ((y - C.H / 2) / C.H) * 0.5);
