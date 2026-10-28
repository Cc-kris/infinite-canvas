import { expect, test, type Page } from "@playwright/test";

/**
 * 工具台响应式 E2E：手机 / 平板 / 桌面三档宽度下不横向溢出、主控件可达。
 *
 * 断言口径（都可直接量化，不靠"看着还行"）：
 * - document.documentElement.scrollWidth 不超过视口 +1px（1px 容差给小数像素）。
 * - 工作台容器可见，且没有任何元素宽度超出其父滚动容器（只查 body 级溢出，避免误报内部画布）。
 * - 导航可达：>= 1024px 是常驻侧边栏，< 640px 是抽屉入口（实测断点，见下方已知缺口用例）。
 */

const WORKSPACE = "[data-testid=tool-workspace]";
const MOBILE_TRIGGER = "[data-testid=tools-nav-mobile-trigger]";
const MOBILE_DRAWER = "[data-testid=mobile-nav-drawer]:visible";
/**
 * 注意：图片裁剪页会渲染出两个**都可见**的 `tool-sidebar`（外壳 + 工作台内复用同一 testid），
 * 属于重复挂载缺陷，测试里用 .first() 规避歧义，缺陷本身记在 report.md。
 */
const SIDEBAR = "[data-testid=tool-sidebar]";
/** 侧边栏与抽屉入口的实测分界：lg(1024) 起常驻，sm(640) 以下是抽屉。 */
const SIDEBAR_MIN_WIDTH = 1024;
const DRAWER_MAX_WIDTH = 640;

const VIEWPORTS = [
    { name: "desktop", width: 1440, height: 960 },
    { name: "laptop", width: 1024, height: 768 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "phone", width: 390, height: 844 },
];

const ROUTES = [
    { path: "/tools", label: "工具台首页" },
    { path: "/tools/smart-edit/product-refine", label: "商品精修" },
    { path: "/tools/smart-edit/image-crop", label: "图片裁剪" },
];

async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("工具台响应式", () => {
    for (const viewport of VIEWPORTS) {
        test(`${viewport.name} (${viewport.width}px)：三页无横向溢出且工作台可见`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });

            for (const route of ROUTES) {
                await page.goto(route.path);
                await expect(page.locator(WORKSPACE), `${route.label} 未挂载`).toBeVisible();

                const overflow = await horizontalOverflow(page);
                expect(overflow, `${route.label} 在 ${viewport.width}px 横向溢出 ${overflow}px`).toBeLessThanOrEqual(1);

                // 导航可达：lg 起常驻侧边栏，sm 以下是抽屉入口（断点来自实测，不是猜的）
                if (viewport.width >= SIDEBAR_MIN_WIDTH) {
                    await expect(page.locator(SIDEBAR).first(), "宽屏缺少常驻侧边栏").toBeVisible();
                } else if (viewport.width < DRAWER_MAX_WIDTH) {
                    await expect(page.locator(MOBILE_TRIGGER), "窄屏缺少导航入口").toBeVisible();
                }
            }
        });
    }

    test("phone：导航抽屉能开能关，打开后能跳到其它工具", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/tools/smart-edit/product-refine");
        await expect(page.locator(WORKSPACE)).toBeVisible();

        const trigger = page.locator(MOBILE_TRIGGER);
        await trigger.click();
        const drawer = page.locator(MOBILE_DRAWER);
        await expect(drawer).toBeVisible();

        // 抽屉是独立浮层（不是侧边栏的显示态），里面按工具 ID 列表项跳转
        await drawer.locator('[data-testid="mobile-tools-nav-item-IMAGE_CROP"]').click();
        await expect(page).toHaveURL(/image-crop$/);
        await expect(page.locator(WORKSPACE)).toBeVisible();
        // 跳转后抽屉收起（浮层可能仍挂载在 DOM 里，所以断言不可见而不是计数为 0）
        await expect(page.locator("[data-testid=mobile-nav-drawer]:visible")).toHaveCount(0);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });

    // 已知缺口：768–1023px（md 档）既没有常驻侧边栏、也没有抽屉入口，用户在这个宽度里进不了工具列表。
    // 用 test.fail() 记录成"预期的失败"，哪天补了入口这条会自动变成 red，提醒把标记去掉。
    test("tablet/laptop 中间档（768–1023px）能进入工具列表", async ({ page }) => {
        test.fail(true, "md 档缺少导航入口：sidebar 只在 lg 显示，抽屉只在 sm 以下显示");
        await page.setViewportSize({ width: 900, height: 900 });
        await page.goto("/tools/smart-edit/product-refine");
        await expect(page.locator(WORKSPACE)).toBeVisible();

        // 必须用"可见"而不是"存在"：DOM 里挂着但被 hidden 挡住的侧栏不算可达入口
        const hasSidebar = (await page.locator(`${SIDEBAR}:visible`).count()) > 0;
        const hasDrawer = await page.locator(MOBILE_TRIGGER).isVisible();
        expect(hasSidebar || hasDrawer, "900px 下既没有侧边栏也没有导航抽屉").toBe(true);
    });
});

