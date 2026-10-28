import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    MATERIAL_FIELDS,
    MATERIAL_UPLOAD,
    MATERIAL_UPPER_BODY_TOOL_ID,
    buildMaterialPrompt,
    computeMaterialOutput,
    createMaterialSnapshot,
    isMaterialRegionUsable,
    linkMaterialValues,
    materialCategoryIdsOf,
    materialCategoryNameOf,
    materialLeafId,
    materialRegionArea,
    materialSubTypeOf,
    clampMaterialRegion,
    resolveMaterialCapability,
    validateMaterialState,
    type MaterialCapability,
    type MaterialIssue,
    type MaterialRegion,
    type MaterialSnapshot,
    type MaterialValues,
} from "@/features/tools/registry/material-upper-body";

/**
 * TASK-037 / MATERIAL_UPPER_BODY（上装换料）——提交侧适配层。
 *
 * 与 AI_WEARABLE 的关键差异（不要照抄）：
 * - 只有 1 个必填图字段 imageUrl；isMatting 是**只有开关**的字段，chunk 未给出蒙版字段，
 *   因此本工具**不伪造 mask 字段**：抠图开启时把导出的蒙版 PNG 作为**第二张参考图**真实提交，
 *   让蒙版像素真的到达 provider（fields 只参与指纹，见 gateway.ts 注释）。
 * - 7 个字段必须全部落位；缺任何一个都在提交前抛出，避免“静默丢参”。
 */

export class MaterialUpperBodyAdapterError extends Error {
    readonly code: string;
    readonly issues: MaterialIssue[];
    constructor(code: string, message: string, issues: MaterialIssue[] = []) {
        super(message);
        this.name = "MaterialUpperBodyAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/* ============================== 源资产 ============================== */

export type MaterialSourceAsset = {
    assetId: string;
    name: string;
    width?: number;
    height?: number;
    mimeType?: string;
    bytes?: number;
    url: string;
    dataUrl?: string;
};

export function materialSourceFromRecord(record: ToolAssetRecord): MaterialSourceAsset {
    return {
        assetId: record.id,
        name: record.name,
        width: record.width,
        height: record.height,
        mimeType: record.mimeType,
        bytes: record.bytes,
        url: record.url,
    };
}

export function isMaterialSourceReady(source?: MaterialSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://") || src.startsWith("blob:");
}

export function toMaterialReference(source: MaterialSourceAsset): ReferenceImage {
    if (!isMaterialSourceReady(source)) {
        throw new MaterialUpperBodyAdapterError("source-missing", "上装图片不可读，请重新上传。");
    }
    return {
        id: source.assetId,
        name: source.name || `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        dataUrl: source.dataUrl ?? source.url ?? "",
        ...(source.url && !source.url.startsWith("data:") ? { url: source.url } : {}),
    };
}

/** fields 里的图片引用：优先 http(s) URL，其次本地资产 ID；data URL 不写进 fields（避免污染指纹）。 */
export function materialImageRef(source: MaterialSourceAsset): string {
    const url = (source.url ?? "").trim();
    if (url.startsWith("https://") || url.startsWith("http://")) return url;
    return source.assetId.trim();
}

/** 与 registry 上传限制同源，失败信息定位到具体文件尺寸。 */
export function validateMaterialSourceSize(source: MaterialSourceAsset): { ok: true } | { ok: false; message: string } {
    const width = source.width ?? 0;
    const height = source.height ?? 0;
    if (!width || !height) return { ok: true };
    if (width < MATERIAL_UPLOAD.minSide || height < MATERIAL_UPLOAD.minSide) {
        return { ok: false, message: `短边需 ≥ ${MATERIAL_UPLOAD.minSide}px，当前 ${width}×${height}` };
    }
    if (width > MATERIAL_UPLOAD.maxSide || height > MATERIAL_UPLOAD.maxSide) {
        return { ok: false, message: `长边需 ≤ ${MATERIAL_UPLOAD.maxSide}px，当前 ${width}×${height}` };
    }
    return { ok: true };
}

/* ============================== 蒙版 ============================== */

export type MaterialMaskSize = { width: number; height: number };

export function materialMaskSizeFor(source: MaterialSourceAsset): MaterialMaskSize {
    return { width: Math.round(source.width ?? 1024), height: Math.round(source.height ?? 1024) };
}

export type MaterialMaskSpec = { cx: number; cy: number; rx: number; ry: number; area: number; region: MaterialRegion };

/** 归一化椭圆 → 原图像素；区域退化时抛错，绝不导出 1×1 的空蒙版。 */
export function materialMaskSpec(region: MaterialRegion, size: MaterialMaskSize): MaterialMaskSpec {
    const safe = clampMaterialRegion(region);
    if (!isMaterialRegionUsable(safe)) {
        throw new MaterialUpperBodyAdapterError("mask-degenerate", "上装蒙版区域太小，请放大后再提交。");
    }
    return {
        cx: safe.cx * size.width,
        cy: safe.cy * size.height,
        rx: safe.rx * size.width,
        ry: safe.ry * size.height,
        area: materialRegionArea(safe),
        region: safe,
    };
}

type CanvasLike = {
    width?: number;
    height?: number;
    getContext: (type: "2d") => {
        fillStyle: string;
        clearRect: (x: number, y: number, w: number, h: number) => void;
        beginPath: () => void;
        ellipse: (x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number) => void;
        fill: () => void;
        drawImage?: (image: unknown, dx: number, dy: number, dw: number, dh: number) => void;
        globalCompositeOperation?: string;
    } | null;
    toBlob?: (callback: (blob: Blob | null) => void, type?: string) => void;
    convertToBlob?: () => Promise<Blob>;
};

type CanvasFactory = (size: MaterialMaskSize) => CanvasLike | null;

function createBrowserCanvas(size: MaterialMaskSize): CanvasLike | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    return canvas as unknown as CanvasLike;
}

/**
 * 渲染蒙版 PNG：与常见 inpaint 约定一致（黑底 + 白色椭圆），尺寸与原图一致。
 * 无 DOM 时抛 canvas-unavailable，绝不返回假图。
 */
export async function renderMaterialMaskBlob(
    region: MaterialRegion,
    size: MaterialMaskSize,
    createCanvas: CanvasFactory = createBrowserCanvas,
): Promise<Blob> {
    const spec = materialMaskSpec(region, size);
    const canvas = createCanvas(size);
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
        throw new MaterialUpperBodyAdapterError("canvas-unavailable", "当前环境无法绘制蒙版（需要浏览器 Canvas）。");
    }
    context.fillStyle = "#000000";
    context.clearRect(0, 0, size.width, size.height);
    context.beginPath();
    context.ellipse(spec.cx, spec.cy, spec.rx, spec.ry, 0, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    if (canvas.convertToBlob) return canvas.convertToBlob();
    if (canvas.toBlob) {
        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob?.(
                (blob) => (blob ? resolve(blob) : reject(new MaterialUpperBodyAdapterError("mask-encode-failed", "蒙版 PNG 编码失败。"))),
                "image/png",
            );
        });
    }
    throw new MaterialUpperBodyAdapterError("canvas-unavailable", "当前环境无法导出蒙版 PNG。");
}

export async function renderMaterialMaskDataUrl(
    region: MaterialRegion,
    size: MaterialMaskSize,
    createCanvas: CanvasFactory = createBrowserCanvas,
): Promise<string> {
    const blob = await renderMaterialMaskBlob(region, size, createCanvas);
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new MaterialUpperBodyAdapterError("mask-read-failed", "蒙版读取失败。"));
        reader.readAsDataURL(blob);
    });
}

/* ============================== 字段 ============================== */

export type MaterialMaskRef = { assetId: string; name: string; mimeType?: string; url: string; dataUrl?: string; width?: number; height?: number };

export type BuildMaterialFieldsInput = {
    values: MaterialValues;
    capability: MaterialCapability;
    source: MaterialSourceAsset;
    /** isMatting 打开时必须给出真实蒙版资产引用。 */
    mask?: MaterialMaskRef | null;
};

/** 组装 7 个提交字段；缺字段/不可达一律抛错（防“提交成功但字段丢了”）。 */
export function buildMaterialFields(input: BuildMaterialFieldsInput): Record<string, unknown> {
    const { values, source, mask } = input;
    if (!isMaterialSourceReady(source)) {
        throw new MaterialUpperBodyAdapterError("source-missing", "上装图片不可读，请重新上传。");
    }
    const categoryIds = materialCategoryIdsOf(values);
    const categoryName = materialCategoryNameOf(values);
    const subType = materialSubTypeOf(values);
    if (!categoryIds || !subType) {
        throw new MaterialUpperBodyAdapterError("category-missing", "材质类目未选择或不属于本地目录，无法提交。");
    }
    // 每个 leaf 都必须能映射到目录 id，否则说明 values 被外部写脏了。
    for (const leafKey of values.leafKeys) {
        if (!materialLeafId(values.categoryKey, leafKey)) {
            throw new MaterialUpperBodyAdapterError("category-unknown", `材质子类「${leafKey}」不在本地目录内，无法提交。`);
        }
    }
    if (values.isMatting && !mask?.assetId) {
        throw new MaterialUpperBodyAdapterError("mask-missing", "已开启抠图，但蒙版尚未生成，请重试导出。");
    }
    return {
        categoryIds,
        categoryName,
        imageName: values.imageName.trim() || source.name || `${source.assetId}.png`,
        imageUrl: materialImageRef(source),
        isMatting: values.isMatting,
        outputNum: values.outputNum,
        subType,
    } satisfies Record<(typeof MATERIAL_FIELDS)[number], unknown>;
}

/** 提交前守卫：7 字段齐、prompt 非空、参考图至少 1 张、count 与 outputNum 一致。 */
export function assertMaterialInput(input: BrowserToolInput, build: BuildMaterialFieldsInput, expectedCount?: number): void {
    const fields = input.fields ?? {};
    // 字段“存在但为 undefined/null”同样等于丢失：JSON 序列化后会直接消失，必须在提交前拦住。
    const missing = MATERIAL_FIELDS.filter((field) => fields[field] === undefined || fields[field] === null);
    if (missing.length) {
        throw new MaterialUpperBodyAdapterError("field-missing", `提交字段缺失：${missing.join("、")}`);
    }
    if (!input.prompt || !input.prompt.trim()) {
        throw new MaterialUpperBodyAdapterError("prompt-missing", "换料指令为空，无法提交。");
    }
    const references = input.references ?? [];
    if (!references.length) {
        throw new MaterialUpperBodyAdapterError("reference-missing", "至少需要 1 张上装参考图。");
    }
    if (build.values.isMatting && references.length < 2) {
        throw new MaterialUpperBodyAdapterError("mask-not-attached", "已开启抠图，但蒙版参考图没有随提交一起发出。");
    }
    const count = expectedCount ?? build.values.outputNum;
    if (input.count !== count) {
        throw new MaterialUpperBodyAdapterError("count-mismatch", `提交张数 ${input.count ?? "未设置"} 与选择的 ${count} 张不一致。`);
    }
}

/* ============================== 提交 ============================== */

export type MaterialGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunMaterialUpperBodyOptions = {
    gateway: MaterialGatewayLike;
    values: MaterialValues;
    capability: MaterialCapability;
    source: MaterialSourceAsset;
    mask?: MaterialMaskRef | null;
    modelOverride?: string;
    revision?: number | string | null;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type MaterialRun = {
    task: ToolTask;
    snapshot: MaterialSnapshot;
    capability: MaterialCapability;
    values: MaterialValues;
    changes: string[];
};

const isTerminal = (status: ToolTask["status"]) => status === "succeeded" || status === "failed" || status === "unknown";

type Prepared = { values: MaterialValues; changes: string[]; input: BrowserToolInput; snapshot: MaterialSnapshot };

function prepare(options: RunMaterialUpperBodyOptions): Prepared {
    const linked = linkMaterialValues(options.values);
    const values = linked.values;
    const issues = validateMaterialState({
        values,
        capability: options.capability,
        sourceReady: isMaterialSourceReady(options.source),
        sourceSize: options.source,
    });
    if (issues.length) {
        throw new MaterialUpperBodyAdapterError("validation-failed", issues.map((issue) => issue.message).join("；"), issues);
    }
    const sizeCheck = validateMaterialSourceSize(options.source);
    if (!sizeCheck.ok) {
        throw new MaterialUpperBodyAdapterError("source-size", sizeCheck.message, [{ field: "imageUrl", message: sizeCheck.message }]);
    }
    const build: BuildMaterialFieldsInput = { values, capability: options.capability, source: options.source, mask: options.mask ?? null };
    const prompt = buildMaterialPrompt(values, options.capability);
    const references = [toMaterialReference(options.source)];
    if (values.isMatting && options.mask) {
        references.push(toMaterialReference({ assetId: options.mask.assetId, name: options.mask.name, url: options.mask.url, dataUrl: options.mask.dataUrl, mimeType: options.mask.mimeType, width: options.mask.width, height: options.mask.height }));
    }
    const input: BrowserToolInput = {
        toolId: MATERIAL_UPPER_BODY_TOOL_ID,
        prompt,
        references,
        count: values.outputNum,
        fields: buildMaterialFields(build),
    };
    assertMaterialInput(input, build);
    return { values, changes: linked.changes, input, snapshot: createMaterialSnapshot(values, options.capability, options.revision ?? null) };
}

/** 联动收敛 → 校验 → 防丢参守卫 → 真实提交 → 等结果。 */
export async function runMaterialUpperBody(options: RunMaterialUpperBodyOptions): Promise<MaterialRun> {
    const { gateway, signal, onUpdate, wait, modelOverride } = options;
    const prepared = prepare(options);
    const submitted = await gateway.submit(
        { ...prepared.input, ...(modelOverride ? { model: modelOverride } : {}) },
        { signal, draftRevision: prepared.snapshot.revision },
    );
    onUpdate?.(submitted);
    const settle = (task: ToolTask): MaterialRun => ({ task, snapshot: prepared.snapshot, capability: options.capability, values: prepared.values, changes: prepared.changes });
    if (isTerminal(submitted.status)) return settle(submitted);
    const final = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate, draftRevision: prepared.snapshot.revision });
    return settle(final);
}

export type RetryMaterialOptions = Omit<RunMaterialUpperBodyOptions, "onUpdate"> & { taskId: string };

/** 按同一配置快照重试（值来自快照恢复后的 values）。 */
export async function retryMaterialUpperBody(options: RetryMaterialOptions): Promise<MaterialRun> {
    const { gateway, taskId } = options;
    if (!gateway.retry) throw new MaterialUpperBodyAdapterError("retry-unsupported", "当前网关不支持重试，请新建任务。");
    const prepared = prepare(options);
    const retried = await gateway.retry(taskId, { ...prepared.input, ...(options.modelOverride ? { model: options.modelOverride } : {}) }, {
        signal: options.signal,
        draftRevision: prepared.snapshot.revision,
    });
    return { task: retried, snapshot: prepared.snapshot, capability: options.capability, values: prepared.values, changes: prepared.changes };
}

/** 单件重试：只重跑失败的那一张，按位置合并，已成功的格子不重复生成。 */
export function mergeMaterialVariant(previous: ToolTask, variant: ToolTask, index: number): ToolTask {
    const items = [...(previous.result?.items ?? [])];
    const next = variant.result?.items?.[0];
    if (!next) return previous;
    items[index] = next;
    return {
        ...previous,
        status: variant.status,
        error: variant.error,
        result: { ...(previous.result ?? { kind: "image" as const, items: [] }), items },
    } as ToolTask;
}

/* ============================== 结果 ============================== */

export function materialResultItems(task?: ToolTask | null): ToolTaskResultItem[] {
    return task?.result?.items ?? [];
}

export type MaterialResultCell = { index: number; status: "filled" | "pending" | "failed"; item: ToolTaskResultItem | null };

/** 结果区按“期望张数”铺格子：多出来的不渲染，缺的显示 pending，失败的保留错误位。 */
export function materialResultCells(task: ToolTask | undefined, expected: number): MaterialResultCell[] {
    const items = materialResultItems(task);
    const total = Math.max(1, Math.min(Math.max(expected, items.length), 8));
    return Array.from({ length: total }, (_, index) => {
        const item = items[index] ?? null;
        const status: MaterialResultCell["status"] = item ? "filled" : task?.status === "failed" ? "failed" : "pending";
        return { index, status, item };
    });
}

export type MaterialResultView = {
    cells: MaterialResultCell[];
    drift?: string;
    isEmpty: boolean;
};

/** 结果视图：任务 + 当前配置快照 → 格子 + 漂移说明（漂移算法在 registry 里）。 */
export function materialResultFromTask(
    task: ToolTask | undefined,
    expected: number,
    describeDrift: () => string | undefined,
): MaterialResultView {
    const cells = materialResultCells(task, expected);
    return { cells, drift: task ? describeDrift() : undefined, isEmpty: !materialResultItems(task).length };
}

/** 提交前的产物说明 + 能力提示（不含任何算力/积分文案）。 */
export function summarizeMaterialExecution(capability: MaterialCapability, values: MaterialValues) {
    const output = computeMaterialOutput(values, capability);
    return {
        executable: capability.executable,
        provider: capability.provider,
        outputOptions: capability.outputOptions,
        expectedOutput: output.expected,
        label: output.label,
        notices: capability.notices,
        missingFields: capability.missingFields,
        canSubmit: capability.executable,
    };
}

export { resolveMaterialCapability, linkMaterialValues, buildMaterialPrompt, createMaterialSnapshot, computeMaterialOutput };
