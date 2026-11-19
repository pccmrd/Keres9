// ═══ AI PLAYER ══════════════════════════════════════════════════════════
// Plays the whole career with the same controls a human uses: sticks (in
// screen frame), throttle rail, buttons, key edges and the station panels.
// Each "act" is a generator that runs one frame per `yield`.
import { $, cl, hy, ad, fm, TAU } from '../core/util.js';
import { C, GD, MAT, CLS } from '../core/config.js';
import { W, G, pl, ev, cam, PC } from '../core/state.js';
import { ca, cw, near, ray } from '../world/body.js';
import { SITES } from '../world/gen.js';
import { cmass, integ, alive, mw } from '../ships.js';
import { boardable, sackN, inBody } from '../eva.js';
import { contactFreq } from '../scanner.js';
import { price } from '../economy.js';
import { STORY, drop as dropJob } from '../missions.js';
import { mode, closeDialog, stationOpen, closeStation } from '../ui.js';
import { defZoom } from '../player.js';
import { IN, showStick } from '../input.js';
import { inp, NAV, resetInp, press, stickW, fly, flyRoute, approachPort, approachPad, evaRoute, jetTo, evaFace, tel, engineOK, standoff, portW } from './nav.js';

export const AP = { on: false, demo: false, task: null, act: '—', cap: '', sub: '', warp: 1, log: [], metaT: 0, started: 0, zoomK: 1, intT: 0, fail: {} };

// ─── captions & helpers ──────────────────────────────────────────────────
const say = (cap, sub) => { if (cap !== AP.cap) { AP.log.push(Math.round(W.time) + 's ' + cap); if (AP.log.length > 400) AP.log.shift(); } AP.cap = cap; if (sub !== undefined) AP.sub = sub; };
const log = m => { AP.log.push(Math.round(W.time) + 's · ' + m); if (AP.log.length > 400) AP.log.shift(); };
const act = t => { AP.act = t; };
const sIdx = id => STORY.findIndex(s => s.id === id);
const at = id => G.story === sIdx(id);
const past = id => G.story > sIdx(id);
function* wait(s, fn) { for (let t = 0; t < s; t += NAV.dt) { fn && fn(t); yield; } }
function* until(cond, s, fn) { for (let t = 0; t < s; t += NAV.dt) { if (cond()) return true; fn && fn(t); yield; } return cond(); }
function* clickUI(sel, pause = 0.6) {
  const b = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!b || b.disabled) return false;
  b.classList.add('aiPick'); yield* wait(pause * 0.6); b.click(); b.classList.remove('aiPick'); yield* wait(pause * 0.4);
  return true;
}
function* tab(t) { const b = document.querySelector(`#sTabs button[data-t="${t}"]`); if (b && !b.classList.contains('act')) yield* clickUI(b, 0.5); }
function* closePanel() { if (stationOpen()) yield* clickUI('#sX', 0.4); }
const fleet = cls => G.fleet.find(s => s.cls === cls && !s.dead);
const onSurface = o => o && tel(o).alt < 300;
const ctxK = () => PC.ctx && PC.ctx.k;
function rmPos(st, kind) { const rm = st.rooms.find(r => r.kind === kind); if (!rm) return null; return cw(st, rm.x + rm.w / 2 - 0.5, rm.y + rm.h / 2 - 0.5); }
const hareP = () => CLS.hare.price, wrenP = () => CLS.wren.price;
/** nearest place that will sell us propellant (orbital port for a tug; the Depot pad for a lander on the ground) */
function fuelStop() {
  if (pl.cls === 'hare' && onSurface(pl)) return SITES.depot;
  let best = SITES.sel, bd = 1e9;
  for (const s of W.stations) {
    if (!s.econ || s.surf || s.gone || s.leaving || s.transfer || !s.ports || !s.ports.length) continue;
    const d = hy(s.x - pl.x, s.y - pl.y); if (d < bd) { bd = d; best = s; }
  }
  return best;
}
/** propellant we must keep to get home: start/stop Δv (k = u per m/s on the main engine) plus ~0.012 u/m of band
 *  transit (arc routing + RCS: measured 0.005–0.008 u/m for WREN/HARE) plus a docking margin */
const reserve = () => {
  const st = fuelStop(), k = pl.burn / Math.max(0.1, pl.thrust);
  // off the band (below synchronous radius) the climb back is paid on the main engine against gravity
  const off = onSurface(pl) ? 0 : Math.abs(hy(pl.x, pl.y) - C.RS) * 0.05;
  return Math.max(pl.fuelMax * 0.22, pl.fuelMax * 0.06 + 6 + k * 40 + hy(st.x - pl.x, st.y - pl.y) * 0.012 + off);
};

// ─── EVA acts ────────────────────────────────────────────────────────────
function* walkTo(x, y, tol = 3, secs = 150, ref = null) {
  let path = null, i = 0, rt = 0, best = 1e9, bestT = 0, ax = ev ? ev.x : 0, ay = ev ? ev.y : 0, aT = 0, kick = 0, kicks = 0, kx = 0, ky = 0;
  for (let t = 0; t < secs; t += NAV.dt) {
    if (!ev || ev.hide) return false;
    const d = hy(x - ev.x, y - ev.y);
    if (d < tol) return true;
    if (d < best - 1) { best = d; bestT = t; }
    // pinned against structure well short of the goal (no real displacement for 4 s, ): kick out along the freest direction, then re-route
    if (hy(ev.x - ax, ev.y - ay) > 0.5) { ax = ev.x; ay = ev.y; aT = t; }
    else if (t - aT > 4 && kick <= 0 && d > tol + 6 && kicks < 3) {
      kicks++;
      let bd = -1;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, ux = Math.cos(a), uy = Math.sin(a), h = ray(ev.x, ev.y, ux, uy, 20), f = (h ? h.d : 20) + (ux * (x - ev.x) + uy * (y - ev.y)) / d * 3; if (f > bd) { bd = f; kx = ux; ky = uy; } }
      kick = 0.45; aT = t; path = null; log('suit pinned — kicking free');
    }
    if (kick > 0) { kick -= NAV.dt; if (hy(ev.vx, ev.vy) < 5) stickW(kx, ky); yield; continue; }   // short and gentle: suits take damage over 7 m/s
    if ((rt -= NAV.dt) <= 0 || !path) { path = evaRoute(x, y); i = 0; rt = 1.6; }
    while (i < path.length - 1 && hy(path[i].x - ev.x, path[i].y - ev.y) < 2.6) { i++; if (path.hop) rt = 0; }
    jetTo(path[i].x, path[i].y, i === path.length - 1 ? 7 : 9, ref);
    if (t - bestT > 25) return false;   // not getting anywhere
    yield;
  }
  return false;
}
function* useRoom(st, kind, tabName) {
  const p = rmPos(st, kind); if (!p) return false;
  yield* walkTo(p.x, p.y, 4);
  yield* until(() => PC.ctx.f && ['crew', 'terminal'].includes(ctxK()), 6, () => jetTo(p.x, p.y, 3));
  if (!PC.ctx.f) return false;
  press('ctx'); yield* until(stationOpen, 2);
  if (tabName) yield* tab(tabName);
  return stationOpen();
}
function* rideLift(top) {
  const st = top ? SITES.lift : SITES.sel, p = rmPos(st, 'lift');
  act(top ? 'UP THE CABLE' : 'DOWN THE CABLE');
  say(top ? 'Walking to the lift hall — the cable runs 1.4 km straight up to SELENE HIGH.' : 'Back to the lift dock. Going down the well.');
  if (!(yield* walkTo(p.x, p.y, 5))) return false;
  say('Waiting for the car…');
  yield* until(() => ctxK() === 'lift', 120, () => jetTo(p.x, p.y, 3));
  if (ctxK() !== 'lift') return false;
  yield* wait(0.4); press('ctx');
  yield* until(() => G.ride, 2);
  say(top ? 'Riding up. The Rim drops away; the band of parked rocks fills the sky.' : 'Riding down. Shackleton\'s rim rises to meet the car.');
  yield* until(() => !G.ride, 120, () => { AP.wantWarp = true; });
  return true;
}
/** choose an ore-bearing surface cell on a body near a point */
const BAD = new Set();
function oreCell(b, nx, ny, R = 60, gold = false) {
  const open = (x, y) => x < 0 || y < 0 || x >= b.gw || y >= b.gh || !b.sol[y * b.gw + x];
  const c0 = Math.cos(b.a), s0 = Math.sin(b.a);
  let best = null, bc = 1e9;
  for (let cy = 0; cy < b.gh; cy++) for (let cx = 0; cx < b.gw; cx++) {
    const i = cy * b.gw + cx, m = b.sol[i]; if (!m || m === 7 || BAD.has(b.uid * 1e5 + i)) continue;
    // exposed faces only: remember which side is open (that's where we hover)
    let od = null; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(cx + ox, cy + oy) && open(cx + ox * 2, cy + oy * 2) && open(cx + ox * 3, cy + oy * 3)) { od = [ox, oy]; break; }
    if (!od) continue;
    const w = cw(b, cx, cy), d = hy(w.x - nx, w.y - ny); if (d > R) continue;
    const ore = MAT[m].ore && MAT[m].ore !== 'parts' ? GD[MAT[m].ore].p : 1.5;
    const c = d - ore * (gold ? 1.8 : 0.9);
    if (c < bc) { bc = c; const dx = od[0] * c0 - od[1] * s0, dy = od[0] * s0 + od[1] * c0; best = { cx, cy, x: w.x, y: w.y, m: MAT[m].ore && MAT[m].ore !== 'parts' ? m : 0, sx: w.x + dx * b.cs * 2.6, sy: w.y + dy * b.cs * 2.6, key: b.uid * 1e5 + i }; }
  }
  return best;
}
/** EVA cutting near the shuttle until the sack is full or the horn blows */
function* evaCut(site, home, stop) {
  for (let k = 0; k < 40 && !stop(); k++) {
    const tgt = oreCell(site, home.x, home.y, 70);
    if (!tgt) { yield* wait(1); continue; }
    const sx = tgt.sx, sy = tgt.sy;
    say('Cutting ' + (tgt.m ? GD[MAT[tgt.m].ore].n : 'rock') + ' — the hand cutter is slow, but the sack fills itself.', 'SACK ' + sackN(ev) + '/' + Math.floor(C.EVA.sack * (G.sackUp || 1)));
    if (!(yield* walkTo(sx, sy, 3, 25, site))) { BAD.add(tgt.key); continue; }
    const a = 0;
    for (let t = 0; t < 14 && !stop(); t += NAV.dt) {
      jetTo(sx, sy, 2, site);
      const e = evaFace(Math.atan2(tgt.y - ev.y, tgt.x - ev.x));
      inp.mine = e < 0.5;
      if (!site.sol[tgt.cy * site.gw + tgt.cx] && t > 0.5) break;
      AP.sub = 'SACK ' + sackN(ev) + '/' + Math.floor(C.EVA.sack * (G.sackUp || 1)) + ' · air ' + Math.round(ev.suit) + '%';
      yield;
    }
    void a;
  }
}
function* stowAt(s) {
  say('Back to MULE-3 to stow the sack in the crew tally.');
  yield* walkTo(s.x, s.y, 9, 40, s);
}
/** a full crew shift, from the crew office back to the office */
function* crewShift() {
  act('CREW SHIFT');
  const c = G.crew;
  if (c.state === 'idle') {
    say('Crew office. Foreman Lu runs EVA crews out to uncatalogued rocks.');
    if (!(yield* useRoom(SITES.sel, 'crew', 'crew'))) return;
    yield* wait(1.2);
    if (!(yield* clickUI('#pBody button[data-a="shift"]', 0.9))) { yield* closePanel(); return; }
    say('Aboard MULE-3 with two crewmates. Lu flies; we ride.');
  }
  yield* until(() => c.state === 'site' || c.state === 'idle', 160, () => { AP.wantWarp = true; });
  if (c.state !== 'site') return;
  const site = c.site, s = c.ship;
  // first: survey the site with the hand scanner (Catalog Office bounty)
  yield* wait(0.8);
  if (!site.cat) { say('Hand scanner ping — ' + site.name + ' is not in any catalog. First survey pays.'); press('scan'); yield* wait(1.2); }
  // a neighbour nobody has surveyed? jet over for a quick ping if it's close
  const nb = W.rocks.find(b => !b.cat && !b.hidden && b !== site && hy(b.x - ev.x, b.y - ev.y) - b.rad < 220);
  if (nb && c.t > 140) {
    say('Another uncatalogued body ' + Math.round(hy(nb.x - ev.x, nb.y - ev.y) - nb.rad) + ' m off — jetting over to ping it.');
    const p = standoff(nb, ev.x, ev.y, 30);
    yield* walkTo(p.x, p.y, 8, 50);
    press('scan'); yield* wait(1);
  }
  const full = () => sackN(ev) >= Math.floor(C.EVA.sack * (G.sackUp || 1)) - 1;
  // seconds of air left vs. the trip back (routes bend round the rock, so pad it generously)
  const storm = () => !!(W.flare && (W.flare.on || W.flare.warn > 0));   // warning counts: 40 s to get under the MULE's roof
  const airLow = () => ev.suit * C.EVA.air * (G.airUp || 1) / 100 / (storm() ? 3.5 : 1) < hy(ev.x - s.x, ev.y - s.y) / 4 + 30;
  while (c.state === 'site' && !c.horn && ev && !ev.hide) {
    yield* evaCut(site, s, () => full() || c.horn || airLow() || storm() || hy(ev.x - s.x, ev.y - s.y) > 160);
    if (!ev || ev.hide) break;
    if (hy(ev.x - s.x, ev.y - s.y) > 160) { log(`drifted ${Math.round(hy(ev.x - s.x, ev.y - s.y))} m from MULE-3 — jetting back`); yield* walkTo(s.x, s.y, 9, 90, s); }
    if (storm()) {
      // proton storm: the MULE's hull is the only shelter — stay inside its air radius until it blows over
      say('Proton storm — sheltering at the MULE until it passes.');
      if (hy(ev.x - s.x, ev.y - s.y) > 9) yield* walkTo(s.x, s.y, 8, 40, s);
      yield* until(() => !storm() || c.horn || !ev || ev.hide, 240, () => jetTo(s.x, s.y, 2, s));
      continue;
    }
    yield* stowAt(s);
    if (ev && !ev.hide && ev.suit < 60) {
      say('Air low — topping up at the MULE.');
      if (hy(ev.x - s.x, ev.y - s.y) > 10) yield* walkTo(s.x, s.y, 8, 40, s);
      yield* until(() => ev.suit > 95 || c.horn, 8, () => jetTo(s.x, s.y, 2, s));
    }
  }
  say('SHIFT HORN. Back to the hatch before Lu reels us in.');
  if (ev && !ev.hide) {
    yield* walkTo(s.x, s.y, 9, 60, s);
    yield* until(() => ctxK() === 'crewboard', 10, () => jetTo(s.x, s.y, 2, s));
    press('ctx');
  }
  say('Heading home. The tally gets split at the office.');
  yield* until(() => c.state === 'idle', 200, () => { AP.wantWarp = true; });
  yield* wait(1);
}
function* catalogOffice() {
  act('CATALOG OFFICE');
  say('Catalog Office: survey bounties' + (G.bounty ? ' (' + fm(G.bounty) + '₡ pending)' : '') + '.');
  if (!(yield* useRoom(SITES.sel, 'catalog', 'catalog'))) return;
  yield* wait(0.8);
  yield* clickUI('#pBody button[data-a="bounty"]');
  yield* clickUI('#pBody button[data-a="cores"]');
  if (at('file')) { say('Filing the Orphan claim. In our name — with the KERES-9 logs attached.'); yield* clickUI('#pBody button[data-a="file"]', 1.2); }
  yield* wait(0.8); yield* closePanel();
}
function* buyShipAt(st, cls) {
  act('SHIPYARD');
  say(cls === 'wren' ? 'Enough saved. A WREN tug: slow, small, ours.' : 'The big one: a HARE surface lander. Pad to orbit and back down.');
  if (!(yield* useRoom(st, 'yard', 'yard'))) return false;
  yield* wait(1);
  const ok = yield* clickUI(`#pBody button[data-a="buyship"][data-c="${cls}"]`, 1);
  yield* wait(1); yield* closePanel();
  return ok;
}
function* boardOwn(s) {
  act('BOARDING');
  say('Out to the ' + s.name + '.');
  // walk out, but stop the moment the BOARD prompt is live (the hull centre itself is unreachable)
  const ready = () => ctxK() === 'board' && boardable() === s;
  const g = walkTo(s.x, s.y, 8, 90);
  while (!ready()) { const r = g.next(); if (r.done) break; yield; }
  yield* until(ready, 15, () => jetTo(s.x, s.y, 3));
  if (!ready()) { log(`could not reach the ${s.name} (${ev ? hy(ev.x - s.x, ev.y - s.y).toFixed(0) : '?'} m, ${s.dock ? s.dock.ty : 'loose'})`); return false; }
  press('ctx'); yield* until(() => pl === s, 2);
  return pl === s;
}
function* sellSack(st) {
  if (!ev || !sackN(ev)) return;
  if (!(yield* useRoom(st, st === SITES.sel ? 'market' : 'market', 'market'))) return;
  yield* sellAll();
  yield* closePanel();
}

// ─── ship acts ───────────────────────────────────────────────────────────
function* undockShip() {
  if (!pl.dock) return;
  yield* closePanel();
  if (pl.dock.ty === 'pad' && pl.tailLand || pl.dock.ty === 'ground') {
    // lift-off is the throttle. Down the well launch() flies the climb; on a station pad in the band
    // just arm (throttle to zero while clamped), ease off the pad and drift clear
    if (pl.dock.ty === 'pad' && pl.dock.b && !pl.dock.b.surf) {
      act('UNDOCK'); say('Easing the HARE off the ' + pl.dock.b.name + ' pad.');
      yield* until(() => PC.thrArm, 1.5, () => { inp.thr = 0; });
      yield* until(() => !pl.dock, 3, () => { inp.thr = 0.3; });
      const px = pl.x, py = pl.y;
      yield* until(() => hy(pl.x - px, pl.y - py) > 30, 6, () => { inp.thr = 0.25; });
      inp.thr = 0;
    }
    return;
  }
  yield* until(() => ['undock', 'release'].includes(PC.alt && PC.alt.k), 2);
  press('alt'); yield* until(() => !pl.dock, 2);
  // back away from whatever we were attached to
  const px = pl.x, py = pl.y, a = pl.a + Math.PI;
  yield* until(() => hy(pl.x - px, pl.y - py) > 25, 8, () => fly(px + Math.cos(a) * 30, py + Math.sin(a) * 30, { vmax: 6, rcsOnly: true, hold: true }));
}
function* flyTo(x, y, o = {}) {
  const tol = o.tol || 8, secs = o.secs || 200;
  let best = 1e9, bestT = 0;
  for (let t = 0; t < secs; t += NAV.dt) {
    if (!pl) return false;   // ship lost mid-leg
    const tt = flyRoute(x, y, o, typeof o.skip === 'function' ? o.skip() : o.skip);   // skip may depend on range
    if (!tt.wp && tt.d < tol && tt.rv < (o.rv || 1.5)) return true;
    // pinned against terrain (burning, going nowhere): give up rather than drain the tank
    const dd = hy(x - pl.x, y - pl.y);
    if (dd < best - 2) { best = dd; bestT = t; }
    else if (dd > Math.max(40, tol * 1.5) && ((t - bestT > 12 && hy(pl.vx, pl.vy) < 1.5) || t - bestT > 35)) {
      log('flyTo stalled ' + Math.round(dd) + ' m short — backing out the open way and abandoning that leg.');
      // wedged in structure: pick the bearing with the most free space and ease out along it
      let ba = 0, bf = -1;
      for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, h = ray(pl.x, pl.y, Math.cos(a), Math.sin(a), 80), f = h ? h.d : 80; if (f > bf) { bf = f; ba = a; } }
      const ox = pl.x + Math.cos(ba) * 35, oy = pl.y + Math.sin(ba) * 35;
      yield* until(() => hy(ox - pl.x, oy - pl.y) < 6, 10, () => fly(ox, oy, { vmax: 5, stop: true }));
      return false;
    }
    if (tt.d > 300 && !o.noWarp) AP.wantWarp = true;
    AP.sub = (tt.mode || '') + ' · ' + Math.round(tt.d) + ' m · ' + hy(pl.vx, pl.vy).toFixed(1) + ' m/s · fuel ' + Math.round(pl.fuel / pl.fuelMax * 100) + '%';
    yield;
  }
  return false;
}
function* dockAt(st, ty = 'port') {
  AP.badPort = AP.badPort || new Map();
  const pk = p => st.name + '#' + st.ports.indexOf(p), bad = p => W.time - (AP.badPort.get(pk(p)) || -1e9) < 600;
  let P = ty === 'pad' ? st.pads.filter(p => !p.occ) : st.ports.filter(p => !p.occ && !(st === SITES.sel && st.ports.indexOf(p) === 2));
  if (ty !== 'pad' && P.some(p => !bad(p))) P = P.filter(p => !bad(p));   // skip a berth that just defeated us
  if (!P.length) return false;
  P.sort((a, b) => { const wa = portW(st, a), wb = portW(st, b); return hy(wa.x - pl.x, wa.y - pl.y) - hy(wb.x - pl.x, wb.y - pl.y); });
  const p = P[0], w0 = portW(st, p);
  act(ty === 'pad' ? 'LANDING' : 'DOCKING');
  say((ty === 'pad' ? 'Final approach to ' : 'Lining up on a berth at ') + st.name + '.');
  const nx = Math.cos(w0.dir), ny = Math.sin(w0.dir);
  if (ty === 'pad') {
    if (!pl.gear) press('gear');
    const hx = w0.x + nx * 140, hy0 = w0.y + ny * 140;
    yield* flyTo(hx, hy0, { tol: 25, vmax: 40, rv: 4, skip: () => (pl && hy(hx - pl.x, hy0 - pl.y) < st.rad + 160 ? st : null) });
    say('Hover. Nose up, gear down, settle on the plume.');
    for (let t = 0; t < 120; t += NAV.dt) {
      if (pl.dock && pl.dock.ty !== 'ground') break;   // sat down on bare regolith beside the pad: keep flying, throttle lifts us off
      const r = approachPad(st, p);
      AP.sub = 'TOUCHDOWN · ' + r.h.toFixed(1) + ' m · lateral ' + r.lat.toFixed(1) + ' · ' + hy(pl.vx, pl.vy).toFixed(1) + ' m/s';
      yield;
    }
    return !!pl.dock && pl.dock.ty === 'pad';
  }
  // route AROUND the station to the berth's approach point; only ignore its hull for the last stretch
  const ax0 = w0.x + nx * (45 + pl.nose), ay0 = w0.y + ny * (45 + pl.nose);
  yield* flyTo(ax0, ay0, { tol: 10, vmax: 35, rv: 2, skip: () => (pl && hy(ax0 - pl.x, ay0 - pl.y) < 70 ? st : null) });
  let bestA = 1e9, bestT = 0;
  for (let t = 0; t < 90; t += NAV.dt) {
    if (pl.dock) break;
    const r = approachPort(st, p);
    if (r.along < bestA - 0.5) { bestA = r.along; bestT = t; }
    else if (t - bestT > 15 && r.along > 4) { log('Berth ' + pk(p) + ' approach hung at ' + r.along.toFixed(1) + ' m — trying another.'); break; }
    const g = PC.assist;
    AP.sub = 'CLAMP · ' + r.along.toFixed(1) + ' m · lat ' + r.lat.toFixed(1) + ' · ' + Math.round(r.ae * 57) + '° · ' + hy(pl.vx, pl.vy).toFixed(2) + ' m/s';
    if (g && g.p === p && g.ok && ctxK() === 'clamp') { press('ctx'); yield; }
    yield;
  }
  if (!pl.dock) AP.badPort.set(pk(p), W.time);
  return !!pl.dock;
}
function* harpoon(b, from, aim) {
  if (!pl || !b || b.dead) return false;
  act('HARPOON');
  const fx = from ? from.x : pl.x, fy = from ? from.y : pl.y;
  // with an aim point, line up the LASER MOUNT (it sits off the centreline) rather than the hull
  const faceA = () => {
    if (!aim) return Math.atan2(b.y - pl.y, b.x - pl.x);
    const m = alive(pl, 'mine')[0], o = m ? mw(pl, m) : pl;
    return Math.atan2(aim.y - o.y, aim.x - o.x);
  };
  const so = standoff(b, fx, fy, pl.rad + 6);
  say('Matching ' + b.name + ' and harpooning on.');
  if (from && hy(from.x - pl.x, from.y - pl.y) > 40) {
    // round a big body in short hops on a ring outside it — the straight line from one face to another runs through it
    const R = b.rad + 40, aT = Math.atan2(from.y - b.y, from.x - b.x);
    // from afar: come in to the ring point above the target face first (outside the bounding circle, so the router can reach it)
    if (hy(pl.x - b.x, pl.y - b.y) > b.rad + 110) yield* flyTo(b.x + Math.cos(aT) * R, b.y + Math.sin(aT) * R, { tol: 25, vmax: 35, rv: 4 });
    for (let k = 0; k < 12 && pl && hy(pl.x - b.x, pl.y - b.y) < b.rad + 110; k++) {
      const aC = Math.atan2(pl.y - b.y, pl.x - b.x), dA = ad(aT, aC);
      if (Math.abs(dA) < 0.55) break;
      const a = aC + Math.sign(dA) * 0.5;
      if (!(yield* flyTo(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R, { tol: 20, vmax: 14, rv: 5 }))) break;
    }
    if (pl && hy(from.x - pl.x, from.y - pl.y) > 40) yield* flyTo(from.x, from.y, { tol: 25, vmax: hy(from.x - pl.x, from.y - pl.y) > 300 ? 35 : 18, rv: 4, skip: () => (pl && hy(pl.x - b.x, pl.y - b.y) < b.rad + 90 ? b : null) });   // the approach point can sit inside a lumpy body's bounding circle
  }
  yield* flyTo(so.x, so.y, { tol: 30, vmax: 30, rv: 3, skip: () => (pl && hy(so.x - pl.x, so.y - pl.y) < 70 ? b : null) });
  for (let t = 0; t < 45; t += NAV.dt) {
    if (pl.dock) return true;
    let so2 = standoff(b, fx, fy, pl.rad + (t > 15 ? 1 : 4));
    if (t > 6 && ctxK() !== 'anchor') {
      // nothing in harpoon reach: creep onto whatever surface is actually nearest along the line to the rock
      const dx = b.x - pl.x, dy = b.y - pl.y, d = hy(dx, dy) || 1, h = ray(pl.x, pl.y, dx / d, dy / d, d);
      if (h && h.b === b) so2 = { x: h.x - (dx / d) * (pl.rad + 2), y: h.y - (dy / d) * (pl.rad + 2) };
    }
    const tt = fly(so2.x, so2.y, { vmax: 3, stop: true, face: faceA(), rcsOnly: true, tvx: b.vx || 0, tvy: b.vy || 0 });
    AP.sub = 'HARPOON · ' + Math.round(tt.d) + ' m · ' + tt.rv.toFixed(1) + ' m/s · ' + (PC.ctx && PC.ctx.ok ? 'READY' : 'closing');
    if (ctxK() === 'anchor' && PC.ctx.ok && tt.rv < 1.5 && Math.abs(ad(faceA(), pl.a)) < (aim ? (t > 20 ? 0.18 : 0.12) : (t > 10 ? 0.6 : 0.2))) { press('ctx'); yield; }
    yield;
  }
  return !!pl.dock;
}
function* mineHere(stop) {
  act('MINING');
  if (PC.scan) { press('scan'); yield; }
  let miss = 0, last = cmass(pl), idle = 0, sT = 9, slewTo = null;
  for (let t = 0; t < 120; t += NAV.dt) {
    if (!pl.dock || pl.dock.ty !== 'anchor') { AP.mineExit = 'sheared'; return; }
    if (cmass(pl) >= pl.cargoMax - 1 || (stop && stop())) { AP.mineExit = 'full'; return; }
    sT += NAV.dt; if (PC.scan && sT > 0.5) { press('scan'); sT = 0; }   // the laser is interlocked with the array
    inp.mine = true;
    miss = pl.beam && pl.beam.hit ? 0 : miss + NAV.dt;
    if (!miss) slewTo = null;
    if (miss > 0.6 && slewTo !== null) {
      const er = ad(slewTo, pl.a); inp.rx = Math.abs(er) < 0.02 ? 0 : Math.sign(er) * cl(Math.abs(er) * 3, 0.45, 1);
      if (Math.abs(er) < 0.02 && miss > 3) slewTo = null;   // got there and still nothing: pick again
      if (miss > 10) { AP.mineExit = 'miss8'; return; }
    } else if (miss > 0.6) {
      // bored through: slew the nose (anchored pivot) toward the nearest bearing that still has rock in range
      const b = pl.dock.b, m0 = alive(pl, 'mine')[0], o = m0 ? mw(pl, m0) : pl, d = pl.dock;
      let ba = null, bd = 9;
      for (let k = -12; k <= 12; k++) {
        const a = b.a + d.ao0 + k * 0.0625; if (Math.abs(k * 0.0625) > 0.75) continue;
        const h = ray(o.x, o.y, Math.cos(a), Math.sin(a), (pl.lasR || C.MINE.rng));
        const e = Math.abs(ad(a, pl.a));
        if (h && h.b === b && e > 0.07 && e < bd) { bd = e; ba = a; }   // > 0.07: step past the 1-cell bore we already cut
      }
      if (ba === null) { AP.mineExit = 'miss'; return; }     // nothing left within the sweep: re-harpoon elsewhere
      slewTo = ba; miss = 0.61;   // lock that bearing; the branch above flies the nose there
    }
    const m = cmass(pl); if (m > last) { last = m; idle = 0; } else idle += NAV.dt;
    if (idle > 25) { AP.mineExit = 'idle'; return; }
    AP.sub = 'LASER · hold ' + cmass(pl) + '/' + pl.cargoMax + ' · fuel ' + Math.round(pl.fuel / pl.fuelMax * 100) + '%';
    yield;
  }
}
const oreVal = b => { const c = b.comp || {}; let v = 0; for (const g in c) if (GD[g]) v += c[g] * GD[g].p; return v / Math.max(1, b.cells); };
function pickRock(want) {
  let best = null, bc = -1e9;
  for (const b of W.rocks) {
    if (b.dead || b.hidden || b.inbound || b.kin || b.cells < 120) continue;
    // tumblers: the surface outruns a 1.5 m/s harpoon match (rim speed = va · rad)
    if (Math.abs(b.va || 0) * b.rad > 1.2) continue;
    // a rock that just refused the harpoon stays off the list for a while (the soft penalty alone lets a rich, close one win again at once)
    if (W.time - (AP.noBiteT.get(b) ?? -1e9) < 400) continue;
    const d = hy(b.x - pl.x, b.y - pl.y);
    const c = (want ? ((b.comp[want] || 0) / b.cells) * 100 : oreVal(b)) * 10 - d / 25 - (AP.mined.get(b) || 0) * 6 - (AP.noBite.get(b) || 0) * 40;
    if (c > bc) { bc = c; best = b; }
  }
  return best;
}
function* mineRun(want, until0) {
  const b = pickRock(want); if (!b) return;
  act('PROSPECTING');
  say('Heading for ' + b.name + (b.cat ? ' (' + b.typeN + ')' : ' — uncatalogued, array on to survey it en route') + (want ? ' for ' + GD[want].n : '') + '.');
  if (!b.cat && !PC.scan) press('scan');
  if (!(yield* harpoon(b))) { if (PC.scan) press('scan'); AP.mined.set(b, (AP.mined.get(b) || 0) + 2); AP.noBite.set(b, (AP.noBite.get(b) || 0) + 1); AP.noBiteT.set(b, W.time); log(b.name + ' refused the harpoon — marking it.'); return; }
  if (PC.scan) press('scan');
  for (let k = 0; k < 6; k++) {
    yield* mineHere(until0);
    AP.mined.set(b, (AP.mined.get(b) || 0) + 1);
    if (cmass(pl) >= pl.cargoMax - 1 || (until0 && until0()) || pl.fuel < Math.max(pl.fuelMax * 0.2, reserve() * 1.4)) break;
    // move to fresh rock face
    yield* undockShip();
    const a = Math.atan2(pl.y - b.y, pl.x - b.x) + 0.6, p = { x: b.x + Math.cos(a) * (b.rad + 30), y: b.y + Math.sin(a) * (b.rad + 30) };
    if (!(yield* harpoon(b, p))) break;
  }
  yield* undockShip();
}
function* sellAll(keep) {
  yield* tab('market');
  yield* clickUI('#pBody button[data-a="qty"][data-q="MAX"]', 0.4);
  for (let k = 0; k < 8; k++) {
    // core shards are story cargo: never sold off while the Catalog Office still wants them
    const b = [...document.querySelectorAll('#pBody button[data-a="sell"]')].find(x => !x.disabled && x.dataset.g !== keep && !(x.dataset.g === 'core' && G.cores < 3));
    if (!b) break;
    yield* clickUI(b, 0.5);
  }
}
function* service(st) {
  yield* tab('service');
  for (const lab of ['REFUEL', 'REPAIR']) {
    const i = (G.svc || []).findIndex(v => v.l.startsWith(lab) && v.ok);
    if (i >= 0) yield* clickUI(`#pBody button[data-a="svc"][data-i="${i}"]`, 0.5);
  }
  // one upgrade when flush
  // (never while saving for the lander: the HARE is the next big unlock)
  const saving = pl && pl.cls === 'wren' && past('shards') && !fleet('hare') ? hareP() + 200 : 0;
  const u = (G.svc || []).findIndex(v => /HOLD|CARGO|ENGINE|LASER/i.test(v.l) && v.ok && G.cr > v.c * 3 + 600 && G.cr - v.c > saving);
  if (u >= 0) { say('Flush — buying a refit: ' + G.svc[u].l + '.'); yield* clickUI(`#pBody button[data-a="svc"][data-i="${u}"]`, 0.7); }
  void st;
}
// ─── contracts: the board pays better than raw ore for a small tug ─────────
const jobBody = j => W.rocks.find(r => r.uid === j.body);
const jobDest = j => W.stations.find(q => q.name === j.to);
function jobOK(j) {
  if (j.kind === 'survey') {
    const b = jobBody(j); if (!b || b.cat || b.hidden || b.dead) return false;
    // only rocks a tank can reach and come back from: close to some refuelling port
    return W.stations.some(q => q.econ && !q.surf && !q.gone && !q.transfer && q.ports && q.ports.length && hy(q.x - b.x, q.y - b.y) < 1150);
  }
  if (j.kind !== 'deliver' || /^UP-WELL/.test(j.title) || !['fe', 'ice', 'vol'].includes(j.g) || j.n > pl.cargoMax - 4) return false;
  const t = jobDest(j); return !!t && !t.gone && !t.leaving && (pl.cls === 'hare' || !t.surf);
}
function* takeJobs(st) {
  if (!pl || !st.econ) return;
  // clear contracts we can no longer do (target catalogued by someone else, station gone)
  for (const j of [...G.missions]) if (!jobOK(j) && !(j.kind === 'deliver' && j.got > 0) || (j.aiTry || 0) >= 3) dropJob(j.id);
  const L = (G.jobs[st.name] || []).filter(jobOK).sort((a, b) => (a.kind === 'survey' ? 0 : 1) - (b.kind === 'survey' ? 0 : 1));
  if (!L.length || G.missions.length >= 3) return;
  yield* tab('jobs');
  for (const j of L) {
    if (G.missions.length >= 3) break;
    say('Contract board: signing ' + j.title + ' (' + fm(j.reward) + '₡).');
    yield* clickUI('#pBody button[data-a="accept"][data-id="' + j.id + '"]', 0.5);
  }
}
/** fly at a contract body with the array on until the survey completes */
function* surveyRun(b) {
  act('SURVEY'); say('Contract survey: ' + b.name + '. Array on, nose on the rock.');
  if (!PC.scan) press('scan');
  const d0 = hy(b.x - pl.x, b.y - pl.y) || 1, R = b.rad + 150;
  const tx = b.x + ((pl.x - b.x) / d0) * R, ty = b.y + ((pl.y - b.y) / d0) * R;
  for (let t = 0; t < 150 && !b.cat; t += NAV.dt) {
    if (!pl || b.dead) return false;
    const near = hy(b.x - pl.x, b.y - pl.y) < pl.scanR * 0.8;
    const tt = near ? fly(tx, ty, { vmax: 4, stop: true, face: Math.atan2(b.y - pl.y, b.x - pl.x) }) : flyRoute(tx, ty, { vmax: 30 });
    if (tt.d > 300) AP.wantWarp = true;
    AP.sub = 'ARRAY · surveying ' + b.name + ' · ' + Math.round(hy(b.x - pl.x, b.y - pl.y)) + ' m · ' + Math.round(Math.min(1, b.survey || 0) * 100) + '%';
    yield;
  }
  if (PC.scan) press('scan');
  if (b.cat) say(b.name + ' catalogued — contract paid.');
  return b.cat;
}
/** SELENE's Catalog Office desk (also reachable from the berth panel): bounties, core shards, the Orphan claim */
function* officeTab(st) {
  if (st !== SITES.sel) return;
  yield* tab('catalog'); yield* clickUI('#pBody button[data-a="bounty"]'); yield* clickUI('#pBody button[data-a="cores"]');
  if (at('file')) { say('Filing the Orphan claim at the Catalog Office.'); yield* clickUI('#pBody button[data-a="file"]', 1.2); }
}
function* visit(st, ty, what) {
  if (!(yield* dockAt(st, ty))) return false;
  yield* wait(0.6);
  if (ctxK() === 'services') { press('ctx'); yield* until(stationOpen, 2); }
  if (!stationOpen()) return true;
  yield* officeTab(st);
  if (what !== 'nosell') yield* sellAll(what === 'keepcore' ? 'core' : null);
  yield* service(st);
  yield* takeJobs(st);
  yield* wait(0.5); yield* closePanel();
  AP.didHere = true;   // business done — the docked branch must not run it again (it would sell a 'nosell' hold)
  return true;
}
function bestBuyer() {
  const L = W.stations.filter(s => s.econ && !s.gone && !s.leaving && (pl.cls === 'hare' || !s.surf) && s.ports.concat(s.pads).length);
  let best = null, bv = -1e9;
  for (const s of L) {
    let v = 0; for (const g in pl.cargo) if (s.econ[g] && !GD[g].story) v += pl.cargo[g] * price(s, g, true);
    for (const j of G.missions) if (j.kind === 'deliver' && j.to === s.name && pl.cargo[j.g]) v += j.reward * Math.min(1, pl.cargo[j.g] / Math.max(1, j.n - j.got));
    const d = hy(s.x - pl.x, s.y - pl.y);
    v -= d * 0.2;
    if (s.transfer) v -= 160;                                     // moving transfer ships: long, fiddly dockings
    if (d > 900 && pl.fuel < pl.fuelMax * 0.45) v -= 5000;       // never strand ourselves chasing a better price
    if (v > bv) { bv = v; best = s; }
  }
  return best;
}
/** the bearing from which a buried contact is shallowest: surface point + depth */
/** shallowest surface point of c.b over target point t (default the contact itself) */
function shallowSide(c, t = c) {
  const b = c.b; let best = null;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU, ux = Math.cos(a), uy = Math.sin(a);
    const h = ray(b.x + ux * (b.rad + 6), b.y + uy * (b.rad + 6), -ux, -uy, b.rad + 6);
    if (!h || h.b !== b) continue;
    const dep = hy(h.x - t.x, h.y - t.y);
    if (!best || dep < best.dep) best = { a, x: h.x, y: h.y, dep, from: { x: b.x + ux * (b.rad + 60), y: b.y + uy * (b.rad + 60) } };
  }
  return best;
}
/** sit on the rock, laser mount on target t (anchored = no fuel burned while we listen / cut) */
/** angle between the nose and the line from module `kind` (laser / array) to point t */
function noseErr(t, kind = 'mine') {
  const m = alive(pl, kind)[0], o = m ? mw(pl, m) : pl;
  return Math.abs(ad(Math.atan2(t.y - o.y, t.x - o.x), pl.a));
}
function* perchFor(c, t = c, near = (pl && pl.lasR || C.MINE.rng) - 10) {
  const b = c.b;
  if (pl.dock && pl.dock.ty === 'anchor' && pl.dock.b === b && hy(t.x - pl.x, t.y - pl.y) < near && noseErr(t) < 0.25) return true;
  for (let k = 0; k < 2; k++) {
    if (pl.dock) yield* undockShip();
    const sd = shallowSide(c, t); if (!sd) return false;
    if (!(yield* harpoon(b, sd.from, t))) return false;
    if (noseErr(t) < 0.3) return true;
    log('Perch on ' + b.name + ' came out skewed (' + noseErr(t).toFixed(2) + ' rad off) — re-biting.');
  }
  return pl.dock && noseErr(t) < 0.4;
}
/** the actual shard pick for a core contact (it settles on the chamber floor, not the centre) */
function shardOf(c) {
  let best = null, bd = 1e9;
  for (const p of W.picks) {
    if (p.dead || p.held || p.type !== 'core') continue;
    const d = hy(p.x - c.x, p.y - c.y);
    if ((p.home === c.b || d < c.b.rad + 10) && d < bd) { bd = d; best = p; }
  }
  return best;
}
function* deepScan(c) {
  act('DEEP SCAN');
  say('Array contact inside ' + c.b.name + '. Perching on the rock and sweeping the dial for its resonance.');
  if (!(yield* perchFor(c))) return false;
  if (!PC.scan) press('scan');
  const sl = $('freq'); let dir = 1, sweep = true, quiet = 0;
  for (let t = 0; t < 70 && !c.done; t += NAV.dt) {
    // turn the dial like a person would: sweep until the geiger ticks, then hunt the peak
    if (sweep) { PC.freq += dir * 22 * NAV.dt; if (PC.freq > 199 || PC.freq < 21) dir = -dir; if (PC.sig > 0.01) { sweep = false; quiet = 0; } }
    else { const f = contactFreq(c); PC.freq += cl(f - PC.freq, -5 * NAV.dt, 5 * NAV.dt); quiet = PC.sig > 0 ? 0 : quiet + NAV.dt; if (quiet > 1.5) sweep = true; }
    PC.freq = cl(PC.freq, 20, 200); sl.value = PC.freq; $('fVal').textContent = PC.freq.toFixed(1) + ' kHz';
    AP.sub = 'ARRAY · ' + PC.freq.toFixed(1) + ' kHz · signal ' + Math.round(PC.sig * 100) + '% · lock ' + Math.round(PC.lock * 100) + '%';
    yield;
  }
  if (PC.scan) press('scan');
  if (!c.done) log('Deep scan of ' + c.b.name + ' failed (array off-axis ' + noseErr(c, 'scan').toFixed(2) + ' rad, ' + Math.round(hy(c.x - pl.x, c.y - pl.y)) + ' m).');
  return c.done;
}
function* cutCore(c) {
  act('CORE SHARD');
  const have = (pl.cargo.core || 0), got = () => (pl.cargo.core || 0) > have;
  let sh = shardOf(c);
  if (!sh) return false;
  if (!sh.home) {
    // already loose (a meteor or a crew cut opened the chamber) — just go and scoop it
    say('The ' + c.b.name + ' shard is drifting free. Flying over to scoop it.');
    if (pl.dock) yield* undockShip();
    yield* flyTo(sh.x, sh.y, { tol: 5, vmax: 20, rv: 1.5 });
    yield* until(got, 8, () => fly(sh.x, sh.y, { vmax: 4, stop: true }));
    return got();
  }
  say('Cutting a tunnel to the KERES-9 shard inside ' + c.b.name + '.');
  for (let tries = 0; tries < 2 && !got(); tries++) {
    sh = shardOf(c) || sh;
    // the story tractor reaches 75 m: perch within ~65 m of the shard itself
    if (!(yield* perchFor(c, sh, 66))) return false;
    let sT = 9, open = 0;
    for (let t = 0; t < 120 && !got(); t += NAV.dt) {
      if (!pl.dock) break;
      sT += NAV.dt; if (PC.scan && sT > 0.5) { press('scan'); sT = 0; } // the laser is interlocked with the array
      inp.mine = true;
      // keep the bore on the shard: slew the anchored nose so the laser MOUNT points straight at it
      { const m = alive(pl, 'mine')[0], o = m ? mw(pl, m) : pl, er = ad(Math.atan2(sh.y - o.y, sh.x - o.x), pl.a); inp.rx = Math.abs(er) < 0.012 ? 0 : Math.sign(er) * cl(Math.abs(er) * 4, 0.25, 1); }
      const d = hy(sh.x - pl.x, sh.y - pl.y);
      // beam runs past the shard without hitting rock = the tunnel is through; give the tractor time
      if (pl.beam && !pl.beam.hit && hy(pl.beam.x1 - pl.beam.x0, pl.beam.y1 - pl.beam.y0) > d) open += NAV.dt; else open = 0;
      AP.sub = 'LASER → shard · ' + Math.round(d) + ' m' + (open > 0 ? ' · tunnel open' : '');
      if (open > 12) break;              // open line but nothing coming: the shard moved — re-perch on it
      yield;
    }
    inp.mine = false; inp.rx = 0;
    yield* until(got, 6);
    if (!got()) yield* undockShip();
  }
  if (pl.dock && pl.dock.ty === 'anchor') yield* undockShip();
  if (got()) say('Shard aboard. The tractor pulled it out of the tunnel.');
  return got();
}
function* launch() {
  act('LAUNCH');
  say('PAD TO ORBIT. Throttle up — the HARE stands on its plume.');
  // (no SAS press here: on a tail-lander pad the alt button is EVA — the climb law below holds the nose itself)
  const th = Math.atan2(pl.y, pl.x);
  // the throttle rail must read zero while clamped before it arms (safety interlock) — rest it a moment
  yield* until(() => PC.thrArm, 1, () => { inp.thr = 0; });
  yield* until(() => !pl || !pl.dock, 3, () => { if (!pl) return; inp.thr = 1; inp.rx = cl(ad(Math.atan2(pl.y, pl.x), pl.a) * 2.6 - pl.va * 1.9, -1, 1); });
  // vertical climb out of the dust, then pitch toward the band
  yield* until(() => tel(pl).alt > 120, 20, () => { inp.thr = 0.85; inp.rx = cl(ad(Math.atan2(pl.y, pl.x), pl.a) * 2.6 - pl.va * 1.9, -1, 1); AP.sub = 'CLIMB · ' + Math.round(tel(pl).alt) + ' m'; });
  say('Pitching over. Gravity turn toward the synchronous band, 1.4 km up.');
  const tgt = { x: Math.cos(th + 0.08) * (C.RS - 140), y: Math.sin(th + 0.08) * (C.RS - 140) };
  yield* flyTo(tgt.x, tgt.y, { tol: 40, vmax: 55, rv: 4 });
}

// ─── the career brain ────────────────────────────────────────────────────
AP.mined = new Map(); AP.noBite = new Map(); AP.noBiteT = new Map();
function choose() {
  const c = G.crew, wren = fleet('wren'), hare = fleet('hare');
  const wantHare = !hare && past('shards') && G.cr >= hareP() + 200;
  if (G.ride) return ['ride', (function* () { yield* until(() => !G.ride, 200, () => { AP.wantWarp = true; }); })()];
  if (ev && !ev.hide) {
    if (c && c.state !== 'idle') return ['shift', crewShift()];
    const surf = onSurface(ev);
    if (surf) {
      if (hare && hare.dock && hare.dock.b === SITES.depot) return ['board', boardOwn(hare)];
      if (wantHare) return ['buy', (function* () { if (sackN(ev)) yield* sellSack(SITES.depot); yield* buyShipAt(SITES.depot, 'hare'); })()];
      return ['lift', rideLift(true)];
    }
    // in orbit, on foot (SELENE HIGH)
    if (G.bounty > 160 || (ev.sack.core && G.cores < 3) || at('file')) return ['catalog', catalogOffice()];
    if (wantHare) return ['lift', rideLift(false)];
    if (hare && hare.dock && hare.dock.b && hare.dock.b.surf) return ['lift', rideLift(false)];
    if (wren && (past('hull'))) return ['board', boardOwn(wren)];
    if (!wren && G.cr >= wrenP() + 120 && (past('shift'))) return ['buy', buyShipAt(SITES.sel, 'wren')];
    if (sackN(ev)) return ['sell', sellSack(SITES.sel)];
    return ['shift', crewShift()];
  }
  if (!pl) return ['idle', wait(1)];
  return ['fly', flight()];
}
/** one decision while aboard a ship */
function* flight() {
  const s = pl, wren = s.cls === 'wren', hare = s.cls === 'hare';
  if (s.dock && s.dock.ty !== 'anchor') {
    // docked: do business here first
    const st = s.dock.b;
    if (st && st.tabs && st.tabs.length && !AP.didHere) {
      AP.didHere = true;
      yield* until(() => ctxK() === 'services' || stationOpen(), 1.5);   // HUD context lags a frame after a tow / fresh dock
      if (ctxK() === 'services' && !stationOpen()) { press('ctx'); yield* until(stationOpen, 2); }
      if (stationOpen()) {
        yield* officeTab(st);
        yield* sellAll('core'); yield* service(st); yield* takeJobs(st); yield* closePanel();
      }
    }
    // a WREN pilot who can afford the lander parks at SELENE and goes down the cable
    if (wren && past('shards') && !fleet('hare') && G.cr >= hareP() + 200) {
      if (st === SITES.sel) { say('Parking the WREN. Down the cable to buy a lander.'); press('ctx'); yield* until(stationOpen, 2); yield* tab('service'); yield* clickUI('#pBody button[data-a="eva"]'); return; }
    }
    AP.didHere = false;
    say(hare && st && st.surf ? 'Lift-off from ' + st.name + '.' : 'Undocking.');
    if (hare && (s.dock.ty === 'pad' || s.dock.ty === 'ground') && onSurface(s)) { yield* launch(); return; }
    yield* undockShip(); return;
  }
  if (s.dock && s.dock.ty === 'anchor') { yield* undockShip(); return; }
  // fly decisions
  if (wren && past('shards') && !fleet('hare') && G.cr >= hareP() + 200) { act('HOMEWARD'); say('Enough for the lander. Back to SELENE HIGH.'); yield* visit(SITES.sel, 'port', 'keepcore'); return; }
  if (s.fuel < Math.min(s.fuelMax * 0.5, Math.max(s.fuelMax * 0.28, reserve() * 1.6)) || integ(s) < 0.5) {
    const st = integ(s) < 0.5 ? (hare && onSurface(s) ? SITES.depot : SITES.sel) : fuelStop();
    act('SERVICE'); say('Fuel ' + Math.round(s.fuel / s.fuelMax * 100) + '% — heading for ' + st.name + ' to top up.');
    yield* visit(st, st.surf ? 'pad' : 'port'); return;
  }
  if ((at('file') || (pl.cargo.core && (G.cores + pl.cargo.core >= 3 || !W.contacts.some(q => q.kind === 'core' && !q.done)))) && W.time > (AP.catHold || 0)) {
    act('CATALOG'); say(at('file') ? 'Flying to SELENE HIGH to file the claim.' : 'Core shards aboard — taking them to the Catalog Office.');
    const c0 = pl.cargo.core || 0, s0 = G.story;
    yield* visit(SITES.sel, 'port', 'nosell');
    if (pl && (pl.cargo.core || 0) >= c0 && G.story === s0) { AP.catHold = W.time + 600; log('Catalog Office visit changed nothing — not retrying for a while.'); }
    return;
  }
  const full = cmass(s) >= s.cargoMax - 2;
  if (full) {
    let st = bestBuyer();
    if (hare && at('water') && (s.cargo.ice || 0) >= 20) st = SITES.depot;
    if (at('orphan') && (s.cargo.pgm || 0) > 0) st = SITES.gaia;
    // down the well = band transit to the overhead point (start/stop Δv + ~0.009 u/m on the arc) plus a powered descent
    if (st.surf) {
      const r = hy(st.x, st.y) || 1, ox = (st.x / r) * C.RS, oy = (st.y / r) * C.RS, k = s.burn / Math.max(0.1, s.thrust);
      const need = s.fuelMax * 0.28 + k * 48 + 0.009 * hy(ox - s.x, oy - s.y) + 6;   // measured: descent ≈ 26% of a tank
      if (s.fuel < need && s.fuel < s.fuelMax * 0.92 && !onSurface(s)) { const fs = fuelStop(); act('SERVICE'); const keep = hare && at('water') && (s.cargo.ice || 0) >= 20; say('Hold full, but the descent wants more propellant — topping up at ' + fs.name + (keep ? ' first (the ice is for the Depot).' : ' and selling there instead.')); yield* visit(fs, 'port', keep ? 'nosell' : undefined); return; }
    }
    act('DELIVERY'); say('Hold full — ' + (st.surf ? 'down the well to ' : 'selling at ') + st.name + (st.transfer ? ' (' + st.transfer.dest + '-bound)' : '') + '.');
    yield* visit(st, st.surf ? 'pad' : 'port'); return;
  }
  // story-driven detours
  if (at('ghost') || at('shards')) {
    // story targets are never written off: a failed attempt only parks the contact for a while (2 → 15 min), then we try again
    const kind = at('ghost') ? 'claim' : 'core', ready = q => W.time > (q.aiNext || 0);
    const fail = q => { q.aiFail = (q.aiFail || 0) + 1; q.aiNext = W.time + Math.min(900, 120 * q.aiFail); log(q.b.name + ' ' + kind + ' attempt failed (' + q.aiFail + ') — parking it for ' + Math.round((q.aiNext - W.time) / 60) + ' min.'); };
    const L = W.contacts.filter(q => q.kind === kind && !q.done && !q.b.hidden && !q.b.dead && ready(q)).sort((a, b) => hy(a.x - s.x, a.y - s.y) - hy(b.x - s.x, b.y - s.y));
    if (kind === 'core') {
      const R = W.contacts.find(q => q.kind === 'core' && q.done && !q.cut && !q.b.dead && ready(q));
      if (R) { R.aiNext = W.time + 90; if (yield* cutCore(R)) R.cut = true; else fail(R); return; }
    }
    if (L.length) {
      L[0].aiNext = W.time + 90;   // set up-front: a tow or timeout aborting the attempt still backs off a little
      if (!(yield* deepScan(L[0]))) { fail(L[0]); return; }
      if (kind === 'core') { if (yield* cutCore(L[0])) L[0].cut = true; else fail(L[0]); }
      return;
    }
  }
  const sj = G.missions.find(j => j.kind === 'survey' && jobOK(j) && (j.aiTry || 0) < 3);
  if (sj && cmass(s) < s.cargoMax - 2) { sj.aiTry = (sj.aiTry || 0) + 1; yield* surveyRun(jobBody(sj)); return; }
  if (hare && at('launch')) { const b = pickRock('ice'); if (b) { say('First orbit in the HARE — harpooning ' + b.name + '.'); yield* harpoon(b); yield* undockShip(); } return; }
  if (at('orphan') && W.orphan && !W.orphan.hidden) { say('The Orphan. Half a kilometre of metal with a platinum heart.'); AP.mined.delete(W.orphan); yield* mineRunOn(W.orphan, 'pgm'); return; }
  const want = hare && at('water') ? 'ice' : null;
  yield* mineRun(want);
}
/** the shallowest surviving cell of an ore inside a body (pockets are listed in b.veins): where to anchor and what to aim at */
function veinShot(b, want) {
  const m = MAT.findIndex(q => q && q.ore === want); if (m < 0) return null;
  const reach = (pl.lasR || C.MINE.rng) - 14;   // mount stands a few metres off the face
  const aS = Math.atan2(pl.y - b.y, pl.x - b.x);
  let best = null, bd = 1e9;
  for (const i of b.veins || []) {
    if (b.sol[i] !== m) continue;
    const w = cw(b, i % b.gw, (i / b.gw) | 0), r = hy(w.x - b.x, w.y - b.y) || 1, ux = (w.x - b.x) / r, uy = (w.y - b.y) / r;
    // the real face above this cell (bodies are lumpy: the bounding radius can sit far outside it)
    const h = ray(b.x + ux * (b.rad + 40), b.y + uy * (b.rad + 40), -ux, -uy, b.rad + 40);
    if (!h || h.b !== b) continue;
    const surf = hy(h.x - b.x, h.y - b.y), depth = surf - r;
    // shallow first, but prefer our side of the body; pockets out of beam reach only as a last resort
    const c = depth + (depth > reach ? 500 : 0) + Math.abs(ad(Math.atan2(uy, ux), aS)) * surf * 0.35;
    if (c < bd) { bd = c; best = { aim: { x: w.x, y: w.y }, from: { x: h.x + ux * 30, y: h.y + uy * 30 }, depth }; }
  }
  return best;
}
function* mineRunOn(b, want) {
  act('PROSPECTING');
  // a buried pocket: anchor on the face straight above it and bore down the line (the beam reaches lasR from the mount)
  let v = want && veinShot(b, want);
  if (!(yield* (v ? harpoon(b, v.from, v.aim) : harpoon(b)))) return;
  for (let k = 0; k < 5; k++) {
    yield* mineHere();
    if (cmass(pl) >= pl.cargoMax - 1 || pl.fuel < Math.max(pl.fuelMax * 0.2, reserve() * 1.4)) break;
    yield* undockShip();
    v = want && veinShot(b, want);
    const a = Math.atan2(pl.y - b.y, pl.x - b.x) + 0.5;
    const p = v ? v.from : { x: b.x + Math.cos(a) * (b.rad + 30), y: b.y + Math.sin(a) * (b.rad + 30) };
    if (!(yield* (v ? harpoon(b, p, v.aim) : harpoon(b, p)))) break;
  }
  yield* undockShip();
}

/** the player died / was rescued: whatever we were doing belongs to the old suit — drop it and re-plan from the bed in HAB 14 */
export function apAbort(why) {
  if (AP.task) { try { AP.task.it.return(); } catch (_) { /* */ } }
  AP.didHere = false; AP.task = null; resetInp(); AP.wantWarp = false;
  if (why) log(why);
}
function setTask(name, it) {
  if (AP.task) { try { AP.task.it.return(); } catch (_) { /* */ } }
  AP.task = { name, it, t0: W.time };
}

/** per-frame brain tick */
export function apThink(dt, simRunning) {
  if (!AP.on || !G || G.mode !== 'play' || (!pl && !ev)) return;
  NAV.dt = dt; NAV.t += dt;
  resetInp(); AP.wantWarp = false;
  if (!simRunning) return;
  // stranded: out of fuel with no way home
  // low tank mid-job: drop the job, the brain will route to a refuel (anchored jobs burn laser fuel too). Never mid-descent or mid-climb: a pad that sells fuel / the band are the best place to be heading anyway
  if (pl && !ev && AP.task && pl.fuel < Math.min(reserve(), pl.fuelMax * 0.45) && (!pl.dock || pl.dock.ty === 'anchor') && !['SERVICE', 'DOCKING', 'DELIVERY', 'CATALOG', 'HOMEWARD', 'LANDING', 'LAUNCH'].includes(AP.act)) {
    log('Tank at ' + Math.round(pl.fuel / pl.fuelMax * 100) + '% — dropping ' + AP.act + ' to refuel.'); setTask('x', (function* () { })()); AP.task = null; AP.act = 'SERVICE';
  }
  if (pl && (!pl.dock || pl.dock.ty === 'anchor') && !ev && pl.fuel <= 0.5 && !AP.towing) { AP.towing = true; AP.towT = 0; say('Tanks dry. Calling the recovery tow.'); mode('pause'); return; }
  if (ev && !ev.hide && ev.suit < 12 && !(G.crew && G.crew.state === 'site') && !AP.towing && !inBody(ev.x, ev.y)) { AP.towing = true; AP.towT = 0; say('Air critical. Calling rescue.'); mode('pause'); return; }
  if (!AP.task) { const [n, it] = choose(); setTask(n, it); }
  try {
    const r = AP.task.it.next();
    if (r.done) AP.task = null;
    else if (W.time - AP.task.t0 > 600) { say('That is taking too long — rethinking.'); AP.task = null; }
  } catch (e) {
    const k = String(e && e.message);
    if (AP.lastErr !== k) console.error('[AI] ' + (e && e.stack || e));
    AP.lastErr = k; AP.task = null;
  }
}

/** overlays & meta flow: respawn, win screen, tows; camera; ghost hands; captions */
export function apMeta(dt) {
  if (!AP.on || !G) return;
  if (G.mode === 'dead' || G.mode === 'win') {
    AP.metaT += dt;
    const id = G.mode === 'dead' ? 'respawn' : 'keep';
    if (AP.metaT > 2.2) $(id).classList.add('aiPick');
    if (AP.metaT > 4) { AP.metaT = 0; $(id).classList.remove('aiPick'); AP.task = null; $(id).click(); }
    say(G.mode === 'dead' ? 'Signal lost. Rim medics will patch us up.' : 'THE ORPHAN IS FREE. The band is ours to catalog.');
  } else AP.metaT = 0;
  if (G.mode === 'pause' && G.autoPaused && !document.hidden) { G.autoPaused = false; mode('play'); }
  if (G.mode === 'pause' && AP.towing) {
    AP.towT += dt; $('tow').classList.toggle('aiPick', AP.towT > 0.8);
    if (AP.towT > 2) { AP.towing = false; $('tow').classList.remove('aiPick'); AP.task = null; AP.didHere = false; resetInp(); $('tow').click(); }   // towed to a berth: do business there (refuel!) before flying again
  }
  if ($('dialogO').classList.contains('on')) { AP.dlgT = (AP.dlgT || 0) + dt; if (AP.dlgT > 6) { closeDialog(); AP.dlgT = 0; } } else AP.dlgT = 0;
  // camera director: zoom out for flight, in for EVA
  if (G.mode === 'play' && !(cam.user > 0)) {
    if (ev && !ev.hide) cam.tz = cl(defZoom() * 1.5, 0.35, 3.4);
    else if (pl && !pl.dock) { const v = hy(pl.vx, pl.vy); cam.tz = cl(defZoom() * cl(1.1 - v / 90, 0.35, 1), 0.3, 3.4); }
  }
  AP.warp = AP.wantWarp && !(W.meteors && W.meteors.length) ? 3 : 1;
  showStick('L', inp.lx, inp.ly); showStick('R', inp.rx, inp.ry);
  IN.thrUI(inp.thr);
  $('mineB').classList.toggle('held', inp.mine);
  $('apAct').textContent = AP.act; $('apCap').textContent = AP.cap; $('apSub').textContent = AP.sub;
  const el = Math.max(0, (W.time - AP.started) | 0);
  $('apTime').textContent = String((el / 60) | 0).padStart(2, '0') + ':' + String(el % 60).padStart(2, '0');
  const wp = $('warp'); wp.classList.toggle('on', AP.warp > 1); wp.textContent = 'TIME ×' + AP.warp;
}

export function apSet(on, demo) {
  AP.on = !!on;
  if (demo !== undefined) AP.demo = !!demo;
  if (AP.task) { try { AP.task.it.return(); } catch (_) { /* */ } }
  AP.task = null; AP.warp = 1; AP.towing = false;
  resetInp();
  document.body.classList.toggle('auto', AP.on);
  $('aiB').classList.toggle('on', AP.on);
  $('apBox').classList.toggle('on', AP.on);
  for (const id of ['zL', 'zR', 'thr']) $(id).classList.toggle('ghost', AP.on);
  const ap = $('aiP'); if (ap) ap.textContent = 'AI PLAYER: ' + (AP.on ? 'ON' : 'OFF');
  if (!AP.on) {
    showStick('L', 0, 0); showStick('R', 0, 0); IN.thr = 0; IN.thrUI(0);
    $('mineB').classList.remove('held'); $('warp').classList.remove('on');
    if (stationOpen()) closeStation();
  } else {
    AP.started = W ? W.time : 0; AP.act = 'TAKING OVER'; AP.cap = 'The AI has the controls. Touch the sticks or press P to take them back.'; AP.sub = '';
  }
}
/** debug hook: force a task by name */
export function apForce(n, arg) {
  const m = { shift: crewShift, catalog: catalogOffice, launch, flight, core: cutCore, scan: deepScan };
  if (!m[n]) return false;
  setTask(n, m[n](arg)); return true;
}
export { alive, ca, near, engineOK };
