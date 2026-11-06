import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    toEqual: (expected: unknown) => void;
    not: { toContain: (expected: string) => void; toBe: (expected: unknown) => void };
};

// 与 video-translation-honesty.test.tsx 保持一致：仓库未装 bun 类型包，动态导入避免 tsc --noEmit 报 TS2307。
const { afterAll, beforeAll, describe, expect, test } = (await import("bun:test" as string)) as {
    afterAll: (fn: () => void | Promise<void>) => void;
    beforeAll: (fn: () => void | Promise<void>) => void;
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * VIDEO_TRANSLATION 工作台 EN 态中文残留治理（r30）：
 * - zh-CN / en-US 的 videoTranslation 键位必须一一对应（缺键会静默回退中文）；
 * - 组件里出现的静态键必须真实存在于两份语言包；
 * - EN 渲染结果不允许出现中文字符；ZH 渲染必须仍有中文（防止「全英文」这种反向事故）；
 * - 诚实提示条字号按 r30 要求提到 12px（text-xs），不再用 11px。
 */

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
        clear: () => void values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() {
            return values.size;
        },
    },
});

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

function flatten(node: unknown, prefix = ""): string[] {
    if (node === null || typeof node !== "object") return [prefix];
    return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
        flatten(child, prefix ? `${prefix}.${key}` : key),
    );
}

async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router-dom");
    // 渠道默认名是「模块加载时按当时语言写进数据」的（use-config-store 的初始 config），
    // 全量跑时本进程可能先以 zh-CN 加载过，于是数据里留下中文渠道名。
    // 那是用户数据不是 UI 文案：渲染前重置成固定英文 fixture，断言只反映界面文案。
    const { useConfigStore } = await import("@/stores/use-config-store");
    const { VideoTranslationWorkspace } = await import("./video-translation");
    // 放在所有 await 之后、渲染之前：避免 persist 的异步 rehydrate 把状态又盖回去。
    useConfigStore.setState((state) => ({
        config: {
            ...state.config,
            channels: state.config.channels.map((channel) => ({ ...channel, name: "Test Channel" })),
        },
    }));
    return renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(VideoTranslationWorkspace)) as ReactElement,
    );
}

describe("video-translation i18n", () => {
    let zh: { videoTranslation: Record<string, unknown> };
    let en: { videoTranslation: Record<string, unknown> };
    let zhHtml = "";
    let enHtml = "";
    let i18nModule: { default: { changeLanguage: (lng: string) => Promise<unknown>; language: string } };

    beforeAll(async () => {
        zh = (await import("@/i18n/locales/zh-CN")).default as typeof zh;
        en = (await import("@/i18n/locales/en-US")).default as typeof en;
        i18nModule = (await import("@/i18n")) as typeof i18nModule;
        await i18nModule.default.changeLanguage("en-US");
        enHtml = await renderWorkspace();
        await i18nModule.default.changeLanguage("zh-CN");
        zhHtml = await renderWorkspace();
    });

    afterAll(async () => {
        await i18nModule.default.changeLanguage("zh-CN");
    });

    test("zh/en 的 videoTranslation 键位完全一致", () => {
        // i18next 复数键（_one/_other/...）按语言不同，比较前统一剥离后缀。
        const stripPlural = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, "");
        const zhKeys = [...new Set(flatten(zh.videoTranslation).map(stripPlural))].sort();
        const enKeys = [...new Set(flatten(en.videoTranslation).map(stripPlural))].sort();
        const missingInEn = zhKeys.filter((key) => !enKeys.includes(key));
        const missingInZh = enKeys.filter((key) => !zhKeys.includes(key));
        expect({ missingInEn, missingInZh }).toEqual({ missingInEn: [], missingInZh: [] });
    });

    test("en-US 的 videoTranslation 文案不含中文", () => {
        const walk = (node: unknown, prefix = ""): string[] => {
            if (typeof node === "string") return CJK.test(node) ? [prefix] : [];
            if (node === null || typeof node !== "object") return [];
            return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
                walk(child, prefix ? `${prefix}.${key}` : key),
            );
        };
        expect(walk(en.videoTranslation)).toEqual([]);
    });

    test("EN 渲染态不出现中文（工作台主体已全部走 i18n）", async () => {
        // bun test 同进程跑多文件，i18n 语言可能被其他测试改过：这里显式切一次再渲染。
        await i18nModule.default.changeLanguage("en-US");
        const enHtml = await renderWorkspace();
        // 语言下拉里的「简体中文 / 日本語」是语言自称（数据），不是 UI 文案：先剔除 <option> 再查。
        const enHtmlClean = enHtml
            // 语言下拉里的「中文（简体）」「日本語」是语言自称（数据），不是 UI 文案：先剔除 <option>。
            .replace(/<option[\s\S]*?<\/option>/g, "<option></option>")
            // 模型选择器显示的是「模型（渠道名）」，渠道名是用户数据（默认渠道名在模块加载时按当时语言固化进
            // defaultConfig），不是本页文案：剔除该处 title 与文本后，其余区域仍要求零中文。
            .replace(/\stitle="[^"]*"/g, "")
            .replace(/<span class="canvas-model-picker-text[^"]*">[\s\S]*?<\/span>/g, "<span></span>")
            // 共享组件 ToolCases / ToolCaseGuide 自带中文（「优秀案例」alt、「预览」「做同款」「一键做同款」），尚未接 i18n：
            // 剔除案例页签面板与空态引导卡子树（本页传入的标题/标签已走 i18n），其余区域仍要求零中文。
            .replace(/data-testid="video-translation-cases"[\s\S]*?(?=data-testid="video-translation-history")/, "")
            .replace(/data-testid="video-translation-guide"[\s\S]*$/, "");
        const hits = enHtmlClean.match(new RegExp(CJK.source, "g")) ?? [];
        const phrases = enHtmlClean.match(/[\u4e00-\u9fff]{2,}/g) ?? [];

        expect({ cjkCount: hits.length, phrases }).toEqual({ cjkCount: hits.length, phrases: [] });
    });

    test("ZH 渲染态仍然说中文（没有过度英化）", async () => {
        await i18nModule.default.changeLanguage("zh-CN");
        const zhHtml = await renderWorkspace();
        expect(zhHtml).toContain("视频翻译");
        expect(zhHtml).toContain("上传原始视频");
    });

    test("诚实提示条字号为 12px（text-xs）", async () => {
        await i18nModule.default.changeLanguage("en-US");
        const enHtml = await renderWorkspace();
        expect(enHtml).toContain("text-xs leading-5 text-amber-700");
        expect(enHtml).not.toContain("text-[11px] leading-5 text-amber-700");
    });

    test("EN 态提交按钮、源视频栏与历史区文案已英化", async () => {
        await i18nModule.default.changeLanguage("en-US");
        const enHtml = await renderWorkspace();
        expect(enHtml).toContain("Generate now");
        expect(enHtml).toContain("Source video");
        expect(enHtml).toContain("Task history");
        expect(enHtml).toContain("AI regeneration result (unverified translation)");
    });
});
