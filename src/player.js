// ═══ cockpit & suit: camera, targeting, flight assists, context actions ═
import { $, TAU, cl, lp, hy, ad, ds, an } from './core/util.js';
import { C, gacc, geff } from './core/config.js';
import { W, G, pl, ev, cam, PC, CTL, focus } from './core/state.js';
import { near, ca, portW } from './world/body.js';
import { surfR, altAt } from './world/moon.js';
import { dock, anchor, undock, alive } from './ships.js';
import { enterEVA, boardShip, boardable, evaRoom, ping } from './eva.js';
import { carHere, liftBusy, ride } from './lift.js';
import { boardShift, crewBoard, shuttle } from './crew.js';
import { updScan } from './scanner.js';
import { IN } from './input.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const GA = { x: 0, y: 0 };
// ─── camera ──────────────────────────────────────────────────────────────
export const camX = () => cam.x + cam.lx, camY = () => cam.y + cam.ly;
/** screen (client px) → world */
export function s2w(sx, sy) {
  const r = $('cv').getBoundingClientRect(), dx = (sx - r.left - r.width / 2) / cam.z, dy = (sy - r.top - r.height / 2) / cam.z;
  const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
  return { x: camX() + dx * c - dy * s, y: camY() + dx * s + dy * c };
}
/** screen-frame stick → world frame */
export const s2wv = (x, y) => { const c = Math.cos(cam.rot), s = Math.sin(cam.rot); return { x: x * c - y * s, y: x * s + y * c }; };
export const w2sv = (x, y) => { const c = Math.cos(-cam.rot), s = Math.sin(-cam.rot); return { x: x * c - y * s, y: x * s + y * c }; };
export const defZoom = () => cl($('cv').getBoundingClientRect().width / 380, 0.9, 2.4);

/** automatic zoom: tight on foot, wide when climbing out of the well at speed */
function autoZoom(f) {
  const base = defZoom();
  if (ev && !ev.hide) return base * 1.35;
  const v = hy(f.vx || 0, f.vy || 0), alt = altAt(f.x, f.y);
  let z = base / (1 + v / 22);
  if (G.ride && G.ride.kind === 'lift') z = base * 0.55;
  if (pl && pl.dock && pl.dock.ty !== 'anchor') z = base;
  if (alt < 120 && v < 30) z = Math.max(z, base * 0.8);
  return cl(z, 0.22, 3.2);
}
export function updCam(dt) {
  const f = focus(); if (!f) return;
  const k = 1 - Math.exp(-4.2 * dt);
  const lead = ev && !ev.hide ? 0.15 : 0.45;
  let tx = f.x + cl((f.vx || 0) * lead, -140, 140), ty = f.y + cl((f.vy || 0) * lead, -140, 140);
  if (cam.aux) { tx = lp(tx, cam.aux.x, 0.38); ty = lp(ty, cam.aux.y, 0.38); }
  if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; } else { cam.x = lp(cam.x, tx, k); cam.y = lp(cam.y, ty, k); }
  // turn the view so "up" (away from the Moon) is always screen-up
  const want = Math.atan2(cam.y, cam.x) + Math.PI / 2;
  cam.rot = an(cam.rot + ad(want, cam.rot) * (1 - Math.exp(-3 * dt)));
  cam.lt -= dt;
  if (cam.lt <= 0) { const q = 1 - Math.exp(-2.4 * dt); cam.lx = lp(cam.lx, 0, q); cam.ly = lp(cam.ly, 0, q); }
  if (cam.user > 0) cam.user -= dt; else cam.tz = autoZoom(f);
  cam.z = lp(cam.z, cam.tz, 1 - Math.exp(-(cam.zr || 2.5) * dt));
  cam.shake *= Math.exp(-4.5 * dt);
}

// ─── targeting / nav ─────────────────────────────────────────────────────
export function targets() {
  const f = focus(), L = []; if (!f) return L;
  for (const s of W.ships) if (!s.dead && !s.isPl && !s.ghost && ds(s, f) < 1800) L.push(s);
  for (const b of W.bodies) if (!b.hidden && ds(b, f) < 2600) L.push(b);
  L.sort((a, b) => ds(a, f) - ds(b, f));
  return L;
}
export function setTgt(t) { PC.tgt = t; AU.ui(); }
export function cycleTgt() { const L = targets(); if (!L.length) { setTgt(null); return; } setTgt(L[(L.indexOf(PC.tgt) + 1) % L.length]); }
export function setNav(x, y, l, quiet) { W.nav = { x, y, l: l || 'WAYPOINT' }; if (!quiet) { AU.blip(); hooks.toast('NAV ▸ ' + (l || 'waypoint set')); } }
export function pickAt(x, y) {
  let best = null, bd = 40 / Math.max(0.3, cam.z);
  const con = (o, d) => { if (d < bd) { bd = d; best = o; } };
  for (const s of W.ships) if (!s.dead && !s.isPl) con(s, hy(s.x - x, s.y - y) - s.rad);
  for (const b of W.bodies) { if (b.hidden) continue; const d = hy(b.x - x, b.y - y); if (d < b.rad + 20) con(b, d - b.rad * 0.5); }
  return best;
}

// ─── flight assists ──────────────────────────────────────────────────────
export function drive(s, dx, dy) {
  const m = hy(dx, dy);
  if (m < 0.06) { s.rcx = s.rcy = 0; return false; }
  const l = Math.min(1, m / 1.6); s.rcx = (dx / m) * l; s.rcy = (dy / m) * l;
  return true;
}
function setMatch(on) { PC.match = on; $('match').classList.toggle('act', on); }
const SAS = ['OFF', 'UP', 'RETRO', 'PRO'];
export const sasName = () => SAS[PC.sas || 0];
/** reference velocity for MATCH/BRAKE: target, docking port, or the co-rotating frame */
function refVel() {
  if (PC.assist) return { x: PC.assist.w.vx, y: PC.assist.w.vy };
  const t = PC.tgt; if (t && (t.kind === 'ship' || t.kind === 'rock' || t.kind === 'station') && ds(t, pl) < 600) return { x: t.vx || 0, y: t.vy || 0 };
  return { x: 0, y: 0 };
}
function assists(dt) {
  const man = Math.abs(CTL.rx) > 0.05;
  const st = s2wv(CTL.lx, CTL.ly);
  if (CTL.brake || PC.match) {
    const v = refVel();
    // fight gravity too: RCS holds position relative to the reference
    gacc(pl.x, pl.y, pl.vx, pl.vy, GA);
    drive(pl, v.x + st.x * 6 - pl.vx - GA.x * 0.5, v.y + st.y * 6 - pl.vy - GA.y * 0.5);
    if (PC.assist && !man) {
      const g = PC.assist, want = g.want;
      pl.tqi = cl(ad(want, pl.a) * 2.4 + ((g.w.va || 0) - pl.va) * 1.7, -1, 1);
    } else if (!man && !PC.sas) pl.tqi = cl(-pl.va * 2.2, -1, 1);
    if (pl.fuel <= 0 && PC.match) { setMatch(false); hooks.toast('MATCH offline — propellant dry', 'bad'); }
  }
  if (PC.sas && !man && !pl.dock) {
    const r = hy(pl.x, pl.y), v = hy(pl.vx, pl.vy);
    let want = Math.atan2(pl.y, pl.x);
    if (PC.sas === 2 && v > 0.5) want = Math.atan2(-pl.vy, -pl.vx);
    if (PC.sas === 3 && v > 0.5) want = Math.atan2(pl.vy, pl.vx);
    pl.tqi = cl(ad(want, pl.a) * 2.6 - pl.va * 1.9, -1, 1);
    void r;
  }
}

/** docking gates for a port/pad world pose (tail-landers sit on pads nose-up) */
export function gates(s, w, ty) {
  const tail = ty === 'pad' && s.tailLand, cfg = ty === 'pad' ? C.LAND : C.DOCK;
  const rv = hy(s.vx - w.vx, s.vy - w.vy), want = ty === 'pad' ? (tail ? w.dir : w.dir + Math.PI / 2) : w.dir + Math.PI;
  const ae = Math.abs(ad(s.a, want));
  const pt = ty === 'pad' ? (tail ? { x: s.x - Math.cos(s.a) * s.nose, y: s.y - Math.sin(s.a) * s.nose } : { x: s.x + Math.cos(s.a + Math.PI / 2) * s.belly, y: s.y + Math.sin(s.a + Math.PI / 2) * s.belly })
    : { x: s.x + Math.cos(s.a) * s.nose, y: s.y + Math.sin(s.a) * s.nose };
  const ox = pt.x - w.x, oy = pt.y - w.y, nx = Math.cos(w.dir), ny = Math.sin(w.dir), lat = Math.abs(ox * -ny + oy * nx), d = hy(ox, oy), re = Math.abs(s.va - (w.va || 0));
  const g = { v: rv < cfg.v, a: ae < cfg.a, l: lat < cfg.l, r: re < cfg.r, near: d < cfg.d, gear: ty !== 'pad' || (s.gear && (s.gearOK || !s.tailLand)), rv, ae, lat, re, d, w, ty, want };
  g.ok = g.v && g.a && g.l && g.r && g.near && g.gear;
  return g;
}
export function dockCand() {
  if (!pl || pl.dock) return null;
  let best = null;
  for (const st of W.stations) {
    if (st.dead || st.leaving || st.arr) continue;
    if (Math.abs(st.x - pl.x) > st.rad + 120 || Math.abs(st.y - pl.y) > st.rad + 120) continue;
    for (const p of st.ports) { if (p.occ) continue; const w = portW(st, p); if (ds(pl, w) > 85) continue; const g = gates(pl, w, 'port'); g.b = st; g.p = p; if (!best || g.d < best.d) best = g; }
    if (pl.gear || pl.tailLand) for (const p of st.pads) { if (p.occ) continue; const w = portW(st, p); if (ds(pl, w) > 85) continue; const g = gates(pl, w, 'pad'); g.b = st; g.p = p; if (!best || g.d < best.d) best = g; }
  }
  return best;
}
export function anchCand() {
  if (!pl) return null;
  if (pl.dock && pl.dock.ty === 'anchor') { const d = pl.dock; return { b: d.b, cx: d.cx, cy: d.cy, d: 0 }; }
  if (pl.dock) return null;
  let best = null;
  for (const b of near(pl.x, pl.y, 70)) {
    if (b.kind === 'station') continue;
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * TAU;
      for (const Rr of [pl.rad + 3, pl.rad + 9, pl.rad + 15]) {
        const x = pl.x + Math.cos(t) * Rr, y = pl.y + Math.sin(t) * Rr, c = ca(b, x, y);
        if (c && b.sol[c.i]) { const d = hy(x - pl.x, y - pl.y); if (!best || d < best.d) best = { b, cx: c.cx, cy: c.cy, d }; break; }
      }
    }
  }
  return best;
}
export function tryAnchor(c) {
  if (!c || !c.b || c.b.dead) return false;
  const rv = hy(pl.vx - (c.b.vx || 0), pl.vy - (c.b.vy || 0));
  if (rv > C.ANCH.v) { AU.warn(); hooks.toast('Too hot to harpoon — under 3 m/s relative', 'warn'); return false; }
  anchor(pl, c.b, c.cx, c.cy); setMatch(false);
  return true;
}

// ─── context button ──────────────────────────────────────────────────────
const ROOMTAB = { workshop: 'service', cargo: 'market', lift: null };
function updCtx() {
  let ctx = { l: '—', f: null, ok: false }, alt = null;
  const c = G.crew;
  if (G.ride) ctx = { l: G.ride.kind === 'lift' ? 'RIDING LIFT' : 'ABOARD MULE-3', f: null, ok: false, k: 'ride' };
  else if (ev && !ev.dead) {
    const sh = shuttle(), here = evaRoom(), b = boardable();
    if (c && c.state === 'site' && sh && hy(ev.x - sh.x, ev.y - sh.y) < 18) ctx = { l: 'BOARD MULE-3', f: crewBoard, ok: true, k: 'crewboard' };
    else if (b) ctx = { l: 'BOARD ' + b.name, f: () => boardShip(b), ok: true, k: 'board' };
    else if (here && here.rm) {
      const k = here.rm.kind, st = here.b;
      if (k === 'lift') {
        const end = st.surf ? 'ground' : 'top', car = carHere(end);
        ctx = car && !liftBusy() ? { l: end === 'ground' ? 'RIDE LIFT ▲' : 'RIDE LIFT ▼', f: () => ride(end, true), ok: true, k: 'lift' }
          : { l: 'LIFT IN TRANSIT', f: null, ok: false, k: 'liftwait' };
      } else if (k === 'crew') ctx = { l: c && c.state === 'idle' ? 'CREW OFFICE' : 'CREW OUT', f: () => hooks.openStation(st, 'crew'), ok: true, k: 'crew' };
      else {
        const tab = ROOMTAB[k] !== undefined ? ROOMTAB[k] : k;
        if (tab && (st.tabs || []).includes(tab)) ctx = { l: here.rm.name, f: () => hooks.openStation(st, tab), ok: true, k: 'terminal' };
        else if (st.tabs && st.tabs.length) ctx = { l: 'TERMINAL', f: () => hooks.openStation(st, st.tabs[0]), ok: true, k: 'terminal' };
      }
    }
    alt = { l: 'SCAN', f: ping, k: 'ping' };
  } else if (pl && pl.dock) {
    const d = pl.dock;
    if (d.ty === 'anchor') { ctx = { l: 'EVA', f: () => enterEVA(), ok: true, k: 'eva' }; alt = { l: 'RELEASE', f: () => undock(pl), k: 'release' }; }
    else if (d.ty === 'ground') { ctx = { l: 'EVA', f: () => enterEVA(), ok: true, k: 'eva' }; alt = { l: 'SAS ' + sasName(), f: cycleSAS, k: 'sas' }; }
    else {
      const b = d.b;
      ctx = b.tabs && b.tabs.length ? { l: 'SERVICES', f: () => hooks.openStation(b), ok: true, k: 'services' } : { l: 'EVA', f: () => enterEVA(), ok: true, k: 'eva' };
      alt = { l: d.ty === 'pad' && pl.tailLand ? 'EVA' : 'UNDOCK', f: d.ty === 'pad' && pl.tailLand ? () => enterEVA() : () => undock(pl), k: d.ty === 'pad' && pl.tailLand ? 'eva' : 'undock' };
      if (ctx.k === 'services' && !(d.ty === 'pad' && pl.tailLand)) alt = { l: 'UNDOCK', f: () => { hooks.closeStation(); undock(pl); }, k: 'undock' };
    }
  } else if (pl && !pl.dead) {
    const g = PC.assist, a = anchCand();
    if (g && g.ty === 'port') ctx = { l: 'CLAMP', ok: g.ok, k: 'clamp', f: () => { if (g.ok) { dock(pl, g.b, g.p, g.ty); setMatch(false); } else { AU.warn(); hooks.toast(!g.v ? 'Too fast — kill ΔV [BRAKE/MATCH]' : !g.a ? 'Align the nose with the port' : !g.r ? 'Stop the spin' : !g.l ? 'Center the lateral offset' : 'Drift closer', 'warn'); } } };
    else if (a) ctx = { l: 'HARPOON', f: () => tryAnchor(a), k: 'anchor', ok: a.d < Math.max(C.ANCH.d, pl.rad + 10) && hy(pl.vx - (a.b.vx || 0), pl.vy - (a.b.vy || 0)) < C.ANCH.v };
    else if (hy(pl.vx, pl.vy) < 2.2 && altAt(pl.x, pl.y) > 40) ctx = { l: 'EVA', f: () => enterEVA(), ok: true, k: 'eva' };
    alt = { l: 'SAS ' + sasName(), f: cycleSAS, k: 'sas' };
  }
  PC.ctx = ctx; PC.alt = alt;
  $('ctxL').textContent = ctx.l; $('ctx').classList.toggle('ready', !!ctx.ok); $('ctx').disabled = !ctx.f;
  $('alt').classList.toggle('on', !!alt); if (alt) $('alt').textContent = alt.l;
}
export function cycleSAS() { PC.sas = ((PC.sas || 0) + 1) % 4; AU.ui(); if (!CTL.ai) hooks.toast('SAS · ' + sasName() + (PC.sas === 1 ? ' — nose held away from the Moon' : PC.sas === 2 ? ' — nose held against your velocity (landing burns)' : PC.sas === 3 ? ' — nose along your velocity' : '')); }

function edges() {
  for (let i = IN.edge.length - 1; i >= 0; i--) {
    const e = IN.edge[i]; let used = true;
    switch (e) {
      case 'match': if (pl && !ev && !pl.dock) { setMatch(!PC.match); AU.ui(); if (PC.match && !CTL.ai) hooks.toast('MATCH · RCS holds the target velocity. Push the stick to creep.'); } break;
      case 'target': cycleTgt(); break;
      case 'gear':
        if (pl && !ev) {
          if (!pl.tailLand && pl.cls === 'wren') { hooks.toast('WREN has no landing gear — it clamps to ports', 'warn'); break; }
          pl.gear = !pl.gear; $('gear').classList.toggle('act', pl.gear); AU.thunk(); hooks.toast(pl.gear ? 'GEAR DOWN' : 'gear up');
        }
        break;
      case 'scan':
        if (ev) ping();
        else if (pl) { PC.scan = !PC.scan; $('scan').classList.toggle('on', PC.scan); $('scanB').classList.toggle('act', PC.scan); AU.ui(); if (PC.scan && !PC.hints.has('s') && !CTL.ai) { PC.hints.add('s'); hooks.toast('ARRAY LIVE — bodies in the cone are surveyed automatically · drag the dial to find deep resonances'); } }
        break;
      case 'ctx': if (PC.ctx.f) PC.ctx.f(); break;
      case 'alt': if (PC.alt) PC.alt.f(); break;
      default: used = false;
    }
    if (used) IN.edge.splice(i, 1);
  }
}

/** per-frame control: CTL already holds this frame's stick/throttle (human or AI) */
export function control(dt) {
  if (!G || G.mode !== 'play') return;
  // riding: the suit travels with the vehicle
  if (ev && ev.hide && G.ride && G.ride.kind === 'shuttle' && G.ride.v) { ev.x = G.ride.v.x; ev.y = G.ride.v.y; ev.vx = G.ride.v.vx; ev.vy = G.ride.v.vy; ev.suit = 100; }
  updCtx(); edges();
  for (const t of IN.taps) { const w = s2w(t.x, t.y), o = pickAt(w.x, w.y); if (o) setTgt(o); else setNav(w.x, w.y); }
  IN.taps.length = 0;
  if (pl && !pl.dead && !ev) {
    if (pl.dock && CTL.thr < 0.04) PC.thrArm = true;
    if (!pl.dock) PC.thrArm = false;
    pl.thr = pl.dock && !PC.thrArm ? 0 : CTL.thr;
    const w = s2wv(CTL.lx, CTL.ly); pl.rcx = w.x; pl.rcy = w.y; pl.tqi = CTL.rx;
    pl.wantM = CTL.mine && !PC.scan;
    assists(dt); AU.engine(pl.thr);
    if (pl.fuel <= 0 && CTL.thr > 0 && !PC.hints.has('dry')) { PC.hints.add('dry'); hooks.toast('PROPELLANT DRY — call a tow from pause', 'bad'); }
    // pads clamp automatically when every gate is green: that's a landing
    PC.assist = dockCand();
    const g = PC.assist;
    if (!pl.dock && !(pl.liftT && W.time - pl.liftT < 3) && g && g.ty === 'pad' && g.ok) {   // a ship in flight lands — but not in the first seconds after it leaves the pad, or lift-off re-clamps
      dock(pl, g.b, g.p, 'pad'); setMatch(false); PC.thrArm = false; PC.assist = null; }
  } else { PC.assist = null; AU.engine(0); }
  if (ev && pl) { pl.thr = pl.rcx = pl.rcy = pl.tqi = 0; pl.wantM = false; }
  dockHUD();
  updScan(dt); updCtx();
  AU.mine(!!(pl && pl.wantM && !ev) || !!(ev && ev.beam && !ev.beam.miss));
  tgtCard();
}

function dockHUD() {
  const g = PC.assist, el = $('dock');
  if (!g || PC.scan || ev) { el.classList.remove('on'); return; }
  el.classList.add('on');
  $('dTitle').textContent = g.ty === 'pad' ? (pl.tailLand ? 'TOUCHDOWN ENVELOPE · ' + g.p.name : 'PAD ENVELOPE') : 'CLAMP ENVELOPE';
  const set = (id, ok, txt) => { const e = $(id); e.classList.toggle('ok', ok); e.textContent = txt; };
  set('gS', g.v, 'SPD ' + g.rv.toFixed(1)); set('gA', g.a, 'ANG ' + Math.round((g.ae * 180) / Math.PI) + '°');
  set('gL', g.l, 'LAT ' + g.lat.toFixed(1) + 'm'); set('gR', g.r, 'ROT ' + g.re.toFixed(2));
  $('dHint').textContent = !g.gear ? 'GEAR DOWN [G]' : !g.near ? 'close in — ' + g.d.toFixed(0) + 'm' : g.ok ? (g.ty === 'pad' ? 'TOUCHDOWN' : 'ALL GREEN — CLAMP [F]') : 'match ΔV, attitude and spin';
}
function tgtCard() {
  const t = PC.tgt, card = $('tgt'), f = focus();
  if (!t || !f || t.dead) { card.classList.remove('on'); return; }
  card.classList.add('on');
  $('tName').textContent = t.name || 'CONTACT';
  $('tKind').textContent = t.kind === 'ship' ? t.fac + ' · ' + t.cls : t.kind === 'rock' ? (t.cat ? t.typeN + ' · ' + t.origin : 'UNCATALOGUED · survey it') : t.kind === 'station' ? (t.surf ? 'SURFACE · ' : 'ORBITAL · ') + t.type : '';
  const d = ds(t, f), rvx = (t.vx || 0) - (f.vx || 0), rvy = (t.vy || 0) - (f.vy || 0);
  $('tDist').textContent = Math.round(d); $('tRel').textContent = hy(rvx, rvy).toFixed(1);
  $('tClose').textContent = (d > 1 ? -((t.x - f.x) * rvx + (t.y - f.y) * rvy) / d : 0).toFixed(1);
}

/** flight telemetry for HUD & AI: altitude, radial / tangential speed, local g */
export function tele(o) {
  const r = hy(o.x, o.y), ux = o.x / r, uy = o.y / r, vr = (o.vx || 0) * ux + (o.vy || 0) * uy, vt = (o.vx || 0) * -uy + (o.vy || 0) * ux;
  return { r, alt: r - surfR(Math.atan2(o.y, o.x)), vr, vt, g: geff(r), band: r - C.RS };
}
export { alive };
