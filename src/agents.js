// ═══ living traffic: haulers, prospectors, colony landers, catalog drones ═
import { TAU, hy, rr, ri, pk, rng, cl, fm } from './core/util.js';
import { C, GD } from './core/config.js';
import { W, G, AG, setAG, pl, cam } from './core/state.js';
import { cw, portW, ray } from './world/body.js';
import { mkShip, dock, undock, anchor, cmass } from './ships.js';
import { steer, applyOut, detour, standoff } from './autop.js';
import { SITES } from './world/gen.js';
import { surfR } from './world/moon.js';
import { feed } from './economy.js';

const R = Math.random;
const FIRST = ['Mara', 'Juno', 'Okon', 'Signe', 'Ravi', 'Lena', 'Abel', 'Tove', 'Kenji', 'Ayla', 'Bram', 'Noor', 'Ilse', 'Dmitri', 'Esme', 'Femi', 'Hollis', 'Yara', 'Pell', 'Rune'];
const LAST = ['Achterberg', 'Nakamura', 'Osei', 'Lindqvist', 'Haddad', 'Moreau', 'Quispe', 'Brandt', 'Sato', 'Okafor', 'Ruiz', 'Halvorsen', 'Kowal', 'Mbeki', 'Ferreira'];
const SHIPN = { hauler: ['ORE HAUL 2', 'ORE HAUL 5', 'BULK SELENE', 'THE PATIENT'], pros: ['DUST DEVIL', 'LITTLE ROCK', 'MAGPIE', 'SECOND WIND', 'GLINT'], lander: ['RIM SHUTTLE 1', 'RIM SHUTTLE 4', 'TYCHO EXPRESS'], drone: ['CAT-DRONE 3', 'CAT-DRONE 7'] };

export function mkAgent(cls, fac, x, y, id, name) {
  const s = mkShip(cls, fac, pk(R, SHIPN[cls] || ['VESSEL']) + (R() < 0.5 ? '' : ' ' + ri(R, 2, 9)), x, y);
  const a = { id, name: name || pk(R, FIRST) + ' ' + pk(R, LAST), role: cls, fac, ship: s, state: 'idle', t: rr(R, 2, 20), credits: ri(R, 200, 3000), mood: rr(R, -1, 1), ap: {}, alive: true, home: null };
  s.ag = a; AG.push(a);
  return a;
}

export function initAgents() {
  setAG([]);
  const st = SITES, id = { n: 1 };
  const nid = () => id.n++;
  const orb = [st.sel, st.vul, st.ares, st.gaia];
  for (let k = 0; k < 3; k++) { const h = orb[k % 4], a = mkAgent('hauler', 'selene', h.x + rr(R, -300, 300), h.y - 260, nid()); a.state = 'go'; a.dest = pk(R, orb); }
  for (let k = 0; k < 3; k++) { const h = st.sel, a = mkAgent('pros', 'free', h.x + rr(R, -600, 600), h.y + rr(R, -200, 200), nid()); a.state = 'idle'; }
  for (let k = 0; k < 2; k++) {
    const b = k ? st.tycho : st.depot, p = b.pads[1] || b.pads[0], a = mkAgent('lander', 'rim', b.x, b.y - 30, nid());
    if (!p.occ) dock(a.ship, b, p, 'pad', true);
    a.state = 'wait'; a.t = rr(R, 20, 90); a.base = b;
  }
  for (let k = 0; k < 2; k++) { const a = mkAgent('drone', 'selene', st.sel.x + rr(R, -400, 400), st.sel.y + rr(R, -300, 300), nid()); a.state = 'idle'; }
}

/** free docking point at a station for this ship (ports for nose-dockers, pads for landers) */
function freeDock(st, s) {
  if (s.tailLand) { const p = st.pads.find(q => !q.occ); return p ? { p, ty: 'pad' } : null; }
  const P = st.ports.filter(q => !q.occ && !q.berth && !(st === SITES.sel && st.ports.indexOf(q) === 2));
  if (P.length) return { p: pk(R, P), ty: 'port' };
  return null;
}
/** fly the final approach to a port/pad; returns true once clamped */
function approach(a, st, P) {
  const s = a.ship, w = portW(st, P.p), pad = P.ty === 'pad';
  const off = pad ? (s.tailLand ? s.nose + 1.2 : s.belly + 1.2) : s.nose + 1.5, face = pad ? (s.tailLand ? w.dir : w.dir + Math.PI / 2) : w.dir + Math.PI;
  const fx = w.x + Math.cos(w.dir) * off, fy = w.y + Math.sin(w.dir) * off;
  const far = hy(s.x - fx, s.y - fy);
  const ax = w.x + Math.cos(w.dir) * (off + 34), ay = w.y + Math.sin(w.dir) * (off + 34);
  let t;
  if (far > 60) { const wp = detour(s.x, s.y, ax, ay, s.rad + 4, st); t = steer(s, wp ? wp.x : ax, wp ? wp.y : ay, { vmax: s.tailLand ? 60 : 45, out: a.ap }); }
  else if (!a.final) { t = steer(s, ax, ay, { vmax: 10, out: a.ap, face, tvx: w.vx, tvy: w.vy }); if (t.d < 6 && t.rv < 1.5) a.final = true; }
  else t = steer(s, fx, fy, { vmax: 3, out: a.ap, face, tvx: w.vx, tvy: w.vy, kv: 1.6 });
  applyOut(s, a.ap);
  if (a.final && far < 5 && hy(s.vx - w.vx, s.vy - w.vy) < 2 && !P.p.occ) { dock(s, st, P.p, P.ty, true); a.final = false; return true; }
  if (P.p.occ && P.p.occ !== s) { a.final = false; a.P = null; }
  return false;
}

function trade(a, st) {
  const s = a.ship;
  if (!st.econ) return;
  for (const g in s.cargo) { const q = s.cargo[g]; if (!q || !st.econ[g]) continue; st.econ[g].stock += q; a.credits += q * GD[g].p; delete s.cargo[g]; }
  if (a.role === 'hauler') { const g = pk(R, ['fuel', 'parts', 'food', 'ice']); if (st.econ[g] && st.econ[g].stock > 15) { const q = Math.min(18, Math.floor(st.econ[g].stock * 0.2)); st.econ[g].stock -= q; s.cargo[g] = q; } }
  s.fuel = s.fuelMax;
}

export function agents(dt) {
  for (const a of AG) {
    if (!a.alive) continue;
    const s = a.ship;
    if (!s || s.dead) { a.alive = false; feed(a.name + ' lost the ' + (s ? s.name : 'ship') + '.', 'bad'); continue; }
    a.t -= dt;
    switch (a.role) {
      case 'hauler': hauler(a, s); break;
      case 'pros': prospector(a, s); break;
      case 'lander': lander(a, s); break;
      case 'drone': drone(a, s); break;
    }
  }
}

function hauler(a, s) {
  if (a.state === 'go') {
    if (s.dock) undock(s);
    if (!a.P) a.P = freeDock(a.dest, s);
    if (!a.P) { const t = steer(s, a.dest.x, a.dest.y - a.dest.rad - 80, { vmax: 30, out: a.ap }); applyOut(s, a.ap); return; }
    if (approach(a, a.dest, a.P)) { a.state = 'dock'; a.t = rr(R, 18, 40); trade(a, a.dest); a.P = null; }
  } else if (a.state === 'dock') {
    if (a.t <= 0) { const orb = [SITES.sel, SITES.vul, SITES.ares, SITES.gaia].filter(x => x !== a.dest && !x.gone); a.dest = pk(R, orb); a.state = 'go'; undock(s); }
  } else { a.state = 'go'; a.dest = SITES.sel; }
}

function prospector(a, s) {
  if (a.state === 'idle') {
    if (s.dock && s.dock.ty !== 'anchor') { if (a.t > 0) return; undock(s); }
    const L = W.rocks.filter(b => !b.dead && b.R > 14 && !b.orphan && hy(b.x - s.x, b.y - s.y) < 2400);
    a.rock = pk(R, L); a.state = 'go'; a.final = false;
  } else if (a.state === 'go') {
    const b = a.rock; if (!b || b.dead) { a.state = 'idle'; return; }
    const so = standoff(b, s.x, s.y, 22), wp = detour(s.x, s.y, so.x, so.y, s.rad + 4, b);
    const t = steer(s, wp ? wp.x : so.x, wp ? wp.y : so.y, { vmax: 28, out: a.ap, face: wp ? null : Math.atan2(b.y - s.y, b.x - s.x) });
    applyOut(s, a.ap);
    if (!wp && t.d < 6 && t.rv < 1) { a.state = 'mine'; a.t = rr(R, 25, 50); }
  } else if (a.state === 'mine') {
    const b = a.rock; if (!b || b.dead) { a.state = 'idle'; s.wantM = false; return; }
    const so = standoff(b, s.x, s.y, 20), t = steer(s, so.x, so.y, { vmax: 4, out: a.ap, face: Math.atan2(b.y - s.y, b.x - s.x) });
    applyOut(s, a.ap);
    s.wantM = t.err < 0.15 && hy(s.x - cam.x, s.y - cam.y) < 1600;
    // offscreen mining is abstracted to keep the band intact
    if (!s.wantM && R() < 0.02) s.cargo.fe = (s.cargo.fe || 0) + 1;
    if (a.t <= 0 || cmass(s) >= s.cargoMax - 2) { s.wantM = false; a.state = 'sell'; a.P = null; a.dest = R() < 0.6 ? SITES.vul : SITES.sel; }
  } else if (a.state === 'sell') {
    if (!a.P) a.P = freeDock(a.dest, s);
    if (!a.P) { a.state = 'idle'; return; }
    if (approach(a, a.dest, a.P)) { trade(a, a.dest); a.state = 'idle'; a.t = rr(R, 15, 35); a.P = null; if (R() < 0.3) feed(s.name + ' sold a hold of ore at ' + a.dest.name + '.'); }
  }
}

/** colony landers fly the full surface ↔ orbit cycle, under the same physics as the player */
function lander(a, s) {
  if (a.state === 'wait') {
    if (a.t > 0) { s.thr = s.rcx = s.rcy = s.tqi = 0; return; }
    const up = s.dock && s.dock.b && s.dock.b.surf;
    a.dest = up ? (R() < 0.7 ? SITES.sel : SITES.vul) : a.base;
    a.state = 'climb'; a.P = null; a.final = false;
    if (s.dock) undock(s);
    s.thr = 0.7;
  } else if (a.state === 'climb') {
    // straight up off the pad before swinging toward the band
    const r = hy(s.x, s.y), ux = s.x / r, uy = s.y / r, alt = r - surfR(Math.atan2(s.y, s.x));
    if (a.dest.surf || alt > 260) { a.state = 'go'; return; }
    steer(s, s.x + ux * 200, s.y + uy * 200, { vmax: 35, out: a.ap, up: true }); applyOut(s, a.ap);
  } else if (a.state === 'go') {
    if (!a.P) a.P = freeDock(a.dest, s);
    if (!a.P) { a.dest = a.dest === SITES.sel ? SITES.vul : a.base; return; }
    if (approach(a, a.dest, a.P)) {
      a.state = 'wait'; a.t = rr(R, 30, 80); trade(a, a.dest); a.P = null;
      if (R() < 0.4) feed(s.name + (a.dest.surf ? ' landed at ' : ' docked at ') + a.dest.name + '.');
    }
  }
}

function drone(a, s) {
  if (!a.rock || a.t <= 0) { const L = W.rocks.filter(b => !b.dead && hy(b.x - SITES.sel.x, b.y - SITES.sel.y) < 2600); a.rock = pk(R, L); a.t = rr(R, 25, 50); }
  const b = a.rock; if (!b) return;
  const ang = W.time * 0.15 + a.id, tx = b.x + Math.cos(ang) * (b.rad + 40), ty = b.y + Math.sin(ang) * (b.rad + 40);
  const wp = detour(s.x, s.y, tx, ty, 8, b);
  steer(s, wp ? wp.x : tx, wp ? wp.y : ty, { vmax: 22, out: a.ap, face: Math.atan2(b.y - s.y, b.x - s.x) }); applyOut(s, a.ap);
}
export { fm, rng, cl, TAU };
