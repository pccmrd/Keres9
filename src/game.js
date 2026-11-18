// ═══ session: new run / demo / load / save / death / tow / UI bindings ══
import { $, cl, hy, fm } from './core/util.js';
import { C, GD } from './core/config.js';
import { W, G, pl, ev, AG, cam, PC, setG, setPl, setEv, setAG } from './core/state.js';
import { cut, cw } from './world/body.js';
import { genWorld, spawnHulk } from './world/gen.js';
import { mkShip, mkPlayer, stats, dock, anchor, undock, cmass } from './ships.js';
import { mkAgent, initAgents } from './agents.js';
import { newGame, mkJobs, accept } from './missions.js';
import { price, trade, addRep, feed, freePort } from './economy.js';
import { talk } from './social.js';
import { defZoom, setNav } from './player.js';
import { IN } from './input.js';
import { AU } from './audio.js';
import { toast, mode, openStation, closeStation, closeDialog, confirmBox, panel, hudDOM, statGrid } from './ui.js';
import { V, resize, chart } from './render/render.js';
import { AP, apSet } from './ai/pilot.js';
import { NAV } from './ai/nav.js';

const KEY = 'keres9_v3';
const bkey = b => (b.kind === 'rock' ? 'r' : b.kind === 'station' ? 's' : 'h') + b.name;

function dockHome(p0) {
  const A = W.stations[0];
  const p = A.ports.find(q => !q.berth && !q.occ) || freePort(A);
  if (p) dock(p0, A, p, 'port', true);
}

// ─── persistence ─────────────────────────────────────────────────────────
export function save() {
  if (!W || !pl || !G || AP.demo || G.mode === 'title') return;
  try {
    const terr = {}; let n = 0;
    for (const b of W.bodies) {
      if (!b.cut.length) continue;
      const u = [...new Set(b.cut)], room = 9000 - n; if (room <= 0) break;
      const a = u.slice(0, room); n += a.length; terr[bkey(b)] = a;
    }
    const d = pl.dock ? { ty: pl.dock.ty, b: pl.dock.b.name, cx: pl.dock.cx, cy: pl.dock.cy,
      pi: pl.dock.p ? (pl.dock.ty === 'pad' ? pl.dock.b.pads.indexOf(pl.dock.p) : pl.dock.b.ports.indexOf(pl.dock.p)) : -1 } : null;
    localStorage.setItem(KEY, JSON.stringify({
      v: 3, seed: W.seed, time: W.time, sound: G.sound, nav: W.nav, terr, extra: W.extra,
      g: { debt: G.debt, rep: G.rep, story: G.story, prog: G.prog, jobs: G.jobs, missions: G.missions, shift: G.shift, clock: G.clock, win: G.win, stats: W.stats, jseed: G.jseed },
      pl: { x: pl.x, y: pl.y, a: pl.a, vx: pl.vx, vy: pl.vy, fuel: pl.fuel, cargo: pl.cargo, credits: pl.credits, upg: pl.upg, gear: pl.gear, d, mods: pl.mods.map(m => [m.hp, m.dead ? 1 : 0, m.max]) },
      econ: W.stations.map(s => ({ n: s.name, dead: s.dead, e: Object.fromEntries(Object.entries(s.econ).map(([g, q]) => [g, q.stock])) })),
      ag: AG.filter(a => a.alive).map(a => ({ id: a.id, name: a.name, role: a.role, fac: a.fac, credits: a.credits, cargo: a.cargo, grudge: a.grudge, favor: a.favor, kills: a.kills || 0,
        home: a.home ? a.home.name : null, ship: a.ship && !a.ship.dead ? { x: a.ship.x, y: a.ship.y, a: a.ship.a, role: a.ship.role, fuel: a.ship.fuel } : null })),
      ct: W.contacts.map((c, i) => (c.done ? i : -1)).filter(i => i >= 0),
      feed: W.feed.slice(0, 20),
    }));
  } catch (e) { /* storage full / private mode */ }
}
export function readSave() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

function build(seed) {
  genWorld(seed); setAG([]); setEv(null); AU.air(false); AU.mine(false);
  PC.tgt = null; PC.scan = false; PC.match = false; PC.breach = null; PC.assist = null; PC.hints.clear(); PC.lock = 0;
  PC.ctx = { l: '—', f: null, ok: false }; PC.alt = null;
  $('scan').classList.remove('on'); $('scanB').classList.remove('act'); $('match').classList.remove('act'); $('gear').classList.remove('act');
  $('toasts').innerHTML = ''; closeStation(); closeDialog(); IN.thr = 0; IN.thrUI(0); IN.edge.length = 0; IN.taps.length = 0; resize();
  cam.aux = null;
}

function freshSector(seed) {
  build(seed);
  const s = G ? G.sound : true;
  setG(newGame()); G.sound = s; syncSound();
  const A = W.stations[0];
  setPl(mkPlayer(A.x - 460, A.y + 14)); dockHome(pl);
  initAgents();
  for (const st of W.stations) mkJobs(st);
}

export function newRun() {
  try { localStorage.removeItem(KEY); } catch (e) { /* */ }
  apSet(false, false);
  freshSector((Math.random() * 1e9) | 0);
  startPlay();
}

/** watch-only showcase: fresh unsaved sector, AI pilot at the stick */
export function startDemo() {
  freshSector((Math.random() * 1e9) | 0);
  AP.demo = true;
  startPlay(true);
  W.evt = { next: 30, list: [], up: 6, last: null };
  apSet(true, true);
  toast('AI PILOT DEMO · press P or tap AI to take the stick — demo sectors are never saved', 'warn');
}

export function startPlay(quiet) {
  mode('play'); cam.tz = defZoom(); cam.x = pl.x; cam.y = pl.y;
  if (pl.dock) undock(pl);
  if (quiet) return;
  toast('SHIFT START · left stick RCS, right stick spin, right rail throttle', 'warn');
  setTimeout(() => toast('The port is right there. MATCH ΔV, align the nose, four green gates, then CLAMP.'), 1700);
  setTimeout(() => toast('Press P any time to hand the stick to the AI pilot.'), 3800);
  save();
}

export function load() {
  const d = readSave(); if (!d) { newRun(); return; }
  try {
    apSet(false, false);
    build(d.seed); setG(newGame()); G.sound = d.sound !== false; syncSound();
    Object.assign(G, d.g); W.stats = { ...W.stats, ...(d.g.stats || {}) }; W.time = d.time || 0; W.nav = d.nav || null; W.feed = d.feed || [];
    for (const x of d.extra || []) { W.extra = W.extra.filter(e => e !== x); spawnHulk(x.seed, x.x, x.y, x.name, x.vx, x.vy); }
    for (const k in d.terr) {
      const b = W.bodies.find(x => bkey(x) === k); if (!b) continue;
      for (const i of d.terr[k]) if (b.sol[i]) cut(b, i % b.gw, (i / b.gw) | 0, 1e6, true);
    }
    for (const es of d.econ) {
      const st = W.stations.find(s => s.name === es.n); if (!st) continue;
      st.dead = es.dead; for (const g in es.e) if (st.econ[g]) st.econ[g].stock = es.e[g];
    }
    setPl(mkPlayer(d.pl.x, d.pl.y));
    Object.assign(pl, { a: d.pl.a, vx: d.pl.vx, vy: d.pl.vy, fuel: d.pl.fuel, cargo: d.pl.cargo || {}, credits: d.pl.credits, upg: d.pl.upg || pl.upg, gear: !!d.pl.gear });
    (d.pl.mods || []).forEach((m, i) => { if (pl.mods[i]) { pl.mods[i].hp = m[0]; pl.mods[i].dead = !!m[1]; if (m[2]) pl.mods[i].max = m[2]; } });
    stats(pl); pl.dirty = true;
    initAgents();
    const by = new Map(AG.map(a => [a.id, a]));
    for (const sa of d.ag || []) {
      let a = by.get(sa.id);
      if (!a) {
        if (!sa.ship && sa.role !== 'hand') continue;
        a = mkAgent(() => Math.random(), sa.ship ? sa.ship.role : 'trader', sa.fac, sa.ship ? sa.ship.x : W.stations[0].x, sa.ship ? sa.ship.y : W.stations[0].y, sa.id, sa.name);
        if (!sa.ship && a.ship) { a.ship.dead = true; W.ships = W.ships.filter(s => s !== a.ship); a.ship = null; }
      }
      Object.assign(a, { name: sa.name, role: sa.role, fac: sa.fac, credits: sa.credits, cargo: sa.cargo || {}, grudge: sa.grudge, favor: sa.favor, kills: sa.kills });
      a.home = W.stations.find(s => s.name === sa.home) || null;
      if (sa.ship && a.ship) { Object.assign(a.ship, { x: sa.ship.x, y: sa.ship.y, a: sa.ship.a, fuel: sa.ship.fuel }); a.state = 'idle'; }
      else if (!sa.ship) { if (a.ship) { a.ship.dead = true; W.ships = W.ships.filter(s => s !== a.ship); } a.ship = null; a.state = sa.role === 'hand' ? 'hand' : 'stranded'; }
    }
    for (const a of AG) if (!(d.ag || []).some(sa => sa.id === a.id) && a.role !== 'fence' && a.ship) { a.ship.dead = true; W.ships = W.ships.filter(s => s !== a.ship); a.ship = null; a.alive = false; }
    for (const i of d.ct || []) {
      const c = W.contacts[i]; if (!c) continue; c.done = true;
      if (c.kind === 'vein') c.b.veinOn = true; else if (c.kind === 'cache') c.b.cacheOn = true;
      else if (c.b.cham) for (const ch of c.b.cham) { const w = cw(c.b, ch.cx, ch.cy); if (hy(w.x - c.x, w.y - c.y) < c.b.cs * 3) ch.disc = true; }
    }
    if (d.pl.d) {
      const b = W.bodies.find(x => x.name === d.pl.d.b);
      if (b) {
        if (d.pl.d.ty === 'anchor') anchor(pl, b, d.pl.d.cx, d.pl.d.cy);
        else { const arr = d.pl.d.ty === 'pad' ? b.pads : b.ports, p = arr && arr[d.pl.d.pi]; if (p && !p.occ) dock(pl, b, p, d.pl.d.ty, true); }
      }
    }
    for (const st of W.stations) if (!G.jobs[st.name]) mkJobs(st);
    $('gear').classList.toggle('act', pl.gear); mode('play'); cam.tz = defZoom(); cam.x = pl.x; cam.y = pl.y;
    toast('SHIFT RESUMED · sector state restored', 'good');
  } catch (e) { console.error(e); toast('Save unreadable — fresh sector', 'bad'); newRun(); }
}

// ─── death / recovery ────────────────────────────────────────────────────
export function rebuild(keep) {
  const old = pl;
  if (old) W.ships = W.ships.filter(s => s !== old);
  if (ev) { setEv(null); AU.air(false); }
  const A = W.stations[0];
  setPl(mkPlayer(A.x - 460, A.y + 14));
  if (old) { pl.credits = keep ? old.credits : Math.floor(old.credits * 0.85); pl.upg = old.upg; stats(pl); }
  pl.fuel = pl.fuelMax; dockHome(pl);
  PC.ctx = { l: '—', f: null, ok: false }; PC.alt = null; PC.assist = null;
  cam.x = pl.x; cam.y = pl.y; cam.aux = null; PC.tgt = null; PC.breach = null; PC.match = false; PC.scan = false;
  $('scan').classList.remove('on'); $('scanB').classList.remove('act'); $('match').classList.remove('act');
}
export function playerDied() {
  if (G.mode === 'dead') return;
  G.debt += 800; if (pl) pl.credits = Math.floor(pl.credits * 0.85);
  feed('KITE lost. Keres Mutual logged another recovery tow.', 'bad');
  if (ev) { setEv(null); AU.air(false); }
  if (G.mode === 'title') { rebuild(true); return; }
  statGrid($('dStats')); mode('dead');
}
export function tow() {
  if (!pl || pl.dead) return;
  let m;
  if (pl.credits >= 300) { pl.credits -= 300; m = 'TOW PAID · −300₡'; } else { G.debt += 400; m = 'TOW ON CREDIT · +400₡ debt'; }
  if (pl.dock) undock(pl);
  if (ev) { setEv(null); AU.air(false); }
  // the recovery crew bolts loaner thrusters onto anything that cannot steer
  let fixed = 0;
  for (const m of pl.mods) if ((m.t === 'rcs' || m.t === 'eng') && (m.dead || m.hp < m.max * 0.4)) { m.dead = false; m.hp = Math.max(m.hp, m.max * 0.4); fixed++; }
  if (fixed) { pl.dirty = true; stats(pl); m += ' · loaner thrusters fitted'; }
  const A = W.stations[0];
  pl.x = A.x - 460; pl.y = A.y + 14; pl.vx = pl.vy = pl.va = 0; pl.a = 0; pl.fuel = Math.max(pl.fuel, pl.fuelMax * 0.5);
  PC.ctx = { l: '—', f: null, ok: false }; PC.alt = null; PC.breach = null;
  dockHome(pl); cam.x = pl.x; cam.y = pl.y; mode('play'); toast(m, 'warn');
}

// ─── settings / bindings ─────────────────────────────────────────────────
export function syncSound() {
  const on = G.sound; AU.setOn(on); $('snd').textContent = on ? '🔊' : '🔇';
  $('sndT').textContent = 'SOUND: ' + (on ? 'ON' : 'OFF'); $('snd2').textContent = 'SOUND: ' + (on ? 'ON' : 'OFF');
}
export function toggleAI() {
  if (!G || G.mode === 'title') return;
  apSet(!AP.on);
  toast(AP.on ? 'AI PILOT ENGAGED — sit back' : 'MANUAL CONTROL — your stick' + (AP.demo ? ' · demo sector, not saved' : ''), AP.on ? 'good' : 'warn');
}
export function titleCam() { cam.tz = cl(V.w / 1100, 0.45, 1.1); }

export function bindUI() {
  const sndT = () => { G.sound = !G.sound; AU.init(); syncSound(); save(); };
  $('snd').onclick = sndT; $('sndT').onclick = sndT; $('snd2').onclick = sndT;
  $('pauseB').onclick = () => { if (G.mode === 'play') mode('pause'); else if (G.mode === 'pause') mode('play'); };
  $('res').onclick = () => mode('play'); $('resX').onclick = () => mode('play');
  $('aiB').onclick = toggleAI;
  $('aiP').onclick = () => { toggleAI(); mode('play'); };
  $('man').onclick = () => { $('helpO').classList.add('on'); AU.ui(); }; $('man2').onclick = () => { $('helpO').classList.add('on'); AU.ui(); };
  $('helpX').onclick = () => { $('helpO').classList.remove('on'); AU.ui(); };
  $('tow').onclick = tow;
  $('newSec').onclick = () => confirmBox('Abandon this sector? The ledger, the people and every cut you made in the rock will be gone.', newRun);
  $('exit').onclick = () => {
    save(); const wasDemo = AP.demo; apSet(false, false); mode('title');
    const s = readSave();
    $('cont').style.display = s ? '' : 'none';
    $('note').textContent = s ? 'SAVED · seed ' + s.seed + ' · shift ' + (s.g.shift || 1) + ' · ' + fm(s.pl.credits) + '₡' : wasDemo ? 'Demo ended. The belt is waiting for you.' : '';
    titleCam();
  };
  $('go').onclick = () => { AU.init(); newRun(); };
  $('cont').onclick = () => { AU.init(); load(); };
  $('demo').onclick = () => { AU.init(); startDemo(); };
  $('respawn').onclick = () => { rebuild(true); mode('play'); toast('RECOVERY COMPLETE · new hull, same ledger', 'warn'); save(); };
  $('keep').onclick = () => { mode('play'); toast('The belt keeps turning. Fly it as long as you like.', 'good'); };
  $('sX').onclick = closeStation;
  $('undock').onclick = () => { const st = G.panel; if (pl.dock && st && pl.dock.b === st) undock(pl); closeStation(); };
  document.querySelectorAll('#stationO .tabs button').forEach(b => (b.onclick = () => { G.tab = b.dataset.t; panel(); AU.ui(); }));
  $('pBody').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const st = G.panel, a = b.dataset.a; AU.ui();
    if (a === 'qty') { G.qty = b.dataset.q === 'MAX' ? 'MAX' : +b.dataset.q; panel(); return; }
    if (a === 'buy' || a === 'sell') {
      const g = b.dataset.g; let q = G.qty;
      if (q === 'MAX') q = a === 'buy' ? Math.min(Math.floor(pl.credits / price(st, g)), Math.floor((pl.cargoMax - cmass(pl)) / GD[g].m), st.econ[g].stock | 0) : pl.cargo[g] || 0;
      trade(st, g, Math.max(1, Math.floor(q)), a === 'buy'); panel(); hudDOM(); return;
    }
    if (a === 'svc') { const s = G.svc[+b.dataset.i]; if (s && s.ok) { s.f(); panel(); hudDOM(); } return; }
    if (a === 'accept') { const j = (G.jobs[st.name] || []).find(x => x.id === b.dataset.id); if (j) accept(j); panel(); return; }
    if (a === 'drop') { const j = G.missions.find(x => x.id === b.dataset.id); if (j) { G.missions = G.missions.filter(m => m !== j); addRep(j.rep, -2); toast('Contract dropped · rep −2', 'warn'); } panel(); return; }
    if (a === 'talk') { const x = AG.find(q => q.id == b.dataset.id); if (x) talk({ ag: x }, st); }
  });
  $('miniWrap').onclick = () => { $('mapO').classList.add('on'); chart($('chart'), true); AU.ui(); };
  $('mapX').onclick = () => { $('mapO').classList.remove('on'); AU.ui(); };
  $('chart').addEventListener('pointerdown', e => {
    const cv = $('chart'), r = cv.getBoundingClientRect();
    setNav(cl(((e.clientX - r.left) / r.width) * C.W, 0, C.W), cl(((e.clientY - r.top) / r.height) * C.H, 0, C.H), 'CHART WAYPOINT'); chart(cv, true);
  });
  $('scanX').onclick = () => { PC.scan = false; $('scan').classList.remove('on'); $('scanB').classList.remove('act'); };
  $('freq').addEventListener('input', e => { PC.freq = parseFloat(e.target.value); $('fVal').textContent = PC.freq.toFixed(1) + ' kHz'; });
  // the cockpit buttons queue edges so human and AI share one code path
  IN.bind('ctx', () => IN.edge.push('ctx')); IN.bind('alt', () => IN.edge.push('alt'));
  IN.bind('match', () => IN.edge.push('match')); IN.bind('brake'); IN.bind('targ', () => IN.edge.push('target'));
  IN.bind('gear', () => IN.edge.push('gear')); IN.bind('scanB', () => IN.edge.push('scan')); IN.bind('mineB'); IN.bind('fireB');
  addEventListener('resize', () => { resize(); cam.tz = cl(cam.tz, 0.35, 3.4); });
  addEventListener('orientationchange', () => setTimeout(() => { resize(); if (G.mode === 'title') titleCam(); else cam.tz = defZoom(); }, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(); if (G && G.mode === 'play') { mode('pause'); G.autoPaused = true; } }
    else if (G && G.autoPaused && G.mode === 'pause' && AP.on) { G.autoPaused = false; mode('play'); }
  });
  addEventListener('beforeunload', save);
}

/** global key edges that work in any mode */
export function globalEdges() {
  for (let i = IN.edge.length - 1; i >= 0; i--) {
    const e = IN.edge[i];
    if (e === 'pause') { IN.edge.splice(i, 1); if (G.mode === 'play') mode('pause'); else if (G.mode === 'pause') mode('play'); }
    else if (e === 'help') { IN.edge.splice(i, 1); $('helpO').classList.toggle('on'); }
    else if (e === 'ai') { IN.edge.splice(i, 1); toggleAI(); }
  }
}
export { NAV };
