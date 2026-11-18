// ═══ bar talk, rumours, fences ══════════════════════════════════════════
import { fm, pk, ds, bearing } from './core/util.js';
import { GD } from './core/config.js';
import { W, pl } from './core/state.js';
import { stats } from './ships.js';
import { AU } from './audio.js';
import { price, bestBuy, bestSell, addRep } from './economy.js';
import { dialog, closeDialog, openStation } from './ui.js';

export function rumor(a) {
  const un = W.contacts.filter(c => !c.done && c.kind !== 'beacon');
  if (un.length && Math.random() < 0.7) {
    const c = pk(Math.random, un), src = a && a.ship ? a.ship : pl;
    W.lastRumor = c;
    return 'Seismic echo off ' + c.b.name + ', bearing ' + String(bearing(src, c)).padStart(3, '0') + ', about ' + (ds(c, src) / 1000).toFixed(1) + ' km. ' +
      (c.kind === 'void' ? 'Hollow. Sealed — bring a laser.' : c.kind === 'vein' ? 'Metal signature. Au-Pt, if the array agrees.' : c.kind === 'signal' ? 'Structured. Somebody built something in there.' : 'Mass in a dark hold.');
  }
  const g = pk(Math.random, ['fe', 'ice', 'food', 'fuel', 'parts']), b = bestBuy(g), s = bestSell(g, b);
  return b && s ? GD[g].n + ': ' + b.name + ' sits at ' + price(b, g) + '₡, ' + s.name + ' pays ' + price(s, g) + '₡. That gap is your fuel bill and then some.'
    : 'Kings are hitting the far lanes. Fly with a gun or fly with company.';
}

export function agentLine(a) {
  if (a.role === 'hand') return 'Station work now. ' + (a.favor > 0 ? 'I have not forgotten who pulled me out of that pod.' : 'Hull gone. Credits gone. Still breathing.');
  if (a.role === 'fence') return 'I buy what customs will not look at. Stims, artifacts, crystals. No ledger.';
  if (a.role === 'pirate') return a.grudge > 3 ? 'You have made an impression on me. Not a good one.' : 'The belt taxes everyone. I collect early.';
  if (a.role === 'security') return 'Patrol thin, rocks thick. Keep your transponder honest.' + (a.kills ? ' ' + a.kills + ' Kings hulls on my board.' : '');
  if (a.role === 'miner') return 'Rock is ' + (a.cargo.fe ? 'cutting fine' : 'giving nothing today') + '. ' + (a.caution > 0.6 ? 'I fly slow and clamp clean.' : 'I fly hungry and clamp fast.');
  if (a.role === 'scav') return 'Every wreck is a paycheck. I follow the Kings around and pick up after them.';
  return (a.state === 'trade' ? 'Sitting docked, working the market.' : a.state === 'flee' ? 'Running from the Kings.' : 'Hauling to market.') + ' Credits: ' + fm(a.credits) + '₡.';
}

export function talk(cr, b) {
  const a = cr.ag, seed = (a ? a.id : 7) * 77 + 13;
  if (!a) {
    dialog({ name: 'Station Hand', role: b.name, fac: b.fac || 'coop', seed, text: rumor(null),
      ch: [{ l: 'Ask about work', f: () => { closeDialog(); openStation(b, 'jobs'); } }, { l: 'Leave', f: closeDialog }] });
    return;
  }
  const ch = [];
  if (a.role === 'fence') ch.push({ l: 'Sell contraband & valuables', f: () => {
    let e = 0;
    for (const g of ['stims', 'art', 'crys', 'au']) { const q = pl.cargo[g] || 0; if (!q) continue; e += q * Math.round(GD[g].p * 1.45); delete pl.cargo[g]; }
    stats(pl);
    if (e) { pl.credits += e; W.stats.earned += e; addRep('kings', 3); AU.cash(); }
    dialog({ name: a.name, role: 'FENCE · VOID KINGS', fac: 'kings', seed, text: e ? '"Clean. ' + fm(e) + '₡, no ledger entry."' : '"Nothing I want. Stims, artifacts, crystals, fines."', ch: [{ l: 'Leave', f: closeDialog }] });
  } });
  ch.push({ l: 'Rumors', f: () => dialog({ name: a.name, role: a.role.toUpperCase(), fac: a.fac, seed, text: rumor(a), ch: [{ l: 'Back', f: () => talk(cr, b) }, { l: 'Leave', f: closeDialog }] }) });
  ch.push({ l: 'How are you holding up?', f: () => dialog({ name: a.name, role: a.role.toUpperCase(), fac: a.fac, seed, text: agentLine(a), ch: [{ l: 'Back', f: () => talk(cr, b) }, { l: 'Leave', f: closeDialog }] }) });
  if (a.favor > 0 && a.role !== 'fence') ch.push({ l: 'Call in the favor', f: () => {
    const gift = Math.min(600, Math.floor(a.credits * 0.3)); a.credits -= gift; pl.credits += gift; a.favor--; AU.cash();
    dialog({ name: a.name, role: a.role.toUpperCase(), fac: a.fac, seed, text: '"Take it. ' + fm(gift) + '₡. We are square-ish."', ch: [{ l: 'Leave', f: closeDialog }] });
  } });
  ch.push({ l: 'Leave', f: closeDialog });
  dialog({ name: a.name, role: a.role.toUpperCase() + ' · ' + a.fac, fac: a.fac, seed,
    text: (a.grudge > 4 ? a.name + ' looks at you the way you look at a hull breach.' : a.favor > 0 ? a.name + ' straightens up. "You are the one who pulled me out."' : a.name + ' sizes up your suit, then your ship.') + ' ' + agentLine(a), ch });
}
