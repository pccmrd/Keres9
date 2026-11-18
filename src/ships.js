// ═══ modular ships: layouts, stats, sprites, docking ════════════════════
import { hy, ad, sh } from './core/util.js';
import { C, MD, GD, FC, CLS } from './core/config.js';
import { W } from './core/state.js';
import { portW, bvel } from './world/body.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const M = (t, x, y) => [t, x, y];
const spine = (from, to, y) => { const a = []; for (let x = from; x >= to; x--) a.push(M('hull', x, y)); return a; };

export const LAY = {
  wren: { w: 10, h: 7, m: [M('clamp', 9, 3), M('cock', 8, 3), ...spine(7, 1, 3), M('cargo', 3, 2), M('cargo', 4, 2), M('cargo', 5, 2), M('cargo', 3, 4), M('cargo', 4, 4),
    M('fuel', 2, 2), M('fuel', 2, 4), M('eng', 0, 3), M('rcs', 1, 1), M('rcs', 1, 5), M('rcs', 8, 1), M('rcs', 8, 5), M('mine', 7, 5), M('scan', 6, 1), M('hab', 6, 2)] },
  hare: { w: 11, h: 7, tail: true, m: [M('clamp', 10, 3), M('cock', 9, 3), M('hab', 8, 3), ...spine(7, 1, 3), M('cargo', 4, 2), M('cargo', 5, 2), M('cargo', 6, 2), M('cargo', 4, 4), M('cargo', 5, 4), M('cargo', 6, 4),
    M('fuel', 2, 2), M('fuel', 3, 2), M('fuel', 2, 4), M('fuel', 3, 4), M('eng', 0, 2), M('eng', 0, 3), M('eng', 0, 4), M('gear', 0, 0), M('gear', 0, 6), M('rcs', 8, 2), M('rcs', 8, 4), M('rcs', 2, 1), M('rcs', 2, 5),
    M('mine', 7, 4), M('scan', 7, 2), M('hull', 1, 1), M('hull', 1, 5)] },
  mule: { w: 14, h: 8, m: [M('clamp', 13, 3), M('clamp', 13, 4), M('cock', 12, 3), M('cock', 12, 4), ...spine(11, 1, 3), ...spine(11, 1, 4), M('hab', 8, 2), M('hab', 9, 2), M('hab', 10, 2), M('hab', 8, 5), M('hab', 9, 5), M('hab', 10, 5),
    M('cargo', 4, 2), M('cargo', 5, 2), M('cargo', 6, 2), M('cargo', 4, 5), M('cargo', 5, 5), M('cargo', 6, 5), M('fuel', 2, 2), M('fuel', 2, 5), M('eng', 0, 3), M('eng', 0, 4),
    M('rcs', 1, 1), M('rcs', 1, 6), M('rcs', 11, 1), M('rcs', 11, 6), M('gear', 6, 7), M('gear', 9, 7), M('scan', 7, 1)] },
  hauler: { w: 13, h: 7, m: [M('clamp', 12, 3), M('cock', 11, 3), M('hab', 10, 3), ...spine(9, 1, 3), M('cargo', 5, 2), M('cargo', 6, 2), M('cargo', 7, 2), M('cargo', 5, 4), M('cargo', 6, 4), M('cargo', 7, 4),
    M('fuel', 3, 2), M('fuel', 3, 4), M('eng', 0, 3), M('rcs', 1, 0), M('rcs', 1, 6), M('rcs', 11, 0), M('rcs', 11, 6), M('gear', 6, 6)] },
  pros: { w: 11, h: 7, m: [M('clamp', 10, 3), M('cock', 9, 3), ...spine(8, 1, 3), M('cargo', 4, 2), M('cargo', 5, 2), M('cargo', 4, 4), M('fuel', 2, 2), M('eng', 0, 3),
    M('mine', 7, 5), M('scan', 6, 0), M('rcs', 1, 0), M('rcs', 1, 6), M('rcs', 9, 0), M('rcs', 9, 6)] },
  lander: { w: 12, h: 7, tail: true, m: [M('clamp', 11, 3), M('cock', 10, 3), M('hab', 9, 3), ...spine(8, 1, 3), M('cargo', 4, 2), M('cargo', 5, 2), M('cargo', 6, 2), M('cargo', 4, 4), M('cargo', 5, 4), M('cargo', 6, 4),
    M('fuel', 2, 2), M('fuel', 2, 4), M('eng', 0, 2), M('eng', 0, 3), M('eng', 0, 4), M('gear', 0, 0), M('gear', 0, 6), M('rcs', 9, 1), M('rcs', 9, 5), M('rcs', 2, 1), M('rcs', 2, 5)] },
  tug: { w: 9, h: 7, m: [M('clamp', 8, 2), M('clamp', 8, 3), M('clamp', 8, 4), M('cock', 7, 3), ...spine(6, 1, 3), M('fuel', 3, 2), M('fuel', 3, 4), M('fuel', 4, 2), M('fuel', 4, 4),
    M('eng', 0, 1), M('eng', 0, 3), M('eng', 0, 5), M('hull', 1, 1), M('hull', 1, 5), M('rcs', 6, 0), M('rcs', 6, 6), M('scan', 5, 1)] },
  drone: { w: 5, h: 3, m: [M('scan', 4, 1), M('cock', 3, 1), M('hull', 2, 1), M('eng', 0, 1), M('rcs', 1, 0), M('rcs', 1, 2), M('hull', 1, 1)] },
};

export const alive = (s, t) => s.mods.filter(m => !m.dead && (!t || m.t === t));
export const cmass = s => { let m = 0; for (const g in s.cargo) m += s.cargo[g] * GD[g].m; return m; };
export function cadd(s, t, q) {
  const take = Math.min(q, Math.floor((s.cargoMax - cmass(s)) / GD[t].m));
  if (take > 0) { s.cargo[t] = (s.cargo[t] || 0) + take; stats(s); }
  return Math.max(0, take);
}
export const integ = s => { let h = 0, m = 0; for (const q of s.mods) { h += Math.max(0, q.hp); m += q.max; } return h / m; };

/** ship-local → world */
export function sw(s, lx, ly) { const c = Math.cos(s.a), n = Math.sin(s.a); return { x: s.x + lx * c - ly * n, y: s.y + lx * n + ly * c }; }
/** module world position */
export function mw(s, m) { return sw(s, (m.gx + 0.5) * C.SS - (s.gw * C.SS) / 2, (m.gy + 0.5) * C.SS - (s.gh * C.SS) / 2); }

export function stats(s) {
  const u = s.upg || {}, n = t => alive(s, t).length, K = CLS[s.cls] || CLS.hauler, L = LAY[s.cls] || LAY.hauler;
  const base = t => L.m.filter(q => q[0] === t).length || 1;
  s.mass = 12 + s.mods.length * 0.12 + cmass(s) * 0.3;
  s.thrust = (K.thr * (1 + (u.eng || 0) * 0.16) * (n('eng') / base('eng'))) / s.mass;
  s.rcsA = K.rcs * (n('rcs') / base('rcs')); s.tq = K.tq * Math.max(0.25, n('rcs') / base('rcs'));
  s.cargoMax = Math.round(K.cargo * (0.4 + 0.6 * (n('cargo') / base('cargo')))) + (u.cargo || 0) * 12;
  s.fuelMax = K.fuel + (u.fuel || 0) * 35; s.burn = K.burn;
  s.nose = (s.gw * C.SS) / 2; s.belly = (s.gh * C.SS) / 2; s.rad = ((hy(s.gw, s.gh) * C.SS) / 2) * 0.82;
  s.lasR = C.MINE.rng + (u.laser || 0) * 30; s.lasD = C.MINE.dps + (u.laser || 0) * 14;
  s.scanR = C.SCAN.rng + (u.scan || 0) * 160;
  s.gearOK = K.gear && n('gear') > 0;
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
    else if (t === 'mine') { x.fillStyle = '#53d9ff'; x.fillRect(px + S - 1, py + 1, 1, 2); }
    else if (t === 'cargo') { x.fillStyle = '#8a6a2f'; x.fillRect(px + 1, py + 1, 2, 2); }
    else if (t === 'fuel') { x.fillStyle = '#ffb347'; x.fillRect(px + 1, py + 1, 2, 1); }
    else if (t === 'clamp') { x.fillStyle = '#ffd166'; x.fillRect(px + S - 1, py, 1, 1); x.fillRect(px + S - 1, py + 3, 1, 1); }
    else if (t === 'gear') { x.fillStyle = '#6df08f'; x.fillRect(px + 1, py + 1, 2, 2); }
    else if (t === 'scan') { x.fillStyle = '#53d9ff'; x.fillRect(px + 1, py, 2, 1); }
    else if (t === 'hab') { x.fillStyle = '#8cff9e'; x.fillRect(px + 1, py + 1, 1, 1); }
    if (m.flash > 0) { x.fillStyle = 'rgba(255,240,210,.85)'; x.fillRect(px, py, S, S); }
  }
  x.fillStyle = FC[s.fac] || '#8b98a8'; x.fillRect(s.gw * S - 2, 0, 2, 1); x.fillRect(0, s.gh * S - 1, 2, 1);
  s.dirty = false;
}

export function mkShip(cls, fac, name, x, y) {
  const L = LAY[cls] || LAY.hauler;
  const s = {
    kind: 'ship', cls, role: cls, fac, name, x, y, vx: 0, vy: 0, a: 0, va: 0, gw: L.w, gh: L.h, mods: [], grid: new Int16Array(L.w * L.h), fuel: 0,
    cargo: {}, upg: {}, dock: null, gear: !!L.tail, tailLand: !!L.tail, dead: false, isPl: false, own: false, thr: 0, rcx: 0, rcy: 0, tqi: 0, wantM: false,
    beam: null, spr: null, dirty: true, ag: null, hitT: 0, grounded: 0,
  };
  L.m.forEach(([t, gx, gy], i) => { s.mods.push({ t, gx, gy, hp: MD[t].hp, max: MD[t].hp, dead: false, flash: 0 }); s.grid[gy * L.w + gx] = i + 1; });
  stats(s); s.fuel = s.fuelMax; sprite(s); W.ships.push(s);
  return s;
}
/** a hull the player owns */
export function mkOwned(cls, x, y) {
  const s = mkShip(cls, 'free', cls === 'wren' ? 'WREN' : 'HARE', x, y);
  s.own = true; s.upg = { eng: 0, cargo: 0, laser: 0, fuel: 0, scan: 0 };
  stats(s); s.fuel = s.fuelMax;
  return s;
}

export function dock(s, b, p, ty, silent) {
  p.occ = s; s.dock = { ty: ty || 'port', b, p }; s.thr = s.rcx = s.rcy = s.tqi = 0; attach(s);
  if (s.isPl && !silent) { AU.chime(); hooks.onDock(b, ty); }
}
/** come to rest on bare regolith */
export function settle(s) {
  s.dock = { ty: 'ground', x: s.x, y: s.y, a: s.a }; s.vx = s.vy = s.va = 0; s.thr = s.rcx = s.rcy = s.tqi = 0;
  if (s.isPl) hooks.onTouch(s);
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
  s.dock = null;
  if (d.ty === 'ground') { const r = Math.hypot(s.x, s.y); s.vx = (s.x / r) * 0.6; s.vy = (s.y / r) * 0.6; s.va = 0; s.x += (s.x / r) * 0.6; s.y += (s.y / r) * 0.6; }
  else {
    if (d.ty !== 'anchor') d.p.occ = null;
    const pw = d.ty === 'anchor' ? { dir: s.a + Math.PI, vx: d.b.vx || 0, vy: d.b.vy || 0 } : portW(d.b, d.p);
    const sp = d.ty === 'pad' && s.tailLand ? 0.8 : 3;
    s.vx = pw.vx + Math.cos(pw.dir) * sp; s.vy = pw.vy + Math.sin(pw.dir) * sp; s.va = 0;
  }
  if (s.isPl) { AU.puff(); hooks.closeStation(); }
}
/** keep a docked / anchored / grounded ship glued to its host */
export function attach(s) {
  const d = s.dock; if (!d) return;
  if (d.ty === 'ground') { s.x = d.x; s.y = d.y; s.a = d.a; s.vx = s.vy = s.va = 0; return; }
  const b = d.b;
  if (d.ty === 'anchor') {
    if (!b.dead && b.sol && !b.sol[d.cy * b.gw + d.cx]) {
      // the harpoon re-bites into the nearest solid cell (within 3 cells) before giving up
      let bi = -1, bd = 1e9;
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) { const x = d.cx + ox, y = d.cy + oy; if (x < 0 || y < 0 || x >= b.gw || y >= b.gh) continue; if (b.sol[y * b.gw + x] && ox * ox + oy * oy < bd) { bd = ox * ox + oy * oy; bi = y * b.gw + x; } }
      if (bi >= 0) { d.cx = bi % b.gw; d.cy = (bi / b.gw) | 0; }
    }
    if (b.dead || (b.sol && !b.sol[d.cy * b.gw + d.cx])) { s.dock = null; if (s.isPl) hooks.toast('ANCHOR SHEARED — the rock gave way', 'warn'); return; }
    // anchored ships can slew the nose about the harpoon line (±0.75 rad) to sweep the laser across the face
    if (d.ao0 === undefined) d.ao0 = d.ao;
    if (s.tqi && Math.abs(s.tqi) > 0.05) d.ao = d.ao0 + Math.max(-0.75, Math.min(0.75, d.ao - d.ao0 + s.tqi * C.DT * 0.45));
    const c = Math.cos(b.a), n = Math.sin(b.a);
    s.x = b.x + d.lx * c - d.ly * n; s.y = b.y + d.lx * n + d.ly * c; s.a = b.a + d.ao;
    const v = bvel(b, s.x, s.y); s.vx = v.x; s.vy = v.y; s.va = b.va || 0;
    return;
  }
  const w = portW(b, d.p);
  if (d.ty === 'pad') {
    if (s.tailLand) { s.a = w.dir; s.x = w.x + Math.cos(w.dir) * (s.nose + 1.2); s.y = w.y + Math.sin(w.dir) * (s.nose + 1.2); }
    else { s.a = w.dir + Math.PI / 2; s.x = w.x + Math.cos(w.dir) * (s.belly + 1.2); s.y = w.y + Math.sin(w.dir) * (s.belly + 1.2); }
  } else { s.a = w.dir + Math.PI; s.x = w.x + Math.cos(w.dir) * (s.nose + 1.5); s.y = w.y + Math.sin(w.dir) * (s.nose + 1.5); }
  s.vx = w.vx; s.vy = w.vy; s.va = w.va;
}
