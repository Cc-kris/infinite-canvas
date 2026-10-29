import type { BrowserToolInput } from "@/services/api/tools/gateway";
import type { ToolTask, ToolTaskResultItem } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";

import {
    DRESS_APLUS_SCENE_OPTIONS,
    DRESS_DEFAULT_PROVIDER,
    DRESS_WEAR_SET_TOOL_ID,
    DRESS_DEFAULT_QUALITY,
    DRESS_LIMITS,
    DRESS_MAIN_SCENE_OPTIONS,
    DRESS_PRODUCT_INFO_MAX_LENGTH,
    DRESS_PROVIDERS,
    DRESS_SCENE_BY_KEY,
    DRESS_SCENE_COUNT_MAX,
    DRESS_SCENE_COUNT_MIN,
    dressAspectRatioOptionsFor,
    dressQualityOptionsFor,
    dressResolutionOptionsFor,
    dressWearSetValuesSchema,
    type DressSceneGroupKey,
    type DressSceneKey,
    type DressWearSetFormValues,
} from "../registry/dress-wear-set";

/**
 * DRESS_WEAR_SET 适配层（TASK-009）。
 *
 * 这一层只做“配置 → 真实请求”的确定性推导，不产生任何假结果：
 * - `validateDressWearSet` 把每个问题落到具体字段（页面 §5 要求“不只弹通用错误”）；
 * - `dressWearSetUnits` 把多选的场景分组切成“一个组 = 一次真实请求”，count 就是该组产物数；
 * - `buildDressWearSetInput` 产出 gateway 的 `BrowserToolInput`，fields 用 registry 里的字段名；
 * - `groupDressTasks` 依据 prompt 里的 `[DRESS_SCENE group/key]` 标签把任务还原成结果组，
 *   因此刷新后仍能分组，不依赖易丢的组件内 State。
 */

export type DressSceneSelection = { checked: boolean; count: number };
export type DressWearSetValues = DressWearSetFormValues;
export type MainSceneKey = "modelLook" | "lifestyle" | "sellPoint" | "sizeChart" | "whiteBg";
export type AplusSceneKey = "aplusPro" | "aplusPhone" | "aplusPlain" | "aplusCustom";

export type DressWearSetIssueLevel = "error" | "warning";

export type DressWearSetIssue = {
    level: DressWearSetIssueLevel;
    /** 对应表单字段（场景用 `mainScenes.modelLook.count` 这种定位路径） */
    field: string;
    message: string;
};

export type DressGenerationUnit = {
    group: DressSceneGroupKey;
    scene: DressSceneKey;
    label: string;
    count: number;
    /** prompt 首行标签，用于结果归组与刷新恢复 */
    tag: string;
    prompt: string;
    fields: Record<string, unknown>;
};

export type DressResultGroup = {
    group: DressSceneGroupKey;
    scene: DressSceneKey;
    label: string;
    tasks: ToolTask[];
    images: { id: string; dataUrl: string; taskId: string }[];
    status: DressGroupStatus;
};

export type DressGroupStatus = "idle" | "running" | "succeeded" | "partial" | "failed" | "unknown";

/**
 * 结果图 → 工具结果项：供结果卡上的「存入资产 / 发送画布」复用，
 * 保证与任务结果项（ToolTaskResultItem）同形状，避免两处手写字段不一致。
 */
export function dressResultItemOf(image: { id: string; dataUrl: string; mimeType?: string }): {
    id: string;
    kind: "image";
    dataUrl: string;
    mimeType: string;
} {
    return {
        id: image.id,
        kind: "image",
        dataUrl: image.dataUrl,
        mimeType: image.mimeType || "image/png",
    };
}

export type DressTaskSummary = {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
    unknown: number;
    images: number;
};

const MAIN_DEFAULT_CHECKED: DressSceneKey[] = ["modelLook", "whiteBg"];
const DEFAULT_SCENE_COUNT = 4;

function clampCount(value: unknown): number {
    const parsed = Math.floor(Math.abs(Number(value)));
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SCENE_COUNT;
    return Math.min(DRESS_SCENE_COUNT_MAX, Math.max(DRESS_SCENE_COUNT_MIN, parsed));
}

function asText(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asBool(value: unknown): boolean {
    return typeof value === "boolean" ? value : false;
}

/** 默认值：场景每项 4 张（页面实测），主副图默认勾选模特图 + 白底图，A+ 单选且默认不选。 */
export function createDressWearSetValues(): DressWearSetValues {
    const mainScenes = Object.fromEntries(DRESS_MAIN_SCENE_OPTIONS.map((option) => [option.key, { checked: MAIN_DEFAULT_CHECKED.includes(option.key), count: option.defaultCount }]));
    const aplusScenes = Object.fromEntries(DRESS_APLUS_SCENE_OPTIONS.map((option) => [option.key, { checked: false, count: option.defaultCount }]));

    return dressWearSetValuesSchema.parse({
        productInfo: "",
        platform: "",
        salesRegion: "",
        language: "",
        brandMode: "smart",
        brandName: "",
        brandColor: "",
        brandFont: "",
        complianceCheck: false,
        sensitiveLibrary: "",
        replacementLibrary: "",
        provider: DRESS_DEFAULT_PROVIDER,
        resolution: "2K",
        quality: DRESS_DEFAULT_QUALITY,
        aspectRatio: "1:1",
        layoutEach: false,
        noText: false,
        mainScenes,
        aplusScenes,
    });
}

function normalizeSceneSelection(value: unknown, fallback: DressSceneSelection): DressSceneSelection {
    if (!value || typeof value !== "object") return { ...fallback };
    const record = value as { checked?: unknown; count?: unknown };
    return {
        checked: typeof record.checked === "boolean" ? record.checked : fallback.checked,
        count: clampCount(record.count ?? fallback.count),
    };
}

/**
 * 草稿里的 `values` 是 `Record<string, unknown>`（可能来自旧版本或手动改坏），
 * 这里逐字段回落默认值，保证 UI 永远拿到完整结构。
 */
export function normalizeDressWearSetValues(input: unknown): DressWearSetValues {
    const defaults = createDressWearSetValues();
    if (!input || typeof input !== "object") return defaults;
    const raw = input as Record<string, unknown>;
    const rawMain = raw.mainScenes && typeof raw.mainScenes === "object" ? (raw.mainScenes as Record<string, unknown>) : {};
    const rawAplus = raw.aplusScenes && typeof raw.aplusScenes === "object" ? (raw.aplusScenes as Record<string, unknown>) : {};
    const mainDefaults = defaults.mainScenes as unknown as Record<string, DressSceneSelection>;
    const aplusDefaults = defaults.aplusScenes as unknown as Record<string, DressSceneSelection>;
    const fallbackSelection: DressSceneSelection = { checked: false, count: DEFAULT_SCENE_COUNT };

    const mainScenes = Object.fromEntries(DRESS_MAIN_SCENE_OPTIONS.map((option) => [option.key, normalizeSceneSelection(rawMain[option.key], mainDefaults[option.key] ?? fallbackSelection)]));
    const aplusScenes = Object.fromEntries(DRESS_APLUS_SCENE_OPTIONS.map((option) => [option.key, normalizeSceneSelection(rawAplus[option.key], aplusDefaults[option.key] ?? fallbackSelection)]));

    const productInfo = asText(raw.productInfo);
    return {
        productInfo: productInfo.slice(0, DRESS_PRODUCT_INFO_MAX_LENGTH),
        platform: asText(raw.platform),
        salesRegion: asText(raw.salesRegion),
        language: asText(raw.language),
        brandMode: raw.brandMode === "custom" ? "custom" : "smart",
        brandName: asText(raw.brandName),
        brandColor: asText(raw.brandColor),
        brandFont: asText(raw.brandFont),
        complianceCheck: asBool(raw.complianceCheck),
        sensitiveLibrary: asText(raw.sensitiveLibrary),
        replacementLibrary: asText(raw.replacementLibrary),
        provider: asText(raw.provider) || defaults.provider,
        resolution: asText(raw.resolution) || defaults.resolution,
        quality: asText(raw.quality) || defaults.quality,
        aspectRatio: asText(raw.aspectRatio) || defaults.aspectRatio,
        layoutEach: asBool(raw.layoutEach),
        noText: asBool(raw.noText),
        mainScenes,
        aplusScenes,
    } as DressWearSetValues;
}

/**
 * 模型值 → 模型目录档位。用户配置里的值是 `channelId::model` 形态，
 * 只有尾部能对上目录 apiCode 时才启用目录约束，否则不擅自限制（避免凭空造枚举）。
 */
export function resolveDressProviderProfile(modelValue: string) {
    const normalized = modelValue.split("::").pop()?.trim().toUpperCase() ?? "";
    if (!normalized) return undefined;
    return DRESS_PROVIDERS.find((provider) => provider.code === normalized || provider.name.toUpperCase() === normalized);
}

export function dressSceneSelection(values: DressWearSetValues, key: DressSceneKey): DressSceneSelection {
    const group: DressSceneGroupKey = DRESS_SCENE_BY_KEY[key].group;
    if (group === "aplus") {
        return values.aplusScenes[key as AplusSceneKey] ?? { checked: false, count: DEFAULT_SCENE_COUNT };
    }
    return values.mainScenes[key as MainSceneKey] ?? { checked: false, count: DEFAULT_SCENE_COUNT };
}

/** 选中的场景分组（顺序固定：主副图在 A+ 之前）。 */
export function selectedDressScenes(values: DressWearSetValues): DressSceneKey[] {
    return [...DRESS_MAIN_SCENE_OPTIONS, ...DRESS_APLUS_SCENE_OPTIONS].filter((option) => dressSceneSelection(values, option.key).checked).map((option) => option.key);
}

export type DressValidateOptions = {
    /** 已成功上传的参考图数量（有序列表长度） */
    referenceCount: number;
};

/** 页面 §3/§5 的校验：每条都能定位到字段，error 阻断提交，warning 只提示。 */
export function validateDressWearSet(values: DressWearSetValues, options: DressValidateOptions): DressWearSetIssue[] {
    const issues: DressWearSetIssue[] = [];
    const { referenceCount } = options;

    if (referenceCount < 1) {
        issues.push({ level: "error", field: "images", message: "至少上传 1 张服装/配饰/细节图后才能生成" });
    } else if (referenceCount > DRESS_LIMITS.maxFiles) {
        issues.push({
            level: "error",
            field: "images",
            message: `最多上传 ${DRESS_LIMITS.maxFiles} 张图，当前 ${referenceCount} 张`,
        });
    }

    if (values.productInfo.length > DRESS_PRODUCT_INFO_MAX_LENGTH) {
        issues.push({
            level: "error",
            field: "productInfo",
            message: `商品信息最多 ${DRESS_PRODUCT_INFO_MAX_LENGTH} 字，当前 ${values.productInfo.length} 字`,
        });
    }

    if (selectedDressScenes(values).length === 0) {
        issues.push({ level: "error", field: "mainScenes", message: "至少选择一种生成类型（主副图或 A+）" });
    }

    const aplusChecked = DRESS_APLUS_SCENE_OPTIONS.filter((option) => dressSceneSelection(values, option.key).checked);
    if (aplusChecked.length > 1) {
        issues.push({ level: "error", field: "aplusScenes", message: "A+ 图设置为单选，只能保留一种生成类型" });
    }

    const allScenes = [...DRESS_MAIN_SCENE_OPTIONS, ...DRESS_APLUS_SCENE_OPTIONS];
    for (const option of allScenes) {
        const selection = dressSceneSelection(values, option.key);
        if (!selection.checked) continue;
        if (selection.count < DRESS_SCENE_COUNT_MIN || selection.count > DRESS_SCENE_COUNT_MAX) {
            issues.push({
                level: "error",
                field: `${option.group === "aplus" ? "aplusScenes" : "mainScenes"}.${option.key}.count`,
                message: `${option.label} 数量需在 ${DRESS_SCENE_COUNT_MIN}–${DRESS_SCENE_COUNT_MAX} 之间`,
            });
        }
    }

    if (values.brandMode === "smart") {
        const missing: string[] = [];
        if (!values.platform.trim()) missing.push("平台");
        if (!values.salesRegion.trim()) missing.push("销售地区");
        if (!values.language.trim()) missing.push("语言");
        if (missing.length > 0) {
            issues.push({
                level: "error",
                field: "platform",
                message: `智能品牌基因需要先选择${missing.join(" / ")}`,
            });
        }
    } else if (!values.brandName.trim()) {
        issues.push({ level: "error", field: "brandName", message: "自定义品牌需要填写品牌名称" });
    }

    const profile = resolveDressProviderProfile(values.provider);
    if (profile) {
        const qualityOptions = dressQualityOptionsFor(profile.code);
        if (qualityOptions.length > 0 && !qualityOptions.some((option) => option.value === values.quality)) {
            issues.push({
                level: "error",
                field: "quality",
                message: `${profile.name} 不支持该品质档位`,
            });
        }
        const resolutions = dressResolutionOptionsFor(profile.code);
        if (resolutions.length > 0 && !resolutions.includes(values.resolution as never)) {
            issues.push({
                level: "error",
                field: "resolution",
                message: `${profile.name} 支持的分辨率：${resolutions.join(" / ")}`,
            });
        }
        const ratios = dressAspectRatioOptionsFor(profile.code);
        if (ratios.length > 0 && !ratios.includes(values.aspectRatio)) {
            issues.push({ level: "error", field: "aspectRatio", message: `${profile.name} 不支持该比例` });
        }
    } else if (values.provider.trim()) {
        issues.push({
            level: "warning",
            field: "provider",
            message: "当前模型不在服装套图目录内，分辨率/品质档位按用户配置执行",
        });
    }

    if (values.complianceCheck && (!values.sensitiveLibrary.trim() || !values.replacementLibrary.trim())) {
        issues.push({ level: "warning", field: "complianceCheck", message: "已开启合规检查，但词库未选全" });
    }

    return issues;
}

export function hasBlockingDressIssues(issues: DressWearSetIssue[]): boolean {
    return issues.some((issue) => issue.level === "error");
}

/** 预计产物：选中分组的数量之和（不展示原站算力）。 */
export function estimateDressOutputs(values: DressWearSetValues): { groups: number; images: number } {
    const selected = selectedDressScenes(values);
    return {
        groups: selected.length,
        images: selected.reduce((sum, key) => sum + dressSceneSelection(values, key).count, 0),
    };
}

export function dressSceneTag(group: DressSceneGroupKey, scene: DressSceneKey): string {
    return `[DRESS_SCENE ${group}/${scene}]`;
}

/** 任务 prompt 首行标签 → 结果组；没有标签的老任务返回 null。 */
export function parseDressSceneTag(prompt: string): { group: DressSceneGroupKey; scene: DressSceneKey } | null {
    const match = /^\[DRESS_SCENE (main|aplus)\/([A-Za-z]+)\]/.exec(prompt.trim());
    if (!match) return null;
    const scene = match[2] as DressSceneKey;
    if (!DRESS_SCENE_BY_KEY[scene]) return null;
    return { group: match[1] as DressSceneGroupKey, scene };
}
/**
 * 一次真实上游请求的 prompt。标签固定在首行，既有语义作用，也让结果可归组。
 * 只写由表单值确定的约束，不臆造原站未给出的风格词。
 */
export function buildDressPrompt(values: DressWearSetValues, scene: DressSceneKey): string {
    const option = DRESS_SCENE_BY_KEY[scene];
    const count = dressSceneSelection(values, scene).count;
    const lines: string[] = [dressSceneTag(option.group, option.key)];

    const target = [values.platform, values.salesRegion, values.language].filter((part) => part.trim() !== "");
    if (target.length > 0) lines.push(`投放目标：${target.join("｜")}`);

    const brand = values.brandMode === "smart" ? "智能品牌基因" : values.brandName.trim();
    const brandExtras = [values.brandColor.trim() ? `主色 ${values.brandColor.trim()}` : "", values.brandFont.trim() ? `字体 ${values.brandFont.trim()}` : ""].filter(Boolean);
    if (brand) lines.push(`品牌：${brand}${brandExtras.length > 0 ? `（${brandExtras.join("，")}）` : ""}`);

    if (values.productInfo.trim()) lines.push(`商品信息：${values.productInfo.trim()}`);

    lines.push(`画面要求：${option.instruction}`);
    if (values.layoutEach) lines.push("每种官方排版各生成一张，排版之间不重复。");
    lines.push(values.noText ? "画面不出现任何文字，包括卖点文案、标签与尺码表。" : `允许克制的版式文字，文字使用${values.language.trim() || "目标站点语言"}。`);
    lines.push(`比例 ${values.aspectRatio}，本次输出 ${count} 张。`);
    lines.push("严格保持上传图中的服装款式、版型、面料质感、颜色与图案，不得改款、不得替换图案、不得添加未提供的 logo。");

    return lines.join("\n");
}

/** 选中分组 → 生成单元（一个单元 = 一次真实请求）。顺序：主副图在前，A+ 在后。 */
export function dressWearSetUnits(values: DressWearSetValues): DressGenerationUnit[] {
    const order = [...DRESS_MAIN_SCENE_OPTIONS, ...DRESS_APLUS_SCENE_OPTIONS];
    const units: DressGenerationUnit[] = [];
    for (const option of order) {
        const selection = dressSceneSelection(values, option.key);
        if (!selection.checked) continue;
        units.push({
            group: option.group,
            scene: option.key,
            label: option.label,
            count: clampCount(selection.count),
            tag: dressSceneTag(option.group, option.key),
            prompt: buildDressPrompt(values, option.key),
            fields: {
                group: option.group,
                scene: option.key,
                outputNum: clampCount(selection.count),
            },
        });
    }
    return units;
}

/**
 * 上传记录 → gateway 需要的 ReferenceImage。
 * `dataUrl` 先填会话内 object URL，gateway 侧再用 storageKey 解析成真实数据。
 */
export function toDressReferences(records: readonly { id: string; name: string; url: string; storageKey?: string; mimeType?: string }[]): ReferenceImage[] {
    return records.slice(0, DRESS_LIMITS.maxFiles).map((record) => ({
        id: record.id,
        name: record.name,
        type: record.mimeType ?? "image/png",
        dataUrl: record.url,
        url: record.url,
        storageKey: record.storageKey,
    }));
}

/**
 * 单元 → gateway 输入。fields 用 registry 里的字段名（imageUrl/images/… 与真实提交体对齐），
 * 只参与指纹与可复现快照，不直接发给 provider。
 */
export function buildDressWearSetInput(unit: DressGenerationUnit, values: DressWearSetValues, references: ReferenceImage[], options: { model?: string } = {}): BrowserToolInput {
    const profile = resolveDressProviderProfile(values.provider);
    // 目录声明“无品质档位”时不下发 quality，避免把档位塞给不支持的模型。
    const quality = profile && profile.qualities.length === 0 ? undefined : values.quality;

    return {
        toolId: DRESS_WEAR_SET_TOOL_ID,
        prompt: unit.prompt,
        references,
        model: options.model,
        size: values.aspectRatio,
        quality,
        count: unit.count,
        fields: {
            ...unit.fields,
            imageUrl: references[0]?.url ?? "",
            images: references.map((reference) => reference.url ?? reference.dataUrl),
            platform: values.platform,
            salesRegion: values.salesRegion,
            language: values.language,
            brandName: values.brandMode === "smart" ? "智能品牌基因" : values.brandName,
            brandColor: values.brandColor,
            brandFont: values.brandFont,
            needIntelligent: values.brandMode === "smart",
            complianceCheck: values.complianceCheck,
            sensitiveLibrary: values.sensitiveLibrary,
            replacementLibrary: values.replacementLibrary,
            provider: values.provider,
            resolution: values.resolution,
            quality: values.quality,
            aspectRatio: values.aspectRatio,
            layoutEach: values.layoutEach,
            noText: values.noText,
            productInfo: values.productInfo,
            outputNum: unit.count,
        },
    };
}

const RUNNING_STATUSES: ReadonlySet<string> = new Set(["draft", "validating", "submitting", "running"]);

/** 「成功」必须以真的拿到图为准：succeeded 但 0 张可取回产物 = 无结果，不能算成功。 */
function taskHasDeliveredImage(task: ToolTask): boolean {
    return task.status === "succeeded" && (task.result?.items ?? []).some((item) => Boolean(resultItemSrc(item) ?? item.blob));
}

function groupStatus(tasks: readonly ToolTask[]): DressGroupStatus {
    if (tasks.length === 0) return "idle";
    if (tasks.some((task) => RUNNING_STATUSES.has(task.status))) return "running";
    const delivered = tasks.filter(taskHasDeliveredImage).length;
    const failed = tasks.filter(
        (task) => task.status === "failed" || task.status === "cancelled" || (task.status === "succeeded" && !taskHasDeliveredImage(task)),
    ).length;
    const unknown = tasks.filter((task) => task.status === "unknown").length;
    if (failed > 0 && delivered > 0) return "partial";
    if (failed > 0) return "failed";
    if (unknown > 0) return unknown === tasks.length ? "unknown" : "partial";
    return delivered > 0 ? "succeeded" : "unknown";
}

/** 任务 → 结果组。分组依据是 prompt 首行标签，因此刷新后仍可还原。 */
/**
 * 结果项取图源：内存态是 dataUrl，刷新后只剩 hydrate 还原的对象 URL（item.url）。
 * 只认 dataUrl 会让「刷新后成功但产物 0 张」——两种都算真实结果。
 */
function resultItemSrc(item: ToolTaskResultItem): string | undefined {
    return item.dataUrl ?? item.url;
}

export function groupDressTasks(tasks: readonly ToolTask[]): DressResultGroup[] {
    const groups = new Map<string, DressResultGroup>();
    const order = [...DRESS_MAIN_SCENE_OPTIONS, ...DRESS_APLUS_SCENE_OPTIONS];

    for (const option of order) {
        const bucket = tasks.filter((task) => {
            const tag = parseDressSceneTag(task.prompt);
            return tag?.scene === option.key;
        });
        if (bucket.length === 0) continue;
        groups.set(option.key, {
            group: option.group,
            scene: option.key,
            label: option.label,
            tasks: [...bucket],
            images: bucket.flatMap((task) =>
                (task.result?.items ?? []).flatMap((item) => {
                    const src = resultItemSrc(item);
                    return src ? [{ id: item.id, dataUrl: src, taskId: task.id }] : [];
                }),
            ),
            status: groupStatus(bucket),
        });
    }

    return Array.from(groups.values());
}

/**
 * 结果面板视图：把本页真实任务的结果项聚合成一个 `ToolTask`，交给共享 `ToolResult` 面板渲染。
 *
 * 为什么需要它：结果区原本只有自有的 `dress-group-*` 分组块，刷新后没有标准结果面板，
 * 三动作（下载 / 存入资产 / 发送画布）只能靠历史坞按钮，验收里 `[data-testid=tool-result]` 永远缺失。
 *
 * 这里**只做视图聚合**：`items` 原样引用真实任务的结果项（含 hydrate 用 storageKey 复原的字节），
 * 不新建任务、不伪造结果、不改写字节；没有任务时返回 null。
 */
export function dressResultPanelTask(tasks: readonly ToolTask[]): ToolTask | null {
    if (tasks.length === 0) return null;
    const ordered = [...tasks].sort((a, b) => a.createdAt - b.createdAt);
    const latest = ordered[ordered.length - 1];
    const items = ordered.flatMap((task) => task.result?.items ?? []);
    const receivedAt = ordered.reduce((acc, task) => Math.max(acc, task.result?.receivedAt ?? 0), 0);
    const status: ToolTask["status"] = tasks.some((task) => RUNNING_STATUSES.has(task.status))
        ? "running"
        : tasks.some((task) => taskHasDeliveredImage(task))
          ? "succeeded"
          : latest.status;

    return {
        ...latest,
        // 结果项来自所有真实任务（按提交时间顺序），id 保持原样以便动作层按项落盘。
        result: items.length ? { items, receivedAt: receivedAt || latest.result?.receivedAt || latest.updatedAt } : undefined,
        status,
    };
}

/** 任一任务有可取回的产物（或等待中的结果项）即算有东西可展示。 */
function deliveredOrPending(tasks: readonly ToolTask[]): boolean {
    return tasks.some((task) => (task.result?.items ?? []).length > 0);
}

/** 无标签任务（历史数据）单独成组，避免结果凭空消失。 */
export function untaggedDressTasks(tasks: readonly ToolTask[]): ToolTask[] {
    return tasks.filter((task) => parseDressSceneTag(task.prompt) === null);
}

export function summarizeDressTasks(tasks: readonly ToolTask[]): DressTaskSummary {
    const summary: DressTaskSummary = { total: tasks.length, running: 0, succeeded: 0, failed: 0, unknown: 0, images: 0 };
    for (const task of tasks) {
        if (RUNNING_STATUSES.has(task.status)) summary.running += 1;
        else if (task.status === "succeeded") {
            // 成功但一张可取回的图都没有 → 计入失败，避免「成功 N 组 / 产物 0 张」自相矛盾。
            if (taskHasDeliveredImage(task)) summary.succeeded += 1;
            else summary.failed += 1;
        } else if (task.status === "unknown") summary.unknown += 1;
        else summary.failed += 1;
        summary.images += (task.result?.items ?? []).filter((item) => Boolean(resultItemSrc(item))).length;
    }
    return summary;
}

/**
 * 结果是否属于上一版提交：draftRevision 比当前草稿 revision 更旧 → 结果过期，
 * 页面必须同时展示“提交快照”，不能让用户以为新改的配置已经生效（页面 §5 要求）。
 */
export function isStaleDressTask(task: ToolTask, currentRevision: number | string | null | undefined): boolean {
    const taskRevision = task.draftRevision;
    if (taskRevision === null || taskRevision === undefined) return false;
    if (currentRevision === null || currentRevision === undefined) return false;
    const left = Number(taskRevision);
    const right = Number(currentRevision);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return String(taskRevision) !== String(currentRevision);
    return left < right;
}

/* ------------------------------------------------------------------ *
 * 执行层：把「分组」变成真实上游请求。只用 store 已有的 runTool/retryTask，
 * 不自建 HTTP、不自动重提交（规范：结果未知必须由人决定）。
 * ------------------------------------------------------------------ */

/** 结构类型：useToolTaskStore 的两个动作即可满足，便于测试注入假端口。 */
export type DressRunPort = {
    runTool: (input: BrowserToolInput, options?: { signal?: AbortSignal; draftRevision?: number | string | null; onUpdate?: (task: ToolTask) => void }) => Promise<ToolTask>;
    retryTask: (taskId: string, input: BrowserToolInput, options?: { signal?: AbortSignal; onUpdate?: (task: ToolTask) => void }) => Promise<ToolTask>;
};

export type DressResultImage = { id: string; dataUrl: string; taskId: string };

/** 提交快照：结果区据此标注“与当前设置一致/已过期”，绝不悄悄混入旧结果。 */
export type DressSubmitSnapshot = {
    values: DressWearSetValues;
    referenceIds: string[];
    model: string;
    at: number;
};

export type DressUnitRun = {
    unit: DressGenerationUnit;
    taskId: string;
    status: ToolTask["status"];
    images: DressResultImage[];
    error?: { code: string; message: string };
};

export type DressRunResult = {
    units: DressUnitRun[];
    snapshot: DressSubmitSnapshot;
};

export function createDressSnapshot(values: DressWearSetValues, referenceIds: string[], model: string, at = Date.now()): DressSubmitSnapshot {
    return { values, referenceIds: [...referenceIds], model, at };
}

/** 当前设置是否与快照一致；任一项变化（换源图、改数量、换模型）都算过期。 */
export function dressSnapshotMatches(snapshot: DressSubmitSnapshot, values: DressWearSetValues, referenceIds: string[], model: string): boolean {
    return canonicalDressSnapshot(snapshot.values, snapshot.referenceIds, snapshot.model) === canonicalDressSnapshot(values, referenceIds, model);
}

function canonicalDressSnapshot(values: DressWearSetValues, referenceIds: string[], model: string): string {
    const normalized = normalizeDressWearSetValues(values);
    return JSON.stringify({
        values: normalized,
        referenceIds: [...referenceIds].sort(),
        model,
    });
}

function imagesFromTask(task: ToolTask): DressResultImage[] {
    return (task.result?.items ?? []).flatMap((item) => (item.dataUrl ? [{ id: item.id, dataUrl: item.dataUrl, taskId: task.id }] : []));
}

function toUnitRun(unit: DressGenerationUnit, task: ToolTask): DressUnitRun {
    return {
        unit,
        taskId: task.id,
        status: task.status,
        images: imagesFromTask(task),
        ...(task.error ? { error: { code: task.error.code, message: task.error.message } } : {}),
    };
}

export type RunDressWearSetParams = {
    units: DressGenerationUnit[];
    values: DressWearSetValues;
    references: ReferenceImage[];
    model: string;
    revision?: number | string | null;
    port: DressRunPort;
    concurrency?: number;
    signal?: AbortSignal;
    /** 每完成一个分组回调一次（成功/失败都会回调），UI 据此增量刷新。 */
    onUnit?: (run: DressUnitRun) => void;
};

/**
 * 逐组提交并等待终态。并发默认 2（原站按分组串行，这里允许小并发以缩短等待，
 * 但不会把 8 个请求同时打出去）。任一组失败不阻断其它组，结果按分组保留。
 */
export async function runDressWearSet(params: RunDressWearSetParams): Promise<DressRunResult> {
    const { units, values, references, model, revision = null, port, signal, onUnit } = params;
    const concurrency = Math.max(1, Math.min(units.length || 1, params.concurrency ?? 2));
    const runs: DressUnitRun[] = new Array(units.length);
    let cursor = 0;

    const worker = async () => {
        for (;;) {
            const index = cursor;
            cursor += 1;
            const unit = units[index];
            if (!unit) return;
            if (signal?.aborted) {
                const aborted: DressUnitRun = {
                    unit,
                    taskId: "",
                    status: "cancelled",
                    images: [],
                    error: { code: "aborted", message: "已取消" },
                };
                runs[index] = aborted;
                onUnit?.(aborted);
                continue;
            }
            const input = buildDressWearSetInput(unit, values, references, { model });
            try {
                const task = await port.runTool(input, { signal, draftRevision: revision });
                const run = toUnitRun(unit, task);
                runs[index] = run;
                onUnit?.(run);
            } catch (error) {
                const run: DressUnitRun = {
                    unit,
                    taskId: "",
                    status: "failed",
                    images: [],
                    error: { code: "submit-failed", message: error instanceof Error ? error.message : String(error) },
                };
                runs[index] = run;
                onUnit?.(run);
            }
        }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return {
        units: runs.filter(Boolean),
        snapshot: createDressSnapshot(
            values,
            references.map((item) => item.id),
            model,
        ),
    };
}

/** 单组重试：沿用原任务记录（幂等），失败组可单独重跑而不影响已完成分组。 */
export async function retryDressUnit(params: { run: DressUnitRun; values: DressWearSetValues; references: ReferenceImage[]; model: string; port: DressRunPort; signal?: AbortSignal }): Promise<DressUnitRun> {
    const { run, values, references, model, port, signal } = params;
    const input = buildDressWearSetInput(run.unit, values, references, { model });
    if (!run.taskId) {
        const task = await port.runTool(input, { signal });
        return toUnitRun(run.unit, task);
    }
    const task = await port.retryTask(run.taskId, input, { signal });
    return toUnitRun(run.unit, task);
}
