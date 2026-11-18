// ═══ extra-vehicular activity ═══════════════════════════════════════════
import { $, hy } from './core/util.js';
import { C, GD, grav } from './core/config.js';
import { W, pl, ev, setEv, PC, CTL } from './core/state.js';
import { near, ca, collide } from './world/body.js';
import { cadd } from './ships.js';
import { gas, sparks } from './fx.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

/** the body whose interior (floor cell) the EVA suit is inside */
export function evaIn() {
  if (!ev || ev.dead) return null;
  for (const b of near(ev.x, ev.y, 8)) { const c = ca(b, ev.x, ev.y); if (c && !b.sol[c.i] && b.flr[c.i]) return b; }
  return null;
}
export const evaHome = () => ev && pl && !pl.dead && hy(ev.x - pl.x, ev.y - pl.y) < 11;

export function enterEVA() {
  if (ev || !pl || pl.dead) return;
  if (!pl.dock && hy(pl.vx, pl.vy) > 2.2) { hooks.toast('EVA denied — kill drift below 2 m/s', 'warn'); return; }
  const d = pl.a + Math.PI / 2;
  setEv({ x: pl.x + Math.cos(d) * (pl.belly + 3), y: pl.y + Math.sin(d) * (pl.belly + 3), vx: pl.vx, vy: pl.vy, a: pl.a,
    suit: 100, carry: null, dead: false, pingT: 9, pingEnd: 0, fcd: 0, bob: 0 });
  W.stats.eva++;
  AU.air(true); AU.puff();
  PC.scan = false; $('scan').classList.remove('on'); $('scanB').classList.remove('act'); hooks.closeStation();
  hooks.toast('EVA · suit air 120s · jetpack armed', 'good');
}
export function exitEVA() {
  if (!ev) return;
  if (ev.carry) { ev.carry.held = false; ev.carry.x = ev.x; ev.carry.y = ev.y; ev.carry = null; }
  setEv(null); AU.air(false);
}
export function ping() {
  if (!ev || ev.pingT < 1.2) return;
  ev.pingT = 0; ev.pingEnd = W.time + 6; AU.tick(0.8);
  for (const p of W.picks) if (hy(p.x - ev.x, p.y - ev.y) < C.EVA.ping) p.rev = W.time + 6;
  for (const c of W.contacts) if (!c.done && hy(c.x - ev.x, c.y - ev.y) < C.EVA.ping * 1.4) c.hint = W.time + 6;
  hooks.toast('HAND SCANNER · valuables outlined 6s', 'good');
}

export function stepEVA(dt) {
  if (!ev || ev.dead) return;
  const e = ev;
  e.pingT += dt; e.fcd -= dt; e.bob += dt; e.vy += grav(e.y) * dt;
  const al = hy(CTL.lx, CTL.ly);
  if (al > 0.08) {
    const a = C.EVA.acc * (e.carry ? 0.68 : 1);
    e.vx += (CTL.lx / al) * a * Math.min(1, al) * dt; e.vy += (CTL.ly / al) * a * Math.min(1, al) * dt;
    if (Math.random() < 0.25) gas(e.x - CTL.lx * 3, e.y - CTL.ly * 3, e.vx - CTL.lx * 25, e.vy - CTL.ly * 25);
  }
  if (hy(CTL.rx, CTL.ry) > 0.2) e.a = Math.atan2(CTL.ry, CTL.rx);
  e.x += e.vx * dt; e.y += e.vy * dt;
  collide(e, 2.6, (im, x, y) => { if (im > 5) { e.suit -= im * 2; sparks(x, y, 3, '#a8ecff', 40); AU.thunk(); } });
  const inside = evaIn();
  if (evaHome() || (inside && inside.kind === 'station' && !inside.dead)) e.suit = Math.min(100, e.suit + dt * 25);
  else e.suit -= dt * (100 / C.EVA.air);
  if (e.carry) {
    e.carry.x = e.x + Math.cos(e.a) * 4; e.carry.y = e.y + Math.sin(e.a) * 4;
    if (evaHome()) {
      const ty = e.carry.type, t = cadd(pl, ty, e.carry.qty);
      if (t > 0) {
        e.carry.qty -= t;
        if (e.carry.qty <= 0) { e.carry.dead = true; e.carry = null; }
        AU.blip(); hooks.toast('STOWED ' + t + ' ' + GD[ty].n, 'good');
      } else if (!e.fullWarn) { e.fullWarn = true; hooks.toast('Cargo hold full', 'warn'); }
    }
  }
  if (CTL.fire && e.fcd <= 0) {
    e.fcd = 0.26;
    W.bullets.push({ x: e.x + Math.cos(e.a) * 3, y: e.y + Math.sin(e.a) * 3, px: e.x, py: e.y,
      vx: e.vx + Math.cos(e.a) * 230, vy: e.vy + Math.sin(e.a) * 230, life: 0.9, dmg: 6, own: pl, fac: 'free' });
    AU.shoot();
  }
  if (e.suit <= 0) {
    e.dead = true; AU.warn();
    if (pl && !pl.dead) { exitEVA(); pl.credits = Math.max(0, pl.credits - 120); hooks.toast('SUIT BREACH · tether hauled you in · −120₡ medical', 'bad'); }
    else hooks.playerDied();
  }
}

export function nearestCrew() {
  if (!ev) return null;
  let best = null, bd = 15;
  for (const b of W.bodies) {
    if (b.dead || !b.crew.length) continue;
    for (const cr of b.crew) {
      const c = Math.cos(b.a), s = Math.sin(b.a);
      const x = b.x + cr.lx * c - cr.ly * s, y = b.y + cr.lx * s + cr.ly * c, d = hy(ev.x - x, ev.y - y);
      if (d < bd) { bd = d; best = { cr, b }; }
    }
  }
  return best;
}
