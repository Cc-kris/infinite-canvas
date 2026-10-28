/**
 * VIDEO_TRANSLATION / 视频提交参数路由的单测（bun test）。
 * 断言基于 2026-10-29 真实验收拿到的上游原文（sub2api 收 multipart 直接 400）。
 * bun 无 DOM：先 stub localStorage，再动态 import 被测模块（其依赖 i18n 顶层读 localStorage）。
 */
import { describe, expect, it } from "bun:test";

if (!("localStorage" in globalThis)) {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        value: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, String(v)),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
            key: (i: number) => [...store.keys()][i] ?? null,
            get length() {
                return store.size;
            },
        },
        configurable: true,
    });
}

const { collectPublicVideoUrls, planVideoSubmitPayloads, relayMultipartRejectionHint } = await import(
    "./video"
);

const SUB2API_MULTIPART_400 =
    "'utf-8' codec can't decode byte 0xe8 in position 1614: invalid continuation byte";

describe("planVideoSubmitPayloads · 源视频内联进 JSON（中转域）", () => {
    it("源视频只有公网 URL 时，中转域先发 JSON（实测 sub2api 收 multipart 直接 400）", () => {
        const plan = planVideoSubmitPayloads({
            inlineImages: false,
            mediaOnlyInMultipart: false,
            relayHost: true,
            inlineVideos: true,
        });
        expect(plan.order).toEqual(["json", "multipart"]);
    });

    it("官方 OpenAI（非中转）仍以 multipart 优先，保留兜底 JSON", () => {
        const plan = planVideoSubmitPayloads({
            inlineImages: false,
            mediaOnlyInMultipart: false,
            relayHost: false,
            inlineVideos: true,
        });
        expect(plan.order).toEqual(["multipart", "json"]);
    });

    it("源视频无法内联（本地 blob）时，仍然只发 multipart", () => {
        const plan = planVideoSubmitPayloads({
            inlineImages: false,
            mediaOnlyInMultipart: true,
            relayHost: true,
            inlineVideos: false,
        });
        expect(plan.order).toEqual(["multipart"]);
    });
});

describe("collectPublicVideoUrls", () => {
    it("只收 http(s)，过滤 blob:/data:", () => {
        expect(
            collectPublicVideoUrls([
                { url: "https://cdn.example.com/a.mp4" },
                { url: "blob:http://localhost:3000/abc" },
                { url: "data:video/mp4;base64,AAAA" },
                { url: "  http://127.0.0.1:18471/video.mp4 " },
                {},
            ]),
        ).toEqual(["https://cdn.example.com/a.mp4", "http://127.0.0.1:18471/video.mp4"]);
        expect(collectPublicVideoUrls(undefined)).toEqual([]);
    });
});

describe("relayMultipartRejectionHint", () => {
    it("命中真实验收拿到的 sub2api 400 原文时给出人话诊断", () => {
        expect(relayMultipartRejectionHint(400, SUB2API_MULTIPART_400)).toContain("只接受 JSON");
    });

    it("其它错误不加提示", () => {
        expect(relayMultipartRejectionHint(500, SUB2API_MULTIPART_400)).toBe("");
        expect(relayMultipartRejectionHint(400, "model not found")).toBe("");
    });
});
