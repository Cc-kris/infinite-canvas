import fs from 'node:fs';
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const ROUTES = JSON.parse(fs.readFileSync('routes.json','utf8'));
const id=(process.argv[2]||'').toUpperCase(), needle=process.argv[3];
const r=ROUTES.find(x=>x.id===id);
const b=await chromium.launch({executablePath:`${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`});
const p=await b.newPage({viewport:{width:1920,height:839}});
await p.goto('http://localhost:3000'+r.route,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
const out=await p.evaluate((needle)=>{
  const hits=[];
  const walk=(el)=>{ if(el.children.length===0){ const t=(el.textContent||'').trim(); if(t.includes(needle)){ const chain=[]; let n=el; for(let i=0;i<5&&n;i++){chain.push(n.tagName.toLowerCase()+(n.dataset?.testid?'['+n.dataset.testid+']':'')+(n.className&&typeof n.className==='string'?' .'+n.className.slice(0,60):'')); n=n.parentElement;} const b=el.getBoundingClientRect(); hits.push({t:t.slice(0,40),y:Math.round(b.y),x:Math.round(b.x),chain}); } return; }
    for(const c of el.children) walk(c); };
  walk(document.body); return hits.slice(0,6);
}, needle);
console.log(JSON.stringify(out,null,1)); await b.close();
