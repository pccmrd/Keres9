// ═══ story arc & contract board ═════════════════════════════════════════
import { fm, rng, pk, rr, ri } from './core/util.js';
import { C, GD } from './core/config.js';
import { W, G, pl, AG } from './core/state.js';
import { stats } from './ships.js';
import { AU } from './audio.js';
import { addRep, feed } from './economy.js';
import { toast, showWin } from './ui.js';
import { setNav } from './player.js';

export const STORY = [
  { t: 'MAIDEN CLAMP', d: 'Dock at Keres Anchor. Kill ΔV, align the nose, four gates green, then CLAMP.', r: 400 },
  { t: 'ROCKWORK', d: 'Cut ferrite from the rock and sell 12 units at SLAGWORKS.', r: 600 },
  { t: 'ECHOES IN THE ROCK', d: 'Resolve a sealed anomaly on the array, then deliver 1 resonant crystal to Anchor.', r: 1200 },
  { t: 'BLOOD ON THE BELT', d: 'Put down a Void Kings raider. Their transponders burn red.', r: 1500 },
  { t: 'THE LEDGER', d: 'Clear the 25,000₡ debt in Anchor services. Then the belt is yours.', r: 0 },
];

export function newGame() {
  return {
    mode: 'title', debt: C.DEBT, rep: { coop: 0, miners: 5, kings: -25, scrappers: 0 }, story: 0, prog: {}, jobs: {}, missions: [],
    shift: 1, clock: 0, win: false, jseed: 7, sound: true, qty: 5, _e: 0, _a: 0, _j: 0, save: 0, panel: null, tab: 'market', svc: [],
  };
}

export function storyObj() {
  const s = STORY[Math.min(G.story, 4)];
  let p = '';
  if (G.story === 1) p = ' (' + (G.prog.ore || 0) + '/12 fe)';
  if (G.story === 2) p = ' (' + (G.prog.scan ? 'anomaly ✓' : 'anomaly …') + ' · ' + (G.prog.crys ? 'crystal ✓' : 'crystal …') + ')';
  if (G.story === 4) p = ' (' + fm(Math.max(0, G.debt)) + '₡ left)';
  return { t: s.t, d: s.d + p, r: s.r };
}

export function story(ev2, d) {
  const s = STORY[G.story]; if (!s) return;
  let done = false;
  if (G.story === 0 && ev2 === 'dock') done = true;
  if (G.story === 1 && ev2 === 'sell' && d.g === 'fe' && d.st.type === 'industrial') { G.prog.ore = (G.prog.ore || 0) + d.q; done = G.prog.ore >= 12; }
  if (G.story === 2) {
    if (ev2 === 'found') G.prog.scan = true;
    if (ev2 === 'dock' && d.st.type === 'anchor' && (pl.cargo.crys || 0) > 0) { pl.cargo.crys--; if (pl.cargo.crys <= 0) delete pl.cargo.crys; stats(pl); G.prog.crys = true; }
    done = !!(G.prog.scan && G.prog.crys);
  }
  if (G.story === 3 && ev2 === 'kill' && d.fac === 'kings') done = true;
  if (G.story === 4 && ev2 === 'debt' && G.debt <= 0) done = true;
  if (!done) return;
  pl.credits += s.r; W.stats.earned += s.r;
  if (G.story === 2) { pl.upg.scan++; stats(pl); }
  AU.cash(); toast('OBJECTIVE COMPLETE · ' + s.t + (s.r ? ' · +' + fm(s.r) + '₡' : ''), 'good'); feed('Objective cleared: ' + s.t, 'good');
  G.story++;
  if (G.story < 5) toast('NEW OBJECTIVE · ' + STORY[G.story].t, 'warn');
  if (G.debt <= 0 && !G.win) { G.win = true; showWin(); }
}

export function mkJobs(st) {
  const r = rng((W.seed + G.jseed++ * 977 + st.name.length * 31) | 0), out = [];
  for (let k = 0; k < 3; k++) {
    const ty = pk(r, ['deliver', 'mine', 'bounty']);
    if (ty === 'bounty') {
      const ps = AG.filter(a => a.role === 'pirate' && a.ship && !a.ship.dead);
      if (ps.length) {
        const t = pk(r, ps);
        out.push({ id: 'j' + G.jseed + '_' + k, type: 'bounty', from: st.name, to: st.name, qty: 1, reward: ri(r, 1100, 2200), rep: 'coop', tid: t.id,
          title: 'BOUNTY · ' + t.name, desc: 'Void Kings raider ' + t.name + ' is working the belt. Kill the hull, claim the bounty.' });
        continue;
      }
    }
    const g = ty === 'mine' ? pk(r, ['fe', 'ice']) : pk(r, ['food', 'fuel', 'parts', 'ice']), q = ri(r, 6, 18);
    const other = pk(r, W.stations.filter(s => s !== st && !s.dead)) || st;
    out.push({ id: 'j' + G.jseed + '_' + k, type: ty, from: st.name, to: ty === 'mine' ? st.name : other.name, good: g, qty: q,
      reward: Math.round(q * GD[g].p * rr(r, 1.6, 2.4)), rep: st.fac, title: ty === 'mine' ? 'ORE CONTRACT' : 'FREIGHT RUN',
      desc: 'Deliver ' + q + ' ' + GD[g].n + ' to ' + (ty === 'mine' ? st.name : other.name) + '. Cargo is consumed on arrival.' });
  }
  G.jobs[st.name] = out;
}

export function accept(j, quiet) {
  if (G.missions.length >= 3) { toast('Contract log full', 'warn'); return false; }
  if (G.missions.some(m => m.id === j.id)) return false;
  G.missions.push(j);
  const st = W.stations.find(s => s.name === j.to);
  if (st && !quiet) setNav(st.x, st.y, j.to);
  AU.ui(); toast('CONTRACT SIGNED · ' + j.title, 'good');
  return true;
}
export function complete(j) {
  pl.credits += j.reward; W.stats.earned += j.reward; W.stats.jobs++; addRep(j.rep, 5);
  G.missions = G.missions.filter(m => m !== j);
  AU.cash(); toast('CONTRACT PAID · ' + j.title + ' · +' + fm(j.reward) + '₡', 'good'); feed('Contract fulfilled: ' + j.title, 'good');
}
/** deliver any matching freight / ore contracts at station `st` */
export function checkJobs(st) {
  st = st || (pl && pl.dock && pl.dock.b) || G.panel;
  if (!st) return;
  for (const j of [...G.missions])
    if (j.type !== 'bounty' && st.name === j.to && (pl.cargo[j.good] || 0) >= j.qty) {
      pl.cargo[j.good] -= j.qty; if (pl.cargo[j.good] <= 0) delete pl.cargo[j.good];
      stats(pl); complete(j);
    }
}
