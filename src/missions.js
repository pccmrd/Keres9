// ═══ story: CATALOG ZERO · contracts ════════════════════════════════════
import { fm, rng, pk, ri, hy } from './core/util.js';
import { GD, C } from './core/config.js';
import { W, G, pl, ev } from './core/state.js';
import { SITES } from './world/gen.js';
import { altAt } from './world/moon.js';
import { feed } from './economy.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

export function newGame() {
  return {
    mode: 'title', cr: 240, tier: 1, fleet: [], story: 0, prog: {}, missions: [], jobs: {}, bounty: 0, catalog: [], ride: null, crew: null,
    clock: 0, day: 1, save: 0, sound: true, qty: 1, panel: null, tab: 'market', win: false, jseed: 1, _e: 0, airUp: 1, sackUp: 1, suitUp: 1, cores: 0,
  };
}

const P = () => G.prog;
const inc = (k, n = 1) => (P()[k] = (P()[k] || 0) + n);
export const STORY = [
  { id: 'wake', t: 'MORNING, PROSPECTOR', d: 'Walk east out of HAB 14 (A/D to walk, W to hop) to the SELENE LIFT terminal and step into the lift hall.', r: 0 },
  { id: 'up', t: 'UP THE CABLE', d: 'In the lift hall press F — RIDE LIFT ▲ to SELENE HIGH, 1.4 km up in the synchronous band.', r: 0 },
  { id: 'sign', t: "SIGN ON WITH LU'S CREW", d: 'Float to the CREW OFFICE (upper left room), press F at the terminal and BOARD MULE-3.', r: 0 },
  { id: 'shift', t: 'FIRST SHIFT', d: 'On site: cut rock with [M], let the sack fill, stow it at MULE-3. When the horn sounds, press F at the hatch.', r: 150 },
  { id: 'survey', t: 'EYES ON THE DARK', d: 'Survey 3 uncatalogued bodies — [C] hand scanner on EVA near rock, or a ship array. Bounties pay at the CATALOG OFFICE.', r: 200 },
  { id: 'hull', t: 'YOUR OWN HULL', d: 'Work shifts, sell your finds and save 2,400₡ for a WREN orbital tug at the SELENE HIGH shipyard.', r: 0 },
  { id: 'sell', t: 'SELL TO THE STARS', d: 'Mine from your WREN and sell 8+ units to ARES TRANSIT (Mars), GAIA RETURN (Earth) or VULCAN REFINERY.', r: 300 },
  { id: 'ghost', t: 'GHOST TAGS', d: 'Somebody staked bodies before KERES-9 died. Deep-scan [C, tune the dial] and resolve 2 HELION claim transponders.', r: 400 },
  { id: 'shards', t: "KERES-9'S MEMORY", d: 'Cut 3 KERES-9 core shards out of sealed chambers and hand them in at the CATALOG OFFICE on SELENE HIGH.', r: 1500 },
  { id: 'lander', t: 'DOWN THE WELL', d: 'Ride the lift down and buy a HARE surface lander at SHACKLETON DEPOT (6,500₡).', r: 0 },
  { id: 'launch', t: 'PAD TO ORBIT', d: 'Throttle up off PAD 1, pitch over, climb 1,200 m into the band and dock or harpoon on. All manual.', r: 500 },
  { id: 'water', t: 'WATER FOR THE RIM', d: 'Fly ice down the well: sell 20 Water Ice at SHACKLETON DEPOT from the HARE on the pad.', r: 900 },
  { id: 'orphan', t: 'STAKE THE ORPHAN', d: 'The Orphan is on your chart. Cut into its platinum heart and sell 12 Platinum Group to GAIA RETURN.', r: 2500 },
  { id: 'file', t: 'FILE THE CLAIM', d: 'At the CATALOG OFFICE, file the Orphan claim in your own name — and the KERES-9 logs with it.', r: 0 },
  { id: 'free', t: 'FREE PROSPECTOR', d: 'The band is yours: catalog it, mine it, fly it. Contracts refresh on every station board.', r: 0 },
];
export const storyObj = () => STORY[Math.min(G.story, STORY.length - 1)];

function done(text) {
  const s = storyObj();
  if (s.r) { G.cr += s.r; W.stats.earned += s.r; }
  AU.chime();
  hooks.toast('✓ ' + s.t + (s.r ? ' · +' + fm(s.r) + '₡' : '') + (text ? ' — ' + text : ''), 'good');
  feed('Milestone: ' + s.t, 'good');
  G.story++;
  const n = storyObj();
  setTimeout(() => hooks.toast('NEXT ▸ ' + n.t + ' — ' + n.d, 'warn'), 1600);
  hooks.storyStep && hooks.storyStep(G.story);
  check(); // chained milestones (e.g. already own a WREN)
}

/** world events feed the story */
export function story(ev0, a = {}) {
  const s = storyObj(); if (!s) return;
  if (ev0 === 'catalog') inc('cat');
  if (ev0 === 'sold') { if (a.st.transfer || a.st === SITES.vul) inc('sold', a.k); if (a.st === SITES.depot && a.g === 'ice') inc('ice', a.k); if (a.st === SITES.gaia && a.g === 'pgm') inc('pgm', a.k); }
  if (ev0 === 'resolved' && a.kind === 'claim') inc('claims');
  switch (s.id) {
    case 'wake': if (ev0 === 'room' && a.kind === 'lift' && a.b === SITES.lift) done('the cars run every couple of minutes'); break;
    case 'up': if (ev0 === 'lift' && a.top) done('welcome to SELENE HIGH'); break;
    case 'sign': if (ev0 === 'board') done('MULE-3 is lifting'); break;
    case 'shift': if (ev0 === 'shift' && a.n >= 1) done('you are a hand now'); break;
    case 'survey': if (P().cat >= 3) done('the office pays per body'); break;
    case 'hull': if (G.fleet.some(q => q.cls === 'wren' && !q.dead)) done('she is slow, but she is yours'); break;
    case 'sell': if (P().sold >= 8) done('volume is money'); break;
    case 'ghost': if (P().claims >= 2) done('HELION MINERALS has been busy'); break;
    case 'shards': if (G.cores >= 3) { if (W.orphan) W.orphan.hidden = false; done('the logs show a body KERES-9 flagged hours before it died — the Orphan'); } break;
    case 'lander': if (G.fleet.some(q => q.cls === 'hare' && !q.dead)) done('PAD 1 is yours'); break;
    case 'launch': if (ev0 === 'orbitdock') done('pad to orbit, hands on'); break;
    case 'water': if (P().ice >= 20) done('the Rim drinks tonight'); break;
    case 'orphan': if (P().pgm >= 12) done('GAIA RETURN logged the provenance'); break;
    case 'file': if (ev0 === 'filed') { G.win = true; done(); hooks.win && hooks.win(); } break;
  }
}
/** re-evaluate passive milestones */
export function check() {
  const s = storyObj(); if (!s) return;
  if (['survey', 'hull', 'sell', 'ghost', 'shards', 'lander', 'water', 'orphan'].includes(s.id)) story('tick');
}

// ─── contracts ───────────────────────────────────────────────────────────
const ORB = () => [SITES.sel, SITES.vul, SITES.ares, SITES.gaia].filter(s => !s.gone);
export function mkJobs(st) {
  if (!st.econ || st.surf && st !== SITES.depot && st !== SITES.tycho) return;
  const r = rng((G.jseed++ * 7919) ^ W.seed), L = [];
  for (let k = 0; k < 3; k++) {
    const q = r();
    if (q < 0.45) {
      const to = pk(r, [...ORB(), SITES.depot, SITES.tycho].filter(x => x !== st)), g = pk(r, to.transfer ? (to.transfer.dest === 'mars' ? ['ice', 'vol', 'food'] : ['pgm', 'ree', 'fe']) : to.surf ? ['ice', 'fe', 'vol'] : ['fe', 'ice', 'parts']);
      const n = g === 'pgm' || g === 'ree' ? ri(r, 3, 6) : ri(r, 8, 20);
      const reward = Math.round(n * GD[g].p * (to.surf ? 1.6 : 1.25) + 60);
      L.push({ id: 'j' + G.jseed + k, kind: 'deliver', g, n, got: 0, to: to.name, from: st.name, reward, title: 'DELIVER ' + n + ' ' + GD[g].n.toUpperCase(), desc: 'Deliver ' + n + ' ' + GD[g].n + ' to ' + to.name + (to.surf ? ' (surface — lander required)' : '') + '. Sell it there to count.' });
    } else if (q < 0.8) {
      const cand = W.rocks.filter(b => !b.cat && !b.hidden && hy(b.x - st.x, b.y - st.y) < 3500);
      const b = pk(r, cand); if (!b) continue;
      L.push({ id: 'j' + G.jseed + k, kind: 'survey', body: b.uid, to: b.name, from: st.name, reward: 120 + Math.round(b.R * 3), title: 'SURVEY ' + b.name, desc: 'Catalog Office wants eyes on ' + b.name + ' (' + Math.round(hy(b.x - st.x, b.y - st.y)) + ' m out). Survey it with a hand scanner or array.' });
    } else {
      const g = pk(r, ['food', 'parts']), n = ri(r, 6, 14), from = g === 'food' ? SITES.depot : SITES.tycho, to = SITES.sel;
      L.push({ id: 'j' + G.jseed + k, kind: 'deliver', g, n, got: 0, to: to.name, from: st.name, reward: Math.round(n * GD[g].p * 1.5 + 140), title: 'UP-WELL RUN · ' + GD[g].n.toUpperCase(), desc: 'Buy ' + n + ' ' + GD[g].n + ' at ' + from.name + ' (surface) and sell it at SELENE HIGH. Lander work.' });
    }
  }
  G.jobs[st.name] = L;
}
export function accept(st, id) {
  if (G.missions.length >= 3) { hooks.toast('Three contracts max', 'warn'); return; }
  const j = (G.jobs[st.name] || []).find(x => x.id === id); if (!j) return;
  G.missions.push(j); G.jobs[st.name] = G.jobs[st.name].filter(x => x !== j);
  AU.ui(); hooks.toast('CONTRACT SIGNED · ' + j.title, 'good');
}
export function drop(id) { G.missions = G.missions.filter(j => j.id !== id); }
function pay(j) {
  G.missions = G.missions.filter(x => x !== j); G.cr += j.reward; W.stats.earned += j.reward; AU.cash();
  hooks.toast('CONTRACT COMPLETE · ' + j.title + ' · +' + fm(j.reward) + '₡', 'good'); feed('Contract closed: ' + j.title, 'good');
}
export function jobSold(st, g, k) { for (const j of [...G.missions]) if (j.kind === 'deliver' && j.to === st.name && j.g === g) { j.got += k; if (j.got >= j.n) pay(j); } }
export function jobCatalog(b) { for (const j of [...G.missions]) if (j.kind === 'survey' && j.body === b.uid) pay(j); }
export { C, pl, ev, altAt };
