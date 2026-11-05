import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
for (const id of ["AI_POSTURE","AI_DRESSING_V2","AI_WEARABLE","PRODUCT_SCENE"]) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,160)); });
  p.on("pageerror", e => errs.push("PAGEERROR "+String(e).slice(0,160)));
  await p.goto(`http://127.0.0.1:3000/tools/product-design/${id}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(4000);
  const info = await p.evaluate(() => {
    const q = s => !!document.querySelector(s);
    const body = document.body.innerText.replace(/\s+/g," ");
    return {
      url: location.pathname,
      workspaceEl: q('[data-testid="tool-workspace"]'),
      dock: q('[data-testid="tool-history-dock"]'),
      placeholder: q('[data-testid="workspace-placeholder"]'),
      textLen: body.length,
      has历史: body.includes("历史"),
      headText: body.slice(0, 240),
      tailText: body.slice(-240),
    };
  });
  console.log(id, JSON.stringify({...info, errs: errs.slice(0,3)}));
  await p.close();
}
await b.close();
