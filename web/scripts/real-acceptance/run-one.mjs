/**
 * 真实 UI 验收执行器：一次跑一个工具（`node run-one.mjs AREA_REPAIR`），
 * 也可 `node run-one.mjs all` 顺序跑完全部配方。
 *
 * 每个工具都做真实的：上传真实 JPG → 在画布上用鼠标涂抹 → 填写真实描述 →
 * 点击真实提交按钮 → 等真实 provider 返回（经本机 canvas-proxy）。
 *
 * 证据落盘：evidence/real-acceptance/<TOOL>/
 *   ui.png            完成后整页截图
 *   result.png        结果图（能取到 data:/blob: 时）
 *   step-*.png        关键步骤截图
 *   run.json          控件状态 / issue 文本 / 网络记录 / 结果判定
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { BASE_URL, EVIDENCE_ROOT, launchBrowser, prepareContext, sleep } from "./lib.mjs";
import { applyProviderConfig } from "./provider.mjs";

/** IC_REAL_PROVIDER=1：从 keychain 注入真实图像渠道（只回报长度，不打印密钥）。 */
const REAL_PROVIDER = process.env.IC_REAL_PROVIDER === "1";
/** IC_DRY=1：只跑到提交前，记录提交按钮可用性与预计张数，不发生成请求。 */
const DRY = process.env.IC_DRY === "1";

const FIXTURES = path.resolve("scripts/real-acceptance/fixtures");

/** 逐字节哈希：结果图必须≠上传源图，否则只是把源图预览当成了生成结果。 */
async function fileSha256(filePath) {
    const buf = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
}

const RECIPES = {
    PRODUCT_REFINE: {
        route: "/tools/smart-edit/product-refine",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await page.click('[data-testid=refine-generate]');
        },
    },
    FIX_COLOR: {
        route: "/tools/smart-edit/fix-color",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=fix-color-mask-canvas]");
            await sleep(800);
            await page.click('[data-testid=fix-color-submit]');
        },
    },
    AREA_REPAIR: {
        route: "/tools/smart-edit/area-repair",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=mask-canvas]");
            await page.fill("[data-testid=area-repair-prompt]", "把表盘上的细小划痕抹掉，保留金属拉丝质感与原有反光");
            await sleep(500);
            await page.click('[data-testid=area-repair-submit]');
        },
    },
    REMOVE_PEN: {
        route: "/tools/smart-edit/remove-pen",
        fixture: "product-watch.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "product-watch.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=remove-pen-canvas]");
            await sleep(800);
            await page.click('[data-testid=remove-pen-submit]');
        },
    },
    HAND_REPAIR: {
        route: "/tools/smart-edit/hand-repair",
        resultSelector: "[data-testid=hand-repair-results] img",
        fixture: "hand-product.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=tool-asset-file-input]', "hand-product.jpg");
            await sleep(2500);
            await paint(page, "[data-testid=hand-repair-canvas]");
            await sleep(600);
            await page.locator("[data-testid=hand-repair-person-type]").first().click();
            await sleep(400);
            await page.click('[data-testid=hand-repair-submit]');
        },
    },
    CHANGE_COLOR: {
        route: "/tools/smart-edit/change-color",
        fixture: "apparel-print.jpg",
        run: async (page) => {
            await upload(page, '[data-testid=change-color-source] input[type=file]', "apparel-print.jpg");
            await sleep(2500);
            await page.fill("[data-testid=change-color-hex]", "#2E6BE6");
            await page.locator("[data-testid=change-color-hex]").blur();
            await sleep(600);
            await page.click('[data-testid=change-color-submit]');
        },
    },
    PRINTING_REPAIR: {
        route: "/tools/smart-edit/printing-repair",
        fixture: "apparel-print.jpg",
        run: async (page) => {
            const inputs = page.locator("input[type=file]");
            await inputs.nth(0).setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
            await sleep(2500);
            await inputs.nth(1).setInputFiles(path.join(FIXTURES, "apparel-print.jpg"));
            await sleep(6000);
            await page.click('[data-testid=printing-repair-submit]');
        },
    },

    /* ---- 以下为图像类工具：prepare 只做到提交前，submit 为提交按钮（IC_DRY=1 可零费用核对张数） ---- */
    PRODUCT_IMAGE_SUITE: {
        route: "/tools/ecommerce-suite/product-image-suite",
        fixture: "product-watch.jpg",
        submit: "[data-testid=suite-generate]",
        countSelector: "[data-testid=suite-expected-count]",
        resultSelector: "[data-testid=suite-panel-result] img",
        downloadSelector: '[data-testid=suite-panel-result] button:text-is("下载")',
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            // 关掉 A+，只留主副图「卖点图」，张数按钮循环到 1
            await page.locator('[aria-label="A+图开关"]').click();
            await page.locator("button[aria-expanded]", { hasText: "主副图" }).first().click();
            await cycleUntil(page, '[aria-label="卖点图每模块张数"]', "[data-testid=suite-expected-count]", /共 1 张/);
        },
    },
    DRESS_WEAR_SET: {
        route: "/tools/ecommerce-suite/dress-wear-set",
        fixture: "apparel-print.jpg",
        submit: '[data-testid=dress-suite-submit-bar] button:has-text("开始生成")',
        countSelector: "[data-testid=dress-suite-submit-bar] span",
        resultSelector: '[data-testid^=dress-group-] img[alt$="产物"]',
        downloadSelector: "[data-testid^=dress-group-] a[download]",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "apparel-print.jpg");
            await sleep(2500);
            await page.getByRole("button", { name: "我是高手，不再提醒" }).click().catch(() => null);
            // 默认勾选模特图 4 + 白底图 4：取消白底图，模特图减到 1
            await page.locator('label:has-text("白底图") input[type=checkbox]').first().uncheck();
            for (let i = 0; i < 6; i++) {
                const minus = page.locator('[aria-label="模特图减少"]');
                if (await minus.isDisabled()) break;
                await minus.click();
            }
            // 智能品牌基因要求先选商品类目 / 销售地区 / 语言（原生 select，各取第一个真实选项）
            for (const label of ["商品类目", "销售地区", "语言"]) {
                await page.locator(`[data-testid=dress-suite-workspace] label:has(> span:text-is("${label}")) select`).selectOption({ index: 1 });
            }
        },
    },
    CHANGE_COLOR_V2: {
        route: "/tools/ecommerce-suite/change-color-v2",
        fixture: "apparel-print.jpg",
        submit: "[data-testid=color-v2-submit]",
        countSelector: "[data-testid=color-v2-planned-count]",
        resultSelector: "[data-testid=color-v2-unit] img",
        downloadSelector: "[data-testid=color-v2-download]",
        prepare: async (page) => {
            await upload(page, "[data-testid=color-v2-section-upload] ~ * [data-testid=tool-asset-file-input], [data-testid=tool-config-column] [data-testid=tool-asset-file-input]", "apparel-print.jpg");
            await sleep(2500);
            await page.click("[data-testid=color-v2-extract]");
            await sleep(1500);
            // 提色默认给 5 个方案 = 5 张；只留 1 个方案
            for (let i = 0; i < 8 && (await page.locator('[data-testid=color-v2-plans] [aria-label^="移除方案"]').count()) > 1; i++) {
                await page.locator('[data-testid=color-v2-plans] [aria-label^="移除方案"]').first().click();
                await sleep(200);
            }
            await page.click("[data-testid=color-v2-region-top]");
            await page.click("[data-testid=color-v2-quality-low]");
        },
    },
    SCALE_UP: {
        route: "/tools/ecommerce-suite/scale-up",
        fixture: "product-watch.jpg",
        submit: "[data-testid=scale-up-generate]",
        resultSelector: "[data-testid=scale-up-result-column] [data-testid=tool-result-image]",
        downloadSelector: "[data-testid=scale-up-download-image]",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await page.getByRole("button", { name: "变高清", exact: true }).click();
        },
    },
    AI_OUTPAINTING: {
        route: "/tools/ecommerce-suite/ai-outpainting",
        fixture: "product-watch.jpg",
        submit: "[data-testid=outpaint-submit]",
        countSelector: "[data-testid=outpaint-output-num]",
        // outpaint-panel-result 只在空态出现；有结果时渲染共享 ToolResult
        resultSelector: "[data-testid=tool-result-image]",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await page.getByRole("button", { name: "1:1", exact: true }).first().click();
            await sleep(600);
            await page.click("[data-testid=outpaint-output-num]");
            await page.locator('[role=listbox][aria-label="生成张数"] [role=option]', { hasText: /^1张$/ }).click();
        },
    },
    NEW_REPLACE_BG_V2: {
        route: "/tools/product-design/new-replace-bg-v2",
        fixture: "product-watch.jpg",
        submit: "[data-testid=scene-generate]",
        countSelector: "[data-testid=scene-count-1][aria-pressed=true]",
        resultSelector: "[data-testid=scene-result] img",
        prepare: async (page) => {
            // 草稿里已有商品图时页面直接进第二步，先回首屏
            if (await page.locator("[data-testid=scene-back]").count()) await page.click("[data-testid=scene-back]");
            await upload(page, "[data-testid=scene-goods] input[type=file]", "product-watch.jpg");
            await sleep(2500);
            // 上传后自动弹抠图编辑弹窗：上传与商品图同尺寸的主体蒙版（白=主体），再确认使用
            await page.waitForSelector("[data-testid=scene-cutout]", { timeout: 20000 });
            await upload(page, "[data-testid=scene-cutout] input[type=file]", "mask-watch.png");
            await sleep(1500);
            await page.click("[data-testid=scene-cutout-confirm]");
            await page.waitForSelector("[data-testid=scene-cutout]", { state: "detached", timeout: 20000 });
            // 必须选一张场景参考图（没有参考图时抽屉自动打开，否则先点「参考图」）
            if (!(await page.locator("[data-testid=scene-drawer]").count())) await page.click("[data-testid=scene-drawer-toggle]");
            await page.click("[data-testid=scene-drawer-outdoor-02]");
            await page.waitForSelector("[data-testid=scene-reference-image]", { timeout: 20000 });
            await page.click("[data-testid=scene-count-1]");
        },
    },
    REPLACE_GOODS: {
        route: "/tools/product-design/replace-goods",
        fixture: "product-watch.jpg",
        submit: "[data-testid=replace-goods-submit]",
        resultSelector: "[data-testid=replace-goods-results] img",
        prepare: async (page) => {
            const inputs = page.locator("[data-testid=tool-main-column] input[type=file]");
            await inputs.nth(0).setInputFiles(path.join(FIXTURES, "hand-product.jpg"));
            await sleep(2500);
            await page.locator("[data-testid=tool-main-column] input[type=file]").nth(1).setInputFiles(path.join(FIXTURES, "product-watch.jpg"));
            await sleep(3000);
            await page.click("[data-testid=replace-goods-output-1]");
        },
    },
    PRODUCT_SCENE: {
        route: "/tools/product-design/product-scene",
        fixture: "product-watch.jpg",
        submit: "[data-testid=scene-generate]",
        countSelector: "[data-testid=scene-expected]",
        resultSelector: "[data-testid=product-scene-result-panel] img",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await page.locator("[data-testid=scene-output-num] button", { hasText: /^1$/ }).click();
        },
    },
    HANDHELD_GOODS: {
        route: "/tools/product-design/handheld-goods",
        fixture: "product-watch.jpg",
        submit: "[data-testid=handheld-submit]",
        resultSelector: "[data-testid=handheld-result-panel] img",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await page.getByRole("button", { name: "右手", exact: true }).click();
            await page.getByRole("button", { name: "1", exact: true }).first().click();
        },
    },
    AI_DRESSING_V2: {
        route: "/tools/product-design/ai-dressing-v2",
        fixture: "apparel-print.jpg",
        submit: "[data-testid=dressing-submit]",
        resultSelector: "[data-testid=dressing-results] [data-testid=tool-result-image]",
        prepare: async (page) => {
            await upload(page, "[data-testid=dressing-garment-upper] input[type=file]", "apparel-print.jpg");
            await sleep(2500);
            // 「整件」在折叠的「蒙版工具」details 里
            await page.locator('[data-testid=dressing-garment-upper] summary[aria-label="蒙版工具"]').click();
            await page.click("[data-testid=dressing-fill-upper]");
            await sleep(600);
            // 模特参考没有预置图：展开「选择穿衣模特」后上传真实模特图
            await page.locator("[data-testid=dressing-model-card] button[aria-expanded]").click();
            await sleep(800);
            await upload(page, "[data-testid=dressing-model-card] input[type=file]", "model-portrait.png");
            await sleep(2500);
            await page.click("[data-testid=dressing-output-1]");
        },
    },
    AI_POSTURE: {
        route: "/tools/product-design/ai-posture",
        fixture: "model-portrait.png",
        submit: "[data-testid=ai-posture-submit]",
        countSelector: "[data-testid=ai-posture-submit-hint]",
        resultSelector: "[data-testid=ai-posture-results] img",
        downloadSelector: "[data-testid=ai-posture-result-download-0]",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "model-portrait.png");
            await sleep(2500);
            await page.click("[data-testid=ai-posture-pose-summary-row]");
            await page.click("[data-testid=ai-posture-pose-stand-hip]");
            await page.click("[data-testid=ai-posture-output-1]");
        },
    },
    AI_WEARABLE: {
        route: "/tools/product-design/ai-wearable",
        fixture: "product-watch.jpg",
        submit: "[data-testid=dress-generate]",
        resultSelector: "[data-testid=dress-results] img",
        prepare: async (page) => {
            await page.click("[data-testid=dress-tour-dismiss]").catch(() => null);
            await upload(page, "[data-testid=tool-asset-file-input]", "product-watch.jpg");
            await sleep(2500);
            await page.click("[data-testid=dress-model-card]");
            await sleep(800);
            // 本地没有模特库：面板里只能上传真实模特图
            await upload(page, "[data-testid=dress-model-panel] input[type=file]", "model-portrait.png");
            await sleep(2500);
            await page.keyboard.press("Escape").catch(() => null);
            await sleep(400);
            await page.locator("[data-testid=dress-output-num] button", { hasText: /^1$/ }).click();
        },
    },
    PRINT_EXTRACT: {
        route: "/tools/product-design/print-extract",
        fixture: "apparel-print.jpg",
        submit: "[data-testid=print-extract-generate]",
        resultSelector: "[data-testid=print-extract-result-panel] img",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "apparel-print.jpg");
            await sleep(2500);
        },
    },
    SDS_DESIGN: {
        route: "/tools/product-design/sds-design",
        fixture: "apparel-print.jpg",
        submit: '[data-tool-workspace=sds-design] button:has-text("立即生成")',
        resultSelector: "[data-testid=tool-result-image]",
        prepare: async (page) => {
            // 无默认商品：商品图走页面末尾隐藏的 product file input，素材走「上传素材」弹窗里的 file input
            await upload(page, "[data-tool-workspace=sds-design] > input[type=file]", "apparel-print.jpg");
            await sleep(3000);
            await page.click("[data-testid=sds-upload-material]");
            await upload(page, "[data-testid=material-source-panel] input[type=file]", "translate-source.png");
            await sleep(4000);
        },
    },
    IMAGE_TRANSLATION: {
        route: "/tools/ecommerce-suite/image-translation",
        fixture: "translate-source.png",
        submit: '[data-testid=tool-config-column] button:has-text("开始翻译")',
        // 默认目标语言只有 en：1 张图 × 1 个语言 = 1 张
        resultSelector: 'img[alt$="翻译结果"]',
        downloadSelector: 'td button:text-is("下载")',
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-asset-file-input]", "translate-source.png");
            await sleep(2500);
            // 没有文字框时「开始翻译」只给提示不发请求：先用视觉模型识别文字，等框数 > 0
            await page.locator('[data-testid=tool-config-column] button:text-is("识别文字")').first().click();
            await page.waitForFunction(() => /[1-9]\d* 框/.test(document.querySelector("[data-testid=tool-config-column]")?.innerText || ""), null, { timeout: 120000 });
            // 门禁还要求每框有译文且「确认译文」：展开结果区折叠的「校对」（两层 details），逐框机翻后确认
            await page.evaluate(() => {
                for (let el = document.getElementById("proofread"); el; el = el.parentElement) if (el.tagName === "DETAILS") el.open = true;
            });
            await page.locator('#proofread button:text-is("翻译全部目标语言")').click();
            await page.waitForFunction(() => !/翻译中…/.test(document.getElementById("proofread")?.innerText || ""), null, { timeout: 180000 });
            await page.locator("#proofread button", { hasText: /^确认译文$/ }).click();
            await sleep(600);
        },
    },
    /* ---- 主代理按 rea 还原重做的 8 个工具（每个最少张数：1 张；商品预览效果原站固定 4 张） ---- */
    ORNAMENT_TEXT: {
        route: "/tools/product-design/ornament-text",
        fixture: "product-watch.jpg",
        submit: "[data-testid=ornament-submit]",
        resultSelector: "[data-testid=tool-result-image]",
        prepare: async (page) => {
            await page.fill("[data-testid=ornament-text-input]", "Lucky");
        },
    },
    AI_TEXT: {
        route: "/tools/product-design/ai-text",
        fixture: "product-watch.jpg",
        submit: "[data-testid=ai-text-submit]",
        resultSelector: "[data-testid=tool-result-image]",
        prepare: async (page) => {
            await page.locator("textarea").first().fill("I love you");
            await page.selectOption('select[aria-label="生成张数"]', "1");
        },
    },
    SCENE_TRANSFER: {
        route: "/tools/product-design/scene-transfer",
        fixture: "product-watch.jpg",
        submit: "[data-testid=scene-transfer-submit]",
        resultSelector: "[data-testid=scene-transfer-result] [data-testid=tool-result-image]",
        prepare: async (page) => {
            await upload(page, "[data-testid=scene-transfer-product] input[type=file]", "product-watch.jpg");
            await sleep(2000);
            await upload(page, "[data-testid=scene-transfer-style] input[type=file]", "hand-product.jpg");
            await sleep(2500);
        },
    },
    AI_DRESSING_XSY: {
        route: "/tools/product-design/ai-dressing-xsy",
        fixture: "apparel-print.jpg",
        submit: "[data-testid=xsy-submit]",
        resultSelector: "[data-testid=xsy-result-grid] img, [data-testid=tool-result-image]",
        prepare: async (page) => {
            await upload(page, "[data-testid=xsy-slot-upper] input[type=file]", "apparel-print.jpg");
            await sleep(2000);
            await upload(page, "[data-testid=xsy-slot-down] input[type=file]", "apparel-print-ref.jpg");
            await sleep(2000);
            await upload(page, "[data-testid=xsy-step-model] input[type=file]", "model-portrait.png");
            await sleep(2500);
            await page.click("[data-testid=xsy-mask-upper-fill]");
            await page.click("[data-testid=xsy-mask-down-fill]");
            await sleep(600);
        },
    },
    AI_POSE_GENERATOR: {
        route: "/tools/product-design/ai-pose-generator",
        fixture: "model-portrait.png",
        submit: "[data-testid=ai-pose-submit]",
        resultSelector: "[data-testid=tool-result-image]",
        prepare: async (page) => {
            await page.click("[data-testid=ai-pose-template-btn]");
            await page.locator("[data-testid=ai-pose-templates] button").first().click();
            await sleep(400);
        },
    },
    MATERIAL_UPPER_BODY: {
        route: "/tools/product-design/material-upper-body",
        fixture: "apparel-print.jpg",
        submit: "[data-testid=material-preview-submit]",
        resultSelector: "[data-testid=material-preview-results] [data-testid=tool-result-image]",
        prepare: async (page) => {
            // 原站固定出 4 张：推荐模式 = t-shirt / 马克杯 / 手提包 / 毛毯各 1 张
            await upload(page, "[data-testid=material-preview-source] input[type=file]", "apparel-print.jpg");
            await sleep(2500);
        },
    },
    PRODUCT_MARKET_MATERIAL: {
        route: "/tools/product-design/product-market-material",
        fixture: "product-watch.jpg",
        submit: "[data-testid=market-generate]",
        countSelector: "[data-testid=market-expected-count]",
        // 结果画在页面自绘的模块分组卡里，不在共享 ToolResult
        resultSelector: "[data-testid=market-panel-result] img",
        prepare: async (page) => {
            await upload(page, "[data-testid=tool-config-column] input[type=file]", "product-watch.jpg");
            await sleep(2500);
            await page.locator("[data-testid=tool-config-column] textarea").first().fill("不锈钢机械手表，蓝宝石镜面，50 米防水，适合商务与日常佩戴。");
            // 最少张数：选无 A+ 的平台，主副图只留「卖点图」= 1 张
            await page.click("[data-testid=market-advanced-toggle]");
            await page.locator("[data-testid=market-advanced-fields] button", { hasText: /^Shopify 独立站$/ }).click();
            for (const id of ["marketing-white-bg", "marketing-scene", "marketing-closeup"]) {
                if ((await page.getAttribute(`[data-testid=market-marketing-${id}]`, "aria-checked")) === "true") await page.click(`[data-testid=market-marketing-${id}]`);
            }
            await sleep(400);
        },
    },
    FISSION_LINK: {
        route: "/tools/product-design/fission-link",
        fixture: "product-watch.jpg",
        submit: "[data-testid=listing-fission-submit]",
        countSelector: "[data-testid=listing-fission-summary]",
        resultSelector: "[data-testid=listing-fission-result] [data-testid=tool-result-image]",
        prepare: async (page) => {
            await upload(page, "[data-testid=listing-fission-source] input[type=file]", "product-watch.jpg");
            await sleep(2500);
        },
    },
};

/** 反复点循环计数按钮，直到计数文本匹配（最多 12 次）。 */
async function cycleUntil(page, button, countSel, pattern) {
    for (let i = 0; i < 12; i++) {
        const text = (await page.locator(countSel).first().innerText().catch(() => "")) || "";
        if (pattern.test(text)) return;
        await page.locator(button).first().click();
        await sleep(200);
    }
}

async function upload(page, selector, file) {
    const input = page.locator(selector).first();
    await input.setInputFiles(path.join(FIXTURES, file));
}

/** 在蒙版画布上用真实鼠标事件画三笔，覆盖画面中部。 */
async function paint(page, selector) {
    const canvas = page.locator(selector).first();
    await canvas.waitFor({ state: "visible", timeout: 15000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error(`画布不可见：${selector}`);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const strokes = [
        [
            [-60, -40],
            [0, -10],
            [40, 10],
            [60, 30],
        ],
        [
            [-50, 40],
            [-10, 30],
            [30, 35],
        ],
        [
            [-30, 0],
            [3, -35],
            [35, -20],
        ],
    ];
    for (const stroke of strokes) {
        const [first, ...rest] = stroke;
        await page.mouse.move(cx + first[0], cy + first[1]);
        await page.mouse.down();
        for (const [dx, dy] of rest) {
            await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
        }
        await page.mouse.up();
        await sleep(120);
    }
}

async function snapshot(page) {
    return page.evaluate(() => {
        const t = (el) => el.getAttribute("data-testid") || "";
        const vis = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const imgs = [...document.querySelectorAll("img")]
            .filter(vis)
            .map((el) => ({ src: (el.currentSrc || el.src || "").slice(0, 60), w: el.naturalWidth, h: el.naturalHeight }))
            .filter((i) => i.src && !i.src.includes("logo"));
        return {
            submitButtons: [...document.querySelectorAll("button")]
                .filter((el) => vis(el) && /submit|generate|开始|生成|应用/.test(`${t(el)} ${el.innerText}`))
                .map((el) => ({ id: t(el), text: el.innerText.trim().slice(0, 14), disabled: el.disabled })),
            issues: [...document.querySelectorAll('[data-testid$="-issues"], [data-testid$="-notice"], [data-testid$="-error"]')]
                .filter(vis)
                .map((el) => `${t(el)}=${el.innerText.trim().slice(0, 120)}`),
            images: imgs,
            bodyText: document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 900),
        };
    });
}

/** 结果图：提交后出现的、尺寸够大的第一张非源图图片。 */
async function grabResult(page, before, resultSelector) {
    const cand = await page.evaluate(({ beforeSrc, resultSelector }) => {
        const vis = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 120 && r.height > 120;
        };
        const bigEnough = (el) => (el.naturalWidth || 0) > 200;
        const srcOf = (el) => el.currentSrc || el.src || "";
        // 配方指定了结果容器：只认这里（工作台自绘结果网格，不走共享 ToolResult）
        if (resultSelector) {
            const own = [...document.querySelectorAll(resultSelector)].filter((el) => srcOf(el));
            return own.length ? srcOf(own[own.length - 1]) : "";
        }

        // 第零优先：共享结果组件 ToolResult 的结果图（对比滑块、源图条带都不在这里）。
        const shared = [...document.querySelectorAll("[data-testid=tool-result-image]")].filter((el) => srcOf(el));
        if (shared.length) return srcOf(shared[shared.length - 1]);

        // 第一优先：结果区容器里的图（各工作台用 `<tool>-result(s)` 命名）。
        // 只看这里能避免把「上传后的源图预览」当成生成结果（假阳性）。
        const scopes = [...document.querySelectorAll('[data-testid*="result"]')].filter(
            (el) => !/empty|status|stale|feedback/.test(el.getAttribute("data-testid") || ""),
        );
        const scoped = scopes
            .flatMap((scope) => [...scope.querySelectorAll("img")])
            .filter((el) => vis(el) && bigEnough(el));
        if (scoped.length) return srcOf(scoped[scoped.length - 1]);

        // 退路：页面上确实没有结果区容器时才用全局启发式，且必须排除提交前已存在/同一 URL 的图。
        const known = new Set(beforeSrc);
        const imgs = [...document.querySelectorAll("img")]
            .filter((el) => vis(el) && bigEnough(el))
            .filter((el) => !known.has(srcOf(el)))
            .filter((el) => !beforeSrc.some((s) => s && s.slice(0, 60) === srcOf(el).slice(0, 60)));
        const last = imgs[imgs.length - 1];
        return last ? srcOf(last) : "";
    }, { beforeSrc: before, resultSelector });
    return cand;
}

async function saveImage(page, src, filePath) {
    if (!src) return false;
    if (src.startsWith("data:")) {
        const base64 = src.split(",")[1] || "";
        await fs.writeFile(filePath, Buffer.from(base64, "base64"));
        return true;
    }
    if (src.startsWith("blob:")) {
        const bytes = await page.evaluate(async (url) => {
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            return Array.from(new Uint8Array(buf));
        }, src);
        await fs.writeFile(filePath, Buffer.from(bytes));
        return true;
    }
    if (src.startsWith("http")) {
        const res = await page.request.get(src);
        if (res.ok()) {
            await fs.writeFile(filePath, await res.body());
            return true;
        }
    }
    return false;
}

async function runTool(toolId) {
    const recipe = RECIPES[toolId];
    if (!recipe) throw new Error(`没有该工具的验收配方：${toolId}`);
    const dir = path.join(EVIDENCE_ROOT, toolId);
    await fs.mkdir(dir, { recursive: true });

    const browser = await launchBrowser();
    const { context, page, network } = await prepareContext(browser);
    const record = { toolId, route: recipe.route, fixture: recipe.fixture, startedAt: new Date().toISOString() };

    try {
        if (REAL_PROVIDER) record.provider = await applyProviderConfig(page);
        await page.goto(`${BASE_URL}${recipe.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-testid=tool-workspace]", { timeout: 25000 });
        await sleep(1200);
        const before = await snapshot(page);
        record.before = { images: before.images.map((i) => i.src), issues: before.issues };
        await page.screenshot({ path: path.join(dir, "step-1-loaded.png") });

        const submitBefore = before.submitButtons.find((b) => /submit|generate/.test(b.id));
        record.submitBefore = submitBefore || null;

        if (recipe.run) await recipe.run(page);
        else {
            await recipe.prepare(page);
            await sleep(800);
            // 用 Playwright locator（配方里有 :has-text 这类非 CSS 选择器）
            const btn = page.locator(recipe.submit).first();
            const found = (await btn.count()) > 0;
            const countText = recipe.countSelector ? ((await page.locator(recipe.countSelector).first().innerText().catch(() => "")) || "").trim().slice(0, 80) : "";
            const gate = { found, disabled: found ? await btn.isDisabled() : null, text: found ? (await btn.innerText()).trim().slice(0, 30) : "", countText };
            record.gate = gate;
            // IC_DRY=1：只准备不提交（零费用核对配方与张数）
            if (DRY) {
                await page.screenshot({ path: path.join(dir, "dry.png") });
                record.dry = true;
                record.ok = gate.found && gate.disabled === false;
                record.issuesAtGate = (await snapshot(page)).issues;
                return record.ok;
            }
            await page.click(recipe.submit);
        }
        await sleep(1500);
        await page.screenshot({ path: path.join(dir, "step-2-submitted.png") });

        // 等结果：最多 300 秒，出现新的大图或明确错误就收手
        const deadline = Date.now() + 300_000;
        let resultSrc = "";
        let lastSnap = null;
        while (Date.now() < deadline) {
            await sleep(5000);
            resultSrc = await grabResult(page, before.images.map((i) => i.src), recipe.resultSelector);
            lastSnap = await snapshot(page);
            const err = lastSnap.issues.find((i) => /error|失败|错误/.test(i));
            const pending = lastSnap.submitButtons.some((b) => /submit|generate/.test(b.id) && b.disabled);
            // 提交中时结果区里可能只有源图预览，必须等按钮退出 pending 再判定
            if (pending) continue;
            if (resultSrc || err) break;
        }

        record.finishedAt = new Date().toISOString();
        record.after = lastSnap;
        record.resultSrcPrefix = resultSrc.slice(0, 40);
        record.resultCount = await page.locator(recipe.resultSelector || "[data-testid=tool-result-image]").count().catch(() => null);
        record.resultSaved = await saveImage(page, resultSrc, path.join(dir, "result.png"));
        record.network = network.filter((n) => n.method === "POST");

        // 假阳性防护：本次源图哈希 == 结果图哈希 时，说明抓到的是上传预览，不是生成结果。
        const fixtureSha = await fileSha256(path.join(FIXTURES, recipe.fixture));
        record.fixtureSha256 = fixtureSha.slice(0, 16);
        if (record.resultSaved) {
            const resultSha = await fileSha256(path.join(dir, "result.png"));
            record.resultSha256 = resultSha.slice(0, 16);
            if (resultSha === fixtureSha) {
                record.bogusSourceEcho = true;
                record.resultSaved = false;
                await fs.rm(path.join(dir, "result.png"), { force: true });
            }
        }
        record.ok = Boolean(resultSrc) && record.resultSaved === true && !record.bogusSourceEcho;
        // 结果动作：真实点击「下载」，校验下载字节与源图不同
        const dl = page.locator(recipe.downloadSelector || "[data-testid=tool-result-download-0]").first();
        if (record.ok && (await dl.count())) {
            const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), dl.click()]);
            const file = path.join(dir, `download-${download.suggestedFilename()}`);
            await download.saveAs(file);
            const sha = await fileSha256(file);
            record.download = { file: path.basename(file), bytes: (await fs.stat(file)).size, sha256: sha.slice(0, 16), differsFromSource: sha !== fixtureSha };
        }
        await page.screenshot({ path: path.join(dir, "ui.png") });
    } catch (error) {
        record.error = String(error && error.message ? error.message : error);
        record.ok = false;
        await page.screenshot({ path: path.join(dir, "ui-error.png") }).catch(() => null);
    } finally {
        await fs.writeFile(path.join(dir, "run.json"), JSON.stringify(record, null, 2));
        await browser.close();
    }
    console.log(JSON.stringify({ toolId, ok: record.ok, error: record.error || null, resultSaved: record.resultSaved || false, download: record.download || null, network: (record.network || []).length, issues: (record.after && record.after.issues) || [] }));
    return record.ok;
}

const target = process.argv[2] || "all";
if (target === "all") {
    const results = {};
    // IMAGE_CROP 是零算力工具（无 crop-submit），由 crop-functional-accept.mjs 单独验收，这里不设配方
    for (const id of Object.keys(RECIPES)) {
        results[id] = await runTool(id);
        await fs.writeFile(path.join(EVIDENCE_ROOT, "summary.json"), JSON.stringify(results, null, 2));
    }
    process.exit(Object.values(results).every(Boolean) ? 0 : 1);
} else {
    const ok = await runTool(target);
    process.exit(ok ? 0 : 1);
}
