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
 await p.evaluate((ch,ev0,t0)=>{ const K=window.KERES;
  K.fast(ch, (t)=>{ const pl=K.pl, e=K.ev, A=K.AP, G=K.G; const o=pl||e;
   const s=`${(K.W.time).toFixed(0)}s ${G.mode} st=${G.story} tier=${G.tier} cr=${G.cr|0} b=${G.bounty} [${A.task&&A.task.name}] ${A.act} | ${A.cap} | ${A.sub} | ${o?`p=${o.x|0},${o.y|0} alt=${(Math.hypot(o.x,o.y)-3000)|0}`:''} ${pl?`${pl.cls} f=${pl.fuel|0} cg=${JSON.stringify(pl.cargo)} d=${pl.dock?pl.dock.ty+':'+(pl.dock.b?pl.dock.b.name:''):''}`:''}${e?` EVA hide=${e.hide} air=${e.suit|0} sack=${JSON.stringify(e.sack)}`:''} crew=${G.crew.state} ride=${G.ride&&G.ride.kind} w=${A.warp}`;
   console.log('LOG '+s); }, ev0); },CH,EVERY,t);
}
const fin = await p.evaluate(()=>JSON.stringify(window.KERES.W.stats)+' cores='+window.KERES.G.cores+' fleet='+window.KERES.G.fleet.map(s=>s.cls).join(','));
console.log('STATS', fin);
const lg = await p.evaluate(()=>window.KERES.AP.log.join('\n'));
console.log('CAPLOG\n'+lg);
for (const [k,v] of errs) console.log('ERR x'+v, k);
await b.close();
