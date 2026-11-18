// ═══ ship flight model & loose-object physics ═══════════════════════════
import { hy, an, rr } from './core/util.js';
import { C, GD, grav } from './core/config.js';
import { W, pl, ev, cam } from './core/state.js';
import { collide, cut } from './world/body.js';
import { alive, mw, cmass, cadd, sprite, attach } from './ships.js';
import { guns, laser, dmgAt } from './combat.js';
import { bit, sparks, jet, smoke } from './fx.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const R = Math.random;
/** full simulation only near the camera; distant ships fly "on rails" */
export const active = s => s.isPl || !!s.dock || hy(s.x - cam.x, s.y - cam.y) < 1700;

export function stepShip(s, dt) {
  if (s.dead) return;
  for (const m of s.mods) if (m.flash > 0) { m.flash -= dt; if (m.flash <= 0) s.dirty = true; }
  if (s.hitT > 0) s.hitT -= dt;
  if (s.dock) { attach(s); guns(s, dt); laser(s, dt); if (s.dirty) sprite(s); return; }
  if (!active(s)) { s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt; return; }
  s.vy += grav(s.y) * dt;
  // main engine
  if (s.thr > 0 && alive(s, 'eng').length && s.fuel > 0) {
    const a = s.thrust * s.thr;
    s.vx += Math.cos(s.a) * a * dt; s.vy += Math.sin(s.a) * a * dt;
    s.fuel = Math.max(0, s.fuel - s.thr * dt * 1.15);
    const bk = s.a + Math.PI;
    for (const e of alive(s, 'eng')) {
      const w = mw(s, e);
      for (let i = 0; i < 2; i++)
        bit({ x: w.x, y: w.y, vx: s.vx + Math.cos(bk + rr(R, -0.12, 0.12)) * rr(R, 40, 90) * s.thr, vy: s.vy + Math.sin(bk + rr(R, -0.12, 0.12)) * rr(R, 40, 90) * s.thr,
          life: 0.28, max: 0.28, s: rr(R, 2, 4.5) * s.thr + 1, c: R() < 0.5 ? '#ffb347' : '#ff8c1a', t: 'thrust' });
      if (s.thr > 0.6 && R() < 0.15) smoke(w.x, w.y, s.vx + Math.cos(bk) * 30, s.vy + Math.sin(bk) * 30, 2, 1.2);
    }
  }
  // RCS translation (world frame) — visible cold-gas jets on the opposite side
  const rl = hy(s.rcx, s.rcy);
  if (rl > 0.05 && s.fuel > 0 && s.rcsA > 0) {
    const a = s.rcsA * Math.min(1, rl);
    s.vx += (s.rcx / rl) * a * dt; s.vy += (s.rcy / rl) * a * dt;
    s.fuel = Math.max(0, s.fuel - rl * dt * 0.3);
    if (s.isPl && R() < 0.3) AU.puff();
    if (R() < 0.55 * Math.min(1, rl) && hy(s.x - cam.x, s.y - cam.y) < 900) {
      const ux = -s.rcx / rl, uy = -s.rcy / rl;
      jet(s.x + ux * s.rad * 0.8 + rr(R, -2, 2), s.y + uy * s.rad * 0.8 + rr(R, -2, 2), s.vx + ux * 38, s.vy + uy * 38);
    }
  }
  // attitude
  s.va += s.tqi * s.tq * dt;
  s.va *= Math.exp(-(Math.abs(s.tqi) > 0.05 ? 0.12 : 0.95) * dt);
  if (Math.abs(s.tqi) > 0.25 && R() < 0.3 && hy(s.x - cam.x, s.y - cam.y) < 700) {
    const sg = Math.sign(s.tqi), ca = Math.cos(s.a), sa = Math.sin(s.a), n = s.nose * 0.8;
    jet(s.x + ca * n, s.y + sa * n, s.vx - sa * 30 * -sg, s.vy + ca * 30 * -sg);
  }
  s.x += s.vx * dt; s.y += s.vy * dt; s.a = an(s.a + s.va * dt);
  if (s.x < 60 || s.x > C.W - 60) s.vx += (s.x < 60 ? 8 : -8) * dt;
  if (s.y < 60 || s.y > C.H - 60) s.vy += (s.y < 60 ? 8 : -8) * dt;
  collide(s, s.rad * 0.72, (im, x, y, b, cx, cy) => {
    if (im > 3) {
      dmgAt(s, x, y, (im - 3) * 2.4, null);
      sparks(x, y, Math.min(14, im * 2), '#ffb347', im * 8);
      if (cx >= 0) cut(b, cx, cy, im * 2.5);
      if (s.isPl) { cam.shake = Math.min(18, cam.shake + im * 1.4); AU.thunk(); if (im > 9) AU.warn(); }
    }
  });
  if (s.hitT > 0 && integrityLow(s) && R() < 0.3) smoke(s.x, s.y, s.vx + rr(R, -5, 5), s.vy + rr(R, -5, 5), 2.5, 1.6);
  guns(s, dt); laser(s, dt);
  if (s.dirty) sprite(s);
}
const integrityLow = s => alive(s).length < s.mods.length * 0.6;

export function stepShips(dt) {
  for (const s of W.ships) stepShip(s, dt);
  const a = W.ships.filter(s => !s.dead && !s.dock && active(s));
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const p = a[i], q = a[j], dx = q.x - p.x, dy = q.y - p.y, d = hy(dx, dy), Rr = p.rad + q.rad;
    if (d < Rr && d > 0.01) {
      const nx = dx / d, ny = dy / d, pen = (Rr - d) / 2;
      p.x -= nx * pen; p.y -= ny * pen; q.x += nx * pen; q.y += ny * pen;
      const vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
      if (vn < 0) {
        const im = -vn * 1.25;
        p.vx -= nx * im * 0.5; p.vy -= ny * im * 0.5; q.vx += nx * im * 0.5; q.vy += ny * im * 0.5;
        if (-vn > 4) {
          dmgAt(p, (p.x + q.x) / 2, (p.y + q.y) / 2, -vn * 2, q); dmgAt(q, (p.x + q.x) / 2, (p.y + q.y) / 2, -vn * 2, p);
          sparks((p.x + q.x) / 2, (p.y + q.y) / 2, 8, '#ffd9a0', 60);
          if (p.isPl || q.isPl) { AU.thunk(); cam.shake += 6; }
        }
      }
    }
  }
  W.ships = W.ships.filter(s => !s.dead || s.isPl);
}

export function nearPick(x, y, r) {
  let best = null, bd = r;
  for (const p of W.picks) { if (p.dead || p.held) continue; const d = hy(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
  return best;
}

export function stepPicks(dt) {
  const f = ev || pl;
  for (const p of W.picks) {
    if (p.dead || p.held) continue;
    if (!f || hy(p.x - f.x, p.y - f.y) > 1500) continue;
    p.vy += grav(p.y) * dt * 0.8; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
    collide(p, p.r, null);
    if (pl && !pl.dead && (!pl.dock || pl.dock.ty === 'anchor') && !ev) {
      const d = hy(p.x - pl.x, p.y - pl.y);
      if (d < 22 && (cmass(pl) < pl.cargoMax || p.type === 'pod')) {
        const k = (140 * dt) / Math.max(6, d);
        p.vx += (pl.x - p.x) * k; p.vy += (pl.y - p.y) * k;
        if (d < 7) {
          if (p.type === 'pod') { p.dead = true; hooks.rescue(p); }
          else {
            const t = cadd(pl, p.type, p.qty);
            if (t > 0) { p.qty -= t; if (p.qty <= 0) p.dead = true; AU.blip(); hooks.toast('SCOOPED ' + t + ' ' + GD[p.type].n); }
          }
        }
      }
    }
  }
  W.picks = W.picks.filter(p => !p.dead);
}

export function stepDeb(dt) {
  for (const d of W.deb) {
    d.life -= dt; d.vy += grav(d.y) * dt * 0.7; d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt;
    if (d.hot > 0) { d.hot -= dt; if (R() < 0.12) smoke(d.x, d.y, d.vx * 0.3, d.vy * 0.3, 1.6, 1.1); }
  }
  W.deb = W.deb.filter(d => d.life > 0);
  if (W.deb.length > 260) W.deb.splice(0, W.deb.length - 260);
}
