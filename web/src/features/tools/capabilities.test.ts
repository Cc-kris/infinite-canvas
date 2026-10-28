import { describe, expect, test } from "bun:test";

import {
    assertToolProvider,
    canSubmitTool,
    capabilityCoverage,
    capabilityRequirementsForSpec,
    evaluateToolProvider,
    providerCapabilities,
    ToolCapabilityError,
    toolCapabilityRequirements,
} from "@/features/tools/capabilities";
import { toolSpecs } from "@/features/tools/registry";

// services/api/* 会 import @/i18n，而 i18n 初始化时读 localStorage；bun test 没有 DOM。
// 先补一个最小 localStorage，再动态 import 服务层，避免静态 import 抢在 shim 之前执行。
if (!("localStorage" in globalThis)) {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        value: {
            get length() {
                return store.size;
            },
            clear: () => store.clear(),
            getItem: (key: string) => store.get(key) ?? null,
            key: (index: number) => [...store.keys()][index] ?? null,
            removeItem: (key: string) => store.delete(key),
            setItem: (key: string, value: string) => void store.set(key, String(value)),
        },
        configurable: true,
    });
}

const { isUsableImageSource } = await import("@/services/api/image");
const { assertPlayableVideoBlob, ensurePlayableVideoResult, isPlayableVideoPayload, VideoPayloadError } = await import("@/services/api/video");

const OPENAI_IMAGE = { kind: "image", apiFormat: "openai" } as const;
const OPENAI_VIDEO = { kind: "video", apiFormat: "openai" } as const;
const GEMINI_IMAGE = { kind: "image", apiFormat: "gemini" } as const;
const GEMINI_VIDEO = { kind: "video", apiFormat: "gemini" } as const;
const PLUGIN_VIDEO = { kind: "video", apiFormat: "plugin" } as const;

function mp4Head() {
    const bytes = new Uint8Array(32);
    bytes.set([0x00, 0x00, 0x00, 0x18], 0);
    bytes.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
    bytes.set([0x69, 0x73, 0x6f, 0x6d], 8);
    return bytes;
}

describe("能力需求推导（39 工具全覆盖）", () => {
    test("registry 的每个工具都能推导出至少一条能力需求", () => {
        const coverage = capabilityCoverage();
        expect(coverage.total).toBe(39);
        expect(coverage.missing).toEqual([]);
    });

    test("每个工具的需求只使用 capability-notice 定义的能力键", () => {
        const keys = new Set(["imageEdit", "mask", "referenceVideo", "lipSync", "multiReference", "aspectRatio", "duration", "resolution", "outputNum"]);
        for (const spec of toolSpecs) {
            for (const requirement of capabilityRequirementsForSpec(spec)) {
                expect(keys.has(requirement.key)).toBe(true);
                expect(typeof requirement.required).toBe("boolean");
            }
        }
    });

    test("蒙版工具：mask 是可选降级，其余能力跟随字段必填", () => {
        const requirements = toolCapabilityRequirements("AI_OUTPAINTING");
        const mask = requirements.find((item) => item.key === "mask");
        expect(mask).toBeDefined();
        expect(mask?.required).toBe(false);
        expect(mask?.note).toContain("参考图");
    });

    test("视频工具：源视频是必需能力", () => {
        for (const toolId of ["VIDEO_REPLICATION", "AI_VIDEO_EDITING", "VIDEO_TRANSLATION"]) {
            const requirement = toolCapabilityRequirements(toolId).find((item) => item.key === "referenceVideo");
            expect(requirement).toBeDefined();
            expect(requirement?.required).toBe(true);
        }
    });

    test("口型工具：lipSync 必填（缺证据不能放行）", () => {
        const requirement = toolCapabilityRequirements("VIDEO_TRANSLATION").find((item) => item.key === "lipSync");
        expect(requirement?.required).toBe(true);
    });
});

describe("Provider 能力证据", () => {
    test("openai 图片通道没有 mask 参数，也没有出片时长概念", () => {
        const evidence = providerCapabilities(OPENAI_IMAGE);
        expect(evidence.mask).toBe("unsupported");
        expect(evidence.multiReference).toBe("supported");
        expect(evidence.outputNum).toBe("supported");
        expect(evidence.duration).toBe("unsupported");
    });

    test("gemini 图片通道支持多图、画幅、分辨率与批量张数", () => {
        const evidence = providerCapabilities(GEMINI_IMAGE);
        expect(evidence.multiReference).toBe("supported");
        expect(evidence.aspectRatio).toBe("supported");
        expect(evidence.resolution).toBe("supported");
        expect(evidence.outputNum).toBe("supported");
    });

    test("openai 视频通道支持参考视频、多图、时长，但没有 n（出片数量）", () => {
        const evidence = providerCapabilities(OPENAI_VIDEO);
        expect(evidence.referenceVideo).toBe("supported");
        expect(evidence.multiReference).toBe("supported");
        expect(evidence.duration).toBe("supported");
        expect(evidence.outputNum).toBe("unsupported");
        expect(evidence.lipSync).toBe("unsupported");
    });

    test("gemini 视频通道无出片数量、无口型参数", () => {
        const evidence = providerCapabilities(GEMINI_VIDEO);
        expect(evidence.outputNum).toBe("unsupported");
        expect(evidence.lipSync).toBe("unsupported");
        expect(evidence.referenceVideo).toBe("supported");
    });

    test("http 通道按请求体模板占位符判定能力，没有占位符就是没有该能力", () => {
        const bare = providerCapabilities({ kind: "video", apiFormat: "http", httpBodyTemplate: "{\"prompt\":\"{{prompt}}\"}" });
        expect(bare.imageEdit).toBe("unsupported");
        expect(bare.referenceVideo).toBe("unsupported");
        expect(bare.duration).toBe("unsupported");

        const rich = providerCapabilities({
            kind: "video",
            apiFormat: "http",
            httpBodyTemplate: "{\"prompt\":\"{{prompt}}\",\"images\":\"{{images}}\",\"seconds\":\"{{seconds}}\",\"ratio\":\"{{ratio}}\"}",
        });
        expect(rich.imageEdit).toBe("supported");
        expect(rich.multiReference).toBe("supported");
        expect(rich.duration).toBe("supported");
        expect(rich.aspectRatio).toBe("supported");
        expect(rich.referenceVideo).toBe("unsupported");
    });

    test("未知通道一律无证据，不默认放行", () => {
        const evidence = providerCapabilities({ kind: "video", apiFormat: "unknown" });
        expect(Object.values(evidence).filter(Boolean)).toEqual([]);
        const verdict = evaluateToolProvider("VIDEO_REPLICATION", { kind: "video", apiFormat: "unknown" });
        expect(verdict.evaluation.blocked).toBe(true);
    });
});

describe("提交闸门 A/B：同一工具换通道，判定必须不同", () => {
    test("蒙版工具 × openai 图片：可以提交，但必须先接受「蒙版降级」", () => {
        const verdict = evaluateToolProvider("AI_OUTPAINTING", OPENAI_IMAGE);
        expect(verdict.evaluation.blocked).toBe(false);
        expect(verdict.evaluation.degradations).toContain("mask");
        expect(canSubmitTool("AI_OUTPAINTING", OPENAI_IMAGE)).toBe(false);
        expect(canSubmitTool("AI_OUTPAINTING", OPENAI_IMAGE, ["mask"])).toBe(true);
    });

    test("A/B：AI_VIDEO_EDITING 在 openai 视频被拦住（没有出片数量），换成插件通道放行", () => {
        const blocked = evaluateToolProvider("AI_VIDEO_EDITING", OPENAI_VIDEO);
        expect(blocked.evaluation.blocked).toBe(true);
        expect(blocked.evaluation.blockedKeys).toContain("outputNum");
        expect(canSubmitTool("AI_VIDEO_EDITING", OPENAI_VIDEO, ["outputNum", "mask", "multiReference"])).toBe(false);

        expect(canSubmitTool("AI_VIDEO_EDITING", PLUGIN_VIDEO, ["mask", "multiReference"])).toBe(true);
    });

    test("A/B：口型翻译在 openai 视频是 blocker，在插件通道也必须拦住（插件没有 lipSync 参数）", () => {
        expect(evaluateToolProvider("VIDEO_TRANSLATION", OPENAI_VIDEO).evaluation.blocked).toBe(true);
        expect(canSubmitTool("VIDEO_TRANSLATION", PLUGIN_VIDEO)).toBe(false);
    });

    test("口型同步按本次开关判定：关闭即放行（配音 + 字幕路由），不会永久禁用", () => {
        const values = { lipSync: false, outputNum: 1 };
        // 静态（不传值）仍按页面默认「开启」保守判定
        expect(toolCapabilityRequirements("VIDEO_TRANSLATION").some((item) => item.key === "lipSync" && item.required)).toBe(true);

        const closed = evaluateToolProvider("VIDEO_TRANSLATION", OPENAI_VIDEO, { values });
        expect(closed.requirements.some((item) => item.key === "lipSync")).toBe(false);
        expect(closed.evaluation.blocked).toBe(false);
        expect(canSubmitTool("VIDEO_TRANSLATION", OPENAI_VIDEO, [], { values })).toBe(true);
        expect(() => assertToolProvider("VIDEO_TRANSLATION", OPENAI_VIDEO, [], { values })).not.toThrow();

        // 口径一致：用户重新打开口型同步 → 立刻回到「缺通道参数」的阻断，并给出可执行说明
        const opened = evaluateToolProvider("VIDEO_TRANSLATION", OPENAI_VIDEO, { values: { ...values, lipSync: true } });
        expect(opened.evaluation.blocked).toBe(true);
        expect(opened.evaluation.blockedKeys).toContain("lipSync");
        const note = opened.evaluation.issues.find((issue) => issue.key === "lipSync")?.detail ?? "";
        expect(note).toContain("关闭");
    });

    test("输出数量按通道原生条数判定：1 条放行，超过才要「多输出」能力", () => {
        expect(canSubmitTool("VIDEO_TRANSLATION", OPENAI_VIDEO, [], { values: { lipSync: false, outputNum: 1 }, nativeOutputCount: 1 })).toBe(true);

        const more = evaluateToolProvider("VIDEO_TRANSLATION", OPENAI_VIDEO, {
            values: { lipSync: false, outputNum: 2 },
            nativeOutputCount: 1,
        });
        expect(more.evaluation.blocked).toBe(true);
        expect(more.evaluation.blockedKeys).toContain("outputNum");

        // 通道本身能出 2 条时不再算缺口
        expect(canSubmitTool("VIDEO_TRANSLATION", OPENAI_VIDEO, [], { values: { lipSync: false, outputNum: 2 }, nativeOutputCount: 2 })).toBe(true);
    });

    test("http 模板没有 {{images}} 时，吃图工具被拦住而不是静默丢图", () => {
        const provider = { kind: "video", apiFormat: "http", httpBodyTemplate: "{\"prompt\":\"{{prompt}}\"}" } as const;
        const verdict = evaluateToolProvider("VIDEO_REPLICATION", provider);
        expect(verdict.evaluation.blocked).toBe(true);
        expect(verdict.evaluation.blockedKeys).toContain("imageEdit");
    });

    test("assertToolProvider 抛出带工具与能力键的可定位错误", () => {
        expect(() => assertToolProvider("VIDEO_TRANSLATION", OPENAI_VIDEO)).toThrow(ToolCapabilityError);
        try {
            assertToolProvider("VIDEO_TRANSLATION", OPENAI_VIDEO);
        } catch (error) {
            const failure = error as ToolCapabilityError;
            expect(failure.toolId).toBe("VIDEO_TRANSLATION");
            expect(failure.keys).toContain("lipSync");
            expect(failure.message).toContain("能力");
        }
        // 降级项未确认也算不合格
        expect(() => assertToolProvider("AI_OUTPAINTING", OPENAI_IMAGE)).toThrow(ToolCapabilityError);
        expect(() => assertToolProvider("AI_OUTPAINTING", OPENAI_IMAGE, ["mask"])).not.toThrow();
    });
});

describe("真实结果校验：不允许假成功", () => {
    test("可播放容器放行，HTML/JSON/空体一律判失败", async () => {
        expect(isPlayableVideoPayload(mp4Head(), "video/mp4")).toBe(true);
        expect(isPlayableVideoPayload(new Uint8Array(32), "")).toBe(false);

        await expect(assertPlayableVideoBlob(new Blob([mp4Head()], { type: "video/mp4" }))).resolves.toBeInstanceOf(Blob);

        const html = new Blob(["<!doctype html><html>502 Bad Gateway</html>"], { type: "text/html" });
        await expect(assertPlayableVideoBlob(html)).rejects.toBeInstanceOf(VideoPayloadError);

        const json = new Blob([JSON.stringify({ code: 500, msg: "upstream exploded" })], { type: "application/json" });
        await expect(assertPlayableVideoBlob(json)).rejects.toThrow("upstream exploded");

        await expect(assertPlayableVideoBlob(new Blob([], { type: "video/mp4" }))).rejects.toBeInstanceOf(VideoPayloadError);
    });

    test("非 Blob 载荷（Node/Bun axios 忽略 responseType 返回 latin1 字符串）也能校验并归一成 Blob", async () => {
        const head = mp4Head();
        // 模拟 axios 在 Node/Bun 下的行为：二进制被当成 latin1 字符串返回。
        const asLatin1 = Array.from(head, (byte) => String.fromCharCode(byte)).join("");
        const normalized = await assertPlayableVideoBlob(asLatin1 as unknown as Blob);
        expect(normalized).toBeInstanceOf(Blob);
        expect(normalized.size).toBe(head.byteLength);

        const fromBuffer = await assertPlayableVideoBlob(head as unknown as Blob);
        expect(fromBuffer.size).toBe(head.byteLength);

        const fromArrayBuffer = await assertPlayableVideoBlob(Uint8Array.from(head).buffer as unknown as Blob);
        expect(fromArrayBuffer.size).toBe(head.byteLength);

        // 字符串形态的 HTML 错误页同样要判失败，而不是因为“不是 Blob”崩掉。
        await expect(assertPlayableVideoBlob("<!doctype html><html>502</html>" as unknown as Blob)).rejects.toBeInstanceOf(VideoPayloadError);
    });

    test("任务完成但结果为空/不可下载时判失败", () => {
        expect(() => ensurePlayableVideoResult(undefined)).toThrow();
        expect(() => ensurePlayableVideoResult({ url: "" })).toThrow();
        expect(() => ensurePlayableVideoResult({ url: "not a url" })).toThrow();
        expect(() => ensurePlayableVideoResult({ blob: new Blob([], { type: "video/mp4" }) })).toThrow();
        expect(ensurePlayableVideoResult({ url: "https://cdn.example.com/a.mp4" }).url).toBe("https://cdn.example.com/a.mp4");
        expect(ensurePlayableVideoResult({ blob: new Blob([mp4Head()], { type: "video/mp4" }) }).blob).toBeDefined();
    });

    test("图片结果里的 HTML/JSON 文本不会被当成图片地址", () => {
        expect(isUsableImageSource("https://cdn.example.com/a.png")).toBe(true);
        expect(isUsableImageSource("data:image/png;base64,AAAA")).toBe(true);
        expect(isUsableImageSource("<!doctype html><html>error</html>")).toBe(false);
        expect(isUsableImageSource('{"code":1,"msg":"bad"}')).toBe(false);
        expect(isUsableImageSource("")).toBe(false);
        expect(isUsableImageSource("   ")).toBe(false);
        expect(isUsableImageSource(null)).toBe(false);
    });
});
