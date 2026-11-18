// ═══ world generation: band bodies, settlements, orbital infrastructure ═
import { TAU, cl, lp, hy, rng, pk, rr, ri, sh } from '../core/util.js';
import { C, PAL, MAT } from '../core/config.js';
import { W, setW } from '../core/state.js';
import { body, mkc, cw, pR, pF } from './body.js';
import { genMoon, surfR } from './moon.js';

export function addPick(x, y, t, q, vx = 0, vy = 0) {
  const p = { x, y, vx, vy, a: Math.random() * TAU, va: (Math.random() - 0.5) * 0.6, type: t, qty: q, r: 2.2 + q * 0.7, dead: false, rev: 0, age: 0 };
  W.picks.push(p);
  return p;
}

/** scanner contact anchored to a body (follows it if the body moves) */
export function addContact(r, kind, x, y, b, label) {
  const c = Math.cos(-b.a), s = Math.sin(-b.a), dx = x - b.x, dy = y - b.y;
  const ct = { x, y, b, kind, label, f: rr(r, 30, 190), ph: r() * TAU, done: false, hint: 0, lx: dx * c - dy * s, ly: dx * s + dy * c };
  W.contacts.push(ct);
  (b.contacts || (b.contacts = [])).push(ct);
  return ct;
}

/** world pose on a longitude/radius; bodies are turned so local -y points away from the Moon */
export const at = (th, r) => ({ x: Math.cos(th) * r, y: Math.sin(th) * r, a: th + Math.PI / 2 });

// ─── asteroids & comets ─────────────────────────────────────────────────
const TYPES = { rock: 'stony (S-type)', metal: 'metallic (M-type)', ice: 'carbonaceous / icy (C-type)', comet: 'cometary nucleus' };
export function mkRock(r, x, y, id, R, type, o = {}) {
  const gw = Math.ceil(R * 2) + 8, b = body('rock', x, y, gw, gw, C.CS, ri(r, 0, 1e9));
  b.uid = id; b.name = 'UNC-' + String(1000 + ((id * 7919) % 9000)); b.R = R; b.type = type; b.cat = 0; b.a = r() * TAU;
  b.origin = type === 'comet' ? pk(r, ['Oort cloud', 'Kuiper belt', 'Jupiter-family']) : pk(r, ['main belt', 'main belt', 'Hungaria group', 'near-Earth', 'Hilda group']);
  const c0 = gw / 2, p1 = r() * TAU, p2 = r() * TAU, h1 = ri(r, 2, 4), h2 = ri(r, 5, 8);
  const ell = type === 'comet' ? 0.75 : 1;
  const rad = t => R * (0.78 + 0.12 * Math.sin(t * h1 + p1) + 0.08 * Math.sin(t * h2 + p2)), orig = new Uint8Array(gw * gw);
  for (let cy = 0; cy < gw; cy++) for (let cx = 0; cx < gw; cx++) {
    const dx = cx - c0, dy = (cy - c0) / ell, d = hy(dx, dy);
    if (d < rad(Math.atan2(dy, dx))) {
      const i = cy * gw + cx; orig[i] = 1;
      const n = ((cx * 2654435761) ^ (cy * 40503) ^ b.seed) >>> 0;
      b.sol[i] = n % 100 < 22 ? 2 : 1;
      if (type === 'ice' && d > R * 0.62 && n % 100 < 70) b.sol[i] = 3;
      if (type === 'metal' && n % 100 < 30) b.sol[i] = 4;
      if (type === 'comet') b.sol[i] = n % 100 < 55 ? 3 : n % 100 < 82 ? 8 : 1;
    }
  }
  // nickel-iron veins
  for (let v = 0; v < ri(r, type === 'metal' ? 4 : 1, type === 'metal' ? 8 : 4); v++) {
    let vx = c0 + rr(r, -R * 0.5, R * 0.5), vy = c0 + rr(r, -R * 0.5, R * 0.5), va = r() * TAU;
    for (let s = 0; s < ri(r, 18, 50); s++) {
      va += rr(r, -0.5, 0.5); vx += Math.cos(va); vy += Math.sin(va);
      const cx = Math.round(vx), cy = Math.round(vy);
      if (cx < 1 || cy < 1 || cx >= gw - 1 || cy >= gw - 1) break;
      const i = cy * gw + cx; if (b.sol[i] && b.sol[i] !== 3) b.sol[i] = 4;
    }
  }
  // platinum-group pockets
  for (let p = 0; p < ri(r, type === 'metal' ? 2 : 0, type === 'metal' ? 5 : 2) + (o.rich ? 8 : 0); p++) {
    const px = Math.round(c0 + rr(r, -R * 0.45, R * 0.45)), py = Math.round(c0 + rr(r, -R * 0.45, R * 0.45));
    for (let k = 0; k < ri(r, 3, 8) + (o.rich ? 6 : 0); k++) {
      const cx = px + ri(r, -2, 2), cy = py + ri(r, -2, 2);
      if (cx > 0 && cy > 0 && cx < gw && cy < gw && b.sol[cy * gw + cx]) { b.sol[cy * gw + cx] = 5; b.veins.push(cy * gw + cx); }
    }
  }
  // rich bodies: platinum seams run up toward the crust (15–30 m down) all the way round, not just in the deep heart
  if (o.rich) for (let p = 0; p < 16; p++) {
    const t = (p / 16) * TAU + rr(r, -0.15, 0.15), d = rad(t) * rr(r, 0.7, 0.84), px = Math.round(c0 + Math.cos(t) * d), py = Math.round(c0 + Math.sin(t) * d * ell);
    for (let k = 0; k < 9; k++) {
      const cx = px + ri(r, -2, 2), cy = py + ri(r, -2, 2);
      if (cx > 0 && cy > 0 && cx < gw && cy < gw && b.sol[cy * gw + cx]) { b.sol[cy * gw + cx] = 5; b.veins.push(cy * gw + cx); }
    }
  }
  // surface craters (vapour plumes on comets)
  for (let c2 = 0; c2 < ri(r, 2, 5); c2++) {
    const t = r() * TAU, cr = ri(r, 3, 7), cd = rad(t) * 0.92, ccx = c0 + Math.cos(t) * cd, ccy = c0 + Math.sin(t) * cd * ell;
    for (let cy = Math.max(0, (ccy - cr) | 0); cy < Math.min(gw, ccy + cr); cy++)
      for (let cx = Math.max(0, (ccx - cr) | 0); cx < Math.min(gw, ccx + cr); cx++)
        if (hy(cx - ccx, cy - ccy) < cr && orig[cy * gw + cx]) { b.sol[cy * gw + cx] = 0; b.flr[cy * gw + cx] = 1; }
    if (type === 'ice' || type === 'comet') b.fog.push({ lx: (ccx - c0) * C.CS, ly: (ccy - c0) * C.CS, r: cr * C.CS * 1.5, ph: r() * TAU, jet: type === 'comet' ? t : null });
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
  // chambers: voids, crystal geodes, ice caverns, claim caches, core shards
  if (R >= 17) {
    const n = Math.min(5, 1 + Math.floor(R / 13));
    for (let i = 0; i < n; i++) {
      const t = r() * TAU, d = r() * R * 0.5;
      const ch = { cx: Math.round(c0 + Math.cos(t) * d), cy: Math.round(c0 + Math.sin(t) * d * ell), r: ri(r, 5, Math.min(14, R * 0.34)), biome: 'void', open: false, disc: false };
      if (o.claim && i === 0) { ch.biome = 'claim'; ch.r = Math.max(ch.r, 7); }
      else if (o.core && i === (o.claim ? 1 : 0)) { ch.biome = 'core'; ch.r = Math.max(ch.r, 5); }
      else if (o.rich && i === 0) { ch.biome = 'vug'; ch.r = Math.max(ch.r, 11); }
      else { const q = r(); ch.biome = type === 'ice' || type === 'comet' ? (q < 0.6 ? 'ice' : 'void') : q < 0.35 ? 'void' : q < 0.7 ? 'geode' : type === 'metal' ? 'vug' : 'ice'; }
      const f = { void: 1, ice: 5, geode: 7, vug: 7, claim: 8, core: 8 }[ch.biome];
      disc(ch.cx, ch.cy, ch.r, f);
      if (ch.biome === 'geode' || ch.biome === 'vug' || ch.biome === 'ice')
        for (let k = 0; k < ch.r * (ch.biome === 'vug' && o.rich ? 7 : 2.2); k++) {
          const t2 = r() * TAU, d2 = ch.r + rr(r, 0, ch.biome === 'vug' && o.rich ? 4 : 1.4), cx = Math.round(ch.cx + Math.cos(t2) * d2), cy = Math.round(ch.cy + Math.sin(t2) * d2);
          if (cx > 0 && cy > 0 && cx < gw && cy < gw && b.sol[cy * gw + cx]) b.sol[cy * gw + cx] = ch.biome === 'geode' ? 6 : ch.biome === 'vug' ? 5 : 3;
        }
      if (ch.biome === 'claim' || ch.biome === 'core') {
        b.lights.push({ lx: (ch.cx + 0.5 - c0) * C.CS, ly: (ch.cy + 0.5 - c0) * C.CS, c: ch.biome === 'claim' ? PAL.helion : PAL.cyan, r: 40, fl: true });
      }
      b.cham.push(ch);
    }
    for (let i = 1; i < b.cham.length; i++) if (b.cham[i].biome !== 'core' && b.cham[i - 1].biome !== 'core') path(b.cham[i - 1].cx, b.cham[i - 1].cy, b.cham[i].cx, b.cham[i].cy, 2, 1);
    const ch = b.cham.find(q => q.biome !== 'core' && q.biome !== 'claim' && !(o.rich && q.biome === 'vug'));
    if (ch && r() < 0.75) { const t = Math.atan2(ch.cy - c0, ch.cx - c0) + rr(r, -0.4, 0.4); path(ch.cx, ch.cy, c0 + Math.cos(t) * (R + 3), c0 + Math.sin(t) * (R + 3), ch.r >= 8 ? 8 : 3, 1); }
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
    if (!ch.open || ch.biome === 'claim' || ch.biome === 'core') ch.contact = addContact(r, ch.biome === 'claim' ? 'claim' : ch.biome === 'core' ? 'core' : ch.biome === 'vug' ? 'vug' : 'void', wp.x, wp.y, b,
      ch.biome === 'claim' ? 'structured transponder · sealed' : ch.biome === 'core' ? 'cold memory lattice · sealed' : ch.biome === 'vug' ? 'dense metal pocket' : 'hollow chamber · ' + ch.biome);
    const loot = { geode: [['ree', ri(r, 1, 3)]], ice: [['ice', ri(r, 2, 4)]], vug: [['pgm', ri(r, 1, 3)]], claim: [['parts', ri(r, 1, 3)], ['pgm', ri(r, 1, 2)]], core: [['core', 1]], void: r() < 0.4 ? [['fe', ri(r, 1, 2)]] : [] }[ch.biome] || [];
    for (const [g, q] of loot) {
      const p = addPick(wp.x + rr(r, -6, 6), wp.y + rr(r, -6, 6), g, q);
      const c = Math.cos(-b.a), sn = Math.sin(-b.a), dx = p.x - b.x, dy = p.y - b.y;
      p.home = b; p.hx = dx * c - dy * sn; p.hy = dx * sn + dy * c;   // carried with the rock while out of sim range
    }
  }
  if (b.veins.length > 3) { const v = cw(b, b.veins[0] % gw, (b.veins[0] / gw) | 0); addContact(r, 'vein', v.x, v.y, b, 'platinum-group concentration'); }
  for (let cy = 0; cy < gw; cy++) for (let cx = 0; cx < gw; cx++) { pR(b, cx, cy); pF(b, cx, cy); }
  for (let cy = 1; cy < gw - 1; cy++) for (let cx = 1; cx < gw - 1; cx++) {
    const i = cy * gw + cx; if (!b.flr[i]) continue;
    let col = null;
    if (b.sol[i - 1] === 6 || b.sol[i + 1] === 6 || b.sol[i - gw] === 6 || b.sol[i + gw] === 6) col = PAL.mag;
    else if (b.sol[i - 1] === 5 || b.sol[i + 1] === 5) col = r() < 0.3 ? PAL.gold : null;
    else if (b.flr[i] === 5 && r() < 0.05) col = PAL.ice;
    if (col) b.glow.push({ lx: (cx + 0.5 - c0) * C.CS, ly: (cy + 0.5 - c0) * C.CS, c: col, r: rr(r, 5, 12), leak: !!open[i] });
  }
  // composition summary — what a catalog survey reveals
  const comp = {}; let tot = 0;
  for (let i = 0; i < b.sol.length; i++) { const m = b.sol[i]; if (!m) continue; tot++; const ore = MAT[m].ore || 'rock'; comp[ore] = (comp[ore] || 0) + 1; }
  b.comp = comp; b.cells = tot; b.typeN = TYPES[type];
  b.rad = R * C.CS + 10;
  return b;
}

// ─── station construction kit ────────────────────────────────────────────
function wall(b, x, y, w, h) { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) if (cx === x || cy === y || cx === x + w - 1 || cy === y + h - 1) b.sol[cy * b.gw + cx] = 7; }
function block(b, x, y, w, h, m = 7) { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) if (cx >= 0 && cy >= 0 && cx < b.gw && cy < b.gh) b.sol[cy * b.gw + cx] = m; }
function fill(b, x, y, w, h, f) { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) b.flr[cy * b.gw + cx] = f; }
function doorH(b, x, y, w) { for (let cx = x; cx < x + w; cx++) { b.sol[y * b.gw + cx] = 0; b.flr[y * b.gw + cx] = 2; } }
function doorV(b, x, y, h) { for (let cy = y; cy < y + h; cy++) { b.sol[cy * b.gw + x] = 0; b.flr[cy * b.gw + x] = 2; } }
function mouth(b, x, y, w, h) { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) { const i = cy * b.gw + cx; b.sol[i] = 0; b.flr[i] = 3; } }
function room(b, x, y, w, h, kind, name) {
  wall(b, x, y, w, h);
  b.rooms.push({ x, y, w, h, kind, name }); fill(b, x + 1, y + 1, w - 2, h - 2, 2);
  const col = { bar: PAL.amber, home: PAL.amber, crew: PAL.gold, catalog: PAL.cyan, market: PAL.gold, yard: PAL.green, lift: PAL.cyan, workshop: PAL.ember, cargo: PAL.amber }[kind] || PAL.amber;
  b.lights.push({ lx: (x + w / 2) * b.cs - (b.gw * b.cs) / 2, ly: (y + h / 2) * b.cs - (b.gh * b.cs) / 2, c: col, r: Math.max(w, h) * b.cs * 0.75, fl: false });
}
function port(b, cx, cy, dir, berth) { b.ports.push({ cx, cy, dir, berth: !!berth, occ: null }); }
function pad(b, cx, cy, dir, name) { b.pads.push({ cx, cy, dir, occ: null, name: name || 'PAD ' + (b.pads.length + 1) }); }
const lc = (b, cx, cy) => ({ lx: (cx + 0.5) * b.cs - (b.gw * b.cs) / 2, ly: (cy + 0.5) * b.cs - (b.gh * b.cs) / 2 });

function paintSt(b, r) {
  mkc(b);
  for (let cy = 0; cy < b.gh; cy++) for (let cx = 0; cx < b.gw; cx++) {
    const i = cy * b.gw + cx;
    if (b.flr[i]) {
      const n = ((cx * 73856093 ^ cy * 19349663 ^ b.seed) >>> 0) % 100;
      b.rc.fillStyle = cx % 7 === 0 || cy % 7 === 0 ? '#2c3642' : sh(b.surf ? '#4a4640' : '#38434f', 0.9 + n / 400); b.rc.fillRect(cx, cy, 1, 1);
      if (b.flr[i] === 2 && n < 6) { b.rc.fillStyle = '#ffb347'; b.rc.fillRect(cx, cy, 1, 1); }
    }
    pF(b, cx, cy);
    if (b.sol[i]) { pR(b, cx, cy); b.fc.fillStyle = '#2a333f'; b.fc.fillRect(cx, cy, 1, 1); }
  }
  for (const rm of b.rooms) for (let cy = rm.y + 2; cy < rm.y + rm.h - 2; cy++) for (let cx = rm.x + 2; cx < rm.x + rm.w - 2; cx++) {
    const n = ((cx * 2654435761 ^ cy * 40503 ^ b.seed) >>> 0) % 100, k = rm.kind;
    if (k === 'market' && cy % 4 === 1 && cx % 3 !== 0) { b.fc.fillStyle = n < 50 ? '#8a6a2f' : '#1f6f8f'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'bar' && n < 8) { b.fc.fillStyle = '#c96f2f'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'catalog' && cy % 3 === 0 && cx % 2 === 0) { b.fc.fillStyle = n < 40 ? '#1f6f8f' : '#2f4f6f'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'crew' && cy % 4 === 2 && n < 60) { b.fc.fillStyle = '#6b5a3f'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'home' && n < 10) { b.fc.fillStyle = n < 4 ? '#4f8f5a' : '#5a4f6b'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'cargo' && n < 14) { b.fc.fillStyle = n < 7 ? '#8a6a2f' : '#5a5148'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'yard' && cy % 5 === 0) { b.fc.fillStyle = '#41546b'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'workshop' && cy % 4 === 2 && cx % 2 === 0) { b.fc.fillStyle = '#41546b'; b.fc.fillRect(cx, cy, 1, 1); }
    else if (k === 'lift' && (cx === ((rm.x + rm.w / 2) | 0))) { b.fc.fillStyle = '#53d9ff'; b.fc.fillRect(cx, cy, 1, 1); }
  }
  for (const p of b.pads) {
    for (let t = -4; t <= 4; t++) { b.rc.fillStyle = Math.abs(t) === 4 || t === 0 ? '#ffd166' : '#6b6156'; b.rc.fillRect(p.cx + t, p.cy, 1, 1); }
  }
  for (let k = 0; k < (b.crewN ?? ri(r, 6, 11)); k++) {
    const rm = b.rooms[ri(r, 0, b.rooms.length - 1)]; if (!rm) break;
    b.crew.push({
      lx: (rm.x + 2 + r() * (rm.w - 4)) * b.cs - (b.gw * b.cs) / 2, ly: (rm.y + 2 + r() * (rm.h - 4)) * b.cs - (b.gh * b.cs) / 2,
      tx: 0, ty: 0, rm, c: pk(r, ['#d8e2ec', '#ffb347', '#53d9ff', '#8cff9e']), sp: rr(r, 3, 7), t: r() * 4, ag: null,
    });
  }
  b.sol0 = b.sol.slice(); b.flr0 = b.flr.slice();
}

/** market table: [stock, consumption/min, production/min, price multiplier] */
const ECON = {
  selene: { ice: [80, 0.5, 0, 1], fe: [60, 0.3, 0, 0.95], vol: [20, 0.15, 0, 1], pgm: [10, 0.05, 0, 0.9], ree: [6, 0.04, 0, 0.9], food: [60, 0.6, 0, 1.35], parts: [70, 0.2, 0.2, 1], fuel: [220, 0.5, 0.3, 1.1], core: [0, 0, 0, 1] },
  vulcan: { ice: [60, 1.2, 0, 1.15], fe: [80, 1.4, 0, 1.3], vol: [30, 0.4, 0, 1.1], pgm: [14, 0.1, 0, 1.05], ree: [4, 0.02, 0, 0.8], food: [30, 0.3, 0, 1.2], parts: [90, 0, 0.6, 0.85], fuel: [300, 0, 1.6, 0.7], core: [0, 0, 0, 0.5] },
  mars: { ice: [40, 2.2, 0, 1.6], fe: [40, 0.4, 0, 1.0], vol: [16, 1.0, 0, 1.7], pgm: [8, 0.05, 0, 1.0], ree: [6, 0.05, 0, 1.05], food: [40, 1.0, 0, 1.4], parts: [30, 0.3, 0, 1.2], fuel: [180, 0.5, 0, 1.0], core: [0, 0, 0, 0.6] },
  earth: { ice: [60, 0.2, 0, 0.8], fe: [60, 0.2, 0, 0.8], vol: [12, 0.1, 0, 0.9], pgm: [6, 0.6, 0, 1.55], ree: [3, 0.5, 0, 1.6], food: [30, 0.2, 0, 1.2], parts: [50, 0.1, 0, 1.0], fuel: [160, 0.4, 0, 1.0], core: [0, 0, 0, 0.6] },
  depot: { ice: [30, 2.6, 0, 2.1], fe: [40, 1.0, 0, 1.6], vol: [14, 0.8, 0, 1.6], pgm: [6, 0.05, 0, 0.9], ree: [4, 0.04, 0, 0.9], food: [120, 0, 1.2, 0.6], parts: [70, 0.3, 0.2, 0.9], fuel: [200, 0.2, 0.6, 1.0], core: [0, 0, 0, 0.6] },
  tycho: { ice: [30, 1.4, 0, 1.8], fe: [30, 1.6, 0, 1.9], vol: [10, 0.4, 0, 1.4], pgm: [10, 0.3, 0, 1.25], ree: [6, 0.2, 0, 1.2], food: [60, 0.4, 0.4, 0.8], parts: [100, 0, 1.0, 0.65], fuel: [160, 0.2, 0.4, 1.0], core: [0, 0, 0, 0.6] },
};
function econ(r, type) {
  const D = ECON[type], e = {};
  for (const g in D) { const [s, c, p, m] = D[g]; e[g] = { stock: Math.round(s * rr(r, 0.75, 1.25)), cons: c, prod: p, hist: [], ref: Math.max(4, s), mul: m, mod: 1 }; }
  return e;
}
function mkSt(r, kind, x, y, a, gw, gh, cs, name, fac, type) {
  const b = body('station', x, y, gw, gh, cs, ri(r, 0, 1e9));
  b.a = a; b.name = name; b.fac = fac; b.type = type; b.econ = ECON[type] ? econ(r, type) : null; b.berths = 0; b.tabs = ['market', 'service', 'bar'];
  return b;
}

// ─── orbital infrastructure ─────────────────────────────────────────────
export function mkSelene(r, th) {
  const p = at(th, C.RS), b = mkSt(r, 'station', p.x, p.y, p.a, 96, 46, C.TS, 'SELENE HIGH', 'selene', 'selene');
  b.tabs = ['market', 'service', 'crew', 'yard', 'catalog', 'bar']; b.yard = ['wren'];
  fill(b, 3, 3, 90, 40, 3); wall(b, 2, 2, 92, 42);
  room(b, 2, 2, 20, 21, 'crew', 'CREW OFFICE'); room(b, 21, 2, 20, 21, 'market', 'EXCHANGE'); room(b, 40, 2, 19, 21, 'catalog', 'CATALOG OFFICE');
  room(b, 58, 2, 19, 21, 'bar', 'THE TERMINATOR'); room(b, 76, 2, 18, 21, 'yard', 'SHIPYARD');
  fill(b, 3, 23, 90, 5, 2);
  room(b, 2, 28, 38, 16, 'cargo', 'CARGO HOLD'); room(b, 39, 28, 18, 16, 'lift', 'LIFT DOCK'); room(b, 56, 28, 38, 16, 'workshop', 'WORKSHOP');
  for (const x of [10, 30, 48, 66, 84]) doorH(b, x, 22, 3);
  for (const x of [20, 47, 74]) doorH(b, x, 28, 3);
  mouth(b, 47, 43, 2, 1);                               // cable socket
  mouth(b, 2, 23, 1, 5); mouth(b, 93, 23, 1, 5);        // corridor airlocks
  port(b, 93, 10, 0, true); port(b, 93, 36, 0, true); port(b, 2, 10, Math.PI); port(b, 2, 36, Math.PI);
  pad(b, 30, 2, -Math.PI / 2, 'TOP PAD A'); pad(b, 66, 2, -Math.PI / 2, 'TOP PAD B');
  for (let cx = 8; cx < 92; cx += 12) b.lights.push({ ...lc(b, cx, 25), c: PAL.amber, r: 30, fl: false });
  b.liftDock = lc(b, 47.5, 37); b.cableTop = lc(b, 47.5, 44.5);
  paintSt(b, r);
  return b;
}
export function mkRefinery(r, th, rad) {
  const p = at(th, rad), b = mkSt(r, 'station', p.x, p.y, p.a, 84, 44, C.TS, 'VULCAN REFINERY', 'selene', 'vulcan');
  wall(b, 4, 4, 60, 36); fill(b, 5, 5, 58, 34, 3); mouth(b, 4, 14, 1, 14);
  for (const [tx, ty, tr] of [[73, 9, 6], [73, 35, 6]])   // tanks flank berth 0 — keep its bay wide enough for a hull
    for (let cy = ty - tr; cy <= ty + tr; cy++) for (let cx = tx - tr; cx <= tx + tr; cx++)
      if (hy(cx - tx, cy - ty) < tr && cx > 0 && cy > 0 && cx < b.gw && cy < b.gh) b.sol[cy * b.gw + cx] = 7;
  room(b, 40, 26, 24, 14, 'workshop', 'SMELTER CONTROL'); room(b, 40, 4, 24, 12, 'market', 'ORE INTAKE');
  doorV(b, 40, 31, 3); doorV(b, 40, 9, 3);
  block(b, 14, 18, 3, 8); block(b, 26, 18, 3, 8);
  port(b, 64, 21, 0); port(b, 4, 8, Math.PI); port(b, 4, 34, Math.PI);
  pad(b, 22, 4, -Math.PI / 2, 'INTAKE PAD'); pad(b, 22, 39, Math.PI / 2, 'UNDER PAD');
  b.lights.push({ ...lc(b, 22, 22), c: PAL.ember, r: 80, fl: true });
  paintSt(b, r);
  return b;
}
const DEST = { mars: { n: 'ARES TRANSIT', d: 'Mars-bound transfer ship', fac: 'transit' }, earth: { n: 'GAIA RETURN', d: 'Earth-bound transfer ship', fac: 'transit' } };
export function mkTransfer(r, th, rad, dest, gen = 1) {
  const p = at(th, rad), D = DEST[dest];
  const b = mkSt(r, 'station', p.x, p.y, p.a, 74, 20, C.TS, D.n + (gen > 1 ? ' ' + ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][gen % 10] : ''), D.fac, dest);
  b.transfer = { dest, gen, depart: 0 }; b.tabs = ['market', 'service', 'bar']; b.crewN = 5;
  block(b, 0, 5, 8, 10); for (let cy = 6; cy < 14; cy += 3) block(b, 0, cy, 1, 2, 0);
  room(b, 7, 6, 52, 8, 'cargo', 'CARGO SPINE'); room(b, 58, 3, 14, 14, 'bar', 'TRANSIT HAB');
  doorV(b, 58, 9, 2);
  for (const x0 of [11, 25, 47]) { block(b, x0, 1, 6, 5); block(b, x0, 14, 6, 5); }
  port(b, 20, 6, -Math.PI / 2); port(b, 40, 6, -Math.PI / 2); port(b, 39, 13, Math.PI / 2); port(b, 72, 9, 0);   // #2 centred between the cargo blocks
  mouth(b, 7, 9, 1, 2);
  b.lights.push({ ...lc(b, 3, 10), c: PAL.ember, r: 40, fl: false });
  paintSt(b, r);
  return b;
}

// ─── surface settlements (stand on the regolith; local +y points down) ──
/** pose a surface body so its floor row `fr` sits flush with the regolith */
function surfPose(th, gh, cs, fr) { const S = surfR(th); return at(th, S + fr * cs - (gh * cs) / 2); }
export function mkHab(r, th) {
  const p = surfPose(th, 10, 3, 9), b = mkSt(r, 'station', p.x, p.y, p.a, 18, 10, 3, 'HAB 14', 'rim', 'hab');
  b.surf = true; b.tabs = ['home']; b.crewN = 0;
  room(b, 1, 1, 16, 9, 'home', 'HAB 14 · YOUR BUNK'); doorV(b, 16, 6, 3); doorV(b, 1, 6, 3);
  b.lights.push({ ...lc(b, 9, 3), c: PAL.amber, r: 30, fl: false });
  paintSt(b, r); b.econ = null;
  return b;
}
export function mkLiftTerm(r, th) {
  const p = surfPose(th, 20, 3, 19), b = mkSt(r, 'station', p.x, p.y, p.a, 20, 20, 3, 'SELENE LIFT · GROUND', 'selene', 'lift');
  b.surf = true; b.tabs = ['bar']; b.crewN = 2;
  room(b, 2, 9, 16, 11, 'lift', 'LIFT HALL'); block(b, 8, 0, 1, 10); block(b, 11, 0, 1, 10); doorH(b, 9, 9, 2);
  doorV(b, 2, 15, 4); doorV(b, 17, 15, 4);
  b.liftDock = lc(b, 9.5, 16); b.cableTop = lc(b, 9.5, -0.5);
  b.lights.push({ ...lc(b, 9.5, 2), c: PAL.cyan, r: 26, fl: true });
  paintSt(b, r); b.econ = null;
  return b;
}
export function mkDepot(r, th) {
  const p = surfPose(th, 12, 3, 11), b = mkSt(r, 'station', p.x, p.y, p.a, 66, 12, 3, 'SHACKLETON DEPOT', 'rim', 'depot');
  b.surf = true; b.tabs = ['market', 'service', 'yard', 'bar']; b.yard = ['hare'];
  room(b, 1, 1, 14, 11, 'market', 'COLONY EXCHANGE'); room(b, 14, 1, 16, 11, 'yard', 'LANDER YARD');
  doorV(b, 1, 8, 3); doorV(b, 29, 8, 3); doorV(b, 14, 8, 3);
  block(b, 34, 10, 30, 1);
  pad(b, 42, 10, -Math.PI / 2, 'PAD 1'); pad(b, 56, 10, -Math.PI / 2, 'PAD 2');
  for (const x of [35, 49, 63]) b.lights.push({ ...lc(b, x, 8), c: PAL.gold, r: 22, fl: false });
  paintSt(b, r);
  return b;
}
export function mkTycho(r, th) {
  const p = surfPose(th, 12, 3, 11), b = mkSt(r, 'station', p.x, p.y, p.a, 48, 12, 3, 'TYCHO WORKS', 'rim', 'tycho');
  b.surf = true; b.tabs = ['market', 'service', 'bar'];
  room(b, 1, 1, 20, 11, 'workshop', 'FOUNDRY'); doorV(b, 20, 8, 3); doorV(b, 1, 8, 3);
  block(b, 24, 10, 22, 1); pad(b, 30, 10, -Math.PI / 2, 'TYCHO PAD 1'); pad(b, 41, 10, -Math.PI / 2, 'TYCHO PAD 2');
  b.lights.push({ ...lc(b, 10, 6), c: PAL.ember, r: 40, fl: true });
  paintSt(b, r);
  return b;
}

// ─── backdrop ────────────────────────────────────────────────────────────
function background(r) {
  const stars = [];
  for (let L = 0; L < 2; L++) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    for (let k = 0; k < [220, 120][L]; k++) {
      const q = r();
      x.fillStyle = q < 0.7 ? `rgba(216,226,236,${rr(r, 0.3, 0.9)})` : q < 0.85 ? `rgba(168,236,255,${rr(r, 0.3, 0.8)})` : `rgba(255,209,150,${rr(r, 0.25, 0.7)})`;
      const big = L === 1 && r() < 0.3;
      x.fillRect((r() * 512) | 0, (r() * 512) | 0, big ? 2 : 1, big ? 2 : 1);
    }
    stars.push(c);
  }
  const earth = document.createElement('canvas'); earth.width = earth.height = 128; const ex = earth.getContext('2d');
  ex.fillStyle = '#1d4f8f'; ex.beginPath(); ex.arc(64, 64, 60, 0, TAU); ex.fill();
  for (let k = 0; k < 9; k++) { ex.fillStyle = 'rgba(80,140,80,.75)'; ex.beginPath(); ex.ellipse(30 + r() * 70, 30 + r() * 70, rr(r, 8, 22), rr(r, 5, 14), r() * TAU, 0, TAU); ex.fill(); }
  for (let k = 0; k < 16; k++) { ex.fillStyle = 'rgba(240,248,255,.55)'; ex.beginPath(); ex.ellipse(10 + r() * 108, 10 + r() * 108, rr(r, 6, 26), rr(r, 2, 6), r() * TAU, 0, TAU); ex.fill(); }
  ex.globalCompositeOperation = 'destination-in'; ex.beginPath(); ex.arc(64, 64, 60, 0, TAU); ex.fill(); ex.globalCompositeOperation = 'source-over';
  return { stars, earth };
}

// ─── the world ───────────────────────────────────────────────────────────
export const SITES = {};
export function genWorld(seed) {
  const r = rng(seed), T0 = C.TH0, u = d => d / C.RM;
  setW({
    seed, bodies: [], rocks: [], stations: [], ships: [], picks: [], bits: [], deb: [], contacts: [], feed: [],
    heat: [], meteors: [], beacons: [], suits: [], lift: null, aid: 200, nav: null, time: 0, extra: [], flare: null,
    stats: { mined: 0, earned: 0, found: 0, docked: 0, catalogued: 0, shifts: 0, delivered: 0, launches: 0, landings: 0, events: 0, eva: 0, lifts: 0 }, bg: null,
  });
  // settlement longitudes
  const thHab = T0 - u(150), thLift = T0, thDepot = T0 + u(175), thTycho = T0 + 0.62;
  genMoon(seed, [{ th: T0 + u(70), half: 330 }, { th: thTycho + u(10), half: 170, lvl: -6 }]);
  const hab = mkHab(r, thHab), lift = mkLiftTerm(r, thLift), depot = mkDepot(r, thDepot), tycho = mkTycho(r, thTycho);
  const sel = mkSelene(r, T0), vul = mkRefinery(r, T0 + 0.3, C.RS + 70);
  const ares = mkTransfer(r, T0 - 0.42, C.RS + 130, 'mars'), gaia = mkTransfer(r, T0 + 0.56, C.RS - 90, 'earth');
  W.stations.push(sel, vul, ares, gaia, depot, tycho, lift, hab);
  Object.assign(SITES, { hab, lift, depot, tycho, sel, vul, ares, gaia });
  W.lift = { term: lift, top: sel, car: { t: 0, v: 0, dir: 0, at: 'ground', ride: false, wait: 0, x: 0, y: 0 } };
  // asteroid and comet population, parked by automated haul engines
  const clusters = [[-0.2, 9], [-0.6, 8], [0.16, 9], [0.42, 7], [0.82, 7], [-0.95, 5], [1.05, 4], [-1.35, 4], [1.5, 3]];
  let id = 0;
  const free = (x, y, rad) => {
    for (const s of W.stations) if (!s.surf && hy(s.x - x, s.y - y) < s.rad + rad + 140) return false;
    for (const a of W.rocks) if (hy(a.x - x, a.y - y) < a.rad + rad + 36) return false;
    return Math.abs(Math.hypot(x, y) - C.RS) < C.BAND;
  };
  const cores = new Set([2, 9, 17]), claims = new Set([4, 12, 21]);
  for (const [dth, n] of clusters) for (let k = 0; k < n; k++) {
    const big = r() < 0.18, R = big ? rr(r, 34, 48) : r() < 0.5 ? rr(r, 18, 33) : rr(r, 8, 17);
    let x, y, ok = false, t = 0;
    while (!ok && t++ < 40) {
      const th = T0 + dth + rr(r, -0.1, 0.1), rad = C.RS + rr(r, -C.BAND + 60, C.BAND - 60);
      x = Math.cos(th) * rad; y = Math.sin(th) * rad; ok = free(x, y, R * C.CS);
    }
    if (!ok) continue;
    const type = r() < 0.24 ? 'ice' : r() < 0.22 ? 'metal' : 'rock';
    const o = {};
    if (R >= 17 && cores.has(id)) o.core = true;
    if (R >= 17 && claims.has(id)) o.claim = true;
    const b = mkRock(r, x, y, id++, R, type, o);
    if (r() < 0.2) b.va = rr(r, -0.025, 0.025);
    W.rocks.push(b);
  }
  // guarantee story contacts exist even if the random sizes skipped them
  const need = (kind, n) => { let have = W.contacts.filter(c => c.kind === kind).length; for (const b of W.rocks) { if (have >= n) break; if (b.R < 20 || b.cham.some(q => q.biome === 'core' || q.biome === 'claim')) continue; W.contacts = W.contacts.filter(c => c.b !== b); W.picks = W.picks.filter(p => hy(p.x - b.x, p.y - b.y) > b.rad); /* clear the old rock's loot BEFORE the replacement adds its own */ const nb = mkRock(r, b.x, b.y, b.uid, b.R, b.type, { [kind]: true }); nb.va = b.va; W.rocks[W.rocks.indexOf(b)] = nb; have = W.contacts.filter(c => c.kind === kind).length; } };
  need('core', 3); need('claim', 3);
  // three comets, freshly parked, still venting
  for (const dth of [-0.3, 0.7, -0.8]) {
    const th = T0 + dth, rad = C.RS + rr(r, 160, 300), x = Math.cos(th) * rad, y = Math.sin(th) * rad;
    if (!free(x, y, 40 * C.CS)) continue;
    const b = mkRock(r, x, y, id++, rr(r, 22, 32), 'comet'); b.va = rr(r, -0.01, 0.01); W.rocks.push(b);
  }
  // the Orphan: a huge metallic body nobody admits to owning
  {
    const th = T0 + 1.24, rad = C.RS + 230, b = mkRock(r, Math.cos(th) * rad, Math.sin(th) * rad, 777, 52, 'metal', { rich: true, claim: true });
    b.orphan = true; b.hidden = true; b.va = 0.006; W.rocks.push(b); W.orphan = b;
  }
  // a little loose drift near the station
  for (let k = 0; k < 8; k++) { const th = T0 + rr(r, -0.06, 0.06), rad = C.RS + rr(r, -200, 200); addPick(Math.cos(th) * rad, Math.sin(th) * rad, pk(r, ['fe', 'ice', 'parts']), ri(r, 1, 2)); }
  W.bodies = [...W.rocks, ...W.stations];
  W.bg = background(r);
  return W;
}

/** a body hauled in at runtime (inbound haul event); persisted via W.extra */
export function spawnRock(seed, x, y, R, type, vx, vy) {
  const r = rng(seed), b = mkRock(r, x, y, 2000 + W.extra.length, R, type);
  b.vx = vx || 0; b.vy = vy || 0;
  W.rocks.push(b); W.bodies.push(b);
  W.extra.push({ seed, x, y, R, type, done: false });
  return b;
}
export function replaceTransfer(old, gen) {
  const r = rng((W.seed ^ (gen * 7717)) >>> 0), th = Math.atan2(old.y0 ?? old.y, old.x0 ?? old.x), rad = old.r0 || Math.hypot(old.x, old.y);
  const b = mkTransfer(r, th, rad, old.transfer.dest, gen);
  return b;
}
