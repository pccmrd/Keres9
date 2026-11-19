// ═══ the suit: walking the regolith, jetpack EVA, hand cutter, ore sack ═
import { hy, cl, ad, rr } from './core/util.js';
import { C, GD, gacc, geff, MAT } from './core/config.js';
import { W, G, pl, ev, setEv, setPl, PC, CTL, cam } from './core/state.js';
import { near, ca, cw, collide, cut, ray, solidAt } from './world/body.js';
import { ground, surfR } from './world/moon.js';
import { cadd, cmass } from './ships.js';
import { spill } from './combat.js';
import { gas, sparks, dust } from './fx.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const A = { x: 0, y: 0 }, R = Math.random;
export const sackN = e => { let n = 0; for (const g in e.sack) n += e.sack[g]; return n; };

/** the body whose pressurised interior (floor cell) a point is inside */
export function inBody(x, y) {
  for (const b of near(x, y, 8)) { const c = ca(b, x, y); if (c && !b.sol[c.i] && b.flr[c.i]) return { b, c }; }
  return null;
}
export function evaIn() { if (!ev || ev.dead) return null; const q = inBody(ev.x, ev.y); return q ? q.b : null; }
/** the room (with kind) the suit floats in, if any */
export function evaRoom() {
  if (!ev) return null;
  const q = inBody(ev.x, ev.y); if (!q || q.b.kind !== 'station') return null;
  const cx = q.c.cx, cy = q.c.cy;
  for (const rm of q.b.rooms) if (cx > rm.x && cy > rm.y && cx < rm.x + rm.w - 1 && cy < rm.y + rm.h - 1) return { b: q.b, rm };
  return { b: q.b, rm: null };
}
const pressurised = q => q && q.b.kind === 'station' && q.b.flr[q.c.i] === 2;
/** ship the suit can board right now */
export function boardable() {
  if (!ev) return null;
  let best = null, bd = 15;
  for (const s of W.ships) {
    if (s.dead || !s.own) continue;
    const d = hy(ev.x - s.x, ev.y - s.y) - s.rad * 0.5; if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function mkSuit(x, y, vx = 0, vy = 0, home = null) {
  return { x, y, vx, vy, a: 0, suit: 100, sack: {}, carry: null, dead: false, pingT: 9, pingEnd: 0, bob: 0, home, grounded: 0, beam: null, hide: false, jet: 0 };
}

/** place the suit in the station interior nearest to a docked port (airlock transfer) */
export function airlockSpot(b, x, y) {
  let best = null, bd = 1e9;
  for (let cy = 0; cy < b.gh; cy++) for (let cx = 0; cx < b.gw; cx++) {
    const i = cy * b.gw + cx; if (b.sol[i] || b.flr[i] !== 2) continue;
    const w = cw(b, cx, cy), d = hy(w.x - x, w.y - y); if (d < bd) { bd = d; best = w; }
  }
  return best;
}

export function enterEVA(silent) {
  if (ev || !pl || pl.dead) return;
  const s = pl;
  if (!s.dock && hy(s.vx, s.vy) > 2.5 && !s.grounded) { hooks.toast('EVA denied — kill drift below 2.5 m/s', 'warn'); return; }
  let p = null;
  if (s.dock && (s.dock.ty === 'port' || s.dock.ty === 'pad')) p = airlockSpot(s.dock.b, s.x, s.y);
  if (!p) { const d = s.a + Math.PI / 2; p = { x: s.x + Math.cos(d) * (s.belly + 3), y: s.y + Math.sin(d) * (s.belly + 3) }; }
  setEv(mkSuit(p.x, p.y, s.dock ? 0 : s.vx, s.dock ? 0 : s.vy, s)); ev.a = s.a;
  s.thr = s.rcx = s.rcy = s.tqi = 0; s.wantM = false; s.isPl = false;
  setPl(null); W.stats.eva++;
  AU.air(true); AU.puff();
  PC.scan = false; hooks.closeStation();
  if (!silent) hooks.toast('SUIT · air ' + C.EVA.air + 's · cutter on [MINE] · sack fills itself · F at the hull to board', 'good');
}
/** climb aboard a ship (own hull or the crew shuttle you came out of) */
export function boardShip(s) {
  if (!ev || !s || s.dead) return;
  if (ev.carry) { const t = ev.carry.type; if (s.own && cadd(s, t, ev.carry.qty)) { ev.carry.dead = true; } else { ev.carry.held = false; ev.carry.x = ev.x; ev.carry.y = ev.y; } ev.carry = null; }
  if (s.own) { stow(s); s.isPl = true; setPl(s); }
  setEv(null); AU.air(false); AU.thunk();
  if (!s.own) hooks.boardCrew && hooks.boardCrew(s);
}
/** empty the sack into a ship's hold (own) or the crew tally (shuttle) */
export function stow(s) {
  if (!ev) return 0;
  let n = 0;
  for (const g in ev.sack) {
    const q = ev.sack[g]; if (!q) continue;
    let t;
    if (s.own) t = cadd(s, g, q);
    else { t = q; G.crew && (G.crew.haul[g] = (G.crew.haul[g] || 0) + q); }
    ev.sack[g] -= t; n += t;
    if (!ev.sack[g]) delete ev.sack[g];
  }
  if (n) { AU.blip(); hooks.toast('STOWED ' + n + ' units' + (s.own ? '' : ' to the crew tally'), 'good'); }
  return n;
}
export function ping() {
  if (!ev || ev.pingT < 1.2) return;
  ev.pingT = 0; ev.pingEnd = W.time + 6; AU.tick(0.8);
  for (const p of W.picks) if (hy(p.x - ev.x, p.y - ev.y) < C.EVA.ping) p.rev = W.time + 6;
  for (const c of W.contacts) if (!c.done && hy(c.x - ev.x, c.y - ev.y) < C.EVA.ping * 1.3) c.hint = W.time + 6;
  let n = 0;
  for (const b of W.rocks) if (!b.cat && hy(b.x - ev.x, b.y - ev.y) - b.rad < C.EVA.ping * 0.6) { hooks.onCatalog(b, 'suit'); n++; }
  hooks.toast(n ? 'HAND SCANNER · ' + n + ' body surveyed' : 'HAND SCANNER · valuables outlined 6s', 'good');
}

/** EVA hand cutter: short beam, weak, auto-assist toward the nearest rock face */
function cutter(e, dt) {
  e.beam = null;
  if (!CTL.mine) return;
  let dx = Math.cos(e.a), dy = Math.sin(e.a), h = ray(e.x, e.y, dx, dy, C.CUT.rng);
  if (!h || h.b.kind === 'station') {
    // nudge toward the closest solid cell in a forward cone
    let best = null, bd = 1e9;
    for (let k = -6; k <= 6; k++) {
      const a = e.a + k * 0.09, q = ray(e.x, e.y, Math.cos(a), Math.sin(a), C.CUT.rng);
      if (q && q.b.kind !== 'station' && q.d + Math.abs(k) * 2 < bd) { bd = q.d + Math.abs(k) * 2; best = a; }
    }
    if (best !== null) { e.a += ad(best, e.a) * Math.min(1, dt * 6); dx = Math.cos(e.a); dy = Math.sin(e.a); h = ray(e.x, e.y, dx, dy, C.CUT.rng); }
  }
  if (h && h.b.kind !== 'station') {
    e.beam = { x0: e.x, y0: e.y, x1: h.x, y1: h.y };
    const m = cut(h.b, h.cx, h.cy, C.CUT.dps * dt * (G.suitUp || 1));
    if (m) spill(m, h.x, h.y, dx, dy, true, 0.6);
    if (R() < 0.3) sparks(h.x, h.y, 2, '#ffb347', 40);
  } else e.beam = { x0: e.x, y0: e.y, x1: e.x + dx * C.CUT.rng, y1: e.y + dy * C.CUT.rng, miss: true };
}

export function stepEVA(dt) {
  if (!ev || ev.dead) return;
  const e = ev;
  if (e.hide) return;   // riding the lift / a shuttle
  e.pingT += dt; e.bob += dt;
  const r = hy(e.x, e.y), ux = e.x / r, uy = e.y / r, g = geff(r);
  gacc(e.x, e.y, e.vx, e.vy, A); e.vx += A.x * dt; e.vy += A.y * dt;
  // stick is screen-frame; rotate into the world
  const cr = Math.cos(cam.rot), sr = Math.sin(cam.rot), wx = CTL.lx * cr - CTL.ly * sr, wy = CTL.lx * sr + CTL.ly * cr, al = hy(wx, wy);
  const onFloor = e.grounded > 0;
  // walking rules only near the regolith: the low band also pulls > 0.4 m/s², and there you need the jetpack, not your feet
  const nearGround = r - surfR(Math.atan2(e.y, e.x)) < 60;
  if (g > 0.4 && nearGround) {
    // surface mode: walk along the regolith / deck, W fires the jets for a hop, air control is weak
    const tx = -uy, ty = ux, vt = e.vx * tx + e.vy * ty, vr = e.vx * ux + e.vy * uy, want = CTL.lx * C.EVA.walk * (e.carry ? 0.7 : 1);
    if (onFloor || Math.abs(CTL.lx) > 0.1) { const acc = onFloor ? 40 : 7, dv = cl(want - vt, -acc * dt, acc * dt); e.vx += tx * dv; e.vy += ty * dv; }
    if (Math.abs(CTL.lx) > 0.2) e.a = Math.atan2(ty * Math.sign(CTL.lx), tx * Math.sign(CTL.lx));
    if (CTL.ly < -0.3 && vr < 12) { e.vx += ux * C.EVA.acc * -CTL.ly * dt * 1.2; e.vy += uy * C.EVA.acc * -CTL.ly * dt * 1.2; e.jet = 0.2; if (R() < 0.3) gas(e.x - ux * 3, e.y - uy * 3, e.vx - ux * 25, e.vy - uy * 25); }
    else if (CTL.ly > 0.3 && !onFloor && vr > -12) { e.vx -= ux * C.EVA.acc * 0.5 * dt; e.vy -= uy * C.EVA.acc * 0.5 * dt; e.jet = 0.15; }
    if (onFloor && Math.abs(want) > 1 && R() < dt * 4) dust(e.x - ux * 2.6, e.y - uy * 2.6, ux, uy, 1);
  } else if (al > 0.08) {
    const a = C.EVA.acc * (e.carry ? 0.68 : 1), dx = wx / al, dy = wy / al;
    // jetpack: capped at 30 m/s relative to whatever is nearby
    let rvx = e.vx, rvy = e.vy; const nb = near(e.x, e.y, 200)[0]; if (nb) { rvx -= nb.vx || 0; rvy -= nb.vy || 0; }
    if (rvx * dx + rvy * dy < 30) { e.vx += dx * a * Math.min(1, al) * dt; e.vy += dy * a * Math.min(1, al) * dt; }
    e.jet = 0.15;
    if (R() < 0.25) gas(e.x - wx * 3, e.y - wy * 3, e.vx - wx * 25, e.vy - wy * 25);
  } else if (g < 0.8 || !nearGround) {
    // SAFER hold: with the stick released the suit nulls drift against the nearest body
    let rvx = e.vx, rvy = e.vy;
    const nb = near(e.x, e.y, 60)[0]; if (nb) { rvx -= nb.vx || 0; rvy -= nb.vy || 0; }
    const m = hy(rvx, rvy);
    if (m > 0.05) { const k = Math.min(m, C.EVA.acc * 0.45 * dt) / m; e.vx -= rvx * k; e.vy -= rvy * k; }
  }
  if (Math.abs(CTL.rx) > 0.15) e.a += CTL.rx * 2.6 * dt;
  else if (!onFloor && al > 0.3 && !CTL.mine) e.a += ad(Math.atan2(wy, wx), e.a) * Math.min(1, dt * 3);
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.grounded = Math.max(0, e.grounded - dt);
  collide(e, 2.6, (im, x, y) => { if (im > 7) { e.suit -= (im - 7) * 3; sparks(x, y, 3, '#a8ecff', 40); AU.thunk(); } });
  const gc = ground(e, 2.6, dt, 0.1, onFloor && Math.abs(CTL.lx) < 0.1 ? 9 : 0.6);
  if (gc) { e.grounded = 0.15; if (gc.im > 9) { e.suit -= (gc.im - 9) * 3; AU.thunk(); } }
  if (g > 0.4 && nearGround && solidAt(e.x - ux * 3.3, e.y - uy * 3.3)) {
    e.grounded = 0.15;
    if (Math.abs(CTL.lx) < 0.1) { const tx = -uy, ty = ux, vt = e.vx * tx + e.vy * ty, k = 1 - Math.exp(-9 * dt); e.vx -= tx * vt * k; e.vy -= ty * vt * k; }
  }
  if (e.jet > 0) e.jet -= dt;
  cutter(e, dt);
  // air: pressurised rooms and the home hull refill; vacuum drains (solar storms bite hard)
  const q = inBody(e.x, e.y), home = e.home && !e.home.dead && hy(e.x - e.home.x, e.y - e.home.y) < 14;
  if (pressurised(q) || home) e.suit = Math.min(100, e.suit + dt * 30);
  else e.suit -= dt * (100 / (C.EVA.air * (G.airUp || 1))) * (W.flare && W.flare.on ? 3.5 : 1);
  // ore sack: grit and chunks drift in on their own
  if (sackN(e) < C.EVA.sack * (G.sackUp || 1)) {
    for (const p of W.picks) {
      if (p.dead || p.held || !GD[p.type] || p.age < 0.3) continue;
      const d = hy(p.x - e.x, p.y - e.y);
      if (d < (GD[p.type].story ? 30 : 9)) {
        const k = (90 * dt) / Math.max(3, d); p.vx += (e.x - p.x) * k; p.vy += (e.y - p.y) * k;
        if (d < 3.5) {
          const room = Math.floor(C.EVA.sack * (G.sackUp || 1)) - sackN(e), t = Math.min(room, p.qty);
          if (t > 0) { e.sack[p.type] = (e.sack[p.type] || 0) + t; p.qty -= t; if (p.qty <= 0) p.dead = true; AU.blip(); }
        }
      }
    }
  } else if (!e.fullT || W.time - e.fullT > 12) { e.fullT = W.time; hooks.toast('SACK FULL — stow it at the hull', 'warn'); }
  if (e.home && hy(e.x - e.home.x, e.y - e.home.y) < 16 && sackN(e)) stow(e.home);
  if (e.carry) { e.carry.x = e.x + Math.cos(e.a) * 4; e.carry.y = e.y + Math.sin(e.a) * 4; e.carry.vx = e.vx; e.carry.vy = e.vy; }
  if (e.suit <= 0) {
    e.dead = true; AU.warn();
    hooks.suitOut && hooks.suitOut(e);
  }
}

export function nearestCrew() {
  if (!ev) return null;
  let best = null, bd = 15;
  for (const b of W.bodies) {
    if (b.dead || !b.crew.length) continue;
    if (Math.abs(b.x - ev.x) > b.rad + 20 || Math.abs(b.y - ev.y) > b.rad + 20) continue;
    for (const cr of b.crew) {
      const c = Math.cos(b.a), s = Math.sin(b.a);
      const x = b.x + cr.lx * c - cr.ly * s, y = b.y + cr.lx * s + cr.ly * c, d = hy(ev.x - x, ev.y - y);
      if (d < bd) { bd = d; best = { cr, b }; }
    }
  }
  return best;
}
export { MAT };
