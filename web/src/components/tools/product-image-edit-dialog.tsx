/**
 * 商品原图处理弹窗：上传区的「消除 / 抠图」动作接的是仓库里已有的**真实能力**，不新增假接口。
 *
 * - 消除 → AREA_REPAIR 链路：蒙版笔刷 → renderMaskPng → buildAreaRepairUnits → runAreaRepairUnits
 *   （与「智能编辑 / 区域修复」工具页同一条上游编辑调用，带 imageUrl + maskUrl + prompt）
 * - 抠图 → 图像编辑接口 requestEdit，background=transparent 让上游直接出透明底主体图
 *
 * 两者成功后都把结果以 PNG File 交回父组件，由父组件走正常的「重新入库」流程，
 * 因此下游的校验（尺寸 / 体积 / 格式）与普通上传完全一致。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Loader2, Paintbrush, Scissors, Sparkles, Undo2, X } from "lucide-react";

import { buildAreaRepairUnits, createAreaRepairRunPort, renderMaskPng, runAreaRepairUnits } from "@/features/tools/adapters/area-repair";
import {
    AREA_REPAIR_DEFAULT_OUTPUT,
    MASK_BRUSH_DEFAULT,
    MASK_BRUSH_MAX,
    MASK_BRUSH_MIN,
    buildAreaRepairSnapshot,
    validateAreaRepairInput,
    type MaskPoint,
    type MaskState,
    type MaskStroke,
    type MaskTool,
} from "@/features/tools/registry/area-repair";
import { requestEdit } from "@/services/api/image";
import { fixColorOutputSize } from "@/features/tools/adapters/fix-color";
import { resolveModelForCapability, useConfigStore, type AiConfig } from "@/stores/use-config-store";

export type ProductImageEditMode = "erase" | "cutout";

export type ProductImageEditSource = {
    id: string;
    name: string;
    dataUrl: string;
    width: number;
    height: number;
};

type Props = {
    open: boolean;
    mode: ProductImageEditMode;
    source: ProductImageEditSource | null;
    onClose: () => void;
    /** 结果图以 File 形式交回：父组件按自己的校验规则重新入库。 */
    onApply: (file: File) => void | Promise<void>;
};

const DEFAULT_ERASE_PROMPT = "消除涂抹区域的瑕疵与杂物，保持商品主体、材质与光影不变";
const CUTOUT_PROMPT =
    "抠出画面中的商品主体，完整保留主体边缘细节（含发丝、半透明材质），去掉背景，输出透明背景 PNG，不要添加任何新元素";

const MODE_TITLE: Record<ProductImageEditMode, string> = {
    erase: "消除原图瑕疵",
    cutout: "继续抠图（去背景）",
};

const MODE_HINT: Record<ProductImageEditMode, string> = {
    erase: "用画笔涂抹要消除的区域，可切橡皮擦修正；提交后由上游按涂抹范围重绘。",
    cutout: "上传原图后会自动去背景并保留主体，结果可直接作为后续生成的输入图。",
};

function nextStrokeId() {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function dataUrlToPngFile(dataUrl: string, baseName: string) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const safe = (baseName || "image").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "image";
    return new File([blob], `${safe}.png`, { type: blob.type || "image/png" });
}

export function ProductImageEditDialog({ open, mode, source, onClose, onApply }: Props) {
    const config = useConfigStore((state) => state.config);

    const [tool, setTool] = useState<MaskTool>("brush");
    const [brushSize, setBrushSize] = useState(MASK_BRUSH_DEFAULT);
    const [strokes, setStrokes] = useState<MaskStroke[]>([]);
    const [prompt, setPrompt] = useState(DEFAULT_ERASE_PROMPT);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState("");
    const [applying, setApplying] = useState(false);

    const imageRef = useRef<HTMLImageElement | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef<MaskStroke | null>(null);

    /* ------------------------------ 绘制 ------------------------------ */

    const redraw = useCallback(() => {
        const canvas = overlayRef.current;
        if (!canvas || !source) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes) {
            if (stroke.points.length === 0) continue;
            context.save();
            context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
            context.lineCap = "round";
            context.lineJoin = "round";
            context.lineWidth = stroke.size;
            context.strokeStyle = "rgba(239,68,68,0.45)";
            context.beginPath();
            const first = stroke.points[0];
            context.moveTo(first.x * canvas.width, first.y * canvas.height);
            if (stroke.points.length === 1) {
                context.lineTo(first.x * canvas.width + 0.01, first.y * canvas.height);
            } else {
                for (const point of stroke.points.slice(1)) {
                    context.lineTo(point.x * canvas.width, point.y * canvas.height);
                }
            }
            context.stroke();
            context.restore();
        }
    }, [source, strokes]);

    useEffect(() => {
        redraw();
    }, [redraw]);

    // 换图 / 关闭时重置编辑态，避免把上一张的笔画带到下一张。
    useEffect(() => {
        if (!open) return;
        setStrokes([]);
        setError("");
        setResult("");
        setBusy(false);
        setApplying(false);
        setTool("brush");
        setBrushSize(MASK_BRUSH_DEFAULT);
        setPrompt(mode === "erase" ? DEFAULT_ERASE_PROMPT : CUTOUT_PROMPT);
    }, [open, mode, source?.id]);

    const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): MaskPoint => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.width ? (event.clientX - rect.left) / rect.width : 0;
        const y = rect.height ? (event.clientY - rect.top) / rect.height : 0;
        return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    };

    function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
        if (busy) return;
        const stroke: MaskStroke = { id: nextStrokeId(), tool, size: brushSize, points: [pointFromEvent(event)] };
        drawingRef.current = stroke;
        event.currentTarget.setPointerCapture(event.pointerId);
        setStrokes((prev) => [...prev, stroke]);
    }

    function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
        const stroke = drawingRef.current;
        if (!stroke || busy) return;
        const point = pointFromEvent(event);
        setStrokes((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.id !== stroke.id) return prev;
            const next = prev.slice(0, -1);
            next.push({ ...last, points: [...last.points, point] });
            return next;
        });
    }

    function handlePointerUp() {
        drawingRef.current = null;
    }

    /* ------------------------------ 提交 ------------------------------ */

    async function runErase(): Promise<string> {
        if (!source) throw new Error("缺少原图，请重新上传后再试。");
        const state: MaskState = { strokes, tool, brushSize, feather: 0, inverted: false, autoExpand: false };
        const mask = await renderMaskPng(state, { width: source.width, height: source.height });
        const promptText = prompt.trim() || DEFAULT_ERASE_PROMPT;
        const problems = validateAreaRepairInput({
            imageUrl: source.dataUrl,
            maskUrl: mask.dataUrl,
            prompt: promptText,
            outputNum: AREA_REPAIR_DEFAULT_OUTPUT,
            imageWidth: source.width,
            imageHeight: source.height,
            maskWidth: mask.width,
            maskHeight: mask.height,
        });
        if (problems.length > 0) throw new Error(problems.map((issue) => issue.message).join("；"));

        const snapshot = buildAreaRepairSnapshot({
            imageAssetId: source.id,
            imageName: source.name,
            imageWidth: source.width,
            imageHeight: source.height,
            state,
            prompt: promptText,
            outputNum: AREA_REPAIR_DEFAULT_OUTPUT,
            maskDataUrl: mask.dataUrl,
        });
        const units = buildAreaRepairUnits({
            snapshot,
            image: { id: source.id, name: source.name, type: "image/png", dataUrl: source.dataUrl },
            mask: { id: `mask-${snapshot.maskHash}`, name: "mask.png", type: "image/png", dataUrl: mask.dataUrl },
        });
        const port = createAreaRepairRunPort();
        const outcomes = await runAreaRepairUnits(units, { port, concurrency: 1 });
        const succeeded = outcomes.find((outcome) => outcome.status === "succeeded" && outcome.image);
        const dataUrl = succeeded?.image?.dataUrl || succeeded?.image?.url;
        if (!dataUrl) {
            const failure = outcomes.find((outcome) => outcome.error)?.error;
            throw new Error(failure?.message || "上游没有返回结果图，请调整涂抹范围后重试。");
        }
        return dataUrl;
    }

    async function runCutout(): Promise<string> {
        if (!source) throw new Error("缺少原图，请重新上传后再试。");
        const model = resolveModelForCapability(config, config.imageModel, "image") || config.imageModel;
        if (!model) throw new Error("还没有可用的图像模型，请到「设置 → 模型」里选择后再试。");
        const editConfig: AiConfig = {
            ...config,
            model,
            imageModel: model,
            count: "1",
            // 上游硬约束：宽高必须吸附到 16 的倍数，并落在图像管线像素区间内（复用 fix-color 已验证的实现）。
            size: fixColorOutputSize(source.width, source.height) ?? config.size,
            background: "transparent",
        };
        const images = await requestEdit(editConfig, prompt.trim() || CUTOUT_PROMPT, [
            { id: source.id, name: source.name, type: "image/png", dataUrl: source.dataUrl },
        ]);
        const dataUrl = images[0]?.dataUrl;
        if (!dataUrl) throw new Error("上游没有返回结果图，请重试。");
        return dataUrl;
    }

    async function handleSubmit() {
        if (!source || busy) return;
        if (mode === "erase" && strokes.filter((stroke) => stroke.tool === "brush").length === 0) {
            setError("请先用画笔涂抹要消除的区域。");
            return;
        }
        setBusy(true);
        setError("");
        setResult("");
        try {
            const dataUrl = mode === "erase" ? await runErase() : await runCutout();
            if (!dataUrl) throw new Error("上游没有返回结果图，请重试。");
            setResult(dataUrl);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    }

    async function handleApply() {
        if (!source || !result || applying) return;
        setApplying(true);
        setError("");
        try {
            const file = await dataUrlToPngFile(result, `${source.name.replace(/\.[^.]+$/, "")}-${mode === "erase" ? "erased" : "cutout"}`);
            await onApply(file);
            onClose();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setApplying(false);
        }
    }

    if (!open || !source) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={MODE_TITLE[mode]}>
            <div className="flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
                <header className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                        {mode === "erase" ? <Eraser className="size-4" /> : <Scissors className="size-4" />}
                        <h2 className="text-[14px] font-medium">{MODE_TITLE[mode]}</h2>
                    </div>
                    <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={onClose} disabled={busy || applying} aria-label="关闭">
                        <X className="size-4" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                    <p className="mb-3 text-[12px] text-muted-foreground">{MODE_HINT[mode]}</p>

                    <div className="relative mx-auto w-fit max-w-full rounded-lg border border-border bg-[repeating-conic-gradient(#0000_0_25%,#0000000d_0_50%)] bg-[length:16px_16px]">
                        <img
                            ref={imageRef}
                            src={result || source.dataUrl}
                            alt={source.name}
                            className="block max-h-[52vh] w-auto max-w-full select-none"
                            draggable={false}
                        />
                        {mode === "erase" && !result ? (
                            <canvas
                                ref={overlayRef}
                                width={source.width}
                                height={source.height}
                                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                            />
                        ) : null}
                    </div>

                    {mode === "erase" && !result ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setTool("brush")}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[12px] ${tool === "brush" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                            >
                                <Paintbrush className="size-3.5" /> 画笔
                            </button>
                            <button
                                type="button"
                                onClick={() => setTool("eraser")}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[12px] ${tool === "eraser" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                            >
                                <Eraser className="size-3.5" /> 橡皮擦
                            </button>
                            <label className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                                笔刷
                                <input
                                    type="range"
                                    min={MASK_BRUSH_MIN}
                                    max={MASK_BRUSH_MAX}
                                    value={brushSize}
                                    onChange={(event) => setBrushSize(Number(event.target.value))}
                                    className="w-28"
                                />
                                <span className="tabular-nums text-foreground">{brushSize}px</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                                disabled={strokes.length === 0}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[12px] text-muted-foreground disabled:opacity-40"
                            >
                                <Undo2 className="size-3.5" /> 撤销
                            </button>
                            <button
                                type="button"
                                onClick={() => setStrokes([])}
                                disabled={strokes.length === 0}
                                className="rounded border border-border px-2 py-1 text-[12px] text-muted-foreground disabled:opacity-40"
                            >
                                清空
                            </button>
                        </div>
                    ) : null}

                    <label className="mt-3 block text-[12px] text-muted-foreground">
                        处理要求
                        <textarea
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            rows={2}
                            className="mt-1 w-full resize-none rounded border border-border bg-transparent px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-primary"
                        />
                    </label>

                    {error ? <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[12px] text-destructive">{error}</p> : null}
                </div>

                <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                    <span className="text-[12px] text-muted-foreground">结果会作为新的商品图回填到上传区。</span>
                    <div className="flex items-center gap-2">
                        <button type="button" className="rounded border border-border px-3 py-1.5 text-[13px]" onClick={onClose} disabled={busy || applying}>
                            取消
                        </button>
                        {result ? (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-[13px] text-primary-foreground disabled:opacity-60"
                                onClick={handleApply}
                                disabled={applying}
                            >
                                {applying ? <Loader2 className="size-3.5 animate-spin" /> : null} 使用结果
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-[13px] text-primary-foreground disabled:opacity-60"
                                onClick={handleSubmit}
                                disabled={busy || (mode === "erase" && strokes.length === 0)}
                            >
                                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                                {busy ? "处理中…" : mode === "erase" ? "开始消除" : "开始抠图"}
                            </button>
                        )}
                    </div>
                </footer>
            </div>
        </div>
    );
}

export default ProductImageEditDialog;
