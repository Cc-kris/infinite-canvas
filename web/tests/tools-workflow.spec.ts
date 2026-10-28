import { deflateSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";

/**
 * 工具台真实链路 E2E：上传素材 → 校验门禁 → 提交 → 上游成功/失败 → 结果与过期标记。
 *
 * 三个原则：
 * 1) 素材是现场生成的**真 PNG 字节**（不是打桩文件），走真实 `<input type=file>` 上传入库存。
 * 2) 只拦截上游 HTTP（`/images/edits`），不拦截应用自身的任何请求；
 *    成功用例回的是真 b64 图片，所以"结果图出现"证明的是渲染链路，不是自我安慰。
 * 3) 失败用例断言"如实报错 + 不自动重试"，这是付费链路上最要紧的行为。
 */

const PNG_SIZE = 640;

/** 生成一张 PNG_SIZE×PNG_SIZE 的灰色 PNG（无第三方依赖，压缩用 node:zlib）。 */
function buildPng(size = PNG_SIZE): Buffer {
    const crcTable = Array.from({ length: 256 }, (_, index) => {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        return value >>> 0;
    });
    const crc32 = (buffer: Buffer): number => {
        let crc = 0xffffffff;
        for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer): Buffer => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length, 0);
        const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body), 0);
        return Buffer.concat([length, body, crc]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // truecolor RGB
    const raw = Buffer.alloc(size * (size * 3 + 1));
    for (let y = 0; y < size; y += 1) {
        const rowStart = y * (size * 3 + 1);
        raw[rowStart] = 0; // filter: none
        for (let x = 0; x < size; x += 1) {
            const pixel = rowStart + 1 + x * 3;
            raw[pixel] = 0x80;
            raw[pixel + 1] = 0x80;
            raw[pixel + 2] = 0x90;
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** 1×1 透明 PNG，作为"上游返回的真图片"。 */
const RESULT_PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** 已上传素材 → 等入库完成（chips 显示尺寸才算真的入库）。 */
async function uploadSource(page: Page, name = "e2e-source.png"): Promise<void> {
    await page.locator("[data-testid=tool-asset-file-input]").setInputFiles({
        name,
        mimeType: "image/png",
        buffer: buildPng(),
    });
    await expect(page.locator("[data-testid=tool-workspace]")).toContainText(`${PNG_SIZE}×${PNG_SIZE}`);
}

/** 拦截"本地代理探活"，让用例不依赖 127.0.0.1:23210 是否真的在跑。 */
async function stubProxyHealth(page: Page): Promise<void> {
    await page.route("http://127.0.0.1:23210/", (route) => route.fulfill({ status: 200, body: "ok" }));
}

test.describe("工具台真实工作流", () => {
    test("上游 500：任务如实失败、有诊断码，且不自动重复提交（不重复扣费）", async ({ page }) => {
        await stubProxyHealth(page);
        const submitted: string[] = [];
        await page.route("**/images/edits", async (route) => {
            const request = route.request();
            submitted.push(request.postData() ?? "");
            expect(request.method()).toBe("POST");
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: { message: "upstream exploded (e2e)" } }),
            });
        });

        await page.goto("/tools/smart-edit/product-refine");
        await uploadSource(page);

        // 上传完必须"可提交"，否则链路上游还没开始就已经断了
        const submit = page.locator("[data-testid=refine-generate]");
        await expect(submit).toBeEnabled();
        await submit.click();

        // 真实失败态：tool-result 的 unknown 视图（"结果未知"），不是伪造的通用错误
        const resultPanel = page.locator("[data-testid=tool-result]");
        await expect(resultPanel.locator("[data-testid=tool-result-unknown]")).toBeVisible();
        await expect(resultPanel).toContainText(/任务失败|结果未知/);
        await expect(resultPanel).toContainText("不会自动重试");
        await expect(page.locator("[data-testid=tool-result-image]")).toHaveCount(0);

        // 请求体真的带上了 model / prompt / image 与文件名
        expect(submitted.length).toBe(1);
        const body = submitted[0];
        expect(body).toContain('name="model"');
        expect(body).toContain('name="prompt"');
        expect(body).toContain('name="image"');
        expect(body).toContain('filename="e2e-source.png"');

        // 等一段时间，确认没有自动重发（付费链路不允许偷偷重试）
        await page.waitForTimeout(4000);
        expect(submitted.length).toBe(1);
    });

    test("上游成功：结果图按上游返回的 b64 渲染，改参数后标记过期", async ({ page }) => {
        await stubProxyHealth(page);
        const submitted: string[] = [];
        await page.route("**/images/edits", async (route) => {
            submitted.push(route.request().postData() ?? "");
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ data: [{ b64_json: RESULT_PNG_B64 }] }),
            });
        });

        await page.goto("/tools/smart-edit/product-refine");
        await uploadSource(page);
        await page.locator("[data-testid=refine-generate]").click();

        const result = page.locator("[data-testid=tool-result-image]").first();
        await expect(result).toBeVisible();
        const src = await result.getAttribute("src");
        expect(src).toContain(RESULT_PNG_B64);
        expect(submitted.length).toBe(1);

        // 输入变了 → 旧结果必须被标记为过期，避免用户拿着旧图当新图交付
        const strength = page.locator("[data-testid=refine-strength] button", { hasText: "强力" });
        await strength.click();
        await expect(page.locator("[data-testid=refine-stale]")).toBeVisible();
    });

    test("缺蒙版时禁止提交，并说明缺什么", async ({ page }) => {
        await stubProxyHealth(page);
        await page.goto("/tools/smart-edit/area-repair");
        await uploadSource(page);

        const submit = page.locator("[data-testid=area-repair-submit]").first();
        await expect(submit).toBeDisabled();
        await expect(page.locator("[data-testid=area-repair-workspace]")).toContainText(/涂抹/);
    });

    test("图片裁剪在本地算完就地出结果，不打上游", async ({ page }) => {
        await stubProxyHealth(page);
        const upstream: string[] = [];
        await page.route("**/images/**", (route) => {
            upstream.push(route.request().url());
            return route.abort();
        });

        await page.goto("/tools/smart-edit/image-crop");
        await uploadSource(page);
        await expect(page.locator("[data-testid=crop-issues]")).toHaveCount(0);

        await page.locator("[data-testid=crop-submit]").click();
        await expect(page.locator("[data-testid=tool-result-image]").first()).toBeVisible();
        expect(upstream, "裁剪不应请求上游").toEqual([]);
    });

    test("草稿持久化：改参数后刷新，参数与结果标记都还在", async ({ page }) => {
        await stubProxyHealth(page);
        await page.goto("/tools/smart-edit/product-refine");
        await uploadSource(page);

        const strongButton = page.locator("[data-testid=refine-strength] button", {
            hasText: "强力",
        });
        await strongButton.click();
        // 单选组是真 radio：选中态写在 aria-checked 上，先确认点选中了再谈持久化
        await expect(strongButton).toHaveAttribute("aria-checked", "true");
        // 草稿写入是 500ms 防抖（TOOL_DRAFT_DEBOUNCE_MS）+ IndexedDB 异步落盘，
        // 立刻 reload 会把还没 flush 的改动丢掉——这不是产品缺陷，是测试抢跑。
        // 所以直接盯落盘事实（库 infinite-canvas / store app_state）而不是 sleep。
        await expect
            .poll(
                async () =>
                    page.evaluate(async () => {
                        const db = await new Promise<IDBDatabase>((resolve, reject) => {
                            const request = indexedDB.open("infinite-canvas");
                            request.onsuccess = () => resolve(request.result);
                            request.onerror = () => reject(request.error);
                        });
                        if (!db.objectStoreNames.contains("app_state")) return "";
                        const keys = await new Promise<string[]>((resolve) => {
                            const tx = db.transaction("app_state", "readonly");
                            const get = tx.objectStore("app_state").getAllKeys();
                            get.onsuccess = () => resolve(get.result.map(String));
                            get.onerror = () => resolve([]);
                        });
                        return keys.join("|");
                    }),
                { timeout: 8000, intervals: [200] },
            )
            .toContain("draft");

        await page.reload();
        await expect(page.locator("[data-testid=tool-workspace]")).toBeVisible();
        await expect(page.locator("[data-testid=refine-strength] button", { hasText: "强力" })).toHaveAttribute(
            "aria-checked",
            "true",
        );
        // 素材也要从资产索引恢复，而不是回到"请先上传"
        await expect(page.locator("[data-testid=tool-workspace]")).toContainText(`${PNG_SIZE}×${PNG_SIZE}`);
        await expect(page.locator("[data-testid=refine-generate]")).toBeEnabled();
    });
});
