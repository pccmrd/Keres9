// ═══ directional array: catalog surveys + tune & track deep resonances ══
import { $, hy, ad } from './core/util.js';
import { C, PAL } from './core/config.js';
import { W, pl, ev, PC } from './core/state.js';
import { cw } from './world/body.js';
import { alive, mw } from './ships.js';
import { bit } from './fx.js';
import { AU } from './audio.js';
import { feed } from './economy.js';
import { hooks } from './hooks.js';

export function scanOrg() {
  if (ev || !pl) { const e = ev || { x: 0, y: 0, a: 0 }; return { x: e.x, y: e.y, a: e.a, r: C.EVA.ping * 1.7 }; }
  const m = alive(pl, 'scan')[0], w = m ? mw(pl, m) : pl;
  return { x: w.x, y: w.y, a: pl.a, r: pl.scanR };
}
/** a contact's current (drifting) resonance */
export const contactFreq = c => c.f + Math.sin(W.time * 0.35 + c.ph) * 1.8 + Math.sin(W.time * 0.11 + c.ph * 2) * 0.9;

export function updScan(dt) {
  PC.list.length = 0; PC.sig = 0; PC.survey = null;
  if (!PC.scan || ev || !pl) { PC.lock = 0; $('lockF').style.width = '0%'; return; }
  const o = scanOrg();
  // broad survey: any uncatalogued body in the cone accrues survey time
  let sv = null, sp = -1;
  for (const b of W.rocks) {
    if (b.cat || b.dead) continue;
    const dx = b.x - o.x, dy = b.y - o.y, d = hy(dx, dy) - b.rad * 0.6;
    if (d > o.r) continue;
    const half = Math.atan2(b.rad, Math.max(1, hy(dx, dy)));
    if (Math.abs(ad(Math.atan2(dy, dx), o.a)) > C.SCAN.cone + half) continue;
    b.survey = (b.survey || 0) + dt / (C.SCAN.survey * (0.6 + b.R / 40));
    if (b.survey > sp) { sp = b.survey; sv = b; }
    if (b.survey >= 1) hooks.onCatalog(b, 'array');
  }
  if (sv && !sv.cat) PC.survey = { b: sv, p: Math.min(1, sv.survey) };
  // deep contacts at unknown frequencies
  let best = null, bs = 0;
  for (const c of W.contacts) {
    if (c.done) continue;
    const dx = c.x - o.x, dy = c.y - o.y, d = hy(dx, dy);
    if (d > o.r || Math.abs(ad(Math.atan2(dy, dx), o.a)) > C.SCAN.cone) continue;
    const f = contactFreq(c), e = Math.abs(PC.freq - f);
    const s = e < C.SCAN.band ? (1 - e / C.SCAN.band) * (1 - (d / o.r) * 0.45) : 0;
    PC.list.push({ c, f, s, d });
    if (s > bs) { bs = s; best = c; }
  }
  PC.sig = bs;
  if (best && bs > 0.05) {
    if (PC.lockC !== best) { PC.lockC = best; PC.lock = 0; }
    PC.lock = Math.min(1, PC.lock + dt * bs * 0.62);
    if (Math.random() < dt * (2 + bs * 26)) AU.geiger();
    if (Math.random() < dt * 4) AU.tick(bs);
    if (PC.lock >= 1) resolve(best);
  } else { PC.lock = Math.max(0, PC.lock - dt * 0.5); PC.lockC = null; }
  $('lockF').style.width = PC.lock * 100 + '%';
  $('sLabel').textContent = best
    ? `DEEP CONTACT ▸ ${best.label} · ${Math.round(hy(best.x - o.x, best.y - o.y))}m · signal ${Math.round(bs * 100)}% · HOLD THE LOCK`
    : PC.survey ? `SURVEYING ${PC.survey.b.name} · ${Math.round(PC.survey.p * 100)}% — keep it in the cone` : 'sweep the cone across bodies · uncatalogued rock is surveyed automatically · drag the dial for deep resonances';
  $('fVal').textContent = PC.freq.toFixed(1) + ' kHz';
}

export function resolve(c) {
  c.done = true; PC.lock = 0; PC.lockC = null; W.stats.found++; AU.chime();
  bit({ x: c.x, y: c.y, vx: 0, vy: 0, life: 0.9, max: 0.9, s: 10, c: c.kind === 'claim' ? PAL.helion : PAL.mag, t: 'ring' });
  let msg = '';
  const ch = nearestCham(c);
  if (ch) ch.disc = true;
  if (c.kind === 'void') msg = 'HOLLOW CHAMBER · ' + (ch ? ch.biome : '') + ' · sealed. Cut through the wall.';
  else if (c.kind === 'vug') msg = 'METAL VUG — platinum-group crystals lining a sealed pocket.';
  else if (c.kind === 'vein') { c.b.veinOn = true; msg = 'ORE VEIN RESOLVED — platinum-group highlighted through rock.'; }
  else if (c.kind === 'claim') msg = 'HELION MINERALS claim transponder — on an UNCATALOGUED body. Somebody staked this before the catalog went dark.';
  else if (c.kind === 'core') msg = 'KERES-9 CORE SHARD — a memory lattice from the dead catalog, sealed in rock. Cut it out and carry it home.';
  else if (c.kind === 'beacon') msg = 'SOURCE PINNED — ' + c.label;
  hooks.toast('DEEP SCAN · ' + msg, 'good');
  feed('Array resolved a ' + c.kind + ' contact inside ' + c.b.name + '.', 'good');
  hooks.resolved && hooks.resolved(c);
}
function nearestCham(c) {
  if (!c.b || !c.b.cham) return null;
  let ch = null, bd = 1e9;
  for (const q of c.b.cham) { const w = cw(c.b, q.cx, q.cy), d = hy(w.x - c.x, w.y - c.y); if (d < bd) { bd = d; ch = q; } }
  return bd < c.b.cs * 6 ? ch : null;
}
