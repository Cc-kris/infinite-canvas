import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
/**
 * TASK-023：「商品替换」REPLACE_GOODS 工作区（layout = replace）。
 *
 * 真实边界：
 *  - 参考场景 + 替换商品双输入；每个 SKU 一份独立的四边形（透视/扭曲）与场景变化程度；
 *  - 画布拖动会真实改变 `targetConfig/point/scale/rotate`（由 registry 的四边形派生），不是装饰动画；
 *  - 提交前由本机真正渲染「落位导引图」和保护蒙版 PNG（adapters/replace-goods），与两张原图一起发出；
 *  - 结果只来自上游返回，空结果判失败；配置一变即把旧结果标记为「来自旧版本」。
 *
 * 布局对照原站 `product-replacement`：主区是画布，参数条固定在画布下方，结果列在右侧；
 * 不再把参数塞进右侧属性面板，也不在画布下方摆一排自造工具条。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { History, Inbox, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";

import { ToolCases } from "@/components/tools/tool-cases";
import type { ToolCase } from "@/components/tools/tool-cases";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { cn, randomId } from "@/lib/utils";
import { uploadCaseFiles } from "@/features/tools/case-apply";
import { REPLACE_GOODS_CASES } from "@/features/tools/tool-cases-data";
import { loadToolAssetRecords, uploadToolAsset, type ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

import {
    assertReplaceGoodsInput,
    buildReplaceGoodsInput,
    buildReplaceGoodsUnit,
    replaceGoodsOutcomeFromTask,
    renderPlacementGuidePng,
    type ReplaceGoodsUnit,
    type ReplaceGoodsUnitOutcome,
} from "@/features/tools/adapters/replace-goods";
import type { MaskStroke } from "@/features/tools/registry/area-repair";
import {
    REPLACE_GOODS_CORNERS,
    REPLACE_GOODS_CUTOUT_PROVIDERS,
    REPLACE_GOODS_DENOISE,
    REPLACE_GOODS_KEY_STEP,
    REPLACE_GOODS_MASK_BRUSH,
    REPLACE_GOODS_MAX_SKUS,
    REPLACE_GOODS_OUTPUT_OPTIONS,
    REPLACE_GOODS_OUTPUT_SIZE,
    REPLACE_GOODS_SCENE_CHANGES,
    REPLACE_GOODS_TOOL_ID,
    REPLACE_GOODS_UPLOAD_LIMITS,
    REPLACE_GOODS_WARP_MODES,
    activeSku,
    addSku,
    applyQuad,
    clamp01,
    createSku,
    createTransformHistory,
    createWorkspace,
    dragQuadCorner,
    moveQuad,
    parseDraftValues,
    pointInQuad,
    quadFromCaseShape,
    removeSku,
    rotateQuad,
    scaleQuad,
    serializeDraftValues,
    updateSku,
    validateWorkspace,
    type ReplaceGoodsCorner,
    type ReplaceGoodsMask,
    type ReplaceGoodsPoint,
    type ReplaceGoodsQuad,
    type ReplaceGoodsSceneChange,
    type ReplaceGoodsSku,
    type ReplaceGoodsWarpMode,
    type ReplaceGoodsWorkspace,
} from "@/features/tools/registry/replace-goods";

const UPLOAD_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: [...REPLACE_GOODS_UPLOAD_LIMITS.mimeTypes],
    maxBytes: REPLACE_GOODS_UPLOAD_LIMITS.maxBytes,
    minSide: REPLACE_GOODS_UPLOAD_LIMITS.minSide,
    maxSide: REPLACE_GOODS_UPLOAD_LIMITS.maxSide,
};
const UPLOAD_ACCEPT = UPLOAD_CONSTRAINTS.mimeTypes.join(",");

/** 右栏页签 */
const REPLACE_TABS = [
    { id: "result", label: "生成结果" },
    { id: "cases", label: "优秀案例" },
] as const;
type ReplaceTabId = (typeof REPLACE_TABS)[number]["id"] | "history";

/** 画布工具：定位（拖动四边形）/ 补锁 / 擦除 */
const REPLACE_TOOLS = [
    { id: "warp", label: "定位" },
    { id: "mask", label: "补锁" },
    { id: "eraser", label: "擦除" },
] as const;
type CanvasTool = (typeof REPLACE_TOOLS)[number]["id"];

/* ------------------------------------------------------------------ *
 * AssetButton：原站画布/参数条里的「上传参考图」按钮（真实 file input）
 * ------------------------------------------------------------------ */

function AssetButton({
    label,
    url,
    variant = "chip",
    disabled,
    onPick,
}: {
    label: string;
    url?: string | null;
    variant?: "primary" | "chip";
    disabled?: boolean;
    onPick: (files: File[]) => void;
}) {
    return (
        <label
            className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] text-[12px] transition",
                variant === "primary"
                    ? "h-8 bg-primary px-4 font-medium text-primary-foreground hover:opacity-90"
                    : "h-7 border border-border bg-card px-2 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
            )}
        >
            {url ? <img src={url} alt={label} className="size-4 rounded object-cover" /> : <Upload aria-hidden="true" className="size-3.5" />}
            {label}
            <input
                type="file"
                className="hidden"
                accept={UPLOAD_ACCEPT}
                disabled={disabled}
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.length) onPick(files);
                }}
            />
        </label>
    );
}

/* ------------------------------------------------------------------ *
 * PerspectiveWarpCanvas：四边形拖动（真实坐标，归一化存储）
 * ------------------------------------------------------------------ */

function PerspectiveWarpCanvas({
    scene,
    quad,
    mask,
    targetUrl,
    mode,
    tool,
    brush,
    disabled,
    onQuad,
    onStroke,
    onPick,
}: {
    scene: { url: string; width: number; height: number } | null;
    quad: ReplaceGoodsQuad;
    mask: ReplaceGoodsMask;
    targetUrl?: string;
    mode: ReplaceGoodsWarpMode;
    tool: CanvasTool;
    brush: number;
    disabled?: boolean;
    onQuad: (quad: ReplaceGoodsQuad) => void;
    onStroke: (stroke: MaskStroke) => void;
    onPick: (files: File[]) => void;
}) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const boxRef = useRef<HTMLDivElement | null>(null);
    const [frame, setFrame] = useState({ width: 0, height: 0 });
    const [live, setLive] = useState<ReplaceGoodsQuad | null>(null);
    const [draft, setDraft] = useState<ReplaceGoodsPoint[] | null>(null);
    const [targetPreview, setTargetPreview] = useState("");
    const current = live ?? quad;
    useEffect(() => {
        let alive = true;
        setTargetPreview("");
        if (!scene || !targetUrl) return;
        void loadImageElement(targetUrl).then((image) => renderPlacementGuidePng(scene, current, { image, width: image.naturalWidth, height: image.naturalHeight })).then((rendered) => {
            if (alive) setTargetPreview(rendered.dataUrl);
        }).catch(() => {
            /* 像素渲染不可用时只隐藏预览，生成仍会由适配器明确拦截。 */
        });
        return () => { alive = false; };
    }, [scene?.url, scene?.width, scene?.height, targetUrl, current]);
    const dragRef = useRef<{ kind: "corner"; corner: ReplaceGoodsCorner } | { kind: "move"; last: ReplaceGoodsPoint } | null>(null);

    useEffect(() => {
        const element = frameRef.current;
        if (!element || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setFrame({ width: Math.round(rect.width), height: Math.round(rect.height) });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const aspect = scene && scene.width > 0 && scene.height > 0 ? scene.width / scene.height : 1;
    const fitted = useMemo(() => {
        if (!frame.width || !frame.height) return null;
        const width = Math.min(frame.width, frame.height * aspect);
        return { width: Math.round(width), height: Math.round(width / aspect) };
    }, [aspect, frame.height, frame.width]);

    const toNormalized = useCallback((event: ReactPointerEvent<HTMLDivElement>): ReplaceGoodsPoint => {
        const rect = boxRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
        return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
    }, []);

    const startCorner = (corner: ReplaceGoodsCorner) => (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (disabled) return;
        event.preventDefault();
        (event.target as Element).setPointerCapture?.(event.pointerId);
        dragRef.current = { kind: "corner", corner };
    };

    const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        const point = toNormalized(event);
        if (tool === "warp") {
            // 与原站一致：只有按在商品四边形内才拖动整体，四角单独拖动改形。
            if (!pointInQuad(current, point)) return;
            event.preventDefault();
            (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
            dragRef.current = { kind: "move", last: point };
            return;
        }
        // 补锁 / 擦除：画笔轨迹同样落在归一化坐标里，提交时导出成真实蒙版 PNG。
        event.preventDefault();
        (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        setDraft([point]);
    };

    const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        const point = toNormalized(event);
        if (tool !== "warp") {
            setDraft((currentDraft) => (currentDraft ? [...currentDraft, point] : currentDraft));
            return;
        }
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.kind === "corner") {
            setLive(dragQuadCorner(current, drag.corner, point, mode));
            return;
        }
        setLive(moveQuad(current, point.x - drag.last.x, point.y - drag.last.y));
        dragRef.current = { kind: "move", last: point };
    };

    const handleUp = () => {
        dragRef.current = null;
        if (live) {
            onQuad(live);
            setLive(null);
        }
        if (draft) {
            if (draft.length >= 2) {
                onStroke({
                    id: randomId(),
                    tool: tool === "eraser" ? "eraser" : "brush",
                    size: Math.max(REPLACE_GOODS_MASK_BRUSH.min, brush),
                    points: draft,
                });
            }
            setDraft(null);
        }
    };

    if (!scene) {
        return (
            <div ref={frameRef} className="flex h-full w-full items-center justify-center p-[25px]" data-testid="replace-goods-canvas">
                <div
                    className="flex h-full w-full flex-col items-center rounded-xl border border-border text-center"
                    data-testid="replace-goods-canvas-empty"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        const files = Array.from(event.dataTransfer?.files ?? []);
                        if (files.length) onPick(files);
                    }}
                >
                    {/* 原站示例视频 guide-changegoods.mp4（649×423），原样落盘 */}
                    <video src="/__cases/product-replacement/guide.mp4" autoPlay muted loop playsInline aria-label="商品替换示例" className="mt-2 aspect-[649/423] w-full rounded-xl object-cover" />
                    <p className="mt-2.5 text-[20px] leading-[31px] text-foreground">商品替换</p>
                    <p className="mt-2.5 text-[16px] leading-[18px] text-muted-foreground">上传参考图，一键替换商品，快来替换您的商品吧~</p>
                    <div className="mt-auto mb-8">
                        <AssetButton label="上传参考图" variant="primary" onPick={onPick} />
                    </div>
                </div>
            </div>
        );
    }

    const points = REPLACE_GOODS_CORNERS.map((corner) => current[corner]);

    return (
        <div ref={frameRef} className="flex h-full w-full items-center justify-center overflow-hidden p-3">
            <div
                ref={boxRef}
                data-testid="replace-goods-canvas"
                className={cn(
                    "relative select-none overflow-hidden rounded-[8px] border border-border bg-muted",
                    disabled && "opacity-70",
                )}
                style={{ width: fitted?.width, height: fitted?.height, touchAction: "none", cursor: tool === "warp" ? "crosshair" : "cell" }}
                onPointerDown={handleDown}
                onPointerMove={handleMove}
                onPointerUp={handleUp}
                onPointerCancel={handleUp}
            >
                <img src={scene.url} alt="参考场景" className="block h-full w-full object-contain" draggable={false} />
                {targetPreview ? <img data-testid="replace-goods-target-preview" src={targetPreview} alt="商品落位预览" className="pointer-events-none absolute inset-0 size-full" draggable={false} /> : null}
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                        d={`M0 0 H100 V100 H0 Z ${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x * 100} ${point.y * 100}`).join(" ")} Z`}
                        fill="rgba(15,23,42,0.18)"
                        fillRule="evenodd"
                    />
                    {mask.strokes.map((stroke) => (
                        <polyline
                            key={stroke.id}
                            points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
                            fill="none"
                            stroke={stroke.tool === "eraser" ? "rgba(239,68,68,0.55)" : "rgba(56,189,248,0.6)"}
                            strokeWidth={0.6}
                            strokeLinecap="round"
                            strokeDasharray={stroke.tool === "eraser" ? "1.5 1" : undefined}
                        />
                    ))}
                    {draft && draft.length > 1 ? (
                        <polyline
                            points={draft.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
                            fill="none"
                            stroke="rgba(56,189,248,0.9)"
                            strokeWidth={0.8}
                        />
                    ) : null}
                    <polygon points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} fill="none" stroke="rgba(255,64,64,0.9)" strokeWidth={0.4} />
                </svg>
                {REPLACE_GOODS_CORNERS.map((corner) => (
                    <button
                        key={corner}
                        type="button"
                        aria-label={`拖动 ${corner} 角点`}
                        data-testid={`replace-goods-handle-${corner}`}
                        disabled={disabled}
                        onPointerDown={startCorner(corner)}
                        className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ left: `${current[corner].x * 100}%`, top: `${current[corner].y * 100}%` }}
                    >
                        <span className="size-3 rounded-full border-2 border-white bg-red-500 shadow" />
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * 主工作区
 * ------------------------------------------------------------------ */

function loadImageElement(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片解码失败，请重新上传后重试"));
        image.src = url;
    });
}

export type ReplaceGoodsWorkspaceProps = { className?: string };

export function ReplaceGoodsWorkspace({ className }: ReplaceGoodsWorkspaceProps = {}) {
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [draftReady, setDraftReady] = useState(false);
    const [workspace, setWorkspace] = useState<ReplaceGoodsWorkspace>(() => createWorkspace());
    const [sceneRecord, setSceneRecord] = useState<ToolAssetRecord | null>(null);
    const [targets, setTargets] = useState<Record<string, ToolAssetRecord | null>>({});
    const [task, setTask] = useState<ToolTask | null>(null);
    const [unit, setUnit] = useState<ReplaceGoodsUnit | null>(null);
    const [outcome, setOutcome] = useState<ReplaceGoodsUnitOutcome | null>(null);
    const [running, setRunning] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [tab, setTab] = useState<ReplaceTabId>("result");
    const [canvasTool, setCanvasTool] = useState<CanvasTool>("warp");
    const [applyingCaseId, setApplyingCaseId] = useState<string | null>(null);

    const revisionRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    /** 提交那一刻的配置指纹；与当前配置不同即标记结果「来自旧版本」。 */
    const submittedKeyRef = useRef<string | null>(null);

    const sku = activeSku(workspace);
    const target = sku ? targets[sku.id] ?? null : null;

    /* ---------------- 草稿：恢复 → 回写 ---------------- */

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(REPLACE_GOODS_TOOL_ID);
            if (!alive) return;
            revisionRef.current = draft?.revision ?? null;
            const restored = parseDraftValues(draft?.values ?? {});
            if (restored) setWorkspace(restored);
            setDraftReady(true);
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(REPLACE_GOODS_TOOL_ID, { values: serializeDraftValues(workspace) });
    }, [draftReady, patchDraft, workspace]);

    /* 刷新恢复：草稿里只有资产 id/URL，上传按钮的 file input 没有内存里的 File，
       这里按 id 把真实资产记录取回来，否则「已上传」的图在提交时会被判成没上传。 */
    useEffect(() => {
        if (!draftReady) return;
        const sceneId = workspace.scene?.assetId ?? "";
        const targetId = sku?.targetAssetId ?? "";
        const wantScene = Boolean(sceneId) && !sceneRecord;
        const wantTarget = Boolean(targetId) && Boolean(sku) && !targets[sku!.id];
        if (!wantScene && !wantTarget) return;
        let alive = true;
        void (async () => {
            const ids = [wantScene ? sceneId : "", wantTarget ? targetId : ""].filter(Boolean);
            const { records } = await loadToolAssetRecords(ids);
            if (!alive) return;
            const byId = new Map(records.map((record) => [record.id, record]));
            const sceneRestored = byId.get(sceneId);
            if (wantScene && sceneRestored) setSceneRecord(sceneRestored);
            const targetRestored = byId.get(targetId);
            if (wantTarget && sku && targetRestored) setTargets((current) => ({ ...current, [sku.id]: targetRestored }));
        })();
        return () => {
            alive = false;
        };
    }, [draftReady, sceneRecord, sku, targets, workspace.scene]);

    /* ---------------- 输入：参考场景 / 每个 SKU 的替换商品 ---------------- */

    const handleSceneChange = useCallback((_ids: string[], records: ToolAssetRecord[]) => {
        const next = records[0] ?? null;
        setSceneRecord(next);
        setTask(null);
        setUnit(null);
        setOutcome(null);
        setSubmitError(null);
        setWorkspace((current) => {
            if (!next) return { ...current, scene: null };
            const scene = {
                assetId: next.id,
                name: next.name,
                url: next.url,
                originUrl: next.url,
                width: next.width ?? 0,
                height: next.height ?? 0,
            };
            return {
                ...current,
                scene,
                skus: current.skus.map((item) => {
                    const fit = { width: 0.7, height: 0.7 };
                    return { ...item, fit, history: createTransformHistory(), mask: { ...item.mask, strokes: [] } };
                }),
            };
        });
        setNotice(next ? "已更换参考场景：定位已重置，请重新框选商品位置" : null);
    }, []);

    const handleTargetChange = useCallback((skuId: string) => (_ids: string[], records: ToolAssetRecord[]) => {
        const next = records[0] ?? null;
        setTargets((current) => ({ ...current, [skuId]: next }));
        setTask(null);
        setUnit(null);
        setOutcome(null);
        setSubmitError(null);
        setWorkspace((current) =>
            updateSku(current, skuId, {
                targetAssetId: next?.id ?? "",
                targetName: next?.name ?? "",
                targetUrl: next?.url ?? "",
                targetOriginUrl: next?.url ?? "",
                targetWidth: next?.width ?? 0,
                targetHeight: next?.height ?? 0,
            }),
        );
    }, []);

    const pickScene = useCallback(
        async (files: File[]) => {
            setSubmitError(null);
            try {
                const record = await uploadToolAsset(files[0], { constraints: UPLOAD_CONSTRAINTS });
                handleSceneChange([], [record]);
            } catch (error) {
                setSubmitError(error instanceof Error ? error.message : "参考图上传失败");
            }
        },
        [handleSceneChange],
    );

    const pickTarget = useCallback(
        async (files: File[]) => {
            if (!sku) return;
            setSubmitError(null);
            try {
                const record = await uploadToolAsset(files[0], { constraints: UPLOAD_CONSTRAINTS });
                handleTargetChange(sku.id)([], [record]);
            } catch (error) {
                setSubmitError(error instanceof Error ? error.message : "商品图上传失败");
            }
        },
        [handleTargetChange, sku],
    );

    /* ---------------- 「做同款」：入库案例素材并回填配置 ---------------- */

    const applyCase = useCallback(
        async (item: ToolCase) => {
            setApplyingCaseId(item.id);
            setSubmitError(null);
            setNotice(null);
            try {
                const assets = await uploadCaseFiles(item);
                const sourceRecord = assets.source as ToolAssetRecord | undefined;
                const targetRecord = assets.target as ToolAssetRecord | undefined;

                if (!sourceRecord || Array.isArray(sourceRecord)) {
                    throw new Error("该案例缺少可用的参考场景图");
                }
                if (!targetRecord || Array.isArray(targetRecord)) {
                    throw new Error("该案例缺少可用的替换商品图");
                }

                // 写入场景
                setSceneRecord(sourceRecord);
                const scene = {
                    assetId: sourceRecord.id,
                    name: sourceRecord.name,
                    url: sourceRecord.url,
                    originUrl: sourceRecord.url,
                    width: sourceRecord.width ?? 0,
                    height: sourceRecord.height ?? 0,
                };

                // 当前活跃 SKU（如无则创建第一个）
                const apply = item.apply ?? {};
                let currentSku = activeSku(workspace);
                let activeId = workspace.activeSkuId;

                if (!currentSku) {
                    const newSkuId = `sku-${Date.now().toString(36)}`;
                    const newSku = createSku({ id: newSkuId, label: "商品 1" });
                    setWorkspace((current) => ({
                        ...current,
                        scene,
                        skus: [newSku],
                        activeSkuId: newSkuId,
                    }));
                    activeId = newSkuId;
                    currentSku = newSku;
                } else {
                    setWorkspace((current) => ({ ...current, scene }));
                }

                // 写入替换商品到 targets 和 sku
                setTargets((current) => ({ ...current, [activeId]: targetRecord }));

                // 回填字段：workspace 级别（denoiseStrength/cutoutProvider/outputNum）+ sku 级别（target 信息）
                setWorkspace((current) => {
                    const updatedSku: Partial<ReplaceGoodsSku> = {
                        targetAssetId: targetRecord.id,
                        targetName: targetRecord.name,
                        targetUrl: targetRecord.url,
                        targetOriginUrl: targetRecord.url,
                        targetWidth: targetRecord.width ?? 0,
                        targetHeight: targetRecord.height ?? 0,
                    };

                    // 如果案例有 quad，设置初始 history（原站像素坐标系 → 本页 0–1 归一化四边形）
                    const caseQuad = quadFromCaseShape(apply.quad);
                    if (caseQuad) {
                        updatedSku.history = createTransformHistory({ quad: caseQuad });
                    }

                    const updated = updateSku(current, activeId, updatedSku);

                    // workspace 级别字段：原站 denoiseStrength 是 0–1 小数，本页滑杆是 0–100；
                    // cutoutProvider 原站是 CUTOUT_ALI 之类的枚举，本页只有 local/model。
                    const rawDenoise = typeof apply.denoiseStrength === "number" ? apply.denoiseStrength : null;
                    const denoiseStrength =
                        rawDenoise === null
                            ? updated.denoiseStrength
                            : Math.round(
                                  Math.min(
                                      REPLACE_GOODS_DENOISE.max,
                                      Math.max(REPLACE_GOODS_DENOISE.min, rawDenoise <= 1 ? rawDenoise * 100 : rawDenoise),
                                  ),
                              );
                    const rawCutout = typeof apply.cutoutProvider === "string" ? apply.cutoutProvider.toUpperCase() : "";
                    const cutoutProvider = rawCutout
                        ? rawCutout.includes("LOCAL") || rawCutout === ""
                            ? "local"
                            : "model"
                        : updated.cutoutProvider;

                    return {
                        ...updated,
                        denoiseStrength,
                        cutoutProvider,
                        outputNum: typeof apply.outputNum === "number" ? apply.outputNum : updated.outputNum,
                    };
                });

                setTask(null);
                setUnit(null);
                setOutcome(null);
                setTab("result");
                setNotice("已应用案例配置，请检查画布定位后提交");
            } catch (error) {
                setSubmitError(error instanceof Error ? error.message : "做同款失败");
            } finally {
                setApplyingCaseId(null);
            }
        },
        [workspace],
    );

    /* ---------------- 画布变换 ---------------- */

    const commitQuad = useCallback((quad: ReplaceGoodsQuad) => {
        setWorkspace((current) => applyQuad(current, quad));
        setTask(null);
    }, []);

    const commitStroke = useCallback((stroke: MaskStroke) => {
        setWorkspace((current) => {
            const active = activeSku(current);
            if (!active) return current;
            return updateSku(current, active.id, { mask: { ...active.mask, strokes: [...active.mask.strokes, stroke] } });
        });
    }, []);

    const clearMask = useCallback(() => {
        setWorkspace((current) => {
            const active = activeSku(current);
            return active ? updateSku(current, active.id, { mask: { ...active.mask, strokes: [] } }) : current;
        });
    }, []);

    const nudge = useCallback(
        (event: React.KeyboardEvent) => {
            const active = activeSku(workspace);
            if (!active) return;
            const fast = event.shiftKey;
            const step = REPLACE_GOODS_KEY_STEP;
            const dims = workspace.scene && workspace.scene.width > 0 ? workspace.scene : { width: 1000, height: 1000 };
            const quad = active.history.present.quad;
            const move = (dx: number, dy: number) => setWorkspace((current) => applyQuad(current, moveQuad(quad, dx, dy)));
            switch (event.key) {
                case "ArrowLeft":
                    event.preventDefault();
                    move(-(fast ? step.moveFast : step.move) / dims.width, 0);
                    return;
                case "ArrowRight":
                    event.preventDefault();
                    move((fast ? step.moveFast : step.move) / dims.width, 0);
                    return;
                case "ArrowUp":
                    event.preventDefault();
                    move(0, -(fast ? step.moveFast : step.move) / dims.height);
                    return;
                case "ArrowDown":
                    event.preventDefault();
                    move(0, (fast ? step.moveFast : step.move) / dims.height);
                    return;
                case "+":
                case "=":
                    event.preventDefault();
                    setWorkspace((current) => applyQuad(current, scaleQuad(quad, 1 + (fast ? step.scaleFast : step.scale))));
                    return;
                case "-":
                    event.preventDefault();
                    setWorkspace((current) => applyQuad(current, scaleQuad(quad, 1 - (fast ? step.scaleFast : step.scale))));
                    return;
                case "[":
                    event.preventDefault();
                    setWorkspace((current) => applyQuad(current, rotateQuad(quad, -(fast ? step.rotateFast : step.rotate))));
                    return;
                case "]":
                    event.preventDefault();
                    setWorkspace((current) => applyQuad(current, rotateQuad(quad, fast ? step.rotateFast : step.rotate)));
                    return;
                case "t":
                case "T":
                    setWorkspace((current) => ({ ...current, mode: "perspective" }));
                    return;
                case "n":
                case "N":
                    setWorkspace((current) => ({ ...current, mode: "distort" }));
                    return;
                default:
            }
        },
        [workspace],
    );

    /* ---------------- 校验 ---------------- */

    const issues = useMemo(() => {
        const list = validateWorkspace(workspace);
        if (sceneRecord && target) {
            const missingSize = !sceneRecord.width || !sceneRecord.height || !target.width || !target.height;
            if (missingSize) list.push({ code: "asset-size", message: "图片尺寸读取失败，请重新上传" });
        }
        return list;
    }, [sceneRecord, target, workspace]);

    /* ---------------- 提交 / 重试 ---------------- */

    const buildActiveUnit = useCallback(async (): Promise<ReplaceGoodsUnit> => {
        const active = activeSku(workspace);
        if (!active) throw new Error("没有可提交的替换商品");
        if (!sceneRecord || !workspace.scene) throw new Error("请先上传参考场景图");
        const record = targets[active.id] ?? null;
        if (!record) throw new Error(`${active.label}：请上传替换商品图`);
        const { imageToDataUrl } = await import("@/services/image-storage");
        const [sceneDataUrl, targetDataUrl] = await Promise.all([
            imageToDataUrl({ storageKey: sceneRecord.storageKey, url: sceneRecord.url }),
            imageToDataUrl({ storageKey: record.storageKey, url: record.url }),
        ]);
        if (!sceneDataUrl || !targetDataUrl) throw new Error("图片本地数据已不可用，请重新上传");
        const image = await loadImageElement(targetDataUrl);
        return await buildReplaceGoodsUnit({
            workspace,
            sku: active,
            scene: {
                assetId: workspace.scene.assetId,
                name: workspace.scene.name,
                dataUrl: sceneDataUrl,
                originUrl: workspace.scene.originUrl,
                width: workspace.scene.width,
                height: workspace.scene.height,
                image,
            },
            target: {
                assetId: record.id,
                name: record.name,
                dataUrl: targetDataUrl,
                originUrl: record.url,
                width: record.width ?? 0,
                height: record.height ?? 0,
                image,
            },
            clientOperationId: randomId(),
            draftRevision: revisionRef.current ?? 0,
        });
    }, [sceneRecord, targets, workspace]);

    const submit = useCallback(async () => {
        if (running) return;
        // 原站按钮始终可点：缺图/缺定位时把真实拦截原因说清楚，避免「按钮灰着但没有解释」。
        if (issues.length > 0) {
            setSubmitError(issues[0].message);
            return;
        }
        setRunning(true);
        setSubmitError(null);
        setNotice(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const nextUnit = await buildActiveUnit();
            const input = buildReplaceGoodsInput(nextUnit, { draftRevision: revisionRef.current });
            assertReplaceGoodsInput(input);
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            const nextTask = await useToolTaskStore.getState().runTool(input, { signal: controller.signal });
            setUnit(nextUnit);
            submittedKeyRef.current = JSON.stringify(serializeDraftValues(workspace));
            setTask(nextTask);
            const mapped = replaceGoodsOutcomeFromTask(nextUnit, nextTask);
            setOutcome(mapped);
            if (mapped.status !== "succeeded") setNotice(mapped.error?.message ?? "上游没有返回可用结果，请重试");
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "提交失败，请重试");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [buildActiveUnit, issues, running, workspace]);

    const retry = useCallback(async () => {
        if (running || !unit) return;
        setRunning(true);
        setSubmitError(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const input = buildReplaceGoodsInput(unit, { draftRevision: revisionRef.current });
            assertReplaceGoodsInput(input);
            const { useToolTaskStore } = await import("@/stores/use-tool-task-store");
            const nextTask = await useToolTaskStore.getState().runTool(input, { signal: controller.signal });
            setTask(nextTask);
            const mapped = replaceGoodsOutcomeFromTask(unit, nextTask);
            setOutcome(mapped);
            if (mapped.status !== "succeeded") setNotice(mapped.error?.message ?? "上游没有返回可用结果，请重试");
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "重试失败，请重试");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [running, unit]);

    /* ---------------- 当前配置是否已偏离提交快照 ---------------- */

    const draftKey = useMemo(() => JSON.stringify(serializeDraftValues(workspace)), [workspace]);
    const stale = Boolean(unit) && submittedKeyRef.current !== null && submittedKeyRef.current !== draftKey;

    /* ---------------- 渲染 ---------------- */

    const scene = workspace.scene && sceneRecord && sceneRecord.url
        ? { url: sceneRecord.url, width: sceneRecord.width ?? 0, height: sceneRecord.height ?? 0 }
        : null;

    return (
        <section className={cn("flex h-full min-h-0 flex-col bg-background p-[10px]", className)} data-testid="replace-goods-workspace">
            <ToolWorkspaceColumns
                configSide="right"
                className="min-h-0 flex-1 gap-[10px] overflow-hidden lg:grid-cols-[minmax(0,1fr)_504px]"
                config={
                    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg bg-canvas" aria-label="生成结果与案例">
                        <div role="tablist" aria-label="结果区页签" className="flex h-[42px] shrink-0 items-center gap-3.5 bg-card px-3">
                            {REPLACE_TABS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === item.id}
                                    data-testid={`replace-goods-tab-${item.id}`}
                                    onClick={() => setTab(item.id)}
                                    className={cn(
                                        "relative flex h-[42px] items-center text-sm leading-[22px] transition-colors",
                                        tab === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {item.label}
                                    {tab === item.id ? <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-foreground" /> : null}
                                </button>
                            ))}
                            <button
                                type="button"
                                data-testid="replace-goods-tab-history"
                                aria-selected={tab === "history"}
                                onClick={() => setTab("history")}
                                className={cn(
                                    "ml-auto flex items-center gap-1 text-[13px] leading-5 transition-colors",
                                    tab === "history" ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <History className="size-3.5" aria-hidden />
                                历史记录
                            </button>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-3">
                            {tab === "result" ? (
                                <>
                                    {notice ? <p className="text-[11px] leading-4 text-amber-600 dark:text-amber-400">{notice}</p> : null}
                                    {submitError ? <p data-testid="replace-goods-submit-error" className="text-[11px] leading-4 text-destructive">{submitError}</p> : null}

                                    {task ? (
                                        <ToolResult task={task} toolId={REPLACE_GOODS_TOOL_ID} title="替换结果" onCancel={() => abortRef.current?.abort()} onRetry={retry} />
                                    ) : (
                                        <div
                                            data-testid="replace-goods-result-empty"
                                            className="flex flex-1 flex-col items-center justify-center text-center text-sm leading-[22px] text-muted-foreground"
                                        >
                                            <Inbox className="mb-2 size-9 opacity-40" aria-hidden />
                                            <p>暂无生成结果图</p>
                                            <p>快在左侧合成您的第一张商品图吧~</p>
                                        </div>
                                    )}

                                    {outcome && outcome.images.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-2" data-testid="replace-goods-results">
                                            {outcome.images.map((image, index) => {
                                                const href = image.url || image.dataUrl;
                                                if (!href) return null;
                                                return (
                                                    <a key={index} href={href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded border border-border">
                                                        <img data-testid="tool-result-image" src={href} alt="替换结果" className="w-full" />
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </>
                            ) : null}

                            {tab === "cases" ? (
                                <div className="max-h-full overflow-y-auto">
                                    <ToolCases cases={REPLACE_GOODS_CASES} onApply={applyCase} applyingId={applyingCaseId} emptyHint="暂无优秀案例" />
                                </div>
                            ) : null}

                            {tab === "history" ? (
                                <div data-testid="replace-goods-panel-history">
                                    <ToolTaskHistory
                                        toolId={REPLACE_GOODS_TOOL_ID}
                                        emptyHint="暂无历史记录"
                                        onSelectTask={(next) => {
                                            setTask(next);
                                            setOutcome(null);
                                            setTab("result");
                                        }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </aside>
                }
            >
                {/* 原站 1600×1000：左卡 886 宽面板底；内容区 bg-canvas（顶部温馨提示胶囊 + 居中 700×700 画布卡）；底部 48 高单行参数条。 */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
                    <div className="relative flex min-h-0 flex-1 flex-col items-center gap-2.5 bg-canvas p-4">
                        <p className="shrink-0 rounded-md bg-foreground/[0.06] px-2.5 py-[3px] text-sm leading-[22px] text-foreground">
                            💡 温馨提示：支持上传多张商品图进行批量替换
                        </p>
                        {/* 多商品（每个 SKU 一份替换商品图）+ 定位/蒙版控件：原站上传参考图前不显示 */}
                        <div hidden={!scene} className="w-full max-w-[700px] shrink-0 space-y-1.5 rounded-lg bg-card px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                                <div data-testid="replace-goods-sku-tabs" className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                                    {workspace.skus.map((item, index) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            data-testid={`replace-goods-sku-tab-${index}`}
                                            aria-pressed={item.id === workspace.activeSkuId}
                                            onClick={() => setWorkspace((current) => ({ ...current, activeSkuId: item.id }))}
                                            className={cn(
                                                "h-7 shrink-0 rounded-[6px] border px-2 text-[12px] transition",
                                                item.id === workspace.activeSkuId
                                                    ? "border-border bg-accent font-medium text-foreground"
                                                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                            )}
                                        >
                                            {item.label}
                                            {targets[item.id] ? " ·已传" : ""}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    data-testid="replace-goods-sku-add"
                                    title="新增商品"
                                    onClick={() => setWorkspace((current) => addSku(current))}
                                    disabled={workspace.skus.length >= REPLACE_GOODS_MAX_SKUS}
                                    className="grid size-7 shrink-0 place-items-center rounded-[6px] text-muted-foreground transition hover:bg-accent disabled:opacity-40 dark:hover:bg-white/10"
                                >
                                    <Plus className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    data-testid="replace-goods-sku-remove"
                                    title="删除当前商品"
                                    onClick={() => {
                                        if (!sku) return;
                                        const removed = sku.id;
                                        setTargets((current) => {
                                            const next = { ...current };
                                            delete next[removed];
                                            return next;
                                        });
                                        setWorkspace((current) => removeSku(current, removed));
                                    }}
                                    disabled={workspace.skus.length <= 1}
                                    className="grid size-7 shrink-0 place-items-center rounded-[6px] text-muted-foreground transition hover:bg-accent disabled:opacity-40 dark:hover:bg-white/10"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                                    <AssetButton label="参考图" url={scene?.url} onPick={(files) => void pickScene(files)} />
                                    <AssetButton label="替换商品图" url={target?.url} disabled={!scene} onPick={(files) => void pickTarget(files)} />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] leading-4 text-muted-foreground">
                                <label className="flex items-center gap-1.5">
                                    抠图引擎
                                    <select
                                        data-testid="replace-goods-cutout"
                                        value={workspace.cutoutProvider}
                                        onChange={(event) =>
                                            setWorkspace((current) => ({
                                                ...current,
                                                cutoutProvider: event.target.value as ReplaceGoodsWorkspace["cutoutProvider"],
                                            }))
                                        }
                                        className="h-6 rounded-[4px] border border-border bg-card px-1 text-[11px] text-foreground"
                                    >
                                        {REPLACE_GOODS_CUTOUT_PROVIDERS.map((provider) => (
                                            <option key={provider.id} value={provider.id}>
                                                {provider.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex items-center gap-1.5">
                                    去噪强度
                                    <input
                                        data-testid="replace-goods-denoise"
                                        type="range"
                                        min={REPLACE_GOODS_DENOISE.min}
                                        max={REPLACE_GOODS_DENOISE.max}
                                        step={REPLACE_GOODS_DENOISE.step}
                                        value={workspace.denoiseStrength}
                                        onChange={(event) => setWorkspace((current) => ({ ...current, denoiseStrength: Number(event.target.value) }))}
                                        className="w-20 accent-primary"
                                    />
                                    <span className="w-5 tabular-nums">{workspace.denoiseStrength}</span>
                                </label>
                                <span className="flex items-center gap-1.5">
                                    定位模式
                                    {REPLACE_GOODS_WARP_MODES.map((mode) => (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            data-testid={`replace-goods-mode-${mode.id}`}
                                            title={mode.hint}
                                            aria-pressed={workspace.mode === mode.id}
                                            onClick={() => setWorkspace((current) => ({ ...current, mode: mode.id }))}
                                            className={cn(
                                                "h-6 rounded-[4px] border px-1.5 text-[11px] transition",
                                                workspace.mode === mode.id
                                                    ? "border-selected bg-selected-soft text-foreground"
                                                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                            )}
                                        >
                                            {mode.label}（{mode.shortcut}）
                                        </button>
                                    ))}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    蒙版
                                    {REPLACE_TOOLS.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            data-testid={`replace-goods-tool-${item.id}`}
                                            aria-pressed={canvasTool === item.id}
                                            disabled={!scene}
                                            onClick={() => setCanvasTool(item.id)}
                                            className={cn(
                                                "h-6 rounded-[4px] border px-1.5 text-[11px] transition disabled:opacity-40",
                                                canvasTool === item.id
                                                    ? "border-border bg-accent font-medium text-foreground"
                                                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                            )}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                    <input
                                        data-testid="replace-goods-brush"
                                        type="range"
                                        aria-label="蒙版笔刷"
                                        min={REPLACE_GOODS_MASK_BRUSH.min}
                                        max={REPLACE_GOODS_MASK_BRUSH.max}
                                        step={1}
                                        value={sku?.mask.brush ?? REPLACE_GOODS_MASK_BRUSH.defaultValue}
                                        onChange={(event) => {
                                            const brush = Number(event.target.value);
                                            setWorkspace((current) => {
                                                const active = activeSku(current);
                                                return active ? updateSku(current, active.id, { mask: { ...active.mask, brush } }) : current;
                                            });
                                        }}
                                        className="w-16 accent-primary"
                                    />
                                    <span className="w-8 tabular-nums">{sku?.mask.brush ?? REPLACE_GOODS_MASK_BRUSH.defaultValue}px</span>
                                    <button
                                        type="button"
                                        data-testid="replace-goods-clear-mask"
                                        onClick={clearMask}
                                        className="h-6 rounded-[4px] border border-border px-1.5 text-[11px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                                    >
                                        清空蒙版
                                    </button>
                                </span>
                            </div>
                        </div>

                        {/* 画布：原站 700×700 白色圆角卡 */}
                        <div
                            tabIndex={0}
                            onKeyDown={nudge}
                            aria-label="商品定位画布"
                            className="flex aspect-square max-h-[700px] min-h-0 w-full max-w-[700px] flex-1 rounded-xl bg-card focus:outline-none"
                        >
                            <PerspectiveWarpCanvas
                                scene={scene}
                                quad={
                                    sku?.history.present.quad ?? {
                                        topLeft: { x: 0.15, y: 0.15 },
                                        topRight: { x: 0.85, y: 0.15 },
                                        bottomRight: { x: 0.85, y: 0.85 },
                                        bottomLeft: { x: 0.15, y: 0.85 },
                                    }
                                }
                                mode={workspace.mode}
                                tool={canvasTool}
                                brush={sku?.mask.brush ?? REPLACE_GOODS_MASK_BRUSH.defaultValue}
                                mask={sku?.mask ?? { mode: "auto", strokes: [], brush: REPLACE_GOODS_MASK_BRUSH.defaultValue }}
                                targetUrl={target?.url}
                                disabled={!scene}
                                onQuad={commitQuad}
                                onStroke={commitStroke}
                                onPick={(files) => void pickScene(files)}
                            />
                        </div>
                    </div>

                    {/* 底部单行参数条：生成尺寸 / 参考图场景变化程度（不变—高）/ 生成张数 / 立即生成（原站 48 高） */}
                    <div className="flex h-12 shrink-0 items-center gap-4 border-t-[3px] border-border px-4" data-testid="replace-goods-param-bar">
                        <span className="shrink-0 text-[12px] leading-5 text-muted-foreground">
                            生成尺寸: {REPLACE_GOODS_OUTPUT_SIZE.width}x{REPLACE_GOODS_OUTPUT_SIZE.height}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px] leading-5">
                            <span className="shrink-0 text-muted-foreground">参考图场景变化程度：</span>
                            {REPLACE_GOODS_SCENE_CHANGES.map((option, index) => (
                                <span key={option.id} className={cn("flex items-center gap-2", index === 0 ? "order-1" : "order-3")}>
                                    <button
                                        type="button"
                                        data-testid={`replace-goods-scene-change-${option.id}`}
                                        title={option.hint}
                                        aria-pressed={sku?.sceneChange === option.id}
                                        onClick={() =>
                                            setWorkspace((current) => {
                                                const active = activeSku(current);
                                                return active ? updateSku(current, active.id, { sceneChange: option.id as ReplaceGoodsSceneChange }) : current;
                                            })
                                        }
                                        className={cn("shrink-0 transition", sku?.sceneChange === option.id ? "font-medium text-selected" : "text-foreground hover:text-selected")}
                                    >
                                        {option.label}
                                    </button>
                                </span>
                            ))}
                            <input
                                type="range"
                                aria-hidden
                                tabIndex={-1}
                                min={0}
                                max={REPLACE_GOODS_SCENE_CHANGES.length - 1}
                                step={1}
                                value={Math.max(0, REPLACE_GOODS_SCENE_CHANGES.findIndex((option) => option.id === sku?.sceneChange))}
                                onChange={(event) => {
                                    const next = REPLACE_GOODS_SCENE_CHANGES[Number(event.target.value)]?.id as ReplaceGoodsSceneChange | undefined;
                                    if (!next) return;
                                    setWorkspace((current) => {
                                        const active = activeSku(current);
                                        return active ? updateSku(current, active.id, { sceneChange: next }) : current;
                                    });
                                }}
                                className="order-2 w-[200px] min-w-0 accent-primary"
                            />
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-[12px] leading-5">
                            <span className="text-muted-foreground">生成：</span>
                            {REPLACE_GOODS_OUTPUT_OPTIONS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    data-testid={`replace-goods-output-${value}`}
                                    aria-pressed={workspace.outputNum === value}
                                    onClick={() => setWorkspace((current) => ({ ...current, outputNum: value }))}
                                    className={cn(
                                        "h-6 rounded-[4px] px-1.5 transition",
                                        workspace.outputNum === value ? "bg-selected-soft text-foreground" : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {value}张
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            data-testid="replace-goods-submit"
                            aria-disabled={issues.length > 0 || running}
                            onClick={() => void submit()}
                            className="inline-flex h-8 w-[187px] shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] text-primary-foreground transition hover:opacity-90"
                        >
                            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" aria-hidden />}
                            <span>{running ? "生成中…" : "立即生成"}</span>
                        </button>
                    </div>
                </div>
            </ToolWorkspaceColumns>
        </section>
    );
}
