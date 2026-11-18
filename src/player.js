// ═══ cockpit: camera, targeting, flight assists, context actions ════════
import { $, TAU, cl, lp, hy, ad, ds } from './core/util.js';
import { C } from './core/config.js';
import { W, G, pl, ev, cam, PC, CTL } from './core/state.js';
import { near, ca, cw, cut, portW } from './world/body.js';
import { dock, anchor, undock } from './ships.js';
import { dmgAt } from './combat.js';
import { sparks, gas } from './fx.js';
import { nearPick } from './physics.js';
import { evaIn, evaHome, enterEVA, exitEVA, ping, nearestCrew } from './eva.js';
import { updScan } from './scanner.js';
import { board } from './agents.js';
import { talk } from './social.js';
import { IN } from './input.js';
import { AU } from './audio.js';
import { toast, openStation } from './ui.js';

// ─── camera ──────────────────────────────────────────────────────────────
export const camX = () => cam.x + cam.lx, camY = () => cam.y + cam.ly;
export function s2w(sx, sy) {
  const r = $('cv').getBoundingClientRect();
  return { x: camX() + (sx - r.left - r.width / 2) / cam.z, y: camY() + (sy - r.top - r.height / 2) / cam.z };
}
export const defZoom = () => cl($('cv').getBoundingClientRect().width / 380, 0.9, 2.4);
export function updCam(dt) {
  const f = ev || pl; if (!f) return;
  const k = 1 - Math.exp(-4.2 * dt);
  let tx = f.x + cl(f.vx * 0.4, -110, 110), ty = f.y + cl(f.vy * 0.4, -110, 110);
  if (cam.aux) { tx = lp(tx, cam.aux.x, 0.38); ty = lp(ty, cam.aux.y, 0.38); }
  cam.x = lp(cam.x, tx, k); cam.y = lp(cam.y, ty, k);
  cam.lt -= dt;
  if (cam.lt <= 0) { const q = 1 - Math.exp(-2.4 * dt); cam.lx = lp(cam.lx, 0, q); cam.ly = lp(cam.ly, 0, q); }
  if (cam.user > 0) cam.user -= dt;
  cam.z = lp(cam.z, cam.tz, 1 - Math.exp(-(cam.zr || 6) * dt));
  cam.shake *= Math.exp(-4.5 * dt);
}

// ─── targeting / nav ─────────────────────────────────────────────────────
export function targets() {
  const f = ev || pl, L = []; if (!f) return L;
  for (const s of W.ships) if (!s.dead && !s.isPl && ds(s, f) < 1600) L.push(s);
  for (const b of W.bodies) if (ds(b, f) < 2200) L.push(b);
  L.sort((a, b) => ds(a, f) - ds(b, f));
  return L;
}
export function setTgt(t) { PC.tgt = t; AU.ui(); }
export function cycleTgt() { const L = targets(); if (!L.length) { setTgt(null); return; } setTgt(L[(L.indexOf(PC.tgt) + 1) % L.length]); }
export function setNav(x, y, l, quiet) { W.nav = { x, y, l: l || 'WAYPOINT' }; if (!quiet) { AU.blip(); toast('NAV ▸ ' + (l || 'waypoint set')); } }
export function pickAt(x, y) {
  let best = null, bd = 40;
  const con = (o, d) => { if (d < bd) { bd = d; best = o; } };
  for (const s of W.ships) if (!s.dead) con(s, hy(s.x - x, s.y - y) - s.rad);
  for (const b of W.bodies) { const d = hy(b.x - x, b.y - y); if (d < b.rad + 20) con(b, d - b.rad * 0.5); }
  for (const p of W.picks) if (!p.dead) con(p, hy(p.x - x, p.y - y) - 6);
  return best;
}

// ─── flight assists ──────────────────────────────────────────────────────
/** RCS toward a velocity error (proportional) */
export function drive(s, dx, dy) {
  const m = hy(dx, dy);
  if (m < 0.06) { s.rcx = s.rcy = 0; return false; }
  const l = Math.min(1, m / 2.2); s.rcx = (dx / m) * l; s.rcy = (dy / m) * l;
  return true;
}
function setMatch(on) { PC.match = on; $('match').classList.toggle('act', on); }
function assists() {
  if (!pl || pl.dead || ev) return;
  const sx = CTL.lx, sy = CTL.ly, man = Math.abs(CTL.rx) > 0.05;
  if (CTL.brake) {
    if (PC.match) setMatch(false);
    drive(pl, sx * 8 - pl.vx, sy * 8 - pl.vy);
    if (!man) pl.tqi = cl(-pl.va * 2.2, -1, 1);
    return;
  }
  if (PC.match) {
    const t = PC.assist ? PC.assist.w : PC.tgt && (PC.tgt.kind === 'ship' || PC.tgt.kind === 'hulk') ? PC.tgt : null;
    drive(pl, (t ? t.vx : 0) + sx * 8 - pl.vx, (t ? t.vy : 0) + sy * 8 - pl.vy);
    if (PC.assist && !man) {
      const want = PC.assist.ty === 'pad' ? PC.assist.w.dir + Math.PI / 2 : PC.assist.w.dir + Math.PI;
      pl.tqi = cl(ad(want, pl.a) * 2.2 + ((PC.assist.w.va || 0) - pl.va) * 1.6, -1, 1);
    }
    if (pl.fuel <= 0) { setMatch(false); toast('MATCH offline — reaction mass dry', 'bad'); }
  }
}

/** the four clamp gates (plus range & gear) for a port/pad world pose */
export function gates(s, w, ty) {
  const cfg = ty === 'pad' ? C.LAND : C.DOCK, rv = hy(s.vx - w.vx, s.vy - w.vy), want = ty === 'pad' ? w.dir + Math.PI / 2 : w.dir + Math.PI;
  const ae = Math.abs(ad(s.a, want));
  const pt = ty === 'pad' ? { x: s.x + Math.cos(s.a + Math.PI / 2) * s.belly, y: s.y + Math.sin(s.a + Math.PI / 2) * s.belly } : { x: s.x + Math.cos(s.a) * s.nose, y: s.y + Math.sin(s.a) * s.nose };
  const ox = pt.x - w.x, oy = pt.y - w.y, nx = Math.cos(w.dir), ny = Math.sin(w.dir), lat = Math.abs(ox * -ny + oy * nx), d = hy(ox, oy), re = Math.abs(s.va - (w.va || 0));
  const g = { v: rv < cfg.v, a: ae < cfg.a, l: lat < cfg.l, r: re < cfg.r, near: d < cfg.d, gear: ty !== 'pad' || s.gear, rv, ae, lat, re, d, w, ty };
  g.ok = g.v && g.a && g.l && g.r && g.near && g.gear;
  return g;
}
export function dockCand() {
  if (!pl || pl.dock) return null;
  let best = null;
  for (const st of W.stations) {
    if (st.dead) continue;
    for (const p of st.ports) { if (p.occ) continue; const w = portW(st, p); if (ds(pl, w) > 85) continue; const g = gates(pl, w, 'port'); g.b = st; g.p = p; if (!best || g.d < best.d) best = g; }
    for (const p of st.pads) { if (p.occ) continue; const w = portW(st, p); if (ds(pl, w) > 85) continue; const g = gates(pl, w, 'pad'); g.b = st; g.p = p; if (!best || g.d < best.d) best = g; }
  }
  return best;
}
export function anchCand() {
  if (!pl) return null;
  if (pl.dock && pl.dock.ty === 'anchor') { const d = pl.dock; return { b: d.b, cx: d.cx, cy: d.cy, ship: d.b.kind === 'ship' ? d.b : null, d: 0 }; }
  if (pl.dock) return null;
  let best = null;
  for (const b of near(pl.x, pl.y, 70)) for (let k = 0; k < 16; k++) {
    const t = (k / 16) * TAU;
    for (const Rr of [pl.rad + 3, pl.rad + 9]) {
      const x = pl.x + Math.cos(t) * Rr, y = pl.y + Math.sin(t) * Rr, c = ca(b, x, y);
      if (c && b.sol[c.i]) { const d = hy(x - pl.x, y - pl.y); if (!best || d < best.d) best = { b, cx: c.cx, cy: c.cy, ship: null, d }; break; }
    }
  }
  for (const s of W.ships) { if (s === pl || s.dead) continue; const d = ds(s, pl) - s.rad; if (d < 14 && (!best || d < best.d)) best = { b: s, cx: -1, cy: -1, ship: s, d }; }
  return best;
}
export function tryAnchor(c) {
  if (!c || !c.b || c.b.dead) return false;
  if (c.ship ? ds(c.ship, pl) - c.ship.rad > 20 : !near(pl.x, pl.y, 30).includes(c.b)) return false;
  const rv = hy(pl.vx - (c.b.vx || 0), pl.vy - (c.b.vy || 0));
  if (rv > C.ANCH.v) { AU.warn(); toast('Too hot to harpoon — under 3 m/s relative', 'warn'); return false; }
  anchor(pl, c.b, c.cx, c.cy); setMatch(false);
  return true;
}
export function startBreach() {
  const c = anchCand(); if (!c) return;
  PC.breach = { t: c.b, ship: c.ship, cx: c.cx, cy: c.cy, p: 0, done: false };
  toast('CUTTING CHARGE SET — hold position', 'warn');
}
function updBreach(dt) {
  const b = PC.breach; if (!b || b.done) return;
  if (!pl.dock || pl.dock.ty !== 'anchor' || pl.dock.b !== b.t) { PC.breach = null; return; }
  b.p = Math.min(1, b.p + dt / 2.6);
  if (b.ship) {
    if (b.ship.dead) { PC.breach = null; return; }
    dmgAt(b.ship, b.ship.x, b.ship.y, 30 * dt, pl); gas(b.ship.x, b.ship.y, b.ship.vx, b.ship.vy); sparks(b.ship.x, b.ship.y, 1, '#53d9ff', 50);
  } else {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = b.cx + dx, cy = b.cy + dy;
      if (cx >= 0 && cy >= 0 && cx < b.t.gw && cy < b.t.gh && b.t.sol[cy * b.t.gw + cx]) cut(b.t, cx, cy, 46 * dt);
    }
    // the harpoon was bitten into the cut zone — re-seat it on the nearest intact plate
    const d = pl.dock;
    if (!b.t.sol[d.cy * b.t.gw + d.cx]) {
      let best = null, bd = 1e9;
      for (let y = d.cy - 5; y <= d.cy + 5; y++) for (let x = d.cx - 5; x <= d.cx + 5; x++) {
        if (x < 0 || y < 0 || x >= b.t.gw || y >= b.t.gh || !b.t.sol[y * b.t.gw + x] || (Math.abs(x - b.cx) <= 1 && Math.abs(y - b.cy) <= 1)) continue;
        const q = hy(x - d.cx, y - d.cy); if (q < bd) { bd = q; best = [x, y]; }
      }
      if (best) { d.cx = best[0]; d.cy = best[1]; }
    }
    const w = cw(b.t, b.cx, b.cy); sparks(w.x, w.y, 2, '#53d9ff', 60);
    if (Math.random() < 0.4) gas(w.x, w.y, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
  }
  if (b.p >= 1) {
    b.done = true; AU.boom(0.5); cam.shake += 8;
    if (!b.ship) b.t.breached = true;
    W.stats.breaches++;
    toast(b.ship ? 'HULL OPEN — board at will' : 'BREACH OPEN — atmosphere vented. EVA ready.', 'good');
  }
}

// ─── context button ──────────────────────────────────────────────────────
function updCtx() {
  let ctx = { l: '—', f: null, ok: false }, alt = null;
  if (ev) {
    const p = nearPick(ev.x, ev.y, 7), inside = evaIn();
    if (evaHome()) ctx = { l: 'ENTER SHIP', f: exitEVA, ok: true, k: 'enter' };
    else if (p && !ev.carry) ctx = { l: p.type === 'pod' ? 'RESCUE POD' : 'GRAB', k: 'grab', ok: true,
      f: () => { p.held = true; ev.carry = p; AU.blip(); toast(p.type === 'pod' ? 'POD SECURED — bring them home' : 'CARRYING ' + (p.type === 'pod' ? 'pod' : p.type.toUpperCase()), 'good'); } };
    else {
      const cr = nearestCrew();
      if (cr) ctx = { l: 'TALK', f: () => talk(cr.cr, cr.b), ok: true, k: 'talk' };
      else if (inside && inside.kind === 'station') ctx = { l: 'TERMINAL', f: () => openStation(inside), ok: true, k: 'terminal' };
      else ctx = { l: 'PING', f: ping, ok: ev.pingT >= 1.2, k: 'ping' };
    }
    if (!evaHome() && inside && inside.kind === 'station') alt = { l: 'TERMINAL', f: () => openStation(inside) };
  } else if (pl && pl.dock) {
    const d = pl.dock;
    if (d.ty === 'anchor') {
      const isShip = d.b.kind === 'ship';
      if (PC.breach && !PC.breach.done) ctx = { l: 'CUTTING ' + Math.round(PC.breach.p * 100) + '%', f: null, ok: false, k: 'cutting' };
      else if (isShip && PC.breach && PC.breach.done) ctx = { l: 'BOARD', f: () => board(d.b), ok: true, k: 'board' };
      else if (isShip || (d.b.kind === 'hulk' && !(PC.breach && PC.breach.done && PC.breach.t === d.b))) ctx = { l: 'BREACH', f: startBreach, ok: true, k: 'breach' };
      else ctx = { l: 'EVA', f: enterEVA, ok: true, k: 'eva' };
      alt = { l: 'RELEASE', f: () => { undock(pl); PC.breach = null; }, k: 'release' };
    } else { ctx = { l: 'SERVICES', f: () => openStation(d.b), ok: true, k: 'services' }; alt = { l: 'EVA', f: enterEVA, k: 'eva' }; }
  } else if (pl && !pl.dead) {
    const g = PC.assist;
    if (g) {
      ctx = { l: g.ty === 'pad' ? 'LAND' : 'CLAMP', ok: g.ok, k: 'clamp',
        f: () => {
          if (g.ok) { dock(pl, g.b, g.p, g.ty); setMatch(false); }
          else { AU.warn(); toast(!g.gear ? 'Deploy gear first [GEAR]' : !g.v ? 'Too fast — kill ΔV [MATCH]' : !g.a ? 'Align attitude' : !g.r ? 'Match spin rate' : !g.l ? 'Center lateral offset' : 'Drift closer', 'warn'); }
        } };
      const a = anchCand(); if (a) alt = { l: 'ANCHOR', f: () => tryAnchor(a), k: 'anchor' };
    } else {
      const a = anchCand();
      if (a) ctx = { l: 'ANCHOR', f: () => tryAnchor(a), k: 'anchor', ok: a.d < C.ANCH.d && hy(pl.vx - (a.b.vx || 0), pl.vy - (a.b.vy || 0)) < C.ANCH.v };
      else if (hy(pl.vx, pl.vy) < 2.2) ctx = { l: 'EVA', f: enterEVA, ok: true, k: 'eva' };
    }
  }
  PC.ctx = ctx; PC.alt = alt;
  $('ctxL').textContent = ctx.l; $('ctx').classList.toggle('ready', !!ctx.ok); $('ctx').disabled = !ctx.f;
  $('alt').classList.toggle('on', !!alt); if (alt) $('alt').textContent = alt.l;
}

/** consume one-shot button / key edges */
function edges() {
  for (let i = IN.edge.length - 1; i >= 0; i--) {
    const e = IN.edge[i]; let used = true;
    switch (e) {
      case 'match':
        if (!ev && pl && !pl.dock) { setMatch(!PC.match); AU.ui(); if (PC.match && !CTL.ai) toast('MATCH · station-keeping armed. Push the stick to creep.'); }
        break;
      case 'target': cycleTgt(); break;
      case 'gear':
        if (pl && !ev) { pl.gear = !pl.gear; $('gear').classList.toggle('act', pl.gear); AU.thunk(); toast(pl.gear ? 'MAG-GEAR DEPLOYED' : 'gear retracted'); }
        break;
      case 'scan':
        if (ev) ping();
        else {
          PC.scan = !PC.scan; $('scan').classList.toggle('on', PC.scan); $('scanB').classList.toggle('act', PC.scan); AU.ui();
          if (PC.scan && !PC.hints.has('s') && !CTL.ai) { PC.hints.add('s'); toast('ARRAY LIVE — drag the dial, watch the spectrum bump, track the drift until LOCK'); }
        }
        break;
      case 'ctx': if (PC.ctx.f) PC.ctx.f(); break;
      case 'alt': if (PC.alt) PC.alt.f(); break;
      default: used = false;
    }
    if (used) IN.edge.splice(i, 1);
  }
}

/** per-frame cockpit update; CTL must already hold this frame's stick/throttle */
export function control(dt) {
  if (!G || G.mode !== 'play' || !pl || pl.dead) return;
  updCtx(); // never act on a context computed for another ship / frame
  edges();
  for (const t of IN.taps) { const w = s2w(t.x, t.y), o = pickAt(w.x, w.y); if (o) setTgt(o); else setNav(w.x, w.y); }
  IN.taps.length = 0;
  if (ev) { pl.thr = pl.rcx = pl.rcy = pl.tqi = 0; pl.wantF = pl.wantM = false; AU.engine(0); }
  else {
    pl.thr = pl.dock ? 0 : CTL.thr; pl.rcx = CTL.lx; pl.rcy = CTL.ly; pl.tqi = CTL.rx;
    pl.wantF = CTL.fire && !PC.scan; pl.wantM = CTL.mine && !PC.scan;
    assists(); AU.engine(pl.thr);
    if (pl.fuel <= 0 && CTL.thr > 0 && !PC.hints.has('dry')) { PC.hints.add('dry'); toast('REACTION MASS DRY — call a tow from pause', 'bad'); }
  }
  PC.assist = ev ? null : dockCand();
  if (PC.assist && !PC.hints.has('d') && !CTL.ai) { PC.hints.add('d'); toast('CLAMP ENVELOPE — four gates green, then commit. Ring ports rotate.'); }
  const g = PC.assist, el = $('dock');
  if (!g || PC.scan || ev) el.classList.remove('on');
  else {
    el.classList.add('on');
    $('dTitle').textContent = g.ty === 'pad' ? 'MAG-GEAR ENVELOPE' : 'CLAMP ENVELOPE';
    const set = (id, ok, txt) => { const e = $(id); e.classList.toggle('ok', ok); e.textContent = txt; };
    set('gS', g.v, 'SPD ' + g.rv.toFixed(1)); set('gA', g.a, 'ANG ' + Math.round((g.ae * 180) / Math.PI) + '°');
    set('gL', g.l, 'LAT ' + g.lat.toFixed(1) + 'm'); set('gR', g.r, 'ROT ' + g.re.toFixed(2));
    $('dHint').textContent = !g.gear ? 'deploy landing gear' : !g.near ? 'drift closer — ' + g.d.toFixed(0) + 'm' : g.ok ? 'ALL GATES GREEN — commit' : 'match ΔV, attitude and spin';
  }
  updScan(dt); updBreach(dt); updCtx();
  AU.mine(!!pl.wantM || !!(PC.breach && !PC.breach.done));
  const t = PC.tgt, card = $('tgt');
  if (!t || (t.kind === 'ship' && t.dead) || t.dead === true && t.kind === 'pick') card.classList.remove('on');
  else {
    card.classList.add('on');
    const f = ev || pl;
    $('tName').textContent = t.name || (t.type ? (t.type === 'pod' ? 'ESCAPE POD' : t.type.toUpperCase() + ' CRATE') : 'CONTACT');
    $('tKind').textContent = t.kind === 'ship' ? t.fac + ' · ' + t.role : t.kind === 'rock' ? 'ASTEROID · ' + t.type : t.kind === 'station' ? 'STATION · ' + t.type : t.kind === 'hulk' ? 'DERELICT' : 'LOOSE CARGO';
    const d = ds(t, f), rvx = (t.vx || 0) - f.vx, rvy = (t.vy || 0) - f.vy;
    $('tDist').textContent = Math.round(d); $('tRel').textContent = hy(rvx, rvy).toFixed(1);
    $('tClose').textContent = (d > 1 ? -((t.x - f.x) * rvx + (t.y - f.y) * rvy) / d : 0).toFixed(1);
  }
}
