/**
 * TASK-023：「商品替换」REPLACE_GOODS 工作区（layout = replace）。
 *
 * 真实边界：
 *  - 参考场景 + 替换商品双输入；每个 SKU 一份独立的四边形（透视/扭曲）、蒙版与场景变化程度；
 *  - 画布拖动会真实改变 `targetConfig/point/scale/rotate`（由 registry 的四边形派生），不是装饰动画；
 *  - 提交前由本机真正渲染「落位导引图」和保护蒙版 PNG（adapters/replace-goods），与两张原图一起发出；
 *  - 结果只来自上游返回，空结果判失败；配置一变即把旧结果标记为「来自旧版本」。
 *
 * 与 PRODUCT_SCENE / NEW_REPLACE_BG_V2 的区别：本页是「场景不变、商品本体被替换」，
 * 因此必须有原商品锁定与替换商品落位，没有场景词/风格词输入。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Layers, Loader2, Move, Plus, Redo2, RotateCcw, Trash2, Undo2 } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import { cn, randomId } from "@/lib/utils";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

import {
    assertReplaceGoodsInput,
    buildReplaceGoodsInput,
    buildReplaceGoodsUnit,
    replaceGoodsOutcomeFromTask,
    renderPlacementGuidePng,
    renderProtectMaskPng,
    REPLACE_GOODS_GUIDE_MAX_SIDE,
    assertReplaceGoodsInput as assertInput,
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
    REPLACE_GOODS_OUTPUT_NUM,
    REPLACE_GOODS_OUTPUT_OPTIONS,
    REPLACE_GOODS_OUTPUT_SIZE,
    REPLACE_GOODS_SCENE_CHANGES,
    REPLACE_GOODS_TOOL_ID,
    REPLACE_GOODS_UPLOAD_LIMITS,
    REPLACE_GOODS_UPLOAD_LABEL,
    REPLACE_GOODS_WARP_MODES,
    activeSku,
    activeSkuIndex,
    addSku,
    applyQuad,
    clamp01,
    createTransformHistory,
    createWorkspace,
    deriveQuadFields,
    dragQuadCorner,
    getReplaceGoodsSpec,
    moveQuad,
    parseDraftValues,
    pointInQuad,
    protectMaskCoverage,
    redoTransform,
    removeSku,
    resetTransform,
    rotateQuad,
    scaleQuad,
    serializeDraftValues,
    switchSku,
    transformHistoryLabel,
    undoTransform,
    updateSku,
    validateUnit,
    validateWorkspace,
    type ReplaceGoodsCorner,
    type ReplaceGoodsMask,
    type ReplaceGoodsPoint,
    type ReplaceGoodsQuad,
    type ReplaceGoodsSceneChange,
    type ReplaceGoodsSize,
    type ReplaceGoodsSku,
    type ReplaceGoodsWarpMode,
    type ReplaceGoodsWorkspace,
} from "@/features/tools/registry/replace-goods";

const SCENE_SLOT_ID = `${REPLACE_GOODS_TOOL_ID}-scene`;
const TARGET_SLOT_PREFIX = `${REPLACE_GOODS_TOOL_ID}-target`;
const UPLOAD_CONSTRAINTS = {
    mimeTypes: [...REPLACE_GOODS_UPLOAD_LIMITS.mimeTypes],
    maxBytes: REPLACE_GOODS_UPLOAD_LIMITS.maxBytes,
    minSide: REPLACE_GOODS_UPLOAD_LIMITS.minSide,
    maxSide: REPLACE_GOODS_UPLOAD_LIMITS.maxSide,
};

type RunState = {
    status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
    skuId?: string;
    outcome?: ReplaceGoodsUnitOutcome;
    message?: string;
};

/* ------------------------------------------------------------------ *
 * 小构件
 * ------------------------------------------------------------------ */

function StepCard({ step, title, hint, active, done, children }: { step: number; title: string; hint: string; active: boolean; done: boolean; children: React.ReactNode }) {
    return (
        <section
            data-testid={`replace-goods-step-${step}`}
            data-state={done ? "done" : active ? "active" : "pending"}
            className={cn("rounded-2xl border bg-card p-4", active ? "border-primary/60" : "border-border")}
        >
            <header className="flex items-start gap-2">
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold", done ? "bg-primary text-primary-foreground" : active ? "border border-primary text-primary" : "border border-border text-muted-foreground")}>
                    {step}
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-foreground">{title}</h3>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>
                </div>
            </header>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="flex items-baseline justify-between gap-2 text-xs font-medium text-foreground">
                {label}
                {hint ? <span className="text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
            </span>
            {children}
        </label>
    );
}

/* ------------------------------------------------------------------ *
 * PerspectiveWarpCanvas：四边形拖动 + 蒙版笔刷（真实坐标，归一化存储）
 * ------------------------------------------------------------------ */

type CanvasTool = "warp" | "mask" | "eraser";

function PerspectiveWarpCanvas({
    scene,
    quad,
    mask,
    mode,
    tool,
    brush,
    disabled,
    onQuad,
    onStroke,
}: {
    scene: { url: string; width: number; height: number } | null;
    quad: ReplaceGoodsQuad;
    mask: ReplaceGoodsMask;
    mode: ReplaceGoodsWarpMode;
    tool: CanvasTool;
    brush: number;
    disabled?: boolean;
    onQuad: (quad: ReplaceGoodsQuad) => void;
    onStroke: (stroke: MaskStroke) => void;
}) {
    const boxRef = useRef<HTMLDivElement | null>(null);
    const [box, setBox] = useState({ width: 0, height: 0 });
    const [live, setLive] = useState<ReplaceGoodsQuad | null>(null);
    const [draft, setDraft] = useState<{ x: number; y: number }[] | null>(null);
    const dragRef = useRef<{ kind: "corner"; corner: ReplaceGoodsCorner } | { kind: "move"; last: ReplaceGoodsPoint } | null>(null);

    useEffect(() => {
        const element = boxRef.current;
        if (!element || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) setBox({ width: Math.round(rect.width), height: Math.round(rect.height) });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const current = live ?? quad;

    const toNormalized = useCallback((event: React.PointerEvent): ReplaceGoodsPoint => {
        const rect = boxRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
        return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
    }, []);

    const startCorner = (corner: ReplaceGoodsCorner) => (event: React.PointerEvent) => {
        if (disabled) return;
        event.preventDefault();
        (event.target as Element).setPointerCapture?.(event.pointerId);
        dragRef.current = { kind: "corner", corner };
    };

    const startMove = (event: React.PointerEvent) => {
        if (disabled || tool !== "warp") return;
        const point = toNormalized(event);
        if (tool === "warp" && !pointInQuad(current, point)) return;
        event.preventDefault();
        dragRef.current = { kind: "move", last: point };
    };

    const handleMove = (event: React.PointerEvent) => {
        if (disabled) return;
        const point = toNormalized(event);
        if (tool !== "warp") {
            if (!draft) return;
            setDraft([...draft, point]);
            return;
        }
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.kind === "corner") {
            setLive(dragQuadCorner(current, drag.corner, point, mode));
            return;
        }
        const dx = point.x - drag.last.x;
        const dy = point.y - drag.last.y;
        dragRef.current = { kind: "move", last: point };
        setLive(moveQuad(current, dx, dy));
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

    const handleDown = (event: React.PointerEvent) => {
        if (disabled) return;
        if (tool === "warp") {
            startMove(event);
            return;
        }
        event.preventDefault();
        (event.target as Element).setPointerCapture?.(event.pointerId);
        setDraft([toNormalized(event)]);
    };

    const points = REPLACE_GOODS_CORNERS.map((corner) => current[corner]);
    const scale = box.width > 0 ? box.width : 1;
    const strokeWidth = (size: number) => Math.max(1, (size * scale) / Math.max(1, scene?.width ?? scale));

    return (
        <div
            ref={boxRef}
            data-testid="replace-goods-canvas"
            className={cn("relative select-none overflow-hidden rounded-xl border border-border bg-muted", disabled && "opacity-70")}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            style={{ touchAction: "none", cursor: tool === "warp" ? "crosshair" : "cell" }}
        >
            {scene ? <img src={scene.url} alt="参考场景" className="block h-auto w-full" draggable={false} /> : (
                <div data-testid="replace-goods-canvas-empty" className="grid aspect-square place-items-center text-xs text-muted-foreground">
                    先上传参考场景，再拖动定位替换商品
                </div>
            )}
            {scene ? (
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {mask.mode === "auto" ? (
                        <path
                            d={`M0 0 H100 V100 H0 Z ${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x * 100} ${point.y * 100}`).join(" ")} Z`}
                            fill="rgba(15,23,42,0.35)"
                            fillRule="evenodd"
                        />
                    ) : null}
                    {mask.strokes.map((stroke) => (
                        <polyline
                            key={stroke.id}
                            points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
                            fill="none"
                            stroke={stroke.tool === "eraser" ? "rgba(239,68,68,0.6)" : "rgba(56,189,248,0.65)"}
                            strokeWidth={0.6}
                            strokeLinecap="round"
                            strokeDasharray={stroke.tool === "eraser" ? "1.5 1" : undefined}
                        />
                    ))}
                    {draft && draft.length > 1 ? (
                        <polyline points={draft.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth={0.8} />
                    ) : null}
                    <polygon points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} fill="none" stroke="rgba(255,64,64,0.9)" strokeWidth={0.4} />
                </svg>
            ) : null}
            {scene
                ? REPLACE_GOODS_CORNERS.map((corner) => (
                      <button
                          key={corner}
                          type="button"
                          aria-label={`拖动 ${corner} 角点`}
                          data-testid={`replace-goods-handle-${corner}`}
                          disabled={disabled}
                          onPointerDown={startCorner(corner)}
                          className="absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ left: `${current[corner].x * 100}%`, top: `${current[corner].y * 100}%` }}
                      >
                          <span className="size-3 rounded-full border-2 border-white bg-red-500 shadow" />
                      </button>
                  ))
                : null}
            {draft ? null : null}
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
    const spec = useMemo(() => getReplaceGoodsSpec(), []);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [draftReady, setDraftReady] = useState(false);
    const [workspace, setWorkspace] = useState<ReplaceGoodsWorkspace>(() => createWorkspace());
    const [sceneRecord, setSceneRecord] = useState<ToolAssetRecord | null>(null);
    const [targets, setTargets] = useState<Record<string, ToolAssetRecord | null>>({});
    const [tool, setTool] = useState<CanvasTool>("warp");
    const [task, setTask] = useState<ToolTask | null>(null);
    const [unit, setUnit] = useState<ReplaceGoodsUnit | null>(null);
    const [outcome, setOutcome] = useState<ReplaceGoodsUnitOutcome | null>(null);
    const [running, setRunning] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const revisionRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    /** 提交那一刻的配置指纹；与当前配置不同即标记结果「来自旧版本」。 */
    const submittedKeyRef = useRef<string | null>(null);

    const sku = activeSku(workspace);
    const skuIndex = activeSkuIndex(workspace);
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
        setNotice(next ? "已更换参考场景：定位与蒙版已重置，请重新框选商品位置" : null);
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

    /* ---------------- 画布变换 ---------------- */

    const commitQuad = useCallback((quad: ReplaceGoodsQuad) => {
        setWorkspace((current) => applyQuad(current, quad));
        setTask(null);
    }, []);

    const addStroke = useCallback((stroke: MaskStroke) => {
        setWorkspace((current) => {
            const active = activeSku(current);
            if (!active) return current;
            return updateSku(current, active.id, { mask: { ...active.mask, strokes: [...active.mask.strokes, stroke] } });
        });
        setTask(null);
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

    const undo = useCallback(() => {
        setWorkspace((current) => {
            const active = activeSku(current);
            if (!active) return current;
            return updateSku(current, active.id, { history: undoTransform(active.history) });
        });
    }, []);

    const redo = useCallback(() => {
        setWorkspace((current) => {
            const active = activeSku(current);
            if (!active) return current;
            return updateSku(current, active.id, { history: redoTransform(active.history) });
        });
    }, []);

    const resetQuad = useCallback(() => {
        setWorkspace((current) => {
            const active = activeSku(current);
            if (!active) return current;
            const size: ReplaceGoodsSize = active.fit;
            return updateSku(current, active.id, { history: resetTransform(active.history, size) });
        });
    }, []);

    const clearMask = useCallback(() => {
        setWorkspace((current) => {
            const active = activeSku(current);
            if (!active) return current;
            return updateSku(current, active.id, { mask: { ...active.mask, strokes: [] } });
        });
    }, []);

    /* ---------------- 校验 ---------------- */

    const issues = useMemo(() => {
        const list = validateWorkspace(workspace);
        if (sceneRecord && target) {
            const missingSize = !sceneRecord.width || !sceneRecord.height || !target.width || !target.height;
            if (missingSize) list.push({ code: "asset-size", message: "图片尺寸读取失败，请重新上传" });
        }
        return list;
    }, [sceneRecord, target, workspace]);

    const canSubmit = Boolean(sceneRecord && target) && issues.length === 0 && !running;

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
        if (!canSubmit) return;
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
    }, [buildActiveUnit, canSubmit]);

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

    const sidebar = (
        <div className="space-y-2 text-sm">
            <p className="px-2 text-xs font-medium text-muted-foreground">同分类工具</p>
            <Link to="/tools/product-design/scene" className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent">
                <span>场景裂变</span>
                <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <Link to="/tools/product-design/handheld" className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent">
                <span>手持商品</span>
                <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" />
            </Link>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">上传上限：{REPLACE_GOODS_UPLOAD_LABEL}</p>
            <p className="px-2 text-[11px] leading-4 text-muted-foreground">快捷键：T 透视 / N 扭曲 / 方向键微调 / [ ] 旋转 / + − 缩放</p>
        </div>
    );

    const scene = workspace.scene && sceneRecord && sceneRecord.url
        ? { url: sceneRecord.url, width: sceneRecord.width ?? 0, height: sceneRecord.height ?? 0 }
        : null;
    const quadFields = sku ? deriveQuadFields(sku.history.present.quad, sku.fit) : null;
    const historyLabel = sku ? transformHistoryLabel(sku.history) : { canUndo: false, canRedo: false };
    const coverage = sku ? protectMaskCoverage(sku.mask, sku.history.present.quad) : 0;

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "商品替换"}
            subtitle="上传参考场景 → 框选原商品位置 → 上传替换商品 → 透视/扭曲定位 → 生成，一次真实图像编辑"
            badges={
                <span data-testid="replace-goods-make-type" className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    makeType {spec?.makeType ?? 12}
                </span>
            }
            sidebar={sidebar}
        >
            <div data-testid="replace-goods-workspace" className="grid gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-4">
                    <StepCard step={1} title="上传参考场景（含原商品）" hint="场景里的原商品会被替换，背景、光影与道具默认保持。" active={!scene} done={Boolean(scene)}>
                        <ToolAssetInput
                            toolId={SCENE_SLOT_ID}
                            title="Step 1 · 参考场景"
                            maxCount={1}
                            constraints={UPLOAD_CONSTRAINTS}
                            onChange={handleSceneChange}
                        />
                    </StepCard>

                    <StepCard step={2} title="框选原商品位置并上传替换商品" hint="四边形即替换落位：透视模式对边平行，扭曲模式可自由拖动任一角；四边形外默认锁定保护。" active={Boolean(scene) && !target} done={Boolean(target)}>
                        <div className="space-y-3">
                            <div
                                tabIndex={0}
                                onKeyDown={nudge}
                                className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="商品定位画布"
                            >
                                <PerspectiveWarpCanvas
                                    scene={scene}
                                    quad={sku?.history.present.quad ?? { topLeft: { x: 0.15, y: 0.15 }, topRight: { x: 0.85, y: 0.15 }, bottomRight: { x: 0.85, y: 0.85 }, bottomLeft: { x: 0.15, y: 0.85 } }}
                                    mask={sku?.mask ?? { mode: "auto", strokes: [], brush: REPLACE_GOODS_MASK_BRUSH.defaultValue }}
                                    mode={workspace.mode}
                                    tool={tool}
                                    brush={sku?.mask.brush ?? REPLACE_GOODS_MASK_BRUSH.defaultValue}
                                    disabled={!scene}
                                    onQuad={commitQuad}
                                    onStroke={addStroke}
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                {(["warp", "mask", "eraser"] as CanvasTool[]).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        data-testid={`replace-goods-tool-${item}`}
                                        onClick={() => setTool(item)}
                                        aria-pressed={tool === item}
                                        className={cn(
                                            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition",
                                            tool === item ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                        )}
                                    >
                                        {item === "warp" ? <Move className="size-3.5" /> : item === "mask" ? <Layers className="size-3.5" /> : <Trash2 className="size-3.5" />}
                                        {item === "warp" ? "定位" : item === "mask" ? "补锁" : "擦除"}
                                    </button>
                                ))}
                                <span className="mx-1 h-5 w-px bg-border" />
                                <button type="button" data-testid="replace-goods-undo" onClick={undo} disabled={!historyLabel.canUndo} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground disabled:opacity-40 hover:bg-accent">
                                    <Undo2 className="size-3.5" />撤销
                                </button>
                                <button type="button" data-testid="replace-goods-redo" onClick={redo} disabled={!historyLabel.canRedo} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground disabled:opacity-40 hover:bg-accent">
                                    <Redo2 className="size-3.5" />重做
                                </button>
                                <button type="button" data-testid="replace-goods-reset" onClick={resetQuad} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent">
                                    <RotateCcw className="size-3.5" />复位
                                </button>
                                <button type="button" data-testid="replace-goods-clear-mask" onClick={clearMask} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent">
                                    清空蒙版
                                </button>
                            </div>

                            {quadFields ? (
                                <dl data-testid="replace-goods-quad-readout" className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-[11px] text-muted-foreground">
                                    <div>
                                        <dt>中心点</dt>
                                        <dd className="font-mono text-foreground">{quadFields.point.x.toFixed(3)}, {quadFields.point.y.toFixed(3)}</dd>
                                    </div>
                                    <div>
                                        <dt>缩放</dt>
                                        <dd className="font-mono text-foreground">{quadFields.scale.toFixed(2)}×</dd>
                                    </div>
                                    <div>
                                        <dt>旋转</dt>
                                        <dd className="font-mono text-foreground">{quadFields.rotate.toFixed(1)}°</dd>
                                    </div>
                                    <div className="col-span-3">锁定覆盖：{(coverage * 100).toFixed(1)}%（四边形外自动保护，可用补锁/擦除微调）</div>
                                </dl>
                            ) : null}

                            <ToolAssetInput
                                toolId={sku ? `${TARGET_SLOT_PREFIX}-${sku.id}` : TARGET_SLOT_PREFIX}
                                title={`Step 2 · 替换商品（${sku?.label ?? "商品 1"}）`}
                                maxCount={1}
                                constraints={UPLOAD_CONSTRAINTS}
                                disabled={!scene}
                                onChange={handleTargetChange(sku?.id ?? "sku-1")}
                            />
                        </div>
                    </StepCard>

                    <StepCard step={3} title="场景变化与输出" hint="变化程度决定背景重绘幅度；去噪强度影响新商品与场景的贴合质感。" active={Boolean(target)} done={Boolean(task)}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="场景变化程度" hint={`${REPLACE_GOODS_SCENE_CHANGES.length} 档`}>
                                <div className="flex gap-1.5">
                                    {REPLACE_GOODS_SCENE_CHANGES.map((option) => (
                                        <button
                                            key={option.id}
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
                                            className={cn(
                                                "h-9 flex-1 rounded-lg border text-xs",
                                                sku?.sceneChange === option.id ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            <Field label="抠图引擎">
                                <select
                                    data-testid="replace-goods-cutout"
                                    value={workspace.cutoutProvider}
                                    onChange={(event) => setWorkspace((current) => ({ ...current, cutoutProvider: event.target.value as ReplaceGoodsWorkspace["cutoutProvider"] }))}
                                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                                >
                                    {REPLACE_GOODS_CUTOUT_PROVIDERS.map((provider) => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.label}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="去噪强度" hint={`${workspace.denoiseStrength}`}>
                                <input
                                    data-testid="replace-goods-denoise"
                                    type="range"
                                    min={REPLACE_GOODS_DENOISE.min}
                                    max={REPLACE_GOODS_DENOISE.max}
                                    step={REPLACE_GOODS_DENOISE.step}
                                    value={workspace.denoiseStrength}
                                    onChange={(event) => setWorkspace((current) => ({ ...current, denoiseStrength: Number(event.target.value) }))}
                                    className="w-full accent-primary"
                                />
                            </Field>

                            <Field label="输出数量" hint={`${REPLACE_GOODS_OUTPUT_SIZE.width}×${REPLACE_GOODS_OUTPUT_SIZE.height}`}>
                                <div className="flex gap-1.5">
                                    {REPLACE_GOODS_OUTPUT_OPTIONS.map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            data-testid={`replace-goods-output-${value}`}
                                            aria-pressed={workspace.outputNum === value}
                                            onClick={() => setWorkspace((current) => ({ ...current, outputNum: value }))}
                                            className={cn(
                                                "h-9 flex-1 rounded-lg border text-xs",
                                                workspace.outputNum === value ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                            )}
                                        >
                                            {value} 张
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            <Field label="定位模式" hint="T / N">
                                <div className="flex gap-1.5">
                                    {REPLACE_GOODS_WARP_MODES.map((mode) => (
                                        <button
                                            key={mode.id}
                                            type="button"
                                            data-testid={`replace-goods-mode-${mode.id}`}
                                            title={mode.hint}
                                            aria-pressed={workspace.mode === mode.id}
                                            onClick={() => setWorkspace((current) => ({ ...current, mode: mode.id }))}
                                            className={cn(
                                                "h-9 flex-1 rounded-lg border text-xs",
                                                workspace.mode === mode.id ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                            )}
                                        >
                                            {mode.label}（{mode.shortcut}）
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            <Field label="蒙版笔刷" hint={`${sku?.mask.brush ?? REPLACE_GOODS_MASK_BRUSH.defaultValue}px`}>
                                <input
                                    data-testid="replace-goods-brush"
                                    type="range"
                                    min={REPLACE_GOODS_MASK_BRUSH.min}
                                    max={REPLACE_GOODS_MASK_BRUSH.max}
                                    value={sku?.mask.brush ?? REPLACE_GOODS_MASK_BRUSH.defaultValue}
                                    onChange={(event) =>
                                        setWorkspace((current) => {
                                            const active = activeSku(current);
                                            if (!active) return current;
                                            return updateSku(current, active.id, { mask: { ...active.mask, brush: Number(event.target.value) } });
                                        })
                                    }
                                    className="w-full accent-primary"
                                />
                            </Field>
                        </div>
                    </StepCard>

                    <section className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-medium text-foreground">生成结果</h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    预计输出 {workspace.outputNum} 张 · {REPLACE_GOODS_OUTPUT_SIZE.width}×{REPLACE_GOODS_OUTPUT_SIZE.height}
                                    {stale ? " · 当前配置已变更，下面结果来自旧版本" : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                data-testid="replace-goods-submit"
                                disabled={!canSubmit}
                                onClick={submit}
                                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {running ? <Loader2 className="size-4 animate-spin" /> : null}
                                {running ? "生成中…" : `开始替换（${workspace.outputNum} 张）`}
                            </button>
                        </div>

                        {issues.length > 0 ? (
                            <ul data-testid="replace-goods-issues" className="mt-2 space-y-1 text-xs text-amber-600 dark:text-amber-400">
                                {issues.map((issue) => (
                                    <li key={issue.code}>· {issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                        {notice ? <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{notice}</p> : null}
                        {submitError ? <p data-testid="replace-goods-submit-error" className="mt-2 text-xs text-destructive">{submitError}</p> : null}

                        <div className="mt-3">
                            <ToolResult task={task} toolId={REPLACE_GOODS_TOOL_ID} title="替换结果" onCancel={() => abortRef.current?.abort()} onRetry={retry} />
                        </div>

                        {unit ? (
                            <details data-testid="replace-goods-snapshot" className="mt-3 rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground">
                                <summary className="cursor-pointer text-xs text-foreground">本次输入快照</summary>
                                <ul className="mt-2 space-y-0.5">
                                    <li>SKU：{unit.snapshot.skuLabel}（{unit.id}）</li>
                                    <li>场景：{unit.snapshot.sceneName || "—"} {unit.snapshot.sceneWidth}×{unit.snapshot.sceneHeight}</li>
                                    <li>替换商品：{unit.snapshot.targetName || "—"} {unit.snapshot.targetWidth}×{unit.snapshot.targetHeight}</li>
                                    <li>中心点 {unit.snapshot.point.x.toFixed(3)}, {unit.snapshot.point.y.toFixed(3)} · 缩放 {unit.snapshot.scale.toFixed(2)}× · 旋转 {unit.snapshot.rotate.toFixed(1)}°</li>
                                    <li>字段 {Object.keys(unit.fields).length} 个 · 保护覆盖 {(unit.maskCoverage * 100).toFixed(1)}% · snapshotHash {unit.snapshotHash}</li>
                                    <li>参考图 {unit.references.length} 张（场景 / 替换商品 / 落位导引 / 保护蒙版）</li>
                                </ul>
                            </details>
                        ) : null}
                    </section>
                </div>

                <aside className="min-w-0 space-y-3">
                    <section className="rounded-2xl border border-border bg-card p-3">
                        <header className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-medium text-foreground">多商品批量替换</h3>
                            <span className="text-[11px] text-muted-foreground">{workspace.skus.length}/{REPLACE_GOODS_MAX_SKUS}</span>
                        </header>
                        <div data-testid="replace-goods-sku-tabs" className="mt-2 flex flex-wrap gap-1.5">
                            {workspace.skus.map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    data-testid={`replace-goods-sku-tab-${index}`}
                                    aria-pressed={item.id === workspace.activeSkuId}
                                    onClick={() => setWorkspace((current) => ({ ...current, activeSkuId: item.id }))}
                                    className={cn(
                                        "h-8 rounded-lg border px-2.5 text-xs",
                                        item.id === workspace.activeSkuId ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                    )}
                                >
                                    {item.label}
                                    {targets[item.id] ? " ·已传" : ""}
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                            <button
                                type="button"
                                data-testid="replace-goods-sku-prev"
                                onClick={() => setWorkspace((current) => switchSku(current, -1))}
                                disabled={workspace.skus.length <= 1}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground disabled:opacity-40 hover:bg-accent"
                            >
                                <ChevronLeft className="size-3.5" />上一张
                            </button>
                            <span className="text-[11px] text-muted-foreground">{skuIndex + 1} / {workspace.skus.length}</span>
                            <button
                                type="button"
                                data-testid="replace-goods-sku-next"
                                onClick={() => setWorkspace((current) => switchSku(current, 1))}
                                disabled={workspace.skus.length <= 1}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground disabled:opacity-40 hover:bg-accent"
                            >
                                下一张<ChevronRight className="size-3.5" />
                            </button>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                            <button
                                type="button"
                                data-testid="replace-goods-sku-add"
                                onClick={() => setWorkspace((current) => addSku(current))}
                                disabled={workspace.skus.length >= REPLACE_GOODS_MAX_SKUS}
                                className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-border text-xs text-muted-foreground disabled:opacity-40 hover:bg-accent"
                            >
                                <Plus className="size-3.5" />新增商品
                            </button>
                            <button
                                type="button"
                                data-testid="replace-goods-sku-remove"
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
                                className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-border text-xs text-muted-foreground disabled:opacity-40 hover:bg-accent"
                            >
                                <Trash2 className="size-3.5" />删除
                            </button>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-border bg-card p-3 text-[11px] leading-5 text-muted-foreground">
                        <p className="text-xs font-medium text-foreground">锁定与保护</p>
                        <p className="mt-1">四边形外默认锁定（保护原场景），「补锁」可额外保护道具与阴影，「擦除」放开需要重绘的区域。</p>
                        <p className="mt-1">左右键切画布保留各 SKU 独立配置；导引图与蒙版在提交时由本机真实渲染，像素即 provider 输入。</p>
                    </section>
                </aside>
            </div>
        </ToolShell>
    );
}
