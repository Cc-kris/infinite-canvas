/**
 * G1 残留检查：结果项**只有远程 url**（没有 dataUrl/blob）时，是否真的被写入 IndexedDB。
 * 渠道（如 sds-design）有时返回 oss url 而非 b64_json，若不入库，刷新后字节即丢。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, prepareContext, EVIDENCE_ROOT } from "./lib.mjs";

const OUT = path.join(EVIDENCE_ROOT, "B2G1", "_url-ingest");
// 真实远程图（本轮上游 oss 直链，可经 canvas-proxy 取到字节）
const REMOTE_URL = process.env.IC_REMOTE_URL
    || "https://oss-us.dimenoss.com/images/2026/10/29/1793207728_051a143cc5478fa5f9449d1caad694d1.png";

const browser = await launchBrowser({ headless: true });
const { context, page, network } = await prepareContext(browser);
try {
    const result = await page.evaluate(async ({ remoteUrl }) => {
        const store = await import("/src/stores/use-tool-task-store.ts");
        const fileStorage = await import("/src/services/file-storage.ts");
        const task = {
            id: "probe-url-only",
            toolId: "SDS_DESIGN",
            status: "succeeded",
            createdAt: new Date().toISOString(),
            result: {
                receivedAt: Date.now(),
                items: [{ id: "p0", index: 0, url: remoteUrl, mimeType: "image/png" }],
            },
        };
        const before = store.hasPendingResultMedia(task);
        const ingested = await store.ingestResultMedia(task);
        const item = ingested.result.items[0];
        const status = item.storageKey ? await fileStorage.mediaStorageStatus(item.storageKey) : null;
        return {
            remoteUrl,
            needsIngestBefore: before,
            storageKey: item.storageKey ?? null,
            itemBytes: item.bytes ?? null,
            payloadDropped: item.payloadDropped ?? null,
            idb: status ? { exists: status.exists, bytes: status.bytes, mimeType: status.mimeType } : null,
        };
    }, { remoteUrl: REMOTE_URL });

    result.network = network.filter((n) => /dimenoss|proxy|media/i.test(String(n.url))).slice(0, 10);
    result.verdict = result.storageKey && result.idb?.exists === true && result.idb.bytes > 0 ? "PASS" : "FAIL";
    await fs.mkdir(OUT, { recursive: true });
    await fs.writeFile(path.join(OUT, "url-ingest.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally {
    await context.close();
    await browser.close();
}
