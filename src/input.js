// ═══ touch / mouse / keyboard input ═════════════════════════════════════
import { $, cl, hy } from './core/util.js';
import { cam } from './core/state.js';

export const IN = {
  lx: 0, ly: 0, rx: 0, ry: 0, thr: 0, hold: {}, keys: {}, edge: [], taps: [], stickUI: { L: null, R: null },
  /** hold-style button; dn/up callbacks optional */
  bind(id, dn, up) {
    const e = $(id); if (!e) return;
    e.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      try { e.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      IN.hold[id] = 1; e.classList.add('held'); dn && dn();
    });
    const u = () => { if (!IN.hold[id]) return; IN.hold[id] = 0; e.classList.remove('held'); up && up(); };
    e.addEventListener('pointerup', u); e.addEventListener('pointercancel', u);
  },
  fire(id, d) { IN.hold[id] = d ? 1 : 0; const e = $(id); if (e) e.classList.toggle('held', !!d); },
  thrUI(v) {
    const r = $('thr').getBoundingClientRect();
    $('thrF').style.height = v * 100 + '%';
    $('thrT').style.bottom = 4 + v * (r.height - 16) + 'px';
  },
};

/** draws a stick thumb at (x,y) in -1..1 — used by the AI pilot's "ghost hands" */
export function showStick(which, x, y) {
  const T = $(which === 'L' ? 'tL' : 'tR');
  if (T) T.style.transform = `translate(${(x * 44).toFixed(1)}px,${(y * 44).toFixed(1)}px)`;
}

function stick(z, b, t, set) {
  const Z = $(z), B = $(b), T = $(t);
  let pid = null, ox = 0, oy = 0;
  const mv = e => {
    const r = Z.getBoundingClientRect();
    let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
    const d = hy(dx, dy);
    if (d > 44) { dx *= 44 / d; dy *= 44 / d; }
    T.style.transform = `translate(${dx}px,${dy}px)`;
    set(dx / 44, dy / 44);
  };
  Z.addEventListener('pointerdown', e => {
    e.preventDefault(); if (pid !== null) return; pid = e.pointerId;
    try { Z.setPointerCapture(pid); } catch (_) { /* ignore */ }
    const r = Z.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
    B.style.left = ox + 'px'; B.style.top = oy + 'px'; mv(e);
  });
  Z.addEventListener('pointermove', e => { if (e.pointerId === pid) mv(e); });
  const end = e => {
    if (e.pointerId !== pid) return; pid = null;
    B.style.left = '50%'; B.style.top = '50%'; T.style.transform = ''; set(0, 0);
  };
  Z.addEventListener('pointerup', end); Z.addEventListener('pointercancel', end);
}

const KM = { KeyF: 'ctx', KeyV: 'alt', KeyX: 'match', KeyT: 'target', KeyG: 'gear', KeyC: 'scan', Escape: 'pause', KeyH: 'help', KeyP: 'ai' };

export function initInput() {
  stick('zL', 'bL', 'tL', (x, y) => { IN.lx = x; IN.ly = y; });
  stick('zR', 'bR', 'tR', (x, y) => { IN.rx = x; IN.ry = y; });
  // throttle rail
  (() => {
    const t = $('thr'); let pid = null;
    const set = e => { const r = t.getBoundingClientRect(); IN.thr = cl(1 - (e.clientY - r.top - 8) / (r.height - 16), 0, 1); IN.thrUI(IN.thr); };
    t.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; try { t.setPointerCapture(pid); } catch (_) { /* */ } set(e); });
    t.addEventListener('pointermove', e => { if (e.pointerId === pid) set(e); });
    const u = e => { if (e.pointerId === pid) pid = null; };
    t.addEventListener('pointerup', u); t.addEventListener('pointercancel', u);
  })();
  // canvas: tap to target, drag to look, pinch / wheel to zoom
  (() => {
    const cv = $('cv'), pts = new Map();
    let p0 = 0, z0 = 1, t0 = 0, mv = 0;
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { t0 = performance.now(); mv = 0; }
      if (pts.size === 2) { const a = [...pts.values()]; p0 = hy(a[0].x - a[1].x, a[0].y - a[1].y); z0 = cam.tz; }
    });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const a = [...pts.values()], d = hy(a[0].x - a[1].x, a[0].y - a[1].y); if (p0 > 0) { cam.tz = cl((z0 * d) / p0, 0.35, 3.4); cam.user = 6; } }
      else { mv += Math.abs(dx) + Math.abs(dy); cam.lx -= dx / cam.z; cam.ly -= dy / cam.z; cam.lt = 2.2; }
    });
    const u = e => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (!pts.size && performance.now() - t0 < 260 && mv < 9) IN.taps.push({ x: e.clientX, y: e.clientY });
    };
    cv.addEventListener('pointerup', u); cv.addEventListener('pointercancel', u);
    cv.addEventListener('wheel', e => { e.preventDefault(); cam.tz = cl(cam.tz * Math.exp(-e.deltaY * 0.0012), 0.35, 3.4); cam.user = 6; }, { passive: false });
  })();
  addEventListener('keydown', e => {
    if (e.repeat) return; IN.keys[e.code] = 1;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space') IN.fire('fireB', 1);
    if (e.code === 'KeyM') IN.fire('mineB', 1);
    if (e.code === 'KeyZ') IN.fire('brake', 1);
    if (e.code === 'Tab') IN.edge.push('target');
    if (KM[e.code]) IN.edge.push(KM[e.code]);
  });
  addEventListener('keyup', e => {
    IN.keys[e.code] = 0;
    if (e.code === 'Space') IN.fire('fireB', 0);
    if (e.code === 'KeyM') IN.fire('mineB', 0);
    if (e.code === 'KeyZ') IN.fire('brake', 0);
  });
  addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  // film grain texture
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d'), im = x.createImageData(96, 96);
  for (let i = 0; i < im.data.length; i += 4) { const v = (Math.random() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); $('grain').style.background = `url(${c.toDataURL()})`;
}

/** human control frame: sticks + keyboard merged */
export function readHuman(out, dt) {
  const K = IN.keys;
  const kx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), ky = (K.KeyS ? 1 : 0) - (K.KeyW ? 1 : 0), kt = (K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0);
  if (K.ShiftLeft || K.ShiftRight) { IN.thr = Math.min(1, IN.thr + dt * 0.85); IN.thrUI(IN.thr); }
  if (K.ControlLeft || K.ControlRight) { IN.thr = Math.max(0, IN.thr - dt * 1.2); IN.thrUI(IN.thr); }
  out.lx = cl(IN.lx + kx, -1, 1); out.ly = cl(IN.ly + ky, -1, 1);
  out.rx = cl(IN.rx + kt, -1, 1); out.ry = IN.ry;
  out.thr = IN.thr; out.fire = !!IN.hold.fireB; out.mine = !!IN.hold.mineB; out.brake = !!IN.hold.brake; out.ai = false;
  return out;
}
