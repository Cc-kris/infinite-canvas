import { describe, expect, test } from "bun:test";

// image-utils → i18n 在模块期读 localStorage，bun test 没有 DOM（与 batch-runner.test.ts 同一处理）。
// ESM 静态 import 会被提升，必须在 stub 之后动态 import。
const localStorageStub = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: localStorageStub });

const { dataUrlToFile } = await import("./image-utils");

/** 1×1 透明 PNG */
const PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("dataUrlToFile", () => {
    test("base64 位图按原 mime 与字节数还原", async () => {
        const file = dataUrlToFile({
            id: "a",
            name: "product.png",
            type: "image/png",
            dataUrl: `data:image/png;base64,${PNG_BASE64}`,
        });
        expect(file).toBeInstanceOf(File);
        expect(file.type).toBe("image/png");
        expect(file.name).toBe("product.png");
        expect(file.size).toBe(Buffer.from(PNG_BASE64, "base64").length);
        const header = new Uint8Array(await file.arrayBuffer()).slice(0, 8);
        expect(Array.from(header)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    });

    test("百分号编码的 SVG data URL 不再走 atob（此前会抛 atob 崩溃）", async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#fff"/></svg>';
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        const file = dataUrlToFile({ id: "pose", name: "pose.svg", type: "image/svg+xml", dataUrl });
        expect(file.type).toBe("image/svg+xml");
        expect(file.name).toBe("pose.svg");
        expect(await file.text()).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    });

    test("base64 载荷带换行仍可解码", async () => {
        const wrapped = PNG_BASE64.replace(/(.{20})/g, "$1\n");
        const file = dataUrlToFile({ id: "b", name: "wrapped.png", type: "image/png", dataUrl: `data:image/png;base64,${wrapped}` });
        expect(file.size).toBe(Buffer.from(PNG_BASE64, "base64").length);
    });

    test("非 data URL 直接报可诊断错误，而不是 atob 的编码异常", () => {
        expect(() => dataUrlToFile({ id: "c", name: "x.png", type: "image/png", dataUrl: "https://cdn.example.com/x.png" })).toThrow(/不是 data URL/);
    });

    test("base64 载荷含非法字符时报出具体原因", () => {
        expect(() =>
            dataUrlToFile({ id: "d", name: "bad.png", type: "image/png", dataUrl: "data:image/png;base64,@@@@" }),
        ).toThrow(/非法字符/);
    });
});
