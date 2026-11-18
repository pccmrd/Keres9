// ═══ markets, production chains, services, reputation ═══════════════════
import { cl, fm, hy } from './core/util.js';
import { GD } from './core/config.js';
import { W, G, pl, ev } from './core/state.js';
import { cw, pR, pF } from './world/body.js';
import { cadd, cmass, integ, stats } from './ships.js';
import { AU } from './audio.js';
import { story, checkJobs } from './missions.js';
import { toast, showWin } from './ui.js';

/** inputs consumed per unit produced */
export const CHAIN = { parts: { fe: 0.6 }, food: { ice: 0.5 }, fuel: { fe: 0.3, ice: 0.4 } };

export function feed(m, k) { if (!W) return; W.feed.unshift({ t: W.time, m, k: k || '' }); if (W.feed.length > 50) W.feed.pop(); }

export function addRep(f, d) {
  if (G.rep[f] === undefined) return;
  const b = G.rep[f]; G.rep[f] = cl(b + d, -100, 100);
  if (Math.abs(G.rep[f]) >= 30 && Math.abs(b) < 30) toast('REP · ' + f.toUpperCase() + (G.rep[f] > 0 ? ' trusts you' : ' marks you'), G.rep[f] > 0 ? 'good' : 'bad');
}

export function price(st, g) {
  const e = st.econ[g]; if (!e) return 0;
  return Math.max(1, Math.round(GD[g].p * cl(Math.pow(e.ref / (e.stock + 6), 0.6), 0.35, 2.6) * (1 - cl(G.rep[st.fac] || 0, -60, 60) / 500)));
}

/** station crews weld breaches shut from the blueprint, a few cells per economy tick */
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

export function econTick(dt) {
  G._e += dt; if (G._e < 5) return;
  const step = G._e / 60; G._e = 0;
  for (const st of W.stations) {
    if (st.dead) continue;
    const e = st.econ;
    for (const g in e) if (e[g].cons > 0) e[g].stock = Math.max(0, e[g].stock - e[g].cons * (e[g].cmod || 1) * step);
    for (const g in e) {
      const q = e[g]; if (q.prod <= 0) continue;
      const pr = q.prod * (q.mod === undefined ? 1 : q.mod), need = CHAIN[g] || {};
      if (pr <= 0) continue;
      let ok = true;
      for (const i in need) if ((e[i] ? e[i].stock : 0) < need[i] * pr * step) ok = false;
      if (!ok) continue;
      for (const i in need) e[i].stock -= need[i] * pr * step;
      q.stock = Math.min(400, q.stock + pr * step);
    }
    // a little outside supply keeps the sector from starving
    for (const g in e) { const q = e[g]; if (q.ref > 0 && q.stock < q.ref * 0.15) q.stock += q.ref * 0.01 * step * 6; }
    for (const g in e) { const q = e[g]; q.hist.push(price(st, g)); if (q.hist.length > 26) q.hist.shift(); }
    if (!st.dead) patchStation(st, 3);
    if (st.cut.length > 70 && !st.dead) { st.dead = true; feed(st.name + ' spine severed — services offline', 'bad'); toast(st.name + ' HAS GONE DARK', 'bad'); }
  }
}

export function trade(st, g, q, buy) {
  const p = price(st, g), e = st.econ[g];
  if (buy) {
    const want = Math.min(q, Math.floor(pl.credits / p), e.stock | 0);
    if (want <= 0) { AU.warn(); toast(e.stock < 1 ? 'No stock' : 'Not enough credits', 'warn'); return 0; }
    const t = cadd(pl, g, want);
    if (t <= 0) { AU.warn(); toast('Hold full', 'warn'); return 0; }
    pl.credits -= t * p; e.stock -= t; AU.cash(); toast('BOUGHT ' + t + ' ' + GD[g].n + ' · −' + fm(t * p) + '₡');
    checkJobs(st);
    return t;
  }
  const s = Math.min(q, pl.cargo[g] || 0);
  if (s <= 0) { AU.warn(); return 0; }
  pl.cargo[g] -= s; if (pl.cargo[g] <= 0) delete pl.cargo[g];
  e.stock += s; pl.credits += s * p; W.stats.earned += s * p; stats(pl);
  if (GD[g].bad && st.fac === 'coop' && Math.random() < 0.3) {
    const f = 200 + s * 20; pl.credits = Math.max(0, pl.credits - f); addRep('coop', -8);
    toast('CONTRABAND SCAN · fined ' + fm(f) + '₡', 'bad'); feed('Customs flagged stim cargo on KITE.', 'bad');
  }
  AU.cash(); toast('SOLD ' + s + ' ' + GD[g].n + ' · +' + fm(s * p) + '₡', 'good');
  story('sell', { st, g, q: s });
  checkJobs(st);
  return s;
}

export function npcTrade(a, st, g, q, buy) {
  const e = st.econ[g], p = price(st, g);
  if (buy) { const t = Math.min(q, Math.floor(a.credits / p), e.stock | 0); if (t <= 0) return; a.cargo[g] = (a.cargo[g] || 0) + t; a.credits -= t * p; e.stock -= t; }
  else { const s = Math.min(q, a.cargo[g] || 0); if (s <= 0) return; a.cargo[g] -= s; if (a.cargo[g] <= 0) delete a.cargo[g]; e.stock += s; a.credits += s * p; }
}
export const bestBuy = g => { let b = null, p = 1e9; for (const s of W.stations) { if (s.dead || s.econ[g].stock < 8) continue; const q = price(s, g); if (q < p) { p = q; b = s; } } return b; };
export const bestSell = (g, not) => { let b = null, p = 0; for (const s of W.stations) { if (s.dead || s === not) continue; const q = price(s, g); if (q > p) { p = q; b = s; } } return b; };
export function freePort(st, berth) {
  const L = st.ports.filter(p => !p.occ && (!berth || p.berth)), A = st.ports.filter(p => !p.occ), U = L.length ? L : A;
  return U.length ? U[(Math.random() * U.length) | 0] : null;
}

export function payDebt(n) {
  const p = Math.min(n, pl.credits, G.debt);
  if (p <= 0) { AU.warn(); return; }
  pl.credits -= p; G.debt -= p; AU.cash();
  toast('LEDGER PAYMENT · −' + fm(p) + '₡ · ' + fm(G.debt) + '₡ left', 'good'); feed('Ledger payment: ' + fm(p) + '₡', 'good');
  story('debt', {});
  if (G.debt <= 0 && !G.win) { G.win = true; showWin(); }
}
export function repairCost() { let m = 0; for (const q of pl.mods) m += q.max - Math.max(0, q.hp); return Math.ceil(m * 3.2); }

export const UPGRADES = [['eng', 'ENGINE CORE', '+28% main thrust', 900], ['cargo', 'CARGO RACKS', '+12 hold', 700], ['laser', 'MINING LASER', '+range & cut rate', 850],
  ['gun', 'CANNON FEED', '+4 damage', 1000], ['armor', 'HULL PLATING', '+25% armour', 800], ['fuel', 'TANK BLADDER', '+30 mass', 650], ['scan', 'ARRAY DISH', '+140m range', 750]];
export const upgCost = (k, lv) => Math.round(UPGRADES.find(u => u[0] === k)[3] * Math.pow(1.75, lv));

/** service list for the SERVICES tab — each entry {l,d,c,ok,f,k} */
export function services(st) {
  const L = [], need = pl.fuelMax - pl.fuel, fp = cl(price(st, 'fuel'), 3, 9); // Keres Mutual subsidises pilots' reaction mass
  L.push({ k: 'fuel', l: 'REACTION MASS', d: need.toFixed(0) + ' units to full · ' + fp + '₡/unit', c: Math.ceil(need * fp), min: fp, ok: need > 1,
    f: () => {
      const q = Math.min(need, Math.floor(pl.credits / fp));
      if (q <= 0) { AU.warn(); toast('Not enough credits', 'warn'); return; }
      pl.credits -= q * fp; pl.fuel = Math.min(pl.fuelMax, pl.fuel + q); st.econ.fuel.stock = Math.max(0, st.econ.fuel.stock - q); AU.cash(); toast('REFUELLED +' + q.toFixed(0), 'good');
    } });
  const rc = repairCost();
  L.push({ k: 'repair', l: 'HULL & MODULE REPAIR', d: Math.round(integ(pl) * 100) + '% integrity · restores every module', c: rc, ok: rc > 0 && st.svc.repair,
    f: () => {
      if (pl.credits < rc) { AU.warn(); toast('Not enough credits', 'warn'); return; }
      pl.credits -= rc; for (const m of pl.mods) { m.hp = m.max; m.dead = false; }
      pl.dirty = true; stats(pl); AU.chime(); toast('HULL RESTORED', 'good');
    } });
  if (st.svc.upg) for (const [k, l, d] of UPGRADES) {
    const lv = pl.upg[k] || 0, c = upgCost(k, lv);
    L.push({ k: 'upg:' + k, l: l + ' · MK' + (lv + 1), d: d + (lv >= 3 ? ' · MAX' : ''), c, ok: lv < 3,
      f: () => {
        if (pl.credits < c) { AU.warn(); toast('Not enough credits', 'warn'); return; }
        pl.credits -= c; pl.upg[k] = lv + 1;
        if (k === 'armor') for (const m of pl.mods) { m.max = Math.round(m.max * 1.25); m.hp = m.max; }
        stats(pl); pl.dirty = true; AU.chime(); toast(l + ' INSTALLED · MK' + (lv + 1), 'good');
      } });
  }
  if (st.svc.debt) {
    L.push({ k: 'debt', l: 'KERES MUTUAL LEDGER', d: fm(G.debt) + '₡ outstanding · pay 5,000₡', c: Math.min(5000, G.debt), ok: G.debt > 0, f: () => payDebt(5000) });
    L.push({ k: 'debtAll', l: 'CLEAR LEDGER IN FULL', d: 'own your hull outright', c: G.debt, ok: G.debt > 0 && pl.credits >= G.debt, f: () => payDebt(G.debt) });
  }
  return L;
}
export const cargoMass = cmass;
export const dist = (a, b) => hy(a.x - b.x, a.y - b.y);
