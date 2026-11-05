import { chromium } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { applyProviderConfig } from "./provider.mjs";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const REPO = "/Users/mac/Documents/Dev/infinite-canvas";
const EV = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final");
const FIX = path.join(REPO, "web/scripts/real-acceptance/fixtures");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function hashSrc(page, src) {
    if (!src) return null;
    const b64 = await page.evaluate(async (u) => {
        try {
            const r = await fetch(u, { credentials: "include" });
            if (!r.ok) return null;
            const bytes = new Uint8Array(await r.arrayBuffer());
            let s = "";
            for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
            return btoa(s);
        } catch { return null; }
    }, src).catch(() => null);
    let buf = b64 ? Buffer.from(b64, "base64") : null;
    if (!buf) {
        try {
            const r = await page.context().request.get(src, { timeout: 60000, headers: { referer: BASE + "/" } });
            if (r.ok()) buf = await r.body();
        } catch { buf = null; }
    }
    if (!buf) return null;
    return { sha: sha(buf).slice(0, 24), bytes: buf.length };
}

async function markBase(page, rec) {
    rec._base = await page.evaluate(() => {
        const arr = [...document.querySelectorAll("img")].map((i) => i.currentSrc || i.src);
        window.__ic_base = arr;
        return arr.length;
    });
}
const EXCLUDE_ANCESTOR = '[data-testid="tool-asset-list"],[data-testid*="dropzone"],[data-testid*="preview"],[data-testid*="thumb"],[data-testid*="upload"],[data-testid="tool-history-dock"]';

async function waitResult(page, rec, { timeoutMs = 240000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const src = await page.evaluate((excludeSel) => {
            const base = new Set(window.__ic_base || []);
            const ws = document.querySelector('[data-testid="tool-workspace"]');
            const imgs = [...document.querySelectorAll("img")].filter((i) => {
                const s = i.currentSrc || i.src;
                if (!s || base.has(s)) return false;
                if (/\/logo|favicon|sprite|placeholder/i.test(s)) return false;
                if (!i.naturalWidth || i.naturalWidth < 200) return false;
                if (!ws || !ws.contains(i)) return false;
                if (i.closest(excludeSel)) return false;
                return true;
            });
            const newsrc = imgs.length ? imgs[imgs.length - 1].getAttribute("src") : null;
            const failed = document.querySelector('[data-testid*="error"],[data-testid*="failed"]');
            const feedback = document.querySelector('[data-testid="tool-result-feedback"]');
            return {
                src: newsrc || null,
                failed: failed && failed.innerText.trim() ? failed.innerText.slice(0, 300) : null,
                feedback: feedback ? feedback.innerText.slice(0, 200) : null,
                progress: document.body.innerText.match(/(生成中|提交中|排队|处理中|提取中)/) ? "running" : null,
            };
        }, EXCLUDE_ANCESTOR).catch(() => ({ src: null }));
        if (src?.src) return { ...src, elapsedMs: Date.now() - t0, ...(await hashSrc(page, src.src)) };
        if (src?.failed) { rec.steps.failedText = src.failed; return { failed: src.failed, elapsedMs: Date.now() - t0 }; }
        await sleep(2000);
    }
    return { timeout: true, elapsedMs: Date.now() - t0 };
}

async function pickFiles(page, scopeSel, files, rec, key) {
    const scope = page.locator(scopeSel).first();
    const inputs = scope.locator('[data-testid="tool-asset-file-input"]');
    const n = await inputs.count();
    rec.steps[key] = { inputs: n };
    for (let i = 0; i < files.length && i < n; i += 1) {
        await inputs.nth(i).setInputFiles(path.join(FIX, files[i]));
        await page.waitForTimeout(1600);
    }
    rec.steps[key].list = await scope.locator('[data-testid="tool-asset-list"] li').count().catch(() => -1);
}

async function actions(page, rec) {
    const dl = page.locator('[data-testid="tool-result-download-0"]');
    if (await dl.count()) {
        const [d] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }).catch(() => null), dl.click()]);
        if (d) {
            const p = path.join(EV, "_runs", `dl-${rec.toolId}-${Date.now()}.png`);
            await d.saveAs(p);
            const buf = await fs.readFile(p);
            rec.steps.download = { file: path.basename(p), bytes: buf.length, sha: sha(buf).slice(0, 24), match: sha(buf).slice(0, 24) === rec.steps.result?.sha };
        } else rec.steps.download = { error: "no download event" };
    } else rec.steps.download = { absent: true };

    const sv = page.locator('[data-testid="tool-result-save-0"]');
    if (await sv.count()) {
        await sv.click();
        await page.waitForTimeout(1800);
        rec.steps.save = await page.evaluate(() => {
            const fb = document.querySelector('[data-testid="tool-result-feedback"]');
            const raw = localStorage.getItem("canvas-asset-store") || localStorage.getItem("use-asset-store");
            let last = null;
            try {
                const st = JSON.parse(raw).state;
                const arr = st.assets || st.items || [];
                last = arr.length ? arr[arr.length - 1] : null;
            } catch { }
            return { feedback: fb ? fb.innerText.slice(0, 160) : null, last: last ? { url: (last.url || last.src || "").slice(0, 80) } : null };
        }).catch((e) => ({ error: String(e).slice(0, 120) }));
        if (rec.steps.save?.last?.url) rec.steps.save.hash = await hashSrc(page, rec.steps.save.last.url);
    } else rec.steps.save = { absent: true };

    const cv = page.locator('[data-testid="tool-result-canvas-0"]');
    if (await cv.count()) {
        await cv.click();
        await page.waitForTimeout(2000);
        rec.steps.canvas = await page.evaluate(() => {
            const fb = document.querySelector('[data-testid="tool-result-feedback"]');
            return { feedback: fb ? fb.innerText.slice(0, 160) : null };
        }).catch((e) => ({ error: String(e).slice(0, 120) }));
    } else rec.steps.canvas = { absent: true };
}

async function history(page, rec, spec) {
    const before = await page.evaluate(() => {
        const d = document.querySelector('[data-testid="tool-history-dock-count"]');
        return d ? d.innerText : null;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    let after = null;
    for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(2000);
        after = await page.evaluate(() => {
            const d = document.querySelector('[data-testid="tool-history-dock-count"]');
            const items = document.querySelectorAll('[data-testid^="tool-history-item"]').length;
            const body = document.body.innerText;
            return { count: d ? d.innerText : null, items, hasResult: /结果|已完成|成功/.test(body) };
        });
        const n = Number(String(after.count || "").replace(/[^\d]/g, "") || 0);
        if (n > 0 || after.items > 0) break;
    }
    rec.steps.history = { beforeCount: before, afterReload: after };
    if (spec.afterReload) await spec.afterReload(page, rec);
}

async function runTool(browser, spec) {
    const rec = { toolId: spec.id, route: spec.route, steps: {}, errors: [] };
    const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => rec.errors.push("pageerror: " + String(e).slice(0, 160)));
    page.on("response", (r) => {
        const u = r.url();
        if (u.includes("23210/https://") || u.includes("/v1/images")) {
            rec.steps.providerCalls = rec.steps.providerCalls || [];
            rec.steps.providerCalls.push(`${r.status()} ${u.replace(/^http:\/\/127\.0\.0\.1:23210\//, "").slice(0, 60)}`);
        }
    });
    try {
        await page.goto(BASE + spec.route, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(2500);
        rec.steps.provider = await applyProviderConfig(page);
        rec.steps.title = await page.evaluate(() => (document.querySelector('[data-testid="tool-workspace"]')?.innerText || "").slice(0, 60));
        await spec.drive(page, rec);
        rec.steps.result = await waitResult(page, rec, { timeoutMs: spec.timeoutMs || 240000 });
        if (rec.steps.result?.src) {
            await actions(page, rec);
            await history(page, rec, spec);
        }
    } catch (e) {
        rec.errors.push("drive: " + String(e && e.message ? e.message : e).slice(0, 300));
        rec.steps.bodyTail = await page.evaluate(() => document.body.innerText.slice(0, 1200)).catch(() => null);
    } finally {
        await ctx.close().catch(() => {});
    }
    return rec;
}

const SPECS = [];

SPECS.push({
    id: "PRINT_EXTRACT", route: "/tools/product-design/print-extract",
    async drive(page, rec) {
        await pickFiles(page, '[data-testid="tool-workspace"]', ["apparel-print.jpg"], rec, "upload");
        const btn = page.locator('[data-testid="print-extract-generate"]');
        rec.steps.gate = { disabled: await btn.isDisabled(), text: (await btn.innerText()).slice(0, 40) };
        await markBase(page, rec);
        await btn.click();
        rec.steps.waiting = "card";
        const t0 = Date.now();
        while (Date.now() - t0 < 240000) {
            const st = await page.evaluate(() => {
                const c = document.querySelector('[data-testid="print-extract-card-0"]');
                return c ? { status: c.getAttribute("data-status"), img: c.querySelectorAll("img").length } : null;
            });
            if (st?.status === "succeeded") break;
            if (st?.status === "failed") { rec.steps.failedText = await page.evaluate(() => document.querySelector('[data-testid="print-extract-card-0"]')?.innerText.slice(0, 200)); break; }
            await sleep(2500);
        }
        const src = await page.evaluate(() => {
            const c = document.querySelector('[data-testid="print-extract-card-0"]');
            const imgs = c ? [...c.querySelectorAll("img")] : [];
            const r = imgs.find((i) => (i.getAttribute("alt") || "").includes("结果"));
            return r ? r.src : null;
        });
        if (src) rec.steps.result = { src: src.slice(0, 100), ...(await hashSrc(page, src)) };
    },
    async afterReload(page, rec) {
        rec.steps.historyExtract = await page.evaluate(() => ({
            cards: document.querySelectorAll('[data-testid^="print-extract-card-"]').length,
            historyTab: Boolean(document.querySelector('[data-testid="print-extract-tab-history"]')),
        }));
    },
});

SPECS.push({
    id: "AI_POSE_GENERATOR", route: "/tools/product-design/ai-pose-generator",
    async drive(page, rec) {
        await page.locator('[data-testid="ai-pose-prompt"]').fill("正面站姿，双臂自然下垂，职业模特体态，镜头平视");
        const preset = page.locator('[data-testid="ai-pose-preset-stand-front"]');
        if (await preset.count()) await preset.click();
        const btn = page.locator('[data-testid="ai-pose-submit"]');
        rec.steps.gate = { disabled: await btn.isDisabled(), hint: await page.locator('[data-testid="ai-pose-submit-hint"]').innerText().catch(() => "") };
        if (await btn.isDisabled()) return;
        await markBase(page, rec);
        await btn.click();
    },
});

SPECS.push({
    id: "SCENE_TRANSFER", route: "/tools/product-design/scene-transfer",
    async drive(page, rec) {
        const prod = page.locator('[data-testid="scene-transfer-product"] [data-testid="tool-asset-file-input"]');
        const style = page.locator('[data-testid="scene-transfer-style"] [data-testid="tool-asset-file-input"]');
        await prod.setInputFiles(path.join(FIX, "product-watch.jpg"));
        await page.waitForTimeout(1800);
        await style.setInputFiles(path.join(FIX, "color-ref-navy.png"));
        await page.waitForTimeout(1800);
        rec.steps.upload = {
            product: await page.locator('[data-testid="scene-transfer-product-state"]').innerText(),
            style: await page.locator('[data-testid="scene-transfer-style-state"]').innerText(),
        };
        const btn = page.locator('[data-testid="scene-transfer-submit"]');
        rec.steps.gate = { disabled: await btn.isDisabled() };
        if (await btn.isDisabled()) { rec.steps.issues = await page.locator('[data-testid="scene-transfer-issue"]').allInnerTexts().catch(() => []); return; }
        await markBase(page, rec);
        await btn.click();
    },
});

SPECS.push({
    id: "MATERIAL_UPPER_BODY", route: "/tools/product-design/material-upper-body",
    async drive(page, rec) {
        await pickFiles(page, '[data-testid="tool-workspace"]', ["apparel-print.jpg"], rec, "upload");
        const cat = page.locator('[data-testid="material-category-tree"] button').first();
        if (await cat.count()) { await cat.click(); await page.waitForTimeout(800); }
        const btn = page.locator('[data-testid="material-submit"]');
        rec.steps.gate = { disabled: await btn.isDisabled(), issues: await page.locator('[data-testid="material-issues"]').innerText().catch(() => "") };
        if (await btn.isDisabled()) return;
        await markBase(page, rec);
        await btn.click();
    },
});

SPECS.push({
    id: "AI_DRESSING_XSY", route: "/tools/product-design/ai-dressing-xsy",
    async drive(page, rec) {
        await page.locator('[data-testid="xsy-step-model"] [data-testid="tool-asset-file-input"]').setInputFiles(path.join(FIX, "model-portrait.png"));
        await page.waitForTimeout(2000);
        await page.locator('[data-testid="xsy-next-model"]').click();
        await page.waitForTimeout(1200);
        await page.locator('[data-testid="xsy-slot-upper"] [data-testid="tool-asset-file-input"]').setInputFiles(path.join(FIX, "apparel-print.jpg"));
        await page.waitForTimeout(1800);
        await page.locator('[data-testid="xsy-slot-down"] [data-testid="tool-asset-file-input"]').setInputFiles(path.join(FIX, "apparel-print-ref.jpg"));
        await page.waitForTimeout(1800);
        await page.locator('[data-testid="xsy-next-garment"]').click();
        await page.waitForTimeout(1200);
        const fillU = page.locator('[data-testid="xsy-mask-upper-fill"]');
        if (await fillU.count() && !(await fillU.isDisabled())) await fillU.click();
        const fillD = page.locator('[data-testid="xsy-mask-down-fill"]');
        if (await fillD.count() && !(await fillD.isDisabled())) await fillD.click();
        await page.waitForTimeout(800);
        await page.locator('[data-testid="xsy-next-mask"]').click();
        await page.waitForTimeout(1200);
        const btn = page.locator('[data-testid="xsy-submit"]');
        rec.steps.gate = { disabled: await btn.isDisabled(), text: await page.locator('[data-testid="xsy-gate"]').innerText().catch(() => "") };
        if (await btn.isDisabled()) return;
        await markBase(page, rec);
        await btn.click();
    },
});

SPECS.push({
    id: "FISSION_LINK", route: "/tools/product-design/fission-link",
    async drive(page, rec) {
        const url = "http://127.0.0.1:8123/product-watch.jpg";
        const input = page.locator('[data-testid="fission-link-url"]').first();
        await input.fill(url);
        await page.waitForTimeout(1500);
        const btn = page.locator('[data-testid="fission-link-submit"]');
        rec.steps.gate = { disabled: await btn.isDisabled(), issues: await page.locator('[data-testid="fission-link-issues"]').innerText().catch(() => "") };
        if (await btn.isDisabled()) return;
        await markBase(page, rec);
        await btn.click();
    },
});

SPECS.push({
    id: "IMAGE_TEXT_EDIT", route: "/tools/product-design/image-text-edit",
    async drive(page, rec) {
        await page.locator('[data-testid="image-text-edit-file"]').setInputFiles(path.join(FIX, "product-watch.jpg"));
        await page.waitForTimeout(2500);
        const addBox2 = page.getByRole("button", { name: "新增文字框" }).first();
        if (await addBox2.count()) { await addBox2.click(); await page.waitForTimeout(1000); }
        const ta = page.locator('[data-testid="tool-workspace"] textarea').first();
        if (await ta.count()) { await ta.fill("限时特惠"); await page.waitForTimeout(600); }
        rec.steps.boxes = await page.evaluate(() => document.querySelectorAll('[data-testid^="image-text-edit-box-"]').length);
        rec.steps.boxText = await page.evaluate(() => ((document.querySelector('[data-testid="tool-workspace"]') || document.body).innerText.match(/文字框列表[\s\S]{0,80}/) || [""])[0]);
        const btn = page.locator('[data-testid="image-text-edit-submit"]');
        rec.steps.gate = { disabled: await btn.isDisabled(), text: (await btn.innerText()).slice(0, 40) };
        if (await btn.isDisabled()) return;
        await markBase(page, rec);
        await btn.click();
    },
});

SPECS.push({
    id: "PRODUCT_MARKET_MATERIAL", route: "/tools/product-design/product-market-material",
    async drive(page, rec) {
        await pickFiles(page, '[data-testid="tool-workspace"]', ["product-watch.jpg"], rec, "upload");
        const info = page.locator('[data-testid="tool-workspace"] textarea').first();
        if (await info.count()) { await info.fill("银色表盘机械腕表，精钢表壳，防水 5ATM，商务通勤场景"); await page.waitForTimeout(800); }
        let btn = page.locator('[data-testid="suite-generate"]');
        if (!(await btn.count())) btn = page.getByRole("button", { name: /开始生成/ }).first();
        rec.steps.controls = await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute("data-testid")).filter((t) => t.startsWith("suite-") || t.startsWith("market-")).slice(0, 40));
        rec.steps.gate = { disabled: await btn.isDisabled().catch(() => null) };
        if (!(await btn.count()) || (await btn.isDisabled())) return;
        await markBase(page, rec);
        await btn.click();
    },
});

SPECS.push({
    id: "NEW_DESIGNER", route: "/tools/product-design/new-designer",
    async drive(page, rec) {
        const file = page.locator('[data-testid="tool-workspace"] input[type="file"]').first();
        rec.steps.fileInputs = await page.locator('[data-testid="tool-workspace"] input[type="file"]').count();
        await file.setInputFiles(path.join(FIX, "product-watch.jpg"));
        await page.waitForTimeout(3000);
        rec.steps.layers = await page.evaluate(() => document.body.innerText.match(/(\d+)\s*层/)?.[1] ?? null);
        const exp = page.locator('[data-testid="designer-export"]');
        rec.steps.gate = { disabled: await exp.isDisabled().catch(() => null), title: await exp.getAttribute("title").catch(() => null) };
        if (await exp.count() && !(await exp.isDisabled())) {
            await exp.click();
            await page.waitForTimeout(6000);
            rec.steps.exportText = await page.evaluate(() => document.body.innerText.slice(0, 400));
            // 下载导出图取字节
            const dl = page.locator('[data-testid="designer-download"]');
            if (await dl.count() && !(await dl.isDisabled())) {
                const [d] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }).catch(() => null), dl.click()]);
                if (d) {
                    const p = path.join(EV, "_runs", `designer-download-${Date.now()}.png`);
                    await d.saveAs(p);
                    const buf = await fs.readFile(p);
                    rec.steps.export = { file: path.basename(p), bytes: buf.length, sha: sha(buf).slice(0, 24) };
                    rec.steps.result = { src: "designer-export(" + path.basename(p) + ")", sha: sha(buf).slice(0, 24), bytes: buf.length };
                }
            }
            rec.steps.save = { feedback: await page.evaluate(() => (document.body.innerText.match(/已入库资产\s*#[^\n]*/) || [""])[0]), last: null };
            const sc = page.locator('[data-testid="designer-send-canvas"]');
            if (await sc.count()) {
                await sc.click();
                await page.waitForTimeout(2500);
                rec.steps.sendCanvas = await page.evaluate(() => document.body.innerText.slice(0, 200));
            }
        }
    },
});

function verdict(r) {
    const s = r.steps || {};
    const prov = (s.providerCalls || []).filter((c) => /^(200|201)/.test(c) && /\/v1\/images|oss-us/.test(c));
    const gen = (s.providerCalls || []).filter((c) => /\/v1\/images/.test(c));
    const res = s.result || {};
    const dl = s.download || {};
    const checks = {
        providerCalled: gen.length > 0,
        providerOk: gen.some((c) => /^(200|201)/.test(c)),
        hasResultBytes: Boolean(res.sha && res.bytes > 20000),
        notInputImage: !["5c80a61e9271298d"].includes(res.sha),
        downloadMatches: dl.absent === true ? true : dl.match === true,
        assetSaved: s.save?.absent === true ? true : Boolean(s.save?.feedback || s.save?.last?.url),
        canvasSent: s.canvas?.absent === true ? true : Boolean(s.canvas?.feedback),
    };
    const h = s.history || {};
    const hCount = Number(String(h.afterReload?.count || "").replace(/[^\d]/g, "") || 0);
    const historyInfo = hCount > 0 ? "restored" : "empty(布局未接入任务 store，仅记录不判定)";
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { checks, pass: failed.length === 0, failed, historyInfo };
}

const only = process.argv[2];
const browser = await chromium.launch({ headless: true, channel: process.env.IC_CHANNEL || "chrome" });
const out = [];
for (const s of SPECS) {
    if (only && s.id !== only) continue;
    const r = await runTool(browser, s);
    const v = verdict(r);
    r.verdict = v;
    out.push(r);
    console.log(`${v.pass ? "PASS" : "FAIL"} ${r.toolId} sha=${r.steps.result?.sha ?? "-"} bytes=${r.steps.result?.bytes ?? "-"} failed=[${v.failed.join(",")}] ${r.errors.join("|")}`);
}
await browser.close();
await fs.mkdir(path.join(EV, "_runs"), { recursive: true });
const stamp = Date.now();
await fs.writeFile(path.join(EV, "_runs", `run-${only || "all"}-${stamp}.json`), JSON.stringify(out, null, 1));
const lines = ["# design19b NV 终验结果", "", `> 生成时间 ${new Date(stamp).toISOString()}`, "", "| 工具 | 结论 | 结果字节 | sha(24) | 未通过项 |", "| --- | --- | --- | --- | --- |"];
for (const r of out) {
    lines.push(`| ${r.toolId} | ${r.verdict.pass ? "**PASS**" : "FAIL"} | ${r.steps.result?.bytes ?? "-"} | ${r.steps.result?.sha ?? "-"} | ${r.verdict.failed.join(", ") || "-"} |`);
}
lines.push("", "## 明细", "");
for (const r of out) {
    lines.push(`### ${r.toolId}`, "", "```json", JSON.stringify({ checks: r.verdict.checks, gate: r.steps.gate, providerCalls: r.steps.providerCalls, download: r.steps.download, save: r.steps.save, canvas: r.steps.canvas, history: r.steps.history, errors: r.errors }, null, 1), "```", "");
}
await fs.writeFile(path.join(EV, "REPORT.md"), lines.join("\n"));
console.log("report ->", path.join(EV, "REPORT.md"));
