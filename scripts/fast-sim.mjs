// Headless soak test for the AI pilot. Usage: node scripts/fast-sim.mjs <seconds> <logEverySec> [url]
// Needs puppeteer-core plus a Chromium binary (CHROME_PATH env, or @sparticuz/chromium if installed).
import puppeteer from 'puppeteer-core';
async function chromePath() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] };
  const { default: chromium } = await import('@sparticuz/chromium');
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}
const DUR = +(process.argv[2]||120), EVERY=+(process.argv[3]||2), URL = process.argv[4]||'http://localhost:8080/?demo';
const b = await puppeteer.launch({ ...(await chromePath()), headless: true, defaultViewport:{width:1280,height:760} });
const p = await b.newPage();
const errs = new Map();
p.on('console', m => { const t=m.text().slice(0,400); if (m.type()==='error'||m.type()==='warning'){ errs.set(t,(errs.get(t)||0)+1);} else if(t.startsWith('LOG ')) console.log(t.slice(4)); });
p.on('pageerror', e => { const t='PAGEERR '+(e.stack||e.message).slice(0,600); errs.set(t,(errs.get(t)||0)+1); });
await p.goto(URL, { waitUntil: 'load' });
await new Promise(r=>setTimeout(r,1500));
const CH=60;
for (let t=0;t<DUR;t+=CH){
 await p.evaluate((ch,ev0,t0)=>{ const K=window.KERES; let lastCap='';
  K.fast(ch, (t)=>{ const pl=K.pl, A=K.AP; const s=`${(t0+t).toFixed(0)}s ${K.G.mode} [${A.task&&A.task.name}] ${A.act} | ${A.cap} | ${A.sub} | p=${pl.x|0},${pl.y|0} v=${Math.hypot(pl.vx,pl.vy).toFixed(1)} f=${pl.fuel|0} h=${(pl.mods.reduce((a,m)=>a+Math.max(0,m.hp),0)/pl.mods.reduce((a,m)=>a+m.max,0)).toFixed(2)} cr=${pl.credits|0} cg=${JSON.stringify(pl.cargo)} st=${K.G.story} d=${pl.dock?pl.dock.ty+':'+pl.dock.b.name:''}${K.ev?' EVA':''} w=${A.warp} why=${A.why||""} mis=${K.G.missions.map(j=>j.type+":"+(j.good||"")+j.qty+">"+j.to).join(",")} plan=${A.plan?A.plan.st.name:""}`;
   console.log('LOG '+s); }, ev0); },CH,EVERY,t);
}
const fin = await p.evaluate(()=>JSON.stringify(window.KERES.W.stats)+' events='+JSON.stringify(window.KERES.W.evt&&window.KERES.W.evt.list.map(e=>e.kind))+' feed='+JSON.stringify(window.KERES.W.feed.slice(0,8).map(f=>f.m)));
console.log('STATS', fin);
const lg = await p.evaluate(()=>window.KERES.AP.log.join('\n'));
console.log('CAPLOG\n'+lg);
for (const [k,v] of errs) console.log('ERR x'+v, k);
await b.close();
