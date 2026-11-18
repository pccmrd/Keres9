// ═══ bar talk & rumours ═════════════════════════════════════════════════
import { pk, fm, hy } from './core/util.js';
import { GD } from './core/config.js';
import { W, G } from './core/state.js';
import { price } from './economy.js';
import { SITES } from './world/gen.js';

const LINES = [
  'KERES-9 ran the catalog for six years. One solar storm and it forgot every rock the haul engines ever parked. Now we survey by hand.',
  'Helion Minerals were staking bodies before the catalog went dark. Funny how their transponders are on rocks nobody officially owns.',
  'The haul engines never stopped. Every few minutes another one parks something new in the band, and nobody knows what it is.',
  'Ice down at the Depot sells for twice what it does up here. If you had a lander, you would be rich by Thursday.',
  'Lu has been running crews since the lift opened. She has never lost a hand. She has docked a few shares, though.',
  'Comets come in venting. Cut into one and you get volatiles the Mars ships pay through the nose for.',
  'The cable is the only thing on the Moon that hangs straight. Everything else falls.',
];
export function rumor() {
  const r = Math.random();
  if (r < 0.3) {
    const g = pk(Math.random, ['ice', 'fe', 'vol', 'pgm']), L = W.stations.filter(s => s.econ && !s.gone);
    let lo = null, hi = null;
    for (const s of L) { const p = price(s, g); if (!lo || p < price(lo, g)) lo = s; if (!hi || price(s, g, true) > price(hi, g, true)) hi = s; }
    if (lo && hi && lo !== hi) return GD[g].n + ': ' + lo.name + ' sells at ' + price(lo, g) + '₡, ' + hi.name + ' pays ' + price(hi, g, true) + '₡. Do the math.';
  }
  if (r < 0.5) {
    const un = W.contacts.filter(c => !c.done && !c.b.hidden && (c.kind === 'claim' || c.kind === 'core'));
    if (un.length) { const c = pk(Math.random, un); return 'Drone pilots keep pinging something odd inside ' + c.b.name + ' — ' + (c.kind === 'claim' ? 'a transponder where there should not be one.' : 'cold, structured, very old electronics.') + ' About ' + fm(hy(c.x - SITES.sel.x, c.y - SITES.sel.y)) + ' m from SELENE HIGH.'; }
  }
  if (r < 0.6 && G.story >= 9 && W.orphan) return 'Everyone is talking about the Orphan. Half a kilometre of metal and a Helion beacon nobody admits to.';
  return pk(Math.random, LINES);
}
export function agentLine(a) {
  if (a.role === 'hauler') return 'Bulk run between the stations. Same lane every day. Credits: ' + fm(a.credits) + '₡.';
  if (a.role === 'pros') return a.rock ? 'Working ' + a.rock.name + '. ' + (a.rock.cat ? 'At least it is on the books now.' : 'Uncatalogued. Could be anything in there.') : 'Between rocks. Looking.';
  if (a.role === 'lander') return 'Rim shuttle. Down the well, up the well. My knees hate gravity.';
  return 'Catalog drone operator. We map what the haul engines drop. Too slow, the office says.';
}
