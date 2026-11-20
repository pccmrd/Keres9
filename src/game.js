// ═══ session: new run / demo / load / save / death / tow / UI bindings ══
import { $, cl, hy, fm } from './core/util.js';
import { C, GD } from './core/config.js';
import { W, G, pl, ev, AG, cam, PC, setG, setPl, setEv, setAG } from './core/state.js';
import { cut, cw } from './world/body.js';
import { genWorld, spawnRock, replaceTransfer, SITES } from './world/gen.js';
import { mkOwned, stats, dock, anchor, undock, settle, cmass, sprite } from './ships.js';
import { mkSuit, airlockSpot, sackN, enterEVA } from './eva.js';
import { liftInit } from './lift.js';
import { crewInit, boardShift } from './crew.js';
import { initAgents } from './agents.js';
import { eventsInit } from './events.js';
import { newGame, mkJobs, accept, drop, story, storyObj } from './missions.js';
import { price, trade, feed, buyShip, collectBounty, hold } from './economy.js';
import { defZoom, setNav } from './player.js';
import { IN } from './input.js';
import { AU } from './audio.js';
import { toast, mode, openStation, closeStation, closeDialog, confirmBox, panel, hudDOM, statGrid, setSaver } from './ui.js';
import { V, resize, chart } from './render/render.js';
import { AP, apSet, apAbort } from './ai/pilot.js';

const KEY = 'keres9_moon2035_v1';

// ─── world assembly ──────────────────────────────────────────────────────
function build(seed) {
  genWorld(seed); setAG([]); setEv(null); setPl(null); AU.air(false); AU.mine(false);
  liftInit();
  PC.tgt = null; PC.scan = false; PC.match = false; PC.assist = null; PC.hints.clear(); PC.lock = 0; PC.sas = 0;
  PC.ctx = { l: '—', f: null, ok: false }; PC.alt = null;
  $('scan').classList.remove('on'); $('scanB').classList.remove('act'); $('match').classList.remove('act'); $('gear').classList.remove('act');
  $('toasts').innerHTML = ''; closeStation(); closeDialog(); IN.thr = 0; IN.thrUI(0); IN.edge.length = 0; IN.taps.length = 0; resize();
  cam.aux = null;
}
/** the player wakes up in HAB 14 */
function wakeAtHome() {
  const h = SITES.hab, p = airlockSpot(h, h.x, h.y);
  setEv(mkSuit(p.x, p.y)); ev.a = Math.atan2(h.y, h.x) + Math.PI / 2;
  cam.x = ev.x; cam.y = ev.y; cam.rot = Math.atan2(ev.y, ev.x) + Math.PI / 2; cam.snap = true;
}
function freshWorld(seed) {
  build(seed);
  const s = G ? G.sound : true;
  setG(newGame()); G.sound = s; syncSound();
  crewInit(); initAgents(); eventsInit();
  for (const st of W.stations) mkJobs(st);
  wakeAtHome();
}

// ─── persistence ─────────────────────────────────────────────────────────
const bkey = b => (b.kind === 'rock' ? 'r' + b.uid : 's' + b.name);
function shipSave(s) {
  const d = s.dock;
  return { cls: s.cls, x: s.x, y: s.y, a: s.a, vx: s.vx, vy: s.vy, fuel: s.fuel, cargo: s.cargo, upg: s.upg, gear: s.gear, isPl: s.isPl, mods: s.mods.map(m => [m.hp, m.dead ? 1 : 0]),
    d: d ? { ty: d.ty, b: d.b ? bkey(d.b) : null, cx: d.cx, cy: d.cy, x: d.x, y: d.y, a: d.a, pi: d.p ? (d.ty === 'pad' ? d.b.pads.indexOf(d.p) : d.b.ports.indexOf(d.p)) : -1 } : null };
}
export function save() {
  if (!W || !G || AP.demo || G.mode === 'title' || G.mode === 'dead') return;
  try {
    const terr = {}; let n = 0;
    for (const b of W.bodies) {
      if (!b.cut.length || b.kind === 'station') continue;
      const u = [...new Set(b.cut)], room = 12000 - n; if (room <= 0) break;
      const a = u.slice(0, room); n += a.length; terr[bkey(b)] = a;
    }
    const where = G.ride || (ev && ev.hide) ? null : ev ? { x: ev.x, y: ev.y, suit: ev.suit, sack: ev.sack } : null;
    localStorage.setItem(KEY, JSON.stringify({
      v: 1, seed: W.seed, time: W.time, sound: G.sound, nav: W.nav, terr, extra: W.extra,
      g: { cr: G.cr, tier: G.tier, story: G.story, prog: G.prog, jobs: G.jobs, missions: G.missions, bounty: G.bounty, win: G.win, jseed: G.jseed, airUp: G.airUp, sackUp: G.sackUp, suitUp: G.suitUp, cores: G.cores, shifts: G.crew ? G.crew.shifts : 0 },
      stats: W.stats, ev: where, fleet: G.fleet.filter(s => !s.dead).map(shipSave),
      econ: W.stations.filter(s => s.econ).map(s => ({ n: s.name, e: Object.fromEntries(Object.entries(s.econ).map(([g, q]) => [g, q.stock])) })),
      cat: W.rocks.filter(b => b.cat).map(b => b.uid),
      ct: W.contacts.map((c, i) => (c.done ? i : -1)).filter(i => i >= 0),
      tr: ['ares', 'gaia'].map(k => ({ k, gen: SITES[k].transfer.gen, dep: SITES[k].transfer.depart - W.time })),
      feed: W.feed.slice(0, 20),
    }));
  } catch (e) { /* storage full / private mode */ }
}
export function readSave() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

export function load() {
  const d = readSave(); if (!d) { newRun(); return; }
  try {
    apSet(false, false);
    build(d.seed); setG(newGame()); G.sound = d.sound !== false; syncSound();
    crewInit(); initAgents(); eventsInit();
    const g = d.g; Object.assign(G, { cr: g.cr, tier: g.tier, story: g.story, prog: g.prog || {}, jobs: g.jobs || {}, missions: g.missions || [], bounty: g.bounty || 0, win: g.win, jseed: g.jseed || 1, airUp: g.airUp || 1, sackUp: g.sackUp || 1, suitUp: g.suitUp || 1, cores: g.cores || 0 });
    G.crew.shifts = g.shifts || 0;
    W.stats = { ...W.stats, ...(d.stats || {}) }; W.time = d.time || 0; W.nav = d.nav || null; W.feed = d.feed || [];
    W.extra = [];
    for (const x of d.extra || []) { const b = spawnRock(x.seed, x.x, x.y, x.R, x.type); b.fresh = false; }
    for (const t of d.tr || []) {
      let st = SITES[t.k];
      if (t.gen > 1) {
        const nb = replaceTransfer(st, t.gen); W.bodies = W.bodies.map(b => (b === st ? nb : b)); W.stations = W.stations.map(b => (b === st ? nb : b)); SITES[t.k] = nb; st = nb;
      }
      st.transfer.depart = W.time + Math.max(60, t.dep);
    }
    const byKey = k => W.bodies.find(b => bkey(b) === k);
    for (const k in d.terr) { const b = byKey(k); if (!b) continue; for (const i of d.terr[k]) if (b.sol[i]) cut(b, i % b.gw, (i / b.gw) | 0, 1e6, true); }
    for (const es of d.econ || []) { const st = W.stations.find(s => s.name === es.n); if (!st) continue; for (const q in es.e) if (st.econ[q]) st.econ[q].stock = es.e[q]; }
    for (const uid of d.cat || []) { const b = W.rocks.find(r => r.uid === uid); if (b) { b.cat = 1; b.catT = 0; } }
    for (const i of d.ct || []) {
      const c = W.contacts[i]; if (!c) continue; c.done = true;
      if (c.kind === 'vein') c.b.veinOn = true;
      else if (c.b.cham) for (const ch of c.b.cham) { const w = cw(c.b, ch.cx, ch.cy); if (hy(w.x - c.x, w.y - c.y) < c.b.cs * 3) ch.disc = true; }
    }
    if (G.story >= 9 && W.orphan) W.orphan.hidden = false;
    let flying = null;
    for (const fs of d.fleet || []) {
      const s = mkOwned(fs.cls, fs.x, fs.y);
      Object.assign(s, { a: fs.a, vx: fs.vx, vy: fs.vy, fuel: fs.fuel, cargo: fs.cargo || {}, upg: fs.upg || s.upg, gear: !!fs.gear });
      (fs.mods || []).forEach((m, i) => { if (s.mods[i]) { s.mods[i].hp = m[0]; s.mods[i].dead = !!m[1]; } });
      const f = s.fuel; stats(s); s.fuel = Math.min(f, s.fuelMax); sprite(s);
      if (fs.d) {
        if (fs.d.ty === 'ground') { s.x = fs.d.x; s.y = fs.d.y; s.a = fs.d.a; settle(s); }
        else { const b = byKey(fs.d.b); if (b) { if (fs.d.ty === 'anchor') anchor(s, b, fs.d.cx, fs.d.cy); else { const arr = fs.d.ty === 'pad' ? b.pads : b.ports, p = arr && arr[fs.d.pi]; if (p && !p.occ) dock(s, b, p, fs.d.ty, true); } } }
      }
      G.fleet.push(s);
      if (fs.isPl) flying = s;
    }
    if (flying) { flying.isPl = true; setPl(flying); cam.x = flying.x; cam.y = flying.y; }
    else if (d.ev) { setEv(mkSuit(d.ev.x, d.ev.y)); ev.suit = d.ev.suit || 100; ev.sack = d.ev.sack || {}; cam.x = ev.x; cam.y = ev.y; }
    else wakeAtHome();
    cam.rot = Math.atan2(cam.y, cam.x) + Math.PI / 2; cam.snap = true;
    for (const st of W.stations) if (!G.jobs[st.name]) mkJobs(st);
    mode('play'); cam.tz = defZoom();
    toast('WELCOME BACK · day ' + (Math.floor(W.time / 1200) + 1) + ' in the band', 'good');
  } catch (e) { console.error(e); toast('Save unreadable — fresh start', 'bad'); newRun(); }
}

// ─── runs ────────────────────────────────────────────────────────────────
export function newRun() {
  try { localStorage.removeItem(KEY); } catch (e) { /* */ }
  apSet(false, false);
  freshWorld((Math.random() * 1e9) | 0);
  startPlay();
}
export function startDemo() {
  freshWorld((Math.random() * 1e9) | 0);
  AP.demo = true;
  startPlay(true);
  apSet(true, true);
  toast('AI DEMO · the computer plays the whole career, start to finish · press P or tap AI to take over — demo runs are never saved', 'warn');
}
export function startPlay(quiet) {
  mode('play'); cam.tz = defZoom(); cam.user = 0;
  if (quiet) return;
  toast('2035 · SHACKLETON RIM. You are a prospector with a suit, a bunk and 240₡.', 'warn');
  setTimeout(() => toast('A/D walk · W hop · F use · walk east to the SELENE LIFT (follow the LIFT arrow)'), 2200);
  setTimeout(() => toast('Press P any time to let the AI play.'), 5200);
  save();
}

// ─── death / recovery ────────────────────────────────────────────────────
export function playerDied(why) {
  if (G.mode === 'dead' || G.mode === 'title') return;
  feed((why || 'A prospector') + ' — Rim medics brought you home.', 'bad');
  if (AP.demo) { respawn(); return; }
  $('dWhy').textContent = why || 'Signal lost.';
  statGrid($('dStats')); mode('dead');
}
export function respawn() {
  if (pl) { pl.isPl = false; setPl(null); }
  if (ev) setEv(null);
  AU.air(false);
  G.cr = Math.floor(G.cr * 0.85); G.ride = null;
  if (G.crew && G.crew.state !== 'idle') { G.crew.late = true; }
  wakeAtHome();
  PC.scan = false; PC.match = false; PC.assist = null; $('scan').classList.remove('on');
  apAbort(AP.on ? 'Woke up in the HAB 14 medbay — starting the day over.' : null);
  mode('play'); toast('MEDBAY, HAB 14 · −15% credits. Your ships are where you left them.', 'warn');
  save();
}
export function tow() {
  const f = 300;
  if (pl && !pl.dead) {
    const s = pl, home = s.cls === 'hare' ? SITES.depot : SITES.sel;
    const paid = Math.min(G.cr, f); // the guild never leaves anyone out there — it takes what you have
    G.cr -= paid; if (s.dock) undock(s);
    const P = s.cls === 'hare' ? { p: home.pads.find(q => !q.occ), ty: 'pad' } : { p: home.ports.find(q => q.berth && !q.occ) || home.ports.find(q => !q.occ), ty: 'port' };
    if (P.p) dock(s, home, P.p, P.ty, true);
    s.fuel = Math.max(s.fuel, s.fuelMax * 0.4);
    for (const m of s.mods) if ((m.t === 'rcs' || m.t === 'eng') && m.dead) { m.dead = false; m.hp = m.max * 0.4; }
    stats(s); s.dirty = true; cam.snap = true;
    mode('play'); toast('TOW · −' + paid + '₡' + (paid < f ? ' (all you had)' : '') + ' · ' + s.name + ' brought to ' + home.name, 'warn');
  } else if (ev && !ev.hide) {
    const st = hy(ev.x, ev.y) > C.RM + 600 ? SITES.sel : SITES.hab, p = airlockSpot(st, ev.x, ev.y);
    G.cr = Math.max(0, G.cr - 120); ev.x = p.x; ev.y = p.y; ev.vx = ev.vy = 0; ev.suit = 100; cam.snap = true;
    mode('play'); toast('RESCUE · −120₡ · brought inside ' + st.name, 'warn');
  } else mode('play');
}

// ─── settings / bindings ─────────────────────────────────────────────────
export function syncSound() {
  const on = G.sound; AU.setOn(on); $('snd').textContent = on ? '🔊' : '🔇';
  $('sndT').textContent = 'SOUND: ' + (on ? 'ON' : 'OFF'); $('snd2').textContent = 'SOUND: ' + (on ? 'ON' : 'OFF');
}
export function toggleAI() {
  if (!G || G.mode === 'title') return;
  apSet(!AP.on);
  toast(AP.on ? 'AI PLAYER ENGAGED — sit back' : 'MANUAL CONTROL — yours' + (AP.demo ? ' · demo run, not saved' : ''), AP.on ? 'good' : 'warn');
}
export function titleCam() { cam.tz = cl(V.w / 1400, 0.3, 0.8); cam.user = 999; }

function qtyFor(st, g, buy) {
  let q = G.qty; const h = hold(); if (!h) return 0;
  if (q === 'MAX') q = buy ? Math.min(Math.floor(G.cr / Math.max(1, price(st, g))), h.max - h.used, st.econ[g].stock | 0) : h.c[g] || 0;
  return Math.max(1, Math.floor(q));
}
export function panelAct(a, data) {
  const st = G.panel; if (!st) return;
  if (a === 'qty') { G.qty = data.q === 'MAX' ? 'MAX' : +data.q; }
  else if (a === 'buy' || a === 'sell') { trade(st, data.g, qtyFor(st, data.g, a === 'buy'), a === 'buy'); }
  else if (a === 'svc') { const s = G.svc[+data.i]; if (s && s.ok) s.f(); }
  else if (a === 'accept') accept(st, data.id);
  else if (a === 'drop') drop(data.id);
  else if (a === 'shift') { if (boardShift()) story('board'); return; }
  else if (a === 'buyship') buyShip(st, data.c);
  else if (a === 'bounty') collectBounty();
  else if (a === 'cores') {
    const h = hold(), n = h ? h.c.core || 0 : 0;
    if (n) { delete h.c.core; if (h.ship) stats(h.ship); G.cores += n; G.cr += n * 400; W.stats.earned += n * 400; AU.cash(); toast('CATALOG OFFICE takes ' + n + ' core shard' + (n > 1 ? 's' : '') + ' · +' + fm(n * 400) + '₡ · the techs start reading the logs', 'good'); story('tick'); }
  }
  else if (a === 'file') story('filed');
  else if (a === 'eva') { closeStation(); enterEVA(); return; }
  else if (a === 'sleep') { if (ev) ev.suit = 100; save(); toast('Slept. Saved. The cable hums outside.', 'good'); }
  panel(); hudDOM();
}
export function bindUI() {
  setSaver(save);
  const sndT = () => { G.sound = !G.sound; AU.init(); syncSound(); save(); };
  $('snd').onclick = sndT; $('sndT').onclick = sndT; $('snd2').onclick = sndT;
  $('pauseB').onclick = () => { if (G.mode === 'play') mode('pause'); else if (G.mode === 'pause') mode('play'); };
  $('res').onclick = () => mode('play'); $('resX').onclick = () => mode('play');
  $('aiB').onclick = toggleAI;
  $('aiP').onclick = () => { toggleAI(); mode('play'); };
  $('man').onclick = () => { $('helpO').classList.add('on'); AU.ui(); }; $('man2').onclick = () => { $('helpO').classList.add('on'); AU.ui(); };
  $('helpX').onclick = () => { $('helpO').classList.remove('on'); AU.ui(); };
  $('tow').onclick = tow;
  $('newSec').onclick = () => confirmBox('Start over? Your credits, ships and every cut you made in the band will be gone.', newRun);
  $('exit').onclick = () => {
    save(); const wasDemo = AP.demo; apSet(false, false); AP.demo = false; mode('title');
    const s = readSave();
    $('cont').style.display = s ? '' : 'none';
    $('note').textContent = s ? 'SAVED · day ' + (Math.floor(s.time / 1200) + 1) + ' · ' + fm(s.g.cr) + '₡' : wasDemo ? 'Demo ended. The band is waiting.' : '';
    titleCam();
  };
  $('go').onclick = () => { AU.init(); newRun(); };
  $('cont').onclick = () => { AU.init(); load(); };
  $('demo').onclick = () => { AU.init(); startDemo(); };
  $('respawn').onclick = respawn;
  $('keep').onclick = () => { mode('play'); toast('The band keeps turning. Fly it as long as you like.', 'good'); };
  $('sX').onclick = closeStation;
  $('undock').onclick = () => { const st = G.panel; if (pl && pl.dock && st && pl.dock.b === st) undock(pl); closeStation(); };
  $('sTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; G.tab = b.dataset.t; panel(); AU.ui(); });
  $('pBody').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; AU.ui(); panelAct(b.dataset.a, b.dataset); });
  $('miniWrap').onclick = () => { $('mapO').classList.add('on'); chart($('chart'), true); AU.ui(); };
  $('mapX').onclick = () => { $('mapO').classList.remove('on'); AU.ui(); };
  $('chart').addEventListener('pointerdown', e => {
    const cv = $('chart'), r = cv.getBoundingClientRect(), m = cv._map; if (!m) return;
    const px = ((e.clientX - r.left) / r.width) * cv.width - cv.width / 2, py = ((e.clientY - r.top) / r.height) * cv.height - cv.height / 2;
    setNav(m.cx0 + px / m.sc, m.cy0 + py / m.sc, 'CHART WAYPOINT'); chart(cv, true);
  });
  $('scanX').onclick = () => { PC.scan = false; $('scan').classList.remove('on'); $('scanB').classList.remove('act'); };
  $('freq').addEventListener('input', e => { PC.freq = parseFloat(e.target.value); $('fVal').textContent = PC.freq.toFixed(1) + ' kHz'; });
  IN.bind('ctx', () => IN.edge.push('ctx')); IN.bind('alt', () => IN.edge.push('alt'));
  IN.bind('match', () => IN.edge.push('match')); IN.bind('brake'); IN.bind('targ', () => IN.edge.push('target'));
  IN.bind('gear', () => IN.edge.push('gear')); IN.bind('scanB', () => IN.edge.push('scan')); IN.bind('mineB');
  addEventListener('resize', () => { resize(); });
  addEventListener('orientationchange', () => setTimeout(() => { resize(); if (G.mode === 'title') titleCam(); }, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(); if (G && G.mode === 'play' && !AP.on) { mode('pause'); G.autoPaused = true; } }
    else if (G && G.autoPaused && G.mode === 'pause') { G.autoPaused = false; }
  });
  addEventListener('beforeunload', save);
}
export function globalEdges() {
  for (let i = IN.edge.length - 1; i >= 0; i--) {
    const e = IN.edge[i];
    if (e === 'pause') { IN.edge.splice(i, 1); if ($('stationO').classList.contains('on')) closeStation(); else if (G.mode === 'play') mode('pause'); else if (G.mode === 'pause') mode('play'); }
    else if (e === 'help') { IN.edge.splice(i, 1); $('helpO').classList.toggle('on'); }
    else if (e === 'ai') { IN.edge.splice(i, 1); toggleAI(); }
  }
}
export { openStation, storyObj, sackN, cmass, GD, setG, AG };
