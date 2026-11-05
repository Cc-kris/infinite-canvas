// Read-only E2E helper for linkfox vs local comparison (no source changes).
export const BASE = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/e2e-1to1/20261102";

export async function fixViewport(page, w = 1600, h = 1000) {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await page.waitForTimeout(400);
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  if (vp.w !== w || vp.h !== h) throw new Error("viewport mismatch " + JSON.stringify(vp));
  return vp;
}

export async function shot(page, path) {
  return page.screenshot({ path });
}

// Dismiss first-visit product tours (announcement popovers), never generation buttons.
export async function dismissTours(page) {
  let n = 0;
  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "我知道了");
      if (b) { b.click(); return "clicked"; }
      return "none";
    });
    if (r === "none") break;
    n++;
    await page.waitForTimeout(600);
  }
  return n;
}

export async function collect(page) {
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh; };
    const text = (document.body.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const controls = [...document.querySelectorAll("input,textarea,select,button,[role=button],[role=tab],[role=radio],[role=switch],[role=combobox]")]
      .filter(vis).slice(0, 160)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        type: el.getAttribute("type"),
        checked: el.getAttribute("aria-checked"),
        label: (el.innerText || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50),
        r: rect(el),
      }));
    const blocks = [...document.querySelectorAll("main,section,aside,div")]
      .filter(vis).map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((o) => o.r.width > 240 && o.r.height > 180).slice(0, 22)
      .map((o) => ({ cls: (o.el.className || "").toString().slice(0, 80), r: rect(o.el), t: (o.el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60) }));
    return { vw, vh, scrollH: document.documentElement.scrollHeight, bodyBg: getComputedStyle(document.body).backgroundColor, text, controls, blocks };
  });
}

export async function clickText(page, txt, scope = "body") {
  return page.evaluate(({ txt, scope }) => {
    const root = scope === "body" ? document : document.querySelector(scope);
    if (!root) return "no-scope";
    const els = [...root.querySelectorAll("*")].filter((x) => x.children.length === 0 || /button|BUTTON|tab|radio/.test(x.className || ""));
    let el = els.find((x) => ((x.innerText || x.textContent || "").trim()) === txt);
    if (!el) el = [...root.querySelectorAll("button,[role=tab],[role=radio],[role=button]")].find((x) => ((x.innerText || "").trim()) === txt);
    if (!el) return "not-found";
    el.click();
    return "clicked";
  }, { txt, scope });
}

export async function log(label, value) {
  console.log("## " + label + " => " + JSON.stringify(value).slice(0, 2200));
}
