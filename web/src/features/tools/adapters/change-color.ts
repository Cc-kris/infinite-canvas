import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    CHANGE_COLOR_FIELDS,
    CHANGE_COLOR_TOOL_ID,
    MAX_PALETTE,
    adjustLightValue,
    adjustmentSummary,
    buildChangeColorFields,
    colorParamsValue,
    createChangeColorSnapshot,
    curveDescriptor,
    isChangeColorSnapshotStale,
    isChangeColorSourceReady,
    isHexColor,
    normalizeHex,
    regionDescriptor,
    rgbToHex,
    validateChangeColorSource,
    validateChangeColorState,
    type ChangeColorIssue,
    type ChangeColorSnapshot,
    type ChangeColorSourceMeta,
    type ChangeColorValues,
} from "../registry/change-color";

/**
 * TASK-024：CHANGE_COLOR（一键换色）的真实 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 提交走 TASK-005 的 ToolTaskGateway.submit → services/api/image.ts requestEdit（带参考图即图生图）；
 * - 换色、区域、去杂色、四项细调、光影 / 边缘 / 修复 / 平衡 / 曲线全部写进提示词；
 *   16 个上游字段整体进 `fields`（参与指纹与快照，可审计），不做“UI 上有、请求里没有”的装饰字段；
 * - 蒙版作为额外参考图提交（模型能看到的真实像素证据）；`assertChangeColorInput` 校验它是原图同尺寸导出的 PNG；
 * - 结果只来自 task.result.items，本模块不产生占位图；失败 / 未知原样透出。
 */

export type ChangeColorSourceAsset = ChangeColorSourceMeta;

export class ChangeColorAdapterError extends Error {
    readonly code: string;
    readonly issues: ChangeColorIssue[];
    constructor(code: string, message: string, issues: ChangeColorIssue[] = []) {
        super(message);
        this.name = "ChangeColorAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

export function isChangeColorSourceUsable(source?: ChangeColorSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    if (!isChangeColorSourceReady(source)) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://");
}

export function toChangeColorReference(source: ChangeColorSourceAsset): ReferenceImage {
    if (!isChangeColorSourceUsable(source)) throw new ChangeColorAdapterError("source-missing", "请先上传可用的图片。");
    return {
        id: source.assetId,
        name: source.name ?? `${source.assetId}.png`,
        type: source.mimeType ?? "image/png",
        dataUrl: source.dataUrl ?? source.url ?? "",
        ...(source.url && !source.url.startsWith("data:") ? { url: source.url } : {}),
    };
}

/** 蒙版参考：只有真的画了选区才提交，绝不把原图当蒙版充数。 */
export function toMaskReference(maskUrl: string | undefined): ReferenceImage | undefined {
    const value = (maskUrl ?? "").trim();
    if (!value) return undefined;
    if (!value.startsWith("data:image/") && !value.startsWith("https://") && !value.startsWith("http://")) return undefined;
    return {
        id: "change-color-mask",
        name: "region-mask.png",
        type: value.startsWith("data:") ? value.slice(5, value.indexOf(";")) || "image/png" : "image/png",
        dataUrl: value,
        ...(value.startsWith("http") ? { url: value } : {}),
    };
}

/* ============================== 提示词 ============================== */

/**
 * 提示词是本页唯一能表达“细调 / 光影”的通道（gateway 不转发工具字段给 provider），
 * 所以每一项都必须在这里出现，并且用可判定的措辞，方便测试逐项断言。
 */
export function buildChangeColorPrompt(values: ChangeColorValues, source: ChangeColorSourceAsset): string {
    const hex = normalizeHex(values.targetColor) ?? "";
    const rgb = hex ? `rgb(${[1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(", ")})` : "";
    const region = regionDescriptor(values);
    const lines: string[] = [];

    lines.push(
        `只对图中的「${region}」做换色：把该区域的颜色改为 ${hex}${rgb ? `（${rgb}）` : ""}，保持原有明暗过渡、褶皱、纹理与材质反光。`,
    );
    if (values.doInpaint) {
        lines.push("局部重绘已开启：只重绘蒙版覆盖的像素，蒙版外的一切保持不变。");
    } else {
        lines.push("只做颜色替换，不重绘、不新增或删除任何物体。");
    }
    lines.push("未选中的区域、背景、人物皮肤与五官保持完全不变；不要改变构图、视角、比例与阴影方向。");
    lines.push(values.removeNoise ? "去除杂色：清除原颜色残留的边缘杂边与色溢，色块边缘干净。" : "保留原色中的细微色差与噪点，不做额外去杂色。");

    if (values.adjustment.hue || values.adjustment.saturation || values.adjustment.brightness || values.adjustment.contrast) {
        lines.push(
            [
                "换色后做如下细调（相对新颜色）：",
                `色调 ${values.adjustment.hue >= 0 ? "+" : ""}${values.adjustment.hue}°`,
                `饱和度 ${values.adjustment.saturation >= 0 ? "+" : ""}${values.adjustment.saturation}`,
                `亮度 ${values.adjustment.brightness >= 0 ? "+" : ""}${values.adjustment.brightness}`,
                `对比度 ${values.adjustment.contrast >= 0 ? "+" : ""}${values.adjustment.contrast}`,
                "；细调只作用于换色区域。",
            ].join(""),
        );
    } else {
        lines.push("颜色细调保持默认（色调 0、饱和度 0、亮度 0、对比度 0）。");
    }

    if (values.light.enabled) {
        lines.push(`光影优化强度 ${values.light.strength}/100：让新颜色与原图光照方向、高光与阴影自然一致。`);
    } else {
        lines.push("光影优化关闭：沿用原图光照，不额外重打光。");
    }
    lines.push(values.light.edge ? "边缘优化开启：色块与相邻区域的交界过渡自然、不出现硬边或锯齿。" : "边缘优化关闭：不做额外边缘柔化。");
    lines.push(values.light.edgeRepair ? "颜色边缘修复开启：修掉换色边缘的溢色与白边。" : "颜色边缘修复关闭：不做边缘溢色修复。");
    if (values.light.balance !== 0) {
        lines.push(`色彩平衡 ${values.light.balance > 0 ? "+" : ""}${values.light.balance}：正值偏暖、负值偏冷，仅作用于换色区域。`);
    }
    lines.push(`曲线：${curveDescriptor(values.light.curve)}。`);
    if (values.light.curve !== "linear") {
        lines.push("曲线仅影响换色区域的明暗响应，不改变整体白平衡。");
    }

    lines.push(`源图：${source.name ?? source.assetId}（${source.width ?? 0}×${source.height ?? 0}）。`);
    lines.push("输出：与原图同尺寸、同构图的单张图片。");
    return lines.join("\n");
}

/* ============================== 请求组装 ============================== */

export type BuildChangeColorInputOptions = {
    values: ChangeColorValues;
    source: ChangeColorSourceAsset;
    /** 区域蒙版（PNG data URL / URL），由工作区导出；用于 imageMaskUrl / imageSegUrl 与蒙版参考。 */
    maskUrl?: string;
    /** 颜色参考图 URL（可选）。 */
    referenceUrl?: string;
    /** 颜色参考图资产 id（只用于展示，不进上游字段）。 */
    referenceAssetId?: string;
    model?: string;
    /** 由调用方传入真实模型就绪状态；缺省为 true（单独调用组装函数时不重复卡模型）。 */
    imageModelReady?: boolean;
    draftRevision?: number | string | null;
};

export function buildChangeColorInput(options: BuildChangeColorInputOptions): BrowserToolInput {
    const { values, source, maskUrl, referenceUrl, model, imageModelReady = true, draftRevision = null } = options;
    if (!isChangeColorSourceUsable(source)) throw new ChangeColorAdapterError("source-missing", "请先上传图片。");

    const sourceCheck = validateChangeColorSource(source);
    if (!sourceCheck.ok) throw new ChangeColorAdapterError(sourceCheck.code ?? "source-invalid", sourceCheck.message ?? "图片不合法。");

    const issues = validateChangeColorState({
        values,
        sourceReady: isChangeColorSourceReady(source),
        imageModelReady,
        maskReady: Boolean(toMaskReference(maskUrl)),
    });
    if (issues.length) throw new ChangeColorAdapterError("invalid-config", issues[0].message, issues);

    const fields = buildChangeColorFields(values, { source, maskUrl, referenceUrl });
    const references: ReferenceImage[] = [toChangeColorReference(source)];
    const mask = toMaskReference(maskUrl);
    if (mask) references.push(mask);

    return {
        toolId: CHANGE_COLOR_TOOL_ID,
        prompt: buildChangeColorPrompt(values, source),
        references,
        ...(model && model.trim() ? { model: model.trim() } : {}),
        // 换色是单图单结果：一次提交只产出一张，数量写死 1，不跟批量混在一起。
        count: 1,
        fields,
    };
}

/** 提交前的“无丢参”守卫：16 个字段齐、值对得上、提示词确实带上了目标色与区域。 */
export function assertChangeColorInput(input: BrowserToolInput, values: ChangeColorValues, source: ChangeColorSourceAsset): void {
    const problems: string[] = [];
    if (input.toolId !== CHANGE_COLOR_TOOL_ID) problems.push(`toolId 必须是 ${CHANGE_COLOR_TOOL_ID}`);
    if (input.count !== 1) problems.push("一键换色一次只产出一张结果");

    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const missing = CHANGE_COLOR_FIELDS.filter((field) => !(field in fields));
    if (missing.length) problems.push(`字段缺失：${missing.join("、")}`);

    const hex = normalizeHex(values.targetColor) ?? "";
    if (hex && fields.colorParams !== colorParamsValue(hex)) problems.push("目标色未进入 colorParams");
    if (!hex && fields.colorParams) problems.push("未选色却发出了 colorParams");

    const region = regionDescriptor(values);
    if (!region) problems.push("区域描述为空");
    if (region && !input.prompt?.includes(region)) problems.push("提示词未携带选区描述");
    if (hex && !input.prompt?.includes(hex)) problems.push("提示词未携带目标色");
    if (fields.adjustLight !== adjustLightValue(values.light)) problems.push("光影开关/强度未进入 adjustLight");
    if (Boolean(fields.doInpaint) !== values.doInpaint) problems.push("局部重绘开关未进入 doInpaint");
    if (Number(fields.imageWidth) !== Number(source.width ?? 0) || Number(fields.imageHeight) !== Number(source.height ?? 0)) {
        problems.push("图片宽高字段与源图元数据不一致");
    }
    if (Number(fields.imageSize) !== Number(source.bytes ?? 0)) problems.push("文件体积字段与源图元数据不一致");
    if (!fields.imageUrl || fields.imageUrl !== fields.sourceImageUrl) problems.push("imageUrl / sourceImageUrl 必须指向同一张源图");
    if (!fields.name) problems.push("任务名称缺失（name）");
    if (!fields.imageTagData || typeof fields.imageTagData !== "object") problems.push("图片标签数据缺失（imageTagData）");

    if (values.doInpaint && !fields.imageMaskUrl) problems.push("局部重绘缺少区域蒙版 imageMaskUrl");
    if (!input.references?.length) problems.push("缺少源图参考");
    if (values.doInpaint && (input.references?.length ?? 0) < 2) problems.push("局部重绘的蒙版参考未提交");

    const adjustmentText = adjustmentSummary(values.adjustment);
    if (adjustmentText !== "默认（无微调）") {
        for (const token of adjustmentText.split(" · ")) {
            if (!input.prompt?.includes(token)) problems.push(`提示词缺少细调项：${token}`);
        }
    }

    if (problems.length) throw new ChangeColorAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
}

/* ============================== 执行 ============================== */

export type ChangeColorGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunChangeColorOptions = {
    gateway: ChangeColorGatewayLike;
    values: ChangeColorValues;
    source: ChangeColorSourceAsset;
    maskUrl?: string;
    referenceUrl?: string;
    model?: string;
    revision?: number | string | null;
    imageModelReady?: boolean;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    wait?: WaitOptions;
};

export type ChangeColorRun = { task: ToolTask; snapshot: ChangeColorSnapshot };

function terminal(status: ToolTask["status"]): boolean {
    return status === "succeeded" || status === "failed" || status === "cancelled" || status === "unknown";
}

export async function runChangeColor(options: RunChangeColorOptions): Promise<ChangeColorRun> {
    const { gateway, values, source, maskUrl, referenceUrl, model, revision = null, imageModelReady = true, signal, onUpdate, wait } = options;

    const issues = validateChangeColorState({
        values,
        sourceReady: isChangeColorSourceReady(source),
        imageModelReady,
        maskReady: Boolean(toMaskReference(maskUrl)),
    });
    if (issues.length) throw new ChangeColorAdapterError("invalid-config", issues[0].message, issues);

    const sourceCheck = validateChangeColorSource(source);
    if (!sourceCheck.ok) throw new ChangeColorAdapterError(sourceCheck.code ?? "source-invalid", sourceCheck.message ?? "图片不合法。");

    const input = buildChangeColorInput({ values, source, maskUrl, referenceUrl, model, draftRevision: revision });
    assertChangeColorInput(input, values, source);
    const snapshot = createChangeColorSnapshot(values, { source, maskUrl, referenceUrl }, revision);

    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onUpdate?.(submitted);
    if (terminal(submitted.status)) return { task: submitted, snapshot };

    const task = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
    return { task, snapshot };
}

export async function retryChangeColor(options: RunChangeColorOptions & { taskId: string }): Promise<ChangeColorRun> {
    const { gateway, values, source, maskUrl, referenceUrl, model, revision = null, signal, onUpdate, taskId, wait } = options;
    const input = buildChangeColorInput({ values, source, maskUrl, referenceUrl, model, draftRevision: revision });
    assertChangeColorInput(input, values, source);
    const snapshot = createChangeColorSnapshot(values, { source, maskUrl, referenceUrl }, revision);

    if (!gateway.retry) {
        const submitted = await gateway.submit(input, { signal, draftRevision: revision });
        onUpdate?.(submitted);
        if (terminal(submitted.status)) return { task: submitted, snapshot };
        const task = await gateway.waitForResult(submitted.id, { ...wait, signal, onUpdate });
        return { task, snapshot };
    }
    const retried = await gateway.retry(taskId, input, { ...wait, signal, draftRevision: revision, onUpdate });
    return { task: retried, snapshot };
}

/* ============================== 结果 ============================== */

export type ChangeColorResultView = {
    image?: string;
    stale: boolean;
    status: ToolTask["status"] | "idle";
    error?: string;
};

function itemSource(item: ToolTaskResultItem): string | undefined {
    return item.dataUrl ?? item.url ?? undefined;
}

export function firstChangeColorResult(task: ToolTask | undefined): string | undefined {
    const items = task?.result?.items ?? [];
    for (const item of items) {
        const src = itemSource(item);
        if (src) return src;
    }
    return undefined;
}

/** 结果是否属于当前配置：换源图/改色/改区域后旧结果必须自报“来自旧版本”。 */
export function changeColorResultFromTask(
    task: ToolTask | undefined,
    snapshot: ChangeColorSnapshot | undefined,
    current: ChangeColorSnapshot | undefined,
): ChangeColorResultView {
    if (!task) return { stale: false, status: "idle" };
    return {
        image: firstChangeColorResult(task),
        stale: isChangeColorSnapshotStale(snapshot, current),
        status: task.status,
        ...(task.error?.message ? { error: task.error.message } : {}),
    };
}

/* ============================== 颜色参考图提色 ============================== */

/**
 * 颜色参考图 → 色卡：真实像素采样（等距网格 + 量化计数 + 感知去重），不是预设调色板。
 * 浏览器不支持 canvas / 图片加载失败时返回空数组，由 UI 说明“提色失败”，不伪造色卡。
 */
export async function samplePaletteFromImage(src: string, limit = MAX_PALETTE): Promise<string[]> {
    if (!src) return [];
    if (typeof document === "undefined") return [];
    try {
        const image = await new Promise<HTMLImageElement | null>((resolve) => {
            const element = new Image();
            element.crossOrigin = "anonymous";
            element.onload = () => resolve(element);
            element.onerror = () => resolve(null);
            element.src = src;
        });
        if (!image) return [];

        const canvas = document.createElement("canvas");
        const side = 64;
        canvas.width = side;
        canvas.height = side;
        const context = canvas.getContext("2d");
        if (!context) return [];
        context.drawImage(image, 0, 0, side, side);
        const { data } = context.getImageData(0, 0, side, side);

        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
        for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3];
            if (alpha < 128) continue;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            // 量化到 24 级，抗噪点；再按出现次数挑主色。
            const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
            const bucket = buckets.get(key);
            if (bucket) {
                bucket.count += 1;
                bucket.r += r;
                bucket.g += g;
                bucket.b += b;
            } else {
                buckets.set(key, { count: 1, r, g, b });
            }
        }

        const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
        const picked: string[] = [];
        for (const bucket of sorted) {
            const hex = rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count);
            if (picked.some((existing) => existing === hex)) continue;
            picked.push(hex);
            if (picked.length >= limit) break;
        }
        return picked;
    } catch {
        return [];
    }
}

/** 目标色是否与某个色卡一致（UI 用来给“收藏”打勾）。 */
export function isSwatchActive(swatches: readonly string[], hex: string): boolean {
    return swatches.some((item) => normalizeHex(item) === normalizeHex(hex));
}

export function describeTargetColor(hex: string): string {
    return isHexColor(hex) ? `目标色 ${normalizeHex(hex)}` : "尚未选择颜色";
}
