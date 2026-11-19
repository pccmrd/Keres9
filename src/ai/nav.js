// ═══ AI low-level control: everything goes through the same CTL fields a ═
// human produces (sticks in SCREEN frame, throttle rail, buttons, key edges).
import { cl, hy, ad } from '../core/util.js';
import { C, gacc, geff } from '../core/config.js';
import { W, pl, ev, cam } from '../core/state.js';
import { cw, ca, near, portW, segBlock, ray } from '../world/body.js';
import { surfR } from '../world/moon.js';
import { steer, detour, standoff } from '../autop.js';
import { inBody } from '../eva.js';
import { IN } from '../input.js';

export const inp = { lx: 0, ly: 0, rx: 0, ry: 0, thr: 0, mine: false, brake: false, ai: true };
export const NAV = { dt: 1 / 60, t: 0, flight: null };
export function resetInp() { inp.lx = inp.ly = inp.rx = inp.ry = inp.thr = 0; inp.mine = inp.brake = false; }
export const press = e => IN.edge.push(e);

/** world vector → screen-frame stick (the camera rotates with local up) */
export function stickW(wx, wy) {
  const c = Math.cos(-cam.rot), s = Math.sin(-cam.rot);
  inp.lx = cl(wx * c - wy * s, -1, 1); inp.ly = cl(wx * s + wy * c, -1, 1);
}
const OUT = { thr: 0, rcx: 0, rcy: 0, tqi: 0 };
const BAND_V = 24;   // m/s — economical cruise in the band
const ARC_STEP = 0.11;   // rad per arc waypoint (chord sag ≈ 7 m)
/** fly the player's ship toward (tx,ty) with the shared autopilot law, expressed as stick + rail */
export function fly(tx, ty, o = {}) {
  // up in the band a transit costs ~2·cruise of Δv to start and stop; a high-thrust lander happily cruises at 45+ m/s
  // and burns 4× what the leg needs. Hold an economical cruise there (the gravity well keeps the full envelope).
  if (hy(pl.x, pl.y) > C.RM + 700) o = { ...o, vmax: Math.min(o.vmax ?? 70, BAND_V) };
  const t = steer(pl, tx, ty, { ...o, out: OUT });
  inp.thr = OUT.thr; stickW(OUT.rcx, OUT.rcy); inp.rx = OUT.tqi;
  NAV.flight = { mode: t.mode, d: t.d, rv: t.rv, v: hy(pl.vx, pl.vy) };
  return t;
}
/** fly with a one-hop detour around blocking bodies (and never through the Moon) */
export function flyRoute(tx, ty, o = {}, skip = null) {
  // long legs up in the band follow the arc: a straight chord sags below synchronous radius, where net gravity plus
  // Coriolis outgrows the RCS and the main engine burns the whole way (measured: ~120 u for a 4 km chord in a HARE)
  const rs = hy(pl.x, pl.y), rt = hy(tx, ty);
  if (rs > C.RM + 700 && rt > C.RM + 700) {
    const as = Math.atan2(pl.y, pl.x), dA = ad(Math.atan2(ty, tx), as);
    if (Math.abs(dA) > 0.14) {
      const a = as + Math.sign(dA) * ARC_STEP, r = rs + (rt - rs) * (ARC_STEP / Math.abs(dA));
      const ax = Math.cos(a) * r, ay = Math.sin(a) * r;
      const wp = detour(pl.x, pl.y, ax, ay, pl.rad + 8, skip) || { x: ax, y: ay };
      const t = fly(wp.x, wp.y, { vmax: Math.min(BAND_V, o.vmax || 45), through: true }); t.wp = true; return t;
    }
  }
  const wp = detour(pl.x, pl.y, tx, ty, pl.rad + 8, skip);
  if (wp) { const t = fly(wp.x, wp.y, { vmax: Math.min(30, o.vmax || 45), through: true }); t.wp = true; return t; }
  return fly(tx, ty, o);
}
export const engineOK = () => pl && pl.mods.some(m => m.t === 'eng' && !m.dead) && pl.fuel > 0;
export const tel = o => { const r = hy(o.x, o.y), ux = o.x / r, uy = o.y / r; return { r, alt: r - surfR(Math.atan2(o.y, o.x)), vr: o.vx * ux + o.vy * uy, vt: -o.vx * uy + o.vy * ux, ux, uy, g: geff(r) }; };

/** final approach to a clamp port (ty 'port') — nose into the port, creep along its axis */
export function approachPort(st, p) {
  const w = portW(st, p), nx = Math.cos(w.dir), ny = Math.sin(w.dir);
  const want = w.dir + Math.PI, ae = Math.abs(ad(want, pl.a));
  const nose = { x: pl.x + Math.cos(pl.a) * pl.nose, y: pl.y + Math.sin(pl.a) * pl.nose };
  const along = (nose.x - w.x) * nx + (nose.y - w.y) * ny, lat = (nose.x - w.x) * -ny + (nose.y - w.y) * nx;
  // aim point on the port axis: far out until aligned, then walk it in
  const k = ae < 0.12 && Math.abs(lat) < 3 ? Math.max(1.5, along - 6) : Math.max(14, along);
  const ax = w.x + nx * (k + pl.nose), ay = w.y + ny * (k + pl.nose);
  const t = steer(pl, ax, ay, { vmax: along > 40 ? 8 : 2.2, face: want, rcsOnly: along < 60, hold: true, out: OUT });
  inp.thr = OUT.thr; stickW(OUT.rcx, OUT.rcy); inp.rx = OUT.tqi;
  NAV.flight = { mode: 'DOCK', d: along, rv: t.rv, v: hy(pl.vx, pl.vy) };
  return { along, lat, ae, w };
}
/** a tail-lander's touchdown: hover over the pad, then settle nose-up */
export function approachPad(st, p) {
  const w = portW(st, p), nx = Math.cos(w.dir), ny = Math.sin(w.dir);
  const tail = { x: pl.x - Math.cos(pl.a) * pl.nose, y: pl.y - Math.sin(pl.a) * pl.nose };
  const h = (tail.x - w.x) * nx + (tail.y - w.y) * ny, lat = (tail.x - w.x) * -ny + (tail.y - w.y) * nx;
  const hold = Math.abs(lat) > 4 ? Math.max(h, 30) : Math.max(0, h - (h > 25 ? 10 : 4));
  const tx = w.x + nx * (hold + pl.nose), ty = w.y + ny * (hold + pl.nose);
  const t = steer(pl, tx, ty, { vmax: h > 80 ? 14 : h > 25 ? 5 : 1.6, face: w.dir, up: true, out: OUT });
  inp.thr = OUT.thr; stickW(OUT.rcx, OUT.rcy);
  // the engine points along the needed acceleration, which is mostly "up" — keep the nose there near the pad
  inp.rx = cl(ad(h < 30 ? w.dir : Math.atan2(pl.y, pl.x), pl.a) * 2.6 - pl.va * 1.9, -1, 1);
  NAV.flight = { mode: 'LAND', d: h, rv: t.rv, v: hy(pl.vx, pl.vy) };
  return { h, lat, w };
}

// ─── EVA ────────────────────────────────────────────────────────────────
function freeCell(b, x, y) { return x >= 0 && y >= 0 && x < b.gw && y < b.gh && !b.sol[y * b.gw + x]; }
function roomy(b, x, y) { return freeCell(b, x, y) && freeCell(b, x + 1, y) && freeCell(b, x - 1, y) && freeCell(b, x, y + 1) && freeCell(b, x, y - 1); }
function localCell(b, x, y) {
  const c = Math.cos(-b.a), s = Math.sin(-b.a), dx = x - b.x, dy = y - b.y;
  return [Math.floor((dx * c - dy * s + (b.gw * b.cs) / 2) / b.cs), Math.floor((dx * s + dy * c + (b.gh * b.cs) / 2) / b.cs)];
}
function nearestFree(b, cx, cy, ok) {
  cx = cl(cx, 0, b.gw - 1); cy = cl(cy, 0, b.gh - 1);
  for (let r = 0; r < 8; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
    if ((Math.abs(x - cx) === r || Math.abs(y - cy) === r) && ok(b, x, y)) return [x, y];
  return null;
}
/** BFS inside body b from a world point to either a world point (inside) or the grid edge nearest `tx,ty` */
function bfs(b, ax, ay, tx, ty, toEdge, ok) {
  const s = nearestFree(b, ...localCell(b, ax, ay), ok); if (!s) return null;
  const N = b.gw * b.gh, prev = new Int32Array(N).fill(-1), q = new Int32Array(N);
  const si = s[1] * b.gw + s[0];
  let gi = -1;
  if (!toEdge) { const g = nearestFree(b, ...localCell(b, tx, ty), ok); if (!g) return null; gi = g[1] * b.gw + g[0]; }
  let h = 0, tl = 0; q[tl++] = si; prev[si] = si; let best = -1, bc = 1e9;
  while (h < tl) {
    const i = q[h++]; if (i === gi) break;
    const x = i % b.gw, y = (i / b.gw) | 0;
    if (toEdge && (x <= 1 || y <= 1 || x >= b.gw - 2 || y >= b.gh - 2)) { const w = cw(b, x, y), c = hy(w.x - tx, w.y - ty) + h * 0.02; if (c < bc) { bc = c; best = i; } }
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy, j = ny * b.gw + nx;
      if (nx < 0 || ny < 0 || nx >= b.gw || ny >= b.gh || prev[j] >= 0 || !ok(b, nx, ny)) continue;
      prev[j] = i; q[tl++] = j;
    }
  }
  if (toEdge) gi = best;
  if (gi < 0 || prev[gi] < 0) return null;
  const cells = []; for (let i = gi; i !== si; i = prev[i]) cells.push(i); cells.push(si); cells.reverse();
  const out = [cells[0]]; let k = 0;
  while (k < cells.length - 1) { let j = Math.min(cells.length - 1, k + 6); for (; j > k + 1; j--) if (los(b, cells[k], cells[j])) break; out.push(cells[j]); k = j; }
  return out.map(i => cw(b, i % b.gw, (i / b.gw) | 0));
}
function los(b, i, j) {
  const x0 = (i % b.gw) + 0.5, y0 = ((i / b.gw) | 0) + 0.5, x1 = (j % b.gw) + 0.5, y1 = ((j / b.gw) | 0) + 0.5;
  const L = hy(x1 - x0, y1 - y0), n = Math.ceil(L * 3), px = -(y1 - y0) / (L || 1), py = (x1 - x0) / (L || 1);
  for (let s = 0; s <= n; s++) { const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n; for (const o of [-0.8, 0, 0.8]) if (!freeCell(b, Math.floor(x + px * o), Math.floor(y + py * o))) return false; }
  return true;
}
const inside = (b, x, y) => { const c = ca(b, x, y); return c && !b.sol[c.i] ? c : null; };
/** waypoints from the suit to a world point, through station corridors and airlocks */
export function evaRoute(tx, ty) {
  const qa = inBody(ev.x, ev.y), A = qa && qa.b.kind === 'station' ? qa.b : null;
  let B = null; for (const b of near(tx, ty, 2)) if (b.kind === 'station' && inside(b, tx, ty)) { B = b; break; }
  for (const ok of [roomy, freeCell]) {
    if (A && A === B) { const p = bfs(A, ev.x, ev.y, tx, ty, false, ok); if (p) return [...p, { x: tx, y: ty }]; continue; }
    let path = [];
    if (A) { const p = bfs(A, ev.x, ev.y, tx, ty, true, ok); if (!p) continue; path = p; }
    if (B) { const p = bfs(B, tx, ty, path.length ? path[path.length - 1].x : ev.x, path.length ? path[path.length - 1].y : ev.y, true, ok); if (!p) continue; path = path.concat(p.reverse()); }
    path.push({ x: tx, y: ty });
    if (!A && !B) { const h = suitHop(tx, ty); if (h) { path.unshift(h); path.hop = true; } }
    return path;
  }
  return [{ x: tx, y: ty }];
}
/** open-space EVA: if rock sits between the suit and the goal, step round the body hugging its real surface */
export function suitHop(tx, ty) {
  const L = hy(tx - ev.x, ty - ev.y); if (L < 3) return null;
  // ignore terrain right at the goal (a ship anchored on the face, a cut target)
  const k = Math.max(0, L - 8) / L, blk = segBlock(ev.x, ev.y, ev.x + (tx - ev.x) * k, ev.y + (ty - ev.y) * k, 1);
  if (!blk || inBody(ev.x, ev.y)) return null;   // outside only: inside a station the corridor BFS routes
  const aE = Math.atan2(ev.y - blk.y, ev.x - blk.x), dA = ad(Math.atan2(ty - blk.y, tx - blk.x), aE), sg = Math.sign(dA) || 1;
  const surf = a => { const R0 = blk.rad + 12, h = ray(blk.x + Math.cos(a) * R0, blk.y + Math.sin(a) * R0, -Math.cos(a), -Math.sin(a), R0); return h ? R0 - h.d : 0; };
  for (const dir of [sg, -sg]) for (const st of [0.35, 0.2, 0.1]) {
    const a = aE + dir * (dir === sg ? Math.min(Math.abs(dA), st) : st);
    for (const off of [7, 14]) {
      const r = Math.max(surf(a) + off, hy(ev.x - blk.x, ev.y - blk.y) * 0.6), wp = { x: blk.x + Math.cos(a) * r, y: blk.y + Math.sin(a) * r };
      if (!segBlock(ev.x, ev.y, wp.x, wp.y, 1)) return wp;
    }
  }
  // boxed in against the face: one short step straight out — but never keep stepping away into the void
  return hy(ev.x - blk.x, ev.y - blk.y) < surf(aE) + 6 ? { x: ev.x + Math.cos(aE) * 6, y: ev.y + Math.sin(aE) * 6 } : null;
}
/** jetpack / walk toward a point; returns the remaining distance */
export function jetTo(x, y, vmax = 8, ref = null) {
  const dx = x - ev.x, dy = y - ev.y, d = hy(dx, dy) || 0.001, r = hy(ev.x, ev.y), ux = ev.x / r, uy = ev.y / r;
  // (strong-gravity test alone is not enough: the low band also pulls > 0.4 m/s², and "walking" there is free fall)
  if (geff(r) > 0.4 && r - surfR(Math.atan2(ev.y, ev.x)) < 40) {
    // surface mode: walk along the regolith; hop when the target is above us or we are stuck
    const along = dx * -uy + dy * ux, up = dx * ux + dy * uy;
    inp.lx = Math.abs(along) > 1.2 ? cl(along / 4, -1, 1) : 0;
    const vt = ev.vx * -uy + ev.vy * ux;
    NAV.stuck = Math.abs(inp.lx) > 0.5 && Math.abs(vt) < 1.5 ? (NAV.stuck || 0) + NAV.dt : 0;
    if (up > 4 && up < 25 && Math.abs(along) < 8 && tel(ev).vr < 4) inp.ly = -1;
    else if (NAV.stuck > 0.5) { inp.ly = -1; if (NAV.stuck > 1.1) NAV.stuck = 0; }
    return d;
  }
  const rv = ref ? { x: ref.vx || 0, y: ref.vy || 0 } : { x: 0, y: 0 };
  gacc(ev.x, ev.y, ev.vx, ev.vy, GA);
  const vs = Math.min(vmax, d * 0.9);
  const ex = rv.x + (dx / d) * vs - ev.vx - GA.x * 0.5, ey = rv.y + (dy / d) * vs - ev.vy - GA.y * 0.5, m = hy(ex, ey);
  if (m > 0.08) { const l = Math.min(1, m / 1.4); stickW((ex / m) * l, (ey / m) * l); }
  return d;
}
const GA = { x: 0, y: 0 };
/** turn the suit (right stick) toward an angle */
export function evaFace(a) { const e = ad(a, ev.a); inp.rx = cl(e * 2, -1, 1); return Math.abs(e); }
export { standoff, segBlock, portW, cw };
