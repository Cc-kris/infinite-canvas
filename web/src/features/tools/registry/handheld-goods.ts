/**
 * TASK-025：HANDHELD_GOODS「手持商品」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/18-handheld-goods.md
 *  - docs/V1.0/plan_linkfox_navigation/evidence/page-dom-20261028/HANDHELD_GOODS.json
 *    （真实文案：图片规则 / 上传商品图 / 从本地上传 / 10M以内，384*384 ~ 4096*4096 /
 *      选择手持姿势 / 手持的部位与姿势参考 / 选择生成张数 / 1 2 3 4 / 立即生成 / 生成结果）
 *  - 原站 https://www.linkfox.com/draw/handheld-goods 的工作区 DOM（证据级别 workspace_dom）
 *
 * 证据缺口（显式记录，不用假数据填坑）：
 *  - 原站姿势卡是**图片资产**，抓取到的 DOM 只保留了「选择手持姿势 / 手持的部位与姿势参考」
 *    两行文案与卡片容器，**没有姿势卡图片 URL，也没有姿势 id 列表**。
 *    因此本页的姿势库是本仓库定义的**结构化姿势契约**（手持部位 + 握持方式 + 视角 + 目标区域），
 *    卡片示意图由 `handheldGoodsPoseSvg()` 用确定性几何**本地绘制**（是示意图，不是原站截图，
 *    也绝不是生成结果）。`targetOriginUrl` 绑定这张本地示意图的 data URL，语义仍是
 *    「目标（姿势参考）原始资产地址」，来源可追溯，不是占位串。
 *  - `imageMaskUrl` / `targetMaskUrl`：规格 §2 只列出「商品图上传 / 手持姿势库 / 数量 / 结果」四组控件，
 *    本页没有蒙版编辑入口；这两个字段登记为 `not-applicable`（见 FIELD_BINDINGS），
 *    提交时不伪造蒙版 URL，接入 MaskEditor 后可直接启用（见 report.md 的集成需求）。
 */

import { getToolById } from "./index";
import { computeSnapshotHash } from "./area-repair";
import type { ToolSpec } from "../types";

export const HANDHELD_GOODS_TOOL_ID = "HANDHELD_GOODS";
export const HANDHELD_GOODS_SLUG = "handheld-goods";
export const HANDHELD_GOODS_ROUTE = "/tools/product-design/handheld-goods";
export const HANDHELD_GOODS_LAYOUT = "model" as const;
/** 草稿键与共享约定一致：`tool-draft:v1:<toolId>`（规格 §7）。 */
export const HANDHELD_GOODS_DRAFT_KEY = `tool-draft:v1:${HANDHELD_GOODS_TOOL_ID}`;

/** 商品图规则（规格 §2「商品图10M、384–4096」，DOM 文案「10M以内，384*384 ~ 4096*4096」）。 */
export const HANDHELD_GOODS_SOURCE_RULE = {
    maxBytes: 10 * 1024 * 1024,
    minSide: 384,
    maxSide: 4096,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
} as const;

/** 生成张数 1–4（DOM 文案「选择生成张数 1 2 3 4」）。 */
export const HANDHELD_GOODS_OUTPUT_OPTIONS = [1, 2, 3, 4] as const;
export type HandheldGoodsOutputNum = (typeof HANDHELD_GOODS_OUTPUT_OPTIONS)[number];
export const HANDHELD_GOODS_DEFAULT_OUTPUT: HandheldGoodsOutputNum = 1;

/* ------------------------------------------------------------------ *
 * 页签：modelTabType（手持部位）+ sceneTabType（场景类型）
 * ------------------------------------------------------------------ */

export type HandheldGoodsHandTab = "left-hand" | "right-hand" | "both-hands";
export type HandheldGoodsSceneTab = "studio" | "desk" | "outdoor";

export type HandheldGoodsHandTabOption = {
    id: HandheldGoodsHandTab;
    label: string;
    /** 部位说明，对应 DOM「手持的部位与姿势参考」。 */
    hint: string;
};

export const HANDHELD_GOODS_HAND_TABS: readonly HandheldGoodsHandTabOption[] = [
    { id: "left-hand", label: "左手", hint: "单手托举，商品朝外" },
    { id: "right-hand", label: "右手", hint: "单手抓握，拇指压在正面" },
    { id: "both-hands", label: "双手", hint: "双手共同持握，展示尺寸感" },
];

export type HandheldGoodsSceneTabOption = {
    id: HandheldGoodsSceneTab;
    label: string;
    instruction: string;
};

/**
 * 场景类型页签（规格 §7 明确要求绑定 `sceneTabType`）。
 * 证据缺口：原站 DOM 没有展开场景候选，这里的三个场景是本页定义的**结构化约束**，
 * 只影响提示词与指纹，不假装是原站选项。
 */
export const HANDHELD_GOODS_SCENE_TABS: readonly HandheldGoodsSceneTabOption[] = [
    { id: "studio", label: "纯色棚拍", instruction: "seamless studio backdrop, soft key light, no props" },
    { id: "desk", label: "桌面场景", instruction: "clean wooden desk surface with a plain wall behind" },
    { id: "outdoor", label: "户外自然光", instruction: "outdoor daylight, soft natural shadows, blurred greenery" },
];

/* ------------------------------------------------------------------ *
 * 姿势库（结构化契约 + 确定性示意图几何）
 * ------------------------------------------------------------------ */

export type HandheldGoodsGrip = "pinch" | "cradle" | "palms" | "fingers";

export type HandheldGoodsPose = {
    /** 绑定 ToolSpec `modelId`。 */
    id: string;
    label: string;
    hand: HandheldGoodsHandTab;
    grip: HandheldGoodsGrip;
    /** 手部倾角（度），驱动示意图形状，同时进入提示词。 */
    tilt: number;
    /** 提示词里的握持描述（英文，直接作为 provider 约束）。 */
    instruction: string;
    /** 目标区域（商品应出现的位置），归一化 0..1 坐标，供「目标区域双预览」使用。 */
    target: { x: number; y: number; w: number; h: number };
};

export const HANDHELD_GOODS_POSES: readonly HandheldGoodsPose[] = [
    {
        id: "left-cradle-front",
        label: "左手托底正面",
        hand: "left-hand",
        grip: "cradle",
        tilt: -8,
        instruction: "held in the left hand, palm supporting the base, product facing the camera",
        target: { x: 0.36, y: 0.34, w: 0.3, h: 0.34 },
    },
    {
        id: "left-pinch-edge",
        label: "左手捏边",
        hand: "left-hand",
        grip: "pinch",
        tilt: -14,
        instruction: "pinched by the left hand at its left edge, thumb on the front face",
        target: { x: 0.4, y: 0.3, w: 0.28, h: 0.38 },
    },
    {
        id: "left-open-palm",
        label: "左手摊掌展示",
        hand: "left-hand",
        grip: "palms",
        tilt: -4,
        instruction: "resting on an open left palm, fingers relaxed and visible",
        target: { x: 0.34, y: 0.36, w: 0.32, h: 0.3 },
    },
    {
        id: "left-low-angle",
        label: "左手略仰拍",
        hand: "left-hand",
        grip: "cradle",
        tilt: -18,
        instruction: "held low in the left hand, slight upward camera angle, product upright",
        target: { x: 0.38, y: 0.3, w: 0.29, h: 0.36 },
    },
    {
        id: "right-pinch-front",
        label: "右手捏握正面",
        hand: "right-hand",
        grip: "pinch",
        tilt: 12,
        instruction: "gripped in the right hand, thumb across the front, fingers wrapped behind",
        target: { x: 0.36, y: 0.32, w: 0.3, h: 0.36 },
    },
    {
        id: "right-cradle-prop",
        label: "右手托抬",
        hand: "right-hand",
        grip: "cradle",
        tilt: 8,
        instruction: "lifted on the right palm, forearm vertical, product tilted toward camera",
        target: { x: 0.34, y: 0.3, w: 0.3, h: 0.36 },
    },
    {
        id: "right-fingers-grip",
        label: "右手三指捏",
        hand: "right-hand",
        grip: "fingers",
        tilt: 16,
        instruction: "held between thumb and three fingers of the right hand at its top edge",
        target: { x: 0.38, y: 0.34, w: 0.28, h: 0.34 },
    },
    {
        id: "right-side-view",
        label: "右手侧面展示",
        hand: "right-hand",
        grip: "pinch",
        tilt: 22,
        instruction: "held by the right hand, product rotated 45 degrees to show its side profile",
        target: { x: 0.36, y: 0.32, w: 0.3, h: 0.34 },
    },
    {
        id: "both-palms-carry",
        label: "双手捧持",
        hand: "both-hands",
        grip: "palms",
        tilt: 0,
        instruction: "carried with both palms, both hands fully visible, product centered",
        target: { x: 0.32, y: 0.34, w: 0.34, h: 0.3 },
    },
    {
        id: "both-present-front",
        label: "双手并举展示",
        hand: "both-hands",
        grip: "cradle",
        tilt: 0,
        instruction: "presented forward with both hands, elbows bent, product facing camera",
        target: { x: 0.34, y: 0.3, w: 0.32, h: 0.36 },
    },
    {
        id: "both-tilt-open",
        label: "双手斜持",
        hand: "both-hands",
        grip: "fingers",
        tilt: -10,
        instruction: "held at a 20 degree tilt by both hands, fingers spread behind the product",
        target: { x: 0.34, y: 0.32, w: 0.32, h: 0.34 },
    },
    {
        id: "both-size-contrast",
        label: "双手尺寸对比",
        hand: "both-hands",
        grip: "palms",
        tilt: 4,
        instruction: "held with both hands to show real size, one hand at the base and one at the top",
        target: { x: 0.36, y: 0.28, w: 0.28, h: 0.4 },
    },
];

/** 检测类型（绑定 `checkType`）。规则集合由本页定义并在此登记，禁止运行时自由拼接。 */
export const HANDHELD_GOODS_CHECK_TYPES = [
    { id: "hand-contact", label: "手部接触与商品一致性", instruction: "verify finger contact follows the product surface and the product silhouette is intact" },
    { id: "goods-integrity", label: "仅商品完整性", instruction: "verify the product is complete: no cut edges, no repainted logo, no warped proportion" },
] as const;
export type HandheldGoodsCheckType = (typeof HANDHELD_GOODS_CHECK_TYPES)[number]["id"];
export const HANDHELD_GOODS_DEFAULT_CHECK_TYPE: HandheldGoodsCheckType = "hand-contact";

export function findHandheldGoodsPose(poseId: string | null | undefined): HandheldGoodsPose | undefined {
    if (!poseId) return undefined;
    return HANDHELD_GOODS_POSES.find((pose) => pose.id === poseId);
}

export function listHandheldGoodsPoses(tab: HandheldGoodsHandTab): HandheldGoodsPose[] {
    return HANDHELD_GOODS_POSES.filter((pose) => pose.hand === tab);
}

export function resolveHandheldGoodsHandTab(tab: string | null | undefined): HandheldGoodsHandTab {
    return HANDHELD_GOODS_HAND_TABS.some((option) => option.id === tab) ? (tab as HandheldGoodsHandTab) : HANDHELD_GOODS_HAND_TABS[0].id;
}

export function resolveHandheldGoodsSceneTab(tab: string | null | undefined): HandheldGoodsSceneTab {
    return HANDHELD_GOODS_SCENE_TABS.some((option) => option.id === tab) ? (tab as HandheldGoodsSceneTab) : HANDHELD_GOODS_SCENE_TABS[0].id;
}

export function resolveHandheldGoodsCheckType(value: string | null | undefined): HandheldGoodsCheckType {
    return HANDHELD_GOODS_CHECK_TYPES.some((option) => option.id === value) ? (value as HandheldGoodsCheckType) : HANDHELD_GOODS_DEFAULT_CHECK_TYPE;
}

export function handheldGoodsHandTabLabel(tab: HandheldGoodsHandTab): string {
    return HANDHELD_GOODS_HAND_TABS.find((option) => option.id === tab)?.label ?? tab;
}

/**
 * 姿势卡示意图（确定性几何，纯字符串，无 DOM）。
 * 用途：姿势库卡片缩略图 + 「目标区域预览」底图 + `targetOriginUrl` 的真实来源。
 * 明确声明：这是本地绘制的示意图，不是原站姿势卡图片，不冒充生成结果。
 */
export function handheldGoodsPoseSvg(pose: HandheldGoodsPose): string {
    const width = 240;
    const height = 240;
    const tilt = pose.tilt;
    const both = pose.hand === "both-hands";
    const mirrored = pose.hand === "right-hand";
    const region = pose.target;
    const targetRect = [
        `<rect x="${(region.x * width).toFixed(1)}" y="${(region.y * height).toFixed(1)}"`,
        ` width="${(region.w * width).toFixed(1)}" height="${(region.h * height).toFixed(1)}"`,
        ` rx="6" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 4" />`,
    ].join("");
    const hand = (offsetX: number, flip: number) =>
        [
            `<g transform="translate(${(offsetX + (flip < 0 ? 120 : 120)).toFixed(1)} 232) rotate(${(tilt * flip).toFixed(1)})">`,
            // 前臂
            `<rect x="-26" y="-96" width="52" height="100" rx="18" fill="#cbd5e1" opacity="0.55" />`,
            // 手掌
            `<ellipse cx="0" cy="-104" rx="34" ry="30" fill="#cbd5e1" opacity="0.8" />`,
            // 四指
            [0, 1, 2, 3]
                .map((index) => `<rect x="${-24 + index * 13}" y="${-146 + (pose.grip === "pinch" ? index * 4 : 0)}" width="10" height="${pose.grip === "pinch" ? 62 - index * 5 : 54}" rx="5" fill="#cbd5e1" opacity="0.9" />`)
                .join(""),
            // 拇指
            `<rect x="${flip > 0 ? 22 : -34}" y="-116" width="12" height="42" rx="6" fill="#cbd5e1" opacity="0.9" />`,
            `</g>`,
        ].join("");
    const hands = both ? `${hand(0, -1)}${hand(0, 1)}` : hand(0, mirrored ? 1 : -1);
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(pose.label)}">`,
        `<rect width="${width}" height="${height}" fill="#f8fafc" />`,
        `<rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="10" fill="#f1f5f9" />`,
        hands,
        targetRect,
        `</svg>`,
    ].join("");
}

function escapeXml(value: string): string {
    return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

/** 目标（姿势参考）原始资产：本地示意图的 data URL，可直接作为 `targetOriginUrl`。 */
export function handheldGoodsPoseReferenceUrl(pose: HandheldGoodsPose): string {
    const encoded = encodeURIComponent(handheldGoodsPoseSvg(pose))
        .replace(/%20/g, " ")
        .replace(/%3D/g, "=")
        .replace(/%3A/g, ":")
        .replace(/%2F/g, "/");
    return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/* ------------------------------------------------------------------ *
 * 页面状态
 * ------------------------------------------------------------------ */

export type HandheldGoodsState = {
    /** 绑定 `modelTabType`。 */
    modelTabType: HandheldGoodsHandTab;
    /** 绑定 `sceneTabType`。 */
    sceneTabType: HandheldGoodsSceneTab;
    /** 绑定 `modelId`（姿势卡 id）。 */
    modelId: string;
    /** 绑定 `outputNum`。 */
    outputNum: HandheldGoodsOutputNum;
    /** 绑定 `checkType`。 */
    checkType: HandheldGoodsCheckType;
};

export function createHandheldGoodsState(overrides: Partial<HandheldGoodsState> = {}): HandheldGoodsState {
    const modelTabType = resolveHandheldGoodsHandTab(overrides.modelTabType);
    const candidates = listHandheldGoodsPoses(modelTabType);
    const modelId = candidates.some((pose) => pose.id === overrides.modelId) ? (overrides.modelId as string) : (candidates[0]?.id ?? "");
    return {
        modelTabType,
        sceneTabType: resolveHandheldGoodsSceneTab(overrides.sceneTabType),
        modelId,
        outputNum: normalizeHandheldGoodsOutputNum(overrides.outputNum ?? HANDHELD_GOODS_DEFAULT_OUTPUT),
        checkType: resolveHandheldGoodsCheckType(overrides.checkType),
    };
}

export function normalizeHandheldGoodsOutputNum(value: unknown): HandheldGoodsOutputNum {
    const num = Number(value);
    if (!Number.isFinite(num)) return HANDHELD_GOODS_DEFAULT_OUTPUT;
    // 越界按区间收敛（0 → 1、99 → 4），比静默回落到 1 更符合「1–4 张」的步进控件语义。
    const clamped = Math.min(4, Math.max(1, Math.round(num)));
    return clamped as HandheldGoodsOutputNum;
}

/**
 * 切换手持部位页签：只换模特（姿势）候选，**不动**商品图、场景页签、张数与检测类型（规格 §3）。
 * 当前姿势不属于新页签时，回退到该页签第一张姿势，并返回 `poseChanged` 便于 UI 提示。
 */
export function switchHandheldGoodsHandTab(
    state: HandheldGoodsState,
    tab: HandheldGoodsHandTab,
): { state: HandheldGoodsState; poseChanged: boolean } {
    const modelTabType = resolveHandheldGoodsHandTab(tab);
    const candidates = listHandheldGoodsPoses(modelTabType);
    const keep = candidates.some((pose) => pose.id === state.modelId);
    const modelId = keep ? state.modelId : (candidates[0]?.id ?? "");
    return {
        state: { ...state, modelTabType, modelId },
        poseChanged: !keep,
    };
}

/** 切换场景页签：只换场景候选/提示词，不重置商品图与姿势（规格 §7「不重置商品图」）。 */
export function switchHandheldGoodsSceneTab(state: HandheldGoodsState, tab: HandheldGoodsSceneTab): HandheldGoodsState {
    return { ...state, sceneTabType: resolveHandheldGoodsSceneTab(tab) };
}

export function selectHandheldGoodsPose(state: HandheldGoodsState, poseId: string): HandheldGoodsState {
    const pose = findHandheldGoodsPose(poseId);
    if (!pose) return state;
    return { ...state, modelId: pose.id, modelTabType: pose.hand };
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

export type HandheldGoodsIssueCode =
    | "source-missing"
    | "pose-missing"
    | "output-invalid"
    | "source-mime"
    | "source-bytes"
    | "source-side"
    | "check-type-missing";

export type HandheldGoodsIssue = { code: HandheldGoodsIssueCode; field: string; message: string };

export type HandheldGoodsSourceMeta = {
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
};

/** 商品图自身的格式/体积/边长校验（规格 §2「10M、384–4096」）。 */
export function validateHandheldGoodsSource(meta: HandheldGoodsSourceMeta): HandheldGoodsIssue[] {
    const issues: HandheldGoodsIssue[] = [];
    const { maxBytes, minSide, maxSide, mimeTypes } = HANDHELD_GOODS_SOURCE_RULE;
    if (meta.mimeType && !(mimeTypes as readonly string[]).includes(meta.mimeType)) {
        issues.push({ code: "source-mime", field: "imageUrl", message: `只支持 ${mimeTypes.map((type) => type.replace("image/", "").toUpperCase()).join(" / ")} 格式` });
    }
    if (typeof meta.bytes === "number" && meta.bytes > maxBytes) {
        issues.push({ code: "source-bytes", field: "imageUrl", message: `图片 ${(meta.bytes / 1024 / 1024).toFixed(1)}M，超过 10M 上限` });
    }
    for (const [key, value] of [
        ["宽", meta.width],
        ["高", meta.height],
    ] as const) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
        if (value < minSide) {
            issues.push({ code: "source-side", field: "imageUrl", message: `${key}度 ${Math.round(value)}px 小于 384px` });
        } else if (value > maxSide) {
            issues.push({ code: "source-side", field: "imageUrl", message: `${key}度 ${Math.round(value)}px 超过 4096px` });
        }
    }
    return issues;
}

export type HandheldGoodsFormInput = {
    productUrl?: string;
    state: HandheldGoodsState;
    source?: HandheldGoodsSourceMeta;
};

/** 提交前校验：商品与姿势缺一不可（规格 §3）。 */
export function validateHandheldGoodsInput(input: HandheldGoodsFormInput): HandheldGoodsIssue[] {
    const issues: HandheldGoodsIssue[] = [];
    if (!input.productUrl || !input.productUrl.trim()) {
        issues.push({ code: "source-missing", field: "imageUrl", message: "请先上传手持商品图" });
    }
    if (!findHandheldGoodsPose(input.state.modelId)) {
        issues.push({ code: "pose-missing", field: "modelId", message: "请选择手持姿势" });
    }
    if (!(HANDHELD_GOODS_OUTPUT_OPTIONS as readonly number[]).includes(Number(input.state.outputNum))) {
        issues.push({ code: "output-invalid", field: "outputNum", message: "生成张数只能是 1–4" });
    }
    if (!HANDHELD_GOODS_CHECK_TYPES.some((option) => option.id === input.state.checkType)) {
        issues.push({ code: "check-type-missing", field: "checkType", message: "请选择检测类型" });
    }
    if (input.source) issues.push(...validateHandheldGoodsSource(input.source));
    return issues;
}

/* ------------------------------------------------------------------ *
 * 快照与指纹
 * ------------------------------------------------------------------ */

export type HandheldGoodsSnapshot = {
    toolId: typeof HANDHELD_GOODS_TOOL_ID;
    productAssetId: string;
    productName: string;
    productWidth: number;
    productHeight: number;
    modelId: string;
    modelTabType: HandheldGoodsHandTab;
    sceneTabType: HandheldGoodsSceneTab;
    checkType: HandheldGoodsCheckType;
    outputNum: HandheldGoodsOutputNum;
    version: number;
    draftRevision: number | string | null;
    clientOperationId: string;
    model?: string;
};

export type BuildHandheldGoodsSnapshotInput = {
    productAssetId: string;
    productName: string;
    productWidth?: number;
    productHeight?: number;
    state: HandheldGoodsState;
    version?: number;
    draftRevision?: number | string | null;
    clientOperationId: string;
    model?: string;
};

export function buildHandheldGoodsSnapshot(input: BuildHandheldGoodsSnapshotInput): HandheldGoodsSnapshot {
    return {
        toolId: HANDHELD_GOODS_TOOL_ID,
        productAssetId: input.productAssetId,
        productName: input.productName,
        productWidth: Math.max(0, Math.round(input.productWidth ?? 0)),
        productHeight: Math.max(0, Math.round(input.productHeight ?? 0)),
        modelId: input.state.modelId,
        modelTabType: input.state.modelTabType,
        sceneTabType: input.state.sceneTabType,
        checkType: input.state.checkType,
        outputNum: normalizeHandheldGoodsOutputNum(input.state.outputNum),
        version: input.version ?? 1,
        draftRevision: input.draftRevision ?? null,
        clientOperationId: input.clientOperationId,
        ...(input.model ? { model: input.model } : {}),
    };
}

/** 快照指纹：只包含会影响产出的输入；换姿势/换张数/换场景都会变，换不相关的东西不会变。 */
export function handheldGoodsSnapshotHash(snapshot: HandheldGoodsSnapshot): string {
    return computeSnapshotHash({
        toolId: snapshot.toolId,
        productAssetId: snapshot.productAssetId,
        productWidth: snapshot.productWidth,
        productHeight: snapshot.productHeight,
        modelId: snapshot.modelId,
        modelTabType: snapshot.modelTabType,
        sceneTabType: snapshot.sceneTabType,
        checkType: snapshot.checkType,
        outputNum: snapshot.outputNum,
        version: snapshot.version,
        model: snapshot.model ?? null,
    });
}

export function isHandheldGoodsSnapshotStale(
    previous: HandheldGoodsSnapshot | null | undefined,
    current: HandheldGoodsSnapshot | null | undefined,
): boolean {
    if (!previous || !current) return false;
    return handheldGoodsSnapshotHash(previous) !== handheldGoodsSnapshotHash(current);
}

/* ------------------------------------------------------------------ *
 * 提示词与请求字段
 * ------------------------------------------------------------------ */

export function handheldGoodsInstruction(snapshot: HandheldGoodsSnapshot): string {
    const pose = findHandheldGoodsPose(snapshot.modelId);
    const scene = HANDHELD_GOODS_SCENE_TABS.find((option) => option.id === snapshot.sceneTabType);
    const check = HANDHELD_GOODS_CHECK_TYPES.find((option) => option.id === snapshot.checkType);
    const parts = [
        "Photorealistic e-commerce product photo: the uploaded product",
        pose ? pose.instruction : "held in a hand",
        "Keep the product's shape, logo, text and colour exactly as in the reference; regenerate only the hand, arm and background.",
        "Fingers must wrap the product surface naturally with correct contact shadows, no fused fingers, no floating product.",
        scene ? scene.instruction : "",
        check ? `Quality check: ${check.instruction}.` : "",
        `Output ${snapshot.outputNum} image${snapshot.outputNum > 1 ? "s" : ""}.`,
    ];
    return parts.filter(Boolean).join(" ");
}

/** 每个 ToolSpec 字段在本页的落点；`output` 由结果回填，`not-applicable` 说明为何不发。 */
export type HandheldGoodsFieldBinding = {
    field: string;
    kind: "input" | "output" | "not-applicable";
    control: string;
    note?: string;
};

export const HANDHELD_GOODS_FIELD_BINDINGS: readonly HandheldGoodsFieldBinding[] = [
    { field: "checkType", kind: "input", control: "检测类型选择（手部接触 / 商品完整性）" },
    { field: "imageMaskUrl", kind: "not-applicable", control: "本页无 MaskEditor", note: "规格 §2 的四组控件不含蒙版编辑；接入 MaskEditor 后启用，不伪造 URL" },
    { field: "imageResultUrl", kind: "output", control: "任务成功后由结果资产回填，只读" },
    { field: "imageUrl", kind: "input", control: "上传商品图（10M、384–4096）" },
    { field: "modelId", kind: "input", control: "姿势库卡片（HANDHELD_GOODS_POSES）" },
    { field: "modelTabType", kind: "input", control: "手持部位页签（左手/右手/双手）" },
    { field: "outputNum", kind: "input", control: "生成张数 1–4" },
    { field: "sceneTabType", kind: "input", control: "场景类型页签（棚拍/桌面/户外）" },
    { field: "targetMaskUrl", kind: "not-applicable", control: "本页无 MaskEditor", note: "同上；目标区域以姿势卡示意图 + 归一化区域表达" },
    { field: "targetOriginUrl", kind: "input", control: "姿势参考（目标原始资产）自动绑定，只读" },
    { field: "targetResultUrl", kind: "output", control: "该子任务成功后自动写入" },
];

export type HandheldGoodsFieldUrls = {
    imageUrl: string;
    targetOriginUrl: string;
};

/** 提交载荷：11 个 ToolSpec 字段全部有明确落点（输入 6 个、输出 2 个、本页不适用 2 个被显式排除）。 */
export function composeHandheldGoodsFields(snapshot: HandheldGoodsSnapshot, urls: HandheldGoodsFieldUrls): Record<string, unknown> {
    return {
        checkType: snapshot.checkType,
        imageUrl: urls.imageUrl,
        modelId: snapshot.modelId,
        modelTabType: snapshot.modelTabType,
        outputNum: snapshot.outputNum,
        sceneTabType: snapshot.sceneTabType,
        targetOriginUrl: urls.targetOriginUrl,
    };
}

export type HandheldGoodsFieldAudit = {
    missing: string[];
    notApplicable: string[];
    unexpected: string[];
};

/** 字段审计：输入字段一个都不能缺，不适用字段要有登记理由，多出来的字段直接暴露。 */
export function auditHandheldGoodsFields(fields: Record<string, unknown>): HandheldGoodsFieldAudit {
    const missing = HANDHELD_GOODS_FIELD_BINDINGS.filter((binding) => binding.kind === "input")
        .map((binding) => binding.field)
        .filter((field) => {
            const value = fields[field];
            if (typeof value === "string") return !value.trim();
            return value === undefined || value === null;
        });
    const notApplicable = HANDHELD_GOODS_FIELD_BINDINGS.filter((binding) => binding.kind === "not-applicable").map((binding) => binding.field);
    const known = new Set(HANDHELD_GOODS_FIELD_BINDINGS.map((binding) => binding.field));
    // version / clientOperationId / draftRevision 是提交协议的元数据（序号、幂等键、草稿版本），
    // 不属于工具业务字段，但 buildHandheldGoodsInput 必须带上，故在审计里豁免。
    const protocol = new Set(["version", "clientOperationId", "draftRevision"]);
    const unexpected = Object.keys(fields).filter((field) => !known.has(field) && !protocol.has(field));
    return { missing, notApplicable, unexpected };
}

/* ------------------------------------------------------------------ *
 * 草稿 / 文案
 * ------------------------------------------------------------------ */

export type HandheldGoodsDraftValues = {
    modelTabType: HandheldGoodsHandTab;
    sceneTabType: HandheldGoodsSceneTab;
    modelId: string;
    outputNum: HandheldGoodsOutputNum;
    checkType: HandheldGoodsCheckType;
    productAssetId: string | null;
    productName: string | null;
};

export function serializeHandheldGoodsDraftValues(state: HandheldGoodsState, product?: { assetId?: string | null; name?: string | null }): Record<string, unknown> {
    return {
        modelTabType: state.modelTabType,
        sceneTabType: state.sceneTabType,
        modelId: state.modelId,
        outputNum: state.outputNum,
        checkType: state.checkType,
        productAssetId: product?.assetId ?? null,
        productName: product?.name ?? null,
    };
}

export function parseHandheldGoodsDraftValues(values: Record<string, unknown> | null | undefined): {
    state: HandheldGoodsState;
    product: { assetId: string | null; name: string | null };
} {
    const raw = values ?? {};
    const state = createHandheldGoodsState({
        modelTabType: typeof raw.modelTabType === "string" ? (raw.modelTabType as HandheldGoodsHandTab) : undefined,
        sceneTabType: typeof raw.sceneTabType === "string" ? (raw.sceneTabType as HandheldGoodsSceneTab) : undefined,
        modelId: typeof raw.modelId === "string" ? raw.modelId : undefined,
        outputNum: normalizeHandheldGoodsOutputNum(raw.outputNum),
        checkType: typeof raw.checkType === "string" ? (raw.checkType as HandheldGoodsCheckType) : undefined,
    });
    return {
        state,
        product: {
            assetId: typeof raw.productAssetId === "string" && raw.productAssetId ? raw.productAssetId : null,
            name: typeof raw.productName === "string" && raw.productName ? raw.productName : null,
        },
    };
}

export function handheldGoodsOutputLabel(outputNum: number): string {
    return `预计输出 ${normalizeHandheldGoodsOutputNum(outputNum)} 张`;
}

export function handheldGoodsResultName(fileName: string, index = 0): string {
    const base = (fileName || HANDHELD_GOODS_SLUG).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
    const suffix = index > 0 ? `-${index + 1}` : "";
    return `${base || HANDHELD_GOODS_SLUG}-handheld${suffix}.png`;
}

export function handheldGoodsPoseLabel(poseId: string): string {
    return findHandheldGoodsPose(poseId)?.label ?? "未选择姿势";
}

export function getHandheldGoodsSpec(): ToolSpec | undefined {
    return getToolById(HANDHELD_GOODS_TOOL_ID);
}
