import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Expectation = {
    toBe: (expected: unknown) => void;
    toContain: (expected: string) => void;
    not: { toContain: (expected: string) => void };
};

// 与 mask.test.tsx / suite.test.tsx 一致：仓库未装 bun 类型包，动态导入避免 tsc 报 TS2307。
const { describe, expect, test } = (await import("bun:test" as string)) as {
    describe: (name: string, fn: () => void) => void;
    expect: (actual: unknown) => Expectation;
    test: (name: string, fn: () => void | Promise<void>) => void;
};

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

/**
 * PRINTING_REPAIR 结果动作的渲染证据（跑真实组件渲染，不是读源码）：
 * LinkFox 原站结果只有「下载图片」，本仓按门禁补「存入资产 / 发送画布」；三动作必须同时出现，
 * 且没有绑定回调（没有真实结果）时必须禁用，避免点到空动作。
 */
async function renderActions(overrides: Record<string, unknown> = {}): Promise<string> {
    const React = await import("react");
    const { PrintingRepairResultActions } = await import("./printing-repair");
    return renderToStaticMarkup(
        React.createElement(PrintingRepairResultActions as never, {
            imageUrl: "https://example.invalid/print-fixed.png",
            imageName: "apparel-print.jpg",
            onSave: () => undefined,
            onSend: () => undefined,
            ...overrides,
        }) as ReactElement,
    );
}

describe("印花修复结果动作", () => {
    test("真实结果同时给出 存入资产 / 发送画布 / 下载结果，下载名带源图名", async () => {
        const html = await renderActions();
        for (const testId of ["printing-repair-save", "printing-repair-send", "printing-repair-download"]) {
            expect(html).toContain(`data-testid="${testId}"`);
        }
        for (const text of ["存入资产", "发送画布", "下载结果"]) expect(html).toContain(text);
        expect(html).toContain('download="apparel-print-print-fixed.png"');
        expect(html).toContain('href="https://example.invalid/print-fixed.png"');
        expect(html).not.toContain('disabled=""');
    });

    test("没有真实结果（未绑定回调）时两个动作禁用，不会静默成功", async () => {
        const html = await renderActions({ onSave: undefined, onSend: undefined });
        expect(html).toContain('disabled=""');
        expect(html).toContain("存入资产");
    });

    test("动作进行中（pending）时再次点击被禁用，并显示结果提示", async () => {
        const html = await renderActions({ pending: true, notice: "已存入资产库（abc12345）" });
        expect(html).toContain('disabled=""');
        expect(html).toContain("已存入资产库（abc12345）");
        expect(html).toContain('data-testid="printing-repair-result-feedback"');
    });
});
