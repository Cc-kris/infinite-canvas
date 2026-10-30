import fs from 'node:fs';
const { chromium } = await import('/Users/mac/Documents/Dev/infinite-canvas/web/node_modules/playwright/index.mjs');
const ROUTES = JSON.parse(fs.readFileSync('routes.json','utf8'));
const id=(process.argv[2]||'').toUpperCase();
const r=ROUTES.find(x=>x.id===id);
const b=await chromium.launch({executablePath:`${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`}); const p=await b.newPage({viewport:{width:1920,height:839}});
await p.goto('http://localhost:3000'+r.route,{waitUntil:'networkidle'});
await p.waitForTimeout(1200);
const out=await p.evaluate(()=>{
  const roots=[...document.querySelectorAll('[data-tool]')].map(e=>({tool:e.dataset.tool,layout:e.dataset.layout,spec:e.dataset.spec}));
  return {url:location.pathname,h1:document.title,roots,text:(document.body.innerText||'').slice(0,400)};
});
console.log(JSON.stringify(out,null,1)); await b.close();
