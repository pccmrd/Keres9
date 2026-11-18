// ═══ sector director: raids, distress calls, meteor fronts, shocks ══════
import { $, TAU, cl, hy, ds, rng, pk, rr, ri, bearing } from './core/util.js';
import { C, GD } from './core/config.js';
import { W, G, pl, AG, cam } from './core/state.js';
import { near, ca } from './world/body.js';
import { spawnHulk, addContact, HULKS } from './world/gen.js';
import { mkAgent, nextId, NAMES } from './agents.js';
import { undock, stats } from './ships.js';
import { dmgMod } from './combat.js';
import { AU } from './audio.js';
import { feed, addRep, freePort } from './economy.js';
import { toast } from './ui.js';
import { mkJobs } from './missions.js';

const R = Math.random;
let banT = 0;

export function banner(msg, info) {
  const b = $('evBan'); if (!b) return;
  b.textContent = msg; b.classList.add('on'); b.classList.toggle('info', !!info); banT = 7;
}
export function bannerTick(dt) { if (banT > 0) { banT -= dt; if (banT <= 0) $('evBan').classList.remove('on'); } }

const live = (role, fac) => AG.filter(a => a.alive && a.ship && !a.ship.dead && a.role === role && (!fac || a.fac === fac));
/** a point in open space (no terrain within r) */
function openSpot(x0, y0, spread, r = 60) {
  for (let t = 0; t < 40; t++) {
    const x = cl(x0 + rr(R, -spread, spread), 250, C.W - 250), y = cl(y0 + rr(R, -spread, spread), 250, C.H - 250);
    let ok = true;
    for (const b of near(x, y, r)) { if (hy(b.x - x, b.y - y) < b.rad + r) { ok = false; break; } }
    if (ok) return { x, y };
  }
  return { x: cl(x0, 250, C.W - 250), y: cl(y0, 250, C.H - 250) };
}
function beacon(kind, x, y, label, extra) {
  const b = { kind, x, y, label, t: W.time, until: W.time + 240, ...extra };
  W.beacons.push(b);
  return b;
}
const spawnName = () => pk(R, NAMES) + (R() < 0.5 ? '' : ' ' + 'IVXK'[ri(R, 0, 3)]);

// ─── individual events ───────────────────────────────────────────────────
function raid() {
  const st = pk(R, W.stations.filter(s => !s.dead)); if (!st) return null;
  const ang = R() * TAU, d = rr(R, 1000, 1300), n = ri(R, 2, 3), raiders = [];
  const warlord = R() < 0.35;
  for (let i = 0; i < n; i++) {
    const p = openSpot(st.x + Math.cos(ang) * d, st.y + Math.sin(ang) * d, 160, 30);
    const boss = warlord && i === 0;
    const a = mkAgent(rng(nextId() * 31), boss ? 'security' : 'pirate', 'kings', p.x, p.y, W.aid, boss ? 'Warlord ' + pk(R, ['Hask', 'Moro', 'Vey', 'Kalun']) : spawnName());
    a.role = 'pirate'; a.raid = st; a.caution = 0.2; a.greed = 0.8;
    if (boss) { a.ship.fac = 'kings'; a.ship.dirty = true; a.boss = true; a.ship.gunD += 3; }
    a.ship.vx = -Math.cos(ang) * 30; a.ship.vy = -Math.sin(ang) * 30; a.ship.a = ang + Math.PI;
    raiders.push(a);
  }
  // patrols scramble toward the station
  for (const s of live('security', 'coop')) { s.goal = st; s.state = 'patrol'; s.raidTgt = raiders[0]; }
  const bc = beacon('raid', st.x, st.y, 'RAID · ' + st.name, { st, raiders });
  banner('⚠ VOID KINGS RAID · ' + st.name + (warlord ? ' · WARLORD SIGHTED' : ''));
  AU.alarm();
  feed('DISTRESS · ' + st.name + ' reports Void Kings raiders inbound, bearing ' + String(bearing(st, { x: st.x + Math.cos(ang), y: st.y + Math.sin(ang) })).padStart(3, '0'), 'bad');
  if (warlord) setTimeout(() => G && W && mkJobs(st), 0);
  return { kind: 'raid', st, raiders, bc, t: 0, max: 220,
    tick(dt) {
      this.t += dt;
      for (const a of this.raiders) if (a.ship && !a.ship.dead && (a.state === 'idle' || a.state === 'patrol')) { a.goal = this.st; a.state = 'patrol'; }
      bc.x = this.st.x; bc.y = this.st.y;
      const left = this.raiders.filter(a => a.ship && !a.ship.dead).length;
      bc.label = 'RAID · ' + this.st.name + ' · ' + left + ' hostile';
      if (!left) { feed('Raid on ' + this.st.name + ' broken. The Kings will be back.', 'good'); addRep('coop', 1); return true; }
      return this.t > this.max;
    } };
}

function distress() {
  const ref = R() < 0.6 && pl ? pl : { x: rr(R, 900, C.W - 900), y: rr(R, 900, C.H - 900) };
  const ang = R() * TAU, p = openSpot(ref.x + Math.cos(ang) * rr(R, 700, 1300), ref.y + Math.sin(ang) * rr(R, 700, 1300), 200, 50);
  const a = mkAgent(rng(nextId() * 17), pk(R, ['trader', 'miner', 'trader']), pk(R, ['coop', 'miners', 'scrappers']), p.x, p.y, W.aid, spawnName());
  const s = a.ship;
  a.distress = true; s.fuel = 0; s.vx = rr(R, -2, 2); s.vy = rr(R, -2, 2); s.va = rr(R, -0.3, 0.3);
  for (const m of s.mods) if (m.t !== 'cock' && R() < 0.35) dmgMod(s, m, m.max * rr(R, 0.5, 0.95), null);
  const ambush = R() < 0.45;
  if (ambush) {
    const q = openSpot(p.x + rr(R, -500, 500), p.y + rr(R, -500, 500), 120, 30);
    const k = mkAgent(rng(nextId() * 13), 'pirate', 'kings', q.x, q.y, W.aid, spawnName());
    k.tgt = a; k.state = 'hunt';
  }
  const bc = beacon('sos', p.x, p.y, 'SOS · ' + s.name, { ship: s, ag: a, prog: 0 });
  const ct = addContact(rng(W.aid), 'beacon', p.x, p.y, { a: 0, x: p.x, y: p.y, name: s.name, contacts: null, cham: [] }, 'distress transponder · ' + s.name);
  ct.f = rr(R, 40, 180);
  banner('SOS · ' + s.name + ' DISABLED · BEARING ' + String(bearing(pl || cam, p)).padStart(3, '0'), true);
  AU.warn();
  feed('Mayday from ' + s.name + ': reactor scram, tanks dry, ' + (ambush ? 'and a Kings hull shadowing us.' : 'drifting.'), 'warn');
  return { kind: 'distress', a, s, bc, ct, t: 0, max: 260,
    tick(dt) {
      this.t += dt; bc.x = s.x; bc.y = s.y; ct.x = s.x; ct.y = s.y;
      if (s.dead) { feed(s.name + ' went silent. Kings work, by the look of the debris.', 'bad'); ct.done = true; return true; }
      if (pl && !pl.dead && !pl.dock && ds(pl, s) < 80 && hy(pl.vx - s.vx, pl.vy - s.vy) < 4) {
        bc.prog += dt;
        if (bc.prog >= 3) {
          a.distress = false; s.fuel = s.fuelMax * 0.6; for (const m of s.mods) { m.hp = Math.max(m.hp, m.max * 0.6); m.dead = false; } s.dirty = true; stats(s);
          a.favor += 3; pl.credits += 450; W.stats.rescues++; addRep(s.fac, 6); addRep('coop', 3); AU.chime();
          toast('RESCUE · ' + s.name + ' patched and fuelled · +450₡', 'good'); feed('KITE answered the mayday from ' + s.name, 'good');
          ct.done = true; a.state = 'idle'; return true;
        }
      } else bc.prog = Math.max(0, bc.prog - dt * 0.5);
      if (this.t > this.max) { a.distress = false; ct.done = true; feed(s.name + ' crew limped home on emergency cells.', 'warn'); s.fuel = 15; return true; }
      return false;
    } };
}

function meteors() {
  const tgt = R() < 0.7 && pl ? { x: pl.x + rr(R, -300, 300), y: pl.y + rr(R, -300, 300) } : { x: rr(R, 1200, C.W - 1200), y: rr(R, 1200, C.H - 1200) };
  const dir = R() * TAU, ux = Math.cos(dir), uy = Math.sin(dir);
  const bc = beacon('meteor', tgt.x, tgt.y, 'MICROMETEOR FRONT', { dir });
  banner('☄ MICROMETEOR FRONT · INBOUND FROM ' + String(Math.round(((dir + Math.PI) * 180) / Math.PI + 450) % 360).padStart(3, '0'));
  AU.warn();
  feed('Typhon ring shedding — micrometeor front crossing the belt.', 'warn');
  return { kind: 'meteor', bc, t: -5, max: 26,
    tick(dt) {
      this.t += dt;
      if (this.t > 0 && this.t < 22) {
        const rate = 5 + Math.sin((this.t / 22) * Math.PI) * 9;
        if (R() < rate * dt) {
          const off = rr(R, -600, 600), sp = rr(R, 140, 230), back = 1100;
          const x = tgt.x - ux * back - uy * off, y = tgt.y - uy * back + ux * off, j = rr(R, -0.06, 0.06);
          W.meteors.push({ x, y, px: x, py: y, vx: Math.cos(dir + j) * sp, vy: Math.sin(dir + j) * sp, life: 12, r: rr(R, 0.6, 1.6) });
          if (pl && hy(x - pl.x, y - pl.y) < 1300 && R() < 0.3) AU.whoosh(0.5);
        }
      }
      return this.t > this.max;
    } };
}

function shock() {
  const st = pk(R, W.stations.filter(s => !s.dead)); if (!st) return null;
  const kinds = [
    ['halt', 'parts', st.name + ' fabricator fire — Fab Parts output halted'],
    ['halt', 'fuel', st.name + ' reactor scram — reaction mass rationed'],
    ['surge', 'ice', st.name + ' coolant leak — paying premium for Water Ice'],
    ['surge', 'food', 'Blight in ' + st.name + ' hydroponics — food prices spiking'],
    ['surge', 'fe', st.name + ' retooling — Ferrite Ore demand surging'],
    ['glut', 'au', 'Prospector strike near ' + st.name + ' — Au-Pt glut'],
  ].filter(k => st.econ[k[1]]);
  const [ty, g, msg] = pk(R, kinds), e = st.econ[g], old = { mod: e.mod, cmod: e.cmod };
  if (ty === 'halt') e.mod = 0;
  if (ty === 'surge') { e.cmod = 4; e.stock *= 0.4; }
  if (ty === 'glut') e.stock += 60;
  banner('MARKET · ' + msg.toUpperCase(), true);
  feed('MARKET · ' + msg + '.', 'warn');
  return { kind: 'shock', t: 0, max: 200, tick(dt) { this.t += dt; if (this.t > this.max) { e.mod = old.mod === undefined ? 1 : old.mod; e.cmod = old.cmod || 1; feed(st.name + ' market settling.', ''); return true; } return false; } };
}

function derelict() {
  const side = ri(R, 0, 3), x = side === 0 ? 320 : side === 1 ? C.W - 320 : rr(R, 900, C.W - 900), y = side === 2 ? 320 : side === 3 ? C.H - 320 : rr(R, 900, C.H - 900);
  const p = openSpot(x, y, 150, 80);
  const tx = C.W / 2 - p.x, ty = C.H / 2 - p.y, d = hy(tx, ty) || 1, sp = rr(R, 1.5, 3);
  const name = pk(R, HULKS) + ' ' + ri(R, 2, 9);
  const b = spawnHulk((R() * 1e9) | 0, p.x, p.y, name, (tx / d) * sp, (ty / d) * sp);
  banner('LONG-RANGE · UNREGISTERED HULL DRIFTING IN · ' + name, true);
  feed('Long-range: ' + name + ' drifting in from the shadow. No transponder.', 'warn');
  beacon('wreck', b.x, b.y, 'DERELICT · ' + name, { b, until: W.time + 120 });
  return { kind: 'derelict', b, t: 0, max: 120, tick(dt) { this.t += dt; return this.t > this.max; } };
}

function convoy() {
  const live2 = W.stations.filter(s => !s.dead); if (live2.length < 2) return null;
  const A = pk(R, live2), B = pk(R, live2.filter(s => s !== A));
  const p = openSpot(A.x, A.y + A.rad + 150, 120, 40);
  const t = mkAgent(rng(nextId() * 7), 'trader', A.fac, p.x, p.y, W.aid, spawnName());
  t.cargo = { parts: 20, food: 12, au: 4 }; t.goal = B; t.state = 'sell'; t.home = B;
  const e = mkAgent(rng(nextId() * 11), 'security', 'coop', p.x + 40, p.y + 30, W.aid, spawnName());
  e.escort = t.ship; e.goal = t.ship; e.state = 'patrol'; e.home = B;
  feed('Convoy ' + t.name + ' departing ' + A.name + ' for ' + B.name + ' under escort. Rich cargo.', '');
  banner('CONVOY · ' + A.name + ' → ' + B.name, true);
  return { kind: 'convoy', t: 0, max: 200, tick(dt) { this.t += dt; if (t.ship && !t.ship.dead && e.ship && !e.ship.dead && e.state === 'patrol') e.goal = t.ship; return this.t > this.max || !t.ship || t.ship.dead; } };
}

const EVENTS = { raid: [raid, 3], distress: [distress, 3], meteor: [meteors, 2], shock: [shock, 2], derelict: [derelict, 1.4], convoy: [convoy, 1.6] };

/** keep the sector populated */
function upkeep() {
  const need = [['pirate', 'kings', 3], ['trader', null, 4], ['miner', null, 3], ['security', 'coop', 2], ['scav', null, 1]];
  for (const [role, fac, min] of need) {
    if (live(role, fac).length >= min) continue;
    let x, y, home = null;
    if (role === 'pirate') {
      const h = W.hideouts.length && R() < 0.6 ? pk(R, W.hideouts) : null;
      const p = openSpot(h ? h.x : rr(R, 400, C.W - 400), h ? h.y : pk(R, [350, C.H - 350]), h ? 400 : 300, 30);
      x = p.x; y = p.y;
    } else {
      home = pk(R, W.stations.filter(s => !s.dead)) || W.stations[0];
      const p = openSpot(home.x, home.y + home.rad + 120, 150, 30); x = p.x; y = p.y;
    }
    const a = mkAgent(rng(nextId() * 3), role, fac || (home ? home.fac : 'coop'), x, y, W.aid, spawnName());
    a.home = role === 'pirate' ? null : home;
    if (role === 'miner') a.fac = 'miners';
    feed(role === 'pirate' ? 'New Kings crew under ' + a.name + ' slipped out of the shadow.' : a.name + ' launched a ' + role + ' hull from ' + home.name + '.', role === 'pirate' ? 'bad' : '');
    break;
  }
}

export function startEvent(kind) {
  const def = EVENTS[kind]; if (!def) return null;
  const e = def[0](); if (!e) return null;
  W.evt.list.push(e); W.evt.last = kind; W.stats.events++;
  return e;
}

export function eventsTick(dt) {
  if (!W.evt) W.evt = { next: 40, list: [], up: 10, last: null };
  const E = W.evt;
  E.next -= dt; E.up -= dt;
  if (E.up <= 0) { E.up = 25; upkeep(); }
  E.list = E.list.filter(e => !e.tick(dt));
  W.beacons = W.beacons.filter(b => W.time < b.until && !(b.ship && b.ship.dead) && !(b.kind === 'sos' && b.ag && !b.ag.distress) &&
    !(b.kind === 'raid' && !E.list.some(e => e.bc === b)) && !(b.kind === 'meteor' && !E.list.some(e => e.bc === b)));
  for (const b of W.beacons) if (b.b) { b.x = b.b.x; b.y = b.b.y; }
  if (E.next <= 0 && E.list.length < 3) {
    E.next = rr(R, 50, 95);
    const pool = Object.keys(EVENTS).filter(k => k !== E.last && !E.list.some(e => e.kind === k));
    let tot = 0; for (const k of pool) tot += EVENTS[k][1];
    let q = R() * tot, pick = pool[0];
    for (const k of pool) { q -= EVENTS[k][1]; if (q <= 0) { pick = k; break; } }
    startEvent(pick);
  }
  bannerTick(dt);
}
