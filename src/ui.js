// ═══ DOM UI: toasts, overlays, station terminals, DOM HUD ═══════════════
import { $, cl, fm, rng, sh, hy } from './core/util.js';
import { GD, FC, PAL, C, CLS } from './core/config.js';
import { W, G, pl, ev, AG, PC, focus } from './core/state.js';
import { cmass, integ } from './ships.js';
import { price, services, yard, hold, bountyFor, shipAt } from './economy.js';
import { storyObj, STORY } from './missions.js';
import { crewLine, MATES } from './crew.js';
import { agentLine, rumor } from './social.js';
import { SITES } from './world/gen.js';
import { sackN } from './eva.js';
import { AU } from './audio.js';

export function toast(m, k) {
  const b = $('toasts'); if (!b) return;
  const lastT = b.lastElementChild;
  if (lastT && lastT.dataset.m === m) { lastT.dataset.n = (+lastT.dataset.n || 1) + 1; lastT.textContent = m + ' ×' + lastT.dataset.n; return; }
  const d = document.createElement('div'); d.className = 'toast ' + (k || ''); d.textContent = m; d.dataset.m = m;
  b.appendChild(d);
  while (b.children.length > 4) b.removeChild(b.firstChild);
  setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 700); }, 5200);
}

export const OVS = ['pauseO', 'helpO', 'mapO', 'dialogO', 'confirmO', 'deathO', 'winO'];
export const frozen = () => OVS.some(i => $(i).classList.contains('on'));
let saveFn = () => {};
export const setSaver = f => (saveFn = f);

export function mode(m) {
  G.mode = m;
  $('hud').classList.toggle('on', m !== 'title'); $('title').classList.toggle('off', m !== 'title');
  $('pauseO').classList.toggle('on', m === 'pause'); $('deathO').classList.toggle('on', m === 'dead'); $('winO').classList.toggle('on', m === 'win');
  if (m !== 'play') { AU.engine(0); AU.mine(false); }
  if (m !== 'title') saveFn();
}

export function face(cv, seed, fac) {
  const x = cv.getContext('2d'), r = rng(seed | 0 || 1), c = FC[fac] || PAL.dim;
  x.fillStyle = '#0b1018'; x.fillRect(0, 0, 28, 28); x.fillStyle = '#2b3a4d'; x.fillRect(4, 3, 20, 22); x.fillStyle = '#41546b'; x.fillRect(5, 4, 18, 6);
  x.fillStyle = c; x.fillRect(6, 9, 16, 8); x.fillStyle = '#0a0e14'; x.fillRect(7, 10, 14, 6); x.fillStyle = c;
  x.fillRect(9 + ((seed >> 3) % 3), 12, 2, 2); x.fillRect(15 + ((seed >> 5) % 3), 12, 2, 2); x.fillStyle = '#8b98a8'; x.fillRect(4, 18, 20, 2);
  x.fillStyle = sh(c, 0.65); x.fillRect(6, 21, 16, 3);
  for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(4 + ((r() * 20) | 0), 3 + ((r() * 22) | 0), 1, 1); }
}
export function dialog(m) {
  $('dName').textContent = m.name; $('dRole').textContent = m.role; $('dText').textContent = m.text; face($('face'), m.seed, m.fac);
  const b = $('dCh'); b.innerHTML = '';
  for (const c of m.ch) { const e = document.createElement('button'); e.textContent = '▸ ' + c.l; e.onclick = () => { AU.ui(); c.f(); }; b.appendChild(e); }
  $('dialogO').classList.add('on');
}
export function closeDialog() { $('dialogO').classList.remove('on'); }
export function confirmBox(t, f) {
  $('cText').textContent = t; $('confirmO').classList.add('on');
  $('cYes').onclick = () => { $('confirmO').classList.remove('on'); AU.ui(); f(); };
  $('cNo').onclick = () => { $('confirmO').classList.remove('on'); AU.ui(); };
}

const TABN = { market: 'MARKET', service: 'SERVICES', crew: 'CREW OFFICE', yard: 'SHIPYARD', catalog: 'CATALOG', bar: 'BAR', home: 'HOME', jobs: 'CONTRACTS' };
export const tabsOf = st => { const t = [...(st.tabs || [])]; if (st.econ && !t.includes('jobs')) t.splice(Math.min(2, t.length), 0, 'jobs'); return t; };
export function openStation(b, tab) {
  if (!b || b.kind !== 'station') return;
  const T = tabsOf(b); if (!T.length) return;
  G.panel = b; G.tab = tab && T.includes(tab) ? tab : T[0];
  const bar = $('sTabs'); bar.innerHTML = T.map(t => `<button data-t="${t}">${TABN[t] || t.toUpperCase()}</button>`).join('');
  panel(); $('stationO').classList.add('on'); AU.ui();
}
export function closeStation() { $('stationO').classList.remove('on'); G && (G.panel = null); }
export const stationOpen = () => $('stationO').classList.contains('on');

function spark(cv, h, c) {
  const x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height; x.clearRect(0, 0, W2, H2);
  if (!h || h.length < 2) return;
  const mn = Math.min(...h), mx = Math.max(...h), rg = Math.max(1, mx - mn);
  x.strokeStyle = c; x.lineWidth = 1.4; x.beginPath();
  h.forEach((v, i) => { const px = (i / (h.length - 1)) * W2, py = H2 - 2 - ((v - mn) / rg) * (H2 - 4); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.stroke();
}
const row = (t, d, btn) => `<div class="svc"><div>${t}<span class="d">${d}</span></div>${btn || ''}</div>`;
const btn = (a, label, dis, extra = '') => `<button data-a="${a}" ${extra} ${dis ? 'disabled' : ''}>${label}</button>`;

export function panel() {
  const st = G.panel; if (!st) return;
  $('sName').textContent = st.name;
  $('sFac').textContent = (st.surf ? 'SURFACE · ' : 'ORBITAL · ') + st.fac.toUpperCase() + (st.transfer ? ' · BOUND FOR ' + st.transfer.dest.toUpperCase() : '');
  $('undock').style.display = pl && pl.dock && pl.dock.b === st && !(pl.tailLand && pl.dock.ty === 'pad') ? '' : 'none';
  document.querySelectorAll('#sTabs button').forEach(b => b.classList.toggle('act', b.dataset.t === G.tab));
  const B = $('pBody'), h0 = hold();
  if (G.tab === 'market') {
    if (!h0) { B.innerHTML = row('NO HOLD', 'You need a suit sack or a docked ship to trade.'); return; }
    let h = `<div class="svc"><div>${h0.n} ${h0.used} / ${h0.max} · ${fm(G.cr)}₡<span class="d">${st.transfer ? 'TRANSFER SHIP — departure premium in the last 4 minutes' : st.surf ? 'surface market — ice and metal are scarce down here' : 'quantity applies to every BUY / SELL'}</span></div>
  <div style="display:flex;gap:4px">${[1, 5, 10, 'MAX'].map(v => `<button data-a="qty" data-q="${v}" style="width:40px;height:26px;font-size:9px;${String(v) === String(G.qty) ? 'border-color:var(--cyan);color:var(--cyan)' : ''}">${v}</button>`).join('')}</div></div>`;
    for (const g in st.econ) {
      if (GD[g].story) continue;
      const e = st.econ[g], p = price(st, g), sp = price(st, g, true), prev = e.hist.length > 1 ? e.hist[e.hist.length - 2] : p, have = h0.c[g] || 0;
      const role = e.prod > 0 ? ' · MADE HERE' : e.cons > 0.8 ? ' · IN DEMAND' : '';
      h += `<div class="mrow"><div class="gname">${GD[g].n}<span class="gsub">have ${have} · stock ${Math.round(e.stock)}${role} · sells ${sp}₡</span>
    <div class="stock"><i style="width:${cl((e.stock / (e.ref * 1.6 || 1)) * 100, 0, 100)}%"></i></div></div>
    <div class="price">${p}₡ <span class="${p > prev ? 'up' : p < prev ? 'down' : ''}">${p > prev ? '▲' : p < prev ? '▼' : '·'}</span></div>
    <canvas class="sp" data-g="${g}" width="56" height="18"></canvas>
    <div class="acts"><button data-a="buy" data-g="${g}">BUY</button><button data-a="sell" data-g="${g}" ${have ? '' : 'disabled'}>SELL</button></div></div>`;
    }
    B.innerHTML = h; B.querySelectorAll('.sp').forEach(cv => spark(cv, st.econ[cv.dataset.g].hist, GD[cv.dataset.g].c));
  } else if (G.tab === 'service') {
    G.svc = services(st);
    const s = pl && pl.dock && pl.dock.b === st ? pl : shipAt(st);
    B.innerHTML = G.svc.map((v, i) => row(v.l, v.d, `<button data-a="svc" data-i="${i}" ${!v.ok || G.cr < (v.min || v.c) ? 'disabled' : ''}>${v.c ? fm(v.c) + '₡' : '—'}</button>`)).join('') +
      (pl && pl.dock && pl.dock.b === st ? row('STEP OUT', 'Leave ' + pl.name + ' on EVA — walk the decks, ride the lift, visit the crew office.', btn('eva', 'EVA')) : '') +
      (s ? row(s.name + ' STATUS', `hull ${Math.round(integ(s) * 100)}% · fuel ${s.fuel.toFixed(0)}/${s.fuelMax} · thrust ${(s.thrust).toFixed(1)} m/s² · hold ${cmass(s)}/${s.cargoMax} · laser ${s.lasD.toFixed(0)} · array ${s.scanR.toFixed(0)}m`) : '');
  } else if (G.tab === 'crew') {
    const c = G.crew, can = c && c.state === 'idle' && ev && !ev.hide;
    let h = `<div class="npc"><canvas data-f="991" data-fac="crew" width="28" height="28"></canvas><div class="ni"><b>Foreman Lu Mei</b><span>CREW OFFICE · SELENE HIGH</span>
      <span>"Catalog's dead, so nobody knows what's in half these rocks. That's good for us. Suit up, ride the MULE, cut what you can carry. Base pay 140₡ a shift plus 60% of what's in your sack. Bring it back to the shuttle before the horn."</span></div></div>`;
    h += row('MULE-3', crewLine() + ' · shifts worked ' + (c ? c.shifts || 0 : 0), btn('shift', 'BOARD MULE-3', !can));
    h += row('THE CREW', MATES.map(m => m.n).join(' · ') + ' — two of them go out with you every shift.');
    if (!ev) h += row('ON A SHIP?', 'Crew work is EVA only. Step out [EVA] inside the station to sign on.');
    if (G.tier >= 2) h += row('YOUR OWN HULL', 'Lu: "Still welcome on the MULE when the tug is in the shop."');
    B.innerHTML = h;
  } else if (G.tab === 'yard') {
    const Y = yard(st);
    B.innerHTML = Y.map(y => row(y.n + ' · ' + fm(y.c) + '₡', y.d + (y.owned ? ' · YOU OWN ONE' : ''), btn('buyship', y.owned ? 'OWNED' : 'BUY', y.owned || G.cr < y.c, `data-c="${y.cls}"`))).join('') +
      row('HOW SHIPS WORK', st.surf ? 'The HARE sits on a pad outside. Walk out the east door and press F next to it to board. Throttle up to lift off — everything is manual.' : 'The WREN clamps to a berth. Float through the airlock and press F beside it to board.');
  } else if (G.tab === 'catalog') {
    const L = W.rocks.filter(b => b.cat).sort((a, b) => b.catT - a.catT);
    const un = W.rocks.filter(b => !b.cat && !b.hidden).length, cores = h0 ? h0.c.core || 0 : 0;
    let h = row('SURVEY BOUNTIES', 'pending ' + fm(G.bounty) + '₡ · ' + L.length + ' catalogued · ' + un + ' still UNKNOWN in the band', btn('bounty', 'COLLECT', !G.bounty));
    h += row('KERES-9 CORE SHARDS', 'Memory lattices from the dead catalog AI. Office pays 400₡ each and reads the logs. Handed in: ' + G.cores + '/3', btn('cores', 'HAND IN ' + cores, !cores));
    if (storyObj().id === 'file') h += row('FILE THE ORPHAN CLAIM', 'Your survey, your cut, your provenance. The KERES-9 logs prove HELION staked it illegally.', btn('file', 'FILE CLAIM'));
    for (const b of L.slice(0, 10)) {
      const top = Object.entries(b.comp).filter(e => e[0] !== 'rock').sort((a, q) => q[1] - a[1]).slice(0, 3).map(e => GD[e[0]] ? GD[e[0]].n + ' ' + Math.round((e[1] / b.cells) * 100) + '%' : '').join(', ');
      h += row(b.name, b.typeN + ' · from the ' + b.origin + ' · ' + Math.round(b.R * C.CS * 2) + ' m · ' + (top || 'mostly rock'));
    }
    B.innerHTML = h;
  } else if (G.tab === 'jobs') {
    let h = row('CONTRACT BOARD', 'active ' + G.missions.length + '/3 · payment on delivery (sell the goods at the destination)');
    for (const j of G.missions) h += `<div class="job active"><h4>${j.title} · ACTIVE ${j.kind === 'deliver' ? j.got + '/' + j.n : ''}</h4><p>${j.desc}</p><span class="jr">${fm(j.reward)}₡</span><br><button data-a="drop" data-id="${j.id}">DROP</button></div>`;
    for (const j of G.jobs[st.name] || []) h += `<div class="job"><h4>${j.title}</h4><p>${j.desc}</p><span class="jr">${fm(j.reward)}₡</span><br><button data-a="accept" data-id="${j.id}">SIGN</button></div>`;
    B.innerHTML = h;
  } else if (G.tab === 'home') {
    const f = G.fleet.filter(s => !s.dead);
    let h = row('HAB 14 · YOUR BUNK', 'Rim Colony, Shackleton. Day ' + G.day + '. ' + (G.tier === 1 ? 'You own a suit and a bunk. The lift is 150 m east.' : 'Fleet: ' + f.map(s => s.name + ' @ ' + (s.dock && s.dock.b ? s.dock.b.name : s.dock ? 'regolith' : 'in flight')).join(', ')), btn('sleep', 'SLEEP & SAVE'));
    h += row('CAREER', ['', 'TIER 1 · EVA crew hand', 'TIER 2 · orbital prospector (WREN)', 'TIER 3 · surface-to-orbit hauler (HARE)'][G.tier] + ' · ' + fm(W.stats.earned) + '₡ earned · ' + W.stats.catalogued + ' bodies catalogued');
    h += row('STORY', STORY.slice(0, G.story).map(s => '✓ ' + s.t).join(' · ') || 'just getting started');
    if (sackN(ev || { sack: {} })) h += row('SACK', 'You have ore in your sack. Sell it at a market — the Depot pays well for ice.');
    B.innerHTML = h;
  } else {
    const R = AG.filter(a => a.alive && a.ship && a.ship.dock && a.ship.dock.b === st);
    let h = row('THE BAR · ' + st.name, st.crew.length + ' souls aboard');
    h += `<div class="npc"><canvas data-f="${st.seed % 997}" data-fac="${st.fac}" width="28" height="28"></canvas><div class="ni"><b>Bartender</b><span>${st.name}</span><span>"${rumor()}"</span></div></div>`;
    for (const a of R) h += `<div class="npc"><canvas data-f="${a.id}" data-fac="${a.fac}" width="28" height="28"></canvas><div class="ni"><b>${a.name}</b><span>${a.role.toUpperCase()} · ${a.ship.name}</span><span>${agentLine(a)}</span></div></div>`;
    h += row('BAND FEED', 'live record');
    for (const f of W.feed.slice(0, 12)) h += `<div class="svc" style="padding:5px 4px"><div style="font-size:10px;color:${f.k === 'bad' ? PAL.red : f.k === 'good' ? PAL.green : f.k === 'warn' ? PAL.amber : PAL.text}">${f.m}<span class="d">T+${Math.floor(f.t)}s</span></div></div>`;
    B.innerHTML = h;
  }
  B.querySelectorAll('canvas[data-f]').forEach(cv => face(cv, +cv.dataset.f * 77 + 13, cv.dataset.fac));
}

export function hudDOM() {
  if (!G || !W) return;
  $('cred').textContent = '₡ ' + fm(G.cr);
  $('debt').textContent = G.bounty ? 'BOUNTY ' + fm(G.bounty) : 'TIER ' + G.tier;
  const s = pl, f = s ? cl(s.fuel / s.fuelMax, 0, 1) : ev ? cl(ev.suit / 100, 0, 1) : 1, h = s ? cl(integ(s), 0, 1) : 1;
  const hl = hold(), c = hl ? cl(hl.used / Math.max(1, hl.max), 0, 1) : 0;
  $('fB').dataset.l = s ? 'FUEL' : 'AIR'; $('hB').dataset.l = s ? 'HULL' : 'SUIT'; $('cB').dataset.l = s ? 'CRG' : 'SACK';
  $('fF').style.width = f * 100 + '%'; $('hF').style.width = h * 100 + '%'; $('cF').style.width = c * 100 + '%';
  $('fB').classList.toggle('low', f < 0.2); $('hB').classList.toggle('low', h < 0.3); $('cB').classList.toggle('low', c > 0.95);
  const day = Math.floor(W.time / 1200) + 1, hr = (6 + ((W.time % 1200) / 1200) * 24) % 24; G.day = day;
  $('clk').textContent = 'DAY ' + String(day).padStart(2, '0') + ' · ' + (G.crew && G.crew.state === 'site' ? crewLine() : String(Math.floor(hr)).padStart(2, '0') + ':' + String(Math.floor((hr % 1) * 60)).padStart(2, '0'));
  $('mode').textContent = G.ride ? (G.ride.kind === 'lift' ? 'LIFT' : 'MULE-3') : ev ? (ev.grounded > 0 ? 'WALK' : 'EVA') : s ? (s.dock ? { anchor: 'HARPOONED', pad: 'ON PAD', port: 'DOCKED', ground: 'LANDED' }[s.dock.ty] : PC.scan ? 'SCANNING' : 'FLIGHT') : '—';
  const o = storyObj(), j = G.missions[0];
  $('tObj').textContent = o.t + ' — ' + o.d + (j ? ' ▸ contract: ' + j.title + ' → ' + j.to : '');
  $('tRew').textContent = o.r ? 'reward ' + fm(o.r) + '₡' : '';
  AU.danger((s && h < 0.25) || (ev && !ev.hide && ev.suit < 25));
  if (s && f < 0.12 && !G.fuelWarn) { G.fuelWarn = true; toast('PROPELLANT LOW — refuel at a station or the Depot', 'bad'); }
  if (f > 0.3) G.fuelWarn = false;
  $('gear').style.opacity = s && (s.tailLand || s.gear) ? 1 : 0.4;
  if (stationOpen() && G.panel && (G.mode === 'play') && (++G._pn || (G._pn = 1)) % 8 === 0) {
    // keep live panels fresh (crew status, departure clocks) without fighting clicks
    if (G.tab === 'crew' || G.tab === 'catalog') panel();
  }
  void focus; void hy; void CLS; void SITES;
}

export function statGrid(el) {
  const s = W.stats;
  el.innerHTML = `<div>DAY<b>${G.day}</b></div><div>CREDITS<b>${fm(G.cr)}₡</b></div>
 <div>ORE CUT<b>${s.mined}</b></div><div>CATALOGUED<b>${s.catalogued}</b></div><div>DEEP CONTACTS<b>${s.found}</b></div><div>SHIFTS<b>${s.shifts}</b></div>
 <div>DELIVERED<b>${s.delivered}</b></div><div>LAUNCHES<b>${s.launches}</b></div><div>LANDINGS<b>${s.landings}</b></div><div>LIFT RIDES<b>${s.lifts}</b></div><div>EVA<b>${s.eva || 0}</b></div><div>EARNED<b>${fm(s.earned)}₡</b></div>`;
}
export function showWin() { statGrid($('wStats')); mode('win'); AU.chime(); }
