/**
 * TASK-038 真实执行层：NEW_DESIGNER 是 `designer-host` 工具。
 *
 * 关键事实（不虚构）：`services/api/tools/gateway.ts#submit` 对 `designer-host` 直接抛
 * `adapter-not-executable`，上游也没有“设计器 → 生成”的接口。所以本适配器 **不经过 image/video 网关**，
 * 而是执行设计器真正做的事：
 *
 *   画布文档（图层/几何/文案）→ 真实 Canvas 合成（像素级）→ 真实资产入库（uploadToolAsset）→ onDone 回传资产
 *
 * 合成与入库都是可注入端口，页面注入浏览器实现、测试注入受控实现；任一环节失败都显式失败，
 * 不返回占位图、不伪造 assetId。
 */

import {
    assertDesignerFieldsSerializable,
    auditDesignerFields,
    buildDesignerFields,
    buildDesignerPrompt,
    designerDocumentFingerprint,
    hasBlockingDesignerIssue,
    validateDesignerState,
    type DesignerDocument,
    type DesignerFields,
    type DesignerHostState,
    type DesignerIssue,
} from "../registry/new-designer";

export const DESIGNER_DONE_MIME = "image/png" as const;

export type DesignerStageState = "idle" | "validating" | "composing" | "saving" | "succeeded" | "failed";

export type DesignerErrorCode =
    | "host-closed"
    | "host-callback-missing"
    | "invalid-document"
    | "canvas-unavailable"
    | "image-load-failed"
    | "compose-failed"
    | "compose-empty"
    | "compose-mismatch"
    | "asset-save-failed"
    | "aborted";

export class DesignerAdapterError extends Error {
    readonly code: DesignerErrorCode;
    readonly issues: readonly DesignerIssue[];

    constructor(code: DesignerErrorCode, message: string, issues: readonly DesignerIssue[] = []) {
        super(message);
        this.name = "DesignerAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/* ============================== 端口 ============================== */

export type DesignerComposite = {
    blob: Blob;
    mimeType: string;
    width: number;
    height: number;
};

export type DesignerCompositorPort = {
    /** 真实像素合成：实现方必须按图层顺序绘制，不得返回缓存的旧图。 */
    compose: (document: DesignerDocument, options?: { signal?: AbortSignal }) => Promise<DesignerComposite>;
};

export type DesignerAssetRef = { assetId: string; url: string; bytes: number };

export type DesignerAssetPort = {
    save: (blob: Blob, meta: { name: string; designerId: string; width: number; height: number }) => Promise<DesignerAssetRef>;
};

export type DesignerSnapshot = {
    requestId: string;
    designerId: string;
    fingerprint: string;
    prompt: string;
    fields: DesignerFields;
    revision: number;
};

export type DesignerRun = {
    snapshot: DesignerSnapshot;
    composite: DesignerComposite;
    asset: DesignerAssetRef;
};

export type DesignerRunOptions = {
    document: DesignerDocument;
    host: DesignerHostState;
    compositor: DesignerCompositorPort;
    assets: DesignerAssetPort;
    requestId?: string;
    signal?: AbortSignal;
    onStage?: (stage: DesignerStageState) => void;
};

/* ============================== 请求快照 ============================== */

export function createDesignerRequestId(now: number = Date.now(), random: number = Math.random()): string {
    const suffix = Math.floor(Math.abs(random) * 0xffffffff)
        .toString(36)
        .padStart(6, "0")
        .slice(0, 8);
    return `dzr-${now.toString(36)}-${suffix}`;
}

/** 提交前的守卫：宿主状态 + 画布内容 + 回调字段不可序列化。 */
export function assertDesignerReady(document: DesignerDocument, host: DesignerHostState): void {
    const issues = validateDesignerState({ document, host });
    if (!hasBlockingDesignerIssue(issues)) return;
    const closed = issues.find((issue) => issue.code === "host-closed");
    if (closed) throw new DesignerAdapterError("host-closed", closed.message, issues);
    const callbacks = issues.find((issue) => issue.code === "host-callback-missing");
    if (callbacks) throw new DesignerAdapterError("host-callback-missing", callbacks.message, issues);
    throw new DesignerAdapterError("invalid-document", issues[0].message, issues);
}

export function createDesignerSnapshot(document: DesignerDocument, host: DesignerHostState, requestId: string = createDesignerRequestId()): DesignerSnapshot {
    const fields = buildDesignerFields(document, host);
    assertDesignerFieldsSerializable(fields as unknown as Record<string, unknown>);
    const audit = auditDesignerFields(fields as unknown as Record<string, unknown>, document, host);
    if (!audit.ok) {
        throw new DesignerAdapterError("invalid-document", `设计器字段与契约不一致：缺失 ${audit.missing.join("、") || "无"}；不一致 ${audit.mismatched.join("、") || "无"}；多余 ${audit.unexpected.join("、") || "无"}`);
    }
    return {
        requestId,
        designerId: document.designerId,
        fingerprint: designerDocumentFingerprint(document),
        prompt: buildDesignerPrompt(document),
        fields,
        revision: document.revision,
    };
}

/* ============================== 执行 ============================== */

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DesignerAdapterError("aborted", "已取消本次设计器导出。");
}

/** 合成结果的硬校验：空 blob、尺寸不符都是失败，绝不把半成品当成功。 */
export function assertDesignerComposite(composite: DesignerComposite, document: DesignerDocument): void {
    if (!composite || !composite.blob || composite.blob.size <= 0) {
        throw new DesignerAdapterError("compose-empty", "合成结果为空（0 字节），按失败处理。");
    }
    if (composite.width !== document.width || composite.height !== document.height) {
        throw new DesignerAdapterError("compose-mismatch", `合成尺寸 ${composite.width}×${composite.height} 与画布 ${document.width}×${document.height} 不一致。`);
    }
}

export async function runDesigner(options: DesignerRunOptions): Promise<DesignerRun> {
    const { document, host, compositor, assets, signal, onStage } = options;
    onStage?.("validating");
    assertDesignerReady(document, host);
    const snapshot = createDesignerSnapshot(document, host, options.requestId);
    throwIfAborted(signal);

    onStage?.("composing");
    let composite: DesignerComposite;
    try {
        composite = await compositor.compose(document, { signal });
    } catch (error) {
        if (error instanceof DesignerAdapterError) throw error;
        throw new DesignerAdapterError("compose-failed", error instanceof Error ? error.message : "画布合成失败。");
    }
    throwIfAborted(signal);
    assertDesignerComposite(composite, document);

    onStage?.("saving");
    let asset: DesignerAssetRef;
    try {
        asset = await assets.save(composite.blob, {
            name: `设计稿-${document.designerId}.png`,
            designerId: document.designerId,
            width: document.width,
            height: document.height,
        });
    } catch (error) {
        throw new DesignerAdapterError("asset-save-failed", error instanceof Error ? error.message : "设计稿入库失败。");
    }
    if (!asset?.assetId) throw new DesignerAdapterError("asset-save-failed", "入库未返回资产 id，onDone 不能回传。");

    onStage?.("succeeded");
    return { snapshot, composite, asset };
}

/** 同快照重试：重新合成 + 重新入库，复用一个 requestId，便于定位同一稿的多次导出。 */
export async function retryDesigner(options: DesignerRunOptions & { requestId: string }): Promise<DesignerRun> {
    return runDesigner(options);
}

/* ============================== 结果提示 ============================== */

export type DesignerResultView = {
    state: DesignerStageState;
    stale: boolean;
    notice: string;
    asset?: DesignerAssetRef;
};

export function designerResultNotice(state: DesignerStageState, error?: DesignerAdapterError, options: { stale?: boolean } = {}): string {
    if (state === "failed" && error) {
        if (error.code === "canvas-unavailable") return "当前环境不支持 Canvas 合成，无法导出设计稿（请换用桌面浏览器）。";
        if (error.code === "asset-save-failed") return `设计稿已合成但入库失败，可重试入库：${error.message}`;
        if (error.code === "compose-empty") return "合成结果为空，未入库，请调整图层后重试。";
        if (error.code === "invalid-document") return `画布未通过校验：${error.message}`;
        return `设计器失败：${error.message}`;
    }
    if (state === "validating") return "正在校验画布…";
    if (state === "composing") return "正在合成设计稿（真实像素渲染）…";
    if (state === "saving") return "正在把设计稿写入资产库…";
    if (state === "succeeded") return options.stale ? "已完成，但画布在导出后又被修改：当前结果是旧版本，请重新导出。" : "已完成并入库，可点“完成”回传给来源工具。";
    return "在左侧添加图层、在画布上编辑，然后点“导出设计稿”。";
}

/* ============================== 浏览器真实合成器 ============================== */

type CanvasLike = {
    width: number;
    height: number;
    getContext: (type: "2d") => CanvasRenderingContext2D | null;
    toBlob?: (callback: (blob: Blob | null) => void, mimeType?: string, quality?: number) => void;
};

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const ImageCtor = (globalThis as { Image?: typeof Image }).Image;
        if (!ImageCtor) {
            reject(new DesignerAdapterError("canvas-unavailable", "当前环境没有 Image 构造器。"));
            return;
        }
        const image = new ImageCtor();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new DesignerAdapterError("image-load-failed", `素材加载失败：${src.slice(0, 96)}`));
        image.src = src;
    });
}

function drawLayer(context: CanvasRenderingContext2D, layer: DesignerDocument["layers"][number], image?: HTMLImageElement): void {
    if (!layer.visible) return;
    context.save();
    context.globalAlpha = layer.opacity;
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    context.translate(centerX, centerY);
    context.rotate((layer.rotation * Math.PI) / 180);
    if (layer.kind === "image" && image) {
        context.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    } else if (layer.kind === "text") {
        const fontSize = layer.fontSize ?? Math.max(12, Math.round(layer.height * 0.6));
        context.fillStyle = layer.color ?? "#ffffff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`;
        const text = layer.text ?? "";
        const ratio = Math.min(1, layer.width / Math.max(1, context.measureText(text).width));
        context.fillText(text, 0, 0, layer.width * ratio);
    }
    context.restore();
}

/**
 * 真实合成器：DOM Canvas 逐层绘制 → PNG Blob。
 * 没有 Canvas / toBlob 时抛 `canvas-unavailable`，不退回任何“假图”。
 */
export function createCanvasDesignerCompositor(createCanvas: () => CanvasLike | null = defaultCreateCanvas): DesignerCompositorPort {
    return {
        async compose(document, options = {}) {
            throwIfAborted(options.signal);
            const canvas = createCanvas();
            if (!canvas) throw new DesignerAdapterError("canvas-unavailable", "当前环境不支持 Canvas。");
            canvas.width = document.width;
            canvas.height = document.height;
            const context = canvas.getContext("2d");
            if (!context) throw new DesignerAdapterError("canvas-unavailable", "无法获取 2D 上下文。");
            context.fillStyle = document.background;
            context.fillRect(0, 0, document.width, document.height);

            for (const layer of document.layers) {
                throwIfAborted(options.signal);
                if (!layer.visible) continue;
                if (layer.kind === "image" && layer.src) drawLayer(context, layer, await loadImage(layer.src));
                else drawLayer(context, layer);
            }

            if (typeof canvas.toBlob !== "function") throw new DesignerAdapterError("canvas-unavailable", "当前环境不支持 canvas.toBlob。");
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob?.((value) => resolve(value), DESIGNER_DONE_MIME));
            if (!blob) throw new DesignerAdapterError("compose-empty", "Canvas 未返回 PNG 数据。");
            return { blob, mimeType: DESIGNER_DONE_MIME, width: document.width, height: document.height };
        },
    };
}

function defaultCreateCanvas(): CanvasLike | null {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc?.createElement) return null;
    return doc.createElement("canvas") as unknown as CanvasLike;
}
