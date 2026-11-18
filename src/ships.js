// ═══ modular ships: layouts, stats, sprites, docking ════════════════════
import { hy, ad } from './core/util.js';
import { C, MD, GD, FC } from './core/config.js';
import { W } from './core/state.js';
import { sh } from './core/util.js';
import { portW, bvel } from './world/body.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const M = (t, x, y) => [t, x, y];
const spine = (from, to, y) => { const a = []; for (let x = from; x >= to; x--) a.push(M('hull', x, y)); return a; };

export const LAY = {
  player: { w: 11, h: 7, m: [M('clamp', 10, 3), M('cock', 9, 3), ...spine(8, 1, 3), M('cargo', 4, 2), M('cargo', 5, 2), M('cargo', 4, 4), M('cargo', 5, 4),
    M('fuel', 2, 2), M('fuel', 2, 4), M('eng', 0, 3), M('rcs', 1, 0), M('rcs', 1, 6), M('rcs', 9, 0), M('rcs', 9, 6), M('gun', 7, 1), M('mine', 6, 5), M('scan', 5, 0), M('gear', 5, 6), M('hab', 6, 2)] },
  trader: { w: 13, h: 7, m: [M('clamp', 12, 3), M('cock', 11, 3), M('hab', 10, 3), ...spine(9, 1, 3), M('cargo', 5, 2), M('cargo', 6, 2), M('cargo', 7, 2), M('cargo', 5, 4), M('cargo', 6, 4), M('cargo', 7, 4),
    M('fuel', 3, 2), M('fuel', 3, 4), M('eng', 0, 3), M('gun', 9, 1), M('rcs', 1, 0), M('rcs', 1, 6), M('rcs', 11, 0), M('rcs', 11, 6), M('gear', 6, 6)] },
  miner: { w: 11, h: 7, m: [M('clamp', 10, 3), M('cock', 9, 3), ...spine(8, 1, 3), M('cargo', 4, 2), M('cargo', 5, 2), M('cargo', 4, 4), M('fuel', 2, 2), M('eng', 0, 3),
    M('mine', 7, 5), M('scan', 6, 0), M('rcs', 1, 0), M('rcs', 1, 6), M('rcs', 9, 0), M('rcs', 9, 6), M('gear', 5, 6)] },
  pirate: { w: 10, h: 6, m: [M('cock', 8, 2), ...spine(7, 2, 2), M('hull', 6, 3), M('hull', 5, 3), M('eng', 0, 2), M('eng', 0, 3), M('fuel', 2, 3), M('cargo', 4, 3),
    M('gun', 8, 1), M('gun', 8, 4), M('gun', 5, 0), M('rcs', 1, 0), M('rcs', 1, 5), M('rcs', 8, 0), M('rcs', 8, 5)] },
  security: { w: 12, h: 7, m: [M('clamp', 11, 3), M('cock', 10, 3), M('hab', 9, 3), ...spine(8, 1, 3), M('hull', 6, 2), M('hull', 7, 2), M('fuel', 3, 2), M('fuel', 3, 4), M('eng', 0, 3),
    M('gun', 9, 1), M('gun', 9, 5), M('gun', 6, 0), M('cargo', 5, 4), M('rcs', 1, 0), M('rcs', 1, 6), M('rcs', 10, 0), M('rcs', 10, 6)] },
  scav: { w: 10, h: 6, m: [M('clamp', 9, 2), M('cock', 8, 2), ...spine(7, 2, 2), M('cargo', 4, 3), M('cargo', 5, 3), M('fuel', 2, 3), M('eng', 0, 2), M('mine', 7, 4), M('gun', 6, 0),
    M('rcs', 1, 0), M('rcs', 1, 5), M('rcs', 8, 0), M('rcs', 8, 5)] },
};

export const alive = (s, t) => s.mods.filter(m => !m.dead && (!t || m.t === t));
export const cmass = s => { let m = 0; for (const g in s.cargo) m += s.cargo[g] * GD[g].m; return m; };
export function cadd(s, t, q) {
  const take = Math.min(q, Math.floor((s.cargoMax - cmass(s)) / GD[t].m));
  if (take > 0) { s.cargo[t] = (s.cargo[t] || 0) + take; stats(s); }
  return Math.max(0, take);
}
export const integ = s => { let h = 0, m = 0; for (const q of s.mods) { h += Math.max(0, q.hp); m += q.max; } return h / m; };

/** module world position */
export function mw(s, m) {
  const lx = (m.gx + 0.5) * C.SS - (s.gw * C.SS) / 2, ly = (m.gy + 0.5) * C.SS - (s.gh * C.SS) / 2, c = Math.cos(s.a), n = Math.sin(s.a);
  return { x: s.x + lx * c - ly * n, y: s.y + lx * n + ly * c };
}

export function stats(s) {
  const u = s.upg || {}, n = t => alive(s, t).length;
  s.mass = 12 + s.mods.length * 0.12 + cmass(s) * 0.3;
  s.thrust = (430 * (1 + (u.eng || 0) * 0.28)) / s.mass;
  s.rcsA = 19 * (n('rcs') / 4); s.tq = 3 * (n('rcs') / 4);
  s.cargoMax = 10 + 9 * n('cargo') + (u.cargo || 0) * 12;
  s.fuelMax = 40 + 30 * n('fuel') + (u.fuel || 0) * 30;
  s.nose = (s.gw * C.SS) / 2; s.belly = (s.gh * C.SS) / 2; s.rad = ((hy(s.gw, s.gh) * C.SS) / 2) * 0.82;
  s.lasR = C.MINE.rng + (u.laser || 0) * 30; s.lasD = C.MINE.dps + (u.laser || 0) * 14;
  s.scanR = C.SCAN.rng + (u.scan || 0) * 140; s.gunD = C.GUN.dmg + (u.gun || 0) * 4;
}

export function sprite(s) {
  const S = 4, cv = s.spr || (s.spr = document.createElement('canvas'));
  cv.width = s.gw * S; cv.height = s.gh * S;
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height);
  for (const m of s.mods) {
    const px = m.gx * S, py = m.gy * S;
    if (m.dead) { x.fillStyle = '#141a22'; x.fillRect(px, py, S, S); continue; }
    const d = 1 - m.hp / m.max, c = MD[m.t].c;
    x.fillStyle = sh(c, 1 - d * 0.5); x.fillRect(px, py, S, S);
    x.fillStyle = sh(c, 1.25 - d * 0.5); x.fillRect(px, py, S, 1);
    x.fillStyle = sh(c, 0.6); x.fillRect(px, py + S - 1, S, 1);
    const t = m.t;
    if (t === 'cock') { x.fillStyle = '#53d9ff'; x.fillRect(px + 1, py + 1, 2, 2); }
    else if (t === 'eng') { x.fillStyle = '#ff8c1a'; x.fillRect(px, py + 1, 1, 2); }
    else if (t === 'gun') { x.fillStyle = '#d8e2ec'; x.fillRect(px + S - 1, py + 1, 1, 2); }
    else if (t === 'mine') { x.fillStyle = '#53d9ff'; x.fillRect(px + S - 1, py + 1, 1, 2); }
    else if (t === 'cargo') { x.fillStyle = '#8a6a2f'; x.fillRect(px + 1, py + 1, 2, 2); }
    else if (t === 'fuel') { x.fillStyle = '#ffb347'; x.fillRect(px + 1, py + 1, 2, 1); }
    else if (t === 'clamp') { x.fillStyle = '#ffd166'; x.fillRect(px + S - 1, py, 1, 1); x.fillRect(px + S - 1, py + 3, 1, 1); }
    else if (t === 'gear') { x.fillStyle = '#6df08f'; x.fillRect(px + 1, py + S - 1, 2, 1); }
    else if (t === 'scan') { x.fillStyle = '#53d9ff'; x.fillRect(px + 1, py, 2, 1); }
    else if (t === 'hab') { x.fillStyle = '#8cff9e'; x.fillRect(px + 1, py + 1, 1, 1); }
    if (m.flash > 0) { x.fillStyle = 'rgba(255,240,210,.85)'; x.fillRect(px, py, S, S); }
  }
  x.fillStyle = FC[s.fac] || '#8b98a8'; x.fillRect(s.gw * S - 2, 0, 2, 1); x.fillRect(0, s.gh * S - 1, 2, 1);
  s.dirty = false;
}

export function mkShip(role, fac, name, x, y) {
  const L = LAY[role] || LAY.trader;
  const s = {
    kind: 'ship', role, fac, name, x, y, vx: 0, vy: 0, a: 0, va: 0, gw: L.w, gh: L.h, mods: [], grid: new Int16Array(L.w * L.h), fuel: 0,
    cargo: {}, credits: 0, upg: {}, dock: null, gear: false, dead: false, isPl: false, thr: 0, rcx: 0, rcy: 0, tqi: 0, wantF: false, wantM: false,
    gcd: 0, beam: null, spr: null, dirty: true, ag: null, hitT: 0,
  };
  L.m.forEach(([t, gx, gy], i) => { s.mods.push({ t, gx, gy, hp: MD[t].hp, max: MD[t].hp, dead: false, flash: 0 }); s.grid[gy * L.w + gx] = i + 1; });
  stats(s); s.fuel = s.fuelMax; sprite(s); W.ships.push(s);
  return s;
}
export function mkPlayer(x, y) {
  const s = mkShip('player', 'free', 'KITE', x, y);
  s.isPl = true; s.credits = 900; s.upg = { eng: 0, cargo: 0, laser: 0, gun: 0, armor: 0, fuel: 0, scan: 0 };
  stats(s); s.fuel = s.fuelMax;
  return s;
}

export function dock(s, b, p, ty, silent) {
  p.occ = s; s.dock = { ty: ty || 'port', b, p }; s.thr = s.rcx = s.rcy = s.tqi = 0; attach(s);
  if (s.isPl && !silent) { AU.chime(); hooks.onDock(b, ty); }
}
export function anchor(s, b, cx, cy) {
  const c = Math.cos(-b.a), n = Math.sin(-b.a), dx = s.x - b.x, dy = s.y - b.y;
  s.dock = { ty: 'anchor', b, cx, cy, lx: dx * c - dy * n, ly: dx * n + dy * c, ao: ad(s.a, b.a) };
  s.thr = s.rcx = s.rcy = s.tqi = 0;
  if (s.isPl) { AU.thunk(); hooks.toast('HARPOON SET · locked to ' + b.name, 'good'); }
}
export function undock(s) {
  if (!s.dock) return;
  const d = s.dock;
  if (d.ty !== 'anchor') d.p.occ = null;
  const pw = d.ty === 'anchor' ? { dir: s.a + Math.PI, vx: d.b.vx || 0, vy: d.b.vy || 0 } : portW(d.b, d.p);
  s.dock = null;
  s.vx = pw.vx + Math.cos(pw.dir) * 3; s.vy = pw.vy + Math.sin(pw.dir) * 3; s.va = 0;
  if (s.isPl) { AU.puff(); hooks.closeStation(); }
}
/** keep a docked / anchored ship glued to its host */
export function attach(s) {
  const d = s.dock; if (!d) return;
  const b = d.b;
  if (d.ty === 'anchor') {
    if (b.dead || (b.sol && !b.sol[d.cy * b.gw + d.cx])) { s.dock = null; if (s.isPl) hooks.toast('ANCHOR SHEARED — the rock gave way', 'warn'); return; }
    const c = Math.cos(b.a), n = Math.sin(b.a);
    s.x = b.x + d.lx * c - d.ly * n; s.y = b.y + d.lx * n + d.ly * c; s.a = b.a + d.ao;
    const v = bvel(b, s.x, s.y); s.vx = v.x; s.vy = v.y; s.va = b.va || 0;
    return;
  }
  const w = portW(b, d.p);
  if (d.ty === 'pad') { s.a = w.dir + Math.PI / 2; s.x = w.x + Math.cos(w.dir) * (s.belly + 1.2); s.y = w.y + Math.sin(w.dir) * (s.belly + 1.2); }
  else { s.a = w.dir + Math.PI; s.x = w.x + Math.cos(w.dir) * (s.nose + 1.5); s.y = w.y + Math.sin(w.dir) * (s.nose + 1.5); }
  s.vx = w.vx; s.vy = w.vy; s.va = w.va;
}
