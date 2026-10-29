import { describe, expect, test } from "bun:test";

import {
    DESIGNER_CANVAS_LIMITS,
    DESIGNER_CANVAS_PRESETS,
    DESIGNER_FONT_FAMILIES,
    DESIGNER_LAYER_LIMITS,
    DESIGNER_TEXT_LIMIT,
    NEW_DESIGNER_ADAPTER,
    NEW_DESIGNER_DRAFT_KEY,
    NEW_DESIGNER_FIELD_KEYS,
    NEW_DESIGNER_LAYOUT,
    NEW_DESIGNER_ROUTE,
    NEW_DESIGNER_SPEC,
    NEW_DESIGNER_TOOL_ID,
    addDesignerLayer,
    auditDesignerFields,
    buildDesignerDonePayload,
    buildDesignerFields,
    buildDesignerPrompt,
    canRedoDesigner,
    canUndoDesigner,
    clampDesignerLayer,
    commitDesignerDocument,
    createBaseImageLayer,
    createDesignerDocument,
    createDesignerHistory,
    createDesignerId,
    createTextLayer,
    decideDesignerClose,
    designerDocumentFingerprint,
    designerFontFamily,
    designerFontStack,
    designerSpecDrift,
    hasBlockingDesignerIssue,
    isDesignerStale,
    moveDesignerLayer,
    nudgeDesignerLayer,
    removeDesignerLayer,
    renameDesignerLayer,
    redoDesignerDocument,
    reorderDesignerLayers,
    serializeDesignerDraft,
    resizeDesignerLayer,
    restoreDesignerDraft,
    rotateDesignerLayer,
    setDesignerCanvasBackground,
    setDesignerCanvasSize,
    setDesignerLayerVisibility,
    toggleDesignerLayerLock,
    undoDesignerDocument,
    updateDesignerLayer,
    validateDesignerCanvas,
    validateDesignerHostState,
    validateDesignerState,
    type DesignerDocument,
    type DesignerHostState,
} from "@/features/tools/registry/new-designer";
import {
    DesignerAdapterError,
    DESIGNER_TASK_ENGINE,
    createCanvasDesignerCompositor,
    designerInputSnapshot,
    designerResultNotice,
    designerResultFromStoredTask,
    latestDesignerTask,
    readDesignerReplaySnapshot,
    runDesigner,
} from "@/features/tools/adapters/new-designer";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { getToolById } from "@/features/tools/registry";

/** 从 HTML 里取出带某属性的按钮开标签，避免用脆弱的整段正则判断禁用态。 */
function buttonTag(html: string, attr: string): string {
    const pattern = new RegExp(`<button[^>]*${attr}[^>]*>`);
    const found = html.match(pattern);
    if (!found) throw new Error(`找不到按钮：${attr}`);
    return found[0];
}

/** 只看 disabled 属性本身：className 里的 `disabled:opacity-50` 不是禁用态。 */
function isDisabled(tag: string): boolean {
    return /\sdisabled(=""|\s|>)/.test(`${tag} `);
}

const IMAGE = "https://cdn.example.com/product.png";

const host = (patch: Partial<DesignerHostState> = {}): DesignerHostState => ({
    open: true,
    isDesignerUse: true,
    imageUrl: IMAGE,
    hasOnClose: true,
    hasOnDone: true,
    ...patch,
});

const doc = (patch: Parameters<typeof createDesignerDocument>[0] = {}) => createDesignerDocument({ designerId: "dz-test", imageUrl: IMAGE, ...patch });

/* ============================== 规格契约 ============================== */

describe("TASK-038 规格契约（与注册表逐项一致）", () => {
    test("注册表条目与本模块零漂移", () => {
        expect(designerSpecDrift(getToolById(NEW_DESIGNER_TOOL_ID))).toEqual([]);
        expect(designerSpecDrift(undefined)).toEqual(["注册表中找不到 NEW_DESIGNER"]);
    });

    test("六个宿主字段顺序固定，回调不可序列化", () => {
        expect(NEW_DESIGNER_SPEC.fields.map((field) => field.key)).toEqual([...NEW_DESIGNER_FIELD_KEYS]);
        expect([...NEW_DESIGNER_FIELD_KEYS]).toEqual(["designerId", "imageUrl", "isDesignerUse", "onClose", "onDone", "open"]);
        expect(NEW_DESIGNER_LAYOUT).toBe("designer");
        expect(NEW_DESIGNER_ADAPTER).toBe("designer-host");
        expect(NEW_DESIGNER_ROUTE).toBe("/tools/product-design/new-designer");
        expect(NEW_DESIGNER_DRAFT_KEY).toBe("tool-draft:v1:NEW_DESIGNER");
    });

    test("buildDesignerFields 只产出契约字段，回调字段用标记占位且能通过审计", () => {
        const document = doc();
        const fields = buildDesignerFields(document, host());
        expect(Object.keys(fields).sort()).toEqual([...NEW_DESIGNER_FIELD_KEYS].sort());
        expect(fields.designerId).toBe("dz-test");
        expect(fields.imageUrl).toBe(IMAGE);
        expect(fields.isDesignerUse).toBe(true);
        expect(fields.open).toBe(true);
        expect(String(fields.onClose)).toContain("host-callback");
        expect(String(fields.onDone)).toContain("host-callback");
        expect(auditDesignerFields(fields as unknown as Record<string, unknown>, document, host()).ok).toBe(true);
    });

    test("审计能抓出缺字段、多字段与值不一致", () => {
        const document = doc();
        const fields = buildDesignerFields(document, host()) as unknown as Record<string, unknown>;
        const { onDone: _dropped, ...withoutDone } = fields;
        const missing = auditDesignerFields(withoutDone, document, host());
        expect(missing.ok).toBe(false);
        expect(missing.missing).toContain("onDone");

        const unexpected = auditDesignerFields({ ...fields, extra: 1 }, document, host());
        expect(unexpected.unexpected).toContain("extra");

        const mismatched = auditDesignerFields({ ...fields, designerId: "dz-other" }, document, host());
        expect(mismatched.mismatched).toContain("designerId");
    });

    test("提示词覆盖画布尺寸、背景与每个图层的关键参数", () => {
        const document = setDesignerCanvasSize(addDesignerLayer(doc(), createTextLayer(1, { text: "限时 5 折", fontSize: 72 })), 1080, 1440);
        const prompt = buildDesignerPrompt(document);
        expect(prompt).toContain("1080×1440");
        expect(prompt).toContain("限时 5 折");
        expect(prompt).toContain("72px");
        expect(prompt).toContain("商品底图");
        document.layers.forEach((layer, index) => expect(prompt).toContain(`图层 ${index + 1}`));
    });
});

/* ============================== 文档与图层 ============================== */

describe("画布文档与图层操作", () => {
    test("画布预设与尺寸裁剪", () => {
        expect(DESIGNER_CANVAS_PRESETS.map((preset) => preset.id)).toEqual(["1:1", "3:4", "4:3"]);
        const tiny = setDesignerCanvasSize(doc(), 1, 1);
        expect(tiny.width).toBe(DESIGNER_CANVAS_LIMITS.minSide);
        expect(tiny.height).toBe(DESIGNER_CANVAS_LIMITS.minSide);
        const huge = setDesignerCanvasSize(doc(), 99999, 99999);
        expect(huge.width).toBe(DESIGNER_CANVAS_LIMITS.maxSide);
    });

    test("源图作为可编辑底图，几何裁剪生效", () => {
        const document = doc();
        expect(document.layers).toHaveLength(1);
        const base = document.layers[0];
        expect(base.id).toBe("layer-base");
        expect(base.src).toBe(IMAGE);
        const clamped = clampDesignerLayer({ ...base, width: 1, height: 1, rotation: 999, opacity: 42 });
        expect(clamped.width).toBe(DESIGNER_LAYER_LIMITS.minSize);
        expect(clamped.rotation).toBe(DESIGNER_LAYER_LIMITS.rotationMax);
        expect(clamped.opacity).toBe(DESIGNER_LAYER_LIMITS.opacityMax);
    });

    test("增删改、显隐、锁定与重命名都递增 revision", () => {
        let document = doc();
        document = addDesignerLayer(document, createTextLayer(1));
        expect(document.layers).toHaveLength(2);
        expect(document.revision).toBe(2);

        document = updateDesignerLayer(document, "layer-text-1", { text: "包邮", color: "#ff0000" });
        expect(document.layers[1].text).toBe("包邮");
        expect(document.layers[1].color).toBe("#ff0000");

        document = renameDesignerLayer(document, "layer-text-1", "卖点");
        expect(document.layers[1].name).toBe("卖点");

        document = setDesignerLayerVisibility(document, "layer-text-1", false);
        expect(document.layers[1].visible).toBe(false);

        document = toggleDesignerLayerLock(document, "layer-text-1");
        expect(document.layers[1].locked).toBe(true);

        document = removeDesignerLayer(document, "layer-text-1");
        expect(document.layers).toHaveLength(1);
    });

    test("移动/缩放/旋转/键盘微调都改几何", () => {
        const base = doc();
        expect(moveDesignerLayer(base, "layer-base", 40, -40).layers[0].x).toBe(40);
        expect(resizeDesignerLayer(base, "layer-base", 600, 900).layers[0].width).toBe(600);
        expect(rotateDesignerLayer(base, "layer-base", 15).layers[0].rotation).toBe(15);

        const nudge = nudgeDesignerLayer(base, "layer-base", "ArrowRight");
        expect(nudge.layers[0].x).toBe(1200 * 0 + DESIGNER_LAYER_LIMITS.nudgeStep);
        const fast = nudgeDesignerLayer(base, "layer-base", "ArrowDown", true);
        expect(fast.layers[0].y).toBe(DESIGNER_LAYER_LIMITS.nudgeStepFast);
        expect(nudgeDesignerLayer(base, "layer-base", "ArrowUp").layers[0].y).toBe(-DESIGNER_LAYER_LIMITS.nudgeStep);
    });

    test("z 序调整：上移/下移/置顶/置底", () => {
        const document = addDesignerLayer(addDesignerLayer(doc(), createTextLayer(1)), createTextLayer(2));
        expect(document.layers.map((layer) => layer.id)).toEqual(["layer-base", "layer-text-1", "layer-text-2"]);
        expect(reorderDesignerLayers(document, "layer-base", "front").layers.map((layer) => layer.id)).toEqual(["layer-text-1", "layer-text-2", "layer-base"]);
        expect(reorderDesignerLayers(document, "layer-base", "up").layers.map((layer) => layer.id)).toEqual(["layer-text-1", "layer-base", "layer-text-2"]);
        expect(reorderDesignerLayers(document, "layer-text-2", "down").layers.map((layer) => layer.id)).toEqual(["layer-base", "layer-text-2", "layer-text-1"]);
        expect(reorderDesignerLayers(document, "layer-text-2", "back").layers.map((layer) => layer.id)).toEqual(["layer-text-2", "layer-base", "layer-text-1"]);
        // 不存在的图层是空操作，不制造新文档
        expect(reorderDesignerLayers(document, "missing", "up")).toBe(document);
    });

    test("撤销/重做栈：无实质变化不入栈，重做在编辑后失效", () => {
        const first = doc();
        let history = createDesignerHistory(first);
        expect(canUndoDesigner(history)).toBe(false);

        const moved = moveDesignerLayer(first, "layer-base", 10, 0);
        history = commitDesignerDocument(history, moved);
        expect(canUndoDesigner(history)).toBe(true);

        // 同一份文档重复提交不产生第二条历史
        history = commitDesignerDocument(history, moved);
        expect(history.past).toHaveLength(1);

        history = undoDesignerDocument(history);
        expect(history.present.layers[0].x).toBe(0);
        expect(canRedoDesigner(history)).toBe(true);

        history = redoDesignerDocument(history);
        expect(history.present.layers[0].x).toBe(10);

        history = undoDesignerDocument(history);
        history = commitDesignerDocument(history, rotateDesignerLayer(history.present, "layer-base", 5));
        expect(canRedoDesigner(history)).toBe(false);
    });

    test("历史长度受上限约束", () => {
        let history = createDesignerHistory(doc());
        for (let index = 1; index <= 60; index += 1) history = commitDesignerDocument(history, moveDesignerLayer(history.present, "layer-base", index, 0));
        expect(history.past.length).toBe(50);
    });
});

/* ============================== 校验 ============================== */

describe("校验与阻断", () => {
    test("空画布、缺素材、空文案、尺寸过小、完全出画布都被拦住", () => {
        const empty = createDesignerDocument({ designerId: "dz-empty" });
        expect(validateDesignerCanvas(empty).map((issue) => issue.code)).toContain("empty-canvas");

        const bad = addDesignerLayer(doc(), createTextLayer(1, { text: "   " }));
        const issues = validateDesignerCanvas(bad);
        expect(issues.map((issue) => issue.code)).toContain("text-empty");
        expect(issues.find((issue) => issue.code === "text-empty")?.layerId).toBe("layer-text-1");

        const offCanvas = updateDesignerLayer(doc(), "layer-base", { x: 5000 });
        expect(validateDesignerCanvas(offCanvas).map((issue) => issue.code)).toContain("layer-off-canvas");

        const noSrc = updateDesignerLayer(doc(), "layer-base", { src: "" });
        expect(validateDesignerCanvas(noSrc).map((issue) => issue.code)).toContain("layer-src-missing");
    });

    test("宿主关闭或缺少回调时不可编辑", () => {
        expect(validateDesignerHostState(host({ open: false })).map((issue) => issue.code)).toEqual(["host-closed"]);
        expect(validateDesignerHostState(host({ hasOnDone: false })).map((issue) => issue.code)).toEqual(["host-callback-missing"]);
        const merged = validateDesignerState({ document: doc(), host: host({ open: false, hasOnClose: false }) });
        expect(hasBlockingDesignerIssue(merged)).toBe(true);
        expect(merged.filter((issue) => issue.code.startsWith("host-"))).toHaveLength(2);
    });

    test("指纹随编辑变化，可判断结果过期", () => {
        const base = doc();
        const fingerprint = designerDocumentFingerprint(base);
        expect(designerDocumentFingerprint(moveDesignerLayer(base, "layer-base", 1, 0))).not.toBe(fingerprint);
        expect(isDesignerStale(fingerprint, base)).toBe(false);
        expect(isDesignerStale(fingerprint, moveDesignerLayer(base, "layer-base", 1, 0))).toBe(true);
        expect(isDesignerStale(undefined, base)).toBe(false);
    });
});

/* ============================== 草稿与回调 ============================== */

describe("草稿、关闭与完成", () => {
    test("草稿序列化/恢复往返一致", () => {
        const document = addDesignerLayer(doc(), createTextLayer(1, { text: "春夏新品" }));
        const draft = serializeDesignerDraft(document, { imageUrl: IMAGE, now: "2026-10-28T00:00:00.000Z" });
        const restored = restoreDesignerDraft(JSON.parse(JSON.stringify(draft)));
        expect(restored.status).toBe("ok");
        if (restored.status !== "ok") return;
        expect(restored.values.designerId).toBe("dz-test");
        expect(restored.values.imageUrl).toBe(IMAGE);
        expect(restored.values.isDesignerUse).toBe(true);
        expect(restored.values.savedAt).toBe("2026-10-28T00:00:00.000Z");
        expect(designerDocumentFingerprint(restored.values.document)).toBe(designerDocumentFingerprint(document));
    });

    test("草稿结构不符不猜测、直接报 invalid", () => {
        expect(restoreDesignerDraft(null).status).toBe("empty");
        expect(restoreDesignerDraft("not-a-draft").status).toBe("invalid");
        expect(restoreDesignerDraft({ designerId: "x" }).status).toBe("invalid");
        const broken = serializeDesignerDraft(doc());
        const mutated = { ...broken, document: { ...broken.document, layers: [{ id: "l", kind: "unknown" }] } };
        let parsed: unknown;
        try {
            parsed = restoreDesignerDraft(mutated);
        } catch {
            parsed = { status: "invalid" };
        }
        expect((parsed as { status: string }).status).toBe("invalid");
    });

    test("关闭：有未保存修改先确认，未保存不静默丢弃", () => {
        expect(decideDesignerClose({ dirty: false })).toEqual({ action: "close" });
        const dirty = decideDesignerClose({ dirty: true });
        expect(dirty.action).toBe("confirm");
        if (dirty.action !== "confirm") return;
        expect(dirty.message).toContain("未保存");
        expect(decideDesignerClose({ dirty: false, restoring: true }).action).toBe("confirm");
    });

    test("完成回传必须带真实 assetId", () => {
        const document = doc();
        expect(() => buildDesignerDonePayload(document, undefined)).toThrow();
        expect(() => buildDesignerDonePayload(document, { assetId: "" })).toThrow();
        const payload = buildDesignerDonePayload(document, { assetId: "asset-1", url: "https://cdn.example.com/out.png" });
        expect(payload).toEqual({ designerId: "dz-test", assetId: "asset-1", url: "https://cdn.example.com/out.png", width: document.width, height: document.height, fingerprint: designerDocumentFingerprint(document) });
    });

    test("设计器 id 形如 dz-<时间>-<随机>，文案长度有上限", () => {
        expect(createDesignerId(1, 0.5)).toMatch(/^dz-[a-z0-9]+-[a-z0-9]+$/);
        expect(DESIGNER_TEXT_LIMIT).toBeLessThanOrEqual(200);
        expect(createTextLayer(1).height).toBeGreaterThan(0);
    });
});

/* ============================== 适配器：真实合成 + 真实入库 ============================== */

const fakeBlob = (bytes = 8) => new Blob([new Uint8Array(bytes)], { type: "image/png" });

const okHost = () => ({ open: true, isDesignerUse: true, imageUrl: IMAGE, hasOnClose: true, hasOnDone: true });

function ports(options: { composite?: { blob: Blob; width: number; height: number; mimeType: string }; failCompose?: Error; assetId?: string } = {}) {
    const calls: string[] = [];
    const compositor = {
        compose: async () => {
            calls.push("compose");
            if (options.failCompose) throw options.failCompose;
            return options.composite ?? { blob: fakeBlob(), mimeType: "image/png", width: 1200, height: 1200 };
        },
    };
    const assets = {
        save: async (blob: Blob, meta: { name: string }) => {
            calls.push(`save:${meta.name}:${blob.size}`);
            return { assetId: options.assetId ?? "asset-9", url: "https://cdn.example.com/designer.png", bytes: blob.size };
        },
    };
    return { calls, compositor, assets };
}

describe("适配器执行链路（可注入端口，失败即失败）", () => {
    test("成功路径：校验 → 合成 → 入库，阶段顺序与 requestId 稳定", async () => {
        const document = createDesignerDocument({ designerId: "dz-run", imageUrl: IMAGE });
        const { calls, compositor, assets } = ports();
        const stages: string[] = [];
        const run = await runDesigner({ document, host: okHost(), compositor, assets, requestId: "req-1", onStage: (stage) => stages.push(stage) });

        expect(stages).toEqual(["validating", "composing", "saving", "succeeded"]);
        expect(calls[0]).toBe("compose");
        expect(calls[1]).toStartWith("save:设计稿-dz-run.png:");
        expect(run.snapshot.requestId).toBe("req-1");
        expect(run.snapshot.fields.onDone).toContain("host-callback");
        expect(run.asset.assetId).toBe("asset-9");
        expect(run.composite.width).toBe(1200);
    });

    test("空 blob 与尺寸不符都按失败处理", async () => {
        const document = createDesignerDocument({ designerId: "dz-run", imageUrl: IMAGE });
        const empty = ports({ composite: { blob: fakeBlob(0), width: 1200, height: 1200, mimeType: "image/png" } });
        await expect(runDesigner({ document, host: okHost(), compositor: empty.compositor, assets: empty.assets })).rejects.toMatchObject({ code: "compose-empty" });

        const mismatch = ports({ composite: { blob: fakeBlob(), width: 600, height: 600, mimeType: "image/png" } });
        await expect(runDesigner({ document, host: okHost(), compositor: mismatch.compositor, assets: mismatch.assets })).rejects.toMatchObject({ code: "compose-mismatch" });
        // 失败时不入库
        expect(mismatch.calls.filter((call) => call.startsWith("save:"))).toHaveLength(0);
    });

    test("合成抛错 → compose-failed；入库无 assetId → asset-save-failed", async () => {
        const document = createDesignerDocument({ designerId: "dz-run", imageUrl: IMAGE });
        const failing = ports({ failCompose: new Error("gpu lost") });
        await expect(runDesigner({ document, host: okHost(), compositor: failing.compositor, assets: failing.assets })).rejects.toMatchObject({ code: "compose-failed" });

        const noAsset = ports({ assetId: "" });
        await expect(runDesigner({ document, host: okHost(), compositor: noAsset.compositor, assets: noAsset.assets })).rejects.toMatchObject({ code: "asset-save-failed" });
    });

    test("宿主关闭 / 缺回调 / 空画布 在合成前就拦住", async () => {
        const empty = createDesignerDocument({ designerId: "dz-empty" });
        const probe = ports();
        await expect(runDesigner({ document: empty, host: okHost(), compositor: probe.compositor, assets: probe.assets })).rejects.toMatchObject({ code: "invalid-document" });
        expect(probe.calls).toHaveLength(0);

        const document = createDesignerDocument({ designerId: "dz-run", imageUrl: IMAGE });
        await expect(runDesigner({ document, host: { ...okHost(), open: false }, compositor: probe.compositor, assets: probe.assets })).rejects.toMatchObject({ code: "host-closed" });
        await expect(runDesigner({ document, host: { ...okHost(), hasOnClose: false }, compositor: probe.compositor, assets: probe.assets })).rejects.toMatchObject({ code: "host-callback-missing" });
        expect(probe.calls).toHaveLength(0);
    });

    test("快照可序列化字段不含函数，提示与结果文案符合状态", async () => {
        const document = createDesignerDocument({ designerId: "dz-run", imageUrl: IMAGE });
        const { compositor, assets } = ports();
        const run = await runDesigner({ document, host: okHost(), compositor, assets });
        expect(() => JSON.stringify(run.snapshot.fields)).not.toThrow();
        expect(typeof run.snapshot.fields.onClose).toBe("string");
        expect(designerResultNotice("succeeded")).toContain("入库");
        expect(designerResultNotice("succeeded", undefined, { stale: true })).toContain("旧版本");
        expect(designerResultNotice("failed", new DesignerAdapterError("compose-empty", "空"))).toContain("为空");
        expect(designerResultNotice("composing")).toContain("合成");
    });

    test("真实合成器：按背景与图层顺序绘制，尺寸不符时明确报错", async () => {
        const drawn: string[] = [];
        const context = {
            fillStyle: "",
            globalAlpha: 1,
            font: "",
            textAlign: "",
            textBaseline: "",
            fillRect: () => drawn.push("fillRect"),
            save: () => drawn.push("save"),
            restore: () => drawn.push("restore"),
            translate: () => undefined,
            rotate: () => undefined,
            drawImage: () => drawn.push("drawImage"),
            measureText: () => ({ width: 10 }),
            fillText: () => drawn.push("fillText"),
        };
        const canvas = {
            width: 0,
            height: 0,
            getContext: () => context,
            toBlob: (callback: (blob: Blob | null) => void) => callback(fakeBlob(16)),
        };
        const compositor = createCanvasDesignerCompositor(() => canvas as never);
        const document = addDesignerLayer(createDesignerDocument({ designerId: "dz-canvas", background: "#123456" }), createTextLayer(1, { text: "新品" }));
        const composite = await compositor.compose(document);

        expect(canvas.width).toBe(document.width);
        expect(canvas.height).toBe(document.height);
        expect(drawn[0]).toBe("fillRect");
        expect(drawn).toContain("fillText");
        expect(composite.blob.size).toBe(16);
        expect(composite.mimeType).toBe("image/png");

        const noCanvas = createCanvasDesignerCompositor(() => null);
        await expect(noCanvas.compose(document)).rejects.toMatchObject({ code: "canvas-unavailable" });
    });
});

/* ============================== 字体族与画布背景 ============================== */

describe("字体族与画布背景（对齐 LinkFox 设计器 font/list 与背景面板）", () => {
    test("字体族只暴露系统可渲染字族，未知 id 回落到系统默认", () => {
        expect(DESIGNER_FONT_FAMILIES.length).toBeGreaterThanOrEqual(4);
        expect(new Set(DESIGNER_FONT_FAMILIES.map((family) => family.id)).size).toBe(DESIGNER_FONT_FAMILIES.length);
        expect(designerFontFamily(undefined).id).toBe("system");
        expect(designerFontFamily("not-a-font").id).toBe("system");
        expect(designerFontStack("sans")).toContain("PingFang SC");
        expect(designerFontStack("serif")).toContain("Songti SC");
        expect(designerFontStack("kai")).toContain("Kaiti SC");
    });

    test("字体/字号/颜色变化都会进入历史栈（不被 key 折叠）", () => {
        const doc = addDesignerLayer(createDesignerDocument({ designerId: "dz-commit" }), createTextLayer(1, { text: "新品" }));
        const id = doc.layers[0].id;
        let history = createDesignerHistory(doc);
        for (const patch of [{ fontFamily: "serif" }, { fontSize: 72 }, { color: "#ff0000" }]) {
            const before = history;
            history = commitDesignerDocument(history, updateDesignerLayer(history.present, id, patch));
            expect(history).not.toBe(before);
            expect(history.past.length).toBe(before.past.length + 1);
        }
    });

    test("文字图层带字体族，切换字体递增 revision 且不影响几何", () => {
        const doc = addDesignerLayer(createDesignerDocument({ designerId: "dz-font" }), createTextLayer(1, { text: "新品", fontFamily: "serif" }));
        const layer = doc.layers[0];
        expect(layer.fontFamily).toBe("serif");
        const next = updateDesignerLayer(doc, layer.id, { fontFamily: "kai" });
        expect(next.layers[0].fontFamily).toBe("kai");
        expect(next.layers[0].x).toBe(layer.x);
        expect(next.revision).toBeGreaterThan(doc.revision);
        // 图层 schema 接受该字段，草稿序列化往返不丢
        const restored = restoreDesignerDraft(serializeDesignerDraft(next, { imageUrl: "https://cdn.example.com/p.png" }));
        expect(restored.status).toBe("ok");
        if (restored.status === "ok") expect(restored.values.document.layers[0].fontFamily).toBe("kai");
    });

    test("画布背景只接受 #RGB/#RRGGBB，非法值不改文档", () => {
        const doc = createDesignerDocument({ designerId: "dz-bg", background: "#ffffff" });
        expect(setDesignerCanvasBackground(doc, "#123456").background).toBe("#123456");
        expect(setDesignerCanvasBackground(doc, " #ABC ").background).toBe("#ABC");
        expect(setDesignerCanvasBackground(doc, "red")).toBe(doc);
        expect(setDesignerCanvasBackground(doc, "#12")).toBe(doc);
        const same = setDesignerCanvasBackground(doc, "#FFFFFF");
        expect(same).toBe(doc);
    });

    test("合成器把字体族写进 ctx.font，并把背景色画在最底层", async () => {
        const fonts: string[] = [];
        const filled: string[] = [];
        const context = {
            fillStyle: "",
            globalAlpha: 1,
            textAlign: "",
            textBaseline: "",
            get font() {
                return "";
            },
            set font(value: string) {
                fonts.push(value);
            },
            fillRect: () => filled.push("fillRect"),
            save: () => undefined,
            restore: () => undefined,
            translate: () => undefined,
            rotate: () => undefined,
            drawImage: () => undefined,
            measureText: () => ({ width: 10 }),
            fillText: () => filled.push("fillText"),
        };
        const canvas = {
            width: 0,
            height: 0,
            getContext: () => context,
            toBlob: (callback: (blob: Blob | null) => void) => callback(fakeBlob(16)),
        };
        const compositor = createCanvasDesignerCompositor(() => canvas as never);
        const doc = addDesignerLayer(
            createDesignerDocument({ designerId: "dz-font-canvas", background: "#101010" }),
            createTextLayer(1, { text: "夏季上新", fontFamily: "serif" }),
        );

        await compositor.compose(doc);

        expect(filled[0]).toBe("fillRect");
        expect(fonts.some((value) => value.includes("Songti SC"))).toBe(true);
    });
});

/* ============================== 工作区渲染 ============================== */

describe("工作区渲染（无网络、无假结果）", () => {
    test("首屏三栏、画布为空时导出与完成都禁用", async () => {
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
        const { DesignerWorkspace } = await import("@/components/tools/workspaces/designer");

        const html = renderToStaticMarkup(
            React.createElement(DesignerWorkspace, { designerId: "dz-ws", sourceName: "商品主图" }),
        );

        // 三栏骨架 + 画布
        expect(html).toContain("素材与图层");
        expect(html).toContain("属性面板");
        expect(html).toContain("设计画布");
        expect(html).toContain("商品图设计器");
        expect(html).toContain("商品主图");

        // 编辑工具入口
        expect(html).toContain("添加文字");
        expect(html).toContain("添加图片");
        expect(html).toContain("撤销");
        expect(html).toContain("重做");
        expect(html).toContain("预览");

        // 空画布 → 导出禁用；未导出 → 完成禁用
        expect(isDisabled(buttonTag(html, 'data-testid="designer-export"'))).toBe(true);
        expect(isDisabled(buttonTag(html, 'data-testid="designer-done"'))).toBe(true);
        expect(html).toContain("画布为空：上传商品图或添加文字图层开始设计");
        expect(html).toContain(NEW_DESIGNER_DRAFT_KEY);
    });

    test("带 imageUrl 时底图进入图层列表，导出按钮解除禁用", async () => {
        const React = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { DesignerWorkspace } = await import("@/components/tools/workspaces/designer");

        const html = renderToStaticMarkup(
            React.createElement(DesignerWorkspace, { designerId: "dz-ws2", imageUrl: IMAGE, onClose: () => undefined, onDone: () => undefined }),
        );
        expect(html).toContain("商品底图");
        expect(html).toContain("1 层");
        expect(isDisabled(buttonTag(html, 'data-testid="designer-export"'))).toBe(false);
        expect(isDisabled(buttonTag(html, 'data-testid="designer-done"'))).toBe(true);
        expect(html).not.toContain("画布为空");
    });
});

/* ============================== 真实任务持久化 + 回放 ============================== */

describe("任务持久化（历史坞读的是真实任务记录，不是本地假历史）", () => {
    test("成功导出：任务推进到 succeeded，落盘可回放快照与真实结果 url", async () => {
        const document = addDesignerLayer(
            createDesignerDocument({ designerId: "dz-persist", imageUrl: IMAGE }),
            createTextLayer(1, { text: "回放画布" }),
        );
        const { compositor, assets } = ports();
        const persisted: ToolTask[] = [];
        const run = await runDesigner({
            document,
            host: host(),
            compositor,
            assets,
            taskId: "task-persist",
            persist: (task) => void persisted.push(task),
        });

        expect(persisted.map((task) => task.status)).toEqual(["validating", "submitting", "running", "succeeded"]);
        expect(run.task.id).toBe("task-persist");
        expect(run.task.toolId).toBe(NEW_DESIGNER_TOOL_ID);
        expect(run.task.upstreamProvider).toBe(DESIGNER_TASK_ENGINE);
        expect(run.task.inputSnapshot).toBeDefined();
        expect(run.task.result?.items[0]?.url).toBe("https://cdn.example.com/designer.png");
        // 真实字节必须随结果项交给 store：只有 blob 才能进 media_files（storageKey），
        // 刷新后 URL 由 storageKey 重建，下载/存资产/发画布才不会 Failed to fetch。
        expect(run.task.result?.items[0]?.blob).toBeInstanceOf(Blob);
        expect(run.task.result?.items[0]?.blob?.size).toBe(run.task.result?.items[0]?.bytes);
        expect(run.task.error).toBeUndefined();

        const replayed = readDesignerReplaySnapshot(run.task.inputSnapshot);
        expect(replayed?.designerId).toBe("dz-persist");
        expect(replayed?.layers.length).toBe(document.layers.length);
        expect(replayed?.width).toBe(document.width);
    });

    test("失败也落盘 failed（不假装成功），错误码来自真实失败原因", async () => {
        const document = createDesignerDocument({ designerId: "dz-persist", imageUrl: IMAGE });
        const failing = ports({ failCompose: new Error("canvas 崩了") });
        const persisted: ToolTask[] = [];
        await expect(
            runDesigner({ document, host: host(), compositor: failing.compositor, assets: failing.assets, persist: (task) => void persisted.push(task) }),
        ).rejects.toMatchObject({ code: "compose-failed" });

        const last = persisted[persisted.length - 1];
        expect(last.status).toBe("failed");
        expect(last.error?.code).toBe("compose-failed");
        expect(last.result).toBeUndefined();
    });

    test("回放只认合法落盘文档：结构不符/契约阻断一律返回 null，不猜", () => {
        const document = createDesignerDocument({ designerId: "dz-persist", imageUrl: IMAGE });
        expect(readDesignerReplaySnapshot(designerInputSnapshot(document, host()))).not.toBeNull();
        expect(readDesignerReplaySnapshot(null)).toBeNull();
        expect(readDesignerReplaySnapshot({})).toBeNull();
        expect(readDesignerReplaySnapshot({ kind: "new-designer-canvas", document: { width: 1 } })).toBeNull();
        expect(readDesignerReplaySnapshot({ kind: "new-designer-canvas", document: { ...document, width: 0 } })).toBeNull();
        // 空画布在设计器契约里本就不可导出，回放同样拒绝
        expect(readDesignerReplaySnapshot({ kind: "new-designer-canvas", document: { ...document, layers: [] } })).toBeNull();
    });
});

describe("刷新后结果回填（导出任务落库 → 结果区）", () => {
    test("最近一条成功的导出任务还原出资产引用与 fingerprint；失败任务不冒充结果", () => {
        const ok = {
            id: "task-a",
            toolId: NEW_DESIGNER_TOOL_ID,
            status: "succeeded",
            submittedAt: 5,
            fingerprint: "fp-abc",
            result: {
                items: [
                    {
                        id: "designer-fpabc123-9f8e7d6c",
                        kind: "image",
                        url: "blob:https://app/restored",
                        bytes: 2048,
                    },
                ],
            },
        } as unknown as Parameters<typeof latestDesignerTask>[0][string];
        const failed = {
            id: "task-b",
            toolId: NEW_DESIGNER_TOOL_ID,
            status: "failed",
            submittedAt: 9,
            result: { items: [] },
        } as unknown as Parameters<typeof latestDesignerTask>[0][string];
        const foreign = {
            id: "task-c",
            toolId: "OTHER_TOOL",
            status: "succeeded",
            submittedAt: 99,
            result: { items: [{ id: "x", kind: "image", url: "http://x/y.png" }] },
        } as unknown as Parameters<typeof latestDesignerTask>[0][string];

        const latest = latestDesignerTask({ a: ok, b: failed, c: foreign }, NEW_DESIGNER_TOOL_ID);
        // task-c 分数更高但属于别的工具：筛选必须只看本工具
        expect(latest?.id).toBe("task-b");
        expect(designerResultFromStoredTask(latest!)).toBeNull();

        const restored = designerResultFromStoredTask(ok);
        expect(restored?.result).toEqual({ assetId: "9f8e7d6c", url: "blob:https://app/restored", bytes: 2048 });
        expect(restored?.fingerprint).toBe("fp-abc");
    });

    test("成功但没结果项时返回 null（不补造结果）", () => {
        const empty = {
            id: "task-d",
            toolId: NEW_DESIGNER_TOOL_ID,
            status: "succeeded",
            submittedAt: 1,
            result: { items: [] },
        } as unknown as Parameters<typeof latestDesignerTask>[0][string];
        expect(designerResultFromStoredTask(empty)).toBeNull();
    });
});
