/**
 * VIDEO_TRANSLATION 真实验收：真 Chrome + 真文件上传 + 真 provider 调用（sub2api /v1/videos）。
 * 密钥只从本机 18471 服务读取（内存传递），绝不落盘/打印。
 *
 * 用法：cd web && node scripts/real-acceptance/accept-video-translation.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, BASE_URL, evidenceDir, sleep } from "./lib.mjs";

const ROUTE = "/tools/ai-video/video-translation";
const FIXTURE = process.env.IC_FIXTURE
    || path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TO_VIDEO/06-result-video.mp4");
const KEY_SERVER = process.env.IC_KEY_SERVER || "http://127.0.0.1:18471/";

const log = {
    tool: "VIDEO_TRANSLATION",
    route: ROUTE,
    ok: false,
    realProviderCall: false,
    steps: [],
    actions: {},
    network: [],
    error: null,
    result: null,
    elapsedMs: 0,
};
const t0 = Date.now();

async function main() {
    const secret = await (await fetch(KEY_SERVER)).json();
    const browser = await launchBrowser({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const page = await context.newPage();

    page.on("response", async (res) => {
        const url = res.url();
        if (!/\/videos(\?|$)/.test(url)) return;
        let body = "";
        try { body = (await res.text()).slice(0, 800); } catch { body = "<no body>"; }
        log.network.push({ at: new Date().toISOString(), method: res.request().method(), url, status: res.status(), body });
    });
    page.on("pageerror", (err) => log.network.push({ pageerror: String(err).slice(0, 300) }));

    try {
        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
        // 注入渠道（等价用户在 /config 手工填写）；只改 channels/videoModel，不动其它字段
        const cfg = await page.evaluate(async ({ baseUrl, apiKey, model }) => {
            const mod = await import("/src/stores/use-config-store.ts");
            const store = mod.useConfigStore;
            const prev = store.getState().config;
            const channels = [
                ...(prev.channels || []).filter((c) => c.id !== "sub2api-real"),
                {
                    id: "sub2api-real",
                    name: "sub2api-real",
                    baseUrl,
                    apiKey,
                    apiFormat: "openai",
                    models: [{ name: model, capability: "video" }],
                },
            ];
            store.setState({
                config: { ...prev, channels, channelMode: "local", videoModel: `sub2api-real::${model}` },
            });
            const now = store.getState().config;
            return { channels: now.channels.map((c) => c.id), videoModel: now.videoModel };
        }, { baseUrl: secret.baseUrl, apiKey: secret.apiKey, model: "MiniMax-H3" });
        log.actions.config = cfg;
        log.steps.push("config-injected");

        await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.body.innerText.includes("视频翻译"), undefined, { timeout: 30000 });
        await sleep(1200);

        // 真文件上传
        await page.setInputFiles('input[type="file"]', FIXTURE);
        await page.waitForFunction(() => /1\s*\/\s*1\s*个/.test(document.body.innerText), undefined, { timeout: 60000 });
        log.actions.source = await page.evaluate(() => {
            const el = [...document.querySelectorAll("*")].find((n) => n.textContent?.includes("· video/mp4"));
            return { text: el ? el.textContent.trim().slice(0, 120) : document.body.innerText.match(/[\w.-]+\.mp4/)?.[0] || null };
        });
        log.steps.push("uploaded");

        // 选 MiniMax-H3
        await page.locator('[role="combobox"]').first().click();
        await sleep(400);
        const opt = page.locator('[role="option"]', { hasText: "MiniMax-H3" }).first();
        if (await opt.count()) { await opt.click(); }
        await sleep(500);
        log.actions.model = await page.locator('[role="combobox"]').first().innerText();

        // 口型同步门禁（若开启且通道无能力 → 一键关闭继续）
        const gate = page.locator('button:has-text("关闭口型同步后继续")');
        if (await gate.count()) { await gate.first().click(); await sleep(500); log.actions.lipSyncGate = "closed-by-button"; }

        await page.screenshot({ path: path.join(await evidenceDir("VIDEO_TRANSLATION"), "before-submit.png") }).catch(() => {});

        // 真提交
        const submit = page.locator('button:has-text("立即生成")').first();
        log.actions.submitDisabled = await submit.isDisabled();
        const blocked = await page.evaluate(() => {
            const p = [...document.querySelectorAll("p")].map((n) => n.innerText.trim()).filter((t) => /未上传|需要|不可用|没有/.test(t));
            return p.slice(0, 3);
        });
        log.actions.blockedHints = blocked;
        if (await submit.isDisabled()) {
            log.error = `submit disabled: ${JSON.stringify(blocked)}`;
            throw new Error(log.error);
        }
        await submit.click();
        log.steps.push("submitted");
        log.realProviderCall = true;

        // 等结果/报错
        await page.waitForFunction(
            () => {
                const t = document.body.innerText;
                if (/翻译中/.test(t)) return false;
                return /失败|错误|HTTP |已完成|翻译结果|历史任务|没有口型|提交失败/.test(t);
            },
            undefined,
            { timeout: 300000 },
        ).catch(() => {});
        await sleep(2000);

        log.actions.after = await page.evaluate(() => {
            const t = document.body.innerText;
            const errs = [...document.querySelectorAll('[role="alert"], p.text-destructive, .text-destructive')].map((n) => n.innerText.trim()).filter(Boolean);
            return { alerts: errs.slice(0, 6), tail: t.slice(-1200) };
        });
        const dir = await evidenceDir("VIDEO_TRANSLATION");
        await page.screenshot({ path: path.join(dir, "after-submit.png"), fullPage: false }).catch(() => {});
        const videos = log.network.filter((n) => n.url);
        const success = videos.find((n) => n.status >= 200 && n.status < 300);
        log.ok = Boolean(success);
        log.result = { submitAttempts: videos.length, responses: videos.map((v) => ({ status: v.status, body: v.body.slice(0, 300) })) };
    } catch (error) {
        log.error = String(error && error.message ? error.message : error).slice(0, 600);
        try {
            const dir = await evidenceDir("VIDEO_TRANSLATION");
            await page.screenshot({ path: path.join(dir, "error.png") }).catch(() => {});
            log.actions.domOnError = await page.evaluate(() => ({
                alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.innerText.trim()).slice(0, 5),
                tail: document.body.innerText.slice(-800),
            }));
        } catch { /* ignore */ }
    } finally {
        log.elapsedMs = Date.now() - t0;
        const dir = await evidenceDir("VIDEO_TRANSLATION");
        await fs.writeFile(path.join(dir, "run-real.json"), JSON.stringify(log, null, 2));
        console.log(JSON.stringify({ ok: log.ok, error: log.error, steps: log.steps, network: log.network.map((n) => ({ status: n.status, body: n.body?.slice(0, 220) })), actions: log.actions }, null, 2));
        await browser.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
