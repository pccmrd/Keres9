// ═══ the Selene Lift: a counterweighted pair of cars on the cable ═══════
// Surface terminal at Shackleton Rim → SELENE HIGH in the synchronous band.
// Because the band co-rotates with the ground, the cable hangs straight.
import { hy, cl, pk } from './core/util.js';
import { C } from './core/config.js';
import { W, G, ev, cam } from './core/state.js';
import { lw } from './world/body.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const ends = () => { const L = W.lift; return { g: lw(L.term, L.term.liftDock.lx, L.term.liftDock.ly), t: lw(L.top, L.top.liftDock.lx, L.top.liftDock.ly) }; };
export function liftInit() {
  const L = W.lift;
  L.cars = [{ id: 'A', s: 0, v: 0, dir: 0, rider: false }, { id: 'B', s: 1, v: 0, dir: 0, rider: false }];
  L.idle = 45; L.chat = 0;
  delete L.car;
  liftPos();
}
/** world position of every car */
export function liftPos() {
  const L = W.lift, E = ends();
  L.len = hy(E.t.x - E.g.x, E.t.y - E.g.y); L.E = E;
  for (const c of L.cars) { c.x = E.g.x + (E.t.x - E.g.x) * c.s; c.y = E.g.y + (E.t.y - E.g.y) * c.s; }
}
/** the car waiting at the player's end (ground: s=0, top: s=1), if any */
export function carHere(end) {
  const L = W.lift; if (!L || !L.cars) return null;
  return L.cars.find(c => c.dir === 0 && (end === 'ground' ? c.s < 0.001 : c.s > 0.999)) || null;
}
export const liftBusy = () => W.lift && W.lift.cars && W.lift.cars.some(c => c.dir !== 0);

/** start both cars moving: the one at `end` carries the rider */
export function ride(end, withPlayer) {
  const L = W.lift; if (liftBusy()) return false;
  for (const c of L.cars) { c.dir = c.s < 0.5 ? 1 : -1; c.v = 0; c.rider = false; }
  const car = L.cars.find(c => (end === 'ground' ? c.s < 0.5 : c.s >= 0.5));
  if (withPlayer && ev && car) {
    car.rider = true; ev.hide = true; ev.vx = ev.vy = 0; G.ride = { kind: 'lift', v: car, t0: W.time, dir: car.dir };
    W.stats.lifts++; AU.thunk(); hooks.closeStation();
    hooks.toast(car.dir > 0 ? 'SELENE LIFT ▲ — ' + Math.round(L.len) + ' m to the band. Sit back.' : 'SELENE LIFT ▼ — down the well to Shackleton Rim.', 'good');
  }
  L.idle = 70 + Math.random() * 40;
  return true;
}

const CHAT_UP = [
  'LIFT PA: Selene Lift thanks you for riding the only straight line in cislunar space.',
  'LIFT PA: Ninety tonnes of counterweight are passing you on the other track. Please wave.',
  'RADIO · Catalog Office: still no word on KERES-9. Bodies in the band are UNCATALOGUED until surveyed.',
  'RADIO · Crew Office: MULE shuttles lift every few minutes. Hands wanted. Bring your own suit.',
  'LIFT PA: Gravity drops off as you climb. At the top it is balanced by the spin — you will float.',
  'RADIO · Traffic: ARES TRANSIT is loading water for Mars. GAIA RETURN wants platinum for Earth.',
];
const CHAT_DOWN = [
  'LIFT PA: Descending to Shackleton Rim. Gravity returns gradually. Mind your knees.',
  'RADIO · Rim Colony: water rationing continues. The Depot pays well for ice landed on the surface.',
  'LIFT PA: Surface temperature in sunlight plus 110, in shadow minus 170. Suit seals, please.',
];

export function stepLift(dt) {
  const L = W.lift; if (!L || !L.cars) return;
  const moving = L.cars.some(c => c.dir !== 0);
  if (!moving) { L.idle -= dt; if (L.idle <= 0) ride('ground', false); }
  for (const c of L.cars) {
    if (!c.dir) continue;
    const dist = c.dir > 0 ? (1 - c.s) * L.len : c.s * L.len, vmax = C.LIFT.v, a = C.LIFT.a;
    const want = Math.min(vmax, Math.sqrt(2 * a * Math.max(0, dist)) + 0.6);
    c.v = c.v < want ? Math.min(want, c.v + a * dt) : want;
    c.s = cl(c.s + (c.dir * c.v * dt) / L.len, 0, 1);
    if ((c.dir > 0 && c.s >= 1) || (c.dir < 0 && c.s <= 0)) { c.dir = 0; c.v = 0; if (c.rider) arrive(c); }
  }
  liftPos();
  const r = G.ride;
  if (r && r.kind === 'lift' && ev) {
    ev.x = r.v.x; ev.y = r.v.y; ev.suit = Math.min(100, ev.suit + dt * 20);
    L.chat -= dt;
    if (L.chat <= 0) { L.chat = 7.5; const arr = r.dir > 0 ? CHAT_UP : CHAT_DOWN; hooks.toast(arr[(L.ci = ((L.ci || 0) + 1)) % arr.length]); }
  }
}
function arrive(c) {
  c.rider = false; G.ride = null;
  if (!ev) return;
  const top = c.s > 0.5, E = W.lift.E, p = top ? E.t : E.g;
  ev.hide = false; ev.x = p.x; ev.y = p.y; ev.vx = ev.vy = 0;
  AU.chime();
  hooks.liftArrive && hooks.liftArrive(top);
}
export { pk };
