// ═══ cellular terrain bodies: rocks, stations, hulks ════════════════════
import { cl, hy, ad, sh } from '../core/util.js';
import { MAT, FLR, C } from '../core/config.js';
import { W } from '../core/state.js';

export function body(kind, x, y, gw, gh, cs, seed) {
  return {
    kind, x, y, a: 0, vx: 0, vy: 0, va: 0, gw, gh, cs, seed,
    sol: new Uint8Array(gw * gh), flr: new Uint8Array(gw * gh), dmg: new Map(),
    cut: [], glow: [], fog: [], rooms: [], lights: [], crew: [], ports: [], pads: [], ring: null,
    cham: [], veins: [], name: '', rad: (hy(gw, gh) * cs) / 2, roofA: 1, dead: false, breached: false,
  };
}

export function mkc(b) {
  b.roofCv = document.createElement('canvas'); b.roofCv.width = b.gw; b.roofCv.height = b.gh; b.rc = b.roofCv.getContext('2d');
  b.floorCv = document.createElement('canvas'); b.floorCv.width = b.gw; b.floorCv.height = b.gh; b.fc = b.floorCv.getContext('2d');
}

/** cell → world (cell centre) */
export function cw(b, cx, cy) {
  const lx = (cx + 0.5) * b.cs - (b.gw * b.cs) / 2, ly = (cy + 0.5) * b.cs - (b.gh * b.cs) / 2, c = Math.cos(b.a), s = Math.sin(b.a);
  return { x: b.x + lx * c - ly * s, y: b.y + lx * s + ly * c };
}
/** world → cell (null when outside the grid) */
export function ca(b, wx, wy) {
  const c = Math.cos(-b.a), s = Math.sin(-b.a), dx = wx - b.x, dy = wy - b.y;
  const lx = dx * c - dy * s + (b.gw * b.cs) / 2, ly = dx * s + dy * c + (b.gh * b.cs) / 2;
  const cx = Math.floor(lx / b.cs), cy = Math.floor(ly / b.cs);
  return cx < 0 || cy < 0 || cx >= b.gw || cy >= b.gh ? null : { cx, cy, i: cy * b.gw + cx };
}
/** body-local → world */
export function lw(b, lx, ly) { const c = Math.cos(b.a), s = Math.sin(b.a); return { x: b.x + lx * c - ly * s, y: b.y + lx * s + ly * c }; }

/** paint one roof (solid) pixel with bevel lighting */
export function pR(b, cx, cy) {
  const i = cy * b.gw + cx, m = b.sol[i];
  if (!m) { b.rc.clearRect(cx, cy, 1, 1); return; }
  let f = 0.84 + ((((cx * 73856093) ^ (cy * 19349663) ^ b.seed) >>> 0) % 100) / 333;
  if (cy > 0 && !b.sol[i - b.gw]) f += 0.24;
  if (cx < b.gw - 1 && !b.sol[i + 1]) f += 0.1;
  if (cy < b.gh - 1 && !b.sol[i + b.gw]) f -= 0.24;
  if (cx > 0 && !b.sol[i - 1]) f -= 0.1;
  b.rc.fillStyle = sh(MAT[m].c, f); b.rc.fillRect(cx, cy, 1, 1);
}
export function pF(b, cx, cy) {
  const f = b.flr[cy * b.gw + cx];
  if (!f) { b.fc.clearRect(cx, cy, 1, 1); return; }
  b.fc.fillStyle = FLR[f]; b.fc.fillRect(cx, cy, 1, 1);
}

/** damage a cell; returns the material index when it breaks, else 0 */
export function cut(b, cx, cy, d, quiet) {
  const i = cy * b.gw + cx, m = b.sol[i];
  if (!m) return 0;
  const hp = (b.dmg.has(i) ? b.dmg.get(i) : MAT[m].hp) - d;
  if (hp > 0) { b.dmg.set(i, hp); return 0; }
  b.dmg.delete(i); b.sol[i] = 0;
  if (!b.flr[i]) b.flr[i] = 4;
  b.cut.push(i);
  pR(b, cx, cy); pF(b, cx, cy);
  if (cx > 0) pR(b, cx - 1, cy);
  if (cx < b.gw - 1) pR(b, cx + 1, cy);
  if (cy > 0) pR(b, cx, cy - 1);
  if (cy < b.gh - 1) pR(b, cx, cy + 1);
  if (!quiet && W && W.heat) {
    const w = cw(b, cx, cy);
    W.heat.push({ x: w.x, y: w.y, b, cx, cy, t: W.time, c: MAT[m].c });
    if (W.heat.length > 260) W.heat.shift();
  }
  return m;
}

const _nb = [];
/** bodies whose bounding radius is within r of (x,y) — shared array, copy if you keep it */
export function near(x, y, r) {
  _nb.length = 0;
  for (const b of W.bodies) { const q = b.rad + r; if (Math.abs(b.x - x) < q && Math.abs(b.y - y) < q) _nb.push(b); }
  return _nb;
}
/** velocity of a body's material point at (x,y) */
export const bvel = (b, x, y) => ({ x: b.vx - (y - b.y) * b.va, y: b.vy + (x - b.x) * b.va });

/** world pose & velocity of a docking port / pad */
export function portW(st, p) {
  if (p.ring) {
    const a = st.ring.ang + p.a0 + st.a;
    return {
      x: st.x + Math.cos(a) * p.r, y: st.y + Math.sin(a) * p.r, dir: a,
      vx: st.vx - Math.sin(a) * p.r * st.ring.spin, vy: st.vy + Math.cos(a) * p.r * st.ring.spin, va: st.ring.spin,
    };
  }
  const w = cw(st, p.cx, p.cy);
  return { x: w.x, y: w.y, dir: p.dir + st.a, vx: st.vx - (w.y - st.y) * st.va, vy: st.vy + (w.x - st.x) * st.va, va: st.va };
}

function ringGap(b, ang) {
  for (let k = 0; k < 4; k++) if (Math.abs(ad(ang, k * Math.PI / 2)) < 0.24) return true;
  return false;
}

/** circle-vs-terrain collision with impulse response */
export function collide(e, rad, hit) {
  for (const b of near(e.x, e.y, rad + 8)) {
    if (b.ring) {
      const dx = e.x - b.x, dy = e.y - b.y, d = hy(dx, dy) || 1;
      if (Math.abs(d - b.ring.r) < rad + 7) {
        const ang = Math.atan2(dy, dx) - b.a - b.ring.ang;
        if (!ringGap(b, ang)) {
          const nx = dx / d, ny = dy / d, sg = d > b.ring.r ? 1 : -1, pen = rad + 7 - Math.abs(d - b.ring.r);
          e.x += nx * pen * sg; e.y += ny * pen * sg;
          const v = { x: b.vx - (e.y - b.y) * b.ring.spin, y: b.vy + (e.x - b.x) * b.ring.spin };
          const vn = ((e.vx - v.x) * nx + (e.vy - v.y) * ny) * sg;
          if (vn < 0) { e.vx -= nx * vn * 1.3 * sg; e.vy -= ny * vn * 1.3 * sg; hit && hit(-vn, e.x, e.y, b, -1, -1); }
        }
      }
    }
    const c = Math.cos(-b.a), s = Math.sin(-b.a), dx = e.x - b.x, dy = e.y - b.y;
    const lx = dx * c - dy * s + (b.gw * b.cs) / 2, ly = dx * s + dy * c + (b.gh * b.cs) / 2, R = rad + b.cs;
    const x0 = Math.max(0, ((lx - R) / b.cs) | 0), x1 = Math.min(b.gw - 1, ((lx + R) / b.cs) | 0);
    const y0 = Math.max(0, ((ly - R) / b.cs) | 0), y1 = Math.min(b.gh - 1, ((ly + R) / b.cs) | 0);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (!b.sol[cy * b.gw + cx]) continue;
      const rx = cx * b.cs, ry = cy * b.cs, px = cl(lx, rx, rx + b.cs), py = cl(ly, ry, ry + b.cs);
      let ddx = lx - px, ddy = ly - py, d = hy(ddx, ddy);
      if (d >= rad) continue;
      if (d < 0.001) { ddx = lx - rx - b.cs / 2; ddy = ly - ry - b.cs / 2; d = hy(ddx, ddy) || 1; }
      const cb = Math.cos(b.a), sb = Math.sin(b.a), nlx = ddx / d, nly = ddy / d, nx = nlx * cb - nly * sb, ny = nlx * sb + nly * cb;
      e.x += nx * (rad - d); e.y += ny * (rad - d);
      const w = cw(b, cx, cy), v = bvel(b, w.x, w.y), vn = (e.vx - v.x) * nx + (e.vy - v.y) * ny;
      if (vn < 0) {
        e.vx -= nx * vn * 1.28; e.vy -= ny * vn * 1.28;
        if (e.va !== undefined) e.va += (nx * (e.vy - v.y) - ny * (e.vx - v.x)) * 0.004;
        hit && hit(-vn, w.x, w.y, b, cx, cy);
      }
    }
  }
}

/** march a ray through terrain; first solid hit or null */
export function ray(x0, y0, dx, dy, range) {
  for (let d = 0; d < range; d += 1.6) {
    const x = x0 + dx * d, y = y0 + dy * d;
    for (const b of near(x, y, 4)) { const c = ca(b, x, y); if (c && b.sol[c.i]) return { x, y, b, cx: c.cx, cy: c.cy, d }; }
  }
  return null;
}

/**
 * Is the corridor x0,y0 → x1,y1 (half-width `w`) free of solid terrain?
 * Cheap: only bodies whose bounding circle touches the segment are marched.
 * Returns the first blocking body or null.
 */
export function segBlock(x0, y0, x1, y1, w = 0, skip = null) {
  const L = hy(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  for (const b of W.bodies) {
    if (b === skip) continue;
    // closest approach of segment to body centre
    const t = cl((b.x - x0) * ux + (b.y - y0) * uy, 0, L), px = x0 + ux * t, py = y0 + uy * t;
    if (hy(b.x - px, b.y - py) > b.rad + w) continue;
    if (b.ring) {
      // crossing the ring band outside a gap?
      const dA = hy(x0 - b.x, y0 - b.y), dB = hy(x1 - b.x, y1 - b.y);
      if ((dA - b.ring.r) * (dB - b.ring.r) < 0 || Math.abs(hy(b.x - px, b.y - py) - b.ring.r) < w + 7) {
        for (let s = 0; s <= L; s += 4) {
          const qx = x0 + ux * s, qy = y0 + uy * s, dd = hy(qx - b.x, qy - b.y);
          if (Math.abs(dd - b.ring.r) < 7 + w && !ringGap(b, Math.atan2(qy - b.y, qx - b.x) - b.a - b.ring.ang)) return b;
        }
      }
    }
    const s0 = Math.max(0, t - b.rad - w), s1 = Math.min(L, t + b.rad + w), st = b.cs * 0.8;
    for (let s = s0; s <= s1; s += st) {
      const qx = x0 + ux * s, qy = y0 + uy * s;
      if (w <= 0) { const c = ca(b, qx, qy); if (c && b.sol[c.i]) return b; continue; }
      for (const o of [-w, 0, w]) {
        const c = ca(b, qx - uy * o, qy + ux * o);
        if (c && b.sol[c.i]) return b;
      }
    }
  }
  return null;
}

/** integrate free-moving bodies (drifting hulks, spinning stations, habitat rings) */
export function stepBodies(dt) {
  for (const b of W.bodies) {
    if (b.ring) b.ring.ang += b.ring.spin * dt;
    if (!b.vx && !b.vy && !b.va) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
    if (b.kind === 'hulk') {
      if (b.x < 300 || b.x > C.W - 300) b.vx += (b.x < 300 ? 1 : -1) * 0.4 * dt;
      if (b.y < 300 || b.y > C.H - 300) b.vy += (b.y < 300 ? 1 : -1) * 0.4 * dt;
    }
    if (b.contacts) for (const c of b.contacts) { const w = lw(b, c.lx, c.ly); c.x = w.x; c.y = w.y; }
  }
}
