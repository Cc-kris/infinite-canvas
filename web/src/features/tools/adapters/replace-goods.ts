/**
 * TASK-023：REPLACE_GOODS「商品替换」适配器（真实 provider 边界，无演示成功）。
 *
 * 一次商品替换 = 一次真实图像编辑请求：
 *  - 参考图 1：参考场景（sourceImageUrl / imageUrl / url）；
 *  - 参考图 2：替换商品（targetImageUrl）；
 *  - 参考图 3：**落位导引图**——本机按四边形做真实分段仿射贴图渲染（透视/扭曲不是装饰参数）；
 *  - 参考图 4：**保护蒙版 PNG**——本机按「四边形外锁定 + 画笔」逐像素栅格化导出；
 *  - 22 个字段由 registry/composeReplaceGoodsFields 逐项落齐，缺一项直接抛错（防静默丢参）；
 *  - 上游成功但无图片 → 判 failed（empty-result），绝不补造结果；
 *  - 结果带 snapshotHash，配置一变即标记「来自旧版本」。
 *
 * 多商品（多 SKU）按 SKU 拆成独立请求单元，各自可单独重试，互不覆盖。
 */

import {
    REPLACE_GOODS_CORNERS,
    REPLACE_GOODS_FIELD_KEYS,
    REPLACE_GOODS_TOOL_ID,
    affineFromTriangles,
    buildUnitSnapshot,
    composeReplaceGoodsFields,
    composeReplaceGoodsPrompt,
    missingReplaceGoodsFields,
    pointInQuad,
    protectMaskGrid,
    quadArea,
    quadBBox,
    quadCentroid,
    unitSnapshotHash,
    type Affine,
    type ReplaceGoodsMask,
    type ReplaceGoodsPoint,
    type ReplaceGoodsQuad,
    type ReplaceGoodsScene,
    type ReplaceGoodsSize,
    type ReplaceGoodsSku,
    type ReplaceGoodsUnitSnapshot,
    type ReplaceGoodsWorkspace,
} from "../registry/replace-goods";
import type { BrowserToolInput, ProviderPort, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { hasUsablePayload, withDerivedKind } from "@/lib/result-item-kind";
import type { ReferenceImage } from "@/types/image";

export class ReplaceGoodsAdapterError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.name = "ReplaceGoodsAdapterError";
        this.code = code;
    }
}

/* ------------------------------------------------------------------ *
 * 画布依赖（生产用真实 canvas；测试注入的也必须真的画/真的导出）
 * ------------------------------------------------------------------ */

export type ReplaceGoodsPaintContext = {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    lineJoin: string;
    save: () => void;
    restore: () => void;
    beginPath: () => void;
    moveTo: (x: number, y: number) => void;
    lineTo: (x: number, y: number) => void;
    closePath: () => void;
    fill: () => void;
    stroke: () => void;
    clip: () => void;
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    drawImage: (image: unknown, dx: number, dy: number, dw?: number, dh?: number) => void;
    createImageData: (width: number, height: number) => { data: Uint8ClampedArray; width: number; height: number };
    putImageData: (data: { data: Uint8ClampedArray; width: number; height: number }, dx: number, dy: number) => void;
};

export type ReplaceGoodsCanvas = {
    width: number;
    height: number;
    getContext: (type: "2d") => ReplaceGoodsPaintContext | null;
    toDataURL?: (type?: string) => string;
    convertToBlob?: (options?: { type?: string }) => Promise<Blob>;
};

export type ReplaceGoodsRenderDeps = {
    createCanvas?: (width: number, height: number) => ReplaceGoodsCanvas | null;
};

export const REPLACE_GOODS_GUIDE_MAX_SIDE = 1600;
export const REPLACE_GOODS_MASK_MAX_SIDE = 1280;

function defaultCreateCanvas(width: number, height: number): ReplaceGoodsCanvas | null {
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas as unknown as ReplaceGoodsCanvas;
    }
    const Offscreen = (globalThis as { OffscreenCanvas?: new (w: number, h: number) => ReplaceGoodsCanvas }).OffscreenCanvas;
    if (typeof Offscreen === "function") return new Offscreen(width, height);
    return null;
}

async function canvasToDataUrl(canvas: ReplaceGoodsCanvas): Promise<string> {
    if (typeof canvas.toDataURL === "function") {
        const url = canvas.toDataURL("image/png");
        if (!url || url === "data:,") throw new ReplaceGoodsAdapterError("export-failed", "画布导出为空，请重试或换浏览器");
        return url;
    }
    if (typeof canvas.convertToBlob === "function") {
        const blob = await canvas.convertToBlob({ type: "image/png" });
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new ReplaceGoodsAdapterError("export-failed", "画布导出失败"));
            reader.readAsDataURL(blob);
        });
    }
    throw new ReplaceGoodsAdapterError("export-unsupported", "当前画布不支持导出 PNG");
}

export function renderSize(width: number, height: number, maxSide: number): { width: number; height: number; scale: number } {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    const longest = Math.max(safeWidth, safeHeight);
    const scale = longest > maxSide ? maxSide / longest : 1;
    return { width: Math.max(1, Math.round(safeWidth * scale)), height: Math.max(1, Math.round(safeHeight * scale)), scale };
}

/* ------------------------------------------------------------------ *
 * 保护蒙版 PNG（真实像素：四边形外 255=锁定，四边形内 0=可改写）
 * ------------------------------------------------------------------ */

export type ProtectMaskRender = { dataUrl: string; width: number; height: number; coverage: number };

export async function renderProtectMaskPng(
    scene: ReplaceGoodsSize,
    quad: ReplaceGoodsQuad,
    mask: ReplaceGoodsMask,
    deps: ReplaceGoodsRenderDeps = {},
): Promise<ProtectMaskRender> {
    const size = renderSize(scene.width, scene.height, REPLACE_GOODS_MASK_MAX_SIDE);
    const create = deps.createCanvas ?? defaultCreateCanvas;
    const canvas = create(size.width, size.height);
    if (!canvas) throw new ReplaceGoodsAdapterError("canvas-unavailable", "当前环境无法创建画布，不能导出保护蒙版");
    const context = canvas.getContext("2d");
    if (!context) throw new ReplaceGoodsAdapterError("canvas-unavailable", "画布 2D 上下文不可用，不能导出保护蒙版");
    const grid = protectMaskGrid({ width: size.width, height: size.height, quad, mask });
    const image = context.createImageData(size.width, size.height);
    let covered = 0;
    for (let index = 0; index < grid.length; index += 1) {
        const value = grid[index]!;
        if (value > 127) covered += 1;
        image.data[index * 4] = 255;
        image.data[index * 4 + 1] = 255;
        image.data[index * 4 + 2] = 255;
        image.data[index * 4 + 3] = value;
    }
    context.putImageData(image, 0, 0);
    const dataUrl = await canvasToDataUrl(canvas);
    return { dataUrl, width: size.width, height: size.height, coverage: Math.round((covered / grid.length) * 10000) / 10000 };
}

/* ------------------------------------------------------------------ *
 * 落位导引图（分段仿射真实贴图：四边形扭曲真的会改变渲染结果）
 * ------------------------------------------------------------------ */

export type GuideDrawCall = { source: [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint]; target: [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint]; affine: Affine };

/** 四边形 → 两个三角形（TL-TR-BR / TL-BR-BL），每块给出真实仿射矩阵。 */
export function guideDrawCalls(quad: ReplaceGoodsQuad, canvas: ReplaceGoodsSize, image: ReplaceGoodsSize): GuideDrawCall[] {
    const toPixels = (point: ReplaceGoodsPoint) => ({ x: point.x * canvas.width, y: point.y * canvas.height });
    const corners = {
        topLeft: toPixels(quad.topLeft),
        topRight: toPixels(quad.topRight),
        bottomRight: toPixels(quad.bottomRight),
        bottomLeft: toPixels(quad.bottomLeft),
    };
    const source: [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint] = [
        { x: 0, y: 0 },
        { x: image.width, y: 0 },
        { x: image.width, y: image.height },
    ];
    const sourceSecond: [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint] = [
        { x: 0, y: 0 },
        { x: image.width, y: image.height },
        { x: 0, y: image.height },
    ];
    const target: [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint] = [corners.topLeft, corners.topRight, corners.bottomRight];
    const targetSecond: [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint] = [corners.topLeft, corners.bottomRight, corners.bottomLeft];
    return [
        { source, target, affine: affineFromTriangles(source, target) },
        { source: sourceSecond, target: targetSecond, affine: affineFromTriangles(sourceSecond, targetSecond) },
    ];
}

export type PlacementGuideRender = { dataUrl: string; width: number; height: number; quadArea: number };

/**
 * 把替换商品按四边形真实贴进导引图（透明底 + 四边形描边），随请求一起发出。
 * 这不是示意图：绘制用的是同一个四边形，扭曲/透视改动会改变像素。
 */
export async function renderPlacementGuidePng(
    scene: ReplaceGoodsSize,
    quad: ReplaceGoodsQuad,
    target: { image: unknown; width: number; height: number },
    deps: ReplaceGoodsRenderDeps = {},
): Promise<PlacementGuideRender> {
    const size = renderSize(scene.width, scene.height, REPLACE_GOODS_GUIDE_MAX_SIDE);
    const create = deps.createCanvas ?? defaultCreateCanvas;
    const canvas = create(size.width, size.height);
    if (!canvas) throw new ReplaceGoodsAdapterError("canvas-unavailable", "当前环境无法创建画布，不能生成落位导引图");
    const context = canvas.getContext("2d");
    if (!context) throw new ReplaceGoodsAdapterError("canvas-unavailable", "画布 2D 上下文不可用，不能生成落位导引图");
    if (!target.image) throw new ReplaceGoodsAdapterError("target-missing", "缺少替换商品位图，不能生成落位导引图");

    for (const call of guideDrawCalls(quad, size, { width: target.width || 1, height: target.height || 1 })) {
        context.save();
        context.beginPath();
        context.moveTo(call.target[0].x, call.target[0].y);
        context.lineTo(call.target[1].x, call.target[1].y);
        context.lineTo(call.target[2].x, call.target[2].y);
        context.closePath();
        context.clip();
        const { a, b, c, d, e, f } = call.affine;
        context.setTransform(a, b, d, e, c, f);
        context.drawImage(target.image, 0, 0, target.width || 1, target.height || 1);
        context.restore();
    }

    // 四边形描边：让 provider 明确“商品应当占据的边界”。
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.strokeStyle = "rgba(255,64,64,0.9)";
    context.lineWidth = Math.max(2, Math.round(size.width / 400));
    context.lineJoin = "round";
    context.beginPath();
    REPLACE_GOODS_CORNERS.forEach((corner, index) => {
        const x = quad[corner].x * size.width;
        const y = quad[corner].y * size.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
    });
    context.closePath();
    context.stroke();
    context.restore();

    const dataUrl = await canvasToDataUrl(canvas);
    return { dataUrl, width: size.width, height: size.height, quadArea: Math.round(quadArea(quad) * 10000) / 10000 };
}
/* ------------------------------------------------------------------ *
 * 请求单元：每个 SKU 一份，20 字段落齐 + 4 张真实参考图
 * ------------------------------------------------------------------ */

export type ReplaceGoodsSceneImage = {
    assetId: string;
    name: string;
    dataUrl: string;
    originUrl?: string;
    width: number;
    height: number;
    /** 已解码位图（用于导引图贴图）；缺失则导引图无从渲染，直接报错而不是静默跳过。 */
    image: unknown;
};

export type ReplaceGoodsTargetImage = {
    assetId: string;
    name: string;
    dataUrl: string;
    originUrl?: string;
    width: number;
    height: number;
    image: unknown;
};

export type ReplaceGoodsUnit = {
    id: string;
    label: string;
    snapshot: ReplaceGoodsUnitSnapshot;
    snapshotHash: string;
    prompt: string;
    /** 22 字段（与 gateway 注册表一致）。 */
    fields: Record<string, unknown>;
    references: ReferenceImage[];
    maskCoverage: number;
    guideArea: number;
};

export type BuildReplaceGoodsUnitOptions = {
    workspace: ReplaceGoodsWorkspace;
    sku: ReplaceGoodsSku;
    scene: ReplaceGoodsSceneImage;
    target: ReplaceGoodsTargetImage;
    clientOperationId?: string;
    draftRevision?: number;
    deps?: ReplaceGoodsRenderDeps;
};

/** 图片资产 → ReferenceImage（地址必须真实可读，空地址直接抛错）。 */
export function toReference(asset: { assetId: string; name: string; dataUrl: string; originUrl?: string }, id: string): ReferenceImage {
    const dataUrl = asset.dataUrl?.trim();
    if (!dataUrl) throw new ReplaceGoodsAdapterError("reference-empty", `${asset.name || id} 没有可用的图片地址，请重新上传`);
    return { id, name: asset.name || `${id}.png`, type: "image/png", dataUrl, url: asset.originUrl || undefined };
}

export async function buildReplaceGoodsUnit(options: BuildReplaceGoodsUnitOptions): Promise<ReplaceGoodsUnit> {
    const { workspace, sku, scene, target } = options;
    const quad = sku.history.present.quad;
    if (!quadArea(quad)) throw new ReplaceGoodsAdapterError("quad-degenerate", `${sku.label}：定位四边形面积为 0，无法提交`);
    const box = quadBBox(quad);
    if (!pointInQuad(quad, quadCentroid(quad)) && (box.maxX < 0 || box.minX > 1 || box.maxY < 0 || box.minY > 1)) {
        throw new ReplaceGoodsAdapterError("quad-outside", `${sku.label}：商品已完全移出画布`);
    }

    const mask = await renderProtectMaskPng({ width: scene.width, height: scene.height }, quad, sku.mask, options.deps);
    const guide = await renderPlacementGuidePng(
        { width: scene.width, height: scene.height },
        quad,
        { image: target.image, width: target.width, height: target.height },
        options.deps,
    );

    const snapshot = buildUnitSnapshot({
        workspace: { ...workspace, scene: { assetId: scene.assetId, name: scene.name, url: scene.dataUrl, originUrl: scene.originUrl ?? scene.dataUrl, width: scene.width, height: scene.height }, skus: [sku], activeSkuId: sku.id },
        sku,
        clientOperationId: options.clientOperationId,
        draftRevision: options.draftRevision,
    });
    const fields = composeReplaceGoodsFields(snapshot, { maskUrl: mask.dataUrl });
    const missing = missingReplaceGoodsFields(fields as Record<string, unknown>);
    if (missing.length > 0) throw new ReplaceGoodsAdapterError("fields-missing", `${sku.label}：以下字段为空 —— ${missing.join(", ")}`);

    const references: ReferenceImage[] = [
        toReference({ assetId: scene.assetId, name: scene.name, dataUrl: scene.dataUrl, originUrl: scene.originUrl }, "scene"),
        toReference({ assetId: target.assetId, name: target.name, dataUrl: target.dataUrl, originUrl: target.originUrl }, "target"),
        { id: "placement-guide", name: "placement-guide.png", type: "image/png", dataUrl: guide.dataUrl },
        { id: "protect-mask", name: "protect-mask.png", type: "image/png", dataUrl: mask.dataUrl },
    ];

    return {
        id: sku.id,
        label: sku.label,
        snapshot,
        snapshotHash: unitSnapshotHash(snapshot),
        prompt: composeReplaceGoodsPrompt(snapshot),
        fields,
        references,
        maskCoverage: mask.coverage,
        guideArea: guide.quadArea,
    };
}

/** 提交前的字段自检结果（UI 用来显示“22/22 字段已落齐”）。 */
export function auditReplaceGoodsFields(fields: Record<string, unknown>): { expected: number; present: number; missing: string[]; extra: string[] } {
    const expectedKeys = [...REPLACE_GOODS_FIELD_KEYS];
    const missing = expectedKeys.filter((key) => fields[key] === undefined);
    const extra = Object.keys(fields).filter((key) => !(expectedKeys as string[]).includes(key));
    return { expected: expectedKeys.length, present: expectedKeys.length - missing.length, missing, extra };
}

export function buildReplaceGoodsInput(unit: ReplaceGoodsUnit, options: { draftRevision?: number | string | null } = {}): BrowserToolInput {
    return {
        toolId: REPLACE_GOODS_TOOL_ID,
        prompt: unit.prompt,
        references: unit.references,
        count: Number(unit.snapshot.outputNum) || 1,
        fields: { ...unit.fields, ...(options.draftRevision !== undefined ? { draftRevision: options.draftRevision } : {}) },
    };
}

/** 提交守卫：少一张参考图、少一个字段、落位不合法，都在发请求前拦住。 */
export function assertReplaceGoodsInput(input: BrowserToolInput): void {
    const references = input.references ?? [];
    if (references.length !== 4) {
        throw new ReplaceGoodsAdapterError("references-missing", "商品替换必须提交 4 张参考图（场景/商品/落位导引/保护蒙版）");
    }
    const missingRef = references.find((reference) => !reference.dataUrl);
    if (missingRef) throw new ReplaceGoodsAdapterError("reference-empty", `参考图 ${missingRef.name || missingRef.id} 没有图片数据`);
    if (!input.prompt || !input.prompt.trim()) throw new ReplaceGoodsAdapterError("prompt-missing", "替换指令为空");
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const missing = missingReplaceGoodsFields(fields);
    if (missing.length > 0) throw new ReplaceGoodsAdapterError("fields-missing", `请求缺少字段：${missing.join(", ")}`);
    const point = fields.point as { x?: unknown; y?: unknown } | undefined;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        throw new ReplaceGoodsAdapterError("point-invalid", "商品落位中心必须是 0–1 归一化坐标");
    }
    const scale = Number(fields.scale);
    if (!Number.isFinite(scale) || scale <= 0) throw new ReplaceGoodsAdapterError("scale-invalid", "商品缩放比例不合法");
    const maskUrl = String(fields.maskUrl ?? "");
    if (!maskUrl.startsWith("data:image") && !/^https?:/.test(maskUrl)) {
        throw new ReplaceGoodsAdapterError("mask-invalid", "保护蒙版不是有效的图片地址");
    }
    if (String(fields.targetImageUrl) === String(fields.sourceImageUrl)) {
        throw new ReplaceGoodsAdapterError("same-image", "替换商品与参考场景是同一张图，请上传不同的商品图");
    }
    const count = Number(input.count ?? 1);
    if (!Number.isFinite(count) || count < 1 || count > 4) throw new ReplaceGoodsAdapterError("count-invalid", "生成数量需在 1–4 之间");
}

/* ------------------------------------------------------------------ *
 * 真实运行端口（共享 TaskGateway），失败不造假
 * ------------------------------------------------------------------ */

export type ReplaceGoodsRunPort = {
    run: (input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type ReplaceGoodsUnitOutcome = {
    unitId: string;
    snapshotHash: string;
    status: "succeeded" | "failed" | "cancelled" | "unknown";
    task: ToolTask;
    images: { url?: string; dataUrl?: string }[];
    error?: { code: string; message: string };
};

/** 任务 → 单元结果。上游成功但无图 → failed(empty-result)，绝不补图。 */
export function replaceGoodsOutcomeFromTask(unit: ReplaceGoodsUnit, task: ToolTask): ReplaceGoodsUnitOutcome {
    const base = { unitId: unit.id, snapshotHash: unit.snapshotHash, task };
    // 结果项的 kind 只在上游成功时写入；url 形态 / 历史恢复的项可能缺 kind，
    // 直接按 kind === "image" 过滤会把真实出图判成 empty-result（结果区静默清空）。
    const images = (task.result?.items ?? [])
        .map((item) => withDerivedKind(item))
        .filter((item) => item.kind === "image" && hasUsablePayload(item))
        .map((item) => ({ url: item.url, dataUrl: item.dataUrl }));
    if (task.status === "succeeded") {
        if (images.length === 0) return { ...base, status: "failed", images, error: { code: "empty-result", message: "上游返回成功但没有图片结果" } };
        return { ...base, status: "succeeded", images };
    }
    if (task.status === "failed") {
        return { ...base, status: "failed", images, error: task.error ? { code: task.error.code, message: task.error.message } : { code: "task-failed", message: "任务失败（上游未给出原因）" } };
    }
    if (task.status === "cancelled") return { ...base, status: "cancelled", images, error: { code: "cancelled", message: "任务已取消" } };
    return { ...base, status: "unknown", images, error: { code: `task-${task.status}`, message: "任务状态未知，只能查询或人工确认" } };
}

export async function runReplaceGoodsUnit(port: ReplaceGoodsRunPort, unit: ReplaceGoodsUnit, options: { draftRevision?: number | string | null; signal?: AbortSignal } = {}): Promise<ReplaceGoodsUnitOutcome> {
    const input = buildReplaceGoodsInput(unit, { draftRevision: options.draftRevision });
    assertReplaceGoodsInput(input);
    const task = await port.run(input, { signal: options.signal });
    return replaceGoodsOutcomeFromTask(unit, task);
}

/** 失败重试：用同一份单元快照重新发一次真实请求，不复制上次结果。 */
export async function retryReplaceGoodsUnit(port: ReplaceGoodsRunPort, unit: ReplaceGoodsUnit, options: { draftRevision?: number | string | null; signal?: AbortSignal } = {}) {
    return runReplaceGoodsUnit(port, unit, options);
}

/* ------------------------------------------------------------------ *
 * 结果视图（UI 用）
 * ------------------------------------------------------------------ */

export type ReplaceGoodsResultView = {
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    images: { url?: string; dataUrl?: string }[];
    /** 提交时的场景图，用于前后对照。 */
    sourceUrl?: string;
    /** 结果相对当前配置是否已过期（“来自旧版本”）。 */
    stale: boolean;
    snapshotHash?: string;
    error?: { code: string; message: string };
};

export function replaceGoodsResultView(options: {
    unit: ReplaceGoodsUnit | null;
    outcome: ReplaceGoodsUnitOutcome | null;
    currentHash?: string;
}): ReplaceGoodsResultView {
    const { unit, outcome } = options;
    if (!unit || !outcome) return { status: "idle", images: [], stale: false };
    const currentHash = options.currentHash ?? unit.snapshotHash;
    return {
        status: outcome.status,
        images: outcome.images,
        sourceUrl: unit.snapshot.sourceUrl || unit.snapshot.sourceOriginUrl,
        stale: currentHash !== outcome.snapshotHash,
        snapshotHash: outcome.snapshotHash,
        error: outcome.error,
    };
}
