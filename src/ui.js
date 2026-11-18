// ═══ DOM UI: toasts, overlays, station panel, dialog, DOM HUD ═══════════
import { $, cl, fm, rng, sh } from './core/util.js';
import { GD, FC, PAL } from './core/config.js';
import { W, G, pl, ev, AG, PC } from './core/state.js';
import { cmass, integ } from './ships.js';
import { price, services } from './economy.js';
import { storyObj } from './missions.js';
import { agentLine } from './social.js';
import { AU } from './audio.js';
import { save } from './game.js';

export function toast(m, k) {
  const b = $('toasts'); if (!b) return;
  // collapse identical consecutive messages
  const lastT = b.lastElementChild;
  if (lastT && lastT.dataset.m === m) { lastT.dataset.n = (+lastT.dataset.n || 1) + 1; lastT.textContent = m + ' ×' + lastT.dataset.n; return; }
  const d = document.createElement('div'); d.className = 'toast ' + (k || ''); d.textContent = m; d.dataset.m = m;
  b.appendChild(d);
  while (b.children.length > 4) b.removeChild(b.firstChild);
  setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 700); }, 4800);
}

export const OVS = ['pauseO', 'helpO', 'mapO', 'dialogO', 'confirmO', 'deathO', 'winO'];
export const frozen = () => OVS.some(i => $(i).classList.contains('on'));

export function mode(m) {
  G.mode = m;
  $('hud').classList.toggle('on', m !== 'title'); $('title').classList.toggle('off', m !== 'title');
  $('pauseO').classList.toggle('on', m === 'pause'); $('deathO').classList.toggle('on', m === 'dead'); $('winO').classList.toggle('on', m === 'win');
  if (m !== 'play') { AU.engine(0); AU.mine(false); }
  if (m !== 'title') save();
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

export function openStation(b, tab) {
  if (!b || b.kind !== 'station') { toast('No pressurised services here — breach and EVA instead', 'warn'); return; }
  G.panel = b; G.tab = tab || 'market'; panel(); $('stationO').classList.add('on'); AU.ui();
}
export function closeStation() { $('stationO').classList.remove('on'); }

function spark(cv, h, c) {
  const x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height; x.clearRect(0, 0, W2, H2);
  if (!h || h.length < 2) return;
  const mn = Math.min(...h), mx = Math.max(...h), rg = Math.max(1, mx - mn);
  x.strokeStyle = c; x.lineWidth = 1.4; x.beginPath();
  h.forEach((v, i) => { const px = (i / (h.length - 1)) * W2, py = H2 - 2 - ((v - mn) / rg) * (H2 - 4); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.stroke();
}

export function panel() {
  const st = G.panel; if (!st || !pl) return;
  $('sName').textContent = st.name;
  $('sFac').textContent = st.fac.toUpperCase() + ' · ' + (st.dead ? 'DARK' : st.type.toUpperCase());
  $('undock').textContent = pl.dock && pl.dock.b === st ? 'UNDOCK' : 'LEAVE';
  document.querySelectorAll('#stationO .tabs button').forEach(b => b.classList.toggle('act', b.dataset.t === G.tab));
  const B = $('pBody');
  if (st.dead) { B.innerHTML = '<div class="svc"><div>STATION DARK<span class="d">Spine severed. No pressure, no market, no fuel.</span></div></div>'; return; }
  if (G.tab === 'market') {
    let h = `<div class="svc"><div>HOLD ${cmass(pl).toFixed(0)} / ${pl.cargoMax} mass · ${fm(pl.credits)}₡<span class="d">quantity applies to every BUY / SELL</span></div>
  <div style="display:flex;gap:4px">${[1, 5, 10, 'MAX'].map(v => `<button data-a="qty" data-q="${v}" style="width:40px;height:26px;font-size:9px;${String(v) === String(G.qty) ? 'border-color:var(--cyan);color:var(--cyan)' : ''}">${v}</button>`).join('')}</div></div>`;
    for (const g in st.econ) {
      const e = st.econ[g], p = price(st, g), prev = e.hist.length > 1 ? e.hist[e.hist.length - 2] : p, have = pl.cargo[g] || 0;
      const role = e.prod > 0 ? ' · MADE HERE' : e.cons > 0.3 ? ' · IN DEMAND' : '';
      h += `<div class="mrow ${GD[g].bad ? 'contra' : ''}"><div class="gname">${GD[g].n}<span class="gsub">have ${have} · stock ${Math.round(e.stock)}${role}${GD[g].bad ? ' · CONTRABAND' : ''}</span>
    <div class="stock"><i style="width:${cl((e.stock / (e.ref * 1.6 || 1)) * 100, 0, 100)}%"></i></div></div>
    <div class="price">${p}₡ <span class="${p > prev ? 'up' : p < prev ? 'down' : ''}">${p > prev ? '▲' : p < prev ? '▼' : '·'}</span></div>
    <canvas class="sp" data-g="${g}" width="56" height="18"></canvas>
    <div class="acts"><button data-a="buy" data-g="${g}">BUY</button><button data-a="sell" data-g="${g}" ${have ? '' : 'disabled'}>SELL</button></div></div>`;
    }
    B.innerHTML = h; B.querySelectorAll('.sp').forEach(cv => spark(cv, st.econ[cv.dataset.g].hist, GD[cv.dataset.g].c));
  } else if (G.tab === 'service') {
    G.svc = services(st);
    B.innerHTML = G.svc.map((s, i) => `<div class="svc"><div>${s.l}<span class="d">${s.d}</span></div>
   <button data-a="svc" data-i="${i}" ${!s.ok || pl.credits < (s.min || s.c) ? 'disabled' : ''}>${s.c ? fm(s.c) + '₡' : '—'}</button></div>`).join('') +
      `<div class="svc" style="border:none"><div>KITE STATUS<span class="d">hull ${Math.round(integ(pl) * 100)}% · fuel ${pl.fuel.toFixed(0)}/${pl.fuelMax} · laser ${pl.lasD.toFixed(0)} dps · array ${pl.scanR.toFixed(0)}m · upgrades ${Object.entries(pl.upg).filter(e => e[1]).map(e => e[0].toUpperCase() + e[1]).join(' ') || 'none'}</span></div></div>`;
  } else if (G.tab === 'jobs') {
    let h = '<div class="svc" style="border:none"><div>CONTRACT BOARD<span class="d">active ' + G.missions.length + '/3 · payment on delivery</span></div></div>';
    for (const j of G.missions) h += `<div class="job active"><h4>${j.title} · ACTIVE</h4><p>${j.desc}</p><span class="jr">${fm(j.reward)}₡ · +5 rep</span><br><button data-a="drop" data-id="${j.id}">DROP CONTRACT</button></div>`;
    for (const j of G.jobs[st.name] || []) {
      const t = G.missions.some(m => m.id === j.id);
      h += `<div class="job"><h4>${j.title}</h4><p>${j.desc}</p><span class="jr">${fm(j.reward)}₡ · +5 rep ${j.rep}</span><br>
    <button data-a="accept" data-id="${j.id}" ${t ? 'disabled' : ''}>${t ? 'SIGNED' : 'SIGN CONTRACT'}</button></div>`;
    }
    B.innerHTML = h;
  } else {
    const R = AG.filter(a => a.alive && a.role !== 'fence' && ((a.ship && a.ship.dock && a.ship.dock.b === st) || (a.role === 'hand' && a.home === st)));
    let h = `<div class="svc" style="border:none"><div>THE BAR · ${st.name}<span class="d">${st.crew.length} souls aboard · crews remember what you do</span></div></div>`;
    if (!R.length) h += '<div class="svc"><div>Quiet shift<span class="d">No named crews docked. Check the feed.</span></div></div>';
    for (const a of R) h += `<div class="npc"><canvas data-f="${a.id}" data-fac="${a.fac}" width="28" height="28"></canvas>
   <div class="ni"><b>${a.name}</b><span>${a.role.toUpperCase()} · ${a.fac} · ${fm(a.credits)}₡</span><span>${agentLine(a)}</span></div>
   <button data-a="talk" data-id="${a.id}">TALK</button></div>`;
    h += '<div class="svc" style="border:none;margin-top:8px"><div>SECTOR FEED<span class="d">live social & economic record</span></div></div>';
    for (const f of W.feed.slice(0, 14)) h += `<div class="svc" style="padding:5px 4px"><div style="font-size:10px;color:${f.k === 'bad' ? PAL.red : f.k === 'good' ? PAL.green : f.k === 'warn' ? PAL.amber : PAL.text}">${f.m}<span class="d">T+${Math.floor(f.t)}s</span></div></div>`;
    B.innerHTML = h; B.querySelectorAll('canvas[data-f]').forEach(cv => face(cv, +cv.dataset.f * 77 + 13, cv.dataset.fac));
  }
}

export function hudDOM() {
  if (!pl || !G) return;
  $('cred').textContent = '₡ ' + fm(pl.credits); $('debt').textContent = 'DEBT ' + fm(G.debt);
  const f = cl(pl.fuel / pl.fuelMax, 0, 1), h = cl(integ(pl), 0, 1), c = cl(cmass(pl) / pl.cargoMax, 0, 1);
  $('fF').style.width = f * 100 + '%'; $('hF').style.width = h * 100 + '%'; $('cF').style.width = c * 100 + '%';
  $('fB').classList.toggle('low', f < 0.2); $('hB').classList.toggle('low', h < 0.3); $('cB').classList.toggle('low', c > 0.95);
  $('clk').textContent = 'SHIFT ' + String(G.shift).padStart(2, '0') + ' · ' + String(Math.floor(G.clock / 60)).padStart(2, '0') + ':' + String(Math.floor(G.clock % 60)).padStart(2, '0');
  $('mode').textContent = ev ? 'EVA ' + Math.round(ev.suit) + '%' : pl.dock ? (pl.dock.ty === 'anchor' ? 'ANCHORED' : pl.dock.ty === 'pad' ? 'LANDED' : 'DOCKED') : PC.scan ? 'SCANNING' : 'FLIGHT';
  const s = storyObj(), j = G.missions[0];
  $('tObj').textContent = s.t + ' — ' + s.d + (j ? ' ▸ also: ' + j.title + ' → ' + j.to : '');
  $('tRew').textContent = s.r ? 'reward ' + fm(s.r) + '₡' : 'reward: your hull, free and clear';
  AU.danger(h < 0.25 && G.mode === 'play');
  if (f < 0.12 && !G.fuelWarn) { G.fuelWarn = true; toast('REACTION MASS LOW — refuel or call a tow', 'bad'); }
  if (f > 0.3) G.fuelWarn = false;
}

export function statGrid(el) {
  const s = W.stats;
  el.innerHTML = `<div>SHIFT<b>${G.shift}</b></div><div>CREDITS<b>${fm(pl ? pl.credits : 0)}₡</b></div>
 <div>ORE CUT<b>${s.mined}</b></div><div>KILLS<b>${s.kills}</b></div><div>ANOMALIES<b>${s.found}</b></div><div>DOCKINGS<b>${s.docked}</b></div>
 <div>RESCUES<b>${s.rescues}</b></div><div>BREACHES<b>${s.breaches}</b></div><div>CONTRACTS<b>${s.jobs}</b></div><div>EVENTS<b>${s.events || 0}</b></div><div>EVA<b>${s.eva || 0}</b></div><div>DEBT<b>${fm(G.debt)}₡</b></div>`;
}
export function showWin() { statGrid($('wStats')); mode('win'); AU.chime(); }
