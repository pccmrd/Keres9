// ═══ named NPC crews: traders, miners, raiders, patrols, scavengers ═════
import { cl, hy, ad, ds, rng, pk, rr, ri } from './core/util.js';
import { C, PAL } from './core/config.js';
import { W, G, pl, AG, setAG } from './core/state.js';
import { ca, segBlock } from './world/body.js';
import { mkShip, dock, anchor, undock, cadd, integ, stats } from './ships.js';
import { drive } from './player.js';
import { AU } from './audio.js';
import { feed, addRep, price, npcTrade, bestBuy, bestSell, freePort } from './economy.js';
import { mkJobs, complete, story } from './missions.js';
import { toast } from './ui.js';

export const NAMES = ['Mara Voss', 'Dov Karr', 'Ilya Odell', 'Sena Mbeki', 'Kesh Sato', 'Ruta Renn', 'Vann Halvard', 'Oksana Quill', 'Bek Ibarra', 'Toma Novak',
  'Grigor Dey', 'Nadia Strand', 'Yusuf Kova', 'Lena Ash', 'Ravi Ferro', 'Anka Lane', 'Juno Pell', 'Cass Merrow', 'Teo Brandt', 'Ines Kaur', 'Odo Varga',
  'Rhea Sol', 'Piet Lund', 'Mika Oyelaran', 'Saul Teague', 'Zara Holm', 'Emre Tal', 'Fen Castile'];
const sum = o => Object.values(o).reduce((x, y) => x + y, 0);
export const nextId = () => (W.aid = (W.aid || 200) + 1);

export function mkAgent(r, role, fac, x, y, id, name) {
  const a = {
    id, name: name || NAMES[id % NAMES.length], role, fac, credits: ri(r, 600, 2400), cargo: {},
    greed: rr(r, 0.2, 0.95), caution: rr(r, 0.2, 0.95), grudge: 0, favor: 0, state: 'idle', timer: 0, goal: null, tgt: null, home: null,
    alive: true, lost: 0, ship: null, kills: 0,
  };
  a.ship = mkShip(role, fac, a.name, x, y); a.ship.ag = a;
  if (role === 'trader') a.cargo = { fe: ri(r, 4, 14), food: ri(r, 2, 8) };
  if (role === 'miner') a.cargo = { fe: ri(r, 2, 10) };
  if (role === 'pirate') a.cargo = { stims: ri(r, 0, 4) };
  AG.push(a);
  return a;
}

export function initAgents() {
  setAG([]);
  const r = rng(W.seed ^ 0x5eed), [A, H, S, P2] = W.stations;
  const spec = [['trader', 'coop', A], ['trader', 'coop', H], ['trader', 'miners', S], ['trader', 'scrappers', P2], ['trader', 'coop', A],
    ['miner', 'miners', S], ['miner', 'miners', S], ['miner', 'miners', A], ['miner', 'miners', H], ['pirate', 'kings', null], ['pirate', 'kings', null],
    ['pirate', 'kings', null], ['pirate', 'kings', null], ['security', 'coop', A], ['security', 'coop', H], ['scav', 'scrappers', P2], ['scav', 'scrappers', H]];
  spec.forEach(([role, fac, home], i) => {
    const a = mkAgent(r, role, fac, home ? home.x + rr(r, -400, 400) : rr(r, 800, C.W - 800), home ? home.y + rr(r, -350, 350) : rr(r, 800, C.H - 800), i);
    a.home = role === 'pirate' ? null : home || P2;
  });
  for (let k = 0; k < 4; k++) { const a = AG[k], p = freePort(A, true); if (p) { dock(a.ship, A, p, 'port', true); a.state = 'trade'; a.timer = rr(r, 4, 20); } }
  W.hideouts.forEach((h, i) => {
    const a = { id: 100 + i, name: ['Fence Okonkwo', 'Quiet Rell'][i % 2], role: 'fence', fac: 'kings', credits: 4000, cargo: {}, greed: 0.9, caution: 0.7, grudge: 0, favor: 0, state: 'fence', alive: true, ship: null, home: null };
    AG.push(a);
    h.b.crew.push({ lx: h.x - h.b.x, ly: h.y - h.b.y, tx: 0, ty: 0, rm: null, c: PAL.mag, sp: 0, t: 0, ag: a });
  });
  for (const st of W.stations) mkJobs(st);
  feed('Shift begins. Keres Mutual shows 25,000₡ against your hull.', 'warn');
  feed('Void Kings working the far belt. Patrols are thin.', 'bad');
}

/** NPC autopilot: velocity-matched approach with simple look-ahead avoidance */
export function steer(s, x, y, dt, face) {
  const dx = x - s.x, dy = y - s.y, d = hy(dx, dy) || 1, w = cl(d * 0.32, 0, 62);
  let ux = dx / d, uy = dy / d;
  s._av = (s._av || 0) - dt;
  if (s._av <= 0) {
    s._av = 0.45; s._avd = null;
    const v = hy(s.vx, s.vy);
    if (v > 6) {
      const L = Math.min(260, v * 3 + 30), bx = s.x + (s.vx / v) * L, by = s.y + (s.vy / v) * L;
      const blk = segBlock(s.x, s.y, bx, by, 6);
      if (blk) { const sx = s.x - blk.x, sy = s.y - blk.y, q = hy(sx, sy) || 1; s._avd = { x: sx / q, y: sy / q }; }
    }
  }
  if (s._avd) { ux = ux * 0.4 + s._avd.x; uy = uy * 0.4 + s._avd.y; const q = hy(ux, uy) || 1; ux /= q; uy /= q; }
  drive(s, ux * w - s.vx, uy * w - s.vy);
  const fa = face === undefined ? Math.atan2(dy, dx) : face;
  s.tqi = cl(ad(fa, s.a) * 2.4 - s.va * 1.4, -1, 1);
  s.thr = d > 420 && Math.abs(ad(fa, s.a)) < 0.25 && !s._avd ? 0.55 : 0;
  return d;
}

export function npcScoop(s) {
  for (const p of W.picks) {
    if (p.dead || p.held || hy(p.x - s.x, p.y - s.y) > 15) continue;
    if (p.type === 'pod') {
      p.dead = true;
      if (p.ag) { p.ag.state = 'hand'; p.ag.role = 'hand'; p.ag.ship = null; p.ag.lost = 0; feed(p.ag.name + ' pulled from a pod by ' + s.name, 'good'); }
      continue;
    }
    const t = cadd(s, p.type, p.qty);
    if (t > 0) { p.qty -= t; if (p.qty <= 0) p.dead = true; if (s.ag) s.ag.cargo[p.type] = (s.ag.cargo[p.type] || 0) + t; }
  }
}

function prey(a) {
  let best = null, bs = -1;
  for (const o of AG) {
    if (o === a || o.role === 'pirate' || o.role === 'security' || !o.ship || o.ship.dead || o.distress) continue;
    const d = ds(o.ship, a.ship); if (d > 2600) continue;
    const sc = sum(o.cargo) * 3 - d / 90;
    if (sc > bs) { bs = sc; best = o; }
  }
  if (pl && !pl.dead && G.mode === 'play' && ds(pl, a.ship) < 1900) {
    const sc = sum(pl.cargo) * 3.4 - ds(pl, a.ship) / 90 + (G.rep.kings < -20 ? 18 : 0);
    if (sc > bs) best = { ship: pl, isPl: true, name: 'KITE' };
  }
  return best;
}
const nearestPirate = (s, r) => AG.find(o => o.role === 'pirate' && o.ship && !o.ship.dead && ds(o.ship, s) < r);

export function agents(dt) {
  G._a += dt;
  const co = G._a >= 0.6, cd = G._a;
  if (co) G._a = 0;
  for (const a of AG) {
    if (!a.alive || a.role === 'fence') continue;
    // station hands save up and eventually buy a hull
    if (a.role === 'hand') {
      if (co) {
        a.credits += 4 * cd; a.timer += cd;
        if (a.credits > 1500 && a.timer > 90) {
          const role = a.grudge > 4 ? 'pirate' : a.caution > 0.5 ? 'miner' : 'trader', st = a.home || W.stations[0];
          const n = mkAgent(rng(W.seed + a.id * 77), role, role === 'pirate' ? 'kings' : st.fac, st.x + rr(Math.random, -200, 200), st.y + 190, nextId(), a.name);
          n.grudge = a.grudge; n.favor = a.favor; n.credits = a.credits - 1200; n.home = role === 'pirate' ? null : st; a.alive = false;
          feed(a.name + ' scraped together a hull and went back out' + (role === 'pirate' ? ' — and not friendly' : ''), role === 'pirate' ? 'bad' : 'good');
        }
      }
      continue;
    }
    if (!a.ship || a.ship.dead) {
      if (co) a.lost += cd;
      if (a.lost > 240) {
        a.role = 'hand'; a.state = 'hand'; a.home = W.stations[0]; a.credits = Math.max(120, a.credits * 0.4); a.lost = 0;
        feed(a.name + ' was picked up by a passing hauler. Down to station work.', 'warn');
      }
      continue;
    }
    const s = a.ship, near2 = pl ? hy(s.x - pl.x, s.y - pl.y) < 1500 : true;
    s.wantF = s.wantM = false;
    if (a.distress) { s.thr = s.rcx = s.rcy = s.tqi = 0; continue; }       // disabled hull, waiting for help
    if (s.fuel <= 0) { if (co) a.timer += cd; if (a.timer > 30) { s.fuel = 25; a.credits = Math.max(0, a.credits - 220); a.timer = 0; } continue; }
    const mass = sum(a.cargo);
    if (co && a.state === 'idle') {
      if (a.role === 'trader' || a.role === 'scav') {
        if (a.role === 'scav' && W.deb.length > 30 && Math.random() < 0.5) { a.state = 'loot'; a.timer = 0; }
        else if (mass > 6) { a.goal = bestSell(Object.keys(a.cargo)[0]); a.state = 'sell'; }
        else { a.goal = bestBuy(a.role === 'scav' ? 'parts' : pk(Math.random, ['fe', 'food', 'ice'])); a.state = 'buy'; }
      } else if (a.role === 'miner') {
        if (mass > 16) { a.goal = bestSell('fe'); a.state = 'sell'; }
        else {
          let b = null, bd = 1e9;
          for (const r of W.rocks) { const d = ds(r, s) * (0.7 + Math.random() * 0.6); if (d < bd && r.R > 16) { bd = d; b = r; } }
          a.goal = b; a.state = 'mine'; a.timer = 0;
        }
      } else {
        const t = a.role === 'pirate' ? prey(a) : nearestPirate(s, 1100);
        if (t) { a.tgt = t; a.state = 'hunt'; }
        else { a.goal = a.escort ? a.escort : W.stations[ri(Math.random, 0, W.stations.length - 1)]; a.state = 'patrol'; }
      }
    }
    if (co && a.role !== 'pirate' && a.role !== 'security' && a.state !== 'flee') {
      const th = nearestPirate(s, 520);
      if (th && (th.tgt === a || Math.random() < 0.6)) {
        if (s.dock && s.dock.ty === 'anchor') undock(s);
        if (!s.dock) { a.state = 'flee'; a.tgt = th; a.timer = 0; if (Math.random() < 0.4) feed(a.name + ' is running from ' + th.name, 'warn'); }
      }
    }
    if (co && (a.role === 'pirate' || a.role === 'security') && (a.state === 'patrol' || a.state === 'idle')) {
      const t = a.role === 'pirate' ? prey(a) : nearestPirate(s, 1300) || (a.raidTgt && a.raidTgt.ship && !a.raidTgt.ship.dead ? a.raidTgt : null);
      if (t) { a.tgt = t; a.state = 'hunt'; }
    }
    switch (a.state) {
      case 'buy': case 'sell': case 'patrol': {
        const g = a.goal; if (!g || g.dead) { a.state = 'idle'; break; }
        const gy = g.kind === 'ship' ? g.y : g.y + g.rad * 0.6, gx = g.kind === 'ship' ? g.x - 80 : g.x;
        let d;
        if (near2) d = steer(s, gx, gy, dt);
        else { d = ds(g, s); s.vx = ((g.x - s.x) / Math.max(1, d)) * 52; s.vy = ((g.y - s.y) / Math.max(1, d)) * 52; }
        if (d < (g.rad || 40) + 80) {
          if (a.state === 'patrol') a.state = 'idle';
          else {
            const p = freePort(g, g.type === 'anchor');
            if (p) {
              dock(s, g, p, 'port', true); a.state = 'trade'; a.timer = 0;
              if (s.fuel < s.fuelMax * 0.5) { const q = s.fuelMax - s.fuel, c = q * price(g, 'fuel'); if (a.credits > c) { a.credits -= c; s.fuel = s.fuelMax; g.econ.fuel.stock = Math.max(0, g.econ.fuel.stock - q); } }
            }
          }
        }
        break;
      }
      case 'trade': {
        if (!s.dock) { a.state = 'idle'; break; }
        a.timer += co ? cd : dt;
        if (co) {
          const st = s.dock.b;
          for (const g in a.cargo) npcTrade(a, st, g, Math.ceil(a.cargo[g]), false);
          const g = a.role === 'scav' ? 'parts' : pk(Math.random, ['fe', 'food', 'ice', 'fuel']);
          npcTrade(a, st, g, Math.min(14, Math.floor(a.credits / Math.max(1, price(st, g)))), true);
          if (integ(s) < 0.8) { const c = (1 - integ(s)) * 900; if (a.credits > c) { a.credits -= c; for (const m of s.mods) { m.hp = m.max; m.dead = false; } s.dirty = true; stats(s); } }
        }
        if (a.timer > (a.stay || (a.stay = rr(Math.random, 6, 16)))) { undock(s); a.state = 'idle'; a.stay = 0; }
        break;
      }
      case 'mine': {
        const r = a.goal; if (!r) { a.state = 'idle'; break; }
        const d = ds(r, s), aim = Math.atan2(r.y - s.y, r.x - s.x);
        if (d > r.rad + 40 && !s.dock) {
          if (near2) steer(s, r.x + Math.cos(aim + Math.PI) * (r.rad + 30), r.y + Math.sin(aim + Math.PI) * (r.rad + 30), dt, aim);
          else { s.vx = Math.cos(aim) * 50; s.vy = Math.sin(aim) * 50; }
        } else {
          if (!s.dock) {
            const c = ca(r, s.x + Math.cos(s.a) * (s.rad + 6), s.y + Math.sin(s.a) * (s.rad + 6));
            if (c && r.sol[c.i]) anchor(s, r, c.cx, c.cy); else if (near2) steer(s, r.x, r.y, dt, aim);
          }
          if (s.dock) { s.thr = s.rcx = s.rcy = 0; }
          s.tqi = cl(ad(aim, s.a) * 2 - s.va, -1, 1);
          if (near2 && Math.abs(ad(aim, s.a)) < 0.3) s.wantM = true;
          a.timer += co ? cd : dt;
          if (co && !near2) { const g = r.type === 'ice' ? 'ice' : 'fe'; a.cargo[g] = (a.cargo[g] || 0) + 1; }
          if (near2) npcScoop(s);
          if (a.timer > 45 || sum(a.cargo) > 20) { if (s.dock) undock(s); a.state = 'idle'; }
        }
        break;
      }
      case 'hunt': case 'fight': {
        const t = a.tgt;
        if (!t || !t.ship || t.ship.dead) { a.state = 'loot'; a.timer = 0; break; }
        if (s.dock) undock(s);
        const ts = t.ship, d = ds(ts, s), aim = Math.atan2(ts.y - s.y, ts.x - s.x);
        if (near2) {
          // lead the target a little
          const tt = d / 280, lx = ts.x + (ts.vx - s.vx) * tt, ly = ts.y + (ts.vy - s.vy) * tt, lead = Math.atan2(ly - s.y, lx - s.x);
          const orb = aim + (Math.PI / 2) * (a.greed > 0.5 ? 1 : -1), want = a.state === 'hunt' ? aim : d > 200 ? aim : d < 110 ? aim + Math.PI : orb;
          steer(s, a.state === 'hunt' ? ts.x - Math.cos(aim) * 150 : s.x + Math.cos(want) * 120, a.state === 'hunt' ? ts.y - Math.sin(aim) * 150 : s.y + Math.sin(want) * 120, dt, lead);
          if (d < 340 && Math.abs(ad(lead, s.a)) < 0.22) s.wantF = true;
          if (a.role !== 'pirate' && integ(s) < 0.35) { a.state = 'flee'; a.timer = 0; }
          if (a.role === 'pirate' && integ(s) < 0.25 && a.caution > 0.6) { a.state = 'flee'; a.tgt = t; a.timer = 0; feed(a.name + ' breaks off, trailing smoke', 'warn'); }
        } else { s.vx = Math.cos(aim) * 58; s.vy = Math.sin(aim) * 58; s.a = aim; }
        if (d < 330) a.state = 'fight';
        if (d > 3000) { a.state = 'idle'; a.tgt = null; }
        break;
      }
      case 'loot': {
        a.timer += co ? cd : dt;
        let b = null, bd = a.role === 'scav' ? 1800 : 400;
        for (const p of W.picks) { if (p.dead || p.held || (p.type === 'pod' && a.role === 'pirate')) continue; const d = hy(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; b = p; } }
        if (b) { if (near2) steer(s, b.x, b.y, dt); else { s.vx = ((b.x - s.x) / Math.max(1, bd)) * 45; s.vy = ((b.y - s.y) / Math.max(1, bd)) * 45; } }
        npcScoop(s);
        if (!b || a.timer > 40) { a.state = 'idle'; a.tgt = null; }
        break;
      }
      case 'flee': {
        a.timer += co ? cd : dt;
        const th = a.tgt, safe = a.home || W.stations[0];
        const away = th && th.ship ? Math.atan2(s.y - th.ship.y, s.x - th.ship.x) : Math.atan2(safe.y - s.y, safe.x - s.x);
        if (near2) steer(s, s.x + Math.cos(away) * 300, s.y + Math.sin(away) * 300, dt, away);
        else { s.vx = Math.cos(away) * 60; s.vy = Math.sin(away) * 60; }
        if (a.timer > 18 || !th || !th.ship || th.ship.dead) { a.state = 'idle'; a.tgt = null; }
        break;
      }
    }
  }
  setAG(AG.filter(a => a.alive));
}

export function crewTick(dt) {
  for (const b of W.bodies) {
    if (!b.crew.length || (pl && hy(b.x - pl.x, b.y - pl.y) > 1400)) continue;
    for (const c of b.crew) {
      if (!c.sp) continue;
      c.t -= dt;
      if (c.t <= 0 || hy(c.tx - c.lx, c.ty - c.ly) < 3) {
        c.t = rr(Math.random, 2, 6);
        const rm = c.rm;
        if (rm) { c.tx = (rm.x + 1.5 + Math.random() * (rm.w - 3)) * b.cs - (b.gw * b.cs) / 2; c.ty = (rm.y + 1.5 + Math.random() * (rm.h - 3)) * b.cs - (b.gh * b.cs) / 2; }
      }
      const dx = c.tx - c.lx, dy = c.ty - c.ly, d = hy(dx, dy) || 1;
      c.lx += (dx / d) * c.sp * dt; c.ly += (dy / d) * c.sp * dt;
    }
  }
}

export function onKill(v, k) {
  const a = v.ag;
  if (a) { a.ship = null; a.state = 'stranded'; a.lost = 0; a.credits = Math.max(80, a.credits * 0.5); a.distress = false; }
  if (k && k.ag && k.ag !== a) { k.ag.kills = (k.ag.kills || 0) + 1; if (Math.random() < 0.7) feed(k.name + ' destroyed ' + v.name, k.fac === 'kings' ? 'bad' : 'good'); }
  if (k && k.isPl) {
    if (v.fac === 'kings') { addRep('coop', 6); addRep('miners', 4); addRep('kings', -10); feed('KITE put down ' + v.name, 'good'); story('kill', { fac: 'kings' }); }
    else { addRep('coop', -12); addRep('miners', -6); feed('KITE killed ' + v.name + ' — ' + v.fac + ' will remember', 'bad'); }
    for (const j of [...G.missions]) if (j.type === 'bounty' && j.tid === (a ? a.id : -1)) complete(j);
  } else if (!k && v.fac) feed(v.name + ' broke up — cause unknown', 'warn');
}

export function rescue(p) {
  const a = p.ag;
  pl.credits += 300; W.stats.rescues++; addRep('coop', 5); AU.chime();
  if (!a) { toast('POD RECOVERED · survivor aboard · +300₡', 'good'); feed('KITE recovered an escape pod', 'good'); return; }
  a.role = 'hand'; a.state = 'hand'; a.ship = null; a.lost = 0; a.home = W.stations[0]; a.favor += 3; a.distress = false;
  a.credits = Math.max(a.credits, 300);
  if (a.fac === 'kings') { a.grudge = Math.max(0, a.grudge - 3); addRep('kings', 4); }
  toast('POD RECOVERED · ' + a.name + ' alive · +300₡', 'good'); feed('KITE pulled ' + a.name + ' out of a dead pod', 'good');
}

export function board(s) {
  if (!s || s.dead) return;
  let took = 0;
  for (const g in s.cargo) { const t = cadd(pl, g, s.cargo[g]); took += t; delete s.cargo[g]; }
  pl.credits += Math.floor(s.credits * 0.4); s.credits = 0;
  const a = s.ag;
  if (a) { for (const g in a.cargo) { took += cadd(pl, g, a.cargo[g]); } a.cargo = {}; a.ship = null; a.role = 'hand'; a.state = 'hand'; a.home = W.stations[0]; a.grudge += 5; }
  // the hull stays where it is — crewless, adrift, still something to scavenge
  s.ag = null; s.derelict = true; s.thr = s.rcx = s.rcy = s.tqi = 0; s.wantF = s.wantM = false; s.name += ' · ADRIFT';
  addRep('coop', s.fac === 'kings' ? 4 : -8); AU.thunk();
  toast('BOARDED ' + s.name + ' · ' + took + ' units seized', 'good');
  feed('KITE breached and boarded ' + s.name, s.fac === 'kings' ? 'good' : 'bad');
}
