// ═══ markets, services, shipyards, the Catalog Office ═══════════════════
import { cl, fm, hy, rr } from './core/util.js';
import { C, GD, CLS } from './core/config.js';
import { W, G, pl, ev } from './core/state.js';
import { cw, pR, pF } from './world/body.js';
import { cadd, cmass, integ, stats, mkOwned, dock, sprite } from './ships.js';
import { SITES } from './world/gen.js';
import { sackN } from './eva.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

export function feed(m, k) { if (!W) return; W.feed.unshift({ t: W.time, m, k: k || '' }); if (W.feed.length > 50) W.feed.pop(); }

/** what the player can trade from right now: the ship's hold, or the suit's sack */
export function hold() {
  if (pl) return { c: pl.cargo, max: pl.cargoMax, used: cmass(pl), n: pl.name, ship: pl };
  if (ev) return { c: ev.sack, max: Math.floor(C.EVA.sack * (G.sackUp || 1)), used: sackN(ev), n: 'SUIT SACK', ship: null };
  return null;
}
function holdAdd(h, g, q) {
  if (h.ship) return cadd(h.ship, g, q);
  const t = Math.min(q, h.max - h.used); if (t > 0) { h.c[g] = (h.c[g] || 0) + t; } return Math.max(0, t);
}

/** departure fever: transfer ships pay a premium in their last minutes */
const fever = st => (st.transfer && st.transfer.depart > 0 ? 1 + cl(1 - (st.transfer.depart - W.time) / 240, 0, 1) * 0.35 : 1);
export function price(st, g, sell) {
  const e = st.econ && st.econ[g]; if (!e) return 0;
  const p = GD[g].p * e.mul * cl(Math.pow(e.ref / (e.stock + 6), 0.5), 0.45, 2.4) * fever(st);
  return Math.max(1, Math.round(sell ? p * 0.88 : p));
}

export function trade(st, g, n, buy) {
  const h = hold(); if (!h) return;
  const e = st.econ[g];
  if (buy) {
    let k = 0;
    while (k < n && G.cr >= price(st, g) && e.stock >= 1) { const p = price(st, g); if (!holdAdd(h, g, 1)) break; G.cr -= p; e.stock -= 1; k++; }
    if (k) { AU.blip(); hooks.toast('BOUGHT ' + k + ' ' + GD[g].n); }
  } else {
    let k = 0, earned = 0;
    while (k < n && (h.c[g] || 0) > 0) { const p = price(st, g, true); h.c[g]--; G.cr += p; earned += p; e.stock += 1; k++; }
    if (!h.c[g]) delete h.c[g];
    if (h.ship) stats(h.ship);
    if (k) {
      AU.cash(); W.stats.earned += earned; W.stats.delivered += k;
      hooks.toast('SOLD ' + k + ' ' + GD[g].n + ' · +' + fm(earned) + '₡', 'good');
      feed('You sold ' + k + ' ' + GD[g].n + ' to ' + st.name + '.');
      hooks.delivered && hooks.delivered(st, g, k, earned);
    }
  }
}

export function econTick(dt) {
  G._e = (G._e || 0) + dt; if (G._e < 5) return;
  const step = G._e / 60; G._e = 0;
  for (const st of W.stations) {
    if (!st.econ) continue;
    for (const g in st.econ) {
      const q = st.econ[g];
      if (q.cons > 0) q.stock = Math.max(0, q.stock - q.cons * step);
      if (q.prod > 0) q.stock = Math.min(q.ref * 3, q.stock + q.prod * step);
      if (q.ref > 0 && q.stock < q.ref * 0.2) q.stock += q.ref * 0.05 * step;
      q.hist.push(price(st, g)); if (q.hist.length > 26) q.hist.shift();
    }
  }
  for (const st of W.stations) patchStation(st, 3);
}
/** station crews weld breaches shut from the blueprint */
export function patchStation(st, n) {
  if (!st.sol0 || !st.cut.length) return;
  for (let k = 0; k < n && st.cut.length; k++) {
    const i = st.cut.shift();
    if (st.sol[i] || !st.sol0[i]) continue;
    const cx = i % st.gw, cy = (i / st.gw) | 0, w = cw(st, cx, cy);
    if (W.ships.some(s => !s.dead && hy(s.x - w.x, s.y - w.y) < s.rad + st.cs) || (ev && hy(ev.x - w.x, ev.y - w.y) < 4)) { st.cut.push(i); continue; }
    st.sol[i] = st.sol0[i]; st.flr[i] = st.flr0[i]; st.dmg.delete(i);
    if (st.rc) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < st.gw && y < st.gh) pR(st, x, y); }
    if (st.fc) pF(st, cx, cy);
  }
}

// ─── services ────────────────────────────────────────────────────────────
const UPG = { eng: ['ENGINE TUNE', 'thrust +16%', 900], cargo: ['CARGO RACKS', 'hold +12', 700], laser: ['LASER FOCUS', 'cut rate & range', 800], fuel: ['AUX TANKS', 'propellant +35', 600], scan: ['ARRAY GAIN', 'scanner range +160 m', 650] };
const SUIT = { airUp: ['SUIT · BIG TANK', 'air +60%', 260, 1.6], sackUp: ['SUIT · DEEP SACK', 'sack +75%', 320, 1.75], suitUp: ['SUIT · HOT CUTTER', 'hand cutter +70%', 380, 1.7] };
/** a docked owned ship at this station (for services) */
export function shipAt(st) { return G.fleet.find(s => !s.dead && s.dock && s.dock.b === st) || null; }
export function services(st) {
  const L = [], s = pl && pl.dock && pl.dock.b === st ? pl : shipAt(st);
  if (s) {
    const need = Math.ceil(s.fuelMax - s.fuel), fp = price(st, 'fuel') || 6;
    L.push({ l: 'REFUEL ' + s.name, d: need + ' units propellant @ ' + fp + '₡', c: need * fp, min: Math.min(need * fp, fp), ok: need > 0, f: () => { const k = Math.min(need, Math.floor(G.cr / fp)); s.fuel += k; G.cr -= k * fp; if (st.econ.fuel) st.econ.fuel.stock = Math.max(0, st.econ.fuel.stock - k); AU.blip(); } });
    let dmg = 0; for (const m of s.mods) dmg += m.max - Math.max(0, m.hp);
    const rc = Math.ceil(dmg * 2.2);
    L.push({ l: 'REPAIR ' + s.name, d: 'hull ' + Math.round(integ(s) * 100) + '% → 100%', c: rc, ok: dmg > 0, f: () => { for (const m of s.mods) { m.hp = m.max; m.dead = false; } G.cr -= rc; stats(s); s.dirty = true; AU.thunk(); } });
    if (!st.transfer) for (const k in UPG) {
      const lv = s.upg[k] || 0, [n, d, c0] = UPG[k], c = Math.round(c0 * (1 + lv * 0.8));
      if (k === 'eng' && s.cls === 'wren' && lv >= 1) continue;   // the WREN frame won't take more thrust
      if (lv < 3) L.push({ l: n + ' · L' + (lv + 1), d: d + ' (' + s.name + ')', c, ok: true, f: () => { s.upg[k] = lv + 1; G.cr -= c; const f = s.fuel; stats(s); s.fuel = Math.min(s.fuelMax, f); AU.chime(); } });
    }
  }
  if (st === SITES.sel || st === SITES.depot) for (const k in SUIT) {
    const [n, d, c, v] = SUIT[k];
    if (!G[k] || G[k] < v) L.push({ l: n, d, c, ok: true, f: () => { G[k] = v; G.cr -= c; AU.chime(); } });
  }
  if (!L.length) L.push({ l: 'NO SERVICES', d: 'bring a hull here to refuel, repair or refit', c: 0, ok: false, f: () => {} });
  return L;
}

/** ships for sale at this yard */
export function yard(st) {
  return (st.yard || []).map(cls => {
    const K = CLS[cls], owned = G.fleet.some(s => !s.dead && s.cls === cls);
    return { cls, n: K.n, c: K.price, owned, d: cls === 'wren' ? 'Orbit-only tug. Weak engine (cannot lift off the surface), mining laser, array, 26 hold. Berths at SELENE HIGH.' : 'Surface-to-orbit lander. Triple engine, landing gear, 44 hold, laser & array. Sits on Shackleton PAD 1 — fly it up the well yourself.' };
  });
}
export function buyShip(st, cls) {
  const K = CLS[cls];
  if (G.cr < K.price) { hooks.toast('Not enough credits', 'bad'); return null; }
  let P = null;
  if (cls === 'hare') P = { p: st.pads.find(q => !q.occ) || st.pads[0], ty: 'pad' };
  else P = { p: st.ports.find(q => q.berth && !q.occ) || st.ports.find(q => !q.occ && !q.crew), ty: 'port' };
  if (!P.p || P.p.occ) { hooks.toast('No free berth — clear the pad first', 'bad'); return null; }
  G.cr -= K.price;
  const s = mkOwned(cls, st.x, st.y);
  dock(s, st, P.p, P.ty, true); sprite(s);
  G.fleet.push(s); G.tier = Math.max(G.tier, cls === 'wren' ? 2 : 3);
  AU.chime(); AU.cash();
  hooks.toast((cls === 'wren' ? 'WREN' : 'HARE') + ' IS YOURS · ' + (P.ty === 'pad' ? 'on ' + P.p.name : 'clamped at a berth') + ' — BOARD from the yard or float over and press F', 'good');
  feed('A new ' + K.n + ' changed hands at ' + st.name + '.', 'good');
  hooks.bought && hooks.bought(s);
  return s;
}

// ─── the Catalog Office ─────────────────────────────────────────────────
export function bountyFor(b) { return Math.round(25 + b.R * 1.6 + (b.type === 'comet' ? 40 : b.type === 'metal' ? 30 : 0) + b.cham.filter(q => !q.open).length * 12); }
/** collect pending survey bounties (Catalog Office terminal, or any docking at SELENE HIGH) */
export function collectBounty() {
  if (!G.bounty) return 0;
  const v = G.bounty; G.cr += v; W.stats.earned += v; G.bounty = 0; AU.cash();
  hooks.toast('CATALOG OFFICE pays ' + fm(v) + '₡ in survey bounties', 'good');
  return v;
}
export { rr };
