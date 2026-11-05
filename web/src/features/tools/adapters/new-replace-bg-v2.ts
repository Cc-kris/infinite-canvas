import type { ReferenceImage } from "@/types/image";

import type { BrowserToolInput, SubmitOptions, WaitOptions } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";

import {
    NEW_REPLACE_BG_V2_TOOL_ID,
    SCENE_SOURCE_LIMITS,
    buildNewReplaceBgPrompt,
    buildSceneCanvasData,
    buildSceneImageRecords,
    buildSceneSizeData,
    createNewReplaceBgSnapshot,
    describeNewReplaceBgDrift,
    isNewReplaceBgSnapshotStale,
    resolveCutoutReadiness,
    roundSceneTransform,
    sceneType,
    validateNewReplaceBgState,
    type CutoutReadiness,
    type NewReplaceBgIssue,
    type NewReplaceBgSnapshot,
    type NewReplaceBgValues,
    type SceneCutoutMode,
    type SceneOutput,
} from "../registry/new-replace-bg-v2";

/**
 * TASK-022：NEW_REPLACE_BG_V2（商品图）的真实 provider 适配层。
 *
 * 真实边界（不接受演示成功）：
 * - 提交走 TASK-005 的 ToolTaskGateway.submit → services/api/image.ts；带参考图即走图生图编辑；
 * - 商品图 / 主体蒙版 / 自定义背景作为 references 逐张进入真实请求，顺序固定并在提示词里点名，
 *   避免"传了但模型不知道哪张是哪张"；
 * - 页面画布状态（canvasData / sizeData / imageRecords / sceneType / weight / outputNum）进 fields，
 *   参与去重指纹与 UI 展示；同时关键参数写进提示词，因为 provider 的 NEW_REPLACE_BG_V2 没有独立 make 字段；
 * - `assertNewReplaceBgInput` 提交前逐项断言，任何一项丢失直接抛错，不带降级配置发请求；
 * - 结果只来自 task.result.items；本模块不造占位图，失败 / 未知原样透出。
 */

export type SceneSourceAsset = {
    assetId: string;
    /** data URL 或 http(s) URL；两者都没有视为未就绪。 */
    dataUrl?: string;
    url?: string;
    name?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export class NewReplaceBgAdapterError extends Error {
    readonly code: string;
    readonly issues: NewReplaceBgIssue[];

    constructor(code: string, message: string, issues: NewReplaceBgIssue[] = []) {
        super(message);
        this.name = "NewReplaceBgAdapterError";
        this.code = code;
        this.issues = issues;
    }
}

/* ============================== 素材就绪 ============================== */

export function isSceneSourceReady(source?: SceneSourceAsset | null): boolean {
    if (!source || !source.assetId.trim()) return false;
    const src = source.dataUrl || source.url || "";
    return src.startsWith("data:image/") || src.startsWith("https://") || src.startsWith("http://") || src.startsWith("blob:");
}

export type SceneSourceCheck = { ok: boolean; message?: string };

/** 上传后与提交前的双重校验：格式、体积、像素下限。 */
export function validateSceneSource(source?: SceneSourceAsset | null): SceneSourceCheck {
    if (!source || !source.assetId.trim()) return { ok: false, message: "请先上传商品图。" };
    const mime = (source.mimeType ?? "").toLowerCase();
    if (mime && !(SCENE_SOURCE_LIMITS.mimeTypes as readonly string[]).includes(mime)) {
        return { ok: false, message: `不支持的格式 ${mime}，请用 PNG / JPG / WEBP。` };
    }
    if (source.bytes && source.bytes > SCENE_SOURCE_LIMITS.maxBytes) {
        return { ok: false, message: `文件 ${(source.bytes / 1024 / 1024).toFixed(1)}M 超过 ${Math.round(SCENE_SOURCE_LIMITS.maxBytes / 1024 / 1024)}M 上限。` };
    }
    if (source.width && source.height) {
        const short = Math.min(source.width, source.height);
        const long = Math.max(source.width, source.height);
        if (short < SCENE_SOURCE_LIMITS.minSide) {
            return { ok: false, message: `短边 ${short}px 太小，至少要 ${SCENE_SOURCE_LIMITS.minSide}px。` };
        }
        if (long > SCENE_SOURCE_LIMITS.maxSide) {
            return { ok: false, message: `长边 ${long}px 超过 ${SCENE_SOURCE_LIMITS.maxSide}px 上限。` };
        }
    }
    if (!isSceneSourceReady(source)) return { ok: false, message: "图片数据尚未就绪，请重新上传。" };
    return { ok: true };
}

function toSceneReference(source: SceneSourceAsset, idPrefix: string): ReferenceImage {
    const dataUrl = source.dataUrl || source.url || "";
    return {
        id: source.assetId || `${idPrefix}-asset`,
        name: source.name || `${idPrefix}.png`,
        type: source.mimeType || "image/png",
        dataUrl,
        ...(source.url ? { url: source.url } : {}),
    };
}

/** 参考图顺序：商品原图 → 主体蒙版 → 自定义背景。提示词里按下标点名。 */
export function buildSceneReferences(sources: {
    goods: SceneSourceAsset;
    mask?: SceneSourceAsset | null;
    bg?: SceneSourceAsset | null;
}): ReferenceImage[] {
    const references = [toSceneReference(sources.goods, "goods")];
    if (sources.mask && isSceneSourceReady(sources.mask)) references.push(toSceneReference(sources.mask, "mask"));
    if (sources.bg && isSceneSourceReady(sources.bg)) references.push(toSceneReference(sources.bg, "background"));
    return references;
}

/** 参考图清单的人话说明，同时写进提示词，防止多图时角色错位。 */
export function describeSceneReferences(references: readonly ReferenceImage[]): string {
    const labels: string[] = [];
    references.forEach((reference, index) => {
        const name = (reference.name ?? "").toLowerCase();
        if (name.includes("mask")) labels.push(`参考图 ${index + 1} 是主体蒙版（白色=商品主体，黑色=需要被替换的背景）`);
        else if (name.includes("background") || name.includes("bg")) labels.push(`参考图 ${index + 1} 是目标背景图`);
        else labels.push(`参考图 ${index + 1} 是商品原图`);
    });
    return labels.join("；");
}

/* ============================== 请求组装 ============================== */

export type SceneCutoutSources = { mask?: SceneSourceAsset | null; goodsHasAlpha?: boolean };

export function sceneCutoutReadiness(values: NewReplaceBgValues, sources: SceneCutoutSources): CutoutReadiness {
    return resolveCutoutReadiness(values.cutoutMode, {
        maskReady: Boolean(sources.mask && isSceneSourceReady(sources.mask) && values.maskAssetId),
        goodsHasAlpha: sources.goodsHasAlpha === true,
        confirmed: values.cutoutConfirmed,
    });
}

export function buildSceneFields(
    values: NewReplaceBgValues,
    output: SceneOutput,
    references: readonly ReferenceImage[],
): Record<string, unknown> {
    const canvasData = buildSceneCanvasData(values, output);
    const sizeData = buildSceneSizeData(values, output);
    const imageRecords = buildSceneImageRecords(values);
    return {
        sceneType: values.sceneType,
        templateId: canvasData.templateId,
        weight: Number(values.weight.toFixed(2)),
        outputNum: values.outputNum,
        cutoutMode: values.cutoutMode,
        lockCutout: values.lockCutout,
        withMaterial: values.withMaterial,
        canvasData,
        sizeData,
        imageRecords,
        referenceCount: references.length,
    };
}

export type BuildNewReplaceBgInputOptions = {
    values: NewReplaceBgValues;
    output: SceneOutput;
    goods: SceneSourceAsset;
    mask?: SceneSourceAsset | null;
    bg?: SceneSourceAsset | null;
    model?: string;
    goodsHasAlpha?: boolean;
};

export function buildNewReplaceBgInput({
    values,
    output,
    goods,
    mask,
    bg,
    model,
    goodsHasAlpha,
}: BuildNewReplaceBgInputOptions): BrowserToolInput {
    const sourceCheck = validateSceneSource(goods);
    if (!sourceCheck.ok) throw new NewReplaceBgAdapterError("source-invalid", sourceCheck.message ?? "商品图不合法。");
    if (!output.legal) {
        const first = output.issues[0];
        throw new NewReplaceBgAdapterError("output-invalid", first?.message ?? "输出规格不合法。");
    }

    const cutout = sceneCutoutReadiness(values, { mask, goodsHasAlpha });
    const issues = validateNewReplaceBgState({ values, output, goodsReady: true, cutout, imageModelReady: Boolean(model?.trim()) });
    if (issues.length) {
        throw new NewReplaceBgAdapterError("state-invalid", issues[0].message, issues);
    }

    const references = buildSceneReferences({ goods, mask, bg });
    const prompt = `${buildNewReplaceBgPrompt(values, output)}\n${describeSceneReferences(references)}`;

    return {
        toolId: NEW_REPLACE_BG_V2_TOOL_ID,
        prompt,
        references,
        ...(model && model.trim() ? { model: model.trim() } : {}),
        size: `${output.width}x${output.height}`,
        count: output.count,
        fields: buildSceneFields(values, output, references),
    };
}

/**
 * 防丢参守卫：页面上的每一个合成配置都必须在请求里找到落点。
 * 对不上就抛错，绝不"少一个参数照发"。
 */
export function assertNewReplaceBgInput(
    input: BrowserToolInput,
    values: NewReplaceBgValues,
    output: SceneOutput,
    sources?: { goodsHasAlpha?: boolean },
): void {
    const problems: string[] = [];
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const canvas = fields.canvasData as ReturnType<typeof buildSceneCanvasData> | undefined;
    const size = fields.sizeData as ReturnType<typeof buildSceneSizeData> | undefined;
    const records = fields.imageRecords as ReturnType<typeof buildSceneImageRecords> | undefined;
    const references = input.references ?? [];
    const cutout = resolveCutoutReadiness(values.cutoutMode, {
        maskReady: Boolean(values.maskAssetId) && references.some((item) => item.id === values.maskAssetId),
        goodsHasAlpha: sources?.goodsHasAlpha,
        confirmed: values.cutoutConfirmed,
    });

    if (input.toolId !== NEW_REPLACE_BG_V2_TOOL_ID) problems.push(`toolId 必须是 ${NEW_REPLACE_BG_V2_TOOL_ID}`);
    if (input.size !== `${output.width}x${output.height}`) problems.push(`画布尺寸未进入请求（期望 ${output.width}x${output.height}，实际 ${input.size ?? "空"}）`);
    if (input.count !== output.count) problems.push(`结果数量未进入请求（期望 ${output.count}，实际 ${input.count ?? "空"}）`);
    if (Number(fields.weight) !== Number(values.weight.toFixed(2))) problems.push("背景相似度未进入请求");
    if (String(fields.sceneType ?? "") !== values.sceneType) problems.push("场景类型未进入请求");
    if (!canvas) problems.push("canvasData 未序列化");
    else {
        if (canvas.weight !== values.weight) problems.push("canvasData.weight 与页面不一致");
        if (canvas.sceneType !== values.sceneType) problems.push("canvasData.sceneType 与页面不一致");
        if (canvas.templateId !== (values.sceneType === "recommend" ? values.templateId : "")) problems.push("canvasData.templateId 与页面不一致");
        if (JSON.stringify(canvas.goods) !== JSON.stringify(roundSceneTransform(values.transform))) problems.push("商品位置 / 缩放 / 旋转未进入 canvasData");
        if (canvas.layers.length !== 4) problems.push("canvasData.layers 必须包含背景 / 商品 / 材质 / 锁定四层");
        if (canvas.lockCutout !== values.lockCutout) problems.push("锁定抠图开关未进入 canvasData");
    }
    if (!size) problems.push("sizeData 未序列化");
    else if (size.width !== output.width || size.height !== output.height || size.count !== output.count) problems.push("sizeData 与输出规格不一致");
    if (!records || records.length === 0) problems.push("imageRecords 为空");
    else if (!records.some((item) => item.layer === "goods" && item.assetId === values.goodsAssetId)) problems.push("imageRecords 缺少商品层记录");

    if (!cutout.ready) problems.push(cutout.reason ?? "抠图确认未完成");
    if (values.cutoutMode === "mask" && !references.some((item) => item.id === values.maskAssetId)) problems.push("主体蒙版未作为参考图提交");
    if (values.sceneType === "custom" && values.bgAssetId && !references.some((item) => item.id === values.bgAssetId)) problems.push("自定义背景图未作为参考图提交");
    if (!references.some((item) => item.id === values.goodsAssetId)) problems.push("商品图未作为参考图提交");

    const prompt = input.prompt ?? "";
    if (!prompt.includes(`${Math.round(values.weight * 100)}%`)) problems.push("提示词未携带背景相似度");
    if (!prompt.includes(sceneType(values.sceneType).label)) problems.push("提示词未携带场景类型");
    if (!prompt.includes(`${output.width}×${output.height}`)) problems.push("提示词未携带画布尺寸");
    if (!prompt.includes(`共 ${output.count} 张`)) problems.push("提示词未携带结果数量");
    if (values.sceneType === "custom" && values.customPrompt.trim() && !prompt.includes(values.customPrompt.trim())) problems.push("自定义场景描述未进入提示词");

    if (problems.length) {
        throw new NewReplaceBgAdapterError("param-dropped", `提交参数校验失败：${problems.join("；")}`);
    }
}

/* ============================== 执行 ============================== */

export type NewReplaceBgGatewayLike = {
    submit: (input: BrowserToolInput, options?: SubmitOptions) => Promise<ToolTask>;
    waitForResult: (taskId: string, options?: WaitOptions) => Promise<ToolTask>;
    retry?: (taskId: string, input: BrowserToolInput, options?: WaitOptions) => Promise<ToolTask>;
};

export type RunNewReplaceBgOptions = BuildNewReplaceBgInputOptions & {
    gateway: NewReplaceBgGatewayLike;
    revision?: number | string | null;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
    onSubmitted?: (task: ToolTask) => void;
};

export type NewReplaceBgRun = {
    task: ToolTask;
    input: BrowserToolInput;
    snapshot: NewReplaceBgSnapshot;
};

export async function runNewReplaceBg({ gateway, revision = null, signal, onUpdate, onSubmitted, ...build }: RunNewReplaceBgOptions): Promise<NewReplaceBgRun> {
    const input = buildNewReplaceBgInput(build);
    assertNewReplaceBgInput(input, build.values, build.output, { goodsHasAlpha: build.goodsHasAlpha });
    const snapshot = createNewReplaceBgSnapshot(build.values, build.output, revision);

    const submitted = await gateway.submit(input, { signal, draftRevision: revision });
    onSubmitted?.(submitted);
    onUpdate?.(submitted);
    const task = await gateway.waitForResult(submitted.id, { signal });
    onUpdate?.(task);
    return { task, input, snapshot };
}

export type RetryNewReplaceBgOptions = BuildNewReplaceBgInputOptions & {
    gateway: NewReplaceBgGatewayLike;
    revision?: number | string | null;
    taskId: string;
    signal?: AbortSignal;
    onUpdate?: (task: ToolTask) => void;
};

/** 失败重试：沿用同一份请求（参数不能悄悄变化），由 gateway 重新开始一次任务。 */
export async function retryNewReplaceBg({ gateway, taskId, revision = null, signal, onUpdate, ...build }: RetryNewReplaceBgOptions): Promise<NewReplaceBgRun> {
    if (!gateway.retry) throw new NewReplaceBgAdapterError("retry-unsupported", "当前网关不支持从失败任务重试。");
    const input = buildNewReplaceBgInput(build);
    assertNewReplaceBgInput(input, build.values, build.output, { goodsHasAlpha: build.goodsHasAlpha });
    const snapshot = createNewReplaceBgSnapshot(build.values, build.output, revision);
    const task = await gateway.retry(taskId, input, { signal });
    onUpdate?.(task);
    return { task, input, snapshot };
}

/* ============================== 结果 ============================== */

export type SceneResultImage = ToolTaskResultItem & { dataUrl: string };
export type SceneResultStatus = "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

export type NewReplaceBgResult = {
    status: SceneResultStatus;
    images: SceneResultImage[];
    stale: boolean;
    drift: string;
    error?: string;
};

const RUNNING: readonly string[] = ["queued", "submitting", "running", "polling", "validating"];

export function newReplaceBgResultFromTask(
    task: ToolTask | undefined,
    snapshot: NewReplaceBgSnapshot | undefined,
    current: NewReplaceBgSnapshot | undefined,
    drift = describeNewReplaceBgDrift(snapshot, current),
): NewReplaceBgResult {
    const stale = isNewReplaceBgSnapshotStale(snapshot, current);
    if (!task) return { status: "idle", images: [], stale: false, drift: "" };
    const items = (task.result?.items ?? []).filter((item): item is SceneResultImage => item.kind === "image" && typeof item.dataUrl === "string" && item.dataUrl.length > 0);
    if (task.status === "succeeded") return { status: "succeeded", images: items, stale, drift };
    if (task.status === "failed") return { status: "failed", images: [], stale, drift, error: task.error?.message ?? "上游任务失败。" };
    if (task.status === "cancelled") return { status: "cancelled", images: [], stale, drift };
    if (task.status === "unknown") return { status: "unknown", images: [], stale, drift, error: task.error?.message };
    return { status: RUNNING.includes(task.status) ? "running" : "idle", images: [], stale, drift };
}

export function firstSceneImage(result: NewReplaceBgResult | undefined): string | undefined {
    return result?.images[0]?.dataUrl;
}

/**
 * 结果网格：按输出数量切格子。上游少给就少给（不足的格子显示"上游未返回"），
 * 多给也不隐藏（全部展示），不做任何补图。
 */
export type SceneGridCell = {
    index: number;
    dataUrl?: string;
    id?: string;
    /** 是否由页面承诺过这个格子。 */
    expected: boolean;
};

export function sceneResultGrid(images: readonly SceneResultImage[], count: number, status: SceneResultStatus): SceneGridCell[] {
    const size = Math.max(1, Math.min(4, Math.floor(count) || 1));
    const cells: SceneGridCell[] = [];
    for (let index = 0; index < size; index += 1) {
        const image = images[index];
        cells.push({ index, dataUrl: image?.dataUrl, id: image?.id, expected: Boolean(image) || status !== "succeeded" });
    }
    return cells;
}

export type SceneCutoutModeSummary = { mode: SceneCutoutMode; description: string };

export function summarizeSceneRequest(values: NewReplaceBgValues, output: SceneOutput, references: readonly ReferenceImage[]): SceneCutoutModeSummary {
    const cutout: SceneCutoutMode = values.cutoutMode;
    return {
        mode: cutout,
        description: [
            `${sceneType(values.sceneType).label}`,
            `${output.width}×${output.height}`,
            `${output.count} 张`,
            `强度 ${Math.round(values.weight * 100)}%`,
            `${references.length} 张参考图`,
        ].join(" · "),
    };
}
