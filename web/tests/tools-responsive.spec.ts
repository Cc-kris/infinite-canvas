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
const SIDEBAR = "[data-testid=tool-sidebar]";
/** ToolShell 自己的工具列表入口（lg 以下常驻在顶栏，打开的抽屉里是工具侧栏内容）。 */
const SHELL_TRIGGER = "[data-testid=tool-shell-nav-trigger]";
const SHELL_DRAWER = "[role=dialog][aria-modal=true]";
/**
 * 侧栏与抽屉入口的实测分界：lg(1024) 起常驻侧栏。
 * 1024 以下走 ToolShell 顶栏的「打开工具列表」入口（768–1023 这一档就靠它），
 * 640 以下另有应用级导航抽屉。
 */
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

                // 导航可达：lg 起常驻侧栏（且只允许一个，防止工作台内再挂一层外壳）
                if (viewport.width >= SIDEBAR_MIN_WIDTH) {
                    await expect(page.locator(`${SIDEBAR}:visible`), "宽屏缺少常驻侧边栏").toHaveCount(1);
                } else {
                    await expect(page.locator(SHELL_TRIGGER), `${viewport.width}px 缺少工具列表入口`).toBeVisible();
                    await expect(page.locator(`${SIDEBAR}:visible`), "窄屏不应常驻侧边栏").toHaveCount(0);
                }
                if (viewport.width < DRAWER_MAX_WIDTH) {
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

    // 768–1023px（md 档）以前只有顶栏图标、没有可定位的入口：这里断言真实可点可达。
    // 修复后 ToolShell 顶栏的「打开工具列表」在 lg 以下常驻，点开就是工具侧栏抽屉。
    test("tablet/laptop 中间档（768–1023px）能进入工具列表并跳转", async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 900 });
        await page.goto("/tools/smart-edit/product-refine");
        await expect(page.locator(WORKSPACE)).toBeVisible();

        // 必须用"可见"而不是"存在"：DOM 里挂着但被 hidden 挡住的侧栏不算可达入口
        await expect(page.locator(`${SIDEBAR}:visible`), "900px 下不应常驻侧边栏").toHaveCount(0);
        const trigger = page.locator(SHELL_TRIGGER);
        await expect(trigger, "900px 下缺少工具列表入口").toBeVisible();

        await trigger.click();
        const drawer = page.locator(SHELL_DRAWER);
        await expect(drawer, "工具列表抽屉未打开").toBeVisible();
        // 抽屉里能直接跳到同分类的其它工具
        await drawer.getByRole("link", { name: "图片裁剪" }).first().click();
        await expect(page).toHaveURL(/image-crop$/);
        await expect(page.locator(WORKSPACE)).toBeVisible();
        await expect(page.locator(SHELL_DRAWER), "跳转后抽屉应关闭").toBeHidden();
    });

    // 回归：工作台内部再包一层 ToolShell 时不能重复挂载侧栏/入口（曾出现两个可见侧栏）
    test("工具页只挂载一份侧栏与一个工具列表入口", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto("/tools/smart-edit/image-crop");
        await expect(page.locator(WORKSPACE)).toBeVisible();
        await expect(page.locator(`${SIDEBAR}:visible`), "裁剪页挂载了重复侧栏").toHaveCount(1);
        await expect(page.locator(`${SHELL_TRIGGER}:visible`), "宽屏不应出现窄屏工具列表入口").toHaveCount(0);

        await page.setViewportSize({ width: 900, height: 900 });
        await expect(page.locator(`${SHELL_TRIGGER}:visible`), "窄屏工具列表入口重复").toHaveCount(1);
    });
});

