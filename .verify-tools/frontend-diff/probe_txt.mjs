import fs from 'node:fs';
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const ROUTES = JSON.parse(fs.readFileSync('routes.json','utf8'));
const id=(process.argv[2]||'').toUpperCase(), needle=process.argv[3]||'请确保';
const r=ROUTES.find(x=>x.id===id);
const b=await chromium.launch({executablePath:`${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`});
const p=await b.newPage({viewport:{width:1920,height:839}});
await p.goto('http://localhost:3000'+r.route,{waitUntil:'networkidle',timeout:40000});
await p.waitForTimeout(1200);
const out=await p.evaluate((needle)=>{
  const hits=[];
  document.querySelectorAll('*').forEach(el=>{
    if(el.children.length) return;
    const t=(el.textContent||'').trim();
    if(t.includes(needle.slice(0,6))){const b=el.getBoundingClientRect();hits.push({t:t.slice(0,80),y:Math.round(b.y),h:Math.round(b.height),x:Math.round(b.x),w:Math.round(b.width)});}
  });
  return hits.slice(0,10);
},needle);
console.log(JSON.stringify(out,null,1));
await b.close();
