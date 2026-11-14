
import { chromium } from "playwright";
import fs from "fs";
const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const b = await chromium.launch();
const out = {};
for (const [id, c] of Object.entries(cfg)) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await p.goto("http://127.0.0.1:3000" + c.route, { waitUntil: "networkidle", timeout: 45000 });
  } catch (e) { await p.waitForTimeout(3000); }
  await p.waitForTimeout(2500);
  const res = await p.evaluate((needles) => {
    const norm = s => (s || "").replace(/\s+/g, "");
    const body = norm(document.body.innerText);
    const tabs = [...document.querySelectorAll('[role="tab"]')].map(e => e.textContent.trim());
    const hit = {};
    for (const n of needles) {
      const nn = norm(n);
      let where = null;
      if (body.includes(nn)) where = "text";
      else {
        const el = [...document.querySelectorAll("*")].find(e => norm(e.textContent) === nn && e.children.length === 0);
        if (el) where = "exact-el";
      }
      hit[n] = where;
    }
    return { hit, tabs, url: location.pathname };
  }, c.needles);
  out[id] = res;
  await p.close();
}
await b.close();
console.log(JSON.stringify(out, null, 1));
