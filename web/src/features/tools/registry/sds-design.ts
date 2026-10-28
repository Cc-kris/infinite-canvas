import { z } from "zod";

/**
 * TASK-031：SDS_DESIGN（素材贴合）页面契约。
 *
 * 事实来源：
 * - docs/V1.0/plan_linkfox_navigation/page-specs/24-sds-design.md（5 个字段 + 状态联动 + 主操作路径）
 * - docs/V1.0/plan_linkfox_navigation/technical_design.md TECH-T24（PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas）
 * - docs/V1.0/plan_linkfox_navigation/tool_specs.json（imageList/imageName/imageUrl/materialList/productId）
 * - 原站 DOM 快照：SDS_DESIGN.json（区域与文案：上传素材 / 产品 / 选择颜色 / 素材操作 / 立即生成 / 生成结果）
 *
 * 边界（不虚构）：
 * - 原站商品库接口未捕获，因此本页的“产品”由用户上传/选择商品图得到，`productId` 就是商品图资产 id；
 *   没有商品图时页面处于阻断态，不提供任何预设商品列表。
 * - 原站商品颜色列表接口未捕获，颜色使用页面级中性预设（只影响提示词与预览蒙层），不冒充上游枚举。
 * - 网关只把 prompt + references 发给模型（fields 仅参与指纹/审计），因此商品图与素材图通过 references 真实上传，
 *   贴合几何、平铺方式、颜色、商品 id 通过确定性 prompt 下发；fields 仍严格保持 5 个契约字段。
 */

export const SDS_DESIGN_TOOL_ID = "SDS_DESIGN";
export const SDS_DESIGN_DRAFT_KEY = "tool-draft:v1:SDS_DESIGN";
export const SDS_DESIGN_ROUTE = "/tools/product-design/sds-design";

/** 素材/商品图上传限制：与资产服务的图片约束一致，页面与适配器共用同一份常量。 */
export const SDS_UPLOAD_LIMITS = {
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 20 * 1024 * 1024,
    minSide: 64,
    maxSide: 8192,
} as const;

/** 素材数量：1..6，输出图片与素材一一对应（page spec §2 “素材数量与生成结果一一对应”）。 */
export const SDS_MATERIAL_COUNT = { min: 1, max: 6 } as const;

export const SDS_PLACEMENT_LIMITS = {
    scaleMin: 0.05,
    scaleMax: 1,
    rotationMin: -180,
    rotationMax: 180,
} as const;

export const SDS_HISTORY_LIMIT = 50;

/* ============================== 平铺预设 ============================== */

export type SdsTilingPresetId = "single" | "grid-2x2" | "half-drop-2x2" | "grid-3x3";

export type SdsTilingPreset = {
    id: SdsTilingPresetId;
    label: string;
    /** 提示词里的确定性描述。 */
    promptLine: string;
    columns: number;
    rows: number;
    /** 偶数行是否错位半格。 */
    stagger: boolean;
};

export const SDS_TILING_PRESETS: readonly SdsTilingPreset[] = [
    { id: "single", label: "单张居中", promptLine: "单张不重复", columns: 1, rows: 1, stagger: false },
    { id: "grid-2x2", label: "2×2 平铺", promptLine: "按 2 列 × 2 行等距平铺重复", columns: 2, rows: 2, stagger: false },
    { id: "half-drop-2x2", label: "2×2 错位", promptLine: "按 2 列 × 2 行错位半格平铺重复", columns: 2, rows: 2, stagger: true },
    { id: "grid-3x3", label: "3×3 平铺", promptLine: "按 3 列 × 3 行等距平铺重复", columns: 3, rows: 3, stagger: false },
] as const;

export const DEFAULT_SDS_TILING_PRESET: SdsTilingPresetId = "single";

export function isSdsTilingPresetId(value: unknown): value is SdsTilingPresetId {
    return typeof value === "string" && SDS_TILING_PRESETS.some((preset) => preset.id === value);
}

export function sdsTilingPreset(id: string | undefined): SdsTilingPreset {
    return SDS_TILING_PRESETS.find((preset) => preset.id === id) ?? SDS_TILING_PRESETS[0];
}

/* ============================== 颜色预设 ============================== */

export type SdsColorOption = {
    id: string;
    label: string;
    /** 预览蒙层色；`original` 不叠加蒙层。 */
    hex: string;
    promptLine: string;
};

/**
 * 页面级中性颜色预设：上游商品颜色接口未捕获，这里只提供“原色 + 4 个基础色”，
 * 既不假装成上游商品 SKU 颜色，也不影响贴合几何。
 */
export const SDS_COLOR_OPTIONS: readonly SdsColorOption[] = [
    { id: "original", label: "原色", hex: "", promptLine: "保持商品原始颜色" },
    { id: "black", label: "黑色", hex: "#111111", promptLine: "商品颜色为黑色" },
    { id: "white", label: "白色", hex: "#f4f4f4", promptLine: "商品颜色为白色" },
    { id: "navy", label: "藏青", hex: "#1f2a44", promptLine: "商品颜色为藏青色" },
    { id: "beige", label: "米色", hex: "#e6dcc8", promptLine: "商品颜色为米色" },
] as const;

export const DEFAULT_SDS_COLOR_ID = "original";

export function isSdsColorId(value: unknown): boolean {
    return typeof value === "string" && SDS_COLOR_OPTIONS.some((option) => option.id === value);
}

export function sdsColorOption(id: string | undefined): SdsColorOption {
    return SDS_COLOR_OPTIONS.find((option) => option.id === id) ?? SDS_COLOR_OPTIONS[0];
}

/* ============================== 数据模型 ============================== */

export type SdsPlacement = {
    /** 素材中心点，相对商品图宽/高的归一化坐标（0..1）。 */
    x: number;
    y: number;
    /** 相对可贴区域宽度的比例（0.05..1）。 */
    scale: number;
    /** 旋转角度，-180..180。 */
    rotation: number;
};

export type SdsAssetFields = {
    assetId: string;
    name: string;
    url?: string;
    dataUrl?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export type SdsMaterial = SdsAssetFields & {
    placement: SdsPlacement;
    tilingPresetId: SdsTilingPresetId;
};

export type SdsProduct = SdsAssetFields;

export type SdsValues = {
    /** 提交用的素材展示名（默认取第一个素材名，可改）。 */
    imageName: string;
    colorId: string;
    product: SdsProduct | null;
    materials: SdsMaterial[];
    selectedMaterialId: string | null;
};

export const DEFAULT_SDS_PLACEMENT: SdsPlacement = { x: 0.5, y: 0.5, scale: 0.6, rotation: 0 };

/** 资产记录（ToolAssetRecord / ToolAssetLibraryItem）→ 页面素材字段。 */
export type SdsAssetLike = {
    id?: string;
    assetId?: string;
    name: string;
    url?: string;
    dataUrl?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

export function sdsAssetId(asset: SdsAssetLike): string {
    return asset.assetId || asset.id || "";
}

export function sdsAssetFields(asset: SdsAssetLike): SdsAssetFields {
    return {
        assetId: sdsAssetId(asset),
        name: asset.name,
        ...(asset.url ? { url: asset.url } : {}),
        ...(asset.dataUrl ? { dataUrl: asset.dataUrl } : {}),
        ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
        ...(typeof asset.bytes === "number" ? { bytes: asset.bytes } : {}),
        ...(typeof asset.width === "number" ? { width: asset.width } : {}),
        ...(typeof asset.height === "number" ? { height: asset.height } : {}),
    };
}

export function createSdsMaterial(asset: SdsAssetLike, patch: Partial<Pick<SdsMaterial, "placement" | "tilingPresetId">> = {}): SdsMaterial {
    return {
        ...sdsAssetFields(asset),
        placement: { ...DEFAULT_SDS_PLACEMENT, ...(patch.placement ?? {}) },
        tilingPresetId: patch.tilingPresetId && isSdsTilingPresetId(patch.tilingPresetId) ? patch.tilingPresetId : DEFAULT_SDS_TILING_PRESET,
    };
}

export function createSdsValues(patch: Partial<SdsValues> = {}): SdsValues {
    const materials = (patch.materials ?? []).slice(0, SDS_MATERIAL_COUNT.max);
    return {
        imageName: patch.imageName ?? (materials[0]?.name ?? ""),
        colorId: patch.colorId && isSdsColorId(patch.colorId) ? patch.colorId : DEFAULT_SDS_COLOR_ID,
        product: patch.product ?? null,
        materials,
        selectedMaterialId: patch.selectedMaterialId ?? materials[0]?.assetId ?? null,
    };
}

/** 素材列表变化后校正选中项/展示名：选中的素材被删则回落到第一个，展示名为空则回落到第一个素材名。 */
export function reconcileSdsValues(values: SdsValues): SdsValues {
    const materials = values.materials.slice(0, SDS_MATERIAL_COUNT.max);
    const selected = materials.some((material) => material.assetId === values.selectedMaterialId) ? values.selectedMaterialId : (materials[0]?.assetId ?? null);
    const imageName = values.imageName.trim() || materials[0]?.name || "";
    return { ...values, materials, selectedMaterialId: selected, imageName };
}

export function sdsSelectedMaterial(values: SdsValues): SdsMaterial | undefined {
    return values.materials.find((material) => material.assetId === values.selectedMaterialId) ?? values.materials[0];
}

/* ============================== 可贴区域与几何 ============================== */

export type SdsPrintableArea = { x: number; y: number; width: number; height: number };

/**
 * 可贴区域：以商品图中心为基准、四周内缩 8% 的安全区；商品图比例变化时重新计算。
 * 不引入任何“某商品专属印花位”臆造坐标。
 */
export function sdsPrintableArea(product: Pick<SdsProduct, "width" | "height"> | null | undefined, inset = 0.08): SdsPrintableArea {
    const width = product?.width && product.width > 0 ? product.width : 1;
    const height = product?.height && product.height > 0 ? product.height : 1;
    const ratio = width / height;
    const safe = Math.min(0.49, Math.max(0.02, inset));
    // 归一化到商品图坐标：宽高比只影响纵向安全区，避免素材被压出画面。
    const halfW = 0.5 - safe;
    const halfH = Math.max(0.05, halfW / Math.max(0.2, Math.min(5, ratio)));
    return { x: 0.5 - halfW, y: 0.5 - halfH, width: halfW * 2, height: halfH * 2 };
}

export function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

export function normalizeSdsRotation(value: number): number {
    if (!Number.isFinite(value)) return 0;
    let next = value;
    while (next > SDS_PLACEMENT_LIMITS.rotationMax) next -= 360;
    while (next < SDS_PLACEMENT_LIMITS.rotationMin) next += 360;
    return Math.round(next * 10) / 10;
}

export function clampSdsPlacement(placement: SdsPlacement, area: SdsPrintableArea): SdsPlacement {
    const scale = clampNumber(placement.scale, SDS_PLACEMENT_LIMITS.scaleMin, SDS_PLACEMENT_LIMITS.scaleMax);
    const boxW = area.width * scale;
    const boxH = area.height * scale;
    const minX = area.x + boxW / 2;
    const maxX = area.x + area.width - boxW / 2;
    const minY = area.y + boxH / 2;
    const maxY = area.y + area.height - boxH / 2;
    return {
        x: round3(clampNumber(placement.x, Math.min(minX, maxX), Math.max(minX, maxX))),
        y: round3(clampNumber(placement.y, Math.min(minY, maxY), Math.max(minY, maxY))),
        scale: round3(scale),
        rotation: normalizeSdsRotation(placement.rotation),
    };
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000;
}

export function isSdsPlacementValid(placement: SdsPlacement): boolean {
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return false;
    if (!Number.isFinite(placement.scale) || !Number.isFinite(placement.rotation)) return false;
    if (placement.scale < SDS_PLACEMENT_LIMITS.scaleMin || placement.scale > SDS_PLACEMENT_LIMITS.scaleMax) return false;
    if (placement.rotation < SDS_PLACEMENT_LIMITS.rotationMin || placement.rotation > SDS_PLACEMENT_LIMITS.rotationMax) return false;
    return placement.x >= 0 && placement.x <= 1 && placement.y >= 0 && placement.y <= 1;
}

/** 产品变化：按新可贴区域重新夹取全部素材位置（不透传到颜色/平铺）。 */
export function sdsPlacementsForProduct(materials: readonly SdsMaterial[], product: Pick<SdsProduct, "width" | "height"> | null | undefined): SdsMaterial[] {
    const area = sdsPrintableArea(product);
    return materials.map((material) => ({ ...material, placement: clampSdsPlacement(material.placement, area) }));
}

/* ============================== 位置历史（撤销/重做） ============================== */

export type SdsPlacementRecord = Record<string, SdsPlacement>;

export type SdsPlacementHistory = {
    past: SdsPlacementRecord[];
    present: SdsPlacementRecord;
    future: SdsPlacementRecord[];
};

function sameRecord(a: SdsPlacementRecord, b: SdsPlacementRecord): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function createSdsPlacementHistory(materials: readonly SdsMaterial[] = []): SdsPlacementHistory {
    const present: SdsPlacementRecord = {};
    for (const material of materials) present[material.assetId] = { ...material.placement };
    return { past: [], present, future: [] };
}

/** 提交一次位置变更；相同内容不产生历史节点（避免拖拽抖动塞满历史）。 */
export function commitSdsPlacement(history: SdsPlacementHistory, next: SdsPlacementRecord): SdsPlacementHistory {
    if (sameRecord(history.present, next)) return history;
    const past = [...history.past, history.present].slice(-SDS_HISTORY_LIMIT);
    return { past, present: next, future: [] };
}

export function canUndoSdsPlacement(history: SdsPlacementHistory): boolean {
    return history.past.length > 0;
}

export function canRedoSdsPlacement(history: SdsPlacementHistory): boolean {
    return history.future.length > 0;
}

export function undoSdsPlacement(history: SdsPlacementHistory): SdsPlacementHistory {
    if (!history.past.length) return history;
    const present = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present, future: [history.present, ...history.future].slice(0, SDS_HISTORY_LIMIT) };
}

export function redoSdsPlacement(history: SdsPlacementHistory): SdsPlacementHistory {
    if (!history.future.length) return history;
    const present = history.future[0];
    return { past: [...history.past, history.present].slice(-SDS_HISTORY_LIMIT), present, future: history.future.slice(1) };
}

export function placementRecordFromMaterials(materials: readonly SdsMaterial[]): SdsPlacementRecord {
    const record: SdsPlacementRecord = {};
    for (const material of materials) record[material.assetId] = { ...material.placement };
    return record;
}

export function applySdsPlacementRecord(materials: readonly SdsMaterial[], record: SdsPlacementRecord): SdsMaterial[] {
    return materials.map((material) => (record[material.assetId] ? { ...material, placement: { ...record[material.assetId] } } : material));
}

export type SdsPlacementPatch = Partial<SdsPlacement>;

export function patchSdsPlacement(
    materials: readonly SdsMaterial[],
    assetId: string,
    patch: SdsPlacementPatch,
    product: Pick<SdsProduct, "width" | "height"> | null | undefined,
): SdsMaterial[] {
    const area = sdsPrintableArea(product);
    return materials.map((material) =>
        material.assetId === assetId ? { ...material, placement: clampSdsPlacement({ ...material.placement, ...patch }, area) } : material,
    );
}

export type SdsPlacementKeyAction =
    | { kind: "move"; dx: number; dy: number }
    | { kind: "scale"; factor: number }
    | { kind: "rotate"; delta: number };

/** 键盘微调：方向键移 1%（Shift 10%）、+/- 缩放 5%、[/] 旋转 5°。 */
export function sdsPlacementKeyAction(key: string, shiftKey = false): SdsPlacementKeyAction | null {
    const step = shiftKey ? 0.1 : 0.01;
    if (key === "ArrowLeft") return { kind: "move", dx: -step, dy: 0 };
    if (key === "ArrowRight") return { kind: "move", dx: step, dy: 0 };
    if (key === "ArrowUp") return { kind: "move", dx: 0, dy: -step };
    if (key === "ArrowDown") return { kind: "move", dx: 0, dy: step };
    if (key === "+" || key === "=") return { kind: "scale", factor: 1.05 };
    if (key === "-" || key === "_") return { kind: "scale", factor: 1 / 1.05 };
    if (key === "[") return { kind: "rotate", delta: -5 };
    if (key === "]") return { kind: "rotate", delta: 5 };
    return null;
}

export function applySdsPlacementAction(
    materials: readonly SdsMaterial[],
    assetId: string,
    action: SdsPlacementKeyAction,
    product: Pick<SdsProduct, "width" | "height"> | null | undefined,
): SdsMaterial[] {
    const target = materials.find((material) => material.assetId === assetId);
    if (!target) return [...materials];
    if (action.kind === "move") {
        return patchSdsPlacement(materials, assetId, { x: target.placement.x + action.dx, y: target.placement.y + action.dy }, product);
    }
    if (action.kind === "scale") {
        return patchSdsPlacement(materials, assetId, { scale: target.placement.scale * action.factor }, product);
    }
    return patchSdsPlacement(materials, assetId, { rotation: target.placement.rotation + action.delta }, product);
}

/* ============================== 校验 ============================== */

export type SdsIssueCode =
    | "material-required"
    | "material-too-many"
    | "material-unready"
    | "material-duplicate"
    | "material-name-required"
    | "product-required"
    | "product-unready"
    | "color-unknown"
    | "tiling-unknown"
    | "placement-invalid"
    | "model-missing";

export type SdsIssue = {
    code: SdsIssueCode;
    /** 对应契约字段名（imageList/imageName/imageUrl/materialList/productId）。 */
    field: string;
    message: string;
    materialId?: string;
};

export type SdsValidationInput = {
    values: SdsValues;
    /** 是否已有可用图像模型；缺模型时不放行提交。 */
    hasModel?: boolean;
};

export function sdsExpectedOutputCount(values: SdsValues): number {
    return clampNumber(values.materials.length, SDS_MATERIAL_COUNT.min, SDS_MATERIAL_COUNT.max);
}

export function validateSdsDesignState({ values, hasModel = true }: SdsValidationInput): SdsIssue[] {
    const issues: SdsIssue[] = [];
    const materials = values.materials;

    if (materials.length < SDS_MATERIAL_COUNT.min) {
        issues.push({ code: "material-required", field: "imageList", message: "至少上传 1 个素材后才能贴合。" });
    }
    if (materials.length > SDS_MATERIAL_COUNT.max) {
        issues.push({ code: "material-too-many", field: "imageList", message: `素材最多 ${SDS_MATERIAL_COUNT.max} 个。` });
    }

    const seen = new Set<string>();
    materials.forEach((material, index) => {
        if (!material.assetId || (!material.url && !material.dataUrl)) {
            issues.push({
                code: "material-unready",
                field: "imageList",
                materialId: material.assetId,
                message: `第 ${index + 1} 个素材尚未上传完成，无法提交。`,
            });
        }
        if (material.assetId) {
            if (seen.has(material.assetId)) {
                issues.push({ code: "material-duplicate", field: "imageList", materialId: material.assetId, message: `素材「${material.name}」重复添加。` });
            }
            seen.add(material.assetId);
        }
        if (!isSdsTilingPresetId(material.tilingPresetId)) {
            issues.push({ code: "tiling-unknown", field: "materialList", materialId: material.assetId, message: "平铺预设不在页面枚举内。" });
        }
        if (!isSdsPlacementValid(material.placement)) {
            issues.push({ code: "placement-invalid", field: "materialList", materialId: material.assetId, message: "贴合位置/缩放/旋转超出允许范围。" });
        }
    });

    if (!values.imageName.trim()) {
        issues.push({ code: "material-name-required", field: "imageName", message: "素材名称不能为空（用于结果命名）。" });
    }
    if (!values.product || !values.product.assetId) {
        issues.push({ code: "product-required", field: "productId", message: "请先选择/上传要贴合的商品图。" });
    } else if (!values.product.url && !values.product.dataUrl) {
        issues.push({ code: "product-unready", field: "imageUrl", message: "商品图尚未就绪，无法提交。" });
    }
    if (!isSdsColorId(values.colorId)) {
        issues.push({ code: "color-unknown", field: "materialList", message: "颜色选项不在页面枚举内。" });
    }
    if (!hasModel) {
        issues.push({ code: "model-missing", field: "productId", message: "当前没有可用的图像模型，请先在设置中选择模型。" });
    }
    return issues;
}

export function isSdsReady(values: SdsValues, hasModel = true): boolean {
    return validateSdsDesignState({ values, hasModel }).length === 0;
}

export function sdsIssueByField(issues: readonly SdsIssue[], field: string): SdsIssue | undefined {
    return issues.find((issue) => issue.field === field);
}

export function sdsSubmitLabel(values: SdsValues): string {
    const count = sdsExpectedOutputCount(values);
    return count > 0 ? `立即生成（${count} 张）` : "立即生成";
}

/* ============================== 提示词 ============================== */

export function sdsColorLine(colorId: string): string {
    return `颜色：${sdsColorOption(colorId).label}（${sdsColorOption(colorId).promptLine}）`;
}

export function sdsProductLine(values: SdsValues): string {
    return `商品：参考图第 1 张为商品底图，商品 ID：${values.product?.assetId ?? "未选择"}`;
}

export function sdsPlacementLine(material: SdsMaterial, index: number): string {
    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    const tiling = sdsTilingPreset(material.tilingPresetId);
    return [
        `素材 ${index + 1}「${material.name}」`,
        `中心位置 (${percent(material.placement.x)}, ${percent(material.placement.y)})`,
        `缩放 ${percent(material.placement.scale)}`,
        `旋转 ${material.placement.rotation.toFixed(1)}°`,
        `平铺：${tiling.label}（${tiling.promptLine}）`,
    ].join("，");
}

/** 确定性贴合提示词：商品图 + 每个素材的几何/平铺 + 输出张数与素材一一对应。 */
export function buildSdsPrompt(values: SdsValues): string {
    const count = sdsExpectedOutputCount(values);
    const lines: string[] = [
        "素材贴合任务（SDS_DESIGN）",
        sdsProductLine(values),
        sdsColorLine(values.colorId),
        `素材数量：${count}（输出 ${count} 张，与素材一一对应，不合并、不遗漏）`,
        ...values.materials.map((material, index) => sdsPlacementLine(material, index)),
        "要求：保持商品本体的形状、材质纹理、光泽、褶皱和背景不变，只把素材按上述位置、缩放与旋转贴合到商品表面；",
        "素材纹理需随商品表面透视与光影变化，边缘自然过渡，不出现溢出、拉伸或重复接缝；",
        "每张输出只包含对应素材；不要改变商品颜色以外的其他细节。",
    ];
    return lines.join("\n");
}

/* ============================== 快照与漂移 ============================== */

export type SdsMaterialSnapshot = {
    assetId: string;
    name: string;
    tilingPresetId: SdsTilingPresetId;
    placement: SdsPlacement;
};

export type SdsSnapshot = {
    toolId: typeof SDS_DESIGN_TOOL_ID;
    productId: string;
    productName: string;
    colorId: string;
    imageName: string;
    materials: SdsMaterialSnapshot[];
    count: number;
    prompt: string;
    revision: number | string | null;
    requestId: string;
    fingerprint: string;
};

function hashParts(parts: readonly string[]): string {
    const joined = parts.join("|");
    let hash = 2166136261;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `sds-${(hash >>> 0).toString(16)}`;
}

export function sdsFingerprint(input: Omit<SdsSnapshot, "fingerprint" | "toolId">): string {
    return hashParts([
        SDS_DESIGN_TOOL_ID,
        input.productId,
        input.colorId,
        input.imageName,
        String(input.count),
        input.materials
            .map(
                (material) =>
                    `${material.assetId}:${material.tilingPresetId}:${material.placement.x.toFixed(3)},${material.placement.y.toFixed(3)},${material.placement.scale.toFixed(3)},${material.placement.rotation.toFixed(1)}`,
            )
            .join(";"),
        String(input.revision ?? ""),
        input.prompt,
    ]);
}

export function createSdsSnapshot(
    values: SdsValues,
    source: { revision: number | string | null; requestId: string },
): SdsSnapshot {
    const materials: SdsMaterialSnapshot[] = values.materials.map((material) => ({
        assetId: material.assetId,
        name: material.name,
        tilingPresetId: sdsTilingPreset(material.tilingPresetId).id,
        placement: { ...material.placement },
    }));
    const base = {
        productId: values.product?.assetId ?? "",
        productName: values.product?.name ?? "",
        colorId: values.colorId,
        imageName: values.imageName.trim(),
        materials,
        count: sdsExpectedOutputCount(values),
        prompt: buildSdsPrompt(values),
        revision: source.revision,
        requestId: source.requestId,
    };
    return { toolId: SDS_DESIGN_TOOL_ID, ...base, fingerprint: sdsFingerprint(base) };
}

export function isSdsSnapshotStale(snapshot: SdsSnapshot | undefined, current: SdsSnapshot | undefined): boolean {
    if (!snapshot) return false;
    if (!current) return true;
    return snapshot.fingerprint !== current.fingerprint;
}

/** “来自旧版本”的具体原因：换素材/换产品/改颜色/挪位置/改平铺/改名称/改数量。 */
export function describeSdsDrift(snapshot: SdsSnapshot | undefined, current: SdsSnapshot | undefined): string {
    if (!snapshot || !current) return "";
    const reasons: string[] = [];
    if (snapshot.imageName !== current.imageName) reasons.push("素材名称");
    if (snapshot.productId !== current.productId) reasons.push("商品");
    if (snapshot.colorId !== current.colorId) reasons.push("颜色");
    if (snapshot.count !== current.count) reasons.push("输出数量");
    const before = snapshot.materials;
    const after = current.materials;
    const beforeIds = before.map((material) => material.assetId).join(">");
    const afterIds = after.map((material) => material.assetId).join(">");
    if (beforeIds !== afterIds) {
        reasons.push("素材");
    } else {
        const geometryChanged = before.some((material, index) => {
            const next = after[index];
            return (
                material.placement.x !== next.placement.x ||
                material.placement.y !== next.placement.y ||
                material.placement.scale !== next.placement.scale ||
                material.placement.rotation !== next.placement.rotation
            );
        });
        if (geometryChanged) reasons.push("贴合位置");
        const tilingChanged = before.some((material, index) => material.tilingPresetId !== after[index].tilingPresetId);
        if (tilingChanged) reasons.push("平铺方式");
    }
    return reasons.join("、");
}

/* ============================== 草稿序列化 ============================== */

const sdsPlacementSchema = z.object({
    x: z.number(),
    y: z.number(),
    scale: z.number(),
    rotation: z.number(),
});

const sdsDraftSchema = z.object({
    imageName: z.string(),
    colorId: z.string(),
    productId: z.string().nullable(),
    productName: z.string().optional(),
    productWidth: z.number().optional(),
    productHeight: z.number().optional(),
    selectedMaterialId: z.string().nullable().optional(),
    materials: z.array(
        z.object({
            assetId: z.string(),
            name: z.string(),
            tilingPresetId: z.string(),
            placement: sdsPlacementSchema,
            width: z.number().optional(),
            height: z.number().optional(),
        }),
    ),
});

export type SdsDraft = z.infer<typeof sdsDraftSchema>;

/**
 * 草稿只存资产 id + 几何 + 名称，不存图片二进制（避免撑爆 localStorage）。
 * 页面恢复后用资产 id 重新取回记录；取不回时该素材回到“未就绪”状态。
 */
export function serializeSdsValues(values: SdsValues): SdsDraft {
    return {
        imageName: values.imageName,
        colorId: values.colorId,
        productId: values.product?.assetId ?? null,
        productName: values.product?.name,
        productWidth: values.product?.width,
        productHeight: values.product?.height,
        selectedMaterialId: values.selectedMaterialId,
        materials: values.materials.map((material) => ({
            assetId: material.assetId,
            name: material.name,
            tilingPresetId: material.tilingPresetId,
            placement: material.placement,
            ...(typeof material.width === "number" ? { width: material.width } : {}),
            ...(typeof material.height === "number" ? { height: material.height } : {}),
        })),
    };
}

export function parseSdsDraft(raw: unknown): SdsValues {
    const parsed = sdsDraftSchema.safeParse(raw);
    if (!parsed.success) return createSdsValues();
    const draft = parsed.data;
    const product: SdsProduct | null = draft.productId
        ? {
              assetId: draft.productId,
              name: draft.productName ?? draft.productId,
              ...(typeof draft.productWidth === "number" ? { width: draft.productWidth } : {}),
              ...(typeof draft.productHeight === "number" ? { height: draft.productHeight } : {}),
          }
        : null;
    const restored: SdsMaterial[] = draft.materials.map((material) => ({
        assetId: material.assetId,
        name: material.name,
        tilingPresetId: isSdsTilingPresetId(material.tilingPresetId) ? material.tilingPresetId : DEFAULT_SDS_TILING_PRESET,
        placement: material.placement,
        ...(typeof material.width === "number" ? { width: material.width } : {}),
        ...(typeof material.height === "number" ? { height: material.height } : {}),
    }));
    // 草稿可能被手改过：落位按可贴区域重新夹取，不让越界几何直接进提示词。
    const materials = sdsPlacementsForProduct(restored, product);
    return createSdsValues({
        imageName: draft.imageName,
        colorId: draft.colorId,
        product,
        materials,
        selectedMaterialId: draft.selectedMaterialId ?? null,
    });
}

/** 草稿里的资产 id 列表（页面按此回填 ToolAssetInput 的已选集合）。 */
export function sdsDraftAssetIds(draft: Pick<SdsDraft, "productId" | "materials">): { materials: string[]; productId: string | null } {
    return {
        materials: draft.materials.map((material) => material.assetId),
        productId: draft.productId ?? null,
    };
}
