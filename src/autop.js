// ═══ gravity-aware autopilot: shared by NPC traffic and the AI pilot ════
// Produces world-frame thrust / RCS / torque requests. It never moves a
// ship directly; it only asks for accelerations the ship's engines can give.
import { TAU, cl, hy, ad } from './core/util.js';
import { C, gacc } from './core/config.js';
import { W } from './core/state.js';
import { segBlock, ray } from './world/body.js';
import { surfR } from './world/moon.js';
import { alive } from './ships.js';

const GA = { x: 0, y: 0 };
export const engOK = s => alive(s, 'eng').length > 0 && s.fuel > 0;

/**
 * steer s toward (tx,ty) arriving with velocity (tvx,tvy).
 * o: { vmax, stop, face, va, rcsOnly, hold, up } → writes o.out {thr,rcx,rcy,tqi}; returns telemetry
 */
export function steer(s, tx, ty, o = {}) {
  const out = o.out || (o.out = { thr: 0, rcx: 0, rcy: 0, tqi: 0 });
  const tvx = o.tvx || 0, tvy = o.tvy || 0, stop = o.stop ?? 0;
  const dx = tx - s.x, dy = ty - s.y, d = hy(dx, dy) || 0.001;
  const eng = engOK(s) && !o.rcsOnly;
  const aMax = eng ? s.thrust : s.rcsA;
  gacc(s.x, s.y, s.vx, s.vy, GA);
  const gm = hy(GA.x, GA.y);
  // speed cap: braking budget, and keep Coriolis within what the engines can fight
  const budget = Math.max(0.4, aMax - gm);
  const vCor = (0.5 * aMax) / (2 * C.OM);
  const vmax = Math.min(o.vmax ?? 70, vCor);
  const rvx = s.vx - tvx, rvy = s.vy - tvy, closing = (rvx * dx + rvy * dy) / d;
  const dEff = Math.max(0, d - stop - Math.max(0, closing) * 1.2);
  const vs = o.through ? Math.min(vmax, Math.max(8, Math.sqrt(2 * budget * 0.55 * (d + 150)))) : Math.min(vmax, Math.sqrt(2 * budget * 0.55 * dEff), Math.max(0, d - stop) * 0.9);
  const vdx = tvx + (dx / d) * vs, vdy = tvy + (dy / d) * vs;
  const kv = o.kv || 1.1;
  let ax = (vdx - s.vx) * kv - GA.x, ay = (vdy - s.vy) * kv - GA.y;
  const am = hy(ax, ay);
  out.thr = 0; out.rcx = 0; out.rcy = 0;
  let face = o.face ?? null, mode = 'HOLD';
  if (eng && (am > s.rcsA * 0.7 || o.up)) {
    // point the engine along the needed acceleration and throttle by alignment
    const want = Math.atan2(ay, ax), err = Math.abs(ad(want, s.a));
    face = want;
    if (err < 0.35) out.thr = cl((am / s.thrust) * Math.cos(err), 0, 1);
    mode = err < 0.35 ? 'BURN' : 'TURN';
    const rx = ax - Math.cos(s.a) * out.thr * s.thrust, ry = ay - Math.sin(s.a) * out.thr * s.thrust, rm = hy(rx, ry);
    if (rm > 0.05) { const k = Math.min(1, rm / s.rcsA); out.rcx = (rx / rm) * k; out.rcy = (ry / rm) * k; }
  } else {
    if (am > 0.03) { const k = Math.min(1, am / Math.max(0.1, s.rcsA)); out.rcx = (ax / am) * k; out.rcy = (ay / am) * k; }
    mode = am > 0.5 ? 'RCS' : 'HOLD';
    if (face === null && d > 30 && !o.hold) face = Math.atan2(dy, dx);
  }
  if (face !== null) out.tqi = cl(ad(face, s.a) * 2.6 - (s.va - (o.va || 0)) * 1.9, -1, 1);
  else out.tqi = cl(-s.va * 1.8, -1, 1);
  return { d, mode, rv: hy(rvx, rvy), err: face !== null ? Math.abs(ad(face, s.a)) : 0 };
}

/** apply an autopilot request to an NPC ship */
export function applyOut(s, out) { s.thr = out.thr; s.rcx = out.rcx; s.rcy = out.rcy; s.tqi = out.tqi; }

/** one-hop detour around whatever blocks the straight corridor (and never through the Moon) */
export function detour(x0, y0, x1, y1, w = 14, skip = null) {
  // too close to the regolith? climb first
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mr = hy(mx, my), mth = Math.atan2(my, mx);
  if (mr < surfR(mth) + 160 && hy(x1 - x0, y1 - y0) > 400) { const rr = Math.max(surfR(mth) + 400, Math.min(hy(x0, y0), hy(x1, y1))); return { x: Math.cos(mth) * rr, y: Math.sin(mth) * rr }; }
  const blk = segBlock(x0, y0, x1, y1, w, skip);
  if (!blk) return null;
  const R = blk.rad + 50 + w;
  let best = null, bc = 1e9;
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * TAU, cx = blk.x + Math.cos(a) * R, cy = blk.y + Math.sin(a) * R;
    if (hy(cx, cy) < surfR(Math.atan2(cy, cx)) + 60) continue;
    if (hy(cx - x0, cy - y0) < 30) continue; // already here: move on round the body
    if (segBlock(x0, y0, cx, cy, w, skip)) continue;
    const cost = hy(cx - x0, cy - y0) + hy(x1 - cx, y1 - cy) + (segBlock(cx, cy, x1, y1, w, skip) ? 400 : 0);
    if (cost < bc) { bc = cost; best = { x: cx, y: cy }; }
  }
  if (!best) { const a = Math.atan2(y0 - blk.y, x0 - blk.x); best = { x: blk.x + Math.cos(a) * (R + 40), y: blk.y + Math.sin(a) * (R + 40) }; }
  return best;
}

/** stand-off point outside a body, on the side facing `from` */
export function standoff(b, fx, fy, extra = 20) {
  const a0 = Math.atan2(fy - b.y, fx - b.x), R = b.rad + extra;
  // find the real surface along that bearing (bodies are irregular; rad is only a bound) —
  // fan out to neighbouring bearings when the ray slips through a gap or a mined bore
  if (b.sol) for (const da of [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.8, -0.8]) {
    const ux = Math.cos(a0 + da), uy = Math.sin(a0 + da);
    const h = ray(b.x + ux * (b.rad + 4), b.y + uy * (b.rad + 4), -ux, -uy, b.rad + 4);
    if (h && h.b === b && h.d < b.rad * 0.85) { const d = hy(h.x - b.x, h.y - b.y) + extra; return { x: b.x + ux * d, y: b.y + uy * d }; }
  }
  return { x: b.x + Math.cos(a0) * R, y: b.y + Math.sin(a0) * R };
}
export { W };
