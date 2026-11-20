// ═══ the Moon: analytic regolith heightfield, contact, day/night ════════
import { TAU, cl, rng, rr, ri } from '../core/util.js';
import { C } from '../core/config.js';

const N = 9600, STEP = TAU / N;
/** the surface: radius samples around the full circumference, plus decoration */
export const MOON = { S: new Float32Array(N), flat: [], craters: [], boulders: [], seed: 0, sun0: -Math.PI / 2 + 1.0 };

const wrapI = i => ((i % N) + N) % N;
const thI = th => { let t = th % TAU; if (t < 0) t += TAU; return t / STEP; };

/** surface radius at longitude th (linear interpolation of the table) */
export function surfR(th) {
  const f = thI(th), i = Math.floor(f), k = f - i;
  return MOON.S[wrapI(i)] * (1 - k) + MOON.S[wrapI(i + 1)] * k;
}
/** outward surface normal at longitude th */
export function surfN(th) {
  const d = 0.0012, r0 = surfR(th - d), r1 = surfR(th + d), r = (r0 + r1) / 2;
  // tangent (counter-clockwise) and radial components in the local frame
  const dr = (r1 - r0) / (2 * d * r);
  const ux = Math.cos(th), uy = Math.sin(th), tx = -uy, ty = ux;
  let nx = ux - tx * dr, ny = uy - ty * dr; const m = Math.hypot(nx, ny);
  nx /= m; ny /= m;
  return { x: nx, y: ny };
}
/** altitude of (x,y) above the local regolith */
export function altAt(x, y) { return Math.hypot(x, y) - surfR(Math.atan2(y, x)); }

/** build the heightfield for a seed; `flat` zones are levelled pads for the settlements */
export function genMoon(seed, flat) {
  const r = rng(seed ^ 0x51ee);
  MOON.seed = seed; MOON.flat = flat; MOON.craters = []; MOON.boulders = [];
  const p = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
  for (let k = 0; k < 150; k++) {
    const w = rr(r, 14, k < 12 ? 260 : 120);
    MOON.craters.push({ th: r() * TAU, w: w / C.RM, d: w * rr(r, 0.12, 0.24) });
  }
  const S = MOON.S;
  for (let i = 0; i < N; i++) {
    const th = i * STEP;
    let h = 16 * Math.sin(3 * th + p[0]) + 10 * Math.sin(7 * th + p[1]) + 5 * Math.sin(19 * th + p[2]) + 2.4 * Math.sin(61 * th + p[3]) + 1.1 * Math.sin(173 * th);
    for (const c of MOON.craters) {
      let x = th - c.th; x -= Math.round(x / TAU) * TAU;
      const q = Math.abs(x) / c.w;
      if (q > 2.2) continue;
      if (q < 1) h -= c.d * (1 - q * q);
      h += c.d * 0.24 * Math.exp(-(((q - 1) / 0.32) ** 2));
    }
    S[i] = C.RM + h;
  }
  // level the settlement zones with a smooth shoulder
  for (const z of flat) {
    const half = z.half / C.RM, sh = 70 / C.RM, lvl = C.RM + (z.lvl || 0);
    for (let i = 0; i < N; i++) {
      let x = i * STEP - z.th; x -= Math.round(x / TAU) * TAU;
      const a = Math.abs(x);
      if (a > half + sh) continue;
      const k = a <= half ? 1 : 1 - (a - half) / sh, s = k * k * (3 - 2 * k);
      S[i] = S[i] * (1 - s) + lvl * s;
    }
  }
  // scattered boulders (decor only)
  for (let k = 0; k < 900; k++) {
    const th = r() * TAU;
    if (flat.some(z => { let x = th - z.th; x -= Math.round(x / TAU) * TAU; return Math.abs(x) < (z.half + 20) / C.RM; })) continue;
    MOON.boulders.push({ th, s: rr(r, 1.2, k < 120 ? 7 : 3.5), sh: ri(r, 0, 3) });
  }
  MOON.boulders.sort((a, b) => a.th - b.th);
  return MOON;
}

/**
 * circle-vs-regolith contact. Pushes the entity out, reflects the inward
 * velocity (restitution `e`), applies sliding friction when grounded.
 * Returns null or { im, nx, ny } (im = inward speed at impact).
 */
export function ground(o, rad, dt, e = 0.25, fr = 3.5) {
  const r = Math.hypot(o.x, o.y), th = Math.atan2(o.y, o.x), S = surfR(th);
  if (r > S + rad + 0.01) return null;
  const n = surfN(th), pen = S + rad - r;
  o.x += (o.x / r) * pen; o.y += (o.y / r) * pen;
  const vn = o.vx * n.x + o.vy * n.y;
  let im = 0;
  if (vn < 0) { im = -vn; o.vx -= n.x * vn * (1 + e); o.vy -= n.y * vn * (1 + e); }
  // tangential friction
  const tx = -n.y, ty = n.x, vt = o.vx * tx + o.vy * ty, k = Math.exp(-fr * dt);
  o.vx -= tx * vt * (1 - k); o.vy -= ty * vt * (1 - k);
  return { im, nx: n.x, ny: n.y };
}

/** sunlight in the rotating frame: the Sun sweeps round once per synchronous day */
/** the sun crawls across the co-rotating sky: one lunar 'day' = 20 minutes of play */
export const DAY = 1200;
export const sunAng = t => MOON.sun0 - (TAU / DAY) * t;
/** 0 (night) … 1 (noon) at longitude th */
export const daylight = (th, t) => cl(Math.cos(th - sunAng(t)) * 1.4 + 0.1, 0, 1);
export const MOON_N = N, MOON_STEP = STEP;
