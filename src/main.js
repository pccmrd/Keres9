// ═══ KERES-9 // CATALOG ZERO — entry: hooks, main loop, boot ═══════════
import { $, lp, hy, fm } from './core/util.js';
import { C, GD } from './core/config.js';
import { W, G, pl, ev, cam, PC, CTL, setG, focus } from './core/state.js';
import { hooks } from './hooks.js';
import { stepBodies } from './world/body.js';
import { stepMeteors } from './combat.js';
import { stepShips, stepPicks, stepDeb } from './physics.js';
import { stepBits } from './fx.js';
import { stepEVA, evaRoom } from './eva.js';
import { stepLift } from './lift.js';
import { crewTick, crewBoard } from './crew.js';
import { control, updCam } from './player.js';
import { econTick, feed, bountyFor } from './economy.js';
import { agents } from './agents.js';
import { story, check, mkJobs, jobSold, jobCatalog } from './missions.js';
import { eventsTick } from './events.js';
import { IN, initInput, readHuman } from './input.js';
import { AU, initAudio } from './audio.js';
import { toast, closeStation, frozen, mode, hudDOM, openStation, showWin } from './ui.js';
import { resize, render, chart, spectrum, scopeDraw } from './render/render.js';
import { bindUI, syncSound, readSave, playerDied, startDemo, toggleAI, globalEdges, titleCam, newRun, save } from './game.js';
import { genWorld, SITES, ensureShards } from './world/gen.js';
import { liftInit } from './lift.js';
import { crewInit } from './crew.js';
import { initAgents } from './agents.js';
import { eventsInit } from './events.js';
import { newGame } from './missions.js';
import { AP, apThink, apMeta, apForce } from './ai/pilot.js';
import { inp } from './ai/nav.js';

// ─── late-bound hooks ────────────────────────────────────────────────────
hooks.toast = (m, k) => toast(m, k);
hooks.closeStation = () => closeStation();
hooks.openStation = (b, t) => openStation(b, t);
hooks.onDock = (b, ty) => {
  W.stats.docked++;
  if (b.surf && ty === 'pad') { W.stats.landings++; toast('TOUCHDOWN · ' + b.name + ' — ' + (b.tabs.includes('market') ? 'F for services' : 'welcome home'), 'good'); }
  else toast((ty === 'pad' ? 'ON PAD · ' : 'CLAMPED · ') + b.name + ' — F for services', 'good');
  feed('You ' + (ty === 'pad' ? 'set down on ' : 'clamped at ') + b.name + '.');
};
hooks.onTouch = s => { W.stats.landings++; toast('LANDED ON REGOLITH · ' + Math.round(hy(s.x, s.y) - C.RM) + ' m datum — F to step out', 'good'); };
hooks.onCatalog = (b, src) => {
  if (b.cat) return;
  b.cat = 1; b.catT = W.time; b.survey = 1;
  const v = Math.round(bountyFor(b) * (b.fresh ? 1.5 : 1)); G.bounty += v; W.stats.catalogued++;
  const top = Object.entries(b.comp).filter(e => e[0] !== 'rock').sort((a, q) => q[1] - a[1]).slice(0, 2).map(e => GD[e[0]] ? GD[e[0]].n : e[0]).join(' + ');
  toast('CATALOGUED · ' + b.name + ' · ' + b.typeN + (top ? ' · ' + top : '') + ' · bounty ' + v + '₡ pending', 'good');
  feed((src === 'suit' ? 'Your hand scanner' : 'Your array') + ' catalogued ' + b.name + ' (' + b.typeN + ').', 'good');
  AU.chime(); story('catalog'); jobCatalog(b); check();
};
hooks.delivered = (st, g, k) => { story('sold', { st, g, k }); jobSold(st, g, k); check(); };
hooks.resolved = c => { story('resolved', c); check(); };
hooks.shiftDone = n => { story('shift', { n }); check(); };
hooks.bought = () => check();
hooks.liftArrive = top => { story('lift', { top }); toast(top ? 'SELENE HIGH · lift dock. Crew office: upper left. Exchange, catalog, bar, shipyard along the top deck.' : 'SHACKLETON RIM · ground terminal. HAB 14 west, Depot east.', 'good'); };
hooks.boardCrew = () => crewBoard();
hooks.shipLost = s => {
  G.fleet = G.fleet.filter(q => q !== s);
  feed('Your ' + s.name + ' was destroyed.', 'bad'); toast(s.name + ' LOST', 'bad');
  if (s === pl) playerDied('Your ' + s.name + ' broke up.');
};
hooks.suitOut = () => playerDied(W.flare && W.flare.on ? 'Proton storm. Your suit dosimeter maxed out.' : 'Suit air ran dry.');
hooks.win = () => setTimeout(showWin, 1800);
hooks.armor = () => (AP.on && AP.demo ? 0.5 : 1);

// ─── simulation tick (coarse, per-frame) ─────────────────────────────────
let wasSurf = false;
function simTick(dt) {
  econTick(dt); agents(dt); crewTick(dt); eventsTick(dt);
  G._j = (G._j || 0) + dt;
  if (G._j > 180) { G._j = 0; for (const st of W.stations) if (st.econ) mkJobs(st); }
  if (G.mode !== 'play') return;
  G._sh = (G._sh || 0) + dt;
  if (G._sh > 30) { G._sh = 0; const nb = ensureShards(); if (nb) feed('Catalog Office: the array net caught another cold memory lattice — sealed inside ' + nb.name + '.', 'good'); }
  if (pl && pl.dead) playerDied('Your ' + pl.name + ' broke up.');
  // story sensors
  if (ev && !ev.hide && ((G._rm = (G._rm || 0) + dt) > 0.4)) { G._rm = 0; const r = evaRoom(); if (r && r.rm) story('room', { kind: r.rm.kind, b: r.b }); }
  // launches & orbit arrival for the lander
  const onSurf = !!(pl && pl.dock && (pl.dock.ty === 'ground' || (pl.dock.b && pl.dock.b.surf)));
  if (pl && wasSurf && !onSurf && !pl.dock) { W.stats.launches++; feed('You launched ' + pl.name + ' from the surface.'); }
  wasSurf = onSurf;
  if (pl && pl.cls === 'hare' && pl.dock && (pl.dock.ty === 'anchor' || (pl.dock.b && !pl.dock.b.surf))) story('orbitdock');
}

const HUM = { lx: 0, ly: 0, rx: 0, ry: 0, thr: 0, fire: false, mine: false, brake: false, ai: false };
let last = 0, acc = 0, frame = 0, grab = 0, booted = false;

function loop(ts) {
  requestAnimationFrame(loop);
  if (!last) last = ts;
  let dt = (ts - last) / 1000; last = ts;
  if (!(dt > 0)) dt = 0.016; dt = Math.min(0.05, dt);
  tick(dt);
  render(dt); frame++;
  if (frame % 6 === 0) chart($('mini'), false);
  if (PC.scan && !ev) spectrum();
  if (PC.assist && !PC.scan && !ev) scopeDraw();
  if ($('mapO').classList.contains('on') && frame % 20 === 0) chart($('chart'), true);
  if (frame % 4 === 0) hudDOM();
}

function tick(dt) {
  globalEdges();
  const run = (G.mode === 'play' && !frozen()) || G.mode === 'title';
  if (AP.on && G.mode === 'play') apThink(dt, run);
  apMeta(dt);
  if (run) {
    const warp = G.mode === 'play' && AP.on ? AP.warp : 1;
    for (let w = 0; w < warp; w++) {
      W.time += dt;
      if (G.mode === 'play') {
        readHuman(HUM, dt);
        if (AP.on) {
          const touched = hy(HUM.lx, HUM.ly) > 0.35 || Math.abs(HUM.rx) > 0.35 || HUM.mine || HUM.brake;
          grab = touched ? grab + dt : 0;
          if (grab > 0.3) { grab = 0; toggleAI(); Object.assign(CTL, HUM); }
          else Object.assign(CTL, inp);
          CTL.ai = AP.on;
        } else Object.assign(CTL, HUM);
        control(dt);
      }
      acc += dt;
      let n = 0;
      while (acc >= C.DT && n < 4) {
        stepBodies(C.DT); stepLift(C.DT); stepShips(C.DT); stepMeteors(C.DT);
        if (ev) stepEVA(C.DT);
        stepPicks(C.DT); stepDeb(C.DT); stepBits(C.DT);
        acc -= C.DT; n++;
      }
      if (acc > C.DT * 4) acc = 0;
      simTick(dt);
      if (G.mode !== 'play') break;
    }
    if (G.mode === 'title') {
      // slow drift up the cable from the Rim to SELENE HIGH
      const L = W.lift.E, t = (Math.sin(W.time * 0.03) + 1) / 2, k = 1 - Math.exp(-1.1 * dt);
      cam.x = lp(cam.x, L.g.x + (L.t.x - L.g.x) * t + 160, k); cam.y = lp(cam.y, L.g.y + (L.t.y - L.g.y) * t, k);
      cam.rot = Math.atan2(cam.y, cam.x) + Math.PI / 2;
      cam.z = lp(cam.z, cam.tz, 1 - Math.exp(-2 * dt));
    } else updCam(dt);
  } else { AU.engine(0); updCam(dt * 0.25); }
  IN.edge.length = 0; IN.taps.length = 0;
  if (G.mode === 'play') { G.save += dt; if (G.save > 20) { G.save = 0; save(); } }
}

function boot() {
  if (booted) return; booted = true;
  setG(newGame()); resize(); initInput(); initAudio(); bindUI(); syncSound();
  try {
    const s = readSave();
    genWorld(s ? s.seed : (Math.random() * 1e9) | 0); liftInit(); crewInit(); initAgents(); eventsInit();
    for (const st of W.stations) mkJobs(st);
    if (s) {
      $('cont').style.display = ''; $('go').textContent = 'NEW CAREER';
      $('note').textContent = 'SAVED CAREER · day ' + (Math.floor((s.time || 0) / 1200) + 1) + ' · ' + fm(s.g.cr) + '₡ · tier ' + s.g.tier;
    } else $('note').textContent = 'No saved career. The band is full of rocks nobody has named.';
    const L = W.lift.E; cam.x = L.g.x + 160; cam.y = L.g.y; titleCam(); cam.z = cam.tz;
    mode('title'); hudDOM(); chart($('mini'), false);
    if (/[?&]demo\b/.test(location.search)) startDemo();
    else if (/[?&]play\b/.test(location.search)) newRun();
    requestAnimationFrame(loop);
  } catch (e) {
    console.error(e); $('note').textContent = 'BOOT ERROR: ' + e.message; $('note').style.color = '#ff4a3d';
  }
}
window.KERES = { get W() { return W; }, get G() { return G; }, get pl() { return pl; }, get ev() { return ev; }, AP, PC, cam, SITES, IN, force: apForce, focus,
  fast(sec, cb, every = 1) { let n = 0; for (let t = 0; t < sec; t += 1 / 60) { tick(1 / 60); if (cb && (n++ % Math.round(every * 60)) === 0) cb(t); } } };
boot();
