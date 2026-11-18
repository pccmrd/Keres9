// ═══ AI PILOT ═══════════════════════════════════════════════════════════
// A showcase autopilot that plays KERES-9 through the same controls a human
// uses. Each "act" is a generator that runs one frame per `yield`, so long
// multi-step routines (dock → trade → upgrade → undock) read like scripts.
import { $, TAU, cl, hy, ad, ds, fm, pk, rr, bearing } from '../core/util.js';
import { C, GD, MAT } from '../core/config.js';
import { W, G, pl, ev, AG, cam, PC } from '../core/state.js';
import { ca, cw, portW, segBlock, bvel, ray } from '../world/body.js';
import { alive, cmass, integ, dock } from '../ships.js';
import { gates, defZoom, setTgt, anchCand } from '../player.js';
import { evaIn, evaHome } from '../eva.js';
import { contactFreq } from '../scanner.js';
import { price, bestSell, repairCost, upgCost, trade } from '../economy.js';
import { accept } from '../missions.js';
import { panel, hudDOM, mode, closeDialog } from '../ui.js';
import { tow } from '../game.js';
import { IN, showStick } from '../input.js';
import { inp, NAV, resetInp, press, faceTo, rcsVel, fly, travel, fixed, unstick, rideVel, approachPort, portReachable, contactPt, evaPath, cellW, jetTo, engineOK } from './nav.js';

export const AP = {
  on: false, demo: false, task: null, hist: [], act: '—', cap: '', sub: '', capT: 0, warp: 1, zoomK: 1, plan: null, metaT: 0, intT: 0,
  visited: new Set(), depleted: new WeakSet(), started: 0, seen: {}, log: [],
};

// ─── captions ────────────────────────────────────────────────────────────
const say = (cap, sub) => { if (cap.slice(0, 22) !== AP.cap.slice(0, 22)) { AP.log.push(Math.round(NAV.t) + 's ' + cap); if (AP.log.length > 300) AP.log.shift(); } AP.cap = cap; if (sub !== undefined) AP.sub = sub; };
const actTitle = t => { AP.act = t; };
const mps = v => v.toFixed(1) + ' m/s';
function telemetry() {
  const f = NAV.flight; if (!f || NAV.flightT !== NAV.t) return null;
  const dist = f.dist !== undefined ? ' · ' + fm(f.dist) + ' m' : '';
  switch (f.mode) {
    case 'BURN': return 'MAIN ENGINE ' + Math.round(inp.thr * 100) + '% · ' + mps(f.v) + dist + (f.detour ? ' · detour' : '');
    case 'RETRO': return 'RETRO BURN · shedding ' + mps(f.rv) + dist;
    case 'FLIP': return 'FLIP — swinging the nose retrograde · ' + mps(f.v);
    case 'TURN': return 'slewing onto the burn vector · ' + mps(f.v);
    case 'RCS': return 'RCS translation · ' + mps(f.v) + dist;
    default: return f.v > 6 ? 'COASTING · ' + mps(f.v) + dist + ' · engines cold' : 'station-keeping · Δv ' + f.rv.toFixed(2);
  }
}

// ─── generator helpers ───────────────────────────────────────────────────
function* wait(s, fn) { for (let t = 0; t < s; t += NAV.dt) { fn && fn(t); yield; } }
function* until(cond, s, fn) { for (let t = 0; t < s; t += NAV.dt) { if (cond()) return true; fn && fn(t); yield; } return cond(); }
const hold = () => { rcsVel(0, 0); inp.rx = cl(-pl.va * 1.8, -1, 1); };
function* tab(t) {
  const b = document.querySelector(`#stationO .tabs button[data-t="${t}"]`);
  if (!b) return;
  b.classList.add('aiPick'); yield* wait(0.35); b.click(); b.classList.remove('aiPick'); yield* wait(0.55);
}
/** highlight a UI button like a pointer would, then press it */
function* clickUI(sel, pause = 0.7) {
  const b = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!b || b.disabled) return false;
  b.classList.add('aiPick'); yield* wait(pause * 0.6); b.click(); b.classList.remove('aiPick'); yield* wait(pause * 0.4);
  return true;
}
function* flashUI(sel, pause = 0.5) { const b = document.querySelector(sel); if (b) { b.classList.add('aiPick'); yield* wait(pause); b.classList.remove('aiPick'); } }
const stationOpen = () => $('stationO').classList.contains('on');

// ─── world queries ───────────────────────────────────────────────────────
/** any non-hostile hull in our gun line closer than the target? (checks a short cone along the nose) */
function friendlyInLine(t, range) {
  const fx = Math.cos(pl.a), fy = Math.sin(pl.a);
  for (const s of W.ships) {
    if (s === pl || s === t || s.dead || (s.ag && s.ag.role === 'pirate') || s.fac === 'kings') continue;
    const dx = s.x - pl.x, dy = s.y - pl.y, along = dx * fx + dy * fy;
    if (along < 0 || along > range + 60) continue;
    if (Math.abs(dx * fy - dy * fx) < s.rad + 10) return true;
  }
  return false;
}
const liveAg = role => AG.filter(a => a.alive && a.ship && !a.ship.dead && a.role === role);
const pirates = () => liveAg('pirate');
function threat() {
  let best = null, bd = 1e9;
  for (const a of pirates()) {
    const d = ds(a.ship, pl);
    if ((a.tgt && a.tgt.ship === pl && d < 950) || d < 420) if (d < bd) { bd = d; best = a; }
  }
  return best;
}
const cargoFrac = () => cmass(pl) / pl.cargoMax;
const cargoValue = () => { let v = 0; for (const g in pl.cargo) v += pl.cargo[g] * GD[g].p; return v; };
function picksIn(b) {
  return W.picks.filter(p => !p.dead && !p.held && p.type !== 'pod' && hy(p.x - b.x, p.y - b.y) < b.rad && (() => { const c = ca(b, p.x, p.y); return c && !b.sol[c.i] && b.flr[c.i]; })());
}
function nearestStation(f) {
  let best = null, bd = 1e9;
  for (const s of W.stations) { if (s.dead || (f && !f(s))) continue; const d = ds(s, pl); if (d < bd) { bd = d; best = s; } }
  return best;
}
const stationBy = type => W.stations.find(s => s.type === type && !s.dead) || nearestStation();

/** goods to hold back when selling at `st` */
function keepList(st) {
  const k = {};
  for (const j of G.missions) if (j.type !== 'bounty' && j.to !== st.name) k[j.good] = (k[j.good] || 0) + j.qty;
  if (G.story === 2 && !G.prog.crys && st.type !== 'anchor') k.crys = Math.max(k.crys || 0, 1);
  if (G.story === 1 && st.type !== 'industrial') k.fe = Math.max(k.fe || 0, 99);
  return k;
}

// ═══ ACTS ═══════════════════════════════════════════════════════════════
function* leaveDock() {
  if (!pl.dock) return;
  if (pl.dock.ty === 'anchor') {
    if (ev) yield* returnToShip(pl.dock.b);
    say('Releasing the harpoon.'); yield* flashUI('#alt', 0.4); press('alt'); yield* wait(0.3);
  } else {
    const d = pl.dock, w = portW(d.b, d.p);
    if (!stationOpen()) { press('ctx'); yield* wait(0.8); }
    say('Clamps open — undocking from ' + d.b.name + '.');
    yield* clickUI('#undock', 0.8);
    const dir = w.dir;
    yield* wait(2.6, () => { const pw = portW(d.b, d.p); rcsVel(pw.vx + Math.cos(dir) * 9, pw.vy + Math.sin(dir) * 9); faceTo(d.ty === 'pad' ? pw.dir + Math.PI / 2 : pw.dir + Math.PI, pw.va || 0); });
    if (pl.gear) { press('gear'); yield* wait(0.2); }
  }
}

/** pick a reachable, free port or pad; pads ~40% for variety */
function chooseBerth(st, preferPad) {
  const opts = [];
  for (const p of st.ports) if (!p.occ && !p.berth && (!st.ring || p.ring) && portReachable(st, p)) opts.push({ p, ty: 'port' });
  if (!st.ring) for (const p of st.pads) if (!p.occ && portReachable(st, p)) opts.push({ p, ty: 'pad' });
  if (!opts.length) for (const p of st.ports) if (!p.occ && (!st.ring || p.ring) && portReachable(st, p)) opts.push({ p, ty: 'port' });
  if (!opts.length) return null;
  const pads = opts.filter(o => o.ty === 'pad'), ports = opts.filter(o => o.ty === 'port');
  const pool = (preferPad ?? Math.random() < 0.4) && pads.length ? pads : ports.length ? ports : pads;
  pool.sort((a, b) => ds(portW(st, a.p), pl) - ds(portW(st, b.p), pl));
  return pool[0];
}

function* dockAt(st, preferPad) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const bt = chooseBerth(st, preferPad);
    if (!bt) { say(st.name + ' has no free berth — holding.'); yield* wait(4, hold); continue; }
    const { p, ty } = bt, off = ty === 'pad' ? pl.belly : pl.nose, L = 58;
    const label = ty === 'pad' ? 'landing pad' : p.ring ? 'ring port (rotating)' : 'clamp port';
    say('Inbound to ' + st.name + ' · ' + label + '.');
    const A = () => { const w = portW(st, p), x = w.x + Math.cos(w.dir) * (L + off), y = w.y + Math.sin(w.dir) * (L + off), v = st.ring && p.ring ? rideVel(st, x, y, st.ring.spin) : rideVel(st, x, y); return { x, y, vx: v.x, vy: v.y }; };
    const want = () => { const w = portW(st, p); return ty === 'pad' ? w.dir + Math.PI / 2 : w.dir + Math.PI; };
    const ok = yield* travel(A, { arrive: 14, vtol: 3.5, face: () => (hy(A().x - pl.x, A().y - pl.y) < 160 ? want() : undefined), timeout: 160 });
    if (!ok) continue;
    if (ty === 'pad' && !pl.gear) { say('Deploying mag-gear for the pad.'); yield* flashUI('#gear', 0.3); press('gear'); }
    AP.zoomK = 1.35;
    say(p.ring ? 'Matching the ring: ' + (st.ring.spin * p.r).toFixed(1) + ' m/s tangential, spin ' + st.ring.spin.toFixed(2) + ' rad/s.' : ty === 'pad' ? 'Belly to the pad — settle under 1.8 m/s.' : st.va ? 'Station is spinning — tracking the port as it turns.' : 'Nose on the port — four gates to green.');
    let t = 0, okc = 0;
    while (t < 45) {
      t += NAV.dt;
      if (p.occ && p.occ !== pl) break;
      const r = approachPort(st, p, ty, gates);
      const g = r.g;
      AP.sub = 'SPD ' + g.rv.toFixed(1) + (g.v ? '✓' : '✕') + ' · ANG ' + Math.round((g.ae * 180) / Math.PI) + '°' + (g.a ? '✓' : '✕') + ' · LAT ' + g.lat.toFixed(1) + (g.l ? '✓' : '✕') + ' · ROT ' + g.re.toFixed(2) + (g.r ? '✓' : '✕') + ' · ' + g.d.toFixed(0) + 'm';
      NAV.flight = null;
      okc = g.ok ? okc + NAV.dt : 0;
      if (okc > 0.18) {
        say('ALL GATES GREEN — ' + (ty === 'pad' ? 'LAND.' : 'CLAMP.'));
        yield* flashUI('#ctx', 0.12);
        if (PC.assist && PC.assist.p === p && PC.ctx.k === 'clamp') { press('ctx'); yield; yield; }
        if (!pl.dock && gates(pl, portW(st, p), ty).ok && !p.occ) dock(pl, st, p, ty);
        yield;
        if (pl.dock) { AP.zoomK = 1.1; return true; }
      }
      if (r.along < -4 || hy(pl.x - r.w.x, pl.y - r.w.y) > 150) break;
      yield;
    }
    say('Approach unstable — going around.');
    yield* wait(2.4, () => { const w = portW(st, p); rcsVel(w.vx + Math.cos(w.dir) * 10, w.vy + Math.sin(w.dir) * 10); });
  }
  return false;
}

function* visit(st, why) {
  st = st && !st.dead ? st : nearestStation();
  if (!st) { yield* flyby(); return; }
  AP.why = st.name + ':' + why;
  actTitle('STATION RUN · ' + st.name);
  say('Setting course for ' + st.name + ' — ' + why + '.');
  setTgt(st);
  if (pl.dock && pl.dock.b === st && pl.dock.ty !== 'anchor') { /* already here */ }
  else {
    yield* leaveDock();
    if (!(yield* dockAt(st))) return;
  }
  yield* business(st, why);
  yield* leaveDock();
}

function* business(st, why) {
  actTitle('DOCKED · ' + st.name);
  AP.lastSt = st;
  yield* wait(0.7, hold);
  if (!stationOpen()) { say('Opening station services.'); press('ctx'); yield* wait(0.9); }
  if (!stationOpen()) return;
  // ── market: sell
  yield* tab('market');
  const fpN = (pl.fuelMax - pl.fuel) * cl(price(st, 'fuel'), 3, 9);
  const keep = pl.credits < fpN + 150 && pl.fuel < pl.fuelMax * 0.5 ? {} : keepList(st); // broke and dry: everything goes
  const sell = Object.keys(pl.cargo).filter(g => (pl.cargo[g] || 0) - (keep[g] || 0) > 0).sort((a, b) => price(st, b) - price(st, a));
  if (sell.length) say('Selling the hold at ' + st.name + '.');
  for (const g of sell) {
    const n = (pl.cargo[g] || 0) - (keep[g] || 0);
    if (n <= 0) continue;
    yield* flashUI(`#pBody button[data-a="sell"][data-g="${g}"]`, 0.45);
    trade(st, g, n, false); panel(); hudDOM();
    AP.sub = 'SOLD ' + n + ' ' + GD[g].n + ' @ ' + price(st, g) + '₡';
    yield* wait(0.5);
  }
  // ── contracts & speculation
  yield* contracts(st);
  yield* speculate(st);
  // ── services
  yield* tab('service');
  const svc = () => G.svc || [];
  const clickSvc = function* (k, msg) { const i = svc().findIndex(s => s.k === k); if (i < 0) return false; say(msg); return yield* clickUI(`#pBody button[data-a="svc"][data-i="${i}"]`, 0.8); };
  if (pl.fuel < pl.fuelMax * 0.92) yield* clickSvc('fuel', 'Topping off reaction mass.');
  if (integ(pl) < 0.97 && st.svc.repair && pl.credits >= repairCost()) yield* clickSvc('repair', 'Patching the hull — every module back to spec.');
  if (st.svc.upg) {
    const order = G.story <= 2 ? ['laser', 'cargo', 'eng', 'gun', 'armor', 'scan', 'fuel'] : ['gun', 'armor', 'laser', 'cargo', 'eng', 'fuel', 'scan'];
    for (const k of order) {
      const lv = pl.upg[k] || 0; if (lv >= 3) continue;
      const c = upgCost(k, lv), reserve = G.story >= 4 ? 2500 : 700;
      if (pl.credits - c > reserve) { yield* clickSvc('upg:' + k, 'Investing in an upgrade: ' + k.toUpperCase() + ' MK' + (lv + 1) + '.'); break; }
    }
  }
  if (st.svc.debt && G.debt > 0) {
    if (pl.credits >= G.debt + 300) yield* clickSvc('debtAll', 'Clearing the ledger. All of it.');
    else if (pl.credits >= 5600) yield* clickSvc('debt', 'Wiring 5,000₡ to Keres Mutual — ' + fm(G.debt) + '₡ to go.');
  }
  // ── bar
  if (Math.random() < 0.45 || why === 'rumours') yield* bar(st);
  yield* wait(0.6);
}

function* contracts(st) {
  const jobs = (G.jobs[st.name] || []).filter(j => !G.missions.some(m => m.id === j.id));
  if (G.missions.length >= 2 || !jobs.length || Math.random() < 0.35) return;
  let pick = null;
  for (const j of jobs) {
    if (j.type === 'bounty' && integ(pl) > 0.7 && alive(pl, 'gun').length) { pick = j; break; }
    if (j.type === 'mine' && j.qty <= 16) { pick = j; break; }
    if (j.type === 'deliver' && st.econ[j.good] && st.econ[j.good].stock > j.qty + 4 && price(st, j.good) * j.qty < pl.credits * 0.45 && j.qty <= pl.cargoMax - cmass(pl)) { pick = j; break; }
  }
  if (!pick) return;
  yield* tab('jobs');
  say('Reading the contract board — signing ' + pick.title + '.');
    yield* flashUI(`#pBody button[data-a="accept"][data-id="${pick.id}"]`, 0.6);
  accept(pick, true); panel();
  yield* wait(0.6);
  if (pick.type === 'deliver') {
    yield* tab('market');
    yield* flashUI(`#pBody button[data-a="buy"][data-g="${pick.good}"]`, 0.4);
    trade(st, pick.good, pick.qty, true); panel(); hudDOM();
    yield* wait(0.5);
  }
}

function* speculate(st) {
  if (G.story === 1 || pl.credits < 600 || NAV.t - (AP.specT ?? -1e9) < 240) return;
  let best = null;
  for (const g of ['fe', 'ice', 'food', 'fuel', 'parts', 'au']) {
    const e = st.econ[g]; if (!e || e.stock < 12) continue;
    const p = price(st, g), s2 = bestSell(g, st); if (!s2) continue;
    const m = price(s2, g) - p, room = Math.floor(Math.min(pl.cargoMax - cmass(pl) - 2, (pl.credits * 0.4) / p, e.stock - 6));
    if (room >= 4 && m / p > 0.45 && m * Math.min(room, 24) > 150 && (!best || m * room > best.gain)) best = { g, s2, q: Math.min(room, 24), gain: m * room, p };
  }
  if (!best) return;
  say('Spread spotted: ' + GD[best.g].n + ' ' + best.p + '₡ here, ' + price(best.s2, best.g) + '₡ at ' + best.s2.name + '. Buying ' + best.q + '.');
  yield* tab('market');
  yield* flashUI(`#pBody button[data-a="buy"][data-g="${best.g}"]`, 0.5);
  trade(st, best.g, best.q, true); panel(); hudDOM();
  AP.specT = NAV.t;
  AP.plan = { st: best.s2, why: 'selling ' + GD[best.g].n + ' for the spread' };
  yield* wait(0.6);
}

function* bar(st) {
  yield* tab('bar');
  const btn = document.querySelector('#pBody button[data-a="talk"]');
  if (!btn) { say('Quiet shift at the bar.'); yield* wait(1.2); return; }
  say('Buying a round at the bar — ears open.');
  yield* clickUI(btn, 0.8);
  if (!$('dialogO').classList.contains('on')) return;
  yield* wait(1.6);
  const ch = [...document.querySelectorAll('#dCh button')];
  const rum = ch.find(b => /Rumors/.test(b.textContent)) || ch.find(b => /Sell contraband/.test(b.textContent));
  if (rum) { yield* clickUI(rum, 0.8); yield* wait(2.6); }
  const leave = [...document.querySelectorAll('#dCh button')].find(b => /Leave/.test(b.textContent));
  if (leave) yield* clickUI(leave, 0.6); else closeDialog();
}

// ─── mining ──────────────────────────────────────────────────────────────
const ORE_MATS = { fe: [4], ice: [3], au: [5], crys: [6], any: [3, 4, 5, 6] };
/** best ore cell: shallow, close, matching the wanted ore */
function oreTarget(rock, want) {
  const mats = ORE_MATS[want] || ORE_MATS.any, gw = rock.gw;
  let best = null, bs = 1e9;
  for (let k = 0; k < 500; k++) {
    const i = (Math.random() * rock.sol.length) | 0, m = rock.sol[i];
    if (!mats.includes(m)) continue;
    const cx = i % gw, cy = (i / gw) | 0, w = cw(rock, cx, cy), ux = pl.x - w.x, uy = pl.y - w.y, L = hy(ux, uy) || 1;
    // depth: solid cells between the ore and open space toward the ship
    let depth = 0, exit = null;
    for (let s = 3; s < 160; s += 3) {
      const c = ca(rock, w.x + (ux / L) * s, w.y + (uy / L) * s);
      if (!c) { exit = s; break; }
      if (rock.sol[c.i]) depth++; else if (!exit && depth > 0 && !rock.sol[c.i]) { /* cavity */ }
    }
    if (exit === null) continue;
    const sc = depth * 4 + L / 60;
    if (sc < bs) { bs = sc; best = { cx, cy, w, ux: ux / L, uy: uy / L, depth, m }; }
  }
  return best;
}
function standoff(rock, t, dist) {
  // walk outward from the ore cell until clear of rock, then back off `dist`
  let s = 3;
  for (; s < 200; s += 3) { const c = ca(rock, t.w.x + t.ux * s, t.w.y + t.uy * s); if (!c || !rock.sol[c.i] && s > 12 && !solidNear(rock, t.w.x + t.ux * s, t.w.y + t.uy * s)) break; }
  return { x: t.w.x + t.ux * (s + dist), y: t.w.y + t.uy * (s + dist), surf: s };
}
function solidNear(b, x, y) { for (const [ox, oy] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) { const c = ca(b, x + ox, y + oy); if (c && b.sol[c.i]) return true; } return false; }

function chooseRock(want) {
  let best = null, bs = 1e9;
  for (const r of W.rocks) {
    if (r.R < 9 || AP.depleted.has(r) || r.dead) continue;
    const d = ds(r, pl), wantIce = want === 'ice';
    let sc = d + (wantIce && r.type !== 'ice' ? 2500 : 0) + (want === 'fe' ? (r.type === 'metal' ? -900 : r.type === 'ice' ? 2500 : 0) : 0) + (want === 'any' && r.type === 'ice' ? 700 : 0) + (r.veinOn && (want === 'au' || want === 'any') ? -900 : 0);
    if (AP.visited.has(r.name)) sc += 400;
    if (sc < bs) { bs = sc; best = r; }
  }
  return best;
}

function* mine(want = 'any', target = 0) {
  const rock = chooseRock(want); if (!rock) return;
  AP.visited.add(rock.name);
  const goal = target || Math.min(pl.cargoMax - 2, cmass(pl) + 18);
  actTitle('MINING · ' + rock.name + (want !== 'any' ? ' · ' + (GD[want] ? GD[want].n : want) : ''));
  say('Prospecting ' + rock.name + ' (' + rock.type + ', ' + Math.round(rock.R * C.CS * 2) + ' m).');
  setTgt(rock);
  yield* leaveDock();
  let first = true, t0 = NAV.t, tgtOre = null;
  while (NAV.t - t0 < 85 && cmass(pl) < goal && pl.fuel > pl.fuelMax * 0.32) {
    tgtOre = oreTarget(rock, want === 'any' ? 'any' : want) || oreTarget(rock, 'any');
    if (!tgtOre) { say(rock.name + ' is cut out.'); AP.depleted.add(rock); break; }
    const so = standoff(rock, tgtOre, first ? pl.rad + 3 : 38), aim = () => Math.atan2(tgtOre.w.y - pl.y, tgtOre.w.x - pl.x);
    const far = { x: tgtOre.w.x + tgtOre.ux * (so.surf + 60), y: tgtOre.w.y + tgtOre.uy * (so.surf + 60) };
    yield* travel(fixed(far.x, far.y), { arrive: 30, vtol: 4, timeout: 120 });
    AP.zoomK = 1.15;
    if (first) {
      // harpoon pass: settle against the face and lock on
      say('Easing in to harpoon the face — under 3 m/s.');
      const ok = yield* until(() => { const a = anchCand(); const v = { x: rock.vx || 0, y: rock.vy || 0 }; /* tryAnchor judges linear velocity only */ return a && !a.ship && a.d < C.ANCH.d && hy(pl.vx - v.x, pl.vy - v.y) < 2.4 && Math.abs(ad(aim(), pl.a)) < 0.2; }, 14,
        () => {
          const a = anchCand();
          if (a && !a.ship && a.d < C.ANCH.d - 3) { const v = { x: rock.vx || 0, y: rock.vy || 0 }; /* tryAnchor judges linear velocity only */ rcsVel(v.x, v.y); faceTo(aim()); return; } // in reach: stop pushing, just match the rock
          fly(so.x, so.y, { vmax: 6, rcsOnly: true, face: aim() });
        });
      if (ok) { yield* flashUI('#ctx', 0.25); press('ctx'); yield* wait(0.4); }
      first = false;
      if (pl.dock && pl.dock.ty === 'anchor') {
        say('Harpoon set. Laser on — cutting a straight shaft into ' + (MAT[tgtOre.m].ore || 'rock') + '.');
        yield* wait(9, t => { inp.mine = true; AP.sub = 'LASER ' + pl.lasD.toFixed(0) + ' dps · hold ' + cmass(pl).toFixed(0) + '/' + pl.cargoMax; if (!pl.dock) inp.mine = false; });
        if (pl.dock) yield* leaveDock();
        yield* sweep(rock, 60);
        continue;
      }
    }
    // hover-mining with a sweeping beam
    say('Hover-cutting the ' + (GD[MAT[tgtOre.m].ore] ? GD[MAT[tgtOre.m].ore].n : 'seam') + ' — beam sweeping to widen the cut.');
    const t1 = NAV.t;
    while (NAV.t - t1 < 14 && rock.sol[tgtOre.cy * rock.gw + tgtOre.cx]) {
      const r = fly(so.x, so.y, { vmax: 8, rcsOnly: true, face: aim() + Math.sin(NAV.t * 1.7) * 0.07 });
      if (r.d < 14 && Math.abs(ad(aim(), pl.a)) < 0.2) inp.mine = true;
      AP.sub = 'LASER ' + pl.lasD.toFixed(0) + ' dps · ore ' + (tgtOre.depth ? tgtOre.depth + ' cells deep' : 'exposed') + ' · hold ' + cmass(pl).toFixed(0) + '/' + pl.cargoMax;
      NAV.flight = null;
      yield;
    }
    yield* sweep(rock, 70);
  }
  say('Mining run done — ' + cmass(pl).toFixed(0) + ' / ' + pl.cargoMax + ' in the hold.');
}
/** scoop loose ore floating near a body */
function* sweep(b, r) {
  for (let k = 0; k < 6; k++) {
    let best = null, bd = r + b.rad;
    for (const p of W.picks) {
      if (p.dead || p.held) continue;
      const d = hy(p.x - pl.x, p.y - pl.y);
      if (d < bd && hy(p.x - b.x, p.y - b.y) < b.rad + r && !segBlock(pl.x, pl.y, p.x, p.y, 6)) { bd = d; best = p; }
    }
    if (!best || cmass(pl) >= pl.cargoMax - 1) return;
    say('Scooping loose ' + (GD[best.type] ? GD[best.type].n : 'cargo') + '.');
    const p = best;
    yield* travel(() => (p.dead ? null : { x: p.x, y: p.y, vx: p.vx, vy: p.vy }), { arrive: 5, vtol: 8, timeout: 9, vmax: 22, rcsOnly: true, noWarp: true, patience: 4 });
  }
}

// ─── scanning ────────────────────────────────────────────────────────────
function chooseContact() {
  const L = W.contacts.filter(c => !c.done && c.kind !== 'beacon');
  if (!L.length) return null;
  if (W.lastRumor && !W.lastRumor.done) return W.lastRumor;
  L.sort((a, b) => ds(a, pl) - ds(b, pl));
  return L[0];
}
function* scan(c) {
  if (!c) return;
  actTitle('ARRAY · ' + c.b.name);
  say('Chasing a ' + (W.lastRumor === c ? 'bar rumour' : 'seismic echo') + ': ' + c.label + ' off ' + c.b.name + '.');
  setTgt(c.b);
  yield* leaveDock();
  const sr = Math.min(320, pl.scanR * 0.6);
  // vantage point in open space on our side of the contact
  const pick = () => {
    const out = Math.atan2(c.y - c.b.y, c.x - c.b.x), far = Math.max(sr * 0.7, (c.b.rad || 0) + 60);
    for (let k = 0; k < 16; k++) {
      const a = out + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35, x = c.x + Math.cos(a) * far, y = c.y + Math.sin(a) * far;
      if (x < 120 || y < 120 || x > C.W - 120 || y > C.H - 120) continue;
      if (!segBlock(x - 1, y, x + 1, y, pl.rad + 14) && hy(x - c.x, y - c.y) < pl.scanR * 0.85) return { x, y };
    }
    return { x: c.x + Math.cos(out) * far, y: c.y + Math.sin(out) * far };
  };
  const vp = pick();
  yield* travel(fixed(vp.x, vp.y), { arrive: 30, vtol: 2.5, timeout: 140 });
  AP.zoomK = 0.95;
  const face = () => Math.atan2(c.y - pl.y, c.x - pl.x);
  yield* wait(1.2, () => { fly(vp.x, vp.y, { face: face(), vmax: 5, rcsOnly: true }); });
  say('Array live. Sweeping the dial for a resonance.');
  yield* flashUI('#scanB', 0.3); press('scan'); yield;
  let dir = PC.freq < 110 ? 1 : -1, t = 0, found = false;
  const sl = $('freq');
  while (t < 34 && !c.done) {
    t += NAV.dt;
    fly(vp.x, vp.y, { face: face(), vmax: 4, rcsOnly: true });
    NAV.flight = null;
    const mine = PC.list.find(s => s.c === c);
    if (!found) {
      PC.freq += dir * 30 * NAV.dt;
      if (PC.freq > 199) dir = -1; if (PC.freq < 21) dir = 1;
      if (mine && mine.s > 0.12) { found = true; say('Resonance! Tracking the drift — hold the lock.'); }
      AP.sub = 'SWEEP ' + PC.freq.toFixed(1) + ' kHz · signal ' + Math.round(PC.sig * 100) + '%';
    } else {
      const f = contactFreq(c), e = f - PC.freq;
      PC.freq += cl(e, -7 * NAV.dt, 7 * NAV.dt) + (Math.random() - 0.5) * 0.25;
      AP.sub = 'TRACK ' + PC.freq.toFixed(1) + ' kHz → ' + f.toFixed(1) + ' · lock ' + Math.round(PC.lock * 100) + '%';
      if (Math.abs(e) > 6) found = false;
    }
    PC.freq = cl(PC.freq, 20, 200); sl.value = PC.freq;
    yield;
  }
  if (PC.scan) press('scan');
  yield;
  if (!c.done) { say('Lost it in the noise. Logging the bearing for later.'); c.f = rr(Math.random, 30, 190); return; }
  // follow-up
  if (c.kind === 'void' || c.kind === 'signal' || (c.kind === 'cache' && c.b.kind === 'rock')) {
    const ch = c.b.cham.find(q => q.disc && !q.open) || c.b.cham.find(q => hy(cw(c.b, q.cx, q.cy).x - c.x, cw(c.b, q.cx, q.cy).y - c.y) < 12);
    if (ch) yield* breakIn(c.b, ch);
  } else if (c.kind === 'vein') yield* mine('au', Math.min(pl.cargoMax - 2, cmass(pl) + 10));
  else if (c.kind === 'cache' && c.b.kind === 'hulk') yield* breach(c.b);
}

/** laser a shaft into a sealed chamber, then go in on foot */
function* breakIn(rock, ch) {
  actTitle('BREAK-IN · ' + rock.name);
  const cwp = () => cw(rock, ch.cx, ch.cy);
  const tgt = { cx: ch.cx, cy: ch.cy, w: cwp() };
  const ux = pl.x - tgt.w.x, uy = pl.y - tgt.w.y, L = hy(ux, uy) || 1;
  tgt.ux = ux / L; tgt.uy = uy / L;
  const so = standoff(rock, tgt, 30);
  if (hy(so.x - tgt.w.x, so.y - tgt.w.y) > pl.lasR + 25) { say('Chamber sits too deep for the laser — logging it.'); return; }
  say('Cutting a shaft toward the sealed ' + ch.biome + ' chamber.');
  yield* travel(fixed(so.x, so.y), { arrive: 16, vtol: 2.5, timeout: 90 });
  let t = 0;
  const clear = () => !segBlock(pl.x + Math.cos(pl.a) * pl.nose, pl.y + Math.sin(pl.a) * pl.nose, tgt.w.x, tgt.w.y, 3.2);
  while (t < 55 && !clear()) {
    t += NAV.dt;
    const aim = Math.atan2(tgt.w.y - pl.y, tgt.w.x - pl.x) + Math.sin(NAV.t * 2.1) * 0.05;
    const r = fly(so.x, so.y, { vmax: 6, rcsOnly: true, face: aim });
    if (r.d < 12) inp.mine = true;
    AP.sub = 'SHAFT ' + Math.round((t / 55) * 100) + '% · ' + pl.lasD.toFixed(0) + ' dps'; NAV.flight = null;
    yield;
  }
  if (!clear()) { say('Rock is too dense — leaving the shaft half-cut.'); return; }
  ch.open = true;
  say('Breakthrough! The chamber is open to vacuum.');
  yield* wait(1);
  yield* cave(rock, ch);
}

/** anchor at a rock and explore a chamber in the suit */
function* cave(rock, ch) {
  const loot = () => W.picks.filter(p => !p.dead && !p.held && p.type !== 'pod' && hy(p.x - cw(rock, ch.cx, ch.cy).x, p.y - cw(rock, ch.cx, ch.cy).y) < ch.r * C.CS + 25);
  if (!loot().length) { say('Chamber is empty. Pretty, though.'); return; }
  actTitle('CAVE EVA · ' + rock.name);
  setTgt(rock);
  // find the mouth: nearest open-space cell on a suit path out of the chamber
  const c = cw(rock, ch.cx, ch.cy), out = { x: rock.x + (c.x - rock.x) / (hy(c.x - rock.x, c.y - rock.y) || 1) * (rock.rad + 30), y: rock.y + (c.y - rock.y) / (hy(c.x - rock.x, c.y - rock.y) || 1) * (rock.rad + 30) };
  const path = evaPath(rock, c.x, c.y, out.x, out.y);
  if (!path) { say('No way in for a suit.'); return; }
  let mcell = null;
  for (const cell of path) { const i = cell[1] * rock.gw + cell[0]; if (!rock.flr[i]) { mcell = cell; break; } }
  mcell = mcell || path[path.length - 1];
  // harpoon a solid surface cell a few metres to the side of the mouth (same approach as a mining pass)
  const onPath = new Set(path.map(c => c[1] * rock.gw + c[0]));
  let pick = null, ps = 1e9;
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
    const cx = mcell[0] + dx, cy = mcell[1] + dy, i = cy * rock.gw + cx;
    if (cx < 1 || cy < 1 || cx >= rock.gw - 1 || cy >= rock.gh - 1 || !rock.sol[i] || onPath.has(i)) continue;
    let nx = 0, ny = 0;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const x = cx + ox, y = cy + oy; if (x < 0 || y < 0 || x >= rock.gw || y >= rock.gh) { nx += ox; ny += oy; continue; } const j = y * rock.gw + x; if (!rock.sol[j]) { nx += ox; ny += oy; } }
    if (!nx && !ny) continue;
    const dd = hy(dx, dy), sc = Math.abs(dd - 4);
    if (sc < ps) { ps = sc; const L = hy(nx, ny); pick = { cx, cy, nx: nx / L, ny: ny / L }; }
  }
  if (!pick) { say('Cave mouth is all loose scree — no harpoon point.'); return; }
  const tgt = () => { const w = cw(rock, pick.cx, pick.cy), c = Math.cos(rock.a), sn = Math.sin(rock.a); return { w, ux: pick.nx * c - pick.ny * sn, uy: pick.nx * sn + pick.ny * c }; };
  say('Parking beside the cave mouth.');
  yield* travel(() => { const t = tgt(); return { x: t.w.x + t.ux * (pl.rad + 55), y: t.w.y + t.uy * (pl.rad + 55), vx: rock.vx || 0, vy: rock.vy || 0 }; }, { arrive: 25, vtol: 4, timeout: 100 });
  const aimC = () => { const w = tgt().w; return Math.atan2(w.y - pl.y, w.x - pl.x); };
  const ok = yield* until(() => { const a = anchCand(); const v = { x: rock.vx || 0, y: rock.vy || 0 }; return a && !a.ship && a.b === rock && a.d < C.ANCH.d && hy(pl.vx - v.x, pl.vy - v.y) < 2.4; }, 22,
    () => {
      const a = anchCand();
      if (a && !a.ship && a.b === rock && a.d < C.ANCH.d - 3) { rcsVel(rock.vx || 0, rock.vy || 0); faceTo(aimC()); return; }
      const t = tgt();
      fly(t.w.x + t.ux * (pl.rad + 4), t.w.y + t.uy * (pl.rad + 4), { tvx: rock.vx || 0, tvy: rock.vy || 0, vmax: 6, rcsOnly: true, face: aimC() });
    });
  if (!ok) { say('Could not get a harpoon in — skipping the cave.'); return; }
  press('ctx'); yield* wait(0.5);
  if (!pl.dock) return;
  yield* evaLoot(rock, loot, 'cave');
  yield* leaveDock();
}

// ─── derelict breach ─────────────────────────────────────────────────────
function chooseHulk() {
  let best = null, bs = 1e9;
  for (const h of W.hulks) {
    const n = picksIn(h).length; if (!n) continue;
    const sc = ds(h, pl) - n * 300 + (AP.visited.has(h.name) ? 1500 : 0);
    if (sc < bs) { bs = sc; best = h; }
  }
  return best;
}
function* breach(h) {
  if (!h) return;
  AP.visited.add(h.name);
  actTitle('DERELICT · ' + h.name);
  say('Derelict ' + h.name + ' — ' + picksIn(h).length + ' cargo signatures in the dark hold.');
  setTgt(h);
  yield* leaveDock();
  // nearest outer hull plate
  let cell = null, bd = 1e9;
  for (let cy = 0; cy < h.gh; cy++) for (let cx = 0; cx < h.gw; cx++) {
    const i = cy * h.gw + cx; if (h.sol[i] !== 7) continue;
    const edge = cx === 0 || cy === 0 || cx === h.gw - 1 || cy === h.gh - 1 || !h.sol[i - 1] && !h.flr[i - 1] || !h.sol[i + 1] && !h.flr[i + 1] || !h.sol[i - h.gw] && !h.flr[i - h.gw] || !h.sol[i + h.gw] && !h.flr[i + h.gw];
    if (!edge) continue;
    const w = cw(h, cx, cy), d = hy(w.x - pl.x, w.y - pl.y);
    if (d < bd) { bd = d; cell = [cx, cy]; }
  }
  if (!cell) return;
  const plate = () => cw(h, cell[0], cell[1]);
  const norm = () => { const p = plate(), dx = p.x - h.x, dy = p.y - h.y, L = hy(dx, dy) || 1; return { x: dx / L, y: dy / L }; };
  const spot = k => { const p = plate(), n = norm(), x = p.x + n.x * k, y = p.y + n.y * k, v = bvel(h, x, y); return { x, y, vx: v.x, vy: v.y }; };
  yield* travel(() => spot(70), { arrive: 18, vtol: 3, timeout: 140 });
  AP.zoomK = 1.4;
  say('Matching the tumble — ' + (h.va * 57.3).toFixed(1) + '°/s — and closing on the hull.');
  const ok = yield* until(() => { const a = anchCand(); return a && a.b === h && a.d < C.ANCH.d && hy(pl.vx - h.vx, pl.vy - h.vy) < 2.2; }, 20, () => {
    const s = spot(pl.rad + 4), n = norm();
    fly(s.x, s.y, { tvx: s.vx, tvy: s.vy, vmax: 6, rcsOnly: true, face: Math.atan2(-n.y, -n.x), va: h.va });
  });
  if (!ok) { say('Too much tumble — breaking off.'); return; }
  yield* flashUI('#ctx', 0.3); press('ctx'); yield* wait(0.5);
  if (!pl.dock) return;
  say('Harpoon in. Setting the cutting charge.');
  yield* flashUI('#ctx', 0.4); press('ctx');
  yield* until(() => PC.breach && PC.breach.done, 5, () => { AP.sub = 'CUTTING ' + Math.round((PC.breach ? PC.breach.p : 0) * 100) + '%'; });
  yield* wait(0.8);
  yield* evaLoot(h, () => picksIn(h), 'hulk');
  yield* leaveDock();
}

/** suit up, fetch crates one at a time, come home */
function* evaLoot(b, lootFn, kind) {
  if (!pl.dock || ev) return;
  say(kind === 'hulk' ? 'Suiting up. Into the dark hold.' : 'Suiting up. Into the cave.');
  yield* flashUI('#ctx', 0.3);
  press('ctx'); yield* wait(0.4);
  if (!ev) { press('alt'); yield* wait(0.4); }
  if (!ev) return;
  AP.zoomK = 2.0;
  let trips = 0, pinged = false;
  while (ev && !ev.dead && trips < 3 && ev.suit > 42 && cmass(pl) < pl.cargoMax - 1) {
    const L = lootFn().filter(p => !p.held);
    if (!L.length) break;
    L.sort((a, c) => hy(a.x - ev.x, a.y - ev.y) - hy(c.x - ev.x, c.y - ev.y));
    const p = L[0];
    say('Jetpack to a ' + (GD[p.type] ? GD[p.type].n : 'crate') + ' — suit ' + Math.round(ev.suit) + '%.');
    const got = yield* evaGoto(b, () => (p.dead || p.held ? null : p), 4.5, 30, () => { if (!pinged && evaIn() === b) { pinged = true; press('scan'); say('Hand scanner pulse — valuables outlined.'); } });
    if (!ev) return;
    if (got && !p.held && !p.dead && hy(p.x - ev.x, p.y - ev.y) < 7) { press('ctx'); yield* wait(0.4); }
    if (!ev || !ev.carry) { trips++; continue; }
    say('Got it. Hauling the ' + (GD[ev.carry.type] ? GD[ev.carry.type].n : 'crate') + ' back to the KITE.');
    yield* returnToShip(b, true);
    trips++;
  }
  yield* returnToShip(b);
}
function* evaGoto(b, tgtFn, arrive, timeout, onStep) {
  let path = null, idx = 0, replan = 0, t = 0;
  while (ev && !ev.dead && t < timeout) {
    t += NAV.dt; replan -= NAV.dt;
    const T = tgtFn(); if (!T) return false;
    if (hy(T.x - ev.x, T.y - ev.y) < arrive) return true;
    if (replan <= 0 || !path) { replan = 1.4; path = evaPath(b, ev.x, ev.y, T.x, T.y); idx = 1; }
    let wp = T;
    if (path && idx < path.length) { wp = cellW(b, path[idx]); if (hy(wp.x - ev.x, wp.y - ev.y) < 3) idx++; }
    jetTo(wp.x, wp.y, b, 7);
    onStep && onStep();
    AP.sub = 'SUIT ' + Math.round(ev.suit) + '% · ' + hy(T.x - ev.x, T.y - ev.y).toFixed(0) + ' m to target';
    yield;
  }
  return false;
}
function* returnToShip(b, keepOut) {
  if (!ev) return;
  yield* evaGoto(b, () => pl, 9, 40);
  yield* until(() => !ev || evaHome(), 6, () => ev && jetTo(pl.x, pl.y, null, 5));
  yield* wait(0.5);
  if (keepOut && ev && !ev.carry) return;
  if (ev && evaHome()) { press('ctx'); yield* wait(0.3); }
  if (ev && !keepOut) { say('Back aboard.'); }
}

// ─── combat ──────────────────────────────────────────────────────────────
function lead(t) {
  const px = t.x - pl.x, py = t.y - pl.y, vx = t.vx - pl.vx, vy = t.vy - pl.vy, s = C.GUN.spd;
  const a = vx * vx + vy * vy - s * s, b = 2 * (px * vx + py * vy), c = px * px + py * py, disc = b * b - 4 * a * c;
  let tt = 0;
  if (disc >= 0) { const r = Math.sqrt(disc), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a); tt = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2, 0); }
  tt = cl(tt, 0, 2);
  return { a: Math.atan2(py + vy * tt, px + vx * tt), tt };
}
function* combat(a, why) {
  if (!a || !a.ship || a.ship.dead) return;
  const t = a.ship;
  actTitle('COMBAT · ' + t.name);
  say((why || 'Hunting') + ' — Void Kings ' + (a.boss ? 'WARLORD ' : 'raider ') + t.name + '.');
  setTgt(t);
  yield* leaveDock();
  let tt = 0, strafe = 1, swap = 3, hp0 = integ(pl), los = true, losT = 0;
  while (!t.dead && tt < 80) {
    tt += NAV.dt; swap -= NAV.dt; losT -= NAV.dt;
    const d = ds(t, pl);
    cam.aux = { x: t.x, y: t.y };
    AP.zoomK = cl(380 / (d + 120), 0.55, 1.2);
    if (integ(pl) < 0.33 && G.story !== 3 || integ(pl) < 0.22) { say('Hull at ' + Math.round(integ(pl) * 100) + '% — disengaging!'); cam.aux = null; AP.plan = { st: nearestStation(s => s.svc.repair), why: 'emergency repairs' }; return; }
    if (d > 2600) { say(t.name + ' slipped away.'); break; }
    if (pl.fuel < pl.fuelMax * 0.14) { say('Tanks nearly dry — breaking off before we end up drifting.'); cam.aux = null; AP.plan = { st: nearestStation(), why: 'reaction mass critical' }; return; }
    const L = lead(t);
    if (d > 430) {
      fly(t.x - Math.cos(L.a) * 200, t.y - Math.sin(L.a) * 200, { tvx: t.vx, tvy: t.vy, vmax: 80 });
      if (d < 700) faceTo(L.a);
      say('Closing on ' + t.name + ' — ' + Math.round(d) + ' m.');
    } else {
      if (swap <= 0) { swap = rr(Math.random, 2.5, 5); strafe = -strafe; }
      const ux = (t.x - pl.x) / d, uy = (t.y - pl.y) / d, vr = cl((d - 175) * 0.35, -22, 22), vt = 13 * strafe;
      rcsVel(t.vx + ux * vr - uy * vt, t.vy + uy * vr + ux * vt);
      const err = faceTo(L.a, 0, 3.2);
      if (losT <= 0) { losT = 0.3; los = !segBlock(pl.x, pl.y, t.x, t.y, 0); }
      if (d < 380 && err < 0.05 + 7 / d && los && !friendlyInLine(t, d)) inp.fire = true;
      if (d > 260 && err < 0.3) inp.thr = 0.35;
      say('Dogfight — ' + (inp.fire ? 'GUNS GUNS GUNS' : 'leading the target') + ' · ' + Math.round(d) + ' m · strafe ' + (strafe > 0 ? '◀' : '▶'),
        'target hull ' + Math.round(integ(t) * 100) + '% · lead ' + ((L.tt * 1000) | 0) + ' ms · own hull ' + Math.round(integ(pl) * 100) + '%');
      NAV.flight = null;
    }
    yield;
  }
  cam.aux = null;
  if (t.dead) {
    say('Splash — ' + t.name + ' is breaking up.');
    const kx = t.x, ky = t.y;
    yield* wait(1.3, () => { rcsVel(t.vx * 0.5, t.vy * 0.5); });
    yield* salvage(kx, ky, 'Scooping the spill' + (W.picks.some(p => p.type === 'pod' && hy(p.x - kx, p.y - ky) < 300) ? ' — escape pod first.' : '.'));
  }
}
function* salvage(x, y, msg) {
  say(msg);
  for (let k = 0; k < 8; k++) {
    let best = null, bd = 1e9;
    for (const p of W.picks) {
      if (p.dead || p.held || hy(p.x - x, p.y - y) > 380) continue;
      const d = hy(p.x - pl.x, p.y - pl.y) - (p.type === 'pod' ? 400 : 0);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best || (cmass(pl) >= pl.cargoMax - 1 && best.type !== 'pod')) return;
    const p = best;
    if (p.type === 'pod') say('Escape pod on the scope — pulling them in.');
    yield* travel(() => (p.dead ? null : { x: p.x, y: p.y, vx: p.vx, vy: p.vy }), { arrive: 4, vtol: 9, timeout: 14, vmax: 40, noWarp: true, patience: 5 });
  }
}

// ─── events ──────────────────────────────────────────────────────────────
function* rescue(bc) {
  const s = bc.ship; if (!s || s.dead) return;
  actTitle('SOS · ' + s.name);
  say('Answering the mayday from ' + s.name + ' — bearing ' + String(bearing(pl, s)).padStart(3, '0') + '.');
  setTgt(s);
  yield* leaveDock();
  const near = () => (s.dead ? null : { x: s.x + 45, y: s.y - 20, vx: s.vx, vy: s.vy });
  yield* travel(near, { arrive: 20, vtol: 3, timeout: 160 });
  say('Matching drift with the disabled hull — umbilical across, transferring reaction mass.');
  AP.zoomK = 1.3;
  yield* until(() => !bc.ag.distress || s.dead, 14, () => { const T = near(); if (T) fly(T.x, T.y, { tvx: T.vx, tvy: T.vy, vmax: 4, rcsOnly: true, face: Math.atan2(s.y - pl.y, s.x - pl.x) }); AP.sub = 'TRANSFER ' + Math.round(Math.min(1, bc.prog / 3) * 100) + '%'; NAV.flight = null; });
  if (!s.dead && !bc.ag.distress) { say(s.name + ' is under power again. Good deed logged.'); yield* wait(1.5, hold); }
}

function* flyby() {
  const st = pk(Math.random, W.stations.filter(s => !s.dead && (s.ring || s.va || s.type === 'anchor')));
  if (!st) return;
  actTitle('SCENIC PASS · ' + st.name);
  yield* leaveDock();
  const R0 = (st.ring ? st.ring.r : st.rad) + 140;
  say(st.ring ? 'Swinging past ' + st.name + ' — the habitat ring turns at ' + st.ring.spin.toFixed(2) + ' rad/s.' : st.va ? st.name + ' spins at ' + (st.va * 57.3).toFixed(1) + '°/s — smelter glow on the hull.' : 'A slow pass under ' + st.name + ', running lights on.');
  setTgt(st);
  const a0 = Math.atan2(pl.y - st.y, pl.x - st.x);
  yield* travel(fixed(st.x + Math.cos(a0) * R0, st.y + Math.sin(a0) * R0), { arrive: 60, vtol: 20, timeout: 120 });
  AP.zoomK = 0.72;
  let a = a0;
  for (let t = 0; t < 16; t += NAV.dt) {
    a += NAV.dt * 0.16;
    const x = st.x + Math.cos(a) * R0, y = st.y + Math.sin(a) * R0;
    fly(x, y, { tvx: -Math.sin(a) * R0 * 0.16, tvy: Math.cos(a) * R0 * 0.16, vmax: 40, face: Math.atan2(st.y - pl.y, st.x - pl.x) });
    NAV.flight = null; AP.sub = 'orbit ' + Math.round(R0) + ' m · ' + mps(hy(pl.vx, pl.vy));
    yield;
  }
}

function* stranded(why) {
  actTitle('STRANDED');
  say((why || 'Tanks dry.') + ' Calling the Keres Mutual recovery tow.');
  yield* wait(2.5, hold);
  AP.towing = true; AP.towT = 0; mode('pause');
  yield;
}

// ═══ PLANNER ════════════════════════════════════════════════════════════
function choose() {
  const pp = AP.plan; AP.plan = null;
  if (pl.fuel <= 0.5 && !pl.dock) return ['tow', stranded()];
  if (pp && pp.st && !pp.st.dead) return ['visit', visit(pp.st, pp.why)];
  // service needs
  if (pl.fuel < pl.fuelMax * 0.42 && pl.credits < 45 && cargoValue() < 80) return ['tow', stranded('Broke and running on fumes.')];
  if (pl.fuel < pl.fuelMax * 0.42) return ['visit', visit(nearestStation(), 'reaction mass is low')];
  if (integ(pl) < 0.55 || !engineOK()) return ['visit', visit(nearestStation(s => s.svc.repair), engineOK() ? 'hull needs patching' : 'main drive is down — limping in on RCS')];
  // ledger
  if (pl.credits >= Math.min(G.debt + 300, 5600) && G.debt > 0 && G.story >= 1) return ['visit', visit(stationBy('anchor'), 'paying down the ledger')];
  // story beats
  if (G.story === 0) return ['visit', visit(stationBy('anchor'), 'first clamp of the shift')];
  if (G.story === 1) {
    const need = 12 - (G.prog.ore || 0);
    if ((pl.cargo.fe || 0) >= need || cargoFrac() > 0.85) return ['visit', visit(stationBy('industrial'), 'Slagworks pays for ferrite')];
    return ['mine', mine('fe', Math.min(pl.cargoMax - 2, cmass(pl) + need + 4))];
  }
  // contracts in hand
  for (const j of G.missions) {
    const st = W.stations.find(s => s.name === j.to);
    if (j.type !== 'bounty' && (pl.cargo[j.good] || 0) >= j.qty && st && !st.dead) return ['visit', visit(st, 'delivering ' + j.title.toLowerCase())];
  }
  if (cargoFrac() > 0.75 || cargoValue() > 2600) {
    const top = Object.keys(pl.cargo).sort((a, b) => pl.cargo[b] * GD[b].p - pl.cargo[a] * GD[a].p)[0];
    return ['visit', visit(bestSell(top, AP.lastSt) || nearestStation(s => s !== AP.lastSt), 'hold is ' + Math.round(cargoFrac() * 100) + '% full')];
  }
  // contracts we signed: hunt the mark
  for (const j of G.missions) {
    if (j.type !== 'bounty') continue;
    const a = AG.find(x => x.id === j.tid && x.alive && x.ship && !x.ship.dead);
    if (a && integ(pl) > 0.6 && pl.fuel > pl.fuelMax * 0.5 && alive(pl, 'gun').length && ds(a.ship, pl) < 7000) return ['combat', combat(a, 'Collecting on the contract')];
  }
  // showcase director: nothing the sector offers should go unseen for long
  {
    const age = k => NAV.t - (AP.seen[k] ?? -1e9);
    const due = [];
    const h = chooseHulk(), cv = openCave(), c = chooseContact();
    if (h && age('breach') > 420 && ds(h, pl) < 5000) due.push([age('breach'), 'breach', () => breach(h)]);
    if (cv && age('cave') > 520) due.push([age('cave'), 'cave', () => caveTrip(cv)]);
    if (c && age('scan') > 360) due.push([age('scan'), 'scan', () => scan(c)]);
    if (due.length && NAV.t > 150) { due.sort((a, b) => b[0] - a[0]); return [due[0][1], due[0][2]()]; }
  }
  if (G.story === 2) {
    if (!G.prog.scan) { const c = chooseContact(); if (c) return ['scan', scan(c)]; }
    if (!G.prog.crys) {
      if ((pl.cargo.crys || 0) > 0) return ['visit', visit(stationBy('anchor'), 'delivering the resonant crystal')];
      const hub = W.stations.find(s => !s.dead && s.type !== 'anchor' && s.econ.crys && s.econ.crys.stock >= 1 && price(s, 'crys') < pl.credits - 150);
      if (hub && Math.random() < 0.5) { AP.plan = null; return ['visit', visitBuy(hub, 'crys', 1)]; }
      return ['mine', mine('crys', cmass(pl) + 3)];
    }
  }
  // world events
  const sos = W.beacons.find(b => b.kind === 'sos' && b.ag && b.ag.distress && ds(b, pl) < 3200);
  if (sos && integ(pl) > 0.5) return ['rescue', rescue(sos)];
  const pir = pl.fuel < pl.fuelMax * 0.45 ? null : pirates().filter(a => ds(a.ship, pl) < (G.story === 3 ? 6000 : 2600)).sort((a, b) => ds(a.ship, pl) - ds(b.ship, pl))[0];
  const raid = W.beacons.find(b => b.kind === 'raid');
  if (pir && integ(pl) > 0.6 && alive(pl, 'gun').length && (G.story === 3 || raid || Math.random() < 0.45)) return ['combat', combat(pir, G.story === 3 ? 'Earning our stripes' : raid ? 'Breaking the raid' : 'Hunting')];
  // variety
  const opts = [];
  const c = chooseContact(); if (c) opts.push(['scan', 2.2, () => scan(c)]);
  const h = chooseHulk(); if (h && ds(h, pl) < 4500) opts.push(['breach', 2.4, () => breach(h)]);
  const cv = openCave(); if (cv) opts.push(['cave', 1.6, () => caveTrip(cv)]);
  opts.push(['mine', 2.6, () => mine(Math.random() < 0.3 ? 'au' : 'any')]);
  opts.push(['flyby', 0.7, () => flyby()]);
  if (G.missions.some(j => j.type === 'mine')) { const j = G.missions.find(q => q.type === 'mine'); opts.push(['mine', 3, () => mine(j.good, Math.min(pl.cargoMax - 2, cmass(pl) + j.qty + 2))]); }
  let tot = 0;
  for (const o of opts) { if (AP.hist.slice(-2).includes(o[0])) o[1] *= 0.25; tot += o[1]; }
  let q = Math.random() * tot;
  for (const o of opts) { q -= o[1]; if (q <= 0) return [o[0], o[2]()]; }
  return ['mine', mine()];
}
function* visitBuy(st, g, n) {
  actTitle('STATION RUN · ' + st.name);
  say('Buying ' + GD[g].n + ' at ' + st.name + '.');
  yield* leaveDock();
  if (!(yield* dockAt(st))) return;
  yield* wait(0.6, hold);
  if (!stationOpen()) { press('ctx'); yield* wait(0.9); }
  yield* tab('market');
  yield* flashUI(`#pBody button[data-a="buy"][data-g="${g}"]`, 0.6);
  trade(st, g, n, true); panel(); hudDOM();
  yield* wait(0.8);
  yield* business(st, 'restock');
  AP.plan = { st: stationBy('anchor'), why: 'delivering the resonant crystal' };
  yield* leaveDock();
}
function openCave() {
  let best = null, bd = 1e9;
  for (const r of W.rocks) {
    if (AP.visited.has('cave:' + r.name) || ds(r, pl) > 4000) continue;
    for (const ch of r.cham) {
      if (!ch.open || ch.r < 5) continue;
      const c = cw(r, ch.cx, ch.cy);
      if (!W.picks.some(p => !p.dead && p.type !== 'pod' && hy(p.x - c.x, p.y - c.y) < ch.r * C.CS + 20)) continue;
      const d = ds(r, pl); if (d < bd) { bd = d; best = { r, ch }; }
    }
  }
  return best;
}
function* caveTrip(cv) {
  AP.visited.add('cave:' + cv.r.name);
  actTitle('CAVE · ' + cv.r.name);
  say('Open ' + cv.ch.biome + ' cave on ' + cv.r.name + ' — something glints inside.');
  yield* leaveDock();
  yield* cave(cv.r, cv.ch);
}

// ═══ RUNTIME ════════════════════════════════════════════════════════════
function interrupt() {
  if (!AP.task || ev || (pl.dock && pl.dock.ty !== 'anchor')) return;
  if (AP.task.name === 'combat' || AP.task.name === 'tow') return;
  const th = threat();
  if (th && integ(pl) > 0.35 && alive(pl, 'gun').length && pl.fuel > pl.fuelMax * 0.25) {
    if (pl.dock) return;
    setTask('combat', combat(th, 'Bandit on our six'));
  } else if (th && (integ(pl) <= 0.35 || pl.fuel <= pl.fuelMax * 0.25) && AP.task.name !== 'visit') {
    setTask('visit', visit(nearestStation(s => s.svc.repair), 'running from ' + th.name + ' with a holed hull'));
  }
}
function setTask(name, it) {
  if (AP.task) { try { AP.task.it.return(); } catch (_) { /* */ } }
  if (PC.scan) press('scan');
  cam.aux = null;
  AP.task = { name, it, t0: NAV.t };
  AP.seen[name] = NAV.t;
  AP.hist.push(name); if (AP.hist.length > 8) AP.hist.shift();
}

/** per-frame brain tick (runs even while overlays freeze the sim) */
export function apThink(dt, simRunning) {
  if (!AP.on || !G || G.mode !== 'play' || !pl) return;
  NAV.dt = dt; NAV.t += dt;
  resetInp();
  NAV.wantWarp = false;
  if (pl.dead) { AP.task = null; return; }
  AP.intT -= dt;
  if (AP.intT <= 0 && simRunning) { AP.intT = 0.4; interrupt(); }
  if (!pl.dock && !ev && (!AP.task || AP.task.name !== 'tow')) {
    if (pl.fuel <= 0.3) setTask('tow', stranded());
    else if (pl.tq < 0.05) setTask('tow', stranded('Every RCS quad is gone — we cannot even turn.'));
    else if (!engineOK() && hy(pl.vx, pl.vy) > 25) setTask('tow', stranded('Main drive is slag and we are drifting fast.'));
  }
  if (!AP.task) {
    if (ev) { AP.task = { name: 'eva', it: returnToShip(null), t0: NAV.t }; }
    else { const [n, it] = choose(); setTask(n, it); }
  }
  const cap = { mine: 260, scan: 200, breach: 260, cave: 260, flyby: 120, visit: 320, rescue: 200 }[AP.task.name];
  if (cap && NAV.t - AP.task.t0 > cap && !pl.dock) {
    try { AP.task.it.return(); } catch (_) { /* */ }
    say('Enough of that — moving on.'); AP.task = null; cam.aux = null;
    return;
  }
  try {
    const r = AP.task.it.next();
    if (r.done) {
      AP.quick = NAV.t - AP.task.t0 < 0.4 ? (AP.quick || 0) + 1 : 0;
      AP.task = null; cam.aux = null; AP.zoomK = 1;
      if (AP.quick > 3) { AP.quick = 0; setTask('flyby', flyby()); } // nothing sticks: take a scenic lap instead of thrashing
    }
  } catch (e) {
    const k = String(e && e.message);
    if (AP.lastErr !== k) console.error('[AI pilot] ' + (e && e.stack || e));
    AP.lastErr = k; AP.task = null; cam.aux = null;
    AP.plan = null; // whatever was planned is suspect; fall back to fresh choices
  }
  if (NAV.flight && NAV.flight.mode) NAV.flightT = NAV.t;
  const tm = telemetry(); if (tm) AP.sub = tm;
  NAV.flight = null;
}

/** overlays & meta flow: respawn, win screen, auto-resume; camera; ghost hands */
export function apMeta(dt) {
  if (!AP.on || !G) return;
  if (G.mode === 'dead' || G.mode === 'win') {
    AP.metaT += dt;
    const id = G.mode === 'dead' ? 'respawn' : 'keep';
    if (AP.metaT > 2.2) $(id).classList.add('aiPick');
    if (AP.metaT > 4) { AP.metaT = 0; $(id).classList.remove('aiPick'); AP.task = null; $(id).click(); }
    say(G.mode === 'dead' ? 'Signal lost. Accepting recovery — the belt keeps turning.' : 'LEDGER CLEARED. Keep flying.');
  } else AP.metaT = 0;
  if (G.mode === 'pause' && G.autoPaused && !document.hidden) { G.autoPaused = false; mode('play'); }
  if (G.mode === 'pause' && AP.towing) {
    AP.towT += dt; $('tow').classList.toggle('aiPick', AP.towT > 0.8);
    if (AP.towT > 2) { AP.towing = false; $('tow').classList.remove('aiPick'); AP.task = null; tow(); }
  }
  // a dialog nobody is handling
  if ($('dialogO').classList.contains('on')) { AP.dlgT = (AP.dlgT || 0) + dt; if (AP.dlgT > 9) { closeDialog(); AP.dlgT = 0; } } else AP.dlgT = 0;
  // camera director
  if (G.mode === 'play' && pl && !(cam.user > 0)) {
    const v = hy(pl.vx, pl.vy), speedK = cl(1.15 - v / 140, 0.55, 1.05);
    const k = ev ? 2.0 : pl.dock && pl.dock.ty !== 'anchor' ? 1.15 : AP.zoomK * speedK;
    cam.tz = cl(defZoom() * k, 0.35, 3.4); cam.zr = 2.2;
  }
  AP.warp = NAV.wantWarp && !threat() && !ev && !W.meteors.length ? 3 : 1;
  // ghost hands on the touch controls
  showStick('L', inp.lx, inp.ly); showStick('R', inp.rx, inp.ry);
  IN.thrUI(inp.thr);
  $('fireB').classList.toggle('held', inp.fire); $('mineB').classList.toggle('held', inp.mine); $('brake').classList.toggle('held', inp.brake);
  // caption box
  $('apAct').textContent = AP.act;
  $('apCap').textContent = AP.cap;
  $('apSub').textContent = AP.sub;
  const el = (NAV.t - AP.started) | 0;
  $('apTime').textContent = String((el / 60) | 0).padStart(2, '0') + ':' + String(el % 60).padStart(2, '0');
  const wp = $('warp'); wp.classList.toggle('on', AP.warp > 1); wp.textContent = 'TIME ×' + AP.warp;
}

export function apSet(on, demo) {
  AP.on = !!on;
  if (demo !== undefined) AP.demo = !!demo;
  AP.task = null; cam.aux = null; AP.zoomK = 1; AP.warp = 1; cam.zr = 6;
  resetInp();
  document.body.classList.toggle('auto', AP.on);
  $('aiB').classList.toggle('on', AP.on);
  $('apBox').classList.toggle('on', AP.on);
  $('zL').classList.toggle('ghost', AP.on); $('zR').classList.toggle('ghost', AP.on); $('thr').classList.toggle('ghost', AP.on);
  const ap = $('aiP'); if (ap) ap.textContent = 'AI PILOT: ' + (AP.on ? 'ON' : 'OFF');
  if (!AP.on) {
    showStick('L', 0, 0); showStick('R', 0, 0); IN.thr = 0; IN.thrUI(0);
    for (const id of ['fireB', 'mineB', 'brake']) $(id).classList.remove('held');
    $('warp').classList.remove('on');
  } else {
    AP.started = NAV.t; AP.act = 'TAKING THE STICK'; AP.cap = 'AI pilot has the controls. Press P (or AI) to take them back.'; AP.sub = '';
  }
}


/** debug / director hook: start a specific showcase activity right now (returns false when unavailable) */
export function apForce(n) {
  const m = {
    cave: () => { const cv = openCave(); return cv && caveTrip(cv); },
    breach: () => { const h = chooseHulk(); return h && breach(h); },
    scan: () => { const c = chooseContact(); return c && scan(c); },
    mine: () => mine('any'),
    flyby: () => flyby(),
  };
  const it = m[n] && m[n]();
  if (it) setTask(n, it);
  return !!it;
}
