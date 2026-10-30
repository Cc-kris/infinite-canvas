/**
 * r26 VIDEO_TRANSLATION 语言修复真实复验（真实上游 /v1/videos）。
 *
 * 场景：源片=真实英文人声（SALE_VIDEO r12，LID en 0.997），目标语言=简体中文。
 * 目的：验证新提示词语言契约是否让成片音轨变成「英文台词的翻译」，而不是朗读提示词。
 *
 * 说明（诚实标注）：
 * - 配置注入与提交走真实生产代码（adapter.buildVideoTranslationBrowserInput → store.runTool → gateway.submit → /v1/videos），
 *   只是用 page.evaluate 调用而非 trusted 点击（本轮时间预算内不重复 r22-f 的 UI 四步验收）。
 * - 轮询走真实 gateway.poll；结果字节从 IndexedDB 取真实 blob。
 *
 * 用法：cd web && node scripts/real-acceptance/accept-vt-language-r26.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, BASE_URL, sleep } from "./lib.mjs";

const REPO = path.resolve(process.cwd(), "..");
const OUT = path.join(REPO, "docs/V1.0/plan_linkfox_navigation/reports/vt-language-r26/artifacts");
const SOURCE = process.env.IC_SOURCE
    || path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SALE_VIDEO/r12-downloaded.mp4");
const KEY_SERVER = process.env.IC_KEY_SERVER || "http://127.0.0.1:18471/";
const PROXY_URL = process.env.IC_PROXY_URL || "http://127.0.0.1:23210";
const MEDIA_HOST = process.env.IC_MEDIA_HOST || "";
const TARGET_LANGUAGE = process.env.IC_TARGET_LANGUAGE || "zh";
const SOURCE_LANGUAGE = process.env.IC_SOURCE_LANGUAGE || "auto";
const TIMEOUT_MS = Number(process.env.IC_TIMEOUT_MS || 20 * 60 * 1000);

const log = { startedAt: new Date().toISOString(), steps: [], task: null, result: null, error: null };

async function uploadSource() {
    const bytes = await fs.readFile(SOURCE);
    const res = await fetch(`${PROXY_URL}/__media/upload`, {
        method: "POST",
        headers: { "content-type": "video/mp4", "x-media-name": path.basename(SOURCE) },
        body: bytes,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`upload failed ${res.status}: ${JSON.stringify(body)}`);
    const url = `${MEDIA_HOST}${body.path}`;
    const probe = await fetch(url, { method: "HEAD", headers: { range: "bytes=0-1" } }).catch((e) => ({ status: `err:${e.message}` }));
    log.upload = { sha256: body.sha256, bytes: body.bytes, path: body.path, publicUrl: url, probeStatus: probe.status };
    log.steps.push("source-published");
    // 上游真实拉取一次（Range 1 字节），证明公网可达
    const ranged = await fetch(url, { headers: { range: "bytes=0-1023" } });
    log.upload.rangeStatus = ranged.status;
    log.upload.rangeBytes = (await ranged.arrayBuffer()).byteLength;
    return { url, bytes: body.bytes, sha256: body.sha256 };
}

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    /* 不读密钥：页面里已有可用渠道（sub2::MiniMax-H3）与 key，直接复用；
     * 只有 IC_KEY_SERVER 真能返回 JSON（旧环境）时才注入独立渠道。 */
    const secret = await fetch(KEY_SERVER).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const published = await uploadSource();
    const browser = await launchBrowser({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const page = await context.newPage();
    const upstream = [];
    page.on("response", async (res) => {
        if (!/\/videos(\?|$)/.test(res.url())) return;
        let body = "";
        try { body = (await res.text()).slice(0, 1200); } catch { body = "<no body>"; }
        upstream.push({ at: new Date().toISOString(), method: res.request().method(), url: res.url(), status: res.status(), body });
    });

    try {
        await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });

        const submitted = await page.evaluate(async ({ baseUrl, apiKey, model, proxyUrl, mediaHostUrl, source, sourceLanguage, targetLanguage }) => {
            const cfgMod = await import("/src/stores/use-config-store.ts");
            const store = cfgMod.useConfigStore;
            /* 等 persist 装载完成：直接读会拿到默认配置（无渠道/无 key），导致 provider-rejected。 */
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                const cfg = store.getState().config;
                if ((cfg.channels || []).some((c) => (c.models || []).some((m) => m.capability === "video"))) break;
                await new Promise((r) => setTimeout(r, 200));
            }
            const prev = store.getState().config;
            const injected = Boolean(apiKey);
            store.setState({
                config: {
                    ...prev,
                    ...(injected
                        ? {
                              channels: [
                                  ...(prev.channels || []).filter((c) => c.id !== "sub2api-real"),
                                  { id: "sub2api-real", name: "sub2api-real", baseUrl: baseUrl.replace(/\/$/, ""), apiKey, apiFormat: "openai", models: [{ name: model, capability: "video" }] },
                              ],
                              channelMode: "local",
                              videoModel: `sub2api-real::${model}`,
                          }
                        : {}),
                    proxyEnabled: true,
                    proxyUrl,
                    mediaHostUrl,
                    vquality: "720",
                },
            });
            /* 渠道选择：优先挑带 video 能力、且 id/name 含 sub2 的渠道（r22-f 用的就是它）；
             * 找不到就退回当前 videoModel。绝不猜模型名。 */
            const configNow = store.getState().config;
            const videoChannels = (configNow.channels || []).filter((c) => (c.models || []).some((m) => m.capability === "video"));
            const preferred = videoChannels.find((c) => /sub2/i.test(`${c.id} ${c.name}`)) || videoChannels[0];
            let effectiveModel = injected ? `sub2api-real::${model}` : configNow.videoModel;
            if (!injected && preferred) {
                const videoModel = (preferred.models || []).find((m) => m.capability === "video");
                if (videoModel) effectiveModel = `${preferred.id}::${videoModel.name}`;
            }
            store.setState({ config: { ...store.getState().config, videoModel: effectiveModel, channelMode: "local" } });
            const readyChannels = (store.getState().config.channels || []).map((c) => ({ id: c.id, hasKey: Boolean(c.apiKey), videoModels: (c.models || []).filter((m) => m.capability === "video").map((m) => m.name) }));
            const values = {
                sourceLanguage,
                targetLanguage,
                lipSync: false,
                outputNum: 1,
                videoType: "auto",
                mode: "standard",
                outputRatio: "source",
            };
            const adapter = await import("/src/features/tools/adapters/video-translation.ts");
            const sourceObj = {
                assetId: "r26-source",
                name: source.name,
                url: source.url,
                bytes: source.bytes,
                mimeType: "video/mp4",
                durationMs: source.durationMs,
                width: source.width,
                height: source.height,
            };
            const modelName = String(effectiveModel || "").includes("::") ? String(effectiveModel).split("::").pop() : String(effectiveModel || "");
            const browserInput = adapter.buildVideoTranslationBrowserInput({ values, source: sourceObj, model: modelName, resolution: "720" });
            const prompt = browserInput.prompt || "";
            const auditMissing = adapter.auditVideoTranslationPrompt(prompt, values);
            const port = await adapter.createVideoTranslationRunPort();
            const task = await port.submit(browserInput, { dedupe: false });
            return { prompt, auditMissing, fields: browserInput.fields, taskId: task.id, status: task.status, taskError: task.error || null, attempts: task.attempts, upstreamTaskId: task.upstreamTaskId || null, promptChars: prompt.length, model: effectiveModel, injected, readyChannels };
        }, {
            baseUrl: secret ? secret.baseUrl : "",
            apiKey: secret ? secret.apiKey : "",
            model: "MiniMax-H3",
            proxyUrl: PROXY_URL,
            mediaHostUrl: MEDIA_HOST,
            source: { url: published.url, bytes: published.bytes, durationMs: 6583, width: 768, height: 768, name: path.basename(SOURCE) },
            sourceLanguage: SOURCE_LANGUAGE,
            targetLanguage: TARGET_LANGUAGE,
        });

        log.submitted = { taskId: submitted.taskId, status: submitted.status, upstreamTaskId: submitted.upstreamTaskId, promptChars: submitted.promptChars, auditMissing: submitted.auditMissing, fields: submitted.fields };
        log.prompt = submitted.prompt;
        log.steps.push("submitted");
        await fs.writeFile(path.join(OUT, "01-submitted.json"), JSON.stringify({ submitted, upstream }, null, 2));

        const taskId = submitted.taskId;
        const deadline = Date.now() + TIMEOUT_MS;
        let task = null;
        while (Date.now() < deadline) {
            task = await page.evaluate(async (id) => {
                const gwMod = await import("/src/services/api/tools/gateway.ts");
                const storeMod = await import("/src/stores/use-tool-task-store.ts");
                const gateway = gwMod.getToolGateway();
                try {
                    const next = await gateway.poll(id);
                    storeMod.useToolTaskStore.getState().upsertTask(next);
                    return next;
                } catch (error) {
                    return storeMod.useToolTaskStore.getState().tasks[id] || { error: String(error && error.message || error) };
                }
            }, taskId).catch((e) => ({ error: String(e.message || e) }));
            if (task && task.status) {
                log.steps.push(`poll:${task.status}`);
                if (["succeeded", "failed", "cancelled", "unknown"].includes(task.status)) break;
            }
            await sleep(8000);
        }
        log.task = task;
        await fs.writeFile(path.join(OUT, "02-task-record.json"), JSON.stringify({ task, upstream }, null, 2));

        if (task && task.status === "succeeded") {
            const payload = await page.evaluate(async (t) => {
                const item = (t.result && t.result.items ? t.result.items : [])[0];
                if (!item) return { error: "no-result-item", keys: Object.keys(t) };
                const fs = await import("/src/services/file-storage.ts");
                const blob = item.storageKey ? await fs.getMediaBlob(item.storageKey) : null;
                if (!blob) return { error: "no-blob", item };
                const buf = await blob.arrayBuffer();
                let bin = "";
                const view = new Uint8Array(buf);
                for (let i = 0; i < view.length; i += 0x8000) bin += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
                return { item, base64: btoa(bin), bytes: blob.size, type: blob.type };
            }, task);
            if (payload.base64) {
                const file = path.join(OUT, "03-result-video.mp4");
                await fs.writeFile(file, Buffer.from(payload.base64, "base64"));
                log.result = { file, bytes: payload.bytes, mimeType: payload.type, item: payload.item };
            } else {
                log.result = payload;
            }
        }
    } catch (error) {
        log.error = String(error && error.message ? error.message : error).slice(0, 800);
        await page.screenshot({ path: path.join(OUT, "99-error.png") }).catch(() => {});
    } finally {
        log.finishedAt = new Date().toISOString();
        await fs.writeFile(path.join(OUT, "run.json"), JSON.stringify(log, null, 2));
        console.log(JSON.stringify({
            steps: [...new Set(log.steps)],
            upload: log.upload,
            submitted: log.submitted,
            status: log.task && log.task.status,
            error: log.task && log.task.error,
            upstreamTaskId: log.task && log.task.upstreamTaskId,
            result: log.result && { bytes: log.result.bytes, mimeType: log.result.mimeType },
            error2: log.error,
        }, null, 2));
        await browser.close();
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
