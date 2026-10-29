/**
 * TASK-023：REPLACE_GOODS「商品替换」页面契约 + 纯逻辑（无 React / 无网络）。
 *
 * 事实来源：
 *  - docs/V1.0/plan_linkfox_navigation/page-specs/16-replace-goods.md
 *  - 共享注册表 web/src/features/tools/registry/index.ts#REPLACE_GOODS（makeType 12, layout replace）
 *  - 原站 https://www.linkfox.com/draw/product-replacement 的 workspace DOM 证据（page-specs §9）
 *
 * 本页与 PRODUCT_SCENE / NEW_REPLACE_BG_V2 的区别（同属商品图设计，但契约不同）：
 *  - 双输入：参考场景图（sourceImageUrl）+ 替换商品图（targetImageUrl），不是「一张图 + 背景描述」；
 *  - 目标商品在场景中的落位由**四角四边形**（quad）描述：透视（T）、扭曲（N / Ctrl+拖动）直接改写
 *    `targetConfig`，point/scale/rotate 是从四边形派生出来的读数，不是“简单缩放”；
 *  - 蒙版保护原场景：商品四边形之外默认整体锁定（保护），用户可用画笔补充锁定或擦除锁定区；
 *  - 多商品批量：每个 SKU 一份独立配置（画布、四边形、蒙版、变化程度），左右键切画布不串改。
 *
 * 真实边界：本文件只做几何/序列化/校验，不产生任何图片、不调用 provider、不伪造成功。
 */

import { computeSnapshotHash, type MaskStroke } from "./area-repair";
import { getToolById } from "./index";
import type { ToolSpec } from "../types";

export const REPLACE_GOODS_TOOL_ID = "REPLACE_GOODS";
export const REPLACE_GOODS_SLUG = "replace-goods";
export const REPLACE_GOODS_ROUTE = "/tools/product-design/replace-goods";
export const REPLACE_GOODS_LAYOUT = "replace" as const;
/** 草稿键与共享约定一致：`tool-draft:v1:<toolId>`（规格 §7）。 */
export const REPLACE_GOODS_DRAFT_KEY = `tool-draft:v1:${REPLACE_GOODS_TOOL_ID}`;

/** 规格 §2「生成尺寸 1024×1024」+「生成：4 张」。 */
export const REPLACE_GOODS_OUTPUT_SIZE = { width: 1024, height: 1024 } as const;
export const REPLACE_GOODS_OUTPUT_NUM = 4;
export const REPLACE_GOODS_OUTPUT_OPTIONS = [1, 2, 4] as const;
export const REPLACE_GOODS_RATIO = "1:1" as const;

/** 上传限制：与共享资产层一致（jpg/jpeg/png/webp，单张 20M）。 */
export const REPLACE_GOODS_UPLOAD_LIMITS = {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxBytes: 20 * 1024 * 1024,
    minSide: 64,
    maxSide: 8192,
} as const;
export const REPLACE_GOODS_UPLOAD_LABEL = "20M以内，jpg/jpeg/png/webp";

/** 规格 §2「场景变化程度：不变 / 高」——控制背景重绘幅度，不是提示词开关。 */
export const REPLACE_GOODS_SCENE_CHANGES = [
    { id: "none", label: "不变", hint: "背景、光影、道具保持原样，只换商品本体" },
    { id: "high", label: "高", hint: "按场景重新打光与投影，背景允许明显重绘" },
] as const;
export type ReplaceGoodsSceneChange = (typeof REPLACE_GOODS_SCENE_CHANGES)[number]["id"];
export const REPLACE_GOODS_DEFAULT_SCENE_CHANGE: ReplaceGoodsSceneChange = "none";

/** `cutoutProvider`：抠图引擎。local = 本机按四边外轮廓提取，model = 交给上游分开处理。 */
export const REPLACE_GOODS_CUTOUT_PROVIDERS = [
    { id: "local", label: "本地轮廓抠图" },
    { id: "model", label: "上游智能抠图" },
] as const;
export type ReplaceGoodsCutoutProvider = (typeof REPLACE_GOODS_CUTOUT_PROVIDERS)[number]["id"];

/** `denoiseStrength`：替换商品贴合场景时的去噪/纹理保真强度。 */
export const REPLACE_GOODS_DENOISE = { min: 0, max: 100, step: 5, defaultValue: 30 } as const;

/** 画布工具模式：规格 §2「透视 T / 扭曲 N，Ctrl+拖动扭曲」。 */
export const REPLACE_GOODS_WARP_MODES = [
    { id: "perspective", label: "透视", shortcut: "T", hint: "拖动一角，对边保持平行（单点透视）" },
    { id: "distort", label: "扭曲", shortcut: "N", hint: "自由拖动任意一角，Ctrl+拖动直接进入扭曲" },
] as const;
export type ReplaceGoodsWarpMode = (typeof REPLACE_GOODS_WARP_MODES)[number]["id"];
export const REPLACE_GOODS_DEFAULT_WARP_MODE: ReplaceGoodsWarpMode = "perspective";

/** 画布快捷键步长：方向键 4px / Shift 20px（归一化后按场景边长换算）。 */
export const REPLACE_GOODS_KEY_STEP = { move: 4, moveFast: 20, scale: 0.02, scaleFast: 0.06, rotate: 1, rotateFast: 5 } as const;
export const REPLACE_GOODS_HISTORY_LIMIT = 50;
export const REPLACE_GOODS_QUAD_LIMIT = 1.35;
export const REPLACE_GOODS_MASK_BRUSH = { min: 1, max: 200, defaultValue: 60 } as const;
export const REPLACE_GOODS_MAX_SKUS = 8;

/** 注册表里本工具的 22 个字段（顺序与 registry/index.ts 一致）。 */
export const REPLACE_GOODS_FIELD_KEYS = [
    "config",
    "cutoutProvider",
    "denoiseStrength",
    "height",
    "imageName",
    "imageOutputHeight",
    "imageOutputWidth",
    "imageUrl",
    "lockImageUrl",
    "maskUrl",
    "outputNum",
    "point",
    "ratio",
    "rotate",
    "scale",
    "sourceImageUrl",
    "sourceOriginUrl",
    "targetConfig",
    "targetImageUrl",
    "targetOriginUrl",
    "url",
    "width",
] as const;
export type ReplaceGoodsFieldKey = (typeof REPLACE_GOODS_FIELD_KEYS)[number];

/** 字段 → 页面控件 + 实际落点（提交时逐项自检，避免静默丢参）。 */
export const REPLACE_GOODS_FIELD_BINDINGS: readonly { field: ReplaceGoodsFieldKey; control: string; source: string }[] = [
    { field: "config", control: "页面配置快照", source: "变化程度/模式/SKU 列表序列化" },
    { field: "cutoutProvider", control: "抠图引擎卡片", source: "抠图引擎选择" },
    { field: "denoiseStrength", control: "去噪强度滑杆", source: "贴合强度" },
    { field: "height", control: "输出高度", source: "生成尺寸（1024）" },
    { field: "imageName", control: "场景文件名", source: "上传参考场景后自动填入" },
    { field: "imageOutputHeight", control: "输出高度", source: "生成尺寸（1024）" },
    { field: "imageOutputWidth", control: "输出宽度", source: "生成尺寸（1024）" },
    { field: "imageUrl", control: "参考场景", source: "sourceImageUrl 的当前可访问地址" },
    { field: "lockImageUrl", control: "锁定图层", source: "锁定层（原场景）地址" },
    { field: "maskUrl", control: "蒙版编辑器导出", source: "本机按四边形 + 画笔导出的 PNG" },
    { field: "outputNum", control: "生成数量", source: "4 张 / 可改 1·2·4" },
    { field: "point", control: "画布落位中心", source: "四边形质心（归一化）" },
    { field: "ratio", control: "输出比例", source: "1:1" },
    { field: "rotate", control: "旋转角", source: "四边形上边与水平线夹角" },
    { field: "scale", control: "缩放比例", source: "四边形面积 / 基准面积" },
    { field: "sourceImageUrl", control: "参考场景上传", source: "场景资产地址" },
    { field: "sourceOriginUrl", control: "参考场景", source: "场景资产原始地址（只读）" },
    { field: "targetConfig", control: "四边形/位置/缩放/旋转", source: "每 SKU 的 targetConfig" },
    { field: "targetImageUrl", control: "替换商品上传", source: "当前 SKU 商品资产地址" },
    { field: "targetOriginUrl", control: "替换商品", source: "当前 SKU 商品原始地址（只读）" },
    { field: "url", control: "来源链接", source: "当前参考场景地址" },
    { field: "width", control: "输出宽度", source: "生成尺寸（1024）" },
];

export function getReplaceGoodsSpec(): ToolSpec | undefined {
    return getToolById(REPLACE_GOODS_TOOL_ID);
}

/* ------------------------------------------------------------------ *
 * 几何：四边形（透视/扭曲）与派生读数
 * ------------------------------------------------------------------ */

export type ReplaceGoodsPoint = { x: number; y: number };
export type ReplaceGoodsCorner = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
export type ReplaceGoodsQuad = Record<ReplaceGoodsCorner, ReplaceGoodsPoint>;
export type ReplaceGoodsSize = { width: number; height: number };

export const REPLACE_GOODS_CORNERS: readonly ReplaceGoodsCorner[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

/** 角点 → 水平邻角 / 垂直邻角（透视模式保持对边平行时用）。 */
const CORNER_NEIGHBOURS: Record<ReplaceGoodsCorner, { horizontal: ReplaceGoodsCorner; vertical: ReplaceGoodsCorner }> = {
    topLeft: { horizontal: "topRight", vertical: "bottomLeft" },
    topRight: { horizontal: "topLeft", vertical: "bottomRight" },
    bottomRight: { horizontal: "bottomLeft", vertical: "topRight" },
    bottomLeft: { horizontal: "bottomRight", vertical: "topLeft" },
};

export type ReplaceGoodsTransform = { quad: ReplaceGoodsQuad };

export type ReplaceGoodsQuadFields = {
    point: ReplaceGoodsPoint;
    scale: number;
    rotate: number;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

export function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

export function clampQuadPoint(point: ReplaceGoodsPoint): ReplaceGoodsPoint {
    const limit = REPLACE_GOODS_QUAD_LIMIT;
    const x = Number.isFinite(point.x) ? Math.min(limit, Math.max(-(limit - 1), point.x)) : 0.5;
    const y = Number.isFinite(point.y) ? Math.min(limit, Math.max(-(limit - 1), point.y)) : 0.5;
    return { x: round4(x), y: round4(y) };
}

/** 归一化 fit 尺寸：目标商品按自身宽高比完整放入 1×1 场景后的外接尺寸（边长 0.35–0.9）。 */
export function fitSize(width: number, height: number): ReplaceGoodsSize {
    const safeWidth = width > 0 ? width : 1;
    const safeHeight = height > 0 ? height : 1;
    const scale = 0.7 / Math.max(safeWidth, safeHeight);
    return { width: round4(safeWidth * scale), height: round4(safeHeight * scale) };
}

/** 由中心/尺寸/角度构造四边形（初始落位、重置、滑杆改动都走这里）。 */
export function quadFromRect(center: ReplaceGoodsPoint, size: ReplaceGoodsSize, rotateDeg = 0): ReplaceGoodsQuad {
    const radians = (rotateDeg * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const hw = size.width / 2;
    const hh = size.height / 2;
    const point = (dx: number, dy: number) =>
        clampQuadPoint({ x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos });
    return {
        topLeft: point(-hw, -hh),
        topRight: point(hw, -hh),
        bottomRight: point(hw, hh),
        bottomLeft: point(-hw, hh),
    };
}

export function createTransform(size: ReplaceGoodsSize = { width: 0.7, height: 0.7 }, center: ReplaceGoodsPoint = { x: 0.5, y: 0.5 }): ReplaceGoodsTransform {
    return { quad: quadFromRect(center, size) };
}

export function quadCentroid(quad: ReplaceGoodsQuad): ReplaceGoodsPoint {
    const points = REPLACE_GOODS_CORNERS.map((corner) => quad[corner]);
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return { x: round4(x), y: round4(y) };
}

/** 鞋带公式面积（绝对值为四边形面积，用于 scale 读数与覆盖率判断）。 */
export function quadArea(quad: ReplaceGoodsQuad): number {
    const points = REPLACE_GOODS_CORNERS.map((corner) => quad[corner]);
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index]!;
        const next = points[(index + 1) % points.length]!;
        sum += current.x * next.y - next.x * current.y;
    }
    return Math.abs(sum) / 2;
}

export function quadBBox(quad: ReplaceGoodsQuad): { minX: number; minY: number; maxX: number; maxY: number } {
    const points = REPLACE_GOODS_CORNERS.map((corner) => quad[corner]);
    return {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
    };
}

/** 四边形落在 1×1 场景内的比例（0–1）。完全出界 → 0，提交必须被拦住。 */
export function quadCoverage(quad: ReplaceGoodsQuad): number {
    const area = quadArea(quad);
    if (area <= 0) return 0;
    const box = quadBBox(quad);
    const clippedWidth = Math.max(0, Math.min(1, box.maxX) - Math.max(0, box.minX));
    const clippedHeight = Math.max(0, Math.min(1, box.maxY) - Math.max(0, box.minY));
    const boxArea = Math.max(1e-9, (box.maxX - box.minX) * (box.maxY - box.minY));
    const insideRatio = (clippedWidth * clippedHeight) / boxArea;
    return round4(Math.min(1, insideRatio));
}

export function quadIsConvex(quad: ReplaceGoodsQuad): boolean {
    if (!isQuadShape(quad)) return false;
    const points = REPLACE_GOODS_CORNERS.map((corner) => quad[corner]);
    let sign = 0;
    for (let index = 0; index < points.length; index += 1) {
        const a = points[index]!;
        const b = points[(index + 1) % points.length]!;
        const c = points[(index + 2) % points.length]!;
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (Math.abs(cross) < 1e-9) continue;
        const current = Math.sign(cross);
        if (sign === 0) sign = current;
        else if (current !== sign) return false;
    }
    return true;
}

/** 校验四边形结构（四个角点齐全且都是有限数值），畸形数据只判无效、不抛错。 */
export function isQuadShape(value: unknown): value is ReplaceGoodsQuad {
    if (!value || typeof value !== "object") return false;
    return REPLACE_GOODS_CORNERS.every((corner) => {
        const point = (value as Record<string, unknown>)[corner] as ReplaceGoodsPoint | undefined;
        return Boolean(point) && Number.isFinite(point?.x) && Number.isFinite(point?.y);
    });
}

/**
 * 原站「优秀案例」的 quad → 本页四边形。
 *
 * 原站结构（真实下发，`/image/make-case/list`）：`{ point, width, height, scale, rotate, stage }`
 * - `point` 是缩放后目标框的左上角、`stage` 是画布像素尺寸；
 * - `width/height` 是未缩放的目标框像素尺寸，实际显示尺寸 = 尺寸 × scale。
 * 本页四边形是 0–1 归一化到场景的四个角点，因此这里做一次换算 + 旋转。
 */
export function quadFromCaseShape(raw: unknown): ReplaceGoodsQuad | null {
    if (!raw || typeof raw !== "object") return null;
    if (isQuadShape(raw)) return raw;

    const source = raw as {
        point?: { x?: number; y?: number };
        width?: number;
        height?: number;
        scale?: number;
        rotate?: number;
        stage?: { width?: number; height?: number };
    };
    const point = source.point;
    const stageWidth = Number(source.stage?.width);
    const stageHeight = Number(source.stage?.height);
    const width = Number(source.width);
    const height = Number(source.height);
    const scale = Number(source.scale) || 1;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    if (!(width > 0) || !(height > 0) || !(stageWidth > 0) || !(stageHeight > 0)) return null;

    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const center: ReplaceGoodsPoint = {
        x: (Number(point.x) + scaledWidth / 2) / stageWidth,
        y: (Number(point.y) + scaledHeight / 2) / stageHeight,
    };
    const size: ReplaceGoodsSize = { width: scaledWidth / stageWidth, height: scaledHeight / stageHeight };
    const rotate = Number(source.rotate);
    return quadFromRect(center, size, Number.isFinite(rotate) ? rotate : 0);
}

/** 由四边形反推 point / rotate / scale（scale 以 fit 面积为基准）。 */
export function deriveQuadFields(quad: ReplaceGoodsQuad, size: ReplaceGoodsSize): ReplaceGoodsQuadFields {
    const point = quadCentroid(quad);
    const top = { x: quad.topRight.x - quad.topLeft.x, y: quad.topRight.y - quad.topLeft.y };
    const rotate = round4((Math.atan2(top.y, top.x) * 180) / Math.PI);
    const baseArea = Math.max(1e-6, size.width * size.height);
    const scale = round4(Math.max(0.02, Math.min(6, quadArea(quad) / baseArea)));
    return { point, rotate, scale };
}

/** 平移整块四边形。 */
export function moveQuad(quad: ReplaceGoodsQuad, dx: number, dy: number): ReplaceGoodsQuad {
    const next = {} as ReplaceGoodsQuad;
    for (const corner of REPLACE_GOODS_CORNERS) {
        next[corner] = clampQuadPoint({ x: quad[corner].x + dx, y: quad[corner].y + dy });
    }
    return next;
}

export function rotateQuad(quad: ReplaceGoodsQuad, deltaDeg: number): ReplaceGoodsQuad {
    const center = quadCentroid(quad);
    const radians = (deltaDeg * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const next = {} as ReplaceGoodsQuad;
    for (const corner of REPLACE_GOODS_CORNERS) {
        const dx = quad[corner].x - center.x;
        const dy = quad[corner].y - center.y;
        next[corner] = clampQuadPoint({ x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos });
    }
    return next;
}

export function scaleQuad(quad: ReplaceGoodsQuad, factor: number): ReplaceGoodsQuad {
    const center = quadCentroid(quad);
    const safe = Number.isFinite(factor) && factor > 0 ? factor : 1;
    const next = {} as ReplaceGoodsQuad;
    for (const corner of REPLACE_GOODS_CORNERS) {
        next[corner] = clampQuadPoint({ x: center.x + (quad[corner].x - center.x) * safe, y: center.y + (quad[corner].y - center.y) * safe });
    }
    return next;
}

/**
 * 拖动一个角点：
 *  - `distort`（N / Ctrl+拖动）：只改这一个角，形成任意扭曲；
 *  - `perspective`（T）：改该角，并让两个邻角跟随对应坐标，保持对边平行（单点透视）。
 * 两种模式都改写 targetConfig 的四边形，而不是缩放整块。
 */
export function dragQuadCorner(quad: ReplaceGoodsQuad, corner: ReplaceGoodsCorner, target: ReplaceGoodsPoint, mode: ReplaceGoodsWarpMode): ReplaceGoodsQuad {
    const next: ReplaceGoodsQuad = { ...quad, [corner]: clampQuadPoint(target) };
    if (mode === "perspective") {
        const { horizontal, vertical } = CORNER_NEIGHBOURS[corner];
        next[horizontal] = clampQuadPoint({ x: next[horizontal].x, y: next[corner].y });
        next[vertical] = clampQuadPoint({ x: next[corner].x, y: next[vertical].y });
        // 对角保持不变 → 对边严格平行，这一点由测试锁定。
    }
    return next;
}

/* ------------------------------------------------------------------ *
 * 单应矩阵（四边形 → 场景坐标），供落位导引图与蒙版使用
 * ------------------------------------------------------------------ */

export type Homography = readonly number[];

/**
 * 单位正方形 (0,0)-(1,1) → 四边形 的 3×3 单应矩阵（行主序）。
 * 单位正方形的四角对应 TL/TR/BR/BL，与本文件角点顺序一致。
 */
export function homographyFromQuad(quad: ReplaceGoodsQuad): Homography {
    const x0 = quad.topLeft.x, y0 = quad.topLeft.y;
    const x1 = quad.topRight.x, y1 = quad.topRight.y;
    const x2 = quad.bottomRight.x, y2 = quad.bottomRight.y;
    const x3 = quad.bottomLeft.x, y3 = quad.bottomLeft.y;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
        a = x1 - x0;
        b = x2 - x1;
        c = x0;
        d = y1 - y0;
        e = y2 - y1;
        f = y0;
        g = 0;
        h = 0;
    } else {
        const denominator = dx1 * dy2 - dx2 * dy1;
        if (Math.abs(denominator) < 1e-12) {
            // 退化四边形（三点共线）：返回仿射近似，避免 NaN 传播，交由校验层拦截。
            return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
        }
        g = (dx3 * dy2 - dx2 * dy3) / denominator;
        h = (dx1 * dy3 - dx3 * dy1) / denominator;
        a = x1 - x0 + g * x1;
        b = x3 - x0 + h * x3;
        c = x0;
        d = y1 - y0 + g * y1;
        e = y3 - y0 + h * y3;
        f = y0;
    }
    return [a, b, c, d, e, f, g, h, 1];
}

export function projectQuadPoint(matrix: Homography, point: ReplaceGoodsPoint): ReplaceGoodsPoint {
    const [a, b, c, d, e, f, g, h, i] = matrix as [number, number, number, number, number, number, number, number, number];
    const w = g * point.x + h * point.y + i || 1e-9;
    return { x: round4((a * point.x + b * point.y + c) / w), y: round4((d * point.x + e * point.y + f) / w) };
}

/** 源三角形(单位正方形) → 目标三角形 的仿射矩阵，供分段贴图（真实透视绘制）使用。 */
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

export function affineFromTriangles(
    source: readonly [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint],
    target: readonly [ReplaceGoodsPoint, ReplaceGoodsPoint, ReplaceGoodsPoint],
): Affine {
    const [s0, s1, s2] = source;
    const [t0, t1, t2] = target;
    const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
    if (Math.abs(det) < 1e-12) return { a: 1, b: 0, c: t0.x, d: 0, e: 1, f: t0.y };
    const a = ((t1.x - t0.x) * (s2.y - s0.y) - (t2.x - t0.x) * (s1.y - s0.y)) / det;
    const b = ((t2.x - t0.x) * (s1.x - s0.x) - (t1.x - t0.x) * (s2.x - s0.x)) / det;
    const d = ((t1.y - t0.y) * (s2.y - s0.y) - (t2.y - t0.y) * (s1.y - s0.y)) / det;
    const e = ((t2.y - t0.y) * (s1.x - s0.x) - (t1.y - t0.y) * (s2.x - s0.x)) / det;
    return { a, b, c: t0.x - a * s0.x - b * s0.y, d, e, f: t0.y - d * s0.x - e * s0.y };
}

/* ------------------------------------------------------------------ *
 * 变换撤销栈（画布工具必须有撤销/重做，规格 §6）
 * ------------------------------------------------------------------ */

export type ReplaceGoodsHistory = {
    past: ReplaceGoodsTransform[];
    present: ReplaceGoodsTransform;
    future: ReplaceGoodsTransform[];
};

export function createTransformHistory(present: ReplaceGoodsTransform = createTransform()): ReplaceGoodsHistory {
    return { past: [], present, future: [] };
}

export function commitTransform(history: ReplaceGoodsHistory, next: ReplaceGoodsTransform): ReplaceGoodsHistory {
    if (JSON.stringify(next.quad) === JSON.stringify(history.present.quad)) return history;
    const past = [...history.past, history.present].slice(-REPLACE_GOODS_HISTORY_LIMIT);
    return { past, present: next, future: [] };
}

export function undoTransform(history: ReplaceGoodsHistory): ReplaceGoodsHistory {
    if (history.past.length === 0) return history;
    const previous = history.past[history.past.length - 1]!;
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redoTransform(history: ReplaceGoodsHistory): ReplaceGoodsHistory {
    if (history.future.length === 0) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present].slice(-REPLACE_GOODS_HISTORY_LIMIT), present: next!, future: rest };
}

export function resetTransform(history: ReplaceGoodsHistory, size: ReplaceGoodsSize): ReplaceGoodsHistory {
    return commitTransform(history, createTransform(size));
}

export function transformHistoryLabel(history: ReplaceGoodsHistory) {
    return { canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

/* ------------------------------------------------------------------ *
 * 蒙版：商品四边形之外默认锁定（保护原场景），画笔可补锁/擦除
 * ------------------------------------------------------------------ */

export type ReplaceGoodsMask = {
    /** auto：四边形外全部保护；manual：只用画笔（不自动保护背景）。 */
    mode: "auto" | "manual";
    strokes: MaskStroke[];
    brush: number;
};

export function createMask(overrides: Partial<ReplaceGoodsMask> = {}): ReplaceGoodsMask {
    return { mode: "auto", strokes: [], brush: REPLACE_GOODS_MASK_BRUSH.defaultValue, ...overrides };
}

export function pointInQuad(quad: ReplaceGoodsQuad, point: ReplaceGoodsPoint): boolean {
    const points = REPLACE_GOODS_CORNERS.map((corner) => quad[corner]);
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const current = points[index]!;
        const prior = points[previous]!;
        const intersects = current.y > point.y !== prior.y > point.y && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y || 1e-9) + current.x;
        if (intersects) inside = !inside;
    }
    return inside;
}

/**
 * 保护蒙版的真实像素栅格（255=锁定/保护，0=允许改写）。
 * 纯函数：适配器把它写进 canvas ImageData 导出 PNG，界面用同一份数据画遮罩，保证「看到的就是发出去的」。
 */
export function protectMaskGrid(options: { width: number; height: number; quad: ReplaceGoodsQuad; mask: ReplaceGoodsMask }): Uint8Array {
    const width = Math.max(1, Math.round(options.width));
    const height = Math.max(1, Math.round(options.height));
    const grid = new Uint8Array(width * height);
    if (options.mask.mode === "auto") {
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const inside = pointInQuad(options.quad, { x: (x + 0.5) / width, y: (y + 0.5) / height });
                grid[y * width + x] = inside ? 0 : 255;
            }
        }
    }
    for (const stroke of options.mask.strokes) {
        stampStroke(grid, width, height, stroke);
    }
    return grid;
}

function stampStroke(grid: Uint8Array, width: number, height: number, stroke: MaskStroke) {
    const value = stroke.tool === "eraser" ? 0 : 255;
    const radius = Math.max(0.5, stroke.size / 2);
    const points = stroke.points.map((point) => ({ x: point.x * width, y: point.y * height }));
    if (points.length === 0) return;
    const stamp = (x: number, y: number) => {
        const minX = Math.max(0, Math.floor(x - radius));
        const maxX = Math.min(width - 1, Math.ceil(x + radius));
        const minY = Math.max(0, Math.floor(y - radius));
        const maxY = Math.min(height - 1, Math.ceil(y + radius));
        for (let py = minY; py <= maxY; py += 1) {
            for (let px = minX; px <= maxX; px += 1) {
                if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) grid[py * width + px] = value;
            }
        }
    };
    stamp(points[0]!.x, points[0]!.y);
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1]!;
        const to = points[index]!;
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
        for (let step = 1; step <= steps; step += 1) {
            const t = step / steps;
            stamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        }
    }
}

export function protectMaskCoverage(mask: ReplaceGoodsMask, quad: ReplaceGoodsQuad): number {
    const grid = protectMaskGrid({ width: 96, height: 96, quad, mask });
    let protectedPixels = 0;
    for (let index = 0; index < grid.length; index += 1) if (grid[index]! > 127) protectedPixels += 1;
    return round4(protectedPixels / grid.length);
}

/* ------------------------------------------------------------------ *
 * 工作区状态：参考场景 + 多个 SKU（每个 SKU 一份独立四边形/蒙版/变化程度）
 * ------------------------------------------------------------------ */

export type ReplaceGoodsScene = {
    assetId: string;
    name: string;
    /** 当前可访问地址（dataURL 或对象地址），提交时进 sourceImageUrl/imageUrl/url。 */
    url: string;
    /** 原始地址（未加工），进 sourceOriginUrl。 */
    originUrl: string;
    width: number;
    height: number;
};

export type ReplaceGoodsSku = {
    id: string;
    label: string;
    targetAssetId: string;
    targetName: string;
    targetUrl: string;
    targetOriginUrl: string;
    targetWidth: number;
    targetHeight: number;
    /** 归一化 fit 尺寸，scale 读数与初始落位都以它为基准。 */
    fit: ReplaceGoodsSize;
    history: ReplaceGoodsHistory;
    mask: ReplaceGoodsMask;
    sceneChange: ReplaceGoodsSceneChange;
};

export type ReplaceGoodsWorkspace = {
    scene: ReplaceGoodsScene | null;
    skus: ReplaceGoodsSku[];
    activeSkuId: string;
    mode: ReplaceGoodsWarpMode;
    denoiseStrength: number;
    cutoutProvider: ReplaceGoodsCutoutProvider;
    outputNum: number;
};

export function createSku(options: { id: string; label: string; fit?: ReplaceGoodsSize }): ReplaceGoodsSku {
    const fit = options.fit ?? { width: 0.7, height: 0.7 };
    return {
        id: options.id,
        label: options.label,
        targetAssetId: "",
        targetName: "",
        targetUrl: "",
        targetOriginUrl: "",
        targetWidth: 0,
        targetHeight: 0,
        fit,
        history: createTransformHistory(createTransform(fit)),
        mask: createMask(),
        sceneChange: REPLACE_GOODS_DEFAULT_SCENE_CHANGE,
    };
}

export function createWorkspace(overrides: Partial<ReplaceGoodsWorkspace> = {}): ReplaceGoodsWorkspace {
    const first = createSku({ id: "sku-1", label: "商品 1" });
    return {
        scene: null,
        skus: [first],
        activeSkuId: first.id,
        mode: REPLACE_GOODS_DEFAULT_WARP_MODE,
        denoiseStrength: REPLACE_GOODS_DENOISE.defaultValue,
        cutoutProvider: "local",
        outputNum: REPLACE_GOODS_OUTPUT_NUM,
        ...overrides,
    };
}

export function activeSku(workspace: ReplaceGoodsWorkspace): ReplaceGoodsSku | undefined {
    return workspace.skus.find((sku) => sku.id === workspace.activeSkuId) ?? workspace.skus[0];
}

export function activeSkuIndex(workspace: ReplaceGoodsWorkspace): number {
    const index = workspace.skus.findIndex((sku) => sku.id === workspace.activeSkuId);
    return index >= 0 ? index : 0;
}

/** 左右键切换画布：循环，且不改变各 SKU 自己的四边形/蒙版。 */
export function switchSku(workspace: ReplaceGoodsWorkspace, direction: -1 | 1): ReplaceGoodsWorkspace {
    if (workspace.skus.length <= 1) return workspace;
    const index = activeSkuIndex(workspace);
    const next = (index + direction + workspace.skus.length) % workspace.skus.length;
    return { ...workspace, activeSkuId: workspace.skus[next]!.id };
}

export function updateSku(workspace: ReplaceGoodsWorkspace, skuId: string, patch: Partial<ReplaceGoodsSku>): ReplaceGoodsWorkspace {
    return { ...workspace, skus: workspace.skus.map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku)) };
}

/** 提交一次画布变换（进撤销栈）。 */
export function applyQuad(workspace: ReplaceGoodsWorkspace, quad: ReplaceGoodsQuad): ReplaceGoodsWorkspace {
    const sku = activeSku(workspace);
    if (!sku) return workspace;
    const history = commitTransform(sku.history, { quad });
    return updateSku(workspace, sku.id, { history });
}

export function addSku(workspace: ReplaceGoodsWorkspace): ReplaceGoodsWorkspace {
    if (workspace.skus.length >= REPLACE_GOODS_MAX_SKUS) return workspace;
    const index = workspace.skus.length + 1;
    const sku = createSku({ id: `sku-${Date.now().toString(36)}-${index}`, label: `商品 ${index}` });
    return { ...workspace, skus: [...workspace.skus, sku], activeSkuId: sku.id };
}

export function removeSku(workspace: ReplaceGoodsWorkspace, skuId: string): ReplaceGoodsWorkspace {
    if (workspace.skus.length <= 1) return workspace;
    const skus = workspace.skus.filter((sku) => sku.id !== skuId);
    const activeSkuId = workspace.activeSkuId === skuId ? skus[0]!.id : workspace.activeSkuId;
    return { ...workspace, skus, activeSkuId };
}

/* ------------------------------------------------------------------ *
 * 校验（提交必须被拦住的具体原因，不是一句「参数错误」）
 * ------------------------------------------------------------------ */

export type ReplaceGoodsIssue = { code: string; message: string };

export const REPLACE_GOODS_MIN_QUAD_COVERAGE = 0.05;
/** 四边形面积下限（占场景面积比例）：退化到几个像素的落位没有可编辑意义，直接拦住。 */
export const REPLACE_GOODS_MIN_QUAD_AREA = 0.01;

export function validateWorkspace(workspace: ReplaceGoodsWorkspace): ReplaceGoodsIssue[] {
    const issues: ReplaceGoodsIssue[] = [];
    if (!workspace.scene) issues.push({ code: "scene-missing", message: "请先上传参考场景图" });
    else if (!workspace.scene.url) issues.push({ code: "scene-url", message: "参考场景地址为空，请重新上传" });
    if (workspace.skus.length === 0) issues.push({ code: "sku-missing", message: "至少需要一个替换商品" });
    for (const sku of workspace.skus) {
        if (!sku.targetAssetId) issues.push({ code: "target-missing", message: `${sku.label}：请上传替换商品图` });
        const quad = sku.history.present.quad;
        if (!quadIsConvex(quad)) issues.push({ code: "quad-invalid", message: `${sku.label}：定位四边形已自交，请调整角点` });
        if (quadCoverage(quad) < REPLACE_GOODS_MIN_QUAD_COVERAGE) {
            issues.push({ code: "quad-outside", message: `${sku.label}：商品已移出画布，请拖回场景内` });
        }
        if (quadArea(quad) < REPLACE_GOODS_MIN_QUAD_AREA) {
            issues.push({ code: "quad-too-small", message: `${sku.label}：定位区域过小，请放大到能覆盖整件商品` });
        }
        if (quadArea(quad) >= 0.98) issues.push({ code: "quad-too-large", message: `${sku.label}：商品几乎覆盖整幅场景，请缩小` });
    }
    if (workspace.outputNum < 1) issues.push({ code: "output-num", message: "生成数量至少 1" });
    return issues;
}

export function validateUnit(sku: ReplaceGoodsSku, scene: ReplaceGoodsScene | null): ReplaceGoodsIssue[] {
    return validateWorkspace({ ...createWorkspace(), scene, skus: [sku], activeSkuId: sku.id });
}

/* ------------------------------------------------------------------ *
 * 快照 + 22 字段合成（防丢参）
 * ------------------------------------------------------------------ */

export type ReplaceGoodsUnitSnapshot = {
    toolId: string;
    sceneAssetId: string;
    sceneName: string;
    sceneWidth: number;
    sceneHeight: number;
    sourceUrl: string;
    sourceOriginUrl: string;
    lockImageUrl: string;
    skuId: string;
    skuLabel: string;
    targetAssetId: string;
    targetName: string;
    targetUrl: string;
    targetOriginUrl: string;
    targetWidth: number;
    targetHeight: number;
    point: ReplaceGoodsPoint;
    scale: number;
    rotate: number;
    quad: ReplaceGoodsQuad;
    maskHash: string;
    protectCoverage: number;
    sceneChange: ReplaceGoodsSceneChange;
    denoiseStrength: number;
    cutoutProvider: ReplaceGoodsCutoutProvider;
    warpMode: ReplaceGoodsWarpMode;
    outputNum: number;
    size: ReplaceGoodsSize;
    ratio: string;
    skuCount: number;
    skuIds: string[];
    clientOperationId: string;
    draftRevision: number;
};

export function buildUnitSnapshot(options: {
    workspace: ReplaceGoodsWorkspace;
    sku: ReplaceGoodsSku;
    clientOperationId?: string;
    draftRevision?: number;
}): ReplaceGoodsUnitSnapshot {
    const { workspace, sku } = options;
    const scene = workspace.scene;
    const fields = deriveQuadFields(sku.history.present.quad, sku.fit);
    return {
        toolId: REPLACE_GOODS_TOOL_ID,
        sceneAssetId: scene?.assetId ?? "",
        sceneName: scene?.name ?? "",
        sceneWidth: scene?.width ?? 0,
        sceneHeight: scene?.height ?? 0,
        sourceUrl: scene?.url ?? "",
        sourceOriginUrl: scene?.originUrl || scene?.url || "",
        lockImageUrl: scene?.url ?? "",
        skuId: sku.id,
        skuLabel: sku.label,
        targetAssetId: sku.targetAssetId,
        targetName: sku.targetName,
        targetUrl: sku.targetUrl,
        targetOriginUrl: sku.targetOriginUrl || sku.targetUrl,
        targetWidth: sku.targetWidth,
        targetHeight: sku.targetHeight,
        point: fields.point,
        scale: fields.scale,
        rotate: fields.rotate,
        quad: sku.history.present.quad,
        maskHash: computeSnapshotHash({ quad: sku.history.present.quad, mode: sku.mask.mode, strokes: sku.mask.strokes }),
        protectCoverage: protectMaskCoverage(sku.mask, sku.history.present.quad),
        sceneChange: sku.sceneChange,
        denoiseStrength: workspace.denoiseStrength,
        cutoutProvider: workspace.cutoutProvider,
        warpMode: workspace.mode,
        outputNum: workspace.outputNum,
        size: { ...REPLACE_GOODS_OUTPUT_SIZE },
        ratio: REPLACE_GOODS_RATIO,
        skuCount: workspace.skus.length,
        skuIds: workspace.skus.map((item) => item.id),
        clientOperationId: options.clientOperationId ?? "",
        draftRevision: options.draftRevision ?? 0,
    };
}

export function unitSnapshotHash(snapshot: ReplaceGoodsUnitSnapshot): string {
    return computeSnapshotHash(snapshot);
}

export function isUnitSnapshotStale(previous: string, snapshot: ReplaceGoodsUnitSnapshot): boolean {
    return previous !== unitSnapshotHash(snapshot);
}

/** 22 个字段的最终请求体。maskUrl 由适配器本机导出的真实 PNG 提供。 */
export function composeReplaceGoodsFields(snapshot: ReplaceGoodsUnitSnapshot, extra: { maskUrl: string }): Record<ReplaceGoodsFieldKey, unknown> {
    const config = {
        sceneChange: snapshot.sceneChange,
        cutoutProvider: snapshot.cutoutProvider,
        denoiseStrength: snapshot.denoiseStrength,
        outputSize: snapshot.size,
        ratio: snapshot.ratio,
        skuCount: snapshot.skuCount,
        skuIds: snapshot.skuIds,
        protectCoverage: snapshot.protectCoverage,
        warpMode: snapshot.warpMode,
        clientOperationId: snapshot.clientOperationId,
        draftRevision: snapshot.draftRevision,
    };
    const targetConfig = {
        skuId: snapshot.skuId,
        skuLabel: snapshot.skuLabel,
        quad: snapshot.quad,
        point: snapshot.point,
        scale: snapshot.scale,
        rotate: snapshot.rotate,
        targetSize: { width: snapshot.targetWidth, height: snapshot.targetHeight },
        sceneChange: snapshot.sceneChange,
        targetAssetId: snapshot.targetAssetId,
    };
    return {
        config,
        cutoutProvider: snapshot.cutoutProvider,
        denoiseStrength: snapshot.denoiseStrength,
        height: snapshot.size.height,
        imageName: snapshot.sceneName,
        imageOutputHeight: snapshot.size.height,
        imageOutputWidth: snapshot.size.width,
        imageUrl: snapshot.sourceUrl,
        lockImageUrl: snapshot.lockImageUrl,
        maskUrl: extra.maskUrl,
        outputNum: snapshot.outputNum,
        point: snapshot.point,
        ratio: snapshot.ratio,
        rotate: snapshot.rotate,
        scale: snapshot.scale,
        sourceImageUrl: snapshot.sourceUrl,
        sourceOriginUrl: snapshot.sourceOriginUrl,
        targetConfig,
        targetImageUrl: snapshot.targetUrl,
        targetOriginUrl: snapshot.targetOriginUrl,
        url: snapshot.sourceUrl,
        width: snapshot.size.width,
    };
}

/** 22 字段缺项自检：任何一项为空即抛错（静默丢参在测试和运行时都会被打断）。 */
export function missingReplaceGoodsFields(fields: Record<string, unknown>): ReplaceGoodsFieldKey[] {
    return REPLACE_GOODS_FIELD_KEYS.filter((key) => {
        const value = fields[key];
        if (value === undefined || value === null) return true;
        if (typeof value === "string") return value.trim() === "";
        if (typeof value === "number") return !Number.isFinite(value);
        return false;
    });
}

export const REPLACE_GOODS_PROMPT_MAX = 800;

export function composeReplaceGoodsPrompt(snapshot: ReplaceGoodsUnitSnapshot): string {
    const change = REPLACE_GOODS_SCENE_CHANGES.find((item) => item.id === snapshot.sceneChange)?.label ?? "不变";
    const point = `${Math.round(snapshot.point.x * 100)}%,${Math.round(snapshot.point.y * 100)}%`;
    const text = [
        "第 1 张是参考场景，第 2 张是替换商品",
        snapshot.skuCount > 1 ? `（第 ${snapshot.skuIds.indexOf(snapshot.skuId) + 1}/${snapshot.skuCount} 个商品）` : "",
        "。把场景里的原商品整体换成第 2 张图中的商品：保留原商品的透视、朝向、接触面与投影关系，",
        `落位按导引图四边形（中心 ${point}，缩放 ${snapshot.scale.toFixed(2)}×，旋转 ${Math.round(snapshot.rotate)}°）贴合；`,
        "商品材质、纹理、logo 与颜色严格来自第 2 张图，不要凭空重绘商品本体；",
        "导引图或蒙版中白色锁定区域（场景、道具、背景）不得改动；",
        `场景变化程度：${change}。`,
        snapshot.sceneChange === "none" ? "背景保持原样，只重算新商品的受光与落地阴影。" : "按场景重新打光，允许背景适度重绘但保持构图与镜头一致。",
        "输出 1:1 方形成片，不要残留原商品边缘或重影。",
    ]
        .filter(Boolean)
        .join("")
        .slice(0, REPLACE_GOODS_PROMPT_MAX);
    return text;
}

/* ------------------------------------------------------------------ *
 * 草稿（刷新恢复）：只存可重建的参数，不存图片二进制
 * ------------------------------------------------------------------ */

export type ReplaceGoodsDraftValues = {
    mode: ReplaceGoodsWarpMode;
    denoiseStrength: number;
    cutoutProvider: ReplaceGoodsCutoutProvider;
    outputNum: number;
    activeSkuId: string;
    skus: {
        id: string;
        label: string;
        targetAssetId: string;
        targetName: string;
        targetWidth: number;
        targetHeight: number;
        sceneChange: ReplaceGoodsSceneChange;
        quad: ReplaceGoodsQuad;
        maskMode: ReplaceGoodsMask["mode"];
        maskStrokes: MaskStroke[];
        maskBrush: number;
    }[];
};

export function serializeDraftValues(workspace: ReplaceGoodsWorkspace): Record<string, unknown> {
    const draft: ReplaceGoodsDraftValues = {
        mode: workspace.mode,
        denoiseStrength: workspace.denoiseStrength,
        cutoutProvider: workspace.cutoutProvider,
        outputNum: workspace.outputNum,
        activeSkuId: workspace.activeSkuId,
        skus: workspace.skus.map((sku) => ({
            id: sku.id,
            label: sku.label,
            targetAssetId: sku.targetAssetId,
            targetName: sku.targetName,
            targetWidth: sku.targetWidth,
            targetHeight: sku.targetHeight,
            sceneChange: sku.sceneChange,
            quad: sku.history.present.quad,
            maskMode: sku.mask.mode,
            maskStrokes: sku.mask.strokes,
            maskBrush: sku.mask.brush,
        })),
    };
    return { draftVersion: 1, ...draft };
}

function asPoint(value: unknown, fallback: ReplaceGoodsPoint): ReplaceGoodsPoint {
    if (!value || typeof value !== "object") return fallback;
    const record = value as Record<string, unknown>;
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
    return clampQuadPoint({ x, y });
}

export function parseDraftValues(values: Record<string, unknown> = {}): ReplaceGoodsWorkspace | null {
    const rawSkus = values.skus;
    if (!Array.isArray(rawSkus) || rawSkus.length === 0) return null;
    const mode = REPLACE_GOODS_WARP_MODES.some((item) => item.id === values.mode) ? (values.mode as ReplaceGoodsWarpMode) : REPLACE_GOODS_DEFAULT_WARP_MODE;
    const cutout = REPLACE_GOODS_CUTOUT_PROVIDERS.some((item) => item.id === values.cutoutProvider)
        ? (values.cutoutProvider as ReplaceGoodsCutoutProvider)
        : "local";
    const denoise = Number(values.denoiseStrength);
    const outputNum = Number(values.outputNum);
    const skus: ReplaceGoodsSku[] = rawSkus.slice(0, REPLACE_GOODS_MAX_SKUS).map((raw, index) => {
        const record = (raw ?? {}) as Record<string, unknown>;
        const width = Number(record.targetWidth) > 0 ? Number(record.targetWidth) : 0;
        const height = Number(record.targetHeight) > 0 ? Number(record.targetHeight) : 0;
        const fit = width > 0 && height > 0 ? fitSize(width, height) : { width: 0.7, height: 0.7 };
        const rawQuad = (record.quad ?? {}) as Record<string, unknown>;
        const quad: ReplaceGoodsQuad = {
            topLeft: asPoint(rawQuad.topLeft, { x: 0.15, y: 0.15 }),
            topRight: asPoint(rawQuad.topRight, { x: 0.85, y: 0.15 }),
            bottomRight: asPoint(rawQuad.bottomRight, { x: 0.85, y: 0.85 }),
            bottomLeft: asPoint(rawQuad.bottomLeft, { x: 0.15, y: 0.85 }),
        };
        const strokes = Array.isArray(record.maskStrokes) ? (record.maskStrokes as MaskStroke[]).filter((stroke) => stroke && Array.isArray(stroke.points)) : [];
        const brush = Number(record.maskBrush);
        return {
            id: typeof record.id === "string" && record.id ? record.id : `sku-${index + 1}`,
            label: typeof record.label === "string" && record.label ? record.label : `商品 ${index + 1}`,
            targetAssetId: typeof record.targetAssetId === "string" ? record.targetAssetId : "",
            targetName: typeof record.targetName === "string" ? record.targetName : "",
            targetUrl: "",
            targetOriginUrl: "",
            targetWidth: width,
            targetHeight: height,
            fit,
            history: createTransformHistory({ quad }),
            mask: createMask({
                mode: record.maskMode === "manual" ? "manual" : "auto",
                strokes,
                brush: Number.isFinite(brush) ? Math.min(REPLACE_GOODS_MASK_BRUSH.max, Math.max(REPLACE_GOODS_MASK_BRUSH.min, brush)) : REPLACE_GOODS_MASK_BRUSH.defaultValue,
            }),
            sceneChange: REPLACE_GOODS_SCENE_CHANGES.some((item) => item.id === record.sceneChange)
                ? (record.sceneChange as ReplaceGoodsSceneChange)
                : REPLACE_GOODS_DEFAULT_SCENE_CHANGE,
        };
    });
    const activeSkuId = skus.some((sku) => sku.id === values.activeSkuId) ? String(values.activeSkuId) : skus[0]!.id;
    return {
        scene: null,
        skus,
        activeSkuId,
        mode,
        denoiseStrength: Number.isFinite(denoise) ? Math.min(REPLACE_GOODS_DENOISE.max, Math.max(REPLACE_GOODS_DENOISE.min, denoise)) : REPLACE_GOODS_DENOISE.defaultValue,
        cutoutProvider: cutout,
        outputNum: (REPLACE_GOODS_OUTPUT_OPTIONS as readonly number[]).includes(outputNum) ? outputNum : REPLACE_GOODS_OUTPUT_NUM,
    };
}
