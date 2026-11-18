// ═══ renderer: Moon, band, bodies, ships, suits, lighting, canvas HUD ═══
// The view is rotated by cam.rot so local "up" (away from the Moon) is
// always screen-up — from HAB 14's airlock to the synchronous band.
import { $, TAU, cl, lp, hy, ds, sh } from '../core/util.js';
import { C, PAL, FC, GD, gacc } from '../core/config.js';
import { W, G, pl, ev, cam, PC, focus } from '../core/state.js';
import { near, ca, cw, portW } from '../world/body.js';
import { MOON, surfR, daylight, sunAng, altAt, MOON_N, MOON_STEP } from '../world/moon.js';
import { sprite, alive } from '../ships.js';
import { camX, camY, tele } from '../player.js';
import { scanOrg } from '../scanner.js';
import { SITES } from '../world/gen.js';

export const V = { cv: null, c: null, w: 0, h: 0, bw: 0, bh: 0, rs: 0.8, k: 1, ox: 0, oy: 0, cr: 1, sr: 0, frame: 0 };
let LC = null, LX = null;

export function resize() {
  const cv = V.cv || (V.cv = $('cv')), r = cv.getBoundingClientRect();
  V.w = r.width; V.h = r.height;
  V.bw = Math.max(320, Math.min(1500, Math.round(r.width * 0.8))); V.bh = Math.max(240, Math.min(950, Math.round(r.height * 0.8)));
  V.rs = V.bw / Math.max(1, r.width); cv.width = V.bw; cv.height = V.bh;
  V.c = cv.getContext('2d', { alpha: false }); V.c.imageSmoothingEnabled = false;
  if (!LC) { LC = document.createElement('canvas'); LX = LC.getContext('2d'); }
  LC.width = V.bw; LC.height = V.bh;
}
/** world → canvas pixel */
export const w2s = (x, y) => { const dx = x - camX(), dy = y - camY(); return { x: V.ox + (dx * V.cr + dy * V.sr) * V.k, y: V.oy + (-dx * V.sr + dy * V.cr) * V.k }; };
const setWorld = c => c.setTransform(V.k * V.cr, -V.k * V.sr, V.k * V.sr, V.k * V.cr, V.ox - V.k * (camX() * V.cr + camY() * V.sr), V.oy - V.k * (-camX() * V.sr + camY() * V.cr));

function inside(b) {
  const f = focus(); if (!f) return false;
  if (pl && pl.dock && pl.dock.b === b && !ev && pl.dock.ty !== 'anchor') return true;
  const c = ca(b, f.x, f.y); return !!c && !b.sol[c.i] && b.flr[c.i] > 0;
}
function entBody(e) {
  if (e._bt !== undefined && W.time - e._bt < 0.5 && e._bt <= W.time) return e._b;
  e._bt = W.time; let f = null;
  for (const b of near(e.x, e.y, 8)) { const c = ca(b, e.x, e.y); if (c && !b.sol[c.i] && b.flr[c.i] > 0) { f = b; break; } }
  e._b = f; return f;
}
function glow(x, y, c, r, a) {
  const g = V.c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
  V.c.globalAlpha = a; V.c.globalCompositeOperation = 'lighter'; V.c.fillStyle = g; V.c.beginPath(); V.c.arc(x, y, r, 0, TAU); V.c.fill();
  V.c.globalCompositeOperation = 'source-over'; V.c.globalAlpha = 1;
}

// ─── sky: stars, Sun, Earth ──────────────────────────────────────────────
const EARTH_TH = C.TH0 - 0.32;   // Earth hangs fixed in the lunar sky (tidal lock)
function drawSky() {
  const c = V.c, bw = V.bw, bh = V.bh, f = focus(), alt = f ? altAt(f.x, f.y) : 1000;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#03050a'; c.fillRect(0, 0, bw, bh);
  // star tiles rotate with the view
  c.save(); c.translate(bw / 2, bh / 2); c.rotate(-cam.rot);
  const D = Math.hypot(bw, bh) / 2 + 10;
  for (let L = 0; L < 2; L++) {
    const t = W.bg.stars[L], par = [0.02, 0.05][L], tw = 512 * V.rs * (1 + L * 0.4);
    let ox = -((camX() * par * V.rs) % tw), oy = -((camY() * par * V.rs) % tw);
    if (ox > 0) ox -= tw; if (oy > 0) oy -= tw;
    c.globalAlpha = 0.85;
    for (let x = ox - Math.ceil(D / tw) * tw; x < D; x += tw) for (let y = oy - Math.ceil(D / tw) * tw; y < D; y += tw) c.drawImage(t, x, y, tw, tw);
  }
  c.globalAlpha = 1;
  // the Sun (sweeps round in the rotating frame) and the Earth (fixed)
  const sa = sunAng(W.time), R0 = Math.min(bw, bh) * 0.42;
  const sx = Math.cos(sa) * R0 * 2.2, sy = Math.sin(sa) * R0 * 2.2;
  const g = c.createRadialGradient(sx, sy, 0, sx, sy, R0 * 0.9); g.addColorStop(0, 'rgba(255,248,230,.55)'); g.addColorStop(0.08, 'rgba(255,240,200,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(sx - R0, sy - R0, R0 * 2, R0 * 2);
  const ex = Math.cos(EARTH_TH) * R0 * 1.05 - camX() * 0.004 * V.rs, ey = Math.sin(EARTH_TH) * R0 * 1.05 - camY() * 0.004 * V.rs, er = 30 * V.rs * (alt > 600 ? 1.15 : 1);
  c.save(); c.translate(ex, ey);
  const hg = c.createRadialGradient(0, 0, er * 0.9, 0, 0, er * 1.45); hg.addColorStop(0, 'rgba(120,180,255,.25)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = hg; c.beginPath(); c.arc(0, 0, er * 1.45, 0, TAU); c.fill();
  c.rotate(W.time * 0.004); c.drawImage(W.bg.earth, -er, -er, er * 2, er * 2); c.rotate(-W.time * 0.004);
  // phase: night side away from the Sun
  const nx = -Math.cos(sa), ny = -Math.sin(sa);
  c.beginPath(); c.arc(0, 0, er + 0.5, 0, TAU); c.clip();
  c.fillStyle = 'rgba(2,4,10,.82)'; c.beginPath(); c.arc(nx * er * 0.9, ny * er * 0.9, er * 1.25, 0, TAU); c.fill();
  c.restore();
  c.restore();
}

// ─── the Moon ────────────────────────────────────────────────────────────
function drawMoon() {
  const c = V.c, f = { x: camX(), y: camY() }, rc = hy(f.x, f.y), thc = Math.atan2(f.y, f.x);
  const halfW = Math.hypot(V.bw, V.bh) / 2 / V.k;
  if (rc - halfW > C.RM + 80) return false;   // nothing of the Moon on screen
  // visible longitude span
  const span = rc < C.RM + 50 ? Math.PI : Math.min(Math.PI, Math.asin(cl(halfW / Math.max(rc, C.RM), 0, 1)) + halfW / C.RM);
  const step = Math.max(MOON_STEP, Math.min(0.01, 2.2 / V.k / C.RM)), n = Math.min(2400, Math.ceil((2 * span) / step));
  const th0 = thc - span, dth = (2 * span) / n;
  const depth = cl(halfW * 0.5, 20, 220), Ri = C.RM - 130 - depth;
  // regolith strip, shaded per sample by sunlight
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const th = th0 + i * dth, r = surfR(th), cx = Math.cos(th), sy = Math.sin(th);
    const p = { ox: cx * r, oy: sy * r, ix: cx * Ri, iy: sy * Ri, d: daylight(th, W.time) };
    if (prev) {
      const k = 0.3 + 0.7 * prev.d;
      c.fillStyle = sh('#8a847a', k);
      c.beginPath(); c.moveTo(prev.ox, prev.oy); c.lineTo(p.ox, p.oy); c.lineTo(p.ix, p.iy); c.lineTo(prev.ix, prev.iy); c.closePath(); c.fill();
    }
    prev = p;
  }
  // deep interior
  c.fillStyle = sh('#8a847a', 0.22 + 0.4 * daylight(thc, W.time)); c.beginPath(); c.arc(0, 0, Ri + 1, 0, TAU); c.fill();
  // bright rim line along the surface
  c.strokeStyle = 'rgba(230,224,210,.35)'; c.lineWidth = 1.2 / V.k; c.beginPath();
  for (let i = 0; i <= n; i++) { const th = th0 + i * dth, r = surfR(th); i ? c.lineTo(Math.cos(th) * r, Math.sin(th) * r) : c.moveTo(Math.cos(th) * r, Math.sin(th) * r); }
  c.stroke();
  // strata and pebble speckle when close
  if (V.k > 0.5) {
    const N = MOON.boulders.length; let lo = 0, hi = N;
    const a0 = ((th0 % TAU) + TAU) % TAU;
    while (lo < hi) { const m = (lo + hi) >> 1; if (MOON.boulders[m].th < a0) lo = m + 1; else hi = m; }
    for (let k = 0; k < N; k++) {
      const bd = MOON.boulders[(lo + k) % N]; let x = bd.th - a0; if (x < 0) x += TAU; if (x > 2 * span) break;
      const r = surfR(bd.th), ux = Math.cos(bd.th), uy = Math.sin(bd.th), tx = -uy, ty = ux, s = bd.s, d = daylight(bd.th, W.time);
      const bx = ux * (r + s * 0.3), by = uy * (r + s * 0.3);
      c.fillStyle = sh('#9a9488', 0.32 + d * 0.68);
      c.beginPath(); c.moveTo(bx - tx * s, by - ty * s); c.lineTo(bx - tx * s * 0.5 + ux * s * 0.9, by - ty * s * 0.5 + uy * s * 0.9); c.lineTo(bx + tx * s * 0.6 + ux * s * 0.7, by + ty * s * 0.6 + uy * s * 0.7); c.lineTo(bx + tx * s, by + ty * s); c.closePath(); c.fill();
    }
  }
  return true;
}
/** the cable and both lift cars */
function drawLift() {
  const L = W.lift; if (!L || !L.E) return;
  const c = V.c, E = L.E;
  c.strokeStyle = 'rgba(160,190,210,.55)'; c.lineWidth = Math.max(0.5, 1.2 / V.k);
  for (const o of [-1.4, 1.4]) { const nx = -(E.t.y - E.g.y) / L.len * o, ny = (E.t.x - E.g.x) / L.len * o; c.beginPath(); c.moveTo(E.g.x + nx, E.g.y + ny); c.lineTo(E.t.x + nx, E.t.y + ny); c.stroke(); }
  // marker lights every 100 m
  const bl = Math.sin(W.time * 3) > 0;
  for (let s = 100; s < L.len; s += 100) { const k = s / L.len, x = E.g.x + (E.t.x - E.g.x) * k, y = E.g.y + (E.t.y - E.g.y) * k; c.fillStyle = bl ? PAL.red : '#3a1a18'; c.fillRect(x - 0.9, y - 0.9, 1.8, 1.8); }
  const a = Math.atan2(E.t.y - E.g.y, E.t.x - E.g.x);
  for (const car of L.cars) {
    c.save(); c.translate(car.x, car.y); c.rotate(a);
    c.fillStyle = '#41546b'; c.fillRect(-5, -4, 10, 8); c.fillStyle = '#2b3a4d'; c.fillRect(-4, -3, 8, 6);
    c.fillStyle = car.rider ? PAL.cyan : 'rgba(255,209,102,.8)'; c.fillRect(-1, -3, 2, 6);
    c.fillStyle = car.dir ? PAL.green : PAL.amber; c.fillRect(4, -0.8, 1.2, 1.6);
    c.restore();
    if (car.dir) glow(car.x, car.y, PAL.cyan, 12, 0.25);
  }
}

// ─── bodies ──────────────────────────────────────────────────────────────
function drawFloor(b) {
  const c = V.c, w = b.gw * b.cs, h = b.gh * b.cs;
  c.save(); c.translate(b.x, b.y); c.rotate(b.a);
  c.drawImage(b.floorCv, -w / 2, -h / 2, w, h);
  if (b.roofA < 0.85) for (const g of b.glow) glow(g.lx, g.ly, g.c, g.r, b.roofA < 0.5 ? 0.9 : 0.3);
  if (b.roofA < 0.9) for (const cr of b.crew) {
    const bob = Math.sin(W.time * 1.3 + cr.lx) * 0.3;
    c.fillStyle = cr.c; c.fillRect(cr.lx - 1.2, cr.ly - 1.2 + bob, 2.4, 2.4);
    c.fillStyle = '#53d9ff'; c.fillRect(cr.lx - 0.4, cr.ly - 1.6 + bob, 1, 0.8);
  }
  c.restore();
}
function drawRoof(b) {
  const c = V.c, w = b.gw * b.cs, h = b.gh * b.cs;
  c.save(); c.translate(b.x, b.y); c.rotate(b.a);
  c.globalAlpha = b.roofA; c.drawImage(b.roofCv, -w / 2, -h / 2, w, h); c.globalAlpha = 1;
  if (b.veinOn) {
    c.fillStyle = 'rgba(255,209,102,' + (0.45 + 0.35 * Math.sin(W.time * 3)) + ')';
    for (const i of b.veins) if (b.sol[i]) c.fillRect((i % b.gw) * b.cs - w / 2, ((i / b.gw) | 0) * b.cs - h / 2, b.cs, b.cs);
  }
  // comet vapour jets
  for (const f of b.fog) {
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const t = W.time * 0.16 + f.ph + k * 2.1, x = f.lx + Math.cos(t) * f.r * 0.22, y = f.ly + Math.sin(t * 0.8) * f.r * 0.16, r = f.r * (0.6 + k * 0.18);
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(168,236,255,' + (0.07 - k * 0.015) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    if (f.jet !== null) {
      const ja = f.jet, L = 40 + 10 * Math.sin(W.time * 2 + f.ph), jx = f.lx + Math.cos(ja) * L, jy = f.ly + Math.sin(ja) * L;
      const g = c.createLinearGradient(f.lx, f.ly, jx, jy); g.addColorStop(0, 'rgba(200,240,255,.22)'); g.addColorStop(1, 'rgba(200,240,255,0)');
      c.strokeStyle = g; c.lineWidth = f.r * 0.6; c.beginPath(); c.moveTo(f.lx, f.ly); c.lineTo(jx, jy); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  if (b.roofA > 0.4 && b.kind === 'station') {
    const bl = Math.sin(W.time * 4) > 0;
    for (const p of b.ports) { const w2 = portW(b, p); c.fillStyle = p.occ ? PAL.red : p.berth ? PAL.gold : PAL.green; c.globalAlpha = bl ? 0.95 : 0.35; c.fillRect(w2.x - 1.4, w2.y - 1.4, 2.8, 2.8); }
    for (const p of b.pads) { const w2 = portW(b, p); c.fillStyle = p.occ ? PAL.red : PAL.gold; c.globalAlpha = bl ? 0.9 : 0.4; c.fillRect(w2.x - 1.6, w2.y - 1.6, 3.2, 3.2); }
    c.globalAlpha = 1;
  }
  if (b.transfer && !b.gone) {
    // big drive bells at the stern
    const e = { x: b.x - Math.cos(b.a) * (w / 2 + 4), y: b.y - Math.sin(b.a) * (w / 2 + 4) };
    if (b.leaving) glow(e.x, e.y, '#ffd9a0', 60, 0.8);
  }
}

// ─── entities ────────────────────────────────────────────────────────────
function drawShip(s) {
  if (s.dead) return;
  const c = V.c; if (s.dirty) sprite(s);
  c.save(); c.translate(s.x, s.y); c.rotate(s.a);
  const w = s.gw * C.SS, h = s.gh * C.SS;
  if (s.thr > 0 && s.fuel > 0 && alive(s, 'eng').length) {
    c.globalCompositeOperation = 'lighter';
    const fl = (s.tailLand ? 22 : 16) * s.thr + 6 + Math.random() * 3, g = c.createRadialGradient(-w / 2 - 4, 0, 0, -w / 2 - 4, 0, fl);
    g.addColorStop(0, 'rgba(255,220,150,.9)'); g.addColorStop(0.4, 'rgba(255,140,26,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(-w / 2 - 4, 0, fl, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,240,210,.8)'; c.beginPath(); c.moveTo(-w / 2, -1.8); c.lineTo(-w / 2 - 6 - s.thr * 18 * (0.8 + Math.random() * 0.4), 0); c.lineTo(-w / 2, 1.8); c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  c.drawImage(s.spr, -w / 2, -h / 2, w, h);
  if (s.gear && s.tailLand) {
    // landing legs splay from the tail
    c.strokeStyle = s.gearOK ? '#9fb0c4' : PAL.red; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(-w / 2 + 3, -h / 2 + 1); c.lineTo(-w / 2 - 2.5, -h / 2 - 3.5); c.moveTo(-w / 2 + 3, h / 2 - 1); c.lineTo(-w / 2 - 2.5, h / 2 + 3.5); c.stroke();
    c.fillStyle = '#9fb0c4'; c.fillRect(-w / 2 - 3.2, -h / 2 - 4.5, 1.4, 2.5); c.fillRect(-w / 2 - 3.2, h / 2 + 2, 1.4, 2.5);
  } else if (s.gear) { c.strokeStyle = PAL.green; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-3, h / 2); c.lineTo(-5, h / 2 + 3.5); c.moveTo(3, h / 2); c.lineTo(5, h / 2 + 3.5); c.stroke(); }
  if (s.hitT > 0) { c.fillStyle = 'rgba(255,240,210,' + Math.min(0.5, s.hitT) + ')'; c.fillRect(-w / 2, -h / 2, w, h); }
  const nv = Math.sin(W.time * 5 + s.x * 0.01) > 0;
  c.fillStyle = nv ? PAL.red : '#3a1a18'; c.fillRect(-w / 2, -h / 2, 1.4, 1.4);
  c.fillStyle = nv ? PAL.green : '#1a3a22'; c.fillRect(-w / 2, h / 2 - 1.4, 1.4, 1.4);
  c.restore();
  if (s.own && !s.isPl) { c.strokeStyle = 'rgba(83,217,255,.5)'; c.lineWidth = 1 / V.k; c.beginPath(); c.arc(s.x, s.y, s.rad + 3, 0, TAU); c.stroke(); }
}
function drawPick(p) {
  const c = V.c, g = GD[p.type];
  c.save(); c.translate(p.x, p.y); c.rotate(p.a);
  if (p.type === 'core') { glow(0, 0, PAL.cyan, 9, 0.5); c.fillStyle = PAL.cyan; c.beginPath(); c.moveTo(0, -3.4); c.lineTo(3, 0); c.lineTo(0, 3.4); c.lineTo(-3, 0); c.closePath(); c.fill(); }
  else if (p.type === 'parts' || p.type === 'food') { c.fillStyle = '#3a4656'; c.fillRect(-2.6, -2.6, 5.2, 5.2); c.fillStyle = g.c; c.fillRect(-2.6, -0.6, 5.2, 1.2); c.fillRect(-0.6, -2.6, 1.2, 5.2); }
  else if (g) { c.fillStyle = g.c; c.fillRect(-2.2, -1.6, 4.4, 3.2); c.fillRect(-1.4, -2.4, 2.8, 4.8); c.fillStyle = sh(g.c, 1.4); c.fillRect(-1.4, -2.4, 1.4, 1.2); }
  c.restore();
  if (p.rev > W.time) { c.strokeStyle = 'rgba(255,209,102,' + (0.5 + 0.5 * Math.sin(W.time * 7)) + ')'; c.lineWidth = 1.2 / V.k; c.strokeRect(p.x - 5, p.y - 5, 10, 10); }
}
/** a suited figure; upright along local up when standing in gravity */
function suitFig(x, y, a, col, walk, grounded, light, beam) {
  const c = V.c, r = hy(x, y), up = Math.atan2(y, x);
  c.save(); c.translate(x, y);
  if (light) {
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 110); g.addColorStop(0, 'rgba(255,240,200,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 110, a - 0.42, a + 0.42); c.closePath(); c.fill(); c.globalCompositeOperation = 'source-over';
  }
  if (grounded) {
    // stand: body axis along local up; legs swing while walking
    c.rotate(up + Math.PI / 2);
    const ph = Math.sin(walk * 9), face = Math.cos(a - (up + Math.PI / 2)) >= 0 ? 1 : -1;
    c.fillStyle = '#c9d4e0'; c.fillRect(-1.3, -2.8, 2.6, 3.2);           // torso
    c.fillStyle = '#e8eef4'; c.fillRect(-1.1, -4.4, 2.2, 1.8);           // helmet
    c.fillStyle = PAL.cyan; c.fillRect(face > 0 ? 0 : -1, -4.1, 1, 1);    // visor
    c.fillStyle = '#8b98a8'; c.fillRect(-face * 1.3 - (face > 0 ? 1 : 0), -2.6, 1, 2.6); // pack
    c.fillStyle = col; c.fillRect(-1.1 + ph * 0.6, 0.4, 0.9, 2.2); c.fillRect(0.2 - ph * 0.6, 0.4, 0.9, 2.2);
  } else {
    c.rotate(a);
    c.fillStyle = '#c9d4e0'; c.fillRect(-1.8, -1.6, 3.6, 3.2);
    c.fillStyle = '#8b98a8'; c.fillRect(-2.6, -1.2, 1, 2.4); c.fillStyle = PAL.cyan; c.fillRect(0.6, -1, 1.4, 1.6);
    c.fillStyle = col; c.fillRect(-1.2, 1.4, 1, 1.4); c.fillRect(0.4, 1.4, 1, 1.4);
  }
  c.restore();
  if (beam) {
    const f = 0.7 + Math.random() * 0.3;
    c.strokeStyle = beam.miss ? 'rgba(255,180,90,.25)' : 'rgba(255,200,120,' + 0.85 * f + ')'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(beam.x0, beam.y0); c.lineTo(beam.x1, beam.y1); c.stroke();
    if (!beam.miss) glow(beam.x1, beam.y1, PAL.amber, 5, 0.7);
  }
  void r;
}
function drawEVA() {
  if (!ev || ev.dead || ev.hide) return;
  const c = V.c, e = ev;
  suitFig(e.x, e.y, e.a, PAL.amber, e.bob, e.grounded > 0 && tele(e).g > 0.4, true, e.beam);
  c.strokeStyle = e.suit > 30 ? PAL.cyan : PAL.red; c.lineWidth = 1.2 / V.k; c.beginPath(); c.arc(e.x, e.y, 6, -Math.PI / 2, -Math.PI / 2 + TAU * (e.suit / 100)); c.stroke();
  if (e.pingT < 1) { c.strokeStyle = 'rgba(83,217,255,' + (1 - e.pingT) + ')'; c.lineWidth = 2 / V.k; c.beginPath(); c.arc(e.x, e.y, e.pingT * C.EVA.ping, 0, TAU); c.stroke(); }
  if (e.jet > 0) glow(e.x, e.y, '#a8ecff', 6, 0.4);
}
function drawMates() {
  for (const m of W.suits) { if (m.st === 'in') continue; suitFig(m.x, m.y, m.a, m.c, W.time, false, false, m.beam); }
}
function drawFx() {
  const c = V.c;
  c.globalCompositeOperation = 'lighter';
  for (const s of W.ships) {
    if (!s.beam || s.dead) continue;
    const b = s.beam, f = 0.7 + Math.random() * 0.3;
    c.strokeStyle = 'rgba(83,217,255,' + 0.35 * f + ')'; c.lineWidth = 4; c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke();
    c.strokeStyle = 'rgba(220,250,255,' + 0.9 * f + ')'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke(); glow(b.x1, b.y1, PAL.cyan, 8, 0.7);
  }
  for (const m of W.meteors) {
    const L = 0.08, sz = 1 + m.r;
    c.strokeStyle = 'rgba(255,180,90,.35)'; c.lineWidth = sz * 2.4; c.beginPath(); c.moveTo(m.x - m.vx * L, m.y - m.vy * L); c.lineTo(m.x, m.y); c.stroke();
    c.strokeStyle = 'rgba(255,240,210,.95)'; c.lineWidth = sz; c.beginPath(); c.moveTo(m.x - m.vx * L * 0.4, m.y - m.vy * L * 0.4); c.lineTo(m.x, m.y); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  for (const p of W.bits) {
    const t = p.life / p.max;
    if (p.t === 'ring') { c.globalCompositeOperation = 'lighter'; c.strokeStyle = p.c; c.globalAlpha = t * 0.8; c.lineWidth = 2.5; c.beginPath(); c.arc(p.x, p.y, p.s * (1 - t) * 6 + 2, 0, TAU); c.stroke(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
    else if (p.t === 'flash') glow(p.x, p.y, p.c, p.s * (1.4 - t), t);
    else if (p.t === 'shock') { c.strokeStyle = 'rgba(255,230,190,' + t * 0.5 + ')'; c.lineWidth = 1 + t * 3; c.beginPath(); c.arc(p.x, p.y, p.s * (1 - t) * 9 + 3, 0, TAU); c.stroke(); }
    else if (p.t === 'fire') {
      c.globalCompositeOperation = 'lighter'; const r = p.s * (0.6 + (1 - t) * 0.8);
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, 'rgba(255,240,200,' + t + ')'); g.addColorStop(0.45, 'rgba(255,140,26,' + t * 0.7 + ')'); g.addColorStop(1, 'rgba(120,30,10,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
    }
    else if (p.t === 'gas' || p.t === 'smoke') { c.globalAlpha = t * (p.t === 'smoke' ? 0.35 : 0.22); c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.s * (p.t === 'smoke' ? 2 - t : 1), 0, TAU); c.fill(); c.globalAlpha = 1; }
    else if (p.t === 'dust') { c.globalAlpha = Math.min(1, t * 1.4) * 0.8; c.fillStyle = p.c; c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); c.globalAlpha = 1; }
    else {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = t; c.fillStyle = p.c; c.strokeStyle = p.c;
      if (p.t === 'thrust') { c.beginPath(); c.arc(p.x, p.y, p.s * t, 0, TAU); c.fill(); }
      else { c.lineWidth = p.s * 0.6; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); c.stroke(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  }
  for (const d of W.deb) { c.save(); c.translate(d.x, d.y); c.rotate(d.a); c.globalAlpha = cl(d.life / 12, 0, 1); c.fillStyle = d.c; c.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); c.globalAlpha = 1; c.restore(); }
  for (const s of W.ships) if (!s.dead && s.dock && s.dock.ty === 'anchor' && hy(s.x - camX(), s.y - camY()) < 900) {
    const d = s.dock, t = cw(d.b, d.cx, d.cy);
    c.strokeStyle = PAL.amber; c.lineWidth = 1.3; c.beginPath(); c.moveTo(s.x, s.y);
    c.quadraticCurveTo((s.x + t.x) / 2 + Math.sin(W.time * 3) * 2, (s.y + t.y) / 2, t.x, t.y); c.stroke();
    c.fillStyle = PAL.amber; c.fillRect(t.x - 1.6, t.y - 1.6, 3.2, 3.2);
  }
}
/** predicted ballistic path for the player's ship (gravity + rotating frame) */
function drawTraj() {
  if (!pl || pl.dead || pl.dock || ev) return;
  const c = V.c, A = { x: 0, y: 0 };
  let x = pl.x, y = pl.y, vx = pl.vx, vy = pl.vy;
  const dt = 0.25, N = 360; let hit = null;
  c.strokeStyle = 'rgba(83,217,255,.45)'; c.lineWidth = 1.2 / V.k; c.setLineDash([4 / V.k, 5 / V.k]); c.beginPath(); c.moveTo(x, y);
  for (let i = 0; i < N; i++) {
    gacc(x, y, vx, vy, A); vx += A.x * dt; vy += A.y * dt; x += vx * dt; y += vy * dt;
    if (i % 2 === 0) c.lineTo(x, y);
    if (hy(x, y) < surfR(Math.atan2(y, x))) { hit = { x, y, t: i * dt }; break; }
  }
  c.stroke(); c.setLineDash([]);
  PC.traj = hit;
  if (hit) { c.strokeStyle = PAL.red; c.lineWidth = 1.6 / V.k; c.beginPath(); c.moveTo(hit.x - 4, hit.y - 4); c.lineTo(hit.x + 4, hit.y + 4); c.moveTo(hit.x + 4, hit.y - 4); c.lineTo(hit.x - 4, hit.y + 4); c.stroke(); }
}

// ─── lighting ────────────────────────────────────────────────────────────
function cutL(x, y, r, a) {
  const g = LX.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
  g.addColorStop(0.65, 'rgba(0,0,0,' + a * 0.55 + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); LX.fillStyle = g; LX.beginPath(); LX.arc(x, y, r, 0, TAU); LX.fill();
}
function cutC(x, y, ang, r, half, a) {
  LX.save(); LX.translate(x, y); LX.rotate(ang);
  const g = LX.createRadialGradient(0, 0, 2, 0, 0, r);
  g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(0.7, 'rgba(0,0,0,' + a * 0.6 + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
  LX.fillStyle = g; LX.beginPath(); LX.moveTo(0, 0); LX.arc(0, 0, r, -half, half); LX.closePath(); LX.fill(); LX.restore();
}
function lighting() {
  const f = focus(); if (!f) return;
  const ins = entBody(f) || (pl && pl.dock && !ev && pl.dock.ty !== 'anchor' && pl.dock.ty !== 'ground' && pl.dock.b);
  const t = tele(f), night = t.alt < 400 ? (1 - daylight(Math.atan2(f.y, f.x), W.time)) * cl(1 - t.alt / 400, 0, 1) : 0;
  const dark = Math.max(ev && !ev.hide ? (ins ? 0.5 : 0.12) : ins ? 0.45 : 0, night * 0.55); if (dark < 0.03) return;
  LX.setTransform(1, 0, 0, 1, 0, 0); LX.globalCompositeOperation = 'source-over'; LX.fillStyle = 'rgba(2,4,10,' + dark + ')'; LX.fillRect(0, 0, V.bw, V.bh);
  LX.globalCompositeOperation = 'destination-out';
  const rot = -cam.rot;
  for (const b of W.bodies) {
    if (Math.abs(b.x - camX()) > b.rad + 900 || Math.abs(b.y - camY()) > b.rad + 900) continue;
    for (const L of b.lights) {
      const c = Math.cos(b.a), s = Math.sin(b.a), p = w2s(b.x + L.lx * c - L.ly * s, b.y + L.lx * s + L.ly * c);
      cutL(p.x, p.y, L.r * V.k, Math.min(0.95, (b.roofA < 0.6 ? 0.9 : 0.4) * (L.fl ? 0.55 + 0.45 * Math.sin(W.time * 9 + L.lx) : 1)));
    }
  }
  if (pl && !pl.dead) { const p = w2s(pl.x + Math.cos(pl.a) * pl.nose, pl.y + Math.sin(pl.a) * pl.nose); cutC(p.x, p.y, pl.a + rot, 190 * V.k, 0.32, 0.8); cutL(p.x, p.y, 26 * V.k, 0.5); }
  if (ev && !ev.dead && !ev.hide) { const p = w2s(ev.x, ev.y); cutC(p.x, p.y, ev.a + rot, 135 * V.k, 0.44, 0.98); cutL(p.x, p.y, 24 * V.k, 0.7); }
  for (const s of W.ships) if (s.beam && !s.dead) { const p = w2s(s.beam.x1, s.beam.y1); cutL(p.x, p.y, 34 * V.k, 0.7); }
  for (const s of W.ships) if (!s.dead && s.thr > 0.1) { const p = w2s(s.x, s.y); cutL(p.x, p.y, 60 * V.k * s.thr, 0.6); }
  if (W.lift && W.lift.cars) for (const car of W.lift.cars) { const p = w2s(car.x, car.y); cutL(p.x, p.y, 18 * V.k, 0.6); }
  LX.globalCompositeOperation = 'source-over'; V.c.setTransform(1, 0, 0, 1, 0, 0); V.c.drawImage(LC, 0, 0);
}

// ─── canvas HUD ──────────────────────────────────────────────────────────
const hf = p => Math.max(7, Math.round(p * V.rs)) + 'px "Roboto Mono",Consolas,monospace';
function arrow(x, y, col, label) {
  const c = V.c, p = w2s(x, y), m = 26;
  if (p.x > m && p.x < V.bw - m && p.y > m && p.y < V.bh - m) return;
  const cx = V.bw / 2, cy = V.bh / 2, a = Math.atan2(p.y - cy, p.x - cx);
  const t = Math.min((V.bw / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (V.bh / 2 - m) / Math.abs(Math.sin(a) || 1e-6)), ex = cx + Math.cos(a) * t, ey = cy + Math.sin(a) * t;
  c.save(); c.translate(ex, ey); c.rotate(a); c.fillStyle = col; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(8, 0); c.lineTo(-5, -5); c.lineTo(-5, 5); c.closePath(); c.fill(); c.restore();
  c.globalAlpha = 1; c.font = hf(8); c.fillStyle = col; c.textAlign = 'center';
  const f = focus();
  c.fillText(label + ' ' + (f ? Math.round(hy(x - f.x, y - f.y)) : 0) + 'm', cl(ex, 44, V.bw - 44), cl(ey + 14, 14, V.bh - 6));
}
function hudCanvas() {
  const c = V.c; c.setTransform(1, 0, 0, 1, 0, 0);
  const f = focus();
  for (const ct of W.contacts) {
    if (ct.b && ct.b.hidden) continue;
    if (!ct.done && !(ct.hint > W.time)) continue;
    if (Math.abs(ct.x - camX()) > V.bw / V.k || Math.abs(ct.y - camY()) > V.bw / V.k) continue;
    const p = w2s(ct.x, ct.y);
    c.strokeStyle = ct.done ? (ct.kind === 'claim' ? PAL.helion : ct.kind === 'core' ? PAL.cyan : PAL.mag) : 'rgba(255,94,196,.3)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(p.x, p.y - 6); c.lineTo(p.x + 6, p.y); c.lineTo(p.x, p.y + 6); c.lineTo(p.x - 6, p.y); c.closePath(); c.stroke();
    if (ct.done) { c.font = hf(8); c.fillStyle = c.strokeStyle; c.textAlign = 'center'; c.fillText(ct.kind === 'core' ? 'CORE SHARD' : ct.kind === 'claim' ? 'HELION CLAIM' : ct.kind.toUpperCase(), p.x, p.y - 9); }
  }
  if (PC.scan && !ev && pl) {
    const o = scanOrg(), p = w2s(o.x, o.y), R = o.r * V.k, a = o.a - cam.rot;
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R); g.addColorStop(0, 'rgba(83,217,255,.14)'); g.addColorStop(1, 'rgba(83,217,255,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(p.x, p.y); c.arc(p.x, p.y, R, a - C.SCAN.cone, a + C.SCAN.cone); c.closePath(); c.fill(); c.globalCompositeOperation = 'source-over';
    const sw = ((W.time * 0.8) % 1) * R;
    c.strokeStyle = 'rgba(83,217,255,.35)'; c.lineWidth = 1.2; c.beginPath(); c.arc(p.x, p.y, sw, a - C.SCAN.cone, a + C.SCAN.cone); c.stroke();
    for (const s of PC.list) {
      const q = w2s(s.c.x, s.c.y); c.fillStyle = s.s > 0 ? PAL.mag : 'rgba(255,94,196,.35)';
      c.beginPath(); c.arc(q.x, q.y, 3 + s.s * 4, 0, TAU); c.fill();
      if (s.s > 0.1) { c.font = hf(9); c.textAlign = 'left'; c.fillText(s.f.toFixed(1) + 'kHz', q.x + 7, q.y + 3); }
    }
    if (PC.survey) { const b = PC.survey.b, q = w2s(b.x, b.y); c.strokeStyle = PAL.cyan; c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, b.rad * V.k + 6, -Math.PI / 2, -Math.PI / 2 + TAU * PC.survey.p); c.stroke(); }
  }
  const g = PC.assist;
  if (g && !PC.scan && !ev) {
    const p = w2s(g.w.x, g.w.y), col = g.ok ? PAL.green : PAL.amber, d = g.w.dir - cam.rot, nx = Math.cos(d), ny = Math.sin(d), L = 70 * V.k;
    c.strokeStyle = col; c.lineWidth = 1.2; c.setLineDash([5, 4]);
    for (const s of [-1, 1]) { const o = C.DOCK.l * V.k * s; c.beginPath(); c.moveTo(p.x - ny * o, p.y + nx * o); c.lineTo(p.x + nx * L - ny * o, p.y + ny * L + nx * o); c.stroke(); }
    c.setLineDash([]);
  }
  // labels
  c.textAlign = 'center';
  for (const b of W.bodies) {
    if (b.hidden) continue;
    if (Math.abs(b.x - camX()) > V.bw / V.k || Math.abs(b.y - camY()) > V.bw / V.k) continue;
    if (b.kind === 'rock' && PC.tgt !== b && V.k < 0.35) continue;
    const up = Math.atan2(b.y, b.x), p = w2s(b.x + Math.cos(up) * b.rad * 0.8, b.y + Math.sin(up) * b.rad * 0.8);
    c.font = hf(b.kind === 'rock' ? 9 : 11);
    const disc = b.cham && b.cham.some(q => q.disc);
    c.fillStyle = b.kind === 'rock' ? (b.cat ? (disc ? PAL.mag : '#c8d2dc') : 'rgba(255,179,71,.85)') : b.surf ? PAL.green : PAL.amber;
    c.fillText(b.name + (b.kind === 'rock' && !b.cat ? ' ?' : ''), p.x, p.y - 4);
    if (b.kind === 'rock' && b.cat && (PC.tgt === b || V.k > 0.8)) {
      c.font = hf(7); c.fillStyle = PAL.dim;
      const top = Object.entries(b.comp).filter(e => e[0] !== 'rock').sort((a, q) => q[1] - a[1]).slice(0, 3).map(e => e[0].toUpperCase() + ' ' + Math.round((e[1] / b.cells) * 100) + '%').join(' · ');
      c.fillText(top || 'barren', p.x, p.y + 7);
    } else if (b.kind === 'station' && b.transfer) {
      c.font = hf(8); c.fillStyle = PAL.dim; const left = b.transfer.depart - W.time;
      c.fillText(b.gone ? '' : b.leaving ? 'DEPARTING' : b.arr ? 'ARRIVING' : (b.transfer.dest === 'mars' ? '→ MARS' : '→ EARTH') + ' · departs ' + Math.max(0, Math.floor(left / 60)) + ':' + String(Math.max(0, Math.floor(left % 60))).padStart(2, '0'), p.x, p.y + 8);
    }
  }
  for (const s of W.ships) {
    if (s.dead || s.isPl || (hy(s.x - camX(), s.y - camY()) > 600 / Math.max(0.3, V.k) && PC.tgt !== s)) continue;
    const up = Math.atan2(s.y, s.x), p = w2s(s.x + Math.cos(up) * (s.rad + 5), s.y + Math.sin(up) * (s.rad + 5)); c.font = hf(8); c.fillStyle = s.own ? PAL.cyan : FC[s.fac] || PAL.dim;
    c.fillText(s.name, p.x, p.y);
  }
  if (W.nav) {
    const p = w2s(W.nav.x, W.nav.y); c.strokeStyle = PAL.mag; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p.x - 7, p.y); c.lineTo(p.x + 7, p.y); c.moveTo(p.x, p.y - 7); c.lineTo(p.x, p.y + 7); c.stroke();
    c.beginPath(); c.arc(p.x, p.y, 10 + Math.sin(W.time * 3) * 2, 0, TAU); c.stroke(); arrow(W.nav.x, W.nav.y, PAL.mag, W.nav.l || 'NAV');
  }
  if (PC.tgt && !PC.tgt.dead) arrow(PC.tgt.x, PC.tgt.y, PAL.cyan, 'TGT');
  for (const j of G.missions) { const st = W.stations.find(q => q.name === j.to); if (st) arrow(st.x, st.y, PAL.green, st.name.split(' ')[0]); }
  for (const s of G.fleet) if (!s.dead && !s.isPl) arrow(s.x, s.y, PAL.cyan, s.name);
  // flight instruments
  if (f && !(ev && !ev.hide)) flightHUD(c, f); else if (ev && !ev.hide) suitHUD(c);
  if (G.crew && G.crew.state === 'site' && G.crew.ship && ev && !ev.hide) arrow(G.crew.ship.x, G.crew.ship.y, PAL.amber, 'MULE-3');
  if (ev && !ev.hide && G.tier === 1 && G.story <= 1) { const L = SITES.lift; if (L) arrow(L.x, L.y, PAL.cyan, 'LIFT'); }
  c.textAlign = 'left';
}
function flightHUD(c, f) {
  const t = tele(f), x = V.bw / 2, y = V.bh - 64 * V.rs;
  c.font = hf(10); c.textAlign = 'center';
  const vs = t.vr, hs = t.vt;
  const items = [['ALT', t.alt > 2000 ? (t.alt / 1000).toFixed(2) + 'km' : Math.round(t.alt) + 'm'], ['V↕', (vs >= 0 ? '+' : '') + vs.toFixed(1)], ['V↔', hs.toFixed(1)], ['g', t.g.toFixed(2)], ['BAND', (t.band >= 0 ? '+' : '') + Math.round(t.band)]];
  const wv = 74 * V.rs;
  items.forEach((it, i) => {
    const px = x + (i - 2) * wv;
    c.fillStyle = 'rgba(4,7,12,.55)'; c.fillRect(px - wv / 2 + 3, y - 14 * V.rs, wv - 6, 26 * V.rs);
    c.fillStyle = PAL.dim; c.font = hf(7); c.fillText(it[0], px, y - 4 * V.rs);
    c.fillStyle = it[0] === 'V↕' && vs < -4 && t.alt < 150 ? PAL.red : PAL.text; c.font = hf(10); c.fillText(it[1], px, y + 8 * V.rs);
  });
  if (pl && !pl.dock && PC.traj && PC.traj.t < 20 && t.alt < 600) {
    const bad = hy(pl.vx, pl.vy) > C.TOUCH.v;
    c.font = hf(11); c.fillStyle = bad ? PAL.red : PAL.amber;
    c.fillText((bad ? 'IMPACT ' : 'CONTACT ') + PC.traj.t.toFixed(1) + 's' + (bad ? ' — BURN' : '') + (pl.tailLand && !pl.gear ? ' · GEAR UP!' : ''), x, y - 26 * V.rs);
  }
  if (pl && PC.sas) { c.font = hf(8); c.fillStyle = PAL.cyan; c.fillText('SAS ' + ['', 'UP', 'RETRO', 'PRO'][PC.sas], x, y + 22 * V.rs); }
  // velocity marker around the ship
  if (pl && !pl.dock && hy(pl.vx, pl.vy) > 0.5) {
    const p = w2s(pl.x, pl.y), a = Math.atan2(pl.vy, pl.vx) - cam.rot, R = (pl.rad + 10) * V.k;
    c.strokeStyle = PAL.green; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 4, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(p.x + Math.cos(a) * (R + 4), p.y + Math.sin(a) * (R + 4)); c.lineTo(p.x + Math.cos(a) * (R + 9), p.y + Math.sin(a) * (R + 9)); c.stroke();
  }
}
function suitHUD(c) {
  const x = V.bw / 2, y = V.bh - 64 * V.rs;
  let n = 0; for (const g in ev.sack) n += ev.sack[g];
  const max = Math.floor(C.EVA.sack * (G.sackUp || 1));
  c.font = hf(9); c.textAlign = 'center'; c.fillStyle = 'rgba(4,7,12,.55)'; c.fillRect(x - 120 * V.rs, y - 14 * V.rs, 240 * V.rs, 26 * V.rs);
  c.fillStyle = ev.suit < 30 ? PAL.red : PAL.text;
  c.fillText('AIR ' + Math.round(ev.suit) + '%   SACK ' + n + '/' + max + (W.flare && W.flare.on ? '   ☢ STORM' : ''), x, y + 3 * V.rs);
}

// ─── frame ───────────────────────────────────────────────────────────────
export function render(dt) {
  if (!W || !V.c) return;
  const c = V.c; c.imageSmoothingEnabled = false;
  drawSky();
  V.k = cam.z * V.rs; V.cr = Math.cos(cam.rot); V.sr = Math.sin(cam.rot);
  V.ox = V.bw / 2 + (Math.random() - 0.5) * cam.shake * V.rs; V.oy = V.bh / 2 + (Math.random() - 0.5) * cam.shake * V.rs;
  const hw = Math.hypot(V.bw, V.bh) / 2 / V.k, vis = [];
  for (const b of W.bodies) { if (b.hidden && !(b.orphan && G.story >= 9)) continue; if (Math.abs(b.x - camX()) < b.rad + hw + 60 && Math.abs(b.y - camY()) < b.rad + hw + 60) vis.push(b); }
  for (const b of vis) b.roofA = lp(b.roofA, inside(b) ? 0.13 : 1, 1 - Math.exp(-5 * dt));
  setWorld(c);
  drawMoon();
  drawLift();
  const inn = [], out = [], cls = e => (entBody(e) ? inn : out).push(e);
  for (const p of W.picks) if (!p.dead && Math.abs(p.x - camX()) < hw + 40 && Math.abs(p.y - camY()) < hw + 40) cls(p);
  for (const s of W.ships) if (!s.dead && Math.abs(s.x - camX()) < hw + 60 && Math.abs(s.y - camY()) < hw + 60) cls(s);
  if (ev && !ev.dead && !ev.hide) cls(ev);
  for (const b of vis) drawFloor(b);
  for (const e of inn) { if (e.kind === 'ship') drawShip(e); else if (e === ev) drawEVA(); else drawPick(e); }
  for (const b of vis) drawRoof(b);
  for (const e of out) { if (e.kind === 'ship') drawShip(e); else if (e === ev) drawEVA(); else drawPick(e); }
  drawMates();
  drawFx(); drawTraj(); lighting(); hudCanvas();
  if (cam.flash > 0) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(255,240,220,' + Math.min(0.6, cam.flash) + ')'; c.fillRect(0, 0, V.bw, V.bh); }
  if (W.flare && W.flare.on) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(255,60,40,' + (0.04 + 0.03 * Math.sin(W.time * 6)) + ')'; c.fillRect(0, 0, V.bw, V.bh); }
}

// ─── charts & instruments ────────────────────────────────────────────────
/** polar chart: big = whole cislunar slice (home up), mini = rotating local view */
export function chart(cv, big) {
  const x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height;
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#05080f'; x.fillRect(0, 0, W2, H2); if (!W) return;
  const f = focus() || { x: 0, y: -C.RS };
  let sc, cx0, cy0, rot = 0;
  if (big) { sc = Math.min(W2 / 10600, H2 / 5900); cx0 = 0; cy0 = -2600; }
  else { sc = 0.03; cx0 = f.x; cy0 = f.y; rot = cam.rot; }
  cv._map = { sc, cx0, cy0, rot };
  x.translate(W2 / 2, H2 / 2); x.rotate(-rot); x.scale(sc, sc); x.translate(-cx0, -cy0);
  const px = 1 / sc;
  // Moon and band
  x.fillStyle = '#2a2722'; x.beginPath(); x.arc(0, 0, C.RM, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(83,217,255,.12)'; x.lineWidth = C.BAND * 2; x.beginPath(); x.arc(0, 0, C.RS, 0, TAU); x.stroke();
  x.strokeStyle = 'rgba(83,217,255,.25)'; x.lineWidth = px; x.beginPath(); x.arc(0, 0, C.RS, 0, TAU); x.stroke();
  // night side
  const sa = sunAng(W.time); x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.arc(0, 0, C.RM, sa + Math.PI / 2, sa + Math.PI * 1.5); x.fill();
  if (W.lift && W.lift.E) { x.strokeStyle = 'rgba(160,190,210,.6)'; x.lineWidth = px; x.beginPath(); x.moveTo(W.lift.E.g.x, W.lift.E.g.y); x.lineTo(W.lift.E.t.x, W.lift.E.t.y); x.stroke(); }
  for (const a of W.rocks) {
    if (a.hidden && !(a.orphan && G.story >= 9)) continue;
    const d = a.cham.some(q => q.disc);
    x.fillStyle = a.orphan ? PAL.helion : a.cat ? (d ? '#7a3a6a' : '#55606c') : '#6b5a3f';
    x.beginPath(); x.arc(a.x, a.y, Math.max(big ? 2.2 * px : 1.5 * px, a.R * C.CS), 0, TAU); x.fill();
    if (big && (a.orphan || d)) { x.save(); x.translate(a.x, a.y); x.scale(px, px); x.fillStyle = a.orphan ? PAL.helion : PAL.mag; x.font = '9px monospace'; x.textAlign = 'center'; x.fillText(a.orphan ? 'THE ORPHAN' : a.name, 0, -8); x.restore(); }
  }
  for (const s of W.stations) {
    x.fillStyle = s.surf ? PAL.green : PAL.amber; const r = (big ? 4 : 2.5) * px; x.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    if (big) { x.save(); x.translate(s.x, s.y); x.scale(px, px); x.font = '10px monospace'; x.textAlign = 'center'; x.fillStyle = s.surf ? PAL.green : PAL.amber; x.fillText(s.name, 0, s.surf ? 16 : -8); x.restore(); }
  }
  for (const s of W.ships) { if (s.dead || s.isPl) continue; x.fillStyle = s.own ? PAL.cyan : FC[s.fac] || PAL.dim; x.fillRect(s.x - px, s.y - px, 2 * px, 2 * px); }
  for (const j of G.missions) { const st = W.stations.find(q => q.name === j.to); if (st && big) { x.strokeStyle = PAL.green; x.lineWidth = 1.5 * px; x.beginPath(); x.arc(st.x, st.y, 12 * px, 0, TAU); x.stroke(); } }
  if (W.nav) { x.strokeStyle = PAL.mag; x.lineWidth = 1.5 * px; x.beginPath(); x.arc(W.nav.x, W.nav.y, (big ? 7 : 3) * px, 0, TAU); x.stroke(); }
  x.fillStyle = PAL.cyan; x.beginPath(); x.arc(f.x, f.y, (big ? 4 : 2.6) * px, 0, TAU); x.fill();
  x.setTransform(1, 0, 0, 1, 0, 0);
}
export function spectrum() {
  const cv = $('spec'), x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height;
  x.fillStyle = '#060b12'; x.fillRect(0, 0, W2, H2);
  x.strokeStyle = 'rgba(43,58,77,.6)'; x.lineWidth = 1; x.font = '8px monospace'; x.textAlign = 'center';
  for (let f = 20; f <= 200; f += 20) { const px = ((f - 20) / 180) * W2; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H2); x.stroke(); x.fillStyle = 'rgba(125,143,163,.6)'; x.fillText(f, px, H2 - 2); }
  x.strokeStyle = 'rgba(83,217,255,.25)'; x.beginPath();
  for (let px = 0; px < W2; px++) x.lineTo(px, H2 - 10 - Math.abs(Math.sin(px * 0.7 + W.time * 9) * 2 + Math.random() * 1.5));
  x.stroke();
  for (const s of PC.list) {
    const px = ((s.f - 20) / 180) * W2, h = 6 + s.s * 38, g = x.createLinearGradient(px, H2 - 10 - h, px, H2 - 10);
    g.addColorStop(0, s.s > 0.05 ? PAL.mag : 'rgba(255,94,196,.3)'); g.addColorStop(1, 'rgba(255,94,196,0)'); x.fillStyle = g; x.fillRect(px - 3, H2 - 10 - h, 6, h);
  }
  const dx = ((PC.freq - 20) / 180) * W2;
  x.strokeStyle = PAL.cyan; x.lineWidth = 2; x.beginPath(); x.moveTo(dx, 0); x.lineTo(dx, H2 - 8); x.stroke();
}
export function scopeDraw() {
  const cv = $('scope'), x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height;
  x.fillStyle = '#060b12'; x.fillRect(0, 0, W2, H2);
  const g = PC.assist; if (!g) return;
  const cx = W2 / 2, cy = H2 * 0.68;
  x.strokeStyle = 'rgba(43,58,77,.8)'; x.lineWidth = 1;
  for (let r = 10; r < 40; r += 10) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke(); }
  x.strokeStyle = g.ok ? PAL.green : PAL.amber; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 18, cy); x.lineTo(cx + 18, cy); x.stroke();
  const sx = cx + cl(g.lat * 1.1, -34, 34), sy = cy - cl((g.d - 4) * 1.1, -30, 44);
  x.save(); x.translate(sx, sy); x.rotate(-g.ae); x.fillStyle = g.a ? PAL.green : PAL.red;
  x.beginPath(); x.moveTo(0, 7); x.lineTo(-5, -5); x.lineTo(5, -5); x.closePath(); x.fill(); x.restore();
  x.fillStyle = PAL.dim; x.font = '7px monospace'; x.textAlign = 'center'; x.fillText(g.ty === 'pad' ? 'TAIL / PAD' : 'NOSE / PORT', cx, 10);
  x.fillStyle = g.ok ? PAL.green : PAL.red; x.fillText(g.ok ? 'COMMIT' : 'HOLD', cx, H2 - 4);
}
export { ds, MOON_N };
