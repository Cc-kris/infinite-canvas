const { chromium } = require('/Users/mac/Documents/Dev/sub2apis/frontend/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SHOT = '/tmp/ic-accept/shots'; fs.mkdirSync(SHOT, {recursive:true});
const cfg = fs.readFileSync('/tmp/ic-accept/cfg.json','utf8');
const IMG = '/Users/mac/Documents/Dev/infinite-canvas/.worker-real-accept-market/assets/product.jpg';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
 const ctx = await chromium.launchPersistentContext('/tmp/ic-accept/profile', {headless:true, viewport:{width:1500,height:1000}});
 const page = ctx.pages()[0] || await ctx.newPage();
 const net=[]; page.on('response', async res=>{ const u=res.url(); if(/\/images\/(edits|generations)|\/v1\/images|\/images$/.test(u)){ try{ const t=await res.text(); net.push({url:u,status:res.status(),body:t.slice(0,4000)});}catch(e){net.push({url:u,status:res.status(),err:String(e).slice(0,100)});} }});
 const out={startedAt:new Date().toISOString(), steps:{}};
 await page.goto('http://127.0.0.1:3000/', {waitUntil:'domcontentloaded'});
 await page.evaluate((c)=>localStorage.setItem('infinite-canvas:ai_config_store', c), cfg);
 await page.goto('http://127.0.0.1:3000/tools/product-design/product-market-material', {waitUntil:'domcontentloaded'});
 await page.waitForSelector('text=开始生成', {timeout:30000});
 await sleep(1500);
 out.steps.before={history:(await page.locator('body').innerText()).match(/历史任务\s*\n?\s*(\d+)\s*条/)?.[1]||null};
 await page.screenshot({path:path.join(SHOT,'01-before.png'), fullPage:true});
 const inputs = await page.locator('input[type=file]').count();
 await page.setInputFiles('input[type=file]', IMG);
 await sleep(2500);
 const ta = page.locator('textarea').first();
 await ta.fill('商品：男士机械腕表。卖点：316L不锈钢表壳、蓝宝石镜面、夜光指针、50米防水、日本机芯。材质：不锈钢+真皮表带。尺寸：表径 40mm，表带 20mm。使用场景：商务通勤日常佩戴送礼。');
 // ensure amazon & 高级A+
 const amazon = page.locator('button', {hasText:'亚马逊'}).first(); if(await amazon.count()) await amazon.click();
 const aplus = page.locator('button', {hasText:'高级A+'}).first(); if(await aplus.count()) await aplus.click();
 await sleep(800);
 out.steps.form={banner:(await page.locator('text=/预计生成/').first().innerText().catch(()=>''))};
 await page.screenshot({path:path.join(SHOT,'02-form.png'), fullPage:true});
 const beforeKeys = await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tool-task:v1:task-')));
 const t0=Date.now();
 await page.locator('button', {hasText:'开始生成'}).first().click();
 let ok=false;
 for(let i=0;i<90;i++){ await sleep(2000); const n=await page.locator('[data-testid^="market-save-"]').count(); if(n>0){ok=true;break;} }
 out.steps.submit={ok,elapsedMs:Date.now()-t0};
 await page.screenshot({path:path.join(SHOT,'03-result.png'), fullPage:true});
 // task records
 out.tasks = await page.evaluate((bk)=>{ const now=Object.keys(localStorage).filter(k=>k.startsWith('tool-task:v1:task-')&&!bk.includes(k));
   return now.map(k=>{const t=JSON.parse(localStorage.getItem(k)); return {key:k, id:t.id, toolId:t.toolId, status:t.status, createdAt:t.createdAt, unitId:t.unitId||t.meta&&t.meta.unitId, items:(t.result&&t.result.items||[]).map(i=>({id:i.id,url:i.url,dataUrlPrefix:(i.dataUrl||'').slice(0,40)})), keys:Object.keys(t)};});
 }, beforeKeys);
 // dock task id attr
 out.dock = await page.evaluate(()=>[...document.querySelectorAll('[data-task-id]')].map(e=>({id:e.getAttribute('data-task-id'), status:e.getAttribute('data-task-status'), text:e.innerText.slice(0,120)})).slice(0,5));
 // image src + bytes
 const imgInfo = await page.evaluate(async()=>{ const im=[...document.querySelectorAll('img')].filter(i=>i.closest('[data-testid^="market-"]')||i.naturalWidth>400); const el=im[im.length-1]; if(!el) return null; const src=el.currentSrc||el.src; let b64=null, mime=null;
   try{ const r=await fetch(src); const b=await r.blob(); mime=b.type; const ab=await b.arrayBuffer(); let s=''; const u=new Uint8Array(ab); for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode.apply(null,u.subarray(i,i+8192)); b64=btoa(s);}catch(e){ return {src, err:String(e)}; }
   return {src, w:el.naturalWidth, h:el.naturalHeight, mime, b64}; });
 if(imgInfo && imgInfo.b64){ const buf=Buffer.from(imgInfo.b64,'base64'); fs.writeFileSync(path.join(SHOT,'result-image.png'), buf);
   out.image={src:imgInfo.src,w:imgInfo.w,h:imgInfo.h,mime:imgInfo.mime,bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex'),file:path.join(SHOT,'result-image.png')}; } else out.image=imgInfo;
 out.network = net;
 // actions: save
 const saveBtn = page.locator('[data-testid^="market-save-"]').first();
 await saveBtn.click(); await sleep(2500);
 out.steps.save={toast:await page.locator('[data-testid="tool-result-feedback"], [role=status]').last().innerText().catch(()=>''), label:await saveBtn.innerText().catch(()=>'')};
 await page.screenshot({path:path.join(SHOT,'04-saved.png'), fullPage:true});
 const canvasBtn = page.locator('[data-testid^="market-canvas-"]').first();
 await canvasBtn.click(); await sleep(2500);
 out.steps.canvas={toast:await page.locator('[data-testid="tool-result-feedback"], [role=status]').last().innerText().catch(()=>''), label:await canvasBtn.innerText().catch(()=>'')};
 await page.screenshot({path:path.join(SHOT,'05-canvas.png'), fullPage:true});
 // fresh reload
 await page.reload({waitUntil:'domcontentloaded'}); await sleep(4000);
 const body=(await page.locator('body').innerText());
 out.steps.reload={historyCount: body.match(/历史任务\s*\n?\s*(\d+)\s*条/)?.[1]||null, resultCards: await page.locator('[data-testid^="market-save-"]').count(), hasImage: await page.locator('img[alt]').count(), summary: body.match(/共\s*\d+\s*屏[^\n]*/)?.[0]||null};
 await page.screenshot({path:path.join(SHOT,'06-after-reload.png'), fullPage:true});
 out.doneAt=new Date().toISOString();
 fs.writeFileSync('/tmp/ic-accept/run.json', JSON.stringify(out,null,2));
 console.log(JSON.stringify({ok:out.steps.submit, image:out.image&&{...out.image,b64:undefined}, reload:out.steps.reload, tasks:out.tasks, net:net.map(n=>({url:n.url,status:n.status,bodyHead:(n.body||'').slice(0,160)}))},null,2));
 await ctx.close();
})().catch(e=>{console.error('FAIL', e); process.exit(1);});
