// ═══ renderer: world, effects, lighting, canvas HUD, charts ═════════════
import { $, TAU, cl, lp, hy, ds, sh } from '../core/util.js';
import { C, PAL, FC, GD, grav } from '../core/config.js';
import { W, G, pl, ev, cam, PC } from '../core/state.js';
import { near, ca, cw, portW } from '../world/body.js';
import { sprite, alive } from '../ships.js';
import { camX, camY } from '../player.js';
import { scanOrg } from '../scanner.js';

export const V = { cv: null, c: null, w: 0, h: 0, bw: 0, bh: 0, rs: 0.8, k: 1, ox: 0, oy: 0, frame: 0 };
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
export const w2s = (x, y) => ({ x: x * V.k + V.ox, y: y * V.k + V.oy });

function inside(b) {
  const f = ev || pl; if (!f) return false;
  if (pl && pl.dock && pl.dock.b === b && !ev) return true;
  const c = ca(b, f.x, f.y); return !!c && !b.sol[c.i] && b.flr[c.i] > 0;
}
function entBody(e) {
  if (e._bt !== undefined && W.time - e._bt < 0.7 && e._bt <= W.time) return e._b;
  e._bt = W.time; let f = null;
  for (const b of near(e.x, e.y, 8)) { const c = ca(b, e.x, e.y); if (c && !b.sol[c.i] && b.flr[c.i] > 0) { f = b; break; } }
  e._b = f; return f;
}
function glow(x, y, c, r, a) {
  const g = V.c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
  V.c.globalAlpha = a; V.c.globalCompositeOperation = 'lighter'; V.c.fillStyle = g; V.c.beginPath(); V.c.arc(x, y, r, 0, TAU); V.c.fill();
  V.c.globalCompositeOperation = 'source-over'; V.c.globalAlpha = 1;
}

// ─── backdrop ────────────────────────────────────────────────────────────
function drawBG() {
  const c = V.c, bw = V.bw, bh = V.bh, g = c.createLinearGradient(0, 0, bw * 0.4, bh);
  g.addColorStop(0, '#05080f'); g.addColorStop(0.55, '#04070c'); g.addColorStop(1, '#070b14'); c.fillStyle = g; c.fillRect(0, 0, bw, bh);
  const nw = bw * 1.7, nh = bh * 1.7;
  c.globalAlpha = 0.55; c.drawImage(W.bg.neb, bw / 2 - nw / 2 - camX() * 0.014 * V.rs, bh / 2 - nh / 2 - camY() * 0.014 * V.rs, nw, nh); c.globalAlpha = 1;
  const par = [0.07, 0.15, 0.27];
  for (let L = 0; L < 3; L++) {
    const t = W.bg.stars[L], sc = V.rs * (1 + L * 0.3), tw = 384 * sc;
    let ox = -((camX() * par[L] * cam.z * V.rs) % tw), oy = -((camY() * par[L] * cam.z * V.rs) % tw);
    if (ox > 0) ox -= tw; if (oy > 0) oy -= tw;
    for (let x = ox; x < bw; x += tw) for (let y = oy; y < bh; y += tw) c.drawImage(t, x, y, tw, tw);
  }
  // distant traffic: running lights of ships far beyond the sector
  if (W.bg.far) for (const f of W.bg.far) {
    const p = 0.05, X = (((f.x + f.vx * W.time - camX() * p) % 3000) + 3000) % 3000, Y = (((f.y + f.vy * W.time - camY() * p) % 2200) + 2200) % 2200;
    const sx = (X / 3000) * (bw + 200) - 100, sy = (Y / 2200) * (bh + 200) - 100, on = Math.sin(W.time * 2.2 + f.ph) > 0.6;
    c.fillStyle = f.c; c.globalAlpha = on ? 0.7 : 0.18; c.fillRect(sx, sy, 1.4, 1.4); c.globalAlpha = 1;
  }
  const mx = C.W * 0.5, my = C.H + 2400, p = 0.1, cx = bw / 2 + (mx - camX()) * p * cam.z * V.rs, cy = bh / 2 + (my - camY()) * p * cam.z * V.rs, mr = 4200 * p * cam.z * V.rs;
  if (cy - mr < bh + 40) {
    const h = c.createRadialGradient(cx, cy, mr * 0.92, cx, cy, mr * 1.16); h.addColorStop(0, 'rgba(120,150,180,.1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = h; c.beginPath(); c.arc(cx, cy, mr * 1.16, 0, TAU); c.fill(); c.drawImage(W.bg.moon, cx - mr, cy - mr, mr * 2, mr * 2);
  }
  c.fillStyle = '#a8ecff';
  for (const d of W.bg.dust) {
    const sx = (((d.x - camX() * d.d * cam.z * V.rs) % (bw + 40)) + (bw + 40)) % (bw + 40) - 20, sy = (((d.y - camY() * d.d * cam.z * V.rs) % (bh + 40)) + (bh + 40)) % (bh + 40) - 20;
    c.globalAlpha = 0.08 + d.d * 0.16; c.fillRect(sx, sy, 1.3, 1.3);
  }
  c.globalAlpha = 1;
}

// ─── bodies ──────────────────────────────────────────────────────────────
function drawFloor(b) {
  const c = V.c, w = b.gw * b.cs, h = b.gh * b.cs;
  c.save(); c.translate(b.x, b.y); c.rotate(b.a);
  c.drawImage(b.floorCv, -w / 2, -h / 2, w, h);
  if (b.roofA < 0.85) for (const g of b.glow) { const lx = g.x - b.x, ly = g.y - b.y; glow(lx, ly, g.c, g.r, b.roofA < 0.5 ? 0.9 : 0.3); }
  if (b.roofA < 0.9) for (const cr of b.crew) {
    const bob = Math.sin(W.time * 1.3 + cr.lx) * 0.3;
    c.fillStyle = cr.c; c.fillRect(cr.lx - 1.2, cr.ly - 1.2 + bob, 2.4, 2.4);
    c.fillStyle = '#53d9ff'; c.fillRect(cr.lx - 0.4, cr.ly - 1.6 + bob, 1, 0.8);
    if (cr.ag) { c.fillStyle = PAL.mag; c.fillRect(cr.lx - 1.6, cr.ly - 2.6, 3.2, 0.7); }
  }
  c.restore();
}
function drawRing(b) {
  const c = V.c, R = b.ring.r, a0 = b.a + b.ring.ang;
  c.save(); c.translate(b.x, b.y); c.rotate(a0);
  for (let k = 0; k < 4; k++) {
    const s = k * (Math.PI / 2) + 0.24, e = (k + 1) * (Math.PI / 2) - 0.24;
    c.strokeStyle = '#1b2431'; c.lineWidth = 14; c.beginPath(); c.arc(0, 0, R, s, e); c.stroke();
    c.strokeStyle = '#41546b'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R + 6, s, e); c.stroke();
    c.strokeStyle = '#2b3a4d'; c.beginPath(); c.arc(0, 0, R - 6, s, e); c.stroke();
    // habitat windows
    for (let t = s + 0.05; t < e; t += 0.06) {
      const on = ((t * 997 + k * 13) | 0) % 5 !== 0;
      c.fillStyle = on ? (((t * 331) | 0) % 7 === 0 ? PAL.cyan : 'rgba(255,209,102,.75)') : '#0b1018';
      c.fillRect(Math.cos(t) * R - 0.8, Math.sin(t) * R - 0.8, 1.6, 1.6);
    }
    // gap markers
    const g = (k + 1) * (Math.PI / 2), bl = Math.sin(W.time * 4 + k) > 0;
    for (const o of [-0.26, 0.26]) { c.fillStyle = bl ? PAL.green : '#1a3a22'; c.fillRect(Math.cos(g + o) * R - 1.5, Math.sin(g + o) * R - 1.5, 3, 3); }
  }
  c.restore();
  // ghost spokes
  c.strokeStyle = 'rgba(65,84,107,.35)'; c.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) { const t = a0 + k * (Math.PI / 2) + Math.PI / 4; c.beginPath(); c.moveTo(b.x + Math.cos(t) * b.rad * 0.55, b.y + Math.sin(t) * b.rad * 0.55); c.lineTo(b.x + Math.cos(t) * (R - 7), b.y + Math.sin(t) * (R - 7)); c.stroke(); }
}
function drawRoof(b) {
  const c = V.c, w = b.gw * b.cs, h = b.gh * b.cs;
  c.save(); c.translate(b.x, b.y); c.rotate(b.a);
  c.globalAlpha = b.roofA; c.drawImage(b.roofCv, -w / 2, -h / 2, w, h); c.globalAlpha = 1;
  if (b.veinOn) {
    c.fillStyle = 'rgba(255,209,102,' + (0.45 + 0.35 * Math.sin(W.time * 3)) + ')';
    for (const i of b.veins) if (b.sol[i]) c.fillRect((i % b.gw) * b.cs - w / 2, ((i / b.gw) | 0) * b.cs - h / 2, b.cs, b.cs);
  }
  if (b.dead && b.kind === 'station') { c.fillStyle = 'rgba(255,74,61,' + (0.05 + 0.04 * Math.sin(W.time * 2)) + ')'; c.fillRect(-w / 2, -h / 2, w, h); }
  c.restore();
  if (b.ring) drawRing(b);
  if (b.fog.length) {
    c.globalCompositeOperation = 'lighter';
    for (const f of b.fog) for (let k = 0; k < 3; k++) {
      const t = W.time * 0.16 + f.ph + k * 2.1, x = f.x + Math.cos(t) * f.r * 0.22, y = f.y + Math.sin(t * 0.8) * f.r * 0.16, r = f.r * (0.6 + k * 0.18);
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(168,236,255,' + (0.07 - k * 0.015) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r, r * 0.62, t * 0.3, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }
  if (b.roofA > 0.4 && !b.dead) {
    const bl = Math.sin(W.time * 4) > 0;
    for (const p of b.ports) { if (p.ring) continue; const w2 = portW(b, p); c.fillStyle = p.occ ? PAL.red : p.berth ? PAL.gold : PAL.green; c.globalAlpha = bl ? 0.95 : 0.35; c.fillRect(w2.x - 1.4, w2.y - 1.4, 2.8, 2.8); }
    for (const p of b.pads) { const w2 = portW(b, p); c.fillStyle = p.occ ? PAL.red : PAL.gold; c.globalAlpha = bl ? 0.9 : 0.4; c.fillRect(w2.x - 1.4, w2.y - 1.4, 2.8, 2.8); }
    c.globalAlpha = 1;
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
    const fl = 16 * s.thr + 6 + Math.random() * 3, g = c.createRadialGradient(-w / 2 - 4, 0, 0, -w / 2 - 4, 0, fl);
    g.addColorStop(0, 'rgba(255,220,150,.9)'); g.addColorStop(0.4, 'rgba(255,140,26,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(-w / 2 - 4, 0, fl, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,240,210,.8)'; c.beginPath(); c.moveTo(-w / 2, -1.6); c.lineTo(-w / 2 - 6 - s.thr * 14 * (0.8 + Math.random() * 0.4), 0); c.lineTo(-w / 2, 1.6); c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  c.drawImage(s.spr, -w / 2, -h / 2, w, h);
  if (s.gear) { c.strokeStyle = PAL.green; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-3, h / 2); c.lineTo(-5, h / 2 + 3.5); c.moveTo(3, h / 2); c.lineTo(5, h / 2 + 3.5); c.stroke(); }
  if (s.hitT > 0) { c.fillStyle = 'rgba(255,240,210,' + Math.min(0.5, s.hitT) + ')'; c.fillRect(-w / 2, -h / 2, w, h); }
  const nv = Math.sin(W.time * 5 + s.x * 0.01) > 0;
  c.fillStyle = nv ? PAL.red : '#3a1a18'; c.fillRect(-w / 2, -h / 2, 1.4, 1.4);
  c.fillStyle = nv ? PAL.green : '#1a3a22'; c.fillRect(-w / 2, h / 2 - 1.4, 1.4, 1.4);
  c.restore();
  if (s.ag && s.ag.distress) { const t = (W.time * 1.2) % 1; c.strokeStyle = 'rgba(83,217,255,' + (1 - t) + ')'; c.lineWidth = 1.4 / V.k; c.beginPath(); c.arc(s.x, s.y, s.rad + t * 40, 0, TAU); c.stroke(); }
  if (s.derelict) { c.fillStyle = 'rgba(201,111,47,' + (0.4 + 0.3 * Math.sin(W.time * 3)) + ')'; c.fillRect(s.x - 1, s.y - s.rad - 4, 2, 2); }
}
function drawPick(p) {
  const c = V.c, g = GD[p.type];
  c.save(); c.translate(p.x, p.y); c.rotate(p.a);
  if (p.type === 'pod') { c.fillStyle = '#2b3a4d'; c.fillRect(-3, -2.2, 6, 4.4); c.fillStyle = Math.sin(W.time * 6) > 0 ? PAL.cyan : '#1f4a5a'; c.fillRect(-1.4, -1.2, 2.8, 2.4); }
  else if (p.type === 'art') { glow(0, 0, PAL.cyan, 9, 0.5); c.fillStyle = PAL.cyan; c.beginPath(); c.moveTo(0, -3.4); c.lineTo(3, 0); c.lineTo(0, 3.4); c.lineTo(-3, 0); c.closePath(); c.fill(); }
  else if (p.type === 'parts' || p.type === 'stims' || p.type === 'food') { c.fillStyle = '#3a4656'; c.fillRect(-2.6, -2.6, 5.2, 5.2); c.fillStyle = g.c; c.fillRect(-2.6, -0.6, 5.2, 1.2); c.fillRect(-0.6, -2.6, 1.2, 5.2); }
  else if (g) { c.fillStyle = g.c; c.fillRect(-2.2, -1.6, 4.4, 3.2); c.fillRect(-1.4, -2.4, 2.8, 4.8); c.fillStyle = sh(g.c, 1.4); c.fillRect(-1.4, -2.4, 1.4, 1.2); }
  c.restore();
  if (p.rev > W.time) { c.strokeStyle = 'rgba(255,209,102,' + (0.5 + 0.5 * Math.sin(W.time * 7)) + ')'; c.lineWidth = 1.2 / V.k; c.strokeRect(p.x - 5, p.y - 5, 10, 10); }
}
function drawEVA() {
  if (!ev || ev.dead) return;
  const c = V.c, e = ev;
  c.save(); c.translate(e.x, e.y);
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 120); g.addColorStop(0, 'rgba(255,240,200,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 120, e.a - 0.42, e.a + 0.42); c.closePath(); c.fill(); c.globalCompositeOperation = 'source-over';
  const bob = Math.sin(e.bob * 6) * 0.4;
  c.rotate(e.a); c.fillStyle = '#c9d4e0'; c.fillRect(-1.8, -1.6 + bob, 3.6, 3.2);
  c.fillStyle = '#8b98a8'; c.fillRect(-2.6, -1.2 + bob, 1, 2.4); c.fillStyle = PAL.cyan; c.fillRect(0.6, -1 + bob, 1.4, 1.6);
  c.fillStyle = PAL.amber; c.fillRect(-1.2, 1.4 + bob, 1, 1.4); c.fillRect(0.4, 1.4 + bob, 1, 1.4); c.restore();
  c.strokeStyle = e.suit > 30 ? PAL.cyan : PAL.red; c.lineWidth = 1.4 / V.k; c.beginPath(); c.arc(e.x, e.y, 5.5, -Math.PI / 2, -Math.PI / 2 + TAU * (e.suit / 100)); c.stroke();
  if (e.carry && GD[e.carry.type]) { c.fillStyle = GD[e.carry.type].c; c.fillRect(e.x + Math.cos(e.a) * 4 - 2, e.y + Math.sin(e.a) * 4 - 2, 4, 4); }
  else if (e.carry) { c.fillStyle = PAL.cyan; c.fillRect(e.x + Math.cos(e.a) * 4 - 2, e.y + Math.sin(e.a) * 4 - 2, 4, 4); }
  if (e.pingT < 1) { c.strokeStyle = 'rgba(83,217,255,' + (1 - e.pingT) + ')'; c.lineWidth = 2 / V.k; c.beginPath(); c.arc(e.x, e.y, e.pingT * C.EVA.ping, 0, TAU); c.stroke(); }
  // tether
  if (pl && !pl.dead) { c.strokeStyle = 'rgba(216,226,236,.22)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(pl.x, pl.y); c.quadraticCurveTo((pl.x + e.x) / 2, (pl.y + e.y) / 2 + 6, e.x, e.y); c.stroke(); }
}
function drawFx() {
  const c = V.c;
  // freshly cut rock glows and cools
  c.globalCompositeOperation = 'lighter';
  for (const h of W.heat) {
    const age = W.time - h.t; if (age > 2.6 || age < 0) continue;
    if (Math.abs(h.x - camX()) > V.bw / V.k || Math.abs(h.y - camY()) > V.bh / V.k) continue;
    const w = cw(h.b, h.cx, h.cy), k = 1 - age / 2.6;
    c.fillStyle = 'rgba(255,' + (120 + k * 100 | 0) + ',40,' + k * 0.55 + ')'; c.fillRect(w.x - h.b.cs / 2, w.y - h.b.cs / 2, h.b.cs, h.b.cs);
  }
  for (const s of W.ships) {
    if (!s.beam || s.dead) continue;
    const b = s.beam, f = 0.7 + Math.random() * 0.3;
    c.strokeStyle = 'rgba(83,217,255,' + 0.35 * f + ')'; c.lineWidth = 4; c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke();
    c.strokeStyle = 'rgba(220,250,255,' + 0.9 * f + ')'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke(); glow(b.x1, b.y1, PAL.cyan, 8, 0.7);
  }
  for (const b of W.bullets) { c.strokeStyle = b.fac === 'kings' ? '#ff6a5a' : '#ffd9a0'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(b.px, b.py); c.lineTo(b.x, b.y); c.stroke(); }
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
    else {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = t; c.fillStyle = p.c; c.strokeStyle = p.c;
      if (p.t === 'thrust') { c.beginPath(); c.arc(p.x, p.y, p.s * t, 0, TAU); c.fill(); }
      else { c.lineWidth = p.s * 0.6; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); c.stroke(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  }
  for (const d of W.deb) { c.save(); c.translate(d.x, d.y); c.rotate(d.a); c.globalAlpha = cl(d.life / 12, 0, 1); c.fillStyle = d.c; c.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); c.globalAlpha = 1; c.restore(); }
  if (pl && pl.dock && pl.dock.ty === 'anchor') {
    const d = pl.dock, t = d.cx >= 0 ? cw(d.b, d.cx, d.cy) : { x: d.b.x, y: d.b.y };
    c.strokeStyle = PAL.amber; c.lineWidth = 1.3; c.beginPath(); c.moveTo(pl.x, pl.y);
    c.quadraticCurveTo((pl.x + t.x) / 2 + Math.sin(W.time * 3) * 2, (pl.y + t.y) / 2, t.x, t.y); c.stroke();
    c.fillStyle = PAL.amber; c.fillRect(t.x - 1.6, t.y - 1.6, 3.2, 3.2);
    if (PC.breach && !PC.breach.done) { c.strokeStyle = PAL.cyan; c.lineWidth = 2; c.beginPath(); c.arc(t.x, t.y, 8, -Math.PI / 2, -Math.PI / 2 + TAU * PC.breach.p); c.stroke(); }
  }
  // SOS umbilical while transferring
  for (const b of W.beacons) if (b.kind === 'sos' && b.prog > 0 && b.ship && pl) {
    c.strokeStyle = 'rgba(83,217,255,' + (0.4 + 0.4 * Math.sin(W.time * 10)) + ')'; c.lineWidth = 1; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(pl.x, pl.y); c.lineTo(b.ship.x, b.ship.y); c.stroke(); c.setLineDash([]);
  }
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
  const f = ev || pl; if (!f) return;
  const ins = entBody(f) || (pl && pl.dock && !ev && pl.dock.b);
  const dark = ev ? (ins ? 0.88 : 0.42) : ins ? 0.8 : 0; if (dark < 0.03) return;
  LX.setTransform(1, 0, 0, 1, 0, 0); LX.globalCompositeOperation = 'source-over'; LX.fillStyle = 'rgba(2,4,10,' + dark + ')'; LX.fillRect(0, 0, V.bw, V.bh);
  LX.globalCompositeOperation = 'destination-out';
  for (const b of W.bodies) {
    if (Math.abs(b.x - camX()) > b.rad + 900 || Math.abs(b.y - camY()) > b.rad + 700) continue;
    for (const L of b.lights) {
      const c = Math.cos(b.a), s = Math.sin(b.a), p = w2s(b.x + L.lx * c - L.ly * s, b.y + L.lx * s + L.ly * c);
      cutL(p.x, p.y, L.r * V.k, Math.min(0.95, (b.roofA < 0.6 ? 0.9 : 0.35) * (L.fl ? 0.55 + 0.45 * Math.sin(W.time * 9 + L.lx) : 1)));
    }
    let n = 0;
    for (const g of b.glow) { if (n++ > 40) break; const p = w2s(g.x, g.y); if (p.x < -40 || p.y < -40 || p.x > V.bw + 40 || p.y > V.bh + 40) continue; cutL(p.x, p.y, g.r * V.k * 1.4, b.roofA < 0.6 ? 0.5 : 0.18); }
  }
  if (pl && !pl.dead) { const p = w2s(pl.x + Math.cos(pl.a) * pl.nose, pl.y + Math.sin(pl.a) * pl.nose); cutC(p.x, p.y, pl.a, 170 * V.k, 0.3, 0.75); cutL(p.x, p.y, 26 * V.k, 0.5); }
  if (ev && !ev.dead) { const p = w2s(ev.x, ev.y); cutC(p.x, p.y, ev.a, 135 * V.k, 0.44, 0.98); cutL(p.x, p.y, 24 * V.k, 0.7); }
  for (const s of W.ships) if (s.beam && !s.dead) { const p = w2s(s.beam.x1, s.beam.y1); cutL(p.x, p.y, 34 * V.k, 0.7); }
  for (const h of W.heat) { const age = W.time - h.t; if (age < 1.5 && age >= 0) { const p = w2s(h.x, h.y); cutL(p.x, p.y, 10 * V.k, 0.5 * (1 - age / 1.5)); } }
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
  const f = ev || pl;
  c.fillText(label + ' ' + (f ? Math.round(hy(x - f.x, y - f.y)) : 0) + 'm', cl(ex, 44, V.bw - 44), cl(ey + 14, 14, V.bh - 6));
}
const BC = { raid: PAL.red, sos: PAL.cyan, meteor: PAL.gold, wreck: PAL.rust };
function hudCanvas() {
  const c = V.c; c.setTransform(1, 0, 0, 1, 0, 0);
  for (const ct of W.contacts) {
    if (ct.kind === 'beacon' || (!ct.done && !(ct.hint > W.time))) continue;
    if (Math.abs(ct.x - camX()) > V.bw / V.k || Math.abs(ct.y - camY()) > V.bh / V.k) continue;
    const p = w2s(ct.x, ct.y);
    c.strokeStyle = ct.done ? PAL.mag : 'rgba(255,94,196,.3)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(p.x, p.y - 6); c.lineTo(p.x + 6, p.y); c.lineTo(p.x, p.y + 6); c.lineTo(p.x - 6, p.y); c.closePath(); c.stroke();
    if (ct.done) { c.font = hf(8); c.fillStyle = PAL.mag; c.textAlign = 'center'; c.fillText(ct.kind.toUpperCase(), p.x, p.y - 9); }
  }
  if (PC.scan && !ev) {
    const o = scanOrg(), p = w2s(o.x, o.y), R = o.r * V.k;
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R); g.addColorStop(0, 'rgba(83,217,255,.14)'); g.addColorStop(1, 'rgba(83,217,255,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(p.x, p.y); c.arc(p.x, p.y, R, o.a - C.SCAN.cone, o.a + C.SCAN.cone); c.closePath(); c.fill(); c.globalCompositeOperation = 'source-over';
    // sweeping wavefront
    const sw = ((W.time * 0.8) % 1) * R;
    c.strokeStyle = 'rgba(83,217,255,.35)'; c.lineWidth = 1.2; c.beginPath(); c.arc(p.x, p.y, sw, o.a - C.SCAN.cone, o.a + C.SCAN.cone); c.stroke();
    c.strokeStyle = 'rgba(83,217,255,.5)'; c.lineWidth = 1; c.setLineDash([4, 5]);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(o.a + s * C.SCAN.cone) * R, p.y + Math.sin(o.a + s * C.SCAN.cone) * R); c.stroke(); }
    c.beginPath(); c.arc(p.x, p.y, R, o.a - C.SCAN.cone, o.a + C.SCAN.cone); c.stroke(); c.setLineDash([]);
    for (const s of PC.list) {
      const q = w2s(s.c.x, s.c.y); c.fillStyle = s.s > 0 ? PAL.mag : 'rgba(255,94,196,.35)';
      c.beginPath(); c.arc(q.x, q.y, 3 + s.s * 4, 0, TAU); c.fill();
      if (s.s > 0.1) { c.font = hf(9); c.textAlign = 'left'; c.fillText(s.f.toFixed(1) + 'kHz', q.x + 7, q.y + 3); }
    }
  }
  const g = PC.assist;
  if (g && !PC.scan && !ev) {
    const p = w2s(g.w.x, g.w.y), col = g.ok ? PAL.green : PAL.amber, nx = Math.cos(g.w.dir), ny = Math.sin(g.w.dir), L = 90 * V.k;
    c.strokeStyle = col; c.lineWidth = 1.2; c.setLineDash([5, 4]);
    for (const s of [-1, 1]) { const o = C.DOCK.l * V.k * s; c.beginPath(); c.moveTo(p.x - ny * o, p.y + nx * o); c.lineTo(p.x + nx * L - ny * o, p.y + ny * L + nx * o); c.stroke(); }
    c.setLineDash([]); c.beginPath(); c.moveTo(p.x - nx * 8, p.y - ny * 8); c.lineTo(p.x + nx * 8, p.y + ny * 8); c.stroke();
    c.beginPath(); c.moveTo(p.x - ny * 7, p.y + nx * 7); c.lineTo(p.x + ny * 7, p.y - nx * 7); c.stroke();
    c.fillStyle = col; c.font = hf(9); c.textAlign = 'center'; c.fillText(g.ty === 'pad' ? 'PAD' : 'PORT', p.x, p.y - 12);
    if (g.b.ring) { const q = w2s(g.b.x, g.b.y); c.strokeStyle = 'rgba(255,179,71,.25)'; c.beginPath(); c.arc(q.x, q.y, g.b.ring.r * V.k, 0, TAU); c.stroke(); }
  }
  const t = PC.tgt;
  if (t && !(t.dead === true)) {
    const p = w2s(t.x, t.y), r = Math.max(14, (t.rad || 10) * V.k), col = t.kind === 'ship' ? FC[t.fac] || PAL.cyan : t.kind === 'rock' ? PAL.dim : PAL.amber, k = Math.min(10, r * 0.4);
    c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath();
    c.moveTo(p.x - r, p.y - r + k); c.lineTo(p.x - r, p.y - r); c.lineTo(p.x - r + k, p.y - r); c.moveTo(p.x + r - k, p.y - r); c.lineTo(p.x + r, p.y - r); c.lineTo(p.x + r, p.y - r + k);
    c.moveTo(p.x + r, p.y + r - k); c.lineTo(p.x + r, p.y + r); c.lineTo(p.x + r - k, p.y + r); c.moveTo(p.x - r + k, p.y + r); c.lineTo(p.x - r, p.y + r); c.lineTo(p.x - r, p.y + r - k); c.stroke();
    c.font = hf(10); c.fillStyle = col; c.textAlign = 'left'; c.fillText((t.name || '').toUpperCase(), p.x + r + 6, p.y - r + 8);
    // lead pip for hostile ships
    if (t.kind === 'ship' && pl && !ev && t.fac === 'kings') {
      const d = ds(t, pl), tt = d / C.GUN.spd, lp2 = w2s(t.x + (t.vx - pl.vx) * tt, t.y + (t.vy - pl.vy) * tt);
      c.strokeStyle = PAL.red; c.lineWidth = 1; c.beginPath(); c.arc(lp2.x, lp2.y, 4, 0, TAU); c.stroke();
    }
  }
  if (pl && !pl.dead && !ev) {
    const p = w2s(pl.x, pl.y), v = hy(pl.vx, pl.vy);
    if (v > 0.4) {
      const L = Math.min(90, v * 1.6) * V.rs, a = Math.atan2(pl.vy, pl.vx);
      c.strokeStyle = 'rgba(109,240,143,.7)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(a) * L, p.y + Math.sin(a) * L); c.stroke();
      c.fillStyle = PAL.green; c.font = hf(8); c.textAlign = 'left'; c.fillText(v.toFixed(1) + ' m/s', p.x + Math.cos(a) * L + 4, p.y + Math.sin(a) * L);
    }
    c.fillStyle = 'rgba(125,143,163,.6)'; c.font = hf(7); c.textAlign = 'left'; c.fillText('TYPHON ↓ ' + grav(pl.y).toFixed(1), p.x - 30 * V.rs, p.y + 46 * V.rs);
  }
  c.textAlign = 'center';
  for (const b of W.bodies) {
    const disc = b.cham.some(q => q.disc);
    if (b.kind === 'rock') { if (PC.tgt !== b && !disc) continue; } else if (ds(b, cam) > 1500 && PC.tgt !== b) continue;
    if (Math.abs(b.x - camX()) > V.bw / V.k || Math.abs(b.y - camY()) > V.bh / V.k) continue;
    const p = w2s(b.x, b.y - (b.ring ? b.ring.r + 10 : b.rad * 0.72)); c.font = hf(b.kind === 'rock' ? 9 : 11);
    c.fillStyle = b.dead ? PAL.red : b.kind === 'hulk' ? PAL.rust : disc ? PAL.mag : PAL.amber; c.fillText(b.name + (disc ? ' · ANOMALY' : ''), p.x, p.y);
    if (b.kind !== 'rock') {
      c.font = hf(8); c.fillStyle = PAL.dim;
      c.fillText(b.dead ? 'DARK' : b.kind === 'hulk' ? (b.breached ? 'BREACHED HULL' : 'SEALED HULL') : b.fac.toUpperCase() + ' · ' + b.berths + ' BERTHS', p.x, p.y + 12);
    }
  }
  for (const s of W.ships) {
    if (s.dead || s.isPl || (ds(s, cam) > 700 && PC.tgt !== s)) continue;
    const p = w2s(s.x, s.y - s.rad - 6); c.font = hf(8); c.fillStyle = FC[s.fac] || PAL.dim;
    const st = s.ag ? (s.ag.distress ? ' · SOS' : s.ag.state === 'fight' || s.ag.state === 'hunt' ? ' · ⚔' : s.ag.state === 'mine' ? ' · ⛏' : '') : s.derelict ? '' : '';
    c.fillText(s.name + st, p.x, p.y);
  }
  // event beacons
  for (const b of W.beacons) {
    const col = BC[b.kind] || PAL.text, p = w2s(b.x, b.y), pu = 0.5 + 0.5 * Math.sin(W.time * 4);
    if (p.x > -20 && p.y > -20 && p.x < V.bw + 20 && p.y < V.bh + 20) {
      c.strokeStyle = col; c.globalAlpha = 0.4 + pu * 0.5; c.lineWidth = 1.4;
      c.beginPath(); c.arc(p.x, p.y, 14 + pu * 4, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(p.x, p.y - 22); c.lineTo(p.x, p.y - 30); c.stroke(); c.globalAlpha = 1;
      c.font = hf(8); c.fillStyle = col; c.fillText(b.label, p.x, p.y - 33);
      if (b.kind === 'sos' && b.prog > 0) { c.strokeStyle = PAL.green; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 20, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, b.prog / 3)); c.stroke(); }
    }
    arrow(b.x, b.y, col, b.kind.toUpperCase());
  }
  if (W.nav) {
    const p = w2s(W.nav.x, W.nav.y); c.strokeStyle = PAL.mag; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p.x - 7, p.y); c.lineTo(p.x + 7, p.y); c.moveTo(p.x, p.y - 7); c.lineTo(p.x, p.y + 7); c.stroke();
    c.beginPath(); c.arc(p.x, p.y, 10 + Math.sin(W.time * 3) * 2, 0, TAU); c.stroke(); arrow(W.nav.x, W.nav.y, PAL.mag, 'NAV');
  }
  if (PC.tgt) arrow(PC.tgt.x, PC.tgt.y, PAL.cyan, 'TGT');
  for (const st of W.stations) if (!st.dead && ds(st, cam) > 900) arrow(st.x, st.y, PAL.amber, st.name.split(' ')[0]);
  c.textAlign = 'left';
}

// ─── frame ───────────────────────────────────────────────────────────────
export function render(dt) {
  if (!W || !V.c) return;
  const c = V.c; c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false; drawBG();
  const hw = V.bw / 2 / (cam.z * V.rs), hh = V.bh / 2 / (cam.z * V.rs), vis = [];
  for (const b of W.bodies) { const R = b.ring ? b.ring.r + 10 : b.rad; if (Math.abs(b.x - camX()) < R + hw + 60 && Math.abs(b.y - camY()) < R + hh + 60) vis.push(b); }
  for (const b of vis) b.roofA = lp(b.roofA, inside(b) ? 0.13 : 1, 1 - Math.exp(-5 * dt));
  V.k = cam.z * V.rs;
  V.ox = V.bw / 2 - camX() * V.k + (Math.random() - 0.5) * cam.shake * V.rs; V.oy = V.bh / 2 - camY() * V.k + (Math.random() - 0.5) * cam.shake * V.rs;
  c.setTransform(V.k, 0, 0, V.k, V.ox, V.oy);
  c.strokeStyle = 'rgba(43,58,77,.5)'; c.lineWidth = 2 / V.k; c.setLineDash([12 / V.k, 10 / V.k]); c.strokeRect(0, 0, C.W, C.H); c.setLineDash([]);
  const inn = [], out = [], cls = e => (entBody(e) ? inn : out).push(e);
  for (const p of W.picks) if (!p.dead && Math.abs(p.x - camX()) < hw + 40 && Math.abs(p.y - camY()) < hh + 40) cls(p);
  for (const s of W.ships) if (!s.dead && Math.abs(s.x - camX()) < hw + 60 && Math.abs(s.y - camY()) < hh + 60) cls(s);
  if (ev && !ev.dead) cls(ev);
  for (const b of vis) drawFloor(b);
  for (const e of inn) { if (e.kind === 'ship') drawShip(e); else if (e === ev) drawEVA(); else drawPick(e); }
  for (const b of vis) drawRoof(b);
  for (const e of out) { if (e.kind === 'ship') drawShip(e); else if (e === ev) drawEVA(); else drawPick(e); }
  drawFx(); lighting(); hudCanvas();
  if (cam.flash > 0) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(255,240,220,' + Math.min(0.6, cam.flash) + ')'; c.fillRect(0, 0, V.bw, V.bh); cam.flash = Math.max(0, cam.flash - dt * 2); }
}

// ─── charts & instruments ────────────────────────────────────────────────
export function chart(cv, big) {
  const x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height, sx = W2 / C.W, sy = H2 / C.H;
  x.fillStyle = '#05080f'; x.fillRect(0, 0, W2, H2); if (!W) return;
  for (const a of W.rocks) {
    const d = a.cham.some(q => q.disc); x.fillStyle = d ? '#3a2a3a' : a.veinOn ? '#3a321a' : '#232b36';
    x.beginPath(); x.arc(a.x * sx, a.y * sy, Math.max(big ? 2 : 1, a.R * C.CS * sx), 0, TAU); x.fill();
    if (big && d) { x.fillStyle = PAL.mag; x.font = '9px monospace'; x.textAlign = 'center'; x.fillText(a.name, a.x * sx, a.y * sy - a.R * C.CS * sy - 4); }
  }
  for (const h of W.hulks) {
    x.fillStyle = PAL.rust; x.fillRect(h.x * sx - 2, h.y * sy - 2, 4, 4);
    if (big) { x.fillStyle = PAL.dim; x.font = '9px monospace'; x.textAlign = 'center'; x.fillText(h.name, h.x * sx, h.y * sy - 7); }
  }
  for (const s of W.stations) {
    x.fillStyle = s.dead ? PAL.red : PAL.amber; const r = big ? 5 : 2.5; x.fillRect(s.x * sx - r, s.y * sy - r, r * 2, r * 2);
    if (big) { x.font = '11px monospace'; x.textAlign = 'center'; x.fillText(s.name, s.x * sx, s.y * sy - 10); }
  }
  for (const ct of W.contacts) if (ct.done && ct.kind !== 'beacon') { x.fillStyle = PAL.mag; x.fillRect(ct.x * sx - 1.5, ct.y * sy - 1.5, 3, 3); }
  for (const s of W.ships) { if (s.dead || s.isPl) continue; x.fillStyle = FC[s.fac] || PAL.dim; x.fillRect(s.x * sx - 1, s.y * sy - 1, 2, 2); }
  for (const b of W.beacons) {
    const pu = 0.5 + 0.5 * Math.sin(W.time * 4); x.strokeStyle = BC[b.kind] || PAL.text; x.globalAlpha = 0.5 + pu * 0.5; x.lineWidth = big ? 2 : 1;
    x.beginPath(); x.arc(b.x * sx, b.y * sy, (big ? 9 : 4) + pu * 2, 0, TAU); x.stroke(); x.globalAlpha = 1;
    if (big) { x.fillStyle = BC[b.kind] || PAL.text; x.font = '9px monospace'; x.textAlign = 'center'; x.fillText(b.label, b.x * sx, b.y * sy + 18); }
  }
  for (const j of G.missions) {
    const st = W.stations.find(q => q.name === j.to);
    if (st && big) { x.strokeStyle = PAL.green; x.lineWidth = 1.5; x.beginPath(); x.arc(st.x * sx, st.y * sy, 12, 0, TAU); x.stroke(); }
  }
  if (W.nav) { x.strokeStyle = PAL.mag; x.lineWidth = 1.5; x.beginPath(); x.arc(W.nav.x * sx, W.nav.y * sy, big ? 7 : 3, 0, TAU); x.stroke(); }
  const f = ev || pl;
  if (f) {
    x.fillStyle = PAL.cyan; x.beginPath(); x.arc(f.x * sx, f.y * sy, big ? 4 : 2.4, 0, TAU); x.fill();
    x.strokeStyle = PAL.cyan; x.lineWidth = big ? 2 : 1; x.beginPath(); x.moveTo(f.x * sx, f.y * sy);
    x.lineTo(f.x * sx + Math.cos(f.a) * (big ? 12 : 6), f.y * sy + Math.sin(f.a) * (big ? 12 : 6)); x.stroke();
  }
  if (!big) { const hw = V.bw / 2 / V.k, hh = V.bh / 2 / V.k; x.strokeStyle = 'rgba(216,226,236,.25)'; x.lineWidth = 1; x.strokeRect((camX() - hw) * sx, (camY() - hh) * sy, hw * 2 * sx, hh * 2 * sy); }
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
  x.fillStyle = PAL.cyan; x.beginPath(); x.moveTo(dx - 4, 0); x.lineTo(dx + 4, 0); x.lineTo(dx, 6); x.closePath(); x.fill();
}
export function scopeDraw() {
  const cv = $('scope'), x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height;
  x.fillStyle = '#060b12'; x.fillRect(0, 0, W2, H2);
  const g = PC.assist; if (!g) return;
  const cx = W2 / 2, cy = H2 * 0.68;
  x.strokeStyle = 'rgba(43,58,77,.8)'; x.lineWidth = 1;
  for (let r = 10; r < 40; r += 10) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke(); }
  x.strokeStyle = g.ok ? PAL.green : PAL.amber; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 18, cy); x.lineTo(cx + 18, cy); x.stroke();
  x.beginPath(); x.moveTo(cx, cy - 5); x.lineTo(cx, cy + 5); x.stroke();
  const sx = cx + cl(g.lat * 1.1, -34, 34), sy = cy - cl((g.d - 4) * 1.1, -30, 44);
  x.save(); x.translate(sx, sy); x.rotate(-g.ae); x.fillStyle = g.a ? PAL.green : PAL.red;
  x.beginPath(); x.moveTo(0, 7); x.lineTo(-5, -5); x.lineTo(5, -5); x.closePath(); x.fill(); x.restore();
  x.strokeStyle = 'rgba(83,217,255,.5)'; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(cx, cy); x.lineTo(sx, sy); x.stroke(); x.setLineDash([]);
  x.fillStyle = PAL.dim; x.font = '7px monospace'; x.textAlign = 'center'; x.fillText(g.ty === 'pad' ? 'BELLY / PAD' : 'NOSE / PORT', cx, 10);
  x.fillStyle = g.ok ? PAL.green : PAL.red; x.fillText(g.ok ? 'COMMIT' : 'HOLD', cx, H2 - 4);
}
