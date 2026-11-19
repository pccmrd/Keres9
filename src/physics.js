// ═══ ship flight model, regolith contact & loose-object physics ═════════
import { hy, an, rr, cl, ad } from './core/util.js';
import { C, GD, gacc } from './core/config.js';
import { W, pl, ev, cam, focus } from './core/state.js';
import { collide, cut, lw, bvel, ray } from './world/body.js';
import { surfR, surfN, ground } from './world/moon.js';
import { alive, mw, sw, cmass, cadd, sprite, attach, settle, undock } from './ships.js';
import { laser, dmgAt } from './combat.js';
import { bit, sparks, jet, smoke, dust } from './fx.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const R = Math.random, A = { x: 0, y: 0 };
const nearCam = (x, y, d) => hy(x - cam.x, y - cam.y) < d;

/** multi-point rigid contact against the regolith; tail-landers settle when upright and slow */
function groundShip(s, dt) {
  const r = hy(s.x, s.y), th = Math.atan2(s.y, s.x), S = surfR(th);
  if (r - S > s.nose + 6) { s.settleT = 0; return; }
  const hw = s.nose, hh = s.belly, invI = 12 / (4 * hw * hw + 4 * hh * hh);
  let hit = false, maxIm = 0;
  for (const [lx, ly] of [[-hw, -hh], [-hw, hh], [hw, -hh], [hw, hh], [0, -hh], [0, hh], [-hw, 0], [hw, 0]]) {
    const p = sw(s, lx, ly), pr = hy(p.x, p.y), pth = Math.atan2(p.y, p.x), Sp = surfR(pth), pen = Sp - pr;
    if (pen <= 0) continue;
    hit = true;
    const n = surfN(pth);
    s.x += n.x * pen; s.y += n.y * pen;
    const rx = p.x - s.x, ry = p.y - s.y, vpx = s.vx - ry * s.va, vpy = s.vy + rx * s.va, vn = vpx * n.x + vpy * n.y;
    if (vn >= 0) continue;
    const rn = rx * n.y - ry * n.x, j = (-(1.15) * vn) / (1 + rn * rn * invI);
    s.vx += j * n.x; s.vy += j * n.y; s.va += j * rn * invI;
    const tx = -n.y, ty = n.x, vt = vpx * tx + vpy * ty, rt = rx * ty - ry * tx, jt = cl(-vt / (1 + rt * rt * invI), -0.7 * j, 0.7 * j);
    s.vx += jt * tx; s.vy += jt * ty; s.va += jt * rt * invI;
    const gearPt = s.tailLand && lx < 0 && s.gear && s.gearOK, lim = gearPt ? C.TOUCH.v + 1.3 : 2.2;
    if (-vn > maxIm) maxIm = -vn;
    if (-vn > lim) { dmgAt(s, p.x, p.y, (-vn - lim) * 7, null); sparks(p.x, p.y, 6, '#ffb347', 50); }
    if (-vn > 1.2 && nearCam(p.x, p.y, 700)) dust(p.x, p.y, n.x, n.y, Math.min(10, -vn * 2));
  }
  if (!hit) { s.settleT = 0; return; }
  s.va *= Math.exp(-2.2 * dt);
  if (s.isPl && maxIm > 2.5) { cam.shake = Math.min(16, cam.shake + maxIm * 1.2); AU.thunk(); }
  const up = Math.atan2(s.y, s.x), upright = Math.abs(ad(s.a, up)) < C.TOUCH.a;
  if (s.tailLand && s.gear && s.gearOK && upright && hy(s.vx, s.vy) < 0.8 && Math.abs(s.va) < 0.08 && s.thr < 0.08) {
    s.settleT = (s.settleT || 0) + dt;
    if (s.settleT > 0.5) { s.settleT = 0; settle(s); }
  } else s.settleT = 0;
}

export function stepShip(s, dt) {
  if (s.dead) return;
  if (s.rail) { if (s.dirty) sprite(s); return; }   // scripted (haul engines): events.js moves it
  for (const m of s.mods) if (m.flash > 0) { m.flash -= dt; if (m.flash <= 0) s.dirty = true; }
  if (s.hitT > 0) s.hitT -= dt;
  if (s.dock) {
    // throttle-up lifts a tail-lander straight off the pad or the regolith
    if ((s.dock.ty === 'ground' || (s.dock.ty === 'pad' && s.tailLand)) && s.thr > 0.06 && s.fuel > 0 && alive(s, 'eng').length) { const wasPad = s.dock.ty === 'pad'; undock(s); if (wasPad) s.liftT = W.time; if (s.isPl) hooks.toast('LIFT-OFF', 'good'); }
    else { attach(s); laser(s, dt); if (s.dirty) sprite(s); return; }
  }
  gacc(s.x, s.y, s.vx, s.vy, A); s.vx += A.x * dt; s.vy += A.y * dt;
  // main engine
  if (s.thr > 0 && alive(s, 'eng').length && s.fuel > 0) {
    const a = s.thrust * s.thr;
    s.vx += Math.cos(s.a) * a * dt; s.vy += Math.sin(s.a) * a * dt;
    s.fuel = Math.max(0, s.fuel - s.thr * dt * s.burn);
    if (nearCam(s.x, s.y, 1400)) {
      const bk = s.a + Math.PI;
      for (const e of alive(s, 'eng')) {
        const w = mw(s, e);
        bit({ x: w.x, y: w.y, vx: s.vx + Math.cos(bk + rr(R, -0.12, 0.12)) * rr(R, 40, 90) * s.thr, vy: s.vy + Math.sin(bk + rr(R, -0.12, 0.12)) * rr(R, 40, 90) * s.thr,
          life: 0.28, max: 0.28, s: rr(R, 2, 4.5) * s.thr + 1, c: R() < 0.5 ? '#ffb347' : '#ff8c1a', t: 'thrust' });
      }
      // plume kicks up regolith near the ground
      const r = hy(s.x, s.y), alt = r - surfR(Math.atan2(s.y, s.x));
      if (alt < 70 && s.thr > 0.2 && R() < s.thr * 0.8) {
        const ex = Math.cos(bk), ey = Math.sin(bk), ux = s.x / r, uy = s.y / r;
        if (ex * ux + ey * uy < -0.5) { const gx = s.x - ux * alt, gy = s.y - uy * alt; dust(gx + rr(R, -6, 6), gy + rr(R, -6, 6), ux, uy, 3 + (70 - alt) * 0.1); }
      }
    }
  }
  // RCS translation (world frame) — visible cold-gas jets
  const rl = hy(s.rcx, s.rcy);
  if (rl > 0.05 && s.fuel > 0 && s.rcsA > 0) {
    const a = s.rcsA * Math.min(1, rl);
    s.vx += (s.rcx / rl) * a * dt; s.vy += (s.rcy / rl) * a * dt;
    s.fuel = Math.max(0, s.fuel - rl * dt * 0.06 * s.rcsA);
    if (s.isPl && R() < 0.3) AU.puff();
    if (R() < 0.55 * Math.min(1, rl) && nearCam(s.x, s.y, 900)) {
      const ux = -s.rcx / rl, uy = -s.rcy / rl;
      jet(s.x + ux * s.rad * 0.8 + rr(R, -2, 2), s.y + uy * s.rad * 0.8 + rr(R, -2, 2), s.vx + ux * 38, s.vy + uy * 38);
    }
  }
  // attitude
  s.va += s.tqi * s.tq * dt;
  s.va *= Math.exp(-(Math.abs(s.tqi) > 0.05 ? 0.12 : 0.95) * dt);
  if (Math.abs(s.tqi) > 0.25 && R() < 0.3 && nearCam(s.x, s.y, 700)) {
    const sg = Math.sign(s.tqi), ca = Math.cos(s.a), sa = Math.sin(s.a), n = s.nose * 0.8;
    jet(s.x + ca * n, s.y + sa * n, s.vx - sa * 30 * -sg, s.vy + ca * 30 * -sg);
  }
  s.x += s.vx * dt; s.y += s.vy * dt; s.a = an(s.a + s.va * dt);
  // outer lanes: traffic control nudges strays back toward the band
  const r = hy(s.x, s.y);
  if (r > C.RS + 2400 && !s.leaving) { s.vx -= (s.x / r) * 3 * dt; s.vy -= (s.y / r) * 3 * dt; }
  collide(s, s.rad * 0.72, (im, x, y, b, cx, cy) => {
    if (im > 3) {
      dmgAt(s, x, y, (im - 3) * 2.4, null);
      sparks(x, y, Math.min(14, im * 2), '#ffb347', im * 8);
      if (cx >= 0 && b.kind !== 'station') cut(b, cx, cy, im * 2.5);
      if (s.isPl) { cam.shake = Math.min(18, cam.shake + im * 1.4); AU.thunk(); if (im > 9) AU.warn(); }
    }
  });
  groundShip(s, dt);
  if (s.hitT > 0 && alive(s).length < s.mods.length * 0.6 && R() < 0.3) smoke(s.x, s.y, s.vx + rr(R, -5, 5), s.vy + rr(R, -5, 5), 2.5, 1.6);
  laser(s, dt);
  if (s.dirty) sprite(s);
}

export function stepShips(dt) {
  for (const s of W.ships) stepShip(s, dt);
  const a = W.ships.filter(s => !s.dead && !s.dock && !s.ghost && !s.rail);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const p = a[i], q = a[j], dx = q.x - p.x, dy = q.y - p.y; if (Math.abs(dx) > 40 || Math.abs(dy) > 40) continue;
    const d = hy(dx, dy), Rr = p.rad + q.rad;
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

export function nearPick(x, y, r, pred) {
  let best = null, bd = r;
  for (const p of W.picks) { if (p.dead || p.held || (pred && !pred(p))) continue; const d = hy(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
  return best;
}

export function stepPicks(dt) {
  const f = focus();
  for (const p of W.picks) {
    if (p.dead || p.held) continue;
    if (!f || hy(p.x - f.x, p.y - f.y) > 1600) {
      // out of sim range: loot sealed in a rock rides along with it rigidly, so a spinning
      // rock doesn't leave its chamber contents behind embedded in stone
      if (p.home) { const w = lw(p.home, p.hx, p.hy), v = bvel(p.home, w.x, w.y); p.x = w.x; p.y = w.y; p.vx = v.x; p.vy = v.y; }
      continue;
    }
    p.age += dt;
    gacc(p.x, p.y, p.vx, p.vy, A); p.vx += A.x * dt; p.vy += A.y * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
    // a core shard in tractor range with a clear line to the ship rides the beam out of a 1-cell laser bore
    // (it is wider than the bore, so colliding it would pin it at the tunnel mouth forever)
    let beamed = false;
    if (pl && !pl.dead && !ev && GD[p.type] && GD[p.type].story && (!pl.dock || pl.dock.ty === 'anchor')) {
      const dx = pl.x - p.x, dy = pl.y - p.y, d = hy(dx, dy);
      if (d < 75 && d > 1) { const h = ray(p.x, p.y, dx / d, dy / d, Math.max(0, d - pl.rad)); beamed = !h || h.b === pl; }
      // …or a clear line down the bore to the laser mount itself (the bore starts there, off the hull centreline)
      if (!beamed && d < 75) {
        const m = alive(pl, 'mine')[0];
        if (m) { const o = mw(pl, m), mx = o.x - p.x, my = o.y - p.y, md = hy(mx, my); if (md > 1) { const h = ray(p.x, p.y, mx / md, my / md, Math.max(0, md - 2)); beamed = !h || h.b === pl; } }
      }
    }
    if (!beamed) collide(p, p.r, null);
    if (ground(p, p.r, dt, 0.2, 4)) p.va *= 0.9;
    if (p.home) {
      const h = p.home, dx = p.x - h.x, dy = p.y - h.y;
      if (h.dead || hy(dx, dy) > h.rad + 6) p.home = null;    // it's out of the rock: free body from now on
      else { const c = Math.cos(-h.a), sn = Math.sin(-h.a); p.hx = dx * c - dy * sn; p.hy = dx * sn + dy * c; }
    }
    if (pl && !pl.dead && (!pl.dock || pl.dock.ty === 'anchor') && !ev) {
      const d = hy(p.x - pl.x, p.y - pl.y);
      const tr = GD[p.type] && GD[p.type].story ? 75 : 24;   // story items (core shards) ping the ship's tractor from deep in a tunnel
      if (d < tr && cmass(pl) < pl.cargoMax && GD[p.type]) {
        const k = (140 * dt) / Math.max(6, d);
        p.vx += (pl.x - p.x) * k; p.vy += (pl.y - p.y) * k;
        if (d < 7) {
          const t = cadd(pl, p.type, p.qty);
          if (t > 0) { p.qty -= t; if (p.qty <= 0) p.dead = true; AU.blip(); hooks.toast('SCOOPED ' + t + ' ' + GD[p.type].n); }
        }
      }
    }
  }
  W.picks = W.picks.filter(p => !p.dead);
  if (W.picks.length > 700) W.picks.splice(0, W.picks.length - 700);
}

export function stepDeb(dt) {
  for (const d of W.deb) {
    d.life -= dt;
    gacc(d.x, d.y, d.vx, d.vy, A); d.vx += A.x * dt * 0.8; d.vy += A.y * dt * 0.8;
    d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt;
    if (ground(d, 1.5, dt, 0.3, 3)) d.va *= 0.8;
    if (d.hot > 0) { d.hot -= dt; if (R() < 0.12) smoke(d.x, d.y, d.vx * 0.3, d.vy * 0.3, 1.6, 1.1); }
  }
  W.deb = W.deb.filter(d => d.life > 0);
  if (W.deb.length > 260) W.deb.splice(0, W.deb.length - 260);
}
