// ═══ procedural sector generation ═══════════════════════════════════════
import { TAU, cl, lp, hy, rng, pk, rr, ri, sh } from '../core/util.js';
import { C, PAL } from '../core/config.js';
import { W, setW } from '../core/state.js';
import { body, mkc, cw, pR, pF } from './body.js';

export function addPick(x, y, t, q, vx = 0, vy = 0) {
  const p = { x, y, vx, vy, a: Math.random() * TAU, va: (Math.random() - 0.5) * 0.6, type: t, qty: q, r: 2.2 + q * 0.7, dead: false, rev: 0 };
  W.picks.push(p);
  return p;
}

/** scanner contact anchored to a body (follows it if the body drifts) */
export function addContact(r, kind, x, y, b, label) {
  const c = Math.cos(-b.a), s = Math.sin(-b.a), dx = x - b.x, dy = y - b.y;
  const ct = { x, y, b, kind, label, f: rr(r, 30, 190), ph: r() * TAU, done: false, hint: 0, lx: dx * c - dy * s, ly: dx * s + dy * c };
  W.contacts.push(ct);
  (b.contacts || (b.contacts = [])).push(ct);
  return ct;
}

// ─── asteroids ───────────────────────────────────────────────────────────
export function mkRock(r, x, y, id, R, type, hide) {
  const gw = Math.ceil(R * 2) + 8, b = body('rock', x, y, gw, gw, C.CS, ri(r, 0, 1e9));
  b.name = 'K9-' + (100 + id); b.R = R; b.type = type;
  const c0 = gw / 2, p1 = r() * TAU, p2 = r() * TAU, h1 = ri(r, 2, 4), h2 = ri(r, 5, 8);
  const rad = t => R * (0.78 + 0.12 * Math.sin(t * h1 + p1) + 0.08 * Math.sin(t * h2 + p2)), orig = new Uint8Array(gw * gw);
  // body: rock + dense rock, icy crust
  for (let cy = 0; cy < gw; cy++) for (let cx = 0; cx < gw; cx++) {
    const dx = cx - c0, dy = cy - c0, d = hy(dx, dy);
    if (d < rad(Math.atan2(dy, dx))) {
      const i = cy * gw + cx; orig[i] = 1;
      const n = ((cx * 2654435761) ^ (cy * 40503) ^ b.seed) >>> 0;
      b.sol[i] = n % 100 < 22 ? 2 : 1;
      if (type === 'ice' && d > R * 0.7 && n % 100 < 70) b.sol[i] = 3;
      if (type === 'metal' && n % 100 < 18) b.sol[i] = 4;
    }
  }
  // ferrite veins (random walks)
  for (let v = 0; v < ri(r, 2, 5); v++) {
    let vx = c0 + rr(r, -R * 0.5, R * 0.5), vy = c0 + rr(r, -R * 0.5, R * 0.5), va = r() * TAU;
    for (let s = 0; s < ri(r, 18, 50); s++) {
      va += rr(r, -0.5, 0.5); vx += Math.cos(va); vy += Math.sin(va);
      const cx = Math.round(vx), cy = Math.round(vy);
      if (cx < 1 || cy < 1 || cx >= gw - 1 || cy >= gw - 1) break;
      const i = cy * gw + cx; if (b.sol[i]) b.sol[i] = 4;
    }
  }
  // gold pockets
  for (let p = 0; p < ri(r, 1, 3); p++) {
    const px = Math.round(c0 + rr(r, -R * 0.4, R * 0.4)), py = Math.round(c0 + rr(r, -R * 0.4, R * 0.4));
    for (let k = 0; k < ri(r, 3, 7); k++) {
      const cx = px + ri(r, -2, 2), cy = py + ri(r, -2, 2);
      if (cx > 0 && cy > 0 && cx < gw && cy < gw && b.sol[cy * gw + cx]) { b.sol[cy * gw + cx] = 5; b.veins.push(cy * gw + cx); }
    }
  }
  // surface craters
  for (let c2 = 0; c2 < ri(r, 2, 5); c2++) {
    const t = r() * TAU, cr = ri(r, 3, 7), cd = rad(t) * 0.92, ccx = c0 + Math.cos(t) * cd, ccy = c0 + Math.sin(t) * cd;
    for (let cy = Math.max(0, (ccy - cr) | 0); cy < Math.min(gw, ccy + cr); cy++)
      for (let cx = Math.max(0, (ccx - cr) | 0); cx < Math.min(gw, ccx + cr); cx++)
        if (hy(cx - ccx, cy - ccy) < cr && orig[cy * gw + cx]) { b.sol[cy * gw + cx] = 0; b.flr[cy * gw + cx] = 1; }
    if (type === 'ice' || r() < 0.3) b.fog.push({ x: x + (ccx - c0) * C.CS, y: y + (ccy - c0) * C.CS, r: cr * C.CS * 1.5, ph: r() * TAU });
  }
  const disc = (cx, cy, cr, f) => {
    for (let y2 = Math.max(1, (cy - cr) | 0); y2 < Math.min(gw - 1, cy + cr + 1); y2++)
      for (let x2 = Math.max(1, (cx - cr) | 0); x2 < Math.min(gw - 1, cx + cr + 1); x2++)
        if (hy(x2 - cx, y2 - cy) < cr && orig[y2 * gw + x2]) { b.sol[y2 * gw + x2] = 0; b.flr[y2 * gw + x2] = f; }
  };
  const path = (x0, y0, x1, y1, w, f) => {
    const n = Math.ceil(hy(x1 - x0, y1 - y0) * 2) + 1;
    for (let s = 0; s <= n; s++) { const t = s / n; disc(lp(x0, x1, t) + Math.sin(t * 9 + p1) * 1.4, lp(y0, y1, t) + Math.cos(t * 7 + p2) * 1.4, w / 2, f); }
  };
  // chambers (biomes), hideouts, tunnels
  if (R >= 18) {
    const n = Math.min(5, 1 + Math.floor(R / 13));
    for (let i = 0; i < n; i++) {
      const t = r() * TAU, d = r() * R * 0.5;
      const ch = { cx: Math.round(c0 + Math.cos(t) * d), cy: Math.round(c0 + Math.sin(t) * d), r: ri(r, 5, Math.min(15, R * 0.34)), biome: 'barren', open: false, disc: false, hide: false };
      if (hide && i === 0) { ch.biome = 'hide'; ch.hide = true; ch.r = Math.max(ch.r, 9); }
      else { const q = r(); ch.biome = type === 'ice' ? (q < 0.5 ? 'ice' : q < 0.75 ? 'bio' : 'geode') : q < 0.32 ? 'barren' : q < 0.58 ? 'bio' : q < 0.82 ? 'geode' : 'ice'; }
      const f = { barren: 1, ice: 5, bio: 6, geode: 7, hide: 8 }[ch.biome];
      disc(ch.cx, ch.cy, ch.r, f);
      if (ch.biome === 'geode' || ch.biome === 'bio')
        for (let k = 0; k < ch.r * 2; k++) {
          const t2 = r() * TAU, d2 = ch.r + rr(r, 0, 1.4), cx = Math.round(ch.cx + Math.cos(t2) * d2), cy = Math.round(ch.cy + Math.sin(t2) * d2);
          if (cx > 0 && cy > 0 && cx < gw && cy < gw && b.sol[cy * gw + cx]) b.sol[cy * gw + cx] = ch.biome === 'geode' ? 6 : 8;
        }
      if (ch.hide) {
        for (let cy = ch.cy - ch.r - 2; cy <= ch.cy + ch.r + 2; cy++) for (let cx = ch.cx - ch.r - 2; cx <= ch.cx + ch.r + 2; cx++) {
          const d2 = hy(cx - ch.cx, cy - ch.cy);
          if (d2 > ch.r && d2 < ch.r + 2 && cx > 0 && cy > 0 && cx < gw && cy < gw && b.sol[cy * gw + cx]) b.sol[cy * gw + cx] = 7;
        }
        const wp = cw(b, ch.cx, ch.cy);
        W.hideouts.push({ x: wp.x, y: wp.y, b });
        b.lights.push({ lx: wp.x - b.x, ly: wp.y - b.y, c: PAL.amber, r: 44, fl: false });
      }
      b.cham.push(ch);
    }
    for (let i = 1; i < b.cham.length; i++) path(b.cham[i - 1].cx, b.cham[i - 1].cy, b.cham[i].cx, b.cham[i].cy, 2, 1);
    const ch = b.cham[0], t = Math.atan2(ch.cy - c0, ch.cx - c0) + rr(r, -0.4, 0.4);
    path(ch.cx, ch.cy, c0 + Math.cos(t) * (R + 3), c0 + Math.sin(t) * (R + 3), ch.r >= 8 ? 8 : 2, 1);
    if (R >= 32) {
      const t2 = r() * TAU, px = Math.round(c0 + Math.cos(t2) * R * 0.5), py = Math.round(c0 + Math.sin(t2) * R * 0.5);
      disc(px, py, 3, 7);
      for (let k = 0; k < 5; k++) { const cx = px + ri(r, -3, 3), cy = py + ri(r, -3, 3); if (cx > 0 && cy > 0 && cx < gw && cy < gw && b.sol[cy * gw + cx]) b.sol[cy * gw + cx] = r() < 0.5 ? 5 : 6; }
      b.cham.push({ cx: px, cy: py, r: 3, biome: 'geode', open: false, disc: false, pocket: true });
    }
  }
  // flood-fill from the border: which chambers are open to space?
  const open = new Uint8Array(gw * gw), st = [];
  for (let cx = 0; cx < gw; cx++) { if (!b.sol[cx]) st.push(cx); const i = (gw - 1) * gw + cx; if (!b.sol[i]) st.push(i); }
  for (let cy = 0; cy < gw; cy++) { const i = cy * gw; if (!b.sol[i]) st.push(i); const j = i + gw - 1; if (!b.sol[j]) st.push(j); }
  while (st.length) {
    const i = st.pop(); if (open[i] || b.sol[i]) continue; open[i] = 1;
    const cx = i % gw, cy = (i / gw) | 0;
    if (cx > 0 && !b.sol[i - 1]) st.push(i - 1);
    if (cx < gw - 1 && !b.sol[i + 1]) st.push(i + 1);
    if (cy > 0 && !b.sol[i - gw]) st.push(i - gw);
    if (cy < gw - 1 && !b.sol[i + gw]) st.push(i + gw);
  }
  mkc(b);
  for (const ch of b.cham) {
    ch.open = !!open[ch.cy * gw + ch.cx];
    const wp = cw(b, ch.cx, ch.cy);
    if (!ch.open) ch.contact = addContact(r, ch.hide ? 'signal' : ch.pocket ? 'cache' : 'void', wp.x, wp.y, b,
      ch.hide ? 'structured signal · sealed' : ch.pocket ? 'dense mass pocket' : 'hollow chamber · ' + ch.biome);
    const loot = {
      geode: [['crys', ri(r, 1, 3)], ['au', ri(r, 1, 2)]], bio: [['food', ri(r, 1, 3)]], ice: [['ice', ri(r, 1, 3)]],
      hide: [['stims', ri(r, 2, 4)], ['art', 1], ['parts', ri(r, 1, 3)]], barren: r() < 0.4 ? [['fe', ri(r, 1, 2)]] : [],
    }[ch.biome] || [];
    for (const [g, q] of loot) addPick(wp.x + rr(r, -8, 8), wp.y + rr(r, -8, 8), g, q);
  }
  if (b.veins.length > 3) { const v = cw(b, b.veins[0] % gw, (b.veins[0] / gw) | 0); addContact(r, 'vein', v.x, v.y, b, 'Au-Pt concentration'); }
  for (let cy = 0; cy < gw; cy++) for (let cx = 0; cx < gw; cx++) { pR(b, cx, cy); pF(b, cx, cy); }
  for (let cy = 1; cy < gw - 1; cy++) for (let cx = 1; cx < gw - 1; cx++) {
    const i = cy * gw + cx; if (!b.flr[i]) continue;
    let col = null;
    if (b.sol[i - 1] === 6 || b.sol[i + 1] === 6 || b.sol[i - gw] === 6 || b.sol[i + gw] === 6) col = PAL.mag;
    else if (b.flr[i] === 6 && r() < 0.09) col = PAL.bio;
    else if (b.flr[i] === 5 && r() < 0.05) col = PAL.ice;
    if (col) b.glow.push({ x: x + (cx - c0) * C.CS, y: y + (cy - c0) * C.CS, c: col, r: rr(r, 5, 12), leak: !!open[i] });
  }
  b.rad = R * C.CS + 10;
  return b;
}

// ─── station construction kit ────────────────────────────────────────────
function wall(b, x, y, w, h) { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) if (cx === x || cy === y || cx === x + w - 1 || cy === y + h - 1) b.sol[cy * b.gw + cx] = 7; }
function fill(b, x, y, w, h, f) { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) b.flr[cy * b.gw + cx] = f; }
function doorH(b, x, y, w) { for (let cx = x; cx < x + w; cx++) { b.sol[y * b.gw + cx] = 0; b.flr[y * b.gw + cx] = 2; } }
function doorV(b, x, y, h) { for (let cy = y; cy < y + h; cy++) { b.sol[cy * b.gw + x] = 0; b.flr[cy * b.gw + x] = 2; } }
function mouth(b, x, y, w, h) { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) { const i = cy * b.gw + cx; b.sol[i] = 0; b.flr[i] = 3; } }
function room(b, x, y, w, h, kind, name) {
  b.rooms.push({ x, y, w, h, kind, name }); fill(b, x + 1, y + 1, w - 2, h - 2, 2);
  b.lights.push({ lx: (x + w / 2) * b.cs - (b.gw * b.cs) / 2, ly: (y + h / 2) * b.cs - (b.gh * b.cs) / 2, c: kind === 'farm' ? PAL.bio : kind === 'reactor' ? PAL.ember : PAL.amber, r: Math.max(w, h) * b.cs * 0.75, fl: false });
}
function port(b, cx, cy, dir, berth) { b.ports.push({ cx, cy, dir, berth: !!berth, occ: null }); }
function pad(b, cx, cy, dir) { b.pads.push({ cx, cy, dir, occ: null }); }
function pylon(b, cx, cy) { b.sol[cy * b.gw + cx] = 7; b.sol[cy * b.gw + cx + 1] = 7; port(b, cx, cy, Math.PI / 2, true); }

function paintSt(b, r) {
  mkc(b);
  for (let cy = 0; cy < b.gh; cy++) for (let cx = 0; cx < b.gw; cx++) {
    const i = cy * b.gw + cx;
    if (b.flr[i]) {
      const n = ((cx * 73856093 ^ cy * 19349663 ^ b.seed) >>> 0) % 100;
      b.rc.fillStyle = cx % 7 === 0 || cy % 7 === 0 ? '#2c3642' : sh('#38434f', 0.9 + n / 400); b.rc.fillRect(cx, cy, 1, 1);
      if (b.flr[i] === 2 && n < 6) { b.rc.fillStyle = '#ffb347'; b.rc.fillRect(cx, cy, 1, 1); }
    }
    pF(b, cx, cy);
    if (b.sol[i]) { pR(b, cx, cy); b.fc.fillStyle = '#2a333f'; b.fc.fillRect(cx, cy, 1, 1); }
  }
  for (const rm of b.rooms) for (let cy = rm.y + 2; cy < rm.y + rm.h - 2; cy++) for (let cx = rm.x + 2; cx < rm.x + rm.w - 2; cx++) {
    const n = ((cx * 2654435761 ^ cy * 40503 ^ b.seed) >>> 0) % 100, k = rm.kind;
    if (k === 'market' && cy % 4 === 1 && cx % 3 !== 0) { b.fc.fillStyle = n < 50 ? '#8a6a2f' : '#1f6f8f'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'bar' && n < 8) { b.fc.fillStyle = '#c96f2f'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'farm' && cx % 3 === 0) { b.fc.fillStyle = n < 60 ? '#2f6f3a' : '#4f8f5a'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'cargo' && n < 14) { b.fc.fillStyle = n < 7 ? '#8a6a2f' : '#5a5148'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'reactor' && hy(cx - rm.x - rm.w / 2, cy - rm.y - rm.h / 2) < 3) { b.fc.fillStyle = '#ff8c1a'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'workshop' && cy % 4 === 2 && cx % 2 === 0) { b.fc.fillStyle = '#41546b'; b.fc.fillRect(cx, cy, 1, 1); }
  }
  for (const p of b.ports) if (p.berth) { b.rc.fillStyle = '#8a6a2f'; b.rc.fillRect(p.cx, p.cy, 2, 1); b.fc.fillStyle = '#ffb347'; b.fc.fillRect(p.cx, p.cy, 2, 1); }
  for (const p of b.pads) {
    for (let t = 0; t < 12; t++) { const a = (t / 12) * TAU; b.rc.fillStyle = '#ffd166'; b.rc.fillRect(Math.round(p.cx + Math.cos(a) * 3), Math.round(p.cy + Math.sin(a) * 3), 1, 1); }
    b.rc.fillRect(p.cx, p.cy - 1, 1, 3);
  }
  for (let k = 0; k < ri(r, 7, 13); k++) {
    const rm = b.rooms[ri(r, 0, b.rooms.length - 1)]; if (!rm) break;
    b.crew.push({
      lx: (rm.x + 2 + r() * (rm.w - 4)) * b.cs - (b.gw * b.cs) / 2, ly: (rm.y + 2 + r() * (rm.h - 4)) * b.cs - (b.gh * b.cs) / 2,
      tx: 0, ty: 0, rm, c: pk(r, ['#d8e2ec', '#ffb347', '#53d9ff', '#8cff9e']), sp: rr(r, 3, 7), t: r() * 4, ag: null,
    });
  }
}

/** station economy: [stock, consumption/min, production/min] */
function econ(r, type) {
  const D = {
    anchor: { fe: [90, 0.3, 0], ice: [110, 0.5, 0], au: [24, 0, 0], crys: [10, 0, 0], food: [70, 0.25, 0.6], fuel: [160, 0.4, 0.2], parts: [60, 0.2, 0.35], stims: [0, 0, 0], art: [2, 0, 0] },
    hub: { fe: [60, 0.15, 0], ice: [70, 0.2, 0], au: [14, 0, 0], crys: [8, 0, 0], food: [90, 0.3, 0.1], fuel: [120, 0.25, 0], parts: [70, 0.2, 0.1], stims: [0, 0, 0], art: [1, 0, 0] },
    industrial: { fe: [140, 0.9, 0], ice: [80, 0.35, 0], au: [10, 0, 0], crys: [6, 0, 0], food: [50, 0.3, 0], fuel: [200, 0, 0.85], parts: [90, 0, 0.5], stims: [4, 0, 0], art: [0, 0, 0] },
    repair: { fe: [30, 0.1, 0], ice: [30, 0.1, 0], au: [6, 0, 0], crys: [4, 0, 0], food: [35, 0.15, 0], fuel: [70, 0.15, 0], parts: [110, 0.45, 0], stims: [0, 0, 0], art: [0, 0, 0] },
  }[type], e = {};
  for (const g in D) { const [s, c, p] = D[g]; e[g] = { stock: Math.round(s * rr(r, 0.75, 1.25)), cons: c, prod: p, hist: [], ref: s, mod: 1 }; }
  return e;
}

export function mkStation(r, type, x, y, name, fac) {
  const S = { anchor: [200, 100], hub: [32, 32], industrial: [110, 52], repair: [56, 30] }[type];
  const b = body('station', x, y, S[0], S[1], C.TS, ri(r, 0, 1e9));
  b.name = name; b.type = type; b.fac = fac; b.econ = econ(r, type); b.berths = 0;
  b.svc = { repair: type !== 'industrial', upg: type === 'anchor' || type === 'repair', debt: type === 'anchor' };
  if (type === 'anchor') {
    wall(b, 30, 4, 140, 44); fill(b, 31, 5, 138, 42, 3); mouth(b, 30, 18, 1, 12);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) { pylon(b, 36 + col * 16, 8 + row * 12); b.berths++; }
    pad(b, 60, 47, -Math.PI / 2); pad(b, 110, 47, -Math.PI / 2); wall(b, 6, 50, 188, 8); fill(b, 7, 51, 186, 6, 2);
    doorV(b, 60, 47, 4); doorV(b, 61, 47, 4); doorV(b, 110, 47, 4); doorV(b, 111, 47, 4);
    for (const [rx, rw, k, n] of [[6, 30, 'reactor', 'REACTOR'], [38, 40, 'market', 'EXCHANGE'], [80, 30, 'bar', 'THE GULLET'], [112, 44, 'farm', 'HYDROPONICS'], [158, 36, 'cargo', 'CARGO DEPOT']]) {
      wall(b, rx, 59, rw, 36); room(b, rx, 59, rw, 36, k, n);
      const dx = rx + (rw >> 1); doorH(b, dx, 57, 2); doorH(b, dx, 58, 2); doorH(b, dx, 59, 2);
    }
    pad(b, 50, 94, Math.PI / 2); pad(b, 120, 94, Math.PI / 2); port(b, 6, 53, Math.PI); port(b, 193, 53, 0);
    for (let cx = 14; cx < 190; cx += 14) b.lights.push({ lx: (cx + 0.5) * b.cs - (b.gw * b.cs) / 2, ly: 53.5 * b.cs - (b.gh * b.cs) / 2, c: PAL.amber, r: 28, fl: false });
    for (const hx of [55, 100, 145]) b.lights.push({ lx: hx * b.cs - (b.gw * b.cs) / 2, ly: 26 * b.cs - (b.gh * b.cs) / 2, c: PAL.cyan, r: 64, fl: false });
  } else if (type === 'hub') {
    wall(b, 2, 2, 28, 28); fill(b, 3, 3, 26, 26, 2);
    for (let cx = 3; cx < 29; cx++) b.sol[16 * b.gw + cx] = 7;
    doorH(b, 14, 16, 3);
    room(b, 3, 3, 26, 13, 'bar', 'GALLEY'); room(b, 3, 17, 26, 12, 'cargo', 'DEPOT'); mouth(b, 29, 12, 1, 8);
    pad(b, 16, 2, -Math.PI / 2); pad(b, 16, 29, Math.PI / 2);
    b.ring = { r: 118, ang: r() * TAU, spin: 0.08 };
    for (let k = 0; k < 4; k++) b.ports.push({ a0: (k * Math.PI) / 2, r: 118, ring: true, occ: null });
    b.rad = 132;
  } else if (type === 'industrial') {
    wall(b, 4, 4, 64, 44); fill(b, 5, 5, 62, 42, 3); mouth(b, 4, 16, 1, 12); pylon(b, 18, 6); pylon(b, 46, 6); b.berths = 2;
    pad(b, 32, 47, -Math.PI / 2);
    for (const [tx, ty, tr] of [[84, 14, 7], [100, 14, 6], [92, 32, 8]])
      for (let cy = ty - tr; cy <= ty + tr; cy++) for (let cx = tx - tr; cx <= tx + tr; cx++)
        if (hy(cx - tx, cy - ty) < tr && cx > 0 && cy > 0 && cx < b.gw && cy < b.gh) b.sol[cy * b.gw + cx] = 7;
    wall(b, 74, 34, 32, 14); room(b, 74, 34, 32, 14, 'workshop', 'SMELTER CONTROL'); doorH(b, 88, 34, 2);
    port(b, 109, 10, 0); port(b, 109, 42, 0); pad(b, 20, 51, Math.PI / 2); pad(b, 56, 51, Math.PI / 2); b.va = 0.015;
    b.lights.push({ lx: 36 * b.cs - (b.gw * b.cs) / 2, ly: 26 * b.cs - (b.gh * b.cs) / 2, c: PAL.ember, r: 70, fl: true });
  } else {
    wall(b, 2, 2, 52, 26); fill(b, 3, 3, 50, 24, 2); room(b, 3, 3, 50, 24, 'workshop', 'PATCH & PATCH'); mouth(b, 53, 10, 1, 8);
    pylon(b, 10, 4); b.berths = 1; port(b, 2, 8, Math.PI); port(b, 2, 22, Math.PI); pad(b, 28, 27, Math.PI / 2);
  }
  paintSt(b, r);
  b.sol0 = b.sol.slice(); b.flr0 = b.flr.slice(); // blueprint for the station's repair crews
  return b;
}

// ─── derelict hulks ──────────────────────────────────────────────────────
export const HULKS = ['MSV Calypso', 'ORE HAUL-9', 'SV Long Quiet', 'PATROL K-22', 'TUG Bruiser', 'MSV Cinder', 'SV Marrow', 'ICE BARGE 4', 'MSV Halcyon', 'TUG Old Debt'];
export function mkHulk(r, x, y, i, name) {
  const gw = ri(r, 24, 38), gh = ri(r, 11, 15), b = body('hulk', x, y, gw, gh, 3, ri(r, 0, 1e9));
  b.name = name || HULKS[i % HULKS.length]; b.fac = pk(r, ['coop', 'miners', 'kings', 'scrappers']); b.type = 'hulk';
  b.vx = rr(r, -1.2, 1.2); b.vy = rr(r, -1.2, 1.2); b.va = rr(r, -0.012, 0.012); b.a = r() * TAU;
  const c0 = gw / 2, d0 = gh / 2;
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const nx = (cx - c0) / c0, ny = (cy - d0) / d0, d = nx * nx + ny * ny;
    if (d < 1) { const i2 = cy * gw + cx; if (d > 0.62) b.sol[i2] = 7; else b.flr[i2] = 2; }
  }
  for (let p = 0; p < ri(r, 1, 2); p++) {
    const px = ri(r, 6, gw - 7);
    for (let cy = 2; cy < gh - 2; cy++) if (b.flr[cy * gw + px]) b.sol[cy * gw + px] = 7;
    doorV(b, px, ri(r, 4, gh - 5), 2);
  }
  if (r() < 0.6) {
    const t = r() * TAU, bx = Math.round(c0 + Math.cos(t) * c0 * 0.85), by = Math.round(d0 + Math.sin(t) * d0 * 0.85);
    for (let cy = by - 2; cy <= by + 2; cy++) for (let cx = bx - 2; cx <= bx + 2; cx++)
      if (hy(cx - bx, cy - by) < 2.2 && cx > 0 && cy > 0 && cx < gw && cy < gh) { const i2 = cy * gw + cx; b.sol[i2] = 0; b.flr[i2] = 4; }
    b.breached = true;
  }
  b.rooms.push({ x: 2, y: 2, w: gw - 4, h: gh - 4, kind: 'cargo', name: 'DARK HOLD' });
  let sx = 0, sy = 0, n = 0;
  for (let k = 0; k < ri(r, 2, 4); k++) {
    let px, py, t = 0;
    do { px = ri(r, 4, gw - 5); py = ri(r, 3, gh - 4); t++; } while (!b.flr[py * gw + px] && t < 30);
    if (!b.flr[py * gw + px]) continue;
    const w = cw(b, px, py); sx += w.x; sy += w.y; n++;
    addPick(w.x, w.y, pk(r, ['parts', 'parts', 'au', 'fe', 'stims', 'art', 'crys']), ri(r, 1, 3));
  }
  if (n) addContact(r, 'cache', sx / n, sy / n, b, 'cargo mass · dark hold');
  b.lights.push({ lx: rr(r, -gw, gw), ly: rr(r, -gh, gh), c: PAL.red, r: 28, fl: true });
  paintSt(b, r);
  b.sol0 = b.sol.slice(); b.flr0 = b.flr.slice(); // blueprint for the station's repair crews
  return b;
}

// ─── backdrop ────────────────────────────────────────────────────────────
function background(r) {
  const stars = [];
  for (let L = 0; L < 3; L++) {
    const c = document.createElement('canvas'); c.width = c.height = 384; const x = c.getContext('2d');
    for (let k = 0; k < [95, 70, 46][L]; k++) {
      const q = r();
      x.fillStyle = q < 0.7 ? `rgba(216,226,236,${rr(r, 0.3, 0.9)})` : q < 0.85 ? `rgba(168,236,255,${rr(r, 0.3, 0.8)})` : `rgba(255,179,71,${rr(r, 0.25, 0.7)})`;
      const big = L === 2 && r() < 0.3;
      x.fillRect((r() * 384) | 0, (r() * 384) | 0, big ? 2 : 1, big ? 2 : 1);
    }
    stars.push(c);
  }
  const neb = document.createElement('canvas'); neb.width = 480; neb.height = 360; const nx = neb.getContext('2d');
  for (let k = 0; k < 16; k++) {
    const px = r() * 480, py = r() * 360, rad = rr(r, 50, 150), col = pk(r, ['201,111,47', '83,217,255', '255,94,196', '43,58,77']);
    const g = nx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(${col},${rr(r, 0.05, 0.13)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    nx.fillStyle = g; nx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  const moon = document.createElement('canvas'); moon.width = moon.height = 160; const mx = moon.getContext('2d');
  mx.fillStyle = '#232b36'; mx.beginPath(); mx.arc(80, 80, 78, 0, TAU); mx.fill();
  const lg = mx.createRadialGradient(112, 48, 10, 80, 80, 90);
  lg.addColorStop(0, 'rgba(122,138,156,.9)'); lg.addColorStop(0.6, 'rgba(70,82,98,.4)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
  mx.fillStyle = lg; mx.beginPath(); mx.arc(80, 80, 78, 0, TAU); mx.fill();
  for (let k = 0; k < 46; k++) {
    const t = r() * TAU, d = r() * 70, cx = 80 + Math.cos(t) * d, cy = 80 + Math.sin(t) * d, cr = rr(r, 2, 9);
    mx.fillStyle = 'rgba(16,21,28,.55)'; mx.beginPath(); mx.arc(cx, cy, cr, 0, TAU); mx.fill();
    mx.strokeStyle = 'rgba(140,156,176,.35)'; mx.lineWidth = 1; mx.beginPath(); mx.arc(cx, cy, cr, -0.9 * Math.PI, 0.1 * Math.PI); mx.stroke();
  }
  const tg = mx.createLinearGradient(0, 160, 160, 0);
  tg.addColorStop(0, 'rgba(3,5,9,.92)'); tg.addColorStop(0.45, 'rgba(3,5,9,.35)'); tg.addColorStop(0.75, 'rgba(0,0,0,0)');
  mx.fillStyle = tg; mx.beginPath(); mx.arc(80, 80, 78, 0, TAU); mx.fill();
  const dust = [];
  for (let k = 0; k < 90; k++) dust.push({ x: r() * 2000, y: r() * 2000, d: rr(r, 0.4, 1) });
  // distant traffic lights crossing the backdrop
  const far = [];
  for (let k = 0; k < 7; k++) far.push({ x: r() * 6000, y: r() * 4000, vx: rr(r, -14, 14), vy: rr(r, -4, 4), c: pk(r, ['#ffb347', '#53d9ff', '#d8e2ec']), ph: r() * TAU });
  return { stars, neb, moon, dust, far };
}

export function genWorld(seed) {
  const r = rng(seed);
  setW({
    seed, bodies: [], rocks: [], stations: [], hulks: [], ships: [], picks: [], bullets: [], bits: [], deb: [], contacts: [], hideouts: [], feed: [],
    heat: [], meteors: [], beacons: [], extra: [], aid: 200, nav: null, time: 0,
    stats: { mined: 0, kills: 0, earned: 0, found: 0, docked: 0, rescues: 0, breaches: 0, jobs: 0, events: 0, eva: 0 }, bg: null,
  });
  for (const [t, x, y, n, f] of [['anchor', C.W * 0.42, C.H * 0.36, 'KERES ANCHOR', 'coop'], ['hub', C.W * 0.74, C.H * 0.6, 'HUB SEVEN', 'coop'],
    ['industrial', C.W * 0.18, C.H * 0.7, 'SLAGWORKS', 'miners'], ['repair', C.W * 0.6, C.H * 0.16, 'PATCH & PATCH', 'scrappers']])
    W.stations.push(mkStation(r, t, x, y, n, f));
  const cl2 = [[C.W * 0.3, C.H * 0.5], [C.W * 0.62, C.H * 0.42], [C.W * 0.8, C.H * 0.3], [C.W * 0.45, C.H * 0.78], [C.W * 0.12, C.H * 0.25]], sizes = [];
  for (let k = 0; k < 7; k++) sizes.push(rr(r, 40, 64));
  for (let k = 0; k < 20; k++) sizes.push(rr(r, 19, 38));
  for (let k = 0; k < 32; k++) sizes.push(rr(r, 8, 17));
  let hide = 2, id = 0;
  for (const R of sizes) {
    let x, y, ok = false, t = 0;
    while (!ok && t++ < 60) {
      if (r() < 0.6) { const c = pk(r, cl2); x = cl(c[0] + rr(r, -850, 850), 160, C.W - 160); y = cl(c[1] + rr(r, -650, 650), 160, C.H - 160); }
      else { x = rr(r, 160, C.W - 160); y = rr(r, 160, C.H - 160); }
      ok = true;
      for (const s of W.stations) if (hy(s.x - x, s.y - y) < s.rad + R * C.CS + 150) { ok = false; break; }
      if (ok) for (const a of W.rocks) if (hy(a.x - x, a.y - y) < a.rad + R * C.CS + 40) { ok = false; break; }
    }
    if (!ok) continue;
    const type = r() < 0.22 ? 'ice' : r() < 0.12 ? 'metal' : 'rock', fh = hide > 0 && R >= 40 && type === 'rock';
    if (fh) hide--;
    W.rocks.push(mkRock(r, x, y, id++, R, type, fh));
  }
  for (let k = 0; k < 6; k++) {
    let x, y, ok = false, t = 0;
    while (!ok && t++ < 50) {
      x = rr(r, 300, C.W - 300); y = rr(r, 300, C.H - 300); ok = true;
      for (const s of W.stations) if (hy(s.x - x, s.y - y) < s.rad + 170) { ok = false; break; }
      if (ok) for (const a of W.rocks) if (hy(a.x - x, a.y - y) < a.rad + 100) { ok = false; break; }
    }
    if (ok) W.hulks.push(mkHulk(r, x, y, k));
  }
  for (let f = 0; f < 2; f++) {
    const fx = rr(r, 600, C.W - 600), fy = rr(r, 600, C.H - 600);
    for (let k = 0; k < 12; k++) addPick(fx + rr(r, -140, 140), fy + rr(r, -100, 100), pk(r, ['parts', 'fe', 'fe', 'ice']), ri(r, 1, 2), rr(r, -2, 2), rr(r, -2, 2));
  }
  W.bodies = [...W.rocks, ...W.stations, ...W.hulks];
  W.bg = background(r);
  return W;
}

/** spawn an extra derelict at runtime (sector events); persisted via W.extra */
export function spawnHulk(seed, x, y, name, vx, vy) {
  const r = rng(seed), b = mkHulk(r, x, y, 0, name);
  if (vx !== undefined) { b.vx = vx; b.vy = vy; }
  W.hulks.push(b); W.bodies.push(b);
  W.extra.push({ seed, x, y, name, vx: b.vx, vy: b.vy });
  return b;
}
