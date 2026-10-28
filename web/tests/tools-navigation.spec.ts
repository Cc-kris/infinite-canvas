import { expect, test } from "@playwright/test";

/**
 * 工具台路由 / 导航 E2E。
 *
 * 只断言"真跑出来的东西"：侧边栏、分类折叠、深度链接后工作台真的挂载、刷新不白屏。
 * 不使用截图/快照基线，避免像素噪声；每条断言都对应一个可复现的 DOM 事实。
 */

const WORKSPACE = "[data-testid=tool-workspace]";
const SIDEBAR = "[data-testid=tool-sidebar]";

/** 每条用例都收集控制台错误 / 未捕获异常，用例结束时统一断言为空。 */
function trackPageErrors(page: import("@playwright/test").Page): string[] {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        // dev 模式下的 HMR / 网络探活噪声与本需求无关
        if (/Failed to load resource|WebSocket|favicon|Download the React DevTools/.test(text)) return;
        errors.push(`console: ${text}`);
    });
    return errors;
}

test.describe("工具台导航", () => {
    test("首页渲染侧边栏、分类入口与工作台，且无控制台错误", async ({ page }) => {
        const errors = trackPageErrors(page);
        await page.goto("/tools");

        await expect(page.locator(SIDEBAR)).toBeVisible();
        await expect(page.locator(WORKSPACE)).toBeVisible();
        await expect(page.locator("[data-testid=tools-nav-primary]")).toBeVisible();

        // 五个分类入口是侧边栏的稳定骨架（新增分类时这里会明确失败，提醒补测试）
        for (const category of ["ecommerce-suite", "smart-edit", "batch-generate", "product-design", "ai-video"]) {
            await expect(page.locator(`[data-testid=tools-nav-trigger-${category}]`)).toHaveCount(1);
        }

        // 顶部工作区跳转入口
        for (const link of ["canvas", "image", "video", "prompts", "assets", "config"]) {
            await expect(page.locator(`[data-testid=workspace-link-${link}]`)).toHaveCount(1);
        }

        expect(errors).toEqual([]);
    });

    test("分类折叠展开后能列出工具，逐个深度链接都能挂载工作台", async ({ page }) => {
        const errors = trackPageErrors(page);
        await page.goto("/tools");
        await expect(page.locator(SIDEBAR)).toBeVisible();

        const triggers = page.locator("[data-testid^=tools-nav-trigger-]");
        const triggerCount = await triggers.count();
        expect(triggerCount).toBeGreaterThan(0);

        const hrefs = new Set<string>();
        for (let index = 0; index < triggerCount; index += 1) {
            const trigger = triggers.nth(index);
            await trigger.click();
            await page.waitForTimeout(150);
            const links = await page.locator(`${SIDEBAR} a[href^="/tools/"]`).evaluateAll((nodes) =>
                nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href") ?? ""),
            );
            for (const href of links) if (href.split("/").length === 4) hrefs.add(href);
        }

        // 至少覆盖若干真实工具页，且不含分类首页
        expect(hrefs.size).toBeGreaterThanOrEqual(5);

        for (const href of [...hrefs].slice(0, 12)) {
            await page.goto(href);
            await expect(page.locator(WORKSPACE), `工作台未挂载：${href}`).toBeVisible();
            const heading = (await page.locator(WORKSPACE).innerText()).trim();
            expect(heading.length, `工作台内容为空：${href}`).toBeGreaterThan(0);
        }

        expect(errors).toEqual([]);
    });

    test("工作台刷新后仍停留在同一工具（路由与状态可恢复）", async ({ page }) => {
        const target = "/tools/smart-edit/product-refine";
        await page.goto(target);
        await expect(page.locator(WORKSPACE)).toBeVisible();
        const before = (await page.locator(WORKSPACE).innerText()).slice(0, 80);

        await page.reload();
        await expect(page.locator(WORKSPACE)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`${target.replace(/\//g, "\\/")}$`));
        const after = (await page.locator(WORKSPACE).innerText()).slice(0, 80);
        expect(after).toBe(before);
    });

    test("未注册的工具路由有兜底，不出现白屏", async ({ page }) => {
        const errors = trackPageErrors(page);
        await page.goto("/tools/smart-edit/not-a-real-tool");
        await page.waitForTimeout(800);

        const bodyText = (await page.locator("body").innerText()).trim();
        expect(bodyText.length, "未知路由渲染为空白页").toBeGreaterThan(0);
        // 兜底要么停在工具台外壳上，要么给出明确提示，不能既无壳也无文案
        const hasShell = await page.locator(SIDEBAR).count();
        const hasNotice = /未找到|不存在|404|Not Found/i.test(bodyText);
        expect(hasShell + Number(hasNotice)).toBeGreaterThan(0);

        expect(errors).toEqual([]);
    });
});
