// ═══ the band's director: inbound hauls, transfer windows, storms ════════
import { TAU, hy, rr, ri, pk, cl, $ } from './core/util.js';
import { C, PAL } from './core/config.js';
import { W, G, pl, ev, cam, focus } from './core/state.js';
import { spawnRock, replaceTransfer, SITES } from './world/gen.js';
import { mkShip, undock, sprite } from './ships.js';
import { mkJobs } from './missions.js';
import { feed } from './economy.js';
import { bit, smoke } from './fx.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const R = Math.random;
export function eventsInit() {
  W.evt = { next: 150, haul: null, shower: null };
  W.flare = { on: false, t: 0, warn: 0, next: 420 + R() * 200 };
  SITES.ares.transfer.depart = W.time + 780; SITES.gaia.transfer.depart = W.time + 1080;
}
function banner(t, k) { const b = $('evBan'); if (!b) return; b.textContent = t; b.className = 'on ' + (k || ''); clearTimeout(b._t); b._t = setTimeout(() => (b.className = ''), 6000); }

export function eventsTick(dt) {
  const E = W.evt; if (!E) return;
  E.next -= dt;
  if (E.next <= 0) { E.next = rr(R, 200, 320); if (!E.haul) startHaul(); else if (!E.shower) startShower(); }
  stepHaul(dt); stepShower(dt); stepFlare(dt); stepTransfers(dt);
}

// ─── inbound haul: an automated engine parks a fresh, uncatalogued body ─
function startHaul() {
  const th = C.TH0 + rr(R, -0.9, 0.9), rad = C.RS + rr(R, -250, 250), tx = Math.cos(th) * rad, ty = Math.sin(th) * rad;
  for (const b of W.rocks) if (hy(b.x - tx, b.y - ty) < b.rad + 200) return;
  const comet = R() < 0.35, R0 = comet ? rr(R, 18, 28) : rr(R, 14, 30);
  const sx = Math.cos(th + 0.05) * (C.RS + 2600), sy = Math.sin(th + 0.05) * (C.RS + 2600);
  const b = spawnRock(ri(R, 1, 1e9), sx, sy, R0, comet ? 'comet' : pk(R, ['rock', 'metal', 'ice']));
  b.inbound = true; b.kin = true;
  const tug = mkShip('tug', 'selene', 'HAUL ENGINE ' + ri(R, 10, 99), sx, sy); tug.rail = true; tug.ghost = true;
  W.evt.haul = { b, tug, tx, ty, t: 0, dur: 75, sx, sy, stage: 'in' };
  banner('INBOUND HAUL · ' + tug.name + ' delivering a ' + (comet ? 'comet nucleus' : 'body') + ' — uncatalogued');
  feed(tug.name + ' is bringing a new ' + (comet ? 'comet' : 'asteroid') + ' into the band.', 'warn');
  W.stats.events++;
}
function stepHaul(dt) {
  const H = W.evt.haul; if (!H) return;
  H.t += dt;
  const b = H.b, tug = H.tug;
  if (H.stage === 'in') {
    const k = cl(H.t / H.dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
    const px = b.x, py = b.y;
    b.x = H.sx + (H.tx - H.sx) * e; b.y = H.sy + (H.ty - H.sy) * e;
    b.vx = (b.x - px) / dt; b.vy = (b.y - py) / dt;
    const dir = Math.atan2(H.ty - H.sy, H.tx - H.sx);
    tug.x = b.x - Math.cos(dir) * (b.rad + 14); tug.y = b.y - Math.sin(dir) * (b.rad + 14); tug.a = dir + Math.PI; tug.thr = k < 0.95 ? 1 - k * 0.6 : 0;
    tug.vx = b.vx; tug.vy = b.vy;
    if (k >= 1) {
      b.vx = b.vy = 0; b.inbound = false; b.kin = false; H.stage = 'out'; H.t = 0;
      const x = W.extra.find(q => q.seed && !q.done && Math.abs(q.x - H.sx) < 1 && Math.abs(q.y - H.sy) < 1); if (x) { x.x = H.tx; x.y = H.ty; x.done = true; }
      for (const c of b.contacts || []) c.done = c.done || false;
      feed(b.name + ' parked in the band. Catalog status: UNKNOWN.', 'warn');
      if (focus() && hy(focus().x - b.x, focus().y - b.y) < 1500) hooks.toast('NEW BODY PARKED · ' + b.name + ' — first survey pays a bonus', 'good');
      b.fresh = true;
    }
    if (tug.thr > 0.1 && hy(tug.x - cam.x, tug.y - cam.y) < 1500) for (let i = 0; i < 2; i++) bit({ x: tug.x - Math.cos(tug.a) * 10, y: tug.y - Math.sin(tug.a) * 10, vx: -Math.cos(tug.a) * 70 + rr(R, -8, 8), vy: -Math.sin(tug.a) * 70 + rr(R, -8, 8), life: 0.4, max: 0.4, s: 3, c: '#53d9ff', t: 'thrust' });
  } else {
    // the engine unlatches and climbs away
    const r = hy(tug.x, tug.y), ux = tug.x / r, uy = tug.y / r;
    tug.a = Math.atan2(uy, ux); tug.thr = 1; tug.vx += ux * 6 * dt; tug.vy += uy * 6 * dt; tug.x += tug.vx * dt; tug.y += tug.vy * dt;
    if (H.t > 40) { tug.dead = true; W.evt.haul = null; }
  }
  sprite(tug);
}

// ─── micrometeoroid shower ───────────────────────────────────────────────
function startShower() {
  const f = focus(); if (!f) return;
  if (Math.hypot(f.x, f.y) < C.RS - 800) return;
  W.evt.shower = { t: -12, dur: 22, a: Math.atan2(f.y, f.x) + rr(R, -1.2, 1.2), x: f.x, y: f.y };
  banner('MICROMETEOROID STREAM in 12 s — get behind rock or dock', 'bad'); AU.alarm(); W.stats.events++;
}
function stepShower(dt) {
  const S = W.evt.shower; if (!S) return;
  S.t += dt;
  if (S.t > 0 && S.t < S.dur && R() < dt * 9) {
    const f = focus() || S, d = { x: -Math.cos(S.a), y: -Math.sin(S.a) }, o = rr(R, -420, 420);
    const x0 = f.x + Math.cos(S.a) * 700 - d.y * o, y0 = f.y + Math.sin(S.a) * 700 + d.x * o, sp = rr(R, 160, 240);
    W.meteors.push({ x: x0, y: y0, px: x0, py: y0, vx: d.x * sp, vy: d.y * sp, life: 6, r: rr(R, 0.5, 1.4) });
  }
  if (S.t > S.dur) W.evt.shower = null;
}

// ─── solar particle event ────────────────────────────────────────────────
function stepFlare(dt) {
  const F = W.flare;
  if (!F.on && F.warn <= 0) { F.next -= dt; if (F.next <= 0) { F.warn = 40; banner('SOLAR PARTICLE EVENT in 40 s — EVA crews get under a roof. Suit air burns ×3.5 outside.', 'bad'); AU.alarm(); W.stats.events++; } }
  else if (F.warn > 0) { F.warn -= dt; if (F.warn <= 0) { F.on = true; F.t = 35; banner('PROTON STORM — shelter in a hull or pressurised room', 'bad'); } }
  else if (F.on) { F.t -= dt; if (F.t <= 0) { F.on = false; F.next = rr(R, 500, 800); banner('Storm passed. Back to work.'); } }
}

// ─── transfer windows: ARES / GAIA depart and are replaced ──────────────
function stepTransfers(dt) {
  for (const key of ['ares', 'gaia']) {
    const st = SITES[key]; if (!st) continue;
    const T = st.transfer;
    if (st.gone) {
      if (W.time > T.back) arriveReplacement(key, st);
      continue;
    }
    if (st.leaving) {
      // burn out of the band: prograde and up
      const r = hy(st.x, st.y), ux = st.x / r, uy = st.y / r;
      st.vx += (ux * 3 - uy * 4) * dt; st.vy += (uy * 3 + ux * 4) * dt;
      const ex = st.x - Math.cos(st.a) * st.gw * st.cs * 0.5, ey = st.y - Math.sin(st.a) * st.gw * st.cs * 0.5;
      if (hy(ex - cam.x, ey - cam.y) < 2400) for (let i = 0; i < 3; i++) bit({ x: ex + rr(R, -10, 10), y: ey + rr(R, -10, 10), vx: st.vx - Math.cos(st.a) * 120 + rr(R, -10, 10), vy: st.vy - Math.sin(st.a) * 120 + rr(R, -10, 10), life: 0.7, max: 0.7, s: rr(R, 4, 8), c: '#ffd9a0', t: 'thrust' });
      if (r > C.RS + 3200) {
        st.gone = true; T.back = W.time + 100;
        W.bodies = W.bodies.filter(b => b !== st); W.stations = W.stations.filter(b => b !== st);
        for (const c of W.contacts) if (c.b === st) c.done = true;
      }
      continue;
    }
    const left = T.depart - W.time;
    if (left < 240 && !T.warned) { T.warned = true; banner(st.name + ' departs for ' + (T.dest === 'mars' ? 'MARS' : 'EARTH') + ' in 4:00 — last-minute cargo pays a premium', 'warn'); feed(st.name + ' opened its final loading window.', 'warn'); }
    if (left <= 0) depart(st);
  }
}
function depart(st) {
  st.leaving = true; st.x0 = st.x; st.y0 = st.y; st.r0 = hy(st.x, st.y);
  for (const s of W.ships) if (s.dock && s.dock.b === st) { undock(s); if (s === pl) hooks.toast(st.name + ' is leaving — you were cast off', 'warn'); }
  if (ev && !ev.hide) { const c = Math.cos(-st.a), n = Math.sin(-st.a), dx = ev.x - st.x, dy = ev.y - st.y, lx = dx * c - dy * n, ly = dx * n + dy * c; if (Math.abs(lx) < st.gw * st.cs / 2 && Math.abs(ly) < st.gh * st.cs / 2) hooks.toast('You are aboard a departing ship — get out through an airlock!', 'bad'); }
  banner(st.name + ' BURNING FOR ' + (st.transfer.dest === 'mars' ? 'MARS' : 'EARTH'), 'warn'); AU.boom(0.6);
  feed(st.name + ' departed the band.', 'good');
}
function arriveReplacement(key, old) {
  const gen = old.transfer.gen + 1, b = replaceTransfer(old, gen);
  const tx = b.x, ty = b.y, r = hy(tx, ty), sx = tx / r * (r + 2200), sy = ty / r * (r + 2200);
  b.x = sx; b.y = sy; b.kin = true; b.arr = { t: 0, dur: 70, sx, sy, tx, ty };
  b.mover = (q, dt) => {
    const A = q.arr; if (!A) return; A.t += dt;
    const k = cl(A.t / A.dur, 0, 1), e = 1 - Math.pow(1 - k, 3), px = q.x, py = q.y;
    q.x = A.sx + (A.tx - A.sx) * e; q.y = A.sy + (A.ty - A.sy) * e; q.vx = (q.x - px) / dt; q.vy = (q.y - py) / dt;
    if (k >= 1) { q.arr = null; q.mover = null; q.kin = false; q.vx = q.vy = 0; }
  };
  b.transfer.depart = W.time + rr(R, 900, 1300);
  W.bodies.push(b); W.stations.push(b); SITES[key] = b;
  mkJobs(b);
  banner(b.name + ' arriving in the band — new loading window open');
  feed(b.name + ' arrived. Buyers aboard.', 'good');
}
export const flareOn = () => W.flare && W.flare.on;
export { PAL, TAU, smoke };
