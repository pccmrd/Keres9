// ═══ math / random / misc helpers ═══════════════════════════════════════
export const $ = id => document.getElementById(id);
export const TAU = Math.PI * 2;

export const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lp = (a, b, t) => a + (b - a) * t;
export const hy = (x, y) => Math.sqrt(x * x + y * y);
/** wrap angle to (-PI, PI] */
export const an = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
/** signed shortest angular difference a-b */
export const ad = (a, b) => an(a - b);
export const fm = n => Math.round(n).toLocaleString('en-US');
export const ds = (a, b) => hy(a.x - b.x, a.y - b.y);

/** mulberry32 seeded generator */
export const rng = s => () => {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const pk = (r, a) => a[Math.floor(r() * a.length)];
export const rr = (r, a, b) => a + r() * (b - a);
export const ri = (r, a, b) => Math.floor(a + r() * (b - a + 1));
export const R = Math.random;

const _shade = new Map();
/** shade a #rrggbb colour by factor f (cached) */
export function sh(hex, f) {
  const k = hex + f.toFixed(2);
  let v = _shade.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  v = 'rgb(' + (cl((n >> 16) * f, 0, 255) | 0) + ',' + (cl(((n >> 8) & 255) * f, 0, 255) | 0) + ',' + (cl((n & 255) * f, 0, 255) | 0) + ')';
  _shade.set(k, v);
  return v;
}

/** distance from point to segment, returns {d,t} */
export function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
  const t = cl(((px - x0) * dx + (py - y0) * dy) / L, 0, 1);
  return { d: hy(px - (x0 + dx * t), py - (y0 + dy * t)), t };
}
export const bearing = (from, to) => Math.round(((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 450) % 360);
