/**
 * R9 视频缺口真实验收（VIDEO_TRANSLATION / VIDEO_CONCAT）。
 *
 * 边界：
 * - 真 Chrome + 持久 profile（history / IndexedDB 跨刷新保留，历史靠应用自身落库，不注入）；
 * - 真文件上传 + 真 provider（sub2api /v1/videos，MiniMax-H3）；multipart 被拒时走应用自身的
 *   「发布到公网基址 → JSON 重发」兜底（media-publish）；
 * - 密钥只从本机取钥服务读（内存传递），不落盘不打印。
 *
 * 用法：
 *   cd web && node scripts/real-acceptance/accept-r9-video-gaps.mjs --tool=translation
 *   cd web && node scripts/real-acceptance/accept-r9-video-gaps.mjs --tool=concat
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.IC_BASE_URL || "http://127.0.0.1:3000";
const PROXY_URL = process.env.IC_PROXY_URL || "http://127.0.0.1:23220";
const MEDIA_HOST = process.env.IC_MEDIA_HOST || "";
const KEY_SERVER = process.env.IC_KEY_SERVER || "http://127.0.0.1:18472/";
const EVIDENCE_ROOT = process.env.IC_EVIDENCE_ROOT
    || path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance");
const FIX_VIDEO = process.env.IC_FIXTURE
    || path.resolve(process.cwd(), "../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TO_VIDEO/06-result-video.mp4");
const FIX_CLIP_A = process.env.IC_CLIP_A || "/tmp/ic_cors_root/small.mp4";
const FIX_CLIP_B = process.env.IC_CLIP_B || "/tmp/ic_cors_root/clip-b.mp4";
const FIX_COVER = process.env.IC_COVER || "/tmp/ic_cors_root/product-watch.jpg";

const TOOL = (process.argv.find((a) => a.startsWith("--tool=")) || "--tool=translation").split("=")[1];

const SPECS = {
    translation: {
        toolId: "VIDEO_TRANSLATION",
        route: "/tools/ai-video/video-translation",
        waitText: "视频翻译",
        submit: 'button:has-text("立即生成")',
        files: [FIX_VIDEO],
        extra: async () => {},
    },
    concat: {
        toolId: "VIDEO_CONCAT",
        route: "/tools/ai-video/video-concat",
        waitText: "视频拼接",
        submit: '[data-testid="video-concat-submit"]',
        files: [FIX_CLIP_A, FIX_CLIP_B],
        extra: async (page) => {
            // 封面：优先从片段抓帧（页面自身能力），失败再上传静态图
            const grab = page.locator('[data-testid="video-concat-grab-cover"]');
            if (await grab.count()) {
                await grab.first().click().catch(() => {});
                await page.waitForTimeout(2500);
            }
            const coverInput = page.locator('input[type="file"][accept*="image"]');
            const hasCover = await page.locator('[data-testid="video-concat-cover-name"]').count();
            if (!hasCover && (await coverInput.count())) {
                await coverInput.last().setInputFiles(FIX_COVER);
                await page.waitForTimeout(1200);
            }
        },
    },
};

const spec = SPECS[TOOL];
if (!spec) {
    console.error("unknown --tool, use translation|concat");
    process.exit(2);
}

const OUT = path.join(EVIDENCE_ROOT, spec.toolId);
const PROFILE = path.join("/tmp", `ic_r9_profile_${TOOL}`);
const record = {
    toolId: spec.toolId,
    route: spec.route,
    startedAt: new Date().toISOString(),
    config: { proxyUrl: PROXY_URL, mediaHostUrl: MEDIA_HOST },
    steps: [],
    calls: [],
    taskId: null,
    receipts: [],
    result: null,
    history: null,
    actions: {},
    issues: [],
};

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    const secret = await (await fetch(KEY_SERVER)).json();
    const context = await chromium.launchPersistentContext(PROFILE, {
        channel: "chrome",
        headless: true,
        viewport: { width: 1440, height: 960 },
        locale: "zh-CN",
        acceptDownloads: true,
    });
    const page = context.pages()[0] || (await context.newPage());

    page.on("response", async (res) => {
        const url = res.url();
        if (!/\/videos(\/|\?|$)/.test(url)) return;
        let body = "";
        try { body = (await res.text()).slice(0, 1200); } catch { body = "<no body>"; }
        const entry = { at: new Date().toISOString(), method: res.request().method(), url, status: res.status(), body };
        record.receipts.push(entry);
        if (res.request().method() === "POST" && res.status() >= 200 && res.status() < 300) {
            try {
                const json = JSON.parse(body);
                const id = json.id || json.request_id || json.task_id;
                if (id && !record.taskId) record.taskId = id;
            } catch { /* multipart/non-json receipt */ }
        }
    });
    page.on("pageerror", (e) => record.issues.push(`pageerror: ${String(e).slice(0, 300)}`));

    try {
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        record.config.injected = await page.evaluate(async ({ baseUrl, apiKey, model, proxyUrl, mediaHostUrl }) => {
            const mod = await import("/src/stores/use-config-store.ts");
            const store = mod.useConfigStore;
            const prev = store.getState().config;
            const channels = [
                ...(prev.channels || []).filter((c) => c.id !== "sub2api-real"),
                { id: "sub2api-real", name: "sub2api-real", baseUrl, apiKey, apiFormat: "openai",
                  models: [{ name: model, capability: "video" }] },
            ];
            store.setState({
                config: {
                    ...prev, channels, channelMode: "local", proxyEnabled: true, proxyUrl, mediaHostUrl,
                    videoModel: `sub2api-real::${model}`,
                },
            });
            const now = store.getState().config;
            return { channels: now.channels.map((c) => c.id), videoModel: now.videoModel, proxyUrl: now.proxyUrl, mediaHostUrl: now.mediaHostUrl };
        }, { baseUrl: secret.baseUrl, apiKey: secret.apiKey, model: "MiniMax-H3", proxyUrl: PROXY_URL, mediaHostUrl: MEDIA_HOST });
        record.steps.push("config-injected");

        await page.goto(`${BASE}${spec.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction((t) => document.body.innerText.includes(t), spec.waitText, { timeout: 30000 });
        await page.waitForTimeout(1200);

        // 真文件上传
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(spec.files);
        await page.waitForTimeout(2500);
        await spec.extra(page);
        record.steps.push("uploaded");
        record.actions.inputs = await page.evaluate(() => ({
            mp4Count: [...document.querySelectorAll("*")].filter((n) => /\.mp4/i.test(n.textContent || "")).length,
            cover: document.querySelector('[data-testid="video-concat-cover-name"]')?.textContent?.trim() ?? null,
            bodyHead: document.body.innerText.slice(0, 300),
        }));

        // 页面自身的能力阻断：模型无「口型同步」声明时必须先关闭再继续（真实 UI 路径）
        const lipSync = page.getByText("关闭口型同步后继续", { exact: false }).first();
        if (await lipSync.count()) {
            await lipSync.click().catch(() => {});
            await page.waitForTimeout(1500);
            record.actions.lipSyncBlocker = "clicked-关闭口型同步后继续";
        }
        await page.waitForTimeout(800);

        const submit = page.locator(spec.submit).first();
        await submit.scrollIntoViewIfNeeded().catch(() => {});
        record.actions.submitDisabled = await submit.isDisabled().catch(() => null);
        record.actions.blocked = await page.evaluate(() => {
            const nodes = [...document.querySelectorAll("p,span")].map((n) => n.innerText?.trim()).filter((t) => t && /缺少|不足|还没有|不可用|先上传/.test(t));
            return [...new Set(nodes)].slice(0, 6);
        });
        if (record.actions.submitDisabled) throw new Error(`submit disabled: ${JSON.stringify(record.actions.blocked)}`);
        await submit.click();
        record.steps.push("submitted");

        // 等待真实结果（或真实失败）
        await page.waitForFunction(
            () => {
                const video = document.querySelector('[data-testid="tool-result-video"]');
                if (video && video.readyState >= 1) return true;
                const t = document.body.innerText;
                return /失败|生成失败|错误|HTTP 4|HTTP 5/.test(t) && !/生成中|提交中|翻译中/.test(t);
            },
            undefined,
            { timeout: 900_000 },
        ).catch(() => record.issues.push("wait-result timeout"));
        await page.waitForTimeout(3000);
        record.steps.push("result-settled");

        const domAfter = await page.evaluate(() => {
            const v = document.querySelector('[data-testid="tool-result-video"]');
            return {
                hasVideo: Boolean(v),
                readyState: v?.readyState ?? null,
                src: v?.currentSrc || v?.getAttribute("src") || null,
                feedback: document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null,
                alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.innerText.trim()).filter(Boolean).slice(0, 5),
                tail: document.body.innerText.slice(-700),
            };
        });
        record.actions.domAfter = domAfter;
        await page.screenshot({ path: path.join(OUT, "after-submit.png"), fullPage: false }).catch(() => {});

        // 结果字节：从页面真取
        if (domAfter.src) {
            const bytes = await page.evaluate(async (src) => {
                const res = await fetch(src);
                const buf = new Uint8Array(await res.arrayBuffer());
                let hex = "";
                for (let i = 0; i < 16 && i < buf.length; i += 1) hex += buf[i].toString(16).padStart(2, "0");
                return { len: buf.length, hex, head: Array.from(buf.slice(0, 16)) };
            }, domAfter.src);
            const file = path.join(OUT, "result.mp4");
            const buf = await page.evaluate(async (src) => {
                const res = await fetch(src);
                const ab = await res.arrayBuffer();
                return Array.from(new Uint8Array(ab));
            }, domAfter.src);
            await fs.writeFile(file, Buffer.from(buf));
            const magic = Buffer.from(buf.slice(4, 8)).toString("ascii");
            record.result = { file: "result.mp4", bytes: bytes.len, magic, isMp4: magic === "ftyp", headHex: bytes.hex };
            if (magic !== "ftyp") record.issues.push(`结果不是 MP4：magic=${magic}`);
            if (!(bytes.len > 10_000)) record.issues.push(`结果字节过小：${bytes.len}`);
        } else {
            record.issues.push("页面没有结果视频元素（无真实产物）");
        }

        // ---- fresh reload：历史从应用自身落库恢复 ----
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction((t) => document.body.innerText.includes(t), spec.waitText, { timeout: 60000 });
        await page.waitForTimeout(2500);
        record.history = await page.evaluate((taskId) => {
            const items = [...document.querySelectorAll('[data-testid="tool-task-history-item"]')].map((n) => ({
                taskId: n.getAttribute("data-task-id"),
                status: n.getAttribute("data-task-status"),
                text: n.innerText.replace(/\s+/g, " ").slice(0, 160),
            }));
            return { count: items.length, items: items.slice(0, 5), matched: taskId ? items.some((i) => i.taskId === taskId) : null };
        }, record.taskId);
        if (!record.history.matched) record.issues.push(`fresh reload 后历史里没有 taskId=${record.taskId}`);
        await page.screenshot({ path: path.join(OUT, "reload-history.png"), fullPage: false }).catch(() => {});

        const openBtn = page.locator('[data-testid="tool-task-history-open"]').first();
        if (await openBtn.count()) {
            await openBtn.click();
            await page.waitForTimeout(2500);
            const restored = await page.evaluate(() => {
                const v = document.querySelector('[data-testid="tool-result-video"]');
                return { hasVideo: Boolean(v), readyState: v?.readyState ?? null };
            });
            record.history.restored = restored;
            if (!restored.hasVideo) record.issues.push("历史恢复后没有结果视频元素");
        }

        // ---- 下载 ----
        const dl = page.locator('[data-testid="tool-result-download-0"]').first();
        if (await dl.count()) {
            const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }).catch(() => null), dl.click()]);
            if (download) {
                const target = path.join(OUT, "downloaded.mp4");
                await download.saveAs(target);
                const b = await fs.readFile(target);
                const magic = b.slice(4, 8).toString("ascii");
                record.actions.download = { suggested: download.suggestedFilename(), bytes: b.length, magic };
                if (magic !== "ftyp") record.issues.push("下载产物不是 MP4");
            } else {
                record.issues.push("下载没有触发 download 事件");
            }
        }

        // ---- 保存资产 ----
        const save = page.locator('[data-testid="tool-result-save-0"]').first();
        if (await save.count()) {
            await save.click();
            await page.waitForFunction(
                () => (document.querySelector('[data-testid="tool-result-feedback"]')?.textContent ?? "").length > 0,
                undefined, { timeout: 60000 },
            ).catch(() => {});
            record.actions.save = {
                feedback: await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null),
                assets: await page.evaluate(async () => {
                    const mod = await import("/src/stores/use-asset-store.ts").catch(() => null);
                    if (!mod) return null;
                    const st = mod.useAssetStore.getState();
                    const list = st.assets || [];
                    return { count: list.length, videos: list.filter((a) => a.kind === "video" || a.mimeType?.startsWith("video/")).map((a) => ({ id: a.id, bytes: a.bytes, toolId: a.toolId })) };
                }),
            };
        }

        // ---- 发到画布 ----
        const canvasBtn = page.locator('[data-testid="tool-result-canvas-0"]').first();
        if (await canvasBtn.count()) {
            await canvasBtn.click();
            await page.waitForTimeout(4000);
            record.actions.canvas = {
                feedback: await page.evaluate(() => document.querySelector('[data-testid="tool-result-feedback"]')?.textContent?.trim() ?? null),
                videoNodes: await page.evaluate(async () => {
                    const idb = await import("idb-keyval").catch(() => null);
                    if (!idb) return null;
                    try {
                        const nodes = await idb.get("canvas-nodes");
                        return Array.isArray(nodes) ? nodes.filter((n) => String(n?.type).includes("video")).length : null;
                    } catch { return null; }
                }),
            };
            await page.screenshot({ path: path.join(OUT, "sent-canvas.png"), fullPage: false }).catch(() => {});
        }
    } catch (error) {
        record.error = String(error?.message || error).slice(0, 800);
        await page.screenshot({ path: path.join(OUT, "error.png") }).catch(() => {});
        record.actions.domOnError = await page.evaluate(() => ({
            alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => n.innerText.trim()).slice(0, 5),
            tail: document.body.innerText.slice(-900),
        })).catch(() => null);
    } finally {
        record.finishedAt = new Date().toISOString();
        await fs.writeFile(path.join(OUT, `run-${TOOL}.json`), JSON.stringify(record, null, 2));
        console.log(JSON.stringify({
            toolId: record.toolId, taskId: record.taskId, steps: record.steps, error: record.error,
            result: record.result, history: record.history, actions: record.actions, issues: record.issues,
            receipts: record.receipts.map((r) => ({ method: r.method, status: r.status, body: r.body.slice(0, 220) })),
        }, null, 2));
        await context.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
