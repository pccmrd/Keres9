// ═══ directional array: tune & track resonances ═════════════════════════
import { $, hy, ad } from './core/util.js';
import { C, PAL } from './core/config.js';
import { W, pl, ev, PC } from './core/state.js';
import { cw } from './world/body.js';
import { alive, mw } from './ships.js';
import { bit } from './fx.js';
import { AU } from './audio.js';
import { addRep, feed } from './economy.js';
import { story } from './missions.js';
import { toast } from './ui.js';

export function scanOrg() {
  if (ev) return { x: ev.x, y: ev.y, a: ev.a, r: C.EVA.ping * 1.7 };
  const m = alive(pl, 'scan')[0], w = m ? mw(pl, m) : pl;
  return { x: w.x, y: w.y, a: pl.a, r: pl.scanR };
}
/** a contact's current (drifting) resonance */
export const contactFreq = c => c.f + Math.sin(W.time * 0.35 + c.ph) * 1.8 + Math.sin(W.time * 0.11 + c.ph * 2) * 0.9;

export function updScan(dt) {
  PC.list.length = 0; PC.sig = 0;
  if (!PC.scan || ev) { PC.lock = 0; $('lockF').style.width = '0%'; return; }
  const o = scanOrg();
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
    ? `CONTACT ▸ ${best.label} · ${Math.round(hy(best.x - o.x, best.y - o.y))}m · signal ${Math.round(bs * 100)}% · HOLD THE LOCK`
    : 'no resonance in cone — sweep the nose across rock, retune the dial';
  $('fVal').textContent = PC.freq.toFixed(1) + ' kHz';
}

export function resolve(c) {
  c.done = true; PC.lock = 0; PC.lockC = null; W.stats.found++; AU.chime();
  bit({ x: c.x, y: c.y, vx: 0, vy: 0, life: 0.9, max: 0.9, s: 10, c: PAL.mag, t: 'ring' });
  let msg = '';
  if (c.kind === 'void' || c.kind === 'signal') {
    let ch = null, bd = 1e9;
    for (const q of c.b.cham) { const w = cw(c.b, q.cx, q.cy), d = hy(w.x - c.x, w.y - c.y); if (d < bd) { bd = d; ch = q; } }
    if (ch) { ch.disc = true; msg = ch.hide ? 'HIDDEN HIDEOUT beyond the wall. Mine a breach.' : 'HOLLOW CHAMBER · ' + ch.biome + ' biome · sealed. Mine the wall.'; }
  } else if (c.kind === 'vein') { c.b.veinOn = true; msg = 'ORE VEIN RESOLVED — Au-Pt highlighted through rock.'; }
  else if (c.kind === 'beacon') { msg = 'DISTRESS SOURCE PINNED — ' + c.label; }
  else { c.b.cacheOn = true; for (const p of W.picks) if (hy(p.x - c.b.x, p.y - c.b.y) < c.b.rad) p.rev = W.time + 40; msg = 'CARGO MASS RESOLVED — valuables outlined.'; }
  addRep('miners', 2);
  toast('ANOMALY RESOLVED · ' + msg, 'good');
  feed('Array resolved a ' + c.kind + ' contact off ' + c.b.name + '.', 'good');
  story('found', {});
}
