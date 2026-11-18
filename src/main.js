// ═══ KERES-9 // TYPHON SHADOW — entry: hooks, main loop, boot ══════════
import { $, cl, lp, hy } from './core/util.js';
import { C } from './core/config.js';
import { W, G, pl, ev, cam, PC, CTL, setG } from './core/state.js';
import { hooks } from './hooks.js';
import { stepBodies } from './world/body.js';
import { stepBullets, stepMeteors } from './combat.js';
import { stepShips, stepPicks, stepDeb } from './physics.js';
import { stepBits } from './fx.js';
import { stepEVA } from './eva.js';
import { control, updCam } from './player.js';
import { econTick, feed } from './economy.js';
import { agents, crewTick, onKill, rescue } from './agents.js';
import { newGame, story, checkJobs, mkJobs } from './missions.js';
import { eventsTick } from './events.js';
import { IN, initInput, readHuman } from './input.js';
import { AU, initAudio } from './audio.js';
import { toast, closeStation, frozen, mode, hudDOM } from './ui.js';
import { V, resize, render, chart, spectrum, scopeDraw } from './render/render.js';
import { bindUI, syncSound, readSave, playerDied, save, startDemo, toggleAI, globalEdges, titleCam, rebuild } from './game.js';
import { genWorld } from './world/gen.js';
import { mkPlayer, dock } from './ships.js';
import { initAgents } from './agents.js';
import { setPl } from './core/state.js';
import { AP, apThink, apMeta, apForce } from './ai/pilot.js';
import { inp } from './ai/nav.js';
import { fm } from './core/util.js';

// ─── late-bound hooks ────────────────────────────────────────────────────
hooks.toast = (m, k) => toast(m, k);
hooks.closeStation = () => closeStation();
hooks.onDock = (b, ty) => {
  W.stats.docked++;
  story('dock', { st: b }); checkJobs(b);
  toast((ty === 'pad' ? 'LANDED · ' : 'CLAMPED · ') + b.name + ' — SERVICES available', 'good');
  feed('KITE ' + (ty === 'pad' ? 'set down on ' : 'clamped at ') + b.name);
};
hooks.onKill = (v, k) => onKill(v, k);
hooks.playerDied = () => playerDied();
hooks.rescue = p => rescue(p);
hooks.armor = () => (AP.on && AP.demo ? 0.55 : 1); // the showcase pilot gets a little plot armour

// ─── simulation tick (coarse, per-frame) ─────────────────────────────────
function simTick(dt) {
  econTick(dt); agents(dt); crewTick(dt); eventsTick(dt);
  G._j += dt;
  if (G._j > 150) { G._j = 0; for (const st of W.stations) if (!st.dead) mkJobs(st); }
  if (G.mode === 'play') { G.clock += dt; if (G.clock > 600) { G.clock -= 600; G.shift++; } }
  if (pl && pl.dead && G.mode === 'play') playerDied();
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

/** one frame of everything except drawing */
function tick(dt) {
  globalEdges();
  const run = (G.mode === 'play' && !frozen()) || G.mode === 'title';
  // the AI brain ticks even while an overlay freezes the sim, so it can read dialogs
  if (AP.on && G.mode === 'play') apThink(dt, run);
  apMeta(dt);
  if (run) {
    const warp = G.mode === 'play' && AP.on ? AP.warp : 1;
    for (let w = 0; w < warp; w++) {
      W.time += dt;
      if (G.mode === 'play') {
        readHuman(HUM, dt);
        if (AP.on) {
          // grabbing the stick hands control back to the human
          const touched = hy(HUM.lx, HUM.ly) > 0.35 || Math.abs(HUM.rx) > 0.35 || HUM.fire || HUM.mine || HUM.brake;
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
        stepBodies(C.DT); stepShips(C.DT); stepBullets(C.DT); stepMeteors(C.DT);
        if (ev) stepEVA(C.DT);
        stepPicks(C.DT); stepDeb(C.DT); stepBits(C.DT);
        acc -= C.DT; n++;
      }
      if (acc > C.DT * 4) acc = 0;
      simTick(dt);
      if (G.mode !== 'play') break;
    }
    if (G.mode === 'title') {
      const A = W.stations[0], t = W.time * 0.055, k = 1 - Math.exp(-1.1 * dt);
      cam.x = lp(cam.x, A.x + Math.cos(t) * 400, k); cam.y = lp(cam.y, A.y + Math.sin(t * 0.8) * 260, k);
      cam.z = lp(cam.z, cam.tz, 1 - Math.exp(-2 * dt));
    } else updCam(dt);
  } else { AU.engine(0); updCam(dt * 0.25); }
  IN.edge.length = 0; IN.taps.length = 0;
  if (G.mode !== 'title') { G.save += dt; if (G.save > 20) { G.save = 0; save(); } }
}

function boot() {
  if (booted) return; booted = true;
  setG(newGame()); resize(); initInput(); initAudio(); bindUI(); syncSound();
  try {
    const s = readSave();
    genWorld(s ? s.seed : (Math.random() * 1e9) | 0);
    const A = W.stations[0];
    setPl(mkPlayer(A.x - 460, A.y + 14));
    const p = A.ports.find(q => !q.berth && !q.occ); if (p) dock(pl, A, p, 'port', true);
    initAgents();
    for (const st of W.stations) mkJobs(st);
    if (s) {
      $('cont').style.display = ''; $('go').textContent = 'IGNITE · NEW SECTOR';
      $('note').textContent = 'SAVED SHIFT FOUND · seed ' + s.seed + ' · shift ' + (s.g.shift || 1) + ' · ' + fm(s.pl.credits) + '₡ · debt ' + fm(s.g.debt) + '₡';
    } else $('note').textContent = 'No saved shift. The belt is freshly cut.';
    cam.x = A.x; cam.y = A.y; titleCam(); cam.z = cam.tz;
    mode('title'); hudDOM(); chart($('mini'), false);
    if (/[?&]demo\b/.test(location.search)) startDemo();
    requestAnimationFrame(loop);
  } catch (e) {
    console.error(e); $('note').textContent = 'BOOT ERROR: ' + e.message; $('note').style.color = '#ff4a3d';
  }
}
// debug / test surface: KERES.fast(sec, cb) simulates without rendering
window.KERES = { get W() { return W; }, get G() { return G; }, get pl() { return pl; }, get ev() { return ev; }, AP, PC, cam, force: apForce,
  fast(sec, cb, every = 1) { let n = 0; for (let t = 0; t < sec; t += 1 / 60) { tick(1 / 60); if (cb && (n++ % Math.round(every * 60)) === 0) cb(t); } } };
boot();
