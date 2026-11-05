import { afterAll, describe, expect, test } from "bun:test";

// gateway / config-store / i18n 初始化会碰 localStorage：先注入内存实现（与 tests/gateway.test.ts 同法）。
const storageValues = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => storageValues.get(key) ?? null,
        setItem: (key: string, value: string) => storageValues.set(key, value),
        removeItem: (key: string) => storageValues.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

import type { BrowserToolInput, ProviderPort } from "@/services/api/tools/gateway";
import type { AiConfig } from "@/stores/use-config-store";
import type { ImageToVideoSources } from "./image-to-video";
import type { ImageToVideoValues } from "../registry/image-to-video";

const {
    ImageToVideoAdapterError,
    buildImageToVideoConfig,
    buildImageToVideoFields,
    describeImageToVideoResult,
    imageToVideoResultCell,
    resolveImageToVideoReferences,
    runImageToVideo,
} = await import("./image-to-video");
const {
    IMAGE_TO_VIDEO_FIELDS,
    IMAGE_TO_VIDEO_TOOL_ID,
    createImageToVideoValues,
    IMAGE_TO_VIDEO_VIDEO_TYPES,
    IMAGE_TO_VIDEO_COUNTRIES,
    buildImageToVideoPrompt,
    createImageToVideoSnapshot,
    describeImageToVideoDrift,
    imageToVideoExpectedCount,
    linkImageToVideoValues,
    resolveImageToVideoCapability,
    validateImageToVideoState,
    videoTypeOf,
} = await import("../registry/image-to-video");

/* ------------------------------ 夹具 ------------------------------ */

const values = (patch: Partial<ImageToVideoValues> = {}): ImageToVideoValues => createImageToVideoValues({ modelId: "test-video-model", ...patch });

const config = (patch: Partial<AiConfig> = {}): AiConfig =>
    ({ baseUrl: "https://example.invalid", apiKey: "k", model: "img", videoModel: "test-video-model", size: "1:1", ...patch }) as AiConfig;

const refAsset = (id: string) => ({
    id,
    name: `${id}.png`,
    url: `blob:${id}`,
    width: 1024,
    height: 1024,
    mimeType: "image/png",
});

const sources = (patch: Partial<ImageToVideoSources> = {}): ImageToVideoSources => ({ references: [refAsset("a1")], ...patch });

type Calls = { prompts: string[]; references: unknown[][]; configs: AiConfig[] };

function fakePort(behaviour: { fail?: string; referenceCountCap?: number } = {}) {
    const calls: Calls = { prompts: [], references: [], configs: [] };
    const port: ProviderPort = {
        async generateImage() {
            throw new Error("createVideoTask only");
        },
        async editImage() {
            throw new Error("createVideoTask only");
        },
        async createVideoTask(_config, prompt, references) {
            calls.prompts.push(prompt);
            calls.references.push(references as unknown[]);
            calls.configs.push(_config);
            if (behaviour.fail) throw new Error(behaviour.fail);
            return { id: "up-1", provider: "http" as const, model: _config.videoModel ?? "test-video-model" };
        },
        async pollVideoTask() {
            return { status: "completed" as const, result: { url: "https://cdn.example/v.mp4", mimeType: "video/mp4" } };
        },
    };
    return { port, calls };
}

/* ------------------------------ 契约 ------------------------------ */

describe("字段契约（与 gateway 适配器注册表逐字一致）", () => {
    test("IMAGE_TO_VIDEO_FIELDS 无重复，且与 gateway TOOL_ADAPTER_TABLE 完全一致", async () => {
        expect(new Set(IMAGE_TO_VIDEO_FIELDS).size).toBe(IMAGE_TO_VIDEO_FIELDS.length);
        const { getToolAdapter } = await import("@/services/api/tools/gateway");
        const contract = getToolAdapter(IMAGE_TO_VIDEO_TOOL_ID).fields;
        expect(contract.length).toBeGreaterThan(0);
        expect([...(IMAGE_TO_VIDEO_FIELDS as readonly string[])].sort()).toEqual([...contract].sort());
    });

    test("buildImageToVideoFields 产出的键与契约完全一致（不多不少）", () => {
        const refs = resolveImageToVideoReferences(values(), sources());
        const fields = buildImageToVideoFields(values(), refs, "跑一遍");
        expect(Object.keys(fields).sort()).toEqual([...IMAGE_TO_VIDEO_FIELDS].sort());
    });

    test("首尾帧模式下 lastFrameImageUrl 落到 last 参考，reference 模式为空", () => {
        const framed = values({ sourceMode: "frames", firstFrameAssetId: "f1", lastFrameAssetId: "l1" });
        const refs = resolveImageToVideoReferences(framed, { references: [], firstFrame: refAsset("f1"), lastFrame: refAsset("l1") });
        expect(refs.map((item) => item.id)).toEqual(["f1", "l1"]);
        const fields = buildImageToVideoFields(framed, refs, "首尾帧");
        expect(fields.lastFrameImageUrl).toBe("blob:l1");
        expect(fields.sourceImageUrl).toBe("blob:f1");

        const plain = resolveImageToVideoReferences(values(), sources());
        expect(buildImageToVideoFields(values(), plain, "参考").lastFrameImageUrl).toBe("");
    });
});

/* ------------------------------ 工作区渲染 ------------------------------ */

describe("工作区真实渲染", () => {
    test("SSR 出一套可操作的表单骨架（非占位符）", async () => {
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { ImageToVideoWorkspace } = await import("@/components/tools/workspaces/image-to-video");
        const html = renderToStaticMarkup(
            React.createElement(MemoryRouter, null, React.createElement(ImageToVideoWorkspace)) as Parameters<typeof renderToStaticMarkup>[0],
        );
        for (const id of [
            "image-to-video-workspace",
            "image-to-video-model",
            "image-to-video-country",
            "image-to-video-language",
            "image-to-video-duration",
            "image-to-video-resolution",
            "image-to-video-ratio",
            "image-to-video-prompt",
            "image-to-video-mode-product-link",
            "image-to-video-submit",
            "image-to-video-result",
            // 原站顶部是「普通模式 / 高级模式」分段 + 右上角首尾帧开关，没有步骤条
            "image-to-video-pro-off",
            "image-to-video-mode-frames",
            "image-to-video-hint",
        ]) {
            expect(html).toContain(`data-testid="${id}"`);
        }
        // 未配置模型时必须拦住提交，不能“演示成功”。
        expect(html).toMatch(/data-testid="image-to-video-submit"[^>]*disabled/);
    });
});

/* ------------------------------ 配置映射 ------------------------------ */

describe("页面配置 → provider 参数", () => {
    test("时长/清晰度/比例/模式真的写进 AiConfig", () => {
        const merged = buildImageToVideoConfig(config(), values({ duration: 10, resolution: "1080P", aspectRatio: "9:16" }));
        expect(merged.videoSeconds).toBe("10");
        expect(merged.vquality).toBe("1080");
        // size 传比例串，由 services/api/video.ts 的 normalizeVideoSize 结合 vquality 归一化成像素尺寸
        expect(merged.size).toBe("9:16");
        expect(merged.videoMode).toBe("reference");
    });

    test("首尾帧模式切到 frames", () => {
        expect(buildImageToVideoConfig(config(), values({ sourceMode: "frames" })).videoMode).toBe("frames");
    });

    test("没有可用模型时拒绝提交（不发明参数）", () => {
        expect(() => buildImageToVideoConfig(config({ videoModel: "" }), values({ modelId: "" }))).toThrow(ImageToVideoAdapterError);
    });
});

/* ------------------------------ 校验 / 联动 ------------------------------ */

describe("校验与联动", () => {
    test("参考模式没有素材 → 阻塞；有素材 → 可执行", () => {
        expect(validateImageToVideoState(values(), { references: [] }).blockers.length).toBeGreaterThan(0);
        expect(validateImageToVideoState(values(), { references: [{ id: "a1" }] }).blockers).toEqual([]);
    });

    test("超过 9 张参考图 → 阻塞（与页面限制一致）", () => {
        const refs = Array.from({ length: 10 }, (_, index) => ({ id: `r${index}` }));
        expect(validateImageToVideoState(values(), { references: refs }).blockers.join()).toContain("9");
    });

    test("切换视频类型联动模板与默认时长；切换国家联动语言", () => {
        const seed = values();
        const next = IMAGE_TO_VIDEO_VIDEO_TYPES.find((item) => item.key !== seed.videoType)!;
        const linked = linkImageToVideoValues(seed, { videoType: next.key });
        expect(linked.values.templateKey).toBe(next.templateKey);
        expect(linked.values.templateName).toBe(next.templateName);
        expect(linked.values.duration).toBe(next.defaultDuration);

        const country = IMAGE_TO_VIDEO_COUNTRIES.find((item) => item.key !== seed.saleCountry)!;
        const switched = linkImageToVideoValues(seed, { saleCountry: country.key });
        expect(switched.values.language).toBe(country.defaultLanguage);
    });

    test("能力解析：缺模型时按钮禁用并给出原因，且不静默通过", () => {
        const capability = resolveImageToVideoCapability({ values: values({ modelId: "" }), assets: { references: [{ id: "a1" }] } });
        expect(capability.executable).toBe(false);
        expect(capability.blockers.join()).toContain("模型");
    });

    test("提示词包含模板运镜与目标市场语言", () => {
        const prompt = buildImageToVideoPrompt(values({ videoType: "product-showcase", language: "英语" }));
        expect(prompt).toContain(videoTypeOf("product-showcase").templatePrompt.slice(0, 8));
        expect(prompt).toContain("英语");
    });

    test("快照漂移：改了时长能被识别", () => {
        const snapshot = createImageToVideoSnapshot(values());
        expect(describeImageToVideoDrift(snapshot, values())).toEqual([]);
        expect(describeImageToVideoDrift(snapshot, values({ duration: 15 })).join()).toContain("视频时长");
    });

    test("结果单元数量固定为 1（失败也占位）", () => {
        expect(imageToVideoExpectedCount()).toBe(1);
    });
});

/* ------------------------------ 真实提交链路 ------------------------------ */

describe("提交链路", () => {
    test("成功：参考图与合并配置真的传给 provider，结果可读", async () => {
        const { port, calls } = fakePort();
        const run = await runImageToVideo({
            values: values({ duration: 10, aspectRatio: "9:16", videoType: "product-showcase" }),
            sources: sources(),
            config: config(),
            port,
        });
        expect(calls.references[0]).toHaveLength(1);
        expect(calls.configs[0].videoSeconds).toBe("10");
        expect(calls.prompts[0]).toContain("英语");
        expect(run.task.status).toBe("succeeded");
        expect(run.references).toHaveLength(1);
        expect(imageToVideoResultCell(run.task).status).toBe("filled");
        const summary = describeImageToVideoResult({ task: run.task, snapshot: run.snapshot, drift: [] });
        expect(summary.tone).toBe("succeeded");
    });

    test("刷新后只剩 storageKey（url/blob 已剥离）仍算可播放，不误报上游为空", async () => {
        const { port } = fakePort();
        const run = await runImageToVideo({ values: values(), sources: sources(), config: config(), port });
        const base = run.task.result!;
        const persisted: typeof run.task = {
            ...run.task,
            result: {
                ...base,
                items: base.items.map((item) => ({ ...item, url: undefined, blob: undefined, storageKey: "tool-result:abc", bytes: 1266723 })),
            },
        };
        expect(imageToVideoResultCell(persisted).status).toBe("filled");
        const summary = describeImageToVideoResult({ task: persisted, snapshot: run.snapshot, drift: [] });
        expect(summary.tone).toBe("succeeded");
        const dropped = {
            ...persisted,
            result: { ...base, items: [{ ...base.items[0], url: undefined, blob: undefined, storageKey: undefined, payloadDropped: true }] },
        };
        expect(imageToVideoResultCell(dropped).status).toBe("failed");
    });

    test("无素材时抛错且不发起任何请求", async () => {
        const { port, calls } = fakePort();
        await expect(runImageToVideo({ values: values(), sources: { references: [] }, config: config(), port })).rejects.toBeInstanceOf(ImageToVideoAdapterError);
        expect(calls.prompts).toHaveLength(0);
    });

    test("上游明确报错（鉴权失败）→ 任务 failed，不伪造结果", async () => {
        const { port } = fakePort({ fail: "鉴权失败：invalid api key" });
        const run = await runImageToVideo({ values: values(), sources: sources(), config: config(), port });
        expect(run.task.status).toBe("failed");
        expect(describeImageToVideoResult({ task: run.task, drift: [] }).tone).toBe("failed");
        expect(run.task.result?.items ?? []).toHaveLength(0);
    });

    test("任务落库带 toolId / capability / 源素材 id，且提示词进任务", async () => {
        const { port } = fakePort();
        const run = await runImageToVideo({ values: values(), sources: sources(), config: config(), port });
        expect(run.task.toolId).toBe(IMAGE_TO_VIDEO_TOOL_ID);
        expect(run.task.capability).toBe("video");
        expect(run.task.fingerprint.length).toBeGreaterThan(8);
        expect(run.task.sourceAssetIds).toEqual(["a1"]);
        expect(run.task.prompt.length).toBeGreaterThan(0);
    });

    test("能力描述反映本次提交的选择（供结果页与按钮文案使用）", () => {
        const capability = resolveImageToVideoCapability({
            values: values({ duration: 15, resolution: "1080P" }),
            assets: { references: [{ id: "a1" }] },
            modelOptions: ["test-video-model"],
        });
        expect(capability.expected).toContain("15s");
        expect(capability.expected).toContain("1080P");
    });
});
