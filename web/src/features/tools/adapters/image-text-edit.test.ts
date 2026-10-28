/**
 * TASK-036：IMAGE_TEXT_EDIT 回归用例。
 *
 * 覆盖：草稿收敛 / 框历史可撤销 / 8 字段不丢参 / prompt 逐框可解析 /
 * 溢出与缺字检查 / 阻断项 / 换图后旧结果失效 / 网关提交与重试 / SSR 首屏可操作。
 */

import { describe, expect, test } from "bun:test";

import type { BrowserToolInput, SubmitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";

import {
    IMAGE_TEXT_EDIT_FIELDS,
    IMAGE_TEXT_EDIT_FONTS,
    IMAGE_TEXT_EDIT_FONT_SIZE,
    IMAGE_TEXT_EDIT_IMAGE,
    IMAGE_TEXT_EDIT_MAX_BOXES,
    IMAGE_TEXT_EDIT_TEXT_LIMIT,
    IMAGE_TEXT_EDIT_TOOL_ID,
    addImageTextBox,
    buildImageTextEditPrompt,
    canRedoImageTextBoxHistory,
    canUndoImageTextBoxHistory,
    commitImageTextBoxHistory,
    composeImageTextEditFields,
    createImageTextBoxHistory,
    createImageTextEditSnapshot,
    createImageTextEditValues,
    describeImageTextEditDrift,
    duplicateImageTextBox,
    findImageTextEditMissingGlyphs,
    imageTextEditFormatFromMime,
    imageTextEditFormatFromName,
    imageTextEditPreviewNotice,
    isBlockingImageTextEditIssue,
    measureImageTextBox,
    moveImageTextBox,
    parseImageTextEditPrompt,
    readImageTextEditValues,
    redoImageTextBoxHistory,
    removeImageTextBox,
    undoImageTextBoxHistory,
    updateImageTextBox,
    validateImageTextEditState,
    type ImageTextEditValues,
} from "@/features/tools/registry/image-text-edit";
import {
    ImageTextEditAdapterError,
    assertImageTextEditInput,
    auditImageTextEditFields,
    buildImageTextEditFields,
    buildImageTextEditInput,
    imageTextEditResultFromTask,
    imageTextEditResultNotice,
    imageTextEditResultUrl,
    retryImageTextEdit,
    runImageTextEdit,
    toImageTextEditReference,
    type ImageTextEditGatewayLike,
} from "@/features/tools/adapters/image-text-edit";

const SOURCE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function values(patch: Partial<ImageTextEditValues> = {}): ImageTextEditValues {
    return createImageTextEditValues({
        imageUrl: SOURCE,
        imageName: "shirt.png",
        imageFormat: "png",
        imageWidth: 1200,
        imageHeight: 1600,
        imageSize: 240_000,
        boxes: [
            { id: "box-1", text: "HELLO", x: 0.1, y: 0.2, width: 0.5, height: 0.15, fontSize: 72, fontWeight: 700, align: "left", color: "#111111", fontId: "sans" },
            { id: "box-2", text: "SALE", x: 0.2, y: 0.6, width: 0.4, height: 0.12, fontSize: 48, fontWeight: 400, align: "center", color: "#ff0055", fontId: "display" },
        ],
        ...patch,
    });
}

/* ------------------------------ 草稿与几何 ------------------------------ */

describe("草稿收敛与几何夹紧", () => {
    test("脏草稿收敛到契约内：越界坐标、非法颜色、非法字重/对齐都被收敛", () => {
        const restored = readImageTextEditValues({
            imageUrl: "  https://cdn.example.com/a.png  ",
            imageFormat: "bmp",
            imageWidth: "1200",
            imageHeight: 1600,
            boxes: [
                { id: "dup", text: "x", x: 2.5, y: -1, width: 0.9, height: 0.01, fontSize: 9999, fontWeight: 300, align: "justify", color: "red", fontId: "" },
                { id: "dup", text: "y", x: 0.1, y: 0.1, width: 0.2, height: 0.2, fontSize: 32, fontWeight: 700, align: "right", color: "#ABCDEF", fontId: "serif" },
            ],
        });
        expect(restored.imageUrl).toBe("https://cdn.example.com/a.png");
        expect(restored.imageFormat).toBe("png");
        expect(restored.imageWidth).toBe(1200);
        expect(restored.boxes).toHaveLength(2);
        const [first, second] = restored.boxes;
        expect(first.id).not.toBe(second.id);
        expect(first.x).toBeLessThanOrEqual(1 - first.width + 1e-6);
        expect(first.y).toBeGreaterThanOrEqual(0);
        expect(first.width).toBeGreaterThanOrEqual(0.03);
        expect(first.height).toBeGreaterThanOrEqual(0.03);
        expect(first.fontSize).toBe(IMAGE_TEXT_EDIT_FONT_SIZE.max);
        expect(first.fontWeight).toBe(400);
        expect(first.align).toBe("left");
        expect(first.color).toBe("#111111");
        expect(first.fontId).toBe(IMAGE_TEXT_EDIT_FONTS[0].id);
        expect(second.color).toBe("#abcdef");
    });

    test("新增框在画布内，且达到上限后不再增长", () => {
        let boxes = values().boxes;
        const next = addImageTextBox(boxes, { text: "NEW" });
        expect(next).toHaveLength(3);
        const created = next[2];
        expect(created.x + created.width).toBeLessThanOrEqual(1.0001);
        expect(created.y + created.height).toBeLessThanOrEqual(1.0001);

        let full = boxes;
        for (let index = 0; index < IMAGE_TEXT_EDIT_MAX_BOXES + 5; index += 1) full = addImageTextBox(full);
        expect(full).toHaveLength(IMAGE_TEXT_EDIT_MAX_BOXES);
    });

    test("移动与改尺寸都不把框挤出画布", () => {
        const source = values().boxes;
        const moved = moveImageTextBox(source, "box-1", 5, -5)[0];
        expect(moved.x + moved.width).toBeLessThanOrEqual(1.0001);
        expect(moved.y).toBe(0);
        const resized = updateImageTextBox(source, "box-1", { width: 0.95, height: 0.95 })[0];
        expect(resized.x + resized.width).toBeLessThanOrEqual(1.0001);
        expect(resized.y + resized.height).toBeLessThanOrEqual(1.0001);
    });
});

describe("文本框历史：删除可撤销", () => {
    test("删除 → 撤销 → 重做，框内容与顺序保持一致", () => {
        const initial = values().boxes;
        let history = createImageTextBoxHistory(initial);
        history = commitImageTextBoxHistory(history, removeImageTextBox(initial, "box-1"));
        expect(history.present).toHaveLength(1);
        expect(canUndoImageTextBoxHistory(history)).toBe(true);

        history = undoImageTextBoxHistory(history);
        expect(history.present.map((box) => box.id)).toEqual(["box-1", "box-2"]);
        expect(canRedoImageTextBoxHistory(history)).toBe(true);

        history = redoImageTextBoxHistory(history);
        expect(history.present.map((box) => box.id)).toEqual(["box-2"]);
    });

    test("同内容提交不增加历史（拖拽不会刷爆撤销栈）", () => {
        const initial = values().boxes;
        const history = createImageTextBoxHistory(initial);
        const same = commitImageTextBoxHistory(
            history,
            initial.map((box) => ({ ...box })),
        );
        expect(same).toBe(history);
        expect(canUndoImageTextBoxHistory(same)).toBe(false);
    });

    test("复制框产生新 id，不覆盖原框", () => {
        const source = values().boxes;
        const copied = duplicateImageTextBox(source, "box-1");
        expect(copied).toHaveLength(3);
        expect(new Set(copied.map((box) => box.id)).size).toBe(3);
        expect(copied[2].text).toBe("HELLO");
    });
});

/* ------------------------------ 字段与 prompt ------------------------------ */

describe("请求字段与 prompt：不得静默丢参", () => {
    test("8 个字段齐全且 resultImageUrl 提交时为空", () => {
        const snapshot = createImageTextEditSnapshot(values(), 3, "req-1");
        const fields = composeImageTextEditFields(snapshot);
        expect(Object.keys(fields).sort()).toEqual([...IMAGE_TEXT_EDIT_FIELDS].sort());
        expect(fields.resultImageUrl).toBe("");
        expect(fields.imageUrl).toBe(SOURCE);
        expect(fields.imageFormat).toBe("png");
        expect((fields.boxes as unknown[]).length).toBe(2);
        const firstBox = (fields.boxes as Array<Record<string, unknown>>)[0];
        expect(firstBox).toMatchObject({ id: "box-1", text: "HELLO", fontId: "sans", fontSize: 72 });
    });

    test("prompt 能被逐框还原：文本、几何、字体、字号", () => {
        const snapshot = createImageTextEditSnapshot(values(), null, "req-2");
        const prompt = buildImageTextEditPrompt({ snapshot });
        const parsed = parseImageTextEditPrompt(prompt);
        expect(parsed.dimensions).toBe("1200×1600");
        expect(parsed.boxes).toHaveLength(2);
        expect(parsed.boxes[0]).toMatchObject({ index: 1, text: "HELLO", geometry: "10%,20%,50%,15%", fontId: "sans", fontSize: "72" });
        expect(parsed.boxes[1].text).toBe("SALE");
        expect(prompt).toContain("png");
        expect(prompt).toContain("原图作为参考图提供");
    });

    test("审计：字段缺失、prompt 漏框都会点名", () => {
        const current = values();
        const requestId = "req-audit";
        const input = buildImageTextEditInput({ values: current, requestId });
        const okAudit = auditImageTextEditFields(input.fields as Record<string, unknown>, current, requestId, input.prompt ?? "");
        expect(okAudit.ok).toBe(true);
        expect(okAudit.promptCarries.boxes).toBe(true);

        const broken = { ...(input.fields as Record<string, unknown>), imageFormat: "webp" };
        const fieldsAudit = auditImageTextEditFields(broken, current, requestId, input.prompt ?? "");
        expect(fieldsAudit.ok).toBe(false);
        expect(fieldsAudit.issues.join(" ")).toContain("imageFormat");

        const promptAudit = auditImageTextEditFields(input.fields as Record<string, unknown>, current, requestId, "尺寸 1200×1600");
        expect(promptAudit.ok).toBe(false);
        expect(promptAudit.promptCarries.boxes).toBe(false);
    });

    test("输入构造：带一张源图参考、数量固定 1、工具 id 正确", () => {
        const input = buildImageTextEditInput({ values: values(), requestId: "req-build", model: " gpt-image-1 " });
        expect(input.toolId).toBe(IMAGE_TEXT_EDIT_TOOL_ID);
        expect(input.count).toBe(1);
        expect(input.model).toBe("gpt-image-1");
        expect(input.references).toHaveLength(1);
        expect(input.references?.[0].dataUrl).toBe(SOURCE);
        const reference = toImageTextEditReference(values({ imageUrl: "https://cdn.example.com/a.png" }));
        expect(reference.url).toBe("https://cdn.example.com/a.png");
        expect(reference.dataUrl).toBe("");
    });
});

/* ------------------------------ 校验 ------------------------------ */

describe("校验：阻断项点名且可执行", () => {
    test("无图/空文本/格式/尺寸/上限各自有独立错误码", () => {
        const codes = (patch: Partial<ImageTextEditValues>, modelReady = true) => validateImageTextEditState({ values: values(patch), modelReady }).map((issue) => issue.code);

        expect(codes({ imageUrl: "" })).toContain("image-required");
        // 非契约格式在构造/草稿阶段就被收敛成 png（用户路径不会产出非法格式）
        expect(readImageTextEditValues({ imageFormat: "bmp" }).imageFormat).toBe("png");
        // 校验仍对程序化注入的非法格式兜底，避免上游收到奇怪扩展名
        const forced = { ...values(), imageFormat: "bmp" } as unknown as ImageTextEditValues;
        expect(validateImageTextEditState({ values: forced }).map((issue) => issue.code)).toContain("image-format-invalid");
        expect(codes({ imageSize: IMAGE_TEXT_EDIT_IMAGE.maxBytes + 1 })).toContain("image-size-too-large");
        expect(codes({ imageWidth: 100, imageHeight: 1600 })).toContain("image-dimensions-range");
        expect(codes({ modelReady: false } as never, false)).toContain("model-missing");
        expect(codes({ boxes: [values().boxes[0], { ...values().boxes[1], text: "   " }] })).toContain("box-text-required");
        // 文本超长会在 normalize 阶段被截断，校验只对程序化注入兜底
        const overlong = { ...values(), boxes: [{ ...values().boxes[0], text: "长".repeat(IMAGE_TEXT_EDIT_TEXT_LIMIT + 1) }] } as unknown as ImageTextEditValues;
        expect(validateImageTextEditState({ values: overlong }).map((issue) => issue.code)).toContain("box-text-too-long");
    });

    test("溢出与缺字是提示项，不阻断提交", () => {
        const overflow = validateImageTextEditState({
            values: values({ boxes: [{ ...values().boxes[0], text: "LONGTEXTLONGTEXTLONGTEXT", width: 0.05, height: 0.03 }] }),
        });
        expect(overflow.map((issue) => issue.code)).toContain("box-overflow");
        expect(overflow.filter(isBlockingImageTextEditIssue)).toHaveLength(0);

        const glyph = validateImageTextEditState({ values: values({ boxes: [{ ...values().boxes[0], text: "中文", fontId: "display" }] }) });
        expect(glyph.map((issue) => issue.code)).toContain("box-missing-glyph");
        expect(glyph.filter(isBlockingImageTextEditIssue)).toHaveLength(0);
        expect(findImageTextEditMissingGlyphs("中文A", "display")).toEqual(["中", "文"]);
        expect(findImageTextEditMissingGlyphs("中文A", "sans")).toEqual([]);
    });

    test("排版估算：宽框不报 X 溢出，窄框报", () => {
        const wide = measureImageTextBox(values().boxes[0], 1200, 1600);
        expect(wide.overflowX).toBe(false);
        const narrow = measureImageTextBox({ ...values().boxes[0], width: 0.02 }, 1200, 1600);
        expect(narrow.overflowX).toBe(true);
        expect(narrow.textWidth).toBeGreaterThan(narrow.boxWidth);
    });
});

/* ------------------------------ 快照漂移 ------------------------------ */

describe("换图/改框后旧结果必须显式失效", () => {
    const base = createImageTextEditSnapshot(values(), 1, "req-base");

    test("改文字、换图、换格式都会产生漂移维度", () => {
        const textChanged = createImageTextEditSnapshot(values({ boxes: [{ ...values().boxes[0], text: "HEY" }, values().boxes[1]] }), 1, "req-base");
        expect(describeImageTextEditDrift(base, textChanged)).toContain("文字框");

        const imageChanged = createImageTextEditSnapshot(values({ imageUrl: "https://cdn.example.com/b.png" }), 1, "req-base");
        expect(describeImageTextEditDrift(base, imageChanged)).toContain("源图");

        const formatChanged = createImageTextEditSnapshot(values({ imageFormat: "webp" }), 1, "req-base");
        expect(describeImageTextEditDrift(base, formatChanged)).toContain("导出格式");
    });

    test("源图不变且框不变时不算漂移", () => {
        const same = createImageTextEditSnapshot(createImageTextEditValues({ ...values() }), 1, "req-other");
        expect(describeImageTextEditDrift(base, same)).toBe("");
    });
});

/* ------------------------------ 适配器运行 ------------------------------ */

function taskOf(patch: Partial<ToolTask> = {}): ToolTask {
    return {
        id: "task-1",
        toolId: IMAGE_TEXT_EDIT_TOOL_ID,
        status: "succeeded",
        createdAt: 1,
        updatedAt: 2,
        result: { items: [{ id: "item-1", kind: "image", url: "https://cdn.example.com/out.png", mimeType: "image/png", bytes: 1024 }] },
        ...patch,
    } as ToolTask;
}

function fakeGateway(overrides: Partial<ImageTextEditGatewayLike> = {}) {
    const calls: { submit: BrowserToolInput[]; retry: string[] } = { submit: [], retry: [] };
    const gateway: ImageTextEditGatewayLike = {
        submit: async (input: BrowserToolInput, _options?: SubmitOptions) => {
            calls.submit.push(input);
            return taskOf({ status: "succeeded" });
        },
        waitForResult: async () => taskOf({ status: "succeeded" }),
        retry: async (taskId: string, input: BrowserToolInput) => {
            calls.retry.push(taskId);
            calls.submit.push(input);
            return taskOf({ status: "succeeded" });
        },
        ...overrides,
    };
    return { gateway, calls };
}

describe("适配器：真实提交与重试", () => {
    test("提交携带源图参考与完整 prompt，成功返回结果图", async () => {
        const { gateway, calls } = fakeGateway();
        const run = await runImageTextEdit({ gateway, values: values(), requestId: "req-run", model: "gpt-image-1" });
        expect(calls.submit).toHaveLength(1);
        expect(calls.submit[0].references?.[0].dataUrl).toBe(SOURCE);
        expect(calls.submit[0].prompt).toContain("HELLO");
        expect(run.task.status).toBe("succeeded");
        expect(run.snapshot.requestId).toBe("req-run");
        const result = imageTextEditResultFromTask(run.task, run.snapshot, run.snapshot);
        expect(imageTextEditResultUrl(result.images[0])).toBe("https://cdn.example.com/out.png");
        expect(result.stale).toBe(false);
        expect(imageTextEditResultNotice(result)).toBe("");
    });

    test("重试复用同一 requestId，并再次守卫参数", async () => {
        const { gateway, calls } = fakeGateway();
        const run = await retryImageTextEdit({ gateway, values: values(), requestId: "req-retry", taskId: "task-9" });
        expect(calls.retry).toEqual(["task-9"]);
        expect(calls.submit[0].fields).toMatchObject({ requestId: "req-retry" });
        expect(run.requestId).toBe("req-retry");
    });

    test("无图 / 空文本 / 模型未就绪一律拒发请求", async () => {
        const { gateway, calls } = fakeGateway();
        await expect(runImageTextEdit({ gateway, values: values({ imageUrl: "" }) })).rejects.toBeInstanceOf(ImageTextEditAdapterError);
        await expect(runImageTextEdit({ gateway, values: values({ boxes: [{ ...values().boxes[0], text: "" }] }) })).rejects.toBeInstanceOf(ImageTextEditAdapterError);
        await expect(runImageTextEdit({ gateway, values: values(), modelReady: false })).rejects.toBeInstanceOf(ImageTextEditAdapterError);
        expect(calls.submit).toHaveLength(0);
    });

    test("守卫直接拒绝被篡改的字段（审计兜底）", () => {
        const current = values();
        const input = buildImageTextEditInput({ values: current, requestId: "req-guard" });
        const tampered: BrowserToolInput = { ...input, fields: { ...buildImageTextEditFields(current, "req-guard"), imageWidth: 999 } };
        expect(() => assertImageTextEditInput(tampered, current, "req-guard")).toThrow(ImageTextEditAdapterError);
    });

    test("旧快照结果被标记 stale 并给出可执行提示", () => {
        const snapshot = createImageTextEditSnapshot(values(), 1, "req-old");
        const current = createImageTextEditSnapshot(values({ imageUrl: "https://cdn.example.com/new.png" }), 2, "req-new");
        const result = imageTextEditResultFromTask(taskOf(), snapshot, current);
        expect(result.stale).toBe(true);
        expect(imageTextEditResultNotice(result)).toContain("当前配置已变化");
    });

    test("失败/未知/空结果都有明确文案", () => {
        const snapshot = createImageTextEditSnapshot(values(), null, "req-n");
        expect(imageTextEditResultNotice(imageTextEditResultFromTask(taskOf({ status: "failed", error: { code: "x", message: "上游超时", retryable: true } }), snapshot, snapshot))).toContain("上游超时");
        expect(imageTextEditResultNotice(imageTextEditResultFromTask(taskOf({ status: "unknown" }), snapshot, snapshot))).toContain("任务状态未知");
        expect(imageTextEditResultNotice(imageTextEditResultFromTask(taskOf({ result: { items: [], receivedAt: 2 } }), snapshot, snapshot))).toContain("没有返回图片");
    });

    test("mime/扩展名兜底推断格式", () => {
        expect(imageTextEditFormatFromMime("image/webp")).toBe("webp");
        expect(imageTextEditFormatFromMime("image/gif")).toBe("");
        expect(imageTextEditFormatFromName("A.JPG")).toBe("jpeg");
    });
});

/* ------------------------------ 首屏可操作 ------------------------------ */

describe("工作区首屏", () => {
    test("四块区域齐全，没有源图时提交禁用", async () => {
        const store = new Map<string, string>();
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => void store.set(key, value),
                removeItem: (key: string) => void store.delete(key),
                clear: () => store.clear(),
            },
        });
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { MemoryRouter } = await import("react-router-dom");
        const { ImageTextEditWorkspace } = await import("@/components/tools/workspaces/image-text-edit");
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ImageTextEditWorkspace)));

        expect(html).toContain("图片文字编辑");
        expect(html).toContain("图片文字画布");
        expect(html).toContain("属性编辑");
        expect(html).toContain("文本框列表");
        expect(html).toContain("导出");
        expect(html).toContain("上传源图");
        expect(html).toContain("新增文字框");
        expect(html).toContain("生成图片文字");
        // 无源图 → 主提交按钮必须禁用
        expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*生成图片文字/);
        expect(html).toContain("预览字族");
        expect(imageTextEditPreviewNotice(createImageTextEditValues())).toContain("上传图片");
    });
});
