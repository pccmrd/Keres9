// ═══ AI pilot · flight & navigation primitives ══════════════════════════
// Everything here produces *stick / throttle / button* input in `inp`,
// exactly like a human would — the ship's physics is never touched directly.
import { TAU, cl, hy, ad } from '../core/util.js';
import { C } from '../core/config.js';
import { W, pl, ev } from '../core/state.js';
import { ca, cw, segBlock, portW, bvel, ray } from '../world/body.js';
import { alive } from '../ships.js';
import { IN } from '../input.js';

export const inp = { lx: 0, ly: 0, rx: 0, ry: 0, thr: 0, fire: false, mine: false, brake: false, ai: true };
/** shared clock & telemetry for the pilot */
export const NAV = { dt: 1 / 60, t: 0, flight: null, wantWarp: false, note: '' };

export function resetInp() { inp.lx = inp.ly = inp.rx = inp.ry = inp.thr = 0; inp.fire = inp.mine = inp.brake = false; }
export const press = e => IN.edge.push(e);

/** PD attitude control; returns |angle error| */
export function faceTo(a, va = 0, k = 2.6) {
  const e = ad(a, pl.a);
  inp.rx = cl(e * k - (pl.va - va) * 1.8, -1, 1);
  return Math.abs(e);
}
/** RCS stick toward a world-frame velocity; returns |error| */
export function rcsVel(vx, vy) {
  const ex = vx - pl.vx, ey = vy - pl.vy, m = hy(ex, ey);
  if (m < 0.04) { inp.lx = inp.ly = 0; return m; }
  const l = Math.min(1, m / 2.2);
  inp.lx = (ex / m) * l; inp.ly = (ey / m) * l;
  return m;
}
export const engineOK = () => alive(pl, 'eng').length > 0 && pl.fuel > 0;

/**
 * Newtonian point-to-point controller. Builds a braking-aware speed profile,
 * then either swings the nose onto the velocity error and burns the main
 * engine (producing natural flip-and-burn retro manoeuvres), or trims with RCS.
 */
export function fly(tx, ty, o = {}) {
  const tvx = o.tvx || 0, tvy = o.tvy || 0, vmax = o.vmax ?? 70, stop = o.stop ?? 0;
  const dx = tx - pl.x, dy = ty - pl.y, d = hy(dx, dy) || 0.001;
  const rvx = pl.vx - tvx, rvy = pl.vy - tvy, closing = (rvx * dx + rvy * dy) / d;
  const eng = engineOK() && !o.rcsOnly;
  const aB = eng ? pl.thrust * 0.5 : Math.max(4, pl.rcsA * 0.55);
  const dEff = Math.max(0, d - stop - Math.max(0, closing) * (eng ? 1.5 : 0.35));
  let vs = Math.min(vmax, Math.sqrt(2 * aB * dEff), Math.max(0, d - stop) * 1.2);
  if (o.vmin && d > stop + 30) vs = Math.max(vs, o.vmin);
  const vdx = tvx + (dx / d) * vs, vdy = tvy + (dy / d) * vs;
  const ex = vdx - pl.vx, ey = vdy - pl.vy, em = hy(ex, ey), retro = rvx * ex + rvy * ey < 0 && hy(rvx, rvy) > 8;
  let mode;
  if (eng && em > 8 && d > 45) {
    const al = faceTo(Math.atan2(ey, ex), 0, 2.8);
    if (al < 0.3) { inp.thr = cl(em / 22, 0.25, 1); mode = retro ? 'RETRO' : 'BURN'; }
    else mode = retro ? 'FLIP' : 'TURN';
    rcsVel(vdx, vdy);
  } else {
    rcsVel(vdx, vdy);
    const fa = o.face !== undefined && o.face !== null ? o.face : d > 25 ? Math.atan2(dy, dx) : null;
    if (fa !== null) faceTo(fa, o.va || 0); else inp.rx = cl(-pl.va * 1.8, -1, 1);
    mode = em > 1.2 ? 'RCS' : 'HOLD';
  }
  return { d, em, mode, rv: hy(rvx, rvy), v: hy(pl.vx, pl.vy) };
}

/** one-hop detour around whatever blocks the straight corridor */
export function planRoute(x0, y0, x1, y1) {
  const w = pl.rad * 0.8 + 4, blk = segBlock(x0, y0, x1, y1, w);
  if (!blk) return [];
  const R = (blk.ring ? blk.ring.r + 30 : blk.rad) + 55;
  let best = null, bc = 1e9;
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * TAU, cx = blk.x + Math.cos(a) * R, cy = blk.y + Math.sin(a) * R;
    if (cx < 80 || cy < 80 || cx > C.W - 80 || cy > C.H - 80) continue;
    if (segBlock(x0, y0, cx, cy, w)) continue;
    const cost = hy(cx - x0, cy - y0) + hy(x1 - cx, y1 - cy) + (segBlock(cx, cy, x1, y1, w) ? 500 : 0);
    if (cost < bc) { bc = cost; best = { x: cx, y: cy }; }
  }
  if (!best) { // boxed in: back out the way we came
    const a = Math.atan2(y0 - blk.y, x0 - blk.x);
    best = { x: blk.x + Math.cos(a) * (R + 40), y: blk.y + Math.sin(a) * (R + 40) };
  }
  return [best];
}

/** direction with the most free space around the ship */
export function freeDir() {
  let bd = -1, ba = 0;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU, h = ray(pl.x, pl.y, Math.cos(a), Math.sin(a), 90), d = h ? h.d : 90;
    if (d > bd) { bd = d; ba = a; }
  }
  return ba;
}

export function* unstick(sec = 2.6) {
  const a = freeDir();
  NAV.note = 'scraping clear of terrain';
  for (let t = 0; t < sec; t += NAV.dt) { rcsVel(Math.cos(a) * 12, Math.sin(a) * 12); const al = faceTo(a); if (al < 0.4 && t > 0.8) inp.thr = 0.35; yield; }
}

/**
 * Generator: fly to a (possibly moving) target with route planning,
 * stuck recovery and arrival tolerance. tgt() → {x,y,vx,vy} | null
 */
export function* travel(tgt, o = {}) {
  let route = [], plan = 0, best = 1e9, bestT = 0, t = 0;
  const arrive = o.arrive ?? 18, vtol = o.vtol ?? 3;
  while (true) {
    const T = tgt(); if (!T) return false;
    t += NAV.dt; plan -= NAV.dt;
    if (plan <= 0) { plan = 0.7; route = planRoute(pl.x, pl.y, T.x, T.y); }
    const wp = route[0], dd = hy(T.x - pl.x, T.y - pl.y);
    // look ahead along the velocity vector: never carry more speed than we can kill before the rock
    let vcap = o.vmax ?? 75;
    const v = hy(pl.vx, pl.vy);
    if (v > 6) {
      const aB = engineOK() ? pl.thrust * 0.45 : Math.max(4, pl.rcsA * 0.5), look = Math.min(420, (v * v) / (2 * aB) + 45);
      const h = ray(pl.x + (pl.vx / v) * (pl.rad + 2), pl.y + (pl.vy / v) * (pl.rad + 2), pl.vx / v, pl.vy / v, look);
      if (h && h.d < dd - 12) { vcap = Math.min(vcap, Math.max(5, Math.sqrt(2 * aB * Math.max(0, h.d - 28)))); if (plan > 0.15) plan = 0.15; NAV.brakeT = NAV.t; }
    }
    let r;
    if (wp && hy(wp.x - pl.x, wp.y - pl.y) > 45) r = fly(wp.x, wp.y, { vmax: vcap, vmin: Math.min(18, vcap) });
    else {
      if (wp) { route.shift(); plan = 0.25; }
      r = fly(T.x, T.y, { tvx: T.vx || 0, tvy: T.vy || 0, vmax: vcap, stop: o.stop ?? 0, face: o.face ? o.face() : undefined, rcsOnly: o.rcsOnly });
    }
    r.dist = dd; r.detour = !!wp; NAV.flight = r;
    NAV.wantWarp = dd > 1100 && r.v > 25 && !o.noWarp;
    if (!wp && dd < arrive && r.rv < vtol) { NAV.wantWarp = false; return true; }
    if (o.until && o.until()) { NAV.wantWarp = false; return true; }
    if (dd < best - 8) { best = dd; bestT = t; }
    if (t - bestT > (o.patience ?? 9)) { NAV.wantWarp = false; yield* unstick(); best = 1e9; bestT = t; route = []; plan = 0; }
    if (o.timeout && t > o.timeout) { NAV.wantWarp = false; return false; }
    yield;
  }
}
export const fixed = (x, y) => () => ({ x, y, vx: 0, vy: 0 });

/** velocity of a point riding a body (incl. habitat-ring spin) */
export function rideVel(b, x, y, spin) {
  const w = spin !== undefined ? spin : b.va || 0;
  return { x: (b.vx || 0) - (y - b.y) * w, y: (b.vy || 0) + (x - b.x) * w };
}

// ─── docking ─────────────────────────────────────────────────────────────
export const contactPt = ty => ty === 'pad'
  ? { x: pl.x + Math.cos(pl.a + Math.PI / 2) * pl.belly, y: pl.y + Math.sin(pl.a + Math.PI / 2) * pl.belly }
  : { x: pl.x + Math.cos(pl.a) * pl.nose, y: pl.y + Math.sin(pl.a) * pl.nose };

/** can a ship reach this port/pad from open space along its axis? */
export function portReachable(st, p) {
  const w = portW(st, p), nx = Math.cos(w.dir), ny = Math.sin(w.dir);
  const ax = w.x + nx * 90, ay = w.y + ny * 90;
  for (let d = 6; d < 90; d += 3) { const c = ca(st, w.x + nx * d, w.y + ny * d); if (c && (st.sol[c.i] || st.flr[c.i])) return false; }
  if (st.ring && !p.ring) return false;
  return !segBlock(w.x + nx * 22, w.y + ny * 22, ax, ay, 9);
}

/**
 * Final approach controller: hold the clamp axis, kill lateral offset,
 * creep in once attitude is aligned. Returns the live gate snapshot.
 */
export function approachPort(st, p, ty, gatesFn) {
  const w = portW(st, p), nx = Math.cos(w.dir), ny = Math.sin(w.dir), tx = -ny, tyy = nx;
  const want = ty === 'pad' ? w.dir + Math.PI / 2 : w.dir + Math.PI;
  const P = contactPt(ty), ox = P.x - w.x, oy = P.y - w.y;
  const along = ox * nx + oy * ny, lat = ox * tx + oy * tyy;
  const ae = faceTo(want, w.va || 0, 2.4);
  const spin = w.va || 0;
  // point at `along` on the axis rides the rotating frame
  const ff = { x: w.vx - ny * 0 - spin * along * ny, y: w.vy + spin * along * nx };
  let vc = 0;
  if (ae < 0.14 && Math.abs(lat) < 3.5) vc = along > 30 ? 5 : along > 12 ? 2.4 : 1.1;
  else if (ae < 0.3 && Math.abs(lat) < 7) vc = along > 30 ? 2.5 : 0.4;
  if (along < 4) vc = 0.5;
  const latV = cl(-lat * 0.7, -4, 4), holdV = along < 3 ? 0.6 : 0;
  rcsVel(ff.x - nx * vc + tx * latV + nx * holdV, ff.y - ny * vc + tyy * latV + ny * holdV);
  const g = gatesFn(pl, w, ty);
  return { g, along, lat, ae, w };
}

// ─── EVA pathfinding (grid BFS inside a body) ────────────────────────────
function freeCell(b, cx, cy) { return cx >= 0 && cy >= 0 && cx < b.gw && cy < b.gh && !b.sol[cy * b.gw + cx]; }
function roomy(b, cx, cy) { return freeCell(b, cx, cy) && freeCell(b, cx + 1, cy) && freeCell(b, cx - 1, cy) && freeCell(b, cx, cy + 1) && freeCell(b, cx, cy - 1); }
function nearestFree(b, cx, cy, strict) {
  cx = cl(cx, 0, b.gw - 1); cy = cl(cy, 0, b.gh - 1);
  for (let r = 0; r < 8; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
    if ((Math.abs(x - cx) === r || Math.abs(y - cy) === r) && (strict ? roomy(b, x, y) : freeCell(b, x, y))) return [x, y];
  return null;
}
function localCell(b, x, y) {
  const c = Math.cos(-b.a), s = Math.sin(-b.a), dx = x - b.x, dy = y - b.y;
  return [Math.floor((dx * c - dy * s + (b.gw * b.cs) / 2) / b.cs), Math.floor((dx * s + dy * c + (b.gh * b.cs) / 2) / b.cs)];
}
/** BFS path of cells from world point A to world point B within body b */
export function evaPath(b, ax, ay, bx, by) {
  for (const strict of [true, false]) {
    const s = nearestFree(b, ...localCell(b, ax, ay), strict), g = nearestFree(b, ...localCell(b, bx, by), strict);
    if (!s || !g) continue;
    const N = b.gw * b.gh, prev = new Int32Array(N).fill(-1), q = new Int32Array(N);
    const si = s[1] * b.gw + s[0], gi = g[1] * b.gw + g[0];
    let h = 0, tl = 0; q[tl++] = si; prev[si] = si;
    const ok = strict ? (x, y) => roomy(b, x, y) : (x, y) => freeCell(b, x, y);
    while (h < tl) {
      const i = q[h++]; if (i === gi) break;
      const x = i % b.gw, y = (i / b.gw) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy, j = ny * b.gw + nx;
        if (nx < 0 || ny < 0 || nx >= b.gw || ny >= b.gh || prev[j] >= 0 || !ok(nx, ny)) continue;
        prev[j] = i; q[tl++] = j;
      }
    }
    if (prev[gi] < 0) continue;
    const cells = [];
    for (let i = gi; i !== si; i = prev[i]) cells.push(i);
    cells.push(si); cells.reverse();
    // line-of-sight smoothing
    const out = [cells[0]];
    let k = 0;
    while (k < cells.length - 1) {
      let j = cells.length - 1;
      for (; j > k + 1; j--) if (losCells(b, cells[k], cells[j])) break;
      out.push(cells[j]); k = j;
    }
    return out.map(i => [i % b.gw, (i / b.gw) | 0]);
  }
  return null;
}
function losCells(b, i, j) {
  const x0 = (i % b.gw) + 0.5, y0 = ((i / b.gw) | 0) + 0.5, x1 = (j % b.gw) + 0.5, y1 = ((j / b.gw) | 0) + 0.5;
  const L = hy(x1 - x0, y1 - y0), n = Math.ceil(L * 3), px = -(y1 - y0) / (L || 1), py = (x1 - x0) / (L || 1);
  for (let s = 0; s <= n; s++) {
    const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n;
    for (const o of [-0.85, 0, 0.85]) if (!freeCell(b, Math.floor(x + px * o), Math.floor(y + py * o))) return false;
  }
  return true;
}
export const cellW = (b, c) => cw(b, c[0], c[1]);

/** jetpack toward a point, matching the host body's motion; aims the lamp along the path */
export function jetTo(x, y, b, vmax = 7) {
  const dx = x - ev.x, dy = y - ev.y, d = hy(dx, dy) || 0.001;
  const bv = b ? bvel(b, ev.x, ev.y) : { x: 0, y: 0 };
  const vs = Math.min(vmax, d * 1.1);
  const ex = bv.x + (dx / d) * vs - ev.vx, ey = bv.y + (dy / d) * vs - ev.vy, m = hy(ex, ey);
  if (m > 0.05) { const l = Math.min(1, m / 1.6); inp.lx = (ex / m) * l; inp.ly = (ey / m) * l; }
  if (d > 1.5) { inp.rx = dx / d; inp.ry = dy / d; }
  return d;
}
