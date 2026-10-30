import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 enhance.test.tsx 保持一致：仓库未装 bun 类型包，动态导入避免 tsc --noEmit 报 TS2307。
const { afterAll, beforeAll, describe, expect, test } = (await import("bun:test" as string)) as {
    afterAll: (fn: () => void | Promise<void>) => void;
    beforeAll: (fn: () => void | Promise<void>) => void;
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

/**
 * VIDEO_TRANSLATION 诚实能力降级（依据 r27 协议调查，提交 1ef24fba）：
 * 当前通道只能按提示词「重生成」视频，不能承诺逐句翻译 / 口型对齐 / 字幕。
 * 这里用 react-dom/server 渲染真实工作台，断言面板常驻提示、语言仅提示词说明、
 * 口型同步置灰、结果未验证徽标都在，并且整页不出现任何虚假成功承诺。
 */

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() {
            return values.size;
        },
    },
});

async function renderWorkspace(): Promise<string> {
    const React = await import("react");
    const { MemoryRouter } = await import("react-router-dom");
    const { VideoTranslationWorkspace } = await import("./video-translation");
    return renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(VideoTranslationWorkspace)) as ReactElement,
    );
}

/** 取出某个 data-testid 对应的整个标签文本，便于断言 disabled / aria 属性。 */
function tag(html: string, testId: string): string {
    const start = html.indexOf(`data-testid="${testId}"`);
    if (start < 0) return "";
    const open = html.lastIndexOf("<", start);
    const end = html.indexOf(">", start);
    return html.slice(open, end + 1);
}

/** 任何"翻译已完成"式的虚假承诺都不允许出现（中英双语都查）。 */
const FALSE_PROMISES = [
    "翻译完成",
    "已译制",
    "已对口型",
    "已生成字幕",
    "已识别源语言",
    "智能识别源语言",
    "译为目标语言并重新配音",
    "唇形对齐",
    "只替换音轨与字幕",
];

describe("视频翻译工作台：诚实能力边界", () => {
    let html = "";

    beforeAll(async () => {
        const i18n = (await import("@/i18n")).default;
        await i18n.changeLanguage("zh-CN");
        values.clear();
        html = await renderWorkspace();
    });

    afterAll(async () => {
        const i18n = (await import("@/i18n")).default;
        await i18n.changeLanguage("zh-CN");
    });

    test("面板持续展示「AI 视频重生成，非逐句翻译 / 口型对齐；真实翻译通道未接入」", () => {
        expect(html).toContain('data-testid="video-translation-honesty-notice"');
        expect(html).toContain("当前为 AI 视频重生成，非逐句翻译 / 口型对齐；真实翻译通道未接入");
        // 依据可追溯，避免"口说无凭"
        expect(html).toContain("1ef24fba");
        // 副标题与顶部徽标同步降级
        expect(html).toContain("AI 视频重生成（实验）");
        expect(html).toContain('data-testid="video-translation-capability-badge"');
    });

    test("源语言/目标语言明确标注「仅影响提示词」，不承诺换语言或字幕", () => {
        expect(html).toContain("源语言 → 目标语言（仅影响提示词）");
        expect(html).toContain("仅提示词引导 · 上游无 language 字段，不保证生效");
        expect(html).toContain('data-testid="video-translation-language-hint"');
        expect(html).toContain("源语言只写进提示词，不会被上游真实识别。");
    });

    test("口型同步置灰且 aria-checked=false，并解释上游无该参数", () => {
        const switchTag = tag(html, "video-translation-lipsync-switch");
        expect(switchTag).toContain("disabled");
        expect(switchTag).toContain('aria-checked="false"');
        expect(html).toContain('data-lipsync-supported="false"');
        expect(html).toContain('data-testid="video-translation-lipsync-hint"');
        expect(html).toContain("上游无 lipSync 参数：开关已置灰，提交时不带该字段，也不做逐句口型对齐。");
    });

    test("输出数量标注当前渠道只返回 1 条，结果区标注未验证翻译", () => {
        expect(html).toContain('data-testid="video-translation-output-hint"');
        expect(html).toContain("当前渠道一次只返回 1 条结果。");
        expect(html).toContain("AI 重生成结果（未验证翻译）");
        expect(html).toContain('data-testid="video-translation-draft-badge"');
        expect(html).toContain("未验证翻译 · 请人工确认语言与字幕");
    });

    test("整页不出现「翻译完成 / 已译制 / 已对口型 / 已生成字幕 / 已识别源语言」等承诺", () => {
        for (const phrase of FALSE_PROMISES) {
            expect(html).not.toContain(phrase);
        }
    });

    test("保留工具入口、通用生成能力与历史任务，不把工具藏起来", () => {
        expect(html).toContain("立即生成");
        expect(html).toContain("视频模型");
        expect(html).toContain('data-testid="video-translation-output-ratio"');
        expect(html).toContain('data-testid="video-translation-source-language"');
        expect(html).toContain('data-testid="video-translation-target-language"');
        expect(html).toContain('data-testid="video-translation-history"');
        expect(html).toContain("上传原视频");
        // 没有原视频/模型时必须给出阻塞原因，而不是假装可提交
        expect(tag(html, "video-translation-submit")).toContain("disabled");
    });

    test("英文界面同样只讲重生成，不出现 dub / translation finished 之类的承诺", async () => {
        const i18n = (await import("@/i18n")).default;
        await i18n.changeLanguage("en-US");
        const en = await renderWorkspace();
        expect(en).toContain("AI video regeneration");
        expect(en).toContain("no real translation channel is connected");
        expect(en).toContain("Prompt guidance only · no language field upstream, not guaranteed");
        expect(en).toContain("Unverified translation · confirm language and subtitles manually");
        expect(en).not.toContain("Translation completed");
        expect(en).not.toContain("Lip sync applied");
        await i18n.changeLanguage("zh-CN");
    });
});
