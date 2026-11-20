// ═══ hull damage, mining laser, micrometeoroids ═════════════════════════
import { hy, rr, ri, TAU } from './core/util.js';
import { C, MAT, MD } from './core/config.js';
import { W, ev, cam } from './core/state.js';
import { near, ca, cut, ray } from './world/body.js';
import { addPick } from './world/gen.js';
import { alive, mw, stats } from './ships.js';
import { bit, sparks, gas, boomFx, smoke } from './fx.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const R = Math.random;

export function dmgMod(s, m, d, by) {
  if (m.dead || s.dead) return;
  if (s.crewShuttle) { m.flash = 0.08; return; }   // Lu's MULE is station property: scuffs, never breaks
  if (s.isPl || s.own) d *= hooks.armor();
  m.hp -= d; m.flash = 0.08; s.dirty = true; s.hitT = 0.25;
  if (m.hp <= 0) {
    m.dead = true;
    const w = mw(s, m); boomFx(w.x, w.y, 0.5); gas(w.x, w.y, s.vx, s.vy); stats(s);
    if (m.t === 'cock' || alive(s).length < s.mods.length * 0.32) killShip(s, by);
  }
}

export function dmgAt(s, x, y, d, by) {
  const c = Math.cos(-s.a), n = Math.sin(-s.a), dx = x - s.x, dy = y - s.y;
  const gx = Math.floor((dx * c - dy * n + (s.gw * C.SS) / 2) / C.SS), gy = Math.floor((dx * n + dy * c + (s.gh * C.SS) / 2) / C.SS);
  let i = gx >= 0 && gy >= 0 && gx < s.gw && gy < s.gh ? s.grid[gy * s.gw + gx] : 0;
  if (!i || s.mods[i - 1].dead) {
    let bd = 1e9; i = 0;
    for (let k = 0; k < s.mods.length; k++) { const m = s.mods[k]; if (m.dead) continue; const d2 = hy(m.gx - gx, m.gy - gy); if (d2 < bd) { bd = d2; i = k + 1; } }
    if (bd > 3) return;
  }
  dmgMod(s, s.mods[i - 1], d, by);
}

export function killShip(s, by) {
  if (s.dead) return;
  s.dead = true; s.dock = null;
  boomFx(s.x, s.y, 1.4); AU.boom(1.2);
  if (hy(s.x - cam.x, s.y - cam.y) < 900) cam.shake = Math.min(22, cam.shake + 14);
  for (const g in s.cargo) {
    let q = s.cargo[g];
    while (q > 0) { const t = Math.min(q, ri(R, 1, 3)); q -= t; addPick(s.x + rr(R, -10, 10), s.y + rr(R, -10, 10), g, t, s.vx + rr(R, -22, 22), s.vy + rr(R, -22, 22)); }
  }
  s.cargo = {};
  for (const m of s.mods) {
    const w = mw(s, m);
    W.deb.push({ x: w.x, y: w.y, vx: s.vx + rr(R, -30, 30), vy: s.vy + rr(R, -30, 30), a: s.a, va: rr(R, -2, 2), w: C.SS, h: C.SS,
      c: m.dead ? '#141a22' : MD[m.t].c, life: 45, hot: rr(R, 1, 2.6) });
  }
  if (s.own || s.isPl) hooks.shipLost(s);
}

/** ore yield for a broken cell, thrown back toward the cutter */
export function spill(m, x, y, dx, dy, isPl, k = 1) {
  const mt = MAT[m];
  if (isPl) W.stats.mined++;
  if (mt.ore && mt.ore !== 'parts') addPick(x - dx * 4, y - dy * 4, mt.ore, R() < 0.45 * k ? 2 : 1, -dx * 14 + rr(R, -8, 8), -dy * 14 + rr(R, -8, 8));
  else if (m === 1 && R() < 0.14 * k) addPick(x - dx * 4, y - dy * 4, 'fe', 1, -dx * 14 + rr(R, -8, 8), -dy * 14 + rr(R, -8, 8));   // metal fines in the regolith
  else if (mt.ore === 'parts' && R() < 0.2) addPick(x - dx * 4, y - dy * 4, 'parts', 1, -dx * 10, -dy * 10);
  sparks(x, y, 6, mt.c, 80);
}

/** ship mining laser: carves terrain with a soft 3-cell footprint, ejects ore toward the miner */
export function laser(s, dt) {
  s.beam = null;
  if (!s.wantM || s.dead || s.fuel <= 0) return;
  const m = alive(s, 'mine')[0]; if (!m) return;
  const w = mw(s, m), dx = Math.cos(s.a), dy = Math.sin(s.a);
  s.fuel = Math.max(0, s.fuel - dt * 0.12);
  const h = ray(w.x, w.y, dx, dy, s.lasR);
  if (h) {
    s.beam = { x0: w.x, y0: w.y, x1: h.x, y1: h.y, hit: true };
    const b = h.b;
    if (b.kind === 'station') { if (R() < 0.3) sparks(h.x, h.y, 2, '#ffd9a0', 40); return; }  // traffic control fuses beams on habitats
    const mined = [];
    const m0 = cut(b, h.cx, h.cy, s.lasD * dt); if (m0) mined.push(m0);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = h.cx + ox, cy = h.cy + oy;
      if (cx >= 0 && cy >= 0 && cx < b.gw && cy < b.gh) { const mm = cut(b, cx, cy, s.lasD * dt * 0.35); if (mm) mined.push(mm); }
    }
    if (R() < 0.35) sparks(h.x, h.y, 2, '#ffb347', 55);
    if (R() < 0.08) smoke(h.x - dx * 3, h.y - dy * 3, -dx * 8 + rr(R, -6, 6), -dy * 8 + rr(R, -6, 6), 2.5, 1.4);
    for (const m2 of mined) spill(m2, h.x, h.y, dx, dy, s.isPl);
  } else s.beam = { x0: w.x, y0: w.y, x1: w.x + dx * s.lasR, y1: w.y + dy * s.lasR };
}

/** micrometeoroids: fast, hot, indiscriminate — they cut rock and shred hulls */
export function stepMeteors(dt) {
  for (const m of W.meteors) {
    m.life -= dt;
    if (m.life <= 0) { m.dead = true; continue; }
    const steps = 3;
    for (let s = 0; s < steps && !m.dead; s++) {
      m.px = m.x; m.py = m.y; m.x += (m.vx * dt) / steps; m.y += (m.vy * dt) / steps;
      for (const t of near(m.x, m.y, 4)) {
        const c = ca(t, m.x, m.y);
        if (c && t.sol[c.i]) {
          if (t.kind !== 'station') for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const cx = c.cx + ox, cy = c.cy + oy;
            if (cx >= 0 && cy >= 0 && cx < t.gw && cy < t.gh) cut(t, cx, cy, ox || oy ? 40 * m.r : 140 * m.r);
          }
          impact(m); break;
        }
      }
      if (m.dead) break;
      if (Math.hypot(m.x, m.y) < C.RM + 60) { impact(m); break; }
      for (const sh of W.ships) {
        if (sh.dead) continue;
        if (hy(sh.x - m.x, sh.y - m.y) < sh.rad) {
          dmgAt(sh, m.x, m.y, 22 * m.r, null);
          sh.vx += m.vx * 0.01 * m.r; sh.vy += m.vy * 0.01 * m.r;
          if (sh.isPl) { cam.shake = Math.min(20, cam.shake + 8); AU.warn(); }
          impact(m); break;
        }
      }
      if (!m.dead && ev && !ev.dead && !ev.hide && hy(ev.x - m.x, ev.y - m.y) < 4) { ev.suit -= 30; impact(m); }
    }
    if (!m.dead && R() < 0.5) bit({ x: m.x, y: m.y, vx: m.vx * 0.05 + rr(R, -6, 6), vy: m.vy * 0.05 + rr(R, -6, 6), life: 0.5, max: 0.5, s: 1.6 * m.r, c: '#ffcf8a', t: 'thrust' });
  }
  W.meteors = W.meteors.filter(m => !m.dead);
}
function impact(m) {
  m.dead = true;
  boomFx(m.x, m.y, 0.45 + m.r * 0.35);
  if (hy(m.x - cam.x, m.y - cam.y) < 600) { AU.boom(0.5); cam.shake = Math.min(14, cam.shake + 3); }
}
export const meteorDir = a => ({ x: Math.cos(a), y: Math.sin(a), a: a + TAU });
