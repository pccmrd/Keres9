// ═══ tier 1: Foreman Lu's EVA crew on the MULE-3 shuttle ════════════════
import { TAU, hy, cl, rr, pk, ad, fm } from './core/util.js';
import { C, GD, gacc, PAL } from './core/config.js';
import { W, G, ev, setEv, cam } from './core/state.js';
import { near, ca, cw, collide, cut, ray, portW } from './world/body.js';
import { mkShip, dock, undock, anchor, stats } from './ships.js';
import { steer, applyOut, standoff, detour } from './autop.js';
import { mkSuit, airlockSpot, sackN } from './eva.js';
import { spill } from './combat.js';
import { SITES } from './world/gen.js';
import { gas, sparks } from './fx.js';
import { AU } from './audio.js';
import { hooks } from './hooks.js';

const R = Math.random, GA = { x: 0, y: 0 };
export const MATES = [{ n: 'Dagny Okafor', c: '#ffb347' }, { n: 'Tomas Reyes', c: '#8cff9e' }, { n: 'Ines Varga', c: '#c77dff' }];

export function crewInit() {
  const st = SITES.sel, p = st.ports[2];
  const s = mkShip('mule', 'crew', 'MULE-3', st.x - 200, st.y);
  p.crew = true;   // MULE-3's home berth: the shipyard never parks a sale here
  dock(s, st, p, 'port', true);
  s.crewShuttle = true;
  G.crew = { state: 'idle', site: null, t: 0, haul: {}, mates: {}, mine: 0, ship: s, ap: {}, wait: 0, horn: false, shifts: G.crew ? G.crew.shifts : 0 };
  W.suits = [];
}
export const shuttle = () => G.crew && G.crew.ship;

/** choose a body to work: big enough, near the station, not the Orphan */
function pickSite() {
  const st = SITES.sel, L = W.rocks.filter(b => !b.dead && !b.orphan && !b.inbound && !b.kin && !b.hidden && b.R >= 16 && hy(b.x - st.x, b.y - st.y) < 1500 && b.cells > 300);
  // Lu eyeballs the colour of a rock: dark metallic and icy bodies pay, grey stony ones do not
  const ore = b => { const c = b.comp || {}; return ((c.ice || 0) + (c.fe || 0) * 1.3 + (c.vol || 0) * 2 + (c.pgm || 0) * 6 + (c.ree || 0) * 8) / Math.max(1, b.cells); };
  const sc = b => hy(b.x - st.x, b.y - st.y) + (b.cat ? 900 : 0) + (b.worked || 0) * 400 - ore(b) * 1600;
  L.sort((a, b) => sc(a) - sc(b));
  return L[Math.floor(R() * Math.min(4, L.length))] || L[0];
}

/** player signs on and climbs aboard at the station */
export function boardShift() {
  const c = G.crew; if (!c || c.state !== 'idle' || !ev) return false;
  c.state = 'out'; c.site = pickSite(); c.site.worked = (c.site.worked || 0) + 1; c.haul = {}; c.mates = {}; c.mine = 0; c.t = C.SHIFT; c.horn = false; c.wp = null;
  ev.hide = true; ev.home = c.ship; G.ride = { kind: 'shuttle', v: c.ship };
  hooks.closeStation(); AU.thunk();
  { const st = SITES.sel, d = c.ship.dock; if (d && d.p) { const w = portW(st, d.p); c.exit = { x: w.x + Math.cos(w.dir) * 70, y: w.y + Math.sin(w.dir) * 70 }; } else c.exit = null; }
  undock(c.ship);
  hooks.toast('MULE-3 · Foreman Lu: "Strap in. Today we work ' + c.site.name + '. Shift is ' + Math.round(C.SHIFT / 60) + ' minutes, sack goes in the tally."', 'good');
  return true;
}

function spawnMates(c) {
  const s = c.ship; W.suits = [];
  for (let i = 0; i < 2; i++) {
    const m = MATES[(c.site.uid + i) % MATES.length];
    W.suits.push({ x: s.x + rr(R, -6, 6), y: s.y + rr(R, -6, 6), vx: 0, vy: 0, a: 0, name: m.n, c: m.c, st: 'go', tgt: null, t: 0, n: 0, beam: null });
  }
}
/** a surface cell on the site, approached from outside */
function faceSpot(b, from) {
  const a0 = from ? Math.atan2(from.y - b.y, from.x - b.x) : R() * TAU;
  for (let k = 0; k < 12; k++) {
    const a = a0 + rr(R, -0.7, 0.7) * (from ? 1 : 4.5), ox = b.x + Math.cos(a) * (b.rad + 30), oy = b.y + Math.sin(a) * (b.rad + 30);
    const h = ray(ox, oy, -Math.cos(a), -Math.sin(a), b.rad + 30);
    if (h && h.b === b) return { x: h.x + Math.cos(a) * 7, y: h.y + Math.sin(a) * 7, a: a + Math.PI };
  }
  return null;
}
function stepMates(c, dt) {
  const s = c.ship;
  for (const m of W.suits) {
    let tx = m.x, ty = m.y;
    m.t -= dt; m.beam = null;
    if (m.st === 'go') {
      if (c.horn) { m.st = 'back'; m.tgt = null; continue; }
      if (!m.tgt) m.tgt = faceSpot(c.site, s);
      if (!m.tgt) continue;
      tx = m.tgt.x; ty = m.tgt.y;
      if (hy(tx - m.x, ty - m.y) < 3) { m.st = 'cut'; m.t = rr(R, 6, 11); }
      if ((m.goT = (m.goT || 0) + dt) > 25) { m.goT = 0; m.tgt = faceSpot(c.site, s); }
    } else if (m.st === 'cut') {
      if (!m.tgt) { m.st = 'go'; continue; }
      tx = m.tgt.x; ty = m.tgt.y; m.a = m.tgt.a;
      const h = ray(m.x, m.y, Math.cos(m.a), Math.sin(m.a), C.CUT.rng);
      if (h && h.b === c.site) {
        m.beam = { x0: m.x, y0: m.y, x1: h.x, y1: h.y };
        const mm = cut(h.b, h.cx, h.cy, C.CUT.dps * 0.8 * dt);
        if (mm) { const g = W.stats.mined; spill(mm, h.x, h.y, Math.cos(m.a), Math.sin(m.a), false, 0.5); W.stats.mined = g; }
      } else m.tgt = faceSpot(c.site, s);
      // scoop nearby grit
      for (const p of W.picks) if (!p.dead && !p.held && GD[p.type] && hy(p.x - m.x, p.y - m.y) < 10 && m.n < 6) { m.n += p.qty; p.dead = true; c.mates[p.type] = (c.mates[p.type] || 0) + p.qty; }
      if (m.t <= 0 || m.n >= 6 || c.horn) { m.st = 'back'; m.tgt = null; }
    } else if (m.st === 'back') {
      tx = s.x; ty = s.y;
      m.bt = (m.bt || 0) + dt;
      // close enough, or snagged on the rock for too long: they clip onto the tether and reel in
      if (hy(tx - m.x, ty - m.y) < 10 || m.bt > 14) { m.bt = 0; m.n = 0; if (c.horn) m.st = 'in'; else { m.st = 'go'; m.t = 0; m.tgt = null; } }
    } else if (m.st === 'in') { m.x = s.x; m.y = s.y; m.vx = s.vx; m.vy = s.vy; continue; }
    // jetpack PD
    gacc(m.x, m.y, m.vx, m.vy, GA);
    const dx = tx - m.x, dy = ty - m.y, d = hy(dx, dy), vs = Math.min(9, d * 0.8), vx = d > 0.1 ? (dx / d) * vs : 0, vy = d > 0.1 ? (dy / d) * vs : 0;
    let ax = (vx - m.vx) * 2 - GA.x, ay = (vy - m.vy) * 2 - GA.y; const am = hy(ax, ay);
    if (am > 10) { ax *= 10 / am; ay *= 10 / am; }
    m.vx += (ax + GA.x) * dt; m.vy += (ay + GA.y) * dt; m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.st !== 'cut' && d > 1) m.a = Math.atan2(dy, dx);
    if (am > 3 && R() < 0.2) gas(m.x, m.y, m.vx - ax * 2, m.vy - ay * 2);
    collide(m, 2.4, null);
  }
}

export function crewTick(dt) {
  const c = G.crew; if (!c || !c.ship) return;
  if (c.ship.dead) {   // belt-and-braces: a lost MULE must never strand the hand — station control recovers everyone
    const riding = G.ride && G.ride.kind === 'shuttle';
    crewInit();
    if (riding && ev) { const st = SITES.sel, p = st.ports[2], pw = cw(st, p.cx, p.cy); ev.x = pw.x - 10; ev.y = pw.y; ev.vx = st.vx || 0; ev.vy = st.vy || 0; ev.hide = false; G.ride = null; }
    hooks.toast('MULE-3 lost — SELENE rescue brings the crew home. A spare MULE is fuelled.', 'warn');
    return;
  }
  const s = c.ship, st = SITES.sel, ap = c.ap;
  if (c.state === 'out') {
    // fly out to the site, harpoon on
    const site = c.site, so = standoff(site, st.x, st.y, 16);
    if (c.exit && (hy(c.exit.x - s.x, c.exit.y - s.y) < 12 || (c.legT || 0) > 40)) c.exit = null;
    const wp = c.exit || detour(s.x, s.y, so.x, so.y, 16, site);
    const t = wp ? steer(s, wp.x, wp.y, { vmax: 40, out: ap }) : steer(s, so.x, so.y, { vmax: 40, out: ap, face: Math.atan2(site.y - s.y, site.x - s.x) });
    applyOut(s, ap);
    c.legT = (c.legT || 0) + dt;
    let h = null, ok = false;
    if ((!wp && t.d < 6 && t.rv < 1.2) || (c.legT > 120 && t.rv < 3)) {
      const dd = Math.max(1, hy(site.x - s.x, site.y - s.y));
      h = ray(s.x, s.y, (site.x - s.x) / dd, (site.y - s.y) / dd, 60);
      ok = !!h && h.b === site && hy(h.x - s.x, h.y - s.y) < 30;
    }
    if (!ok && c.legT > 200) {
      // Lu never hangs off a rock all shift: past 200 s SELENE traffic walks her onto the station-facing face
      const dd = Math.max(1, hy(s.x - site.x, s.y - site.y)), ux = (s.x - site.x) / dd, uy = (s.y - site.y) / dd, R0 = site.rad + 40;
      const g = ray(site.x + ux * R0, site.y + uy * R0, -ux, -uy, R0 + 5);
      if (g && g.b === site) { h = g; ok = true; s.x = g.x + ux * (s.rad + 3); s.y = g.y + uy * (s.rad + 3); s.vx = site.vx || 0; s.vy = site.vy || 0; s.a = Math.atan2(-uy, -ux); }
      else if (c.legT > 260) { c.site = pickSite(); c.site.worked = (c.site.worked || 0) + 1; c.legT = 0; }
    }
    {
      if (ok) {
        anchor(s, site, h.cx, h.cy); c.legT = 0;
        c.state = 'site'; spawnMates(c);
        if (ev) {
          ev.hide = false; G.ride = null;
          const a = Math.atan2(site.y - s.y, site.x - s.x) + Math.PI / 2;
          ev.x = s.x + Math.cos(a) * 9; ev.y = s.y + Math.sin(a) * 9; ev.vx = ev.vy = 0; ev.a = Math.atan2(site.y - ev.y, site.x - ev.x);
        }
        AU.thunk();
        hooks.toast('ON SITE · ' + site.name + ' — out you go. Cut, fill the sack, bring it to the MULE. [MINE] cuts · [C] hand scanner surveys the body', 'good');
      }
    }
  } else if (c.state === 'site') {
    c.t -= dt;
    if (!s.dock) {
      // harpoon sheared: Lu holds station and re-sets it
      const site = c.site, so = standoff(site, st.x, st.y, 16);
      const t = steer(s, so.x, so.y, { vmax: 15, out: ap, face: Math.atan2(site.y - s.y, site.x - s.x), tvx: site.vx || 0, tvy: site.vy || 0 });
      applyOut(s, ap);
      if (t.d < 8 && t.rv < 1.5) {
        const dd = Math.max(1, hy(site.x - s.x, site.y - s.y)), h = ray(s.x, s.y, (site.x - s.x) / dd, (site.y - s.y) / dd, 60);
        if (h && hy(h.x - s.x, h.y - s.y) < 30) anchor(s, site, h.cx, h.cy);
      }
    }
    stepMates(c, dt);
    if (c.t <= 60 && !c.warned) { c.warned = true; hooks.toast('Lu: "One minute, people. Start bringing it home."', 'warn'); AU.warn(); }
    if (c.t <= 0 && !c.horn) { c.horn = true; c.grace = 75; AU.alarm(); hooks.toast('SHIFT HORN · back to MULE-3 and press F at the hatch', 'warn'); }
    if (c.horn) {
      c.grace -= dt;
      const matesIn = W.suits.every(m => m.st === 'in');
      const youIn = !ev || ev.hide;
      if (c.grace <= 0 && !youIn && ev) { hooks.toast('Lu reels you in on the tether. "That comes out of your share."', 'bad'); c.late = true; reelIn(); }
      if (matesIn && (!ev || ev.hide)) { c.legT = 0; c.state = 'back'; W.suits = []; undock(s); hooks.toast('MULE-3 · heading home to SELENE HIGH', 'good'); }
    }
  } else if (c.state === 'back') {
    // home berth, unless someone is sitting in it — then any free port (never shove a parked ship off)
    if (!c.home || (c.home.occ && c.home.occ !== s)) c.home = [st.ports[2], ...st.ports].find(q => !q.occ || q.occ === s) || st.ports[2];
    const p = c.home, pw = cw(st, p.cx, p.cy), out = p.cx < st.gw / 2 ? -26 : 26, app = { x: pw.x + Math.cos(st.a) * out, y: pw.y + Math.sin(st.a) * out };
    const wp = detour(s.x, s.y, app.x, app.y, 16, st);
    const t = steer(s, wp ? wp.x : app.x, wp ? wp.y : app.y, { vmax: 40, out: ap, face: wp ? null : 0 });
    applyOut(s, ap);
    c.legT = (c.legT || 0) + dt;
    // Lu always gets home: after a long wobble, SELENE traffic control tractors her in
    if ((!wp && t.d < 8 && t.rv < 1) || c.legT > 140) { c.legT = 0; c.home = null; if (!p.occ || p.occ === s) dock(s, st, p, 'port', true); payout(c); }
  } else if (c.state === 'idle') { s.thr = s.rcx = s.rcy = s.tqi = 0; }
}
/** player climbs back in at the site */
export function crewBoard() {
  const c = G.crew; if (!ev || !c) return;
  if (c.state !== 'site') return;
  if (!c.horn) { c.horn = true; c.t = 0; c.grace = 75; hooks.toast('You call it early. Lu sounds the horn.', 'warn'); }
  ev.hide = true; G.ride = { kind: 'shuttle', v: c.ship };
}
function reelIn() { if (!ev) return; ev.hide = true; G.ride = { kind: 'shuttle', v: G.crew.ship }; }

/** at the dock: pay the hand */
function payout(c) {
  c.state = 'idle'; G.crew.shifts = (G.crew.shifts || 0) + 1; W.stats.shifts++;
  if (c.ship) { c.ship.fuel = c.ship.fuelMax || c.ship.fuel; c.ship.hp = c.ship.hpMax || c.ship.hp; }
  const st = SITES.sel;
  let val = 0, n = 0;
  for (const g in c.haul) { val += c.haul[g] * (GD[g].p); n += c.haul[g]; }
  let mates = 0; for (const g in c.mates) mates += c.mates[g] * GD[g].p;
  const base = 140, share = Math.round(val * 0.6 + mates * 0.08);
  let pay = base + share; if (c.late) pay = Math.round(pay * 0.75); c.late = false;
  G.cr += pay; W.stats.earned += pay;
  c.warned = false;
  if (ev) {
    const p = airlockSpot(st, c.ship.x, c.ship.y);
    ev.hide = false; G.ride = null; ev.home = null; if (p) { ev.x = p.x; ev.y = p.y; } ev.vx = ev.vy = 0;
  }
  AU.cash();
  hooks.toast(`SHIFT PAID · ${fm(pay)}₡ — base ${base}, your ${n} units ${fm(Math.round(val * 0.6))}, crew bonus ${Math.round(mates * 0.08)}${c.late ? ' (late −25%)' : ''}`, 'good');
  hooks.shiftDone && hooks.shiftDone(n, pay);
}
export function crewLine() {
  const c = G.crew; if (!c) return '';
  if (c.state === 'idle') return 'MULE-3 docked at SELENE HIGH · next shift boards on request';
  if (c.state === 'out') return 'MULE-3 en route to ' + c.site.name;
  if (c.state === 'site') return 'SHIFT ' + (c.t > 0 ? Math.floor(c.t / 60) + ':' + String(Math.floor(c.t % 60)).padStart(2, '0') : 'HORN · get back aboard');
  return 'MULE-3 returning to SELENE HIGH';
}
export { PAL, cl, ad, pk, stats, setEv, cam, near, ca };
