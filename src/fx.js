// ═══ particles & visual effects ═════════════════════════════════════════
import { TAU, rr, hy } from './core/util.js';
import { W, cam } from './core/state.js';
import { gacc } from './core/config.js';

const R = Math.random, GA = { x: 0, y: 0 };
export function bit(p) { if (W.bits.length > 900) W.bits.shift(); W.bits.push(p); }

export function sparks(x, y, n, c, sp = 60) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, v = rr(R, sp * 0.3, sp);
    bit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rr(R, 0.2, 0.6), max: 0.6, s: rr(R, 1, 2.4), c, t: 'spark' });
  }
}
export function gas(x, y, vx, vy, c = '#a8ecff') { bit({ x, y, vx, vy, life: 0.9, max: 0.9, s: rr(R, 2, 5), c, t: 'gas' }); }
export function smoke(x, y, vx, vy, s = 4, life = 2.2) { bit({ x, y, vx, vy, life, max: life, s, c: '#3a3530', t: 'smoke' }); }
/** regolith spray: ballistic grey grit thrown along the surface normal (nx,ny) */
export function dust(x, y, nx, ny, n = 4) {
  for (let i = 0; i < n; i++) {
    const tx = -ny, ty = nx, sp = rr(R, -1, 1), v = rr(R, 6, 26);
    bit({ x, y, vx: (tx * sp * 1.6 + nx * rr(R, 0.2, 0.9)) * v, vy: (ty * sp * 1.6 + ny * rr(R, 0.2, 0.9)) * v, life: rr(R, 0.8, 1.8), max: 1.8, s: rr(R, 0.8, 1.8), c: '#8f877c', t: 'dust' });
  }
}
/** short RCS cold-gas jet */
export function jet(x, y, vx, vy) { bit({ x, y, vx, vy, life: 0.28, max: 0.28, s: rr(R, 1.2, 2.4), c: '#d8f4ff', t: 'jet' }); }

/** layered explosion: flash, shockwave, fireballs, sparks, smoke, light pulse */
export function boomFx(x, y, z = 1) {
  bit({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, s: 26 * z, c: '#ffd9a0', t: 'flash' });
  bit({ x, y, vx: 0, vy: 0, life: 0.6, max: 0.6, s: 8 * z, c: '#ff8c1a', t: 'ring' });
  if (z >= 1) bit({ x, y, vx: 0, vy: 0, life: 1.1, max: 1.1, s: 15 * z, c: '#ffd9a0', t: 'shock' });
  sparks(x, y, (26 * z) | 0, '#ffb347', 120 * z);
  for (let i = 0; i < 5 * z; i++) {
    const a = R() * TAU, v = rr(R, 6, 30) * z;
    bit({ x: x + rr(R, -4, 4), y: y + rr(R, -4, 4), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rr(R, 0.4, 0.9), max: 0.9, s: rr(R, 4, 9) * z, c: '#ff8c1a', t: 'fire' });
  }
  for (let i = 0; i < 8 * z; i++) smoke(x + rr(R, -8, 8), y + rr(R, -8, 8), rr(R, -22, 22), rr(R, -22, 22), rr(R, 3, 7) * z, rr(R, 1.6, 3.2));
  W.flashes = W.flashes || [];
  W.flashes.push({ x, y, r: 90 * z, t: 0.5 * Math.min(2, z), max: 0.5 * Math.min(2, z) });
  if (hy(x - cam.x, y - cam.y) < 500 && z >= 1.2) cam.flash = Math.min(0.5, cam.flash + 0.18 * z);
}

export function stepBits(dt) {
  for (const p of W.bits) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t === 'gas') p.s += dt * 6;
    else if (p.t === 'dust') { gacc(p.x, p.y, p.vx, p.vy, GA); p.vx += GA.x * dt; p.vy += GA.y * dt; }
    else if (p.t === 'smoke') { p.s += dt * 4; p.vx *= 1 - dt * 0.4; p.vy *= 1 - dt * 0.4; }
    else if (p.t === 'fire') { p.s *= 1 + dt * 0.8; p.vx *= 1 - dt; p.vy *= 1 - dt; }
  }
  W.bits = W.bits.filter(p => p.life > 0);
  if (W.flashes) { for (const f of W.flashes) f.t -= dt; W.flashes = W.flashes.filter(f => f.t > 0); }
  cam.flash *= Math.exp(-5 * dt);
}
