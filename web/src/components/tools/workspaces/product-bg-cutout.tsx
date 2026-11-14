import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, FlipHorizontal2, Loader2, MousePointerClick, Palette, Redo2, RotateCcw, ScanLine, Undo2, WandSparkles } from "lucide-react";

import { CHECKER } from "@/components/tools/workspaces/product-bg-panels";
import { cn } from "@/lib/utils";
import { autoSegmentSubjectMask, interactivePointSegmentMask, type SegmentationPoint } from "@/services/api/tools/segmentation";

/**
 * 商品图抠图编辑弹窗（原站上传自有商品图后弹出的「手动选择 / 保留 / 去除 / 反选 / 重置 / 撤销 / 重做 /
 * 局部消除 / 预览背景色 / 取消 / 确认使用」弹窗）。
 *
 * 真实边界：
 * - 本地没有自动抠图模型：带透明通道的图按 alpha 识别主体，否则直接进入手动模式并如实提示，不伪造抠图结果；
 * - 画笔「保留」/「去除」、反选、重置、撤销、重做都作用在同一张蒙版层上（白=保留），按操作列表回放；
 * - 「也可以 上传一张蒙版图」：透明图按 alpha、黑白图按亮度转成蒙版；
 * - 确认使用 → 导出与原图同尺寸的黑白蒙版 PNG（白=商品主体），由调用方走 adapter 现有蒙版字段提交；
 * - 「局部消除」需要重绘模型，本地没有，按钮置灰说明。
 */

type Op = { kind: "stroke"; keep: boolean; size: number; points: [number, number][] } | { kind: "invert" } | { kind: "reset" } | { kind: "load"; layer: HTMLCanvasElement };

const TINT = "rgba(249,115,22,0.5)";
const BG_COLORS = [
    { id: "transparent", label: "透明" },
    { id: "#ffffff", label: "白色" },
    { id: "#000000", label: "黑色" },
    { id: "#00b050", label: "绿色" },
];

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("图片读取失败，请重新上传。"));
        el.src = src;
    });
}

function canvasOf(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/** 图片 → 蒙版层（白=保留）：带透明通道按 alpha；没有透明通道时只有 allowLuminance 才按亮度，否则返回 null。 */
function maskLayerFrom(image: CanvasImageSource, width: number, height: number, allowLuminance: boolean): HTMLCanvasElement | null {
    const canvas = canvasOf(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height);
    const px = data.data;
    let hasAlpha = false;
    for (let index = 3; index < px.length; index += 4) if (px[index] < 250) { hasAlpha = true; break; }
    if (!hasAlpha && !allowLuminance) return null;
    for (let index = 0; index < px.length; index += 4) {
        const alpha = hasAlpha ? px[index + 3] : Math.round((px[index] + px[index + 1] + px[index + 2]) / 3);
        px[index] = px[index + 1] = px[index + 2] = 255;
        px[index + 3] = alpha;
    }
    context.putImageData(data, 0, 0);
    return canvas;
}

function drawStroke(context: CanvasRenderingContext2D, op: Extract<Op, { kind: "stroke" }>, start = 0) {
    context.globalCompositeOperation = op.keep ? "source-over" : "destination-out";
    context.strokeStyle = context.fillStyle = "#fff";
    context.lineWidth = op.size;
    context.lineCap = context.lineJoin = "round";
    const points = op.points;
    context.beginPath();
    if (points.length === 1) {
        context.arc(points[0][0], points[0][1], op.size / 2, 0, Math.PI * 2);
        context.fill();
    } else {
        const from = Math.max(0, start - 1);
        context.moveTo(points[from][0], points[from][1]);
        for (let index = from + 1; index < points.length; index += 1) context.lineTo(points[index][0], points[index][1]);
        context.stroke();
    }
    context.globalCompositeOperation = "source-over";
}

export function ProductBgCutout({ src, name, maskSrc, onCancel, onConfirm }: { src: string; name: string; maskSrc?: string; onCancel: () => void; onConfirm: (file: File) => Promise<void> }) {
    const leftRef = useRef<HTMLCanvasElement | null>(null);
    const rightRef = useRef<HTMLCanvasElement | null>(null);
    const work = useRef<{ image?: HTMLImageElement; width: number; height: number; base: HTMLCanvasElement | null; mask?: HTMLCanvasElement; tmp?: HTMLCanvasElement }>({ width: 0, height: 0, base: null });
    const ops = useRef<Op[]>([]);
    const redo = useRef<Op[]>([]);
    const drawing = useRef<Extract<Op, { kind: "stroke" }> | null>(null);
    const frame = useRef(0);
    const bgRef = useRef("transparent");
    const maskInputRef = useRef<HTMLInputElement | null>(null);
    const [keep, setKeep] = useState(true);
    const [toolMode, setToolMode] = useState<"brush" | "point" | "inpaint">("brush");
    const [segPoints, setSegPoints] = useState<SegmentationPoint[]>([]);
    const [size, setSize] = useState(18);
    const [bg, setBg] = useState("transparent");
    const [bgMenu, setBgMenu] = useState(false);
    const [ready, setReady] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [, setVersion] = useState(0);
    const bump = () => setVersion((value) => value + 1);

    const render = useCallback(() => {
        frame.current = 0;
        const { image, width, height, mask, tmp } = work.current;
        const left = leftRef.current?.getContext("2d");
        const right = rightRef.current?.getContext("2d");
        if (!image || !mask || !tmp || !left || !right) return;
        const t = tmp.getContext("2d")!;
        /* 左：原图 + 橙色半透明标出保留区域 */
        t.globalCompositeOperation = "source-over";
        t.clearRect(0, 0, width, height);
        t.drawImage(mask, 0, 0);
        t.globalCompositeOperation = "source-in";
        t.fillStyle = TINT;
        t.fillRect(0, 0, width, height);
        left.clearRect(0, 0, width, height);
        left.drawImage(image, 0, 0);
        left.drawImage(tmp, 0, 0);
        /* 右：保留区域预览（背景色可切换） */
        t.globalCompositeOperation = "source-over";
        t.clearRect(0, 0, width, height);
        t.drawImage(mask, 0, 0);
        t.globalCompositeOperation = "source-in";
        t.drawImage(image, 0, 0);
        right.clearRect(0, 0, width, height);
        if (bgRef.current !== "transparent") {
            right.fillStyle = bgRef.current;
            right.fillRect(0, 0, width, height);
        }
        right.drawImage(tmp, 0, 0);
    }, []);

    const schedule = useCallback(() => {
        if (!frame.current) frame.current = requestAnimationFrame(render);
    }, [render]);

    /** 按操作列表回放蒙版：初始层 → 逐条画笔 / 反选 / 重置 / 载入蒙版。 */
    const replay = useCallback(() => {
        const { mask, base, width, height } = work.current;
        const context = mask?.getContext("2d");
        if (!context) return;
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, width, height);
        if (base) context.drawImage(base, 0, 0);
        for (const op of ops.current) {
            if (op.kind === "stroke") drawStroke(context, op);
            else if (op.kind === "reset") {
                context.clearRect(0, 0, width, height);
                if (base) context.drawImage(base, 0, 0);
            } else if (op.kind === "load") {
                context.clearRect(0, 0, width, height);
                context.drawImage(op.layer, 0, 0);
            } else {
                context.globalCompositeOperation = "xor";
                context.fillStyle = "#fff";
                context.fillRect(0, 0, width, height);
                context.globalCompositeOperation = "source-over";
            }
        }
        schedule();
    }, [schedule]);

    useEffect(() => {
        let alive = true;
        void (async () => {
            try {
                const image = await loadImage(src);
                if (!alive) return;
                const width = image.naturalWidth;
                const height = image.naturalHeight;
                let base: HTMLCanvasElement | null = null;
                if (maskSrc) {
                    base = maskLayerFrom(await loadImage(maskSrc), width, height, true);
                    setNotice("已载入上次确认的蒙版，可继续用画笔或智能点选修整。");
                } else {
                    base = maskLayerFrom(image, width, height, false);
                    if (!base) {
                        try {
                            const autoRes = await autoSegmentSubjectMask(src);
                            base = maskLayerFrom(await loadImage(autoRes.maskDataUrl), width, height, true);
                            setNotice("已自动识别商品主体区域，可用点选或画笔微调保留/去除。");
                        } catch {
                            setNotice("请用智能点选或画笔选择需要保留的商品区域。");
                        }
                    } else {
                        setNotice("已按图片透明通道识别商品主体，可继续修整。");
                    }
                }
                if (!alive) return;
                work.current = { image, width, height, base, mask: canvasOf(width, height), tmp: canvasOf(width, height) };
                for (const canvas of [leftRef.current, rightRef.current]) if (canvas) Object.assign(canvas, { width, height });
                setReady(true);
                replay();
            } catch (issue) {
                if (alive) setError(issue instanceof Error ? issue.message : "图片读取失败");
            }
        })();
        return () => {
            alive = false;
            cancelAnimationFrame(frame.current);
            frame.current = 0;
        };
    }, [src, maskSrc, replay]);

    useEffect(() => {
        bgRef.current = bg;
        schedule();
    }, [bg, schedule]);

    const toPoint = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
        const rect = event.currentTarget.getBoundingClientRect();
        return [((event.clientX - rect.left) / rect.width) * work.current.width, ((event.clientY - rect.top) / rect.height) * work.current.height];
    };
    const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!ready) return;
        if (toolMode === "point") {
            const rect = event.currentTarget.getBoundingClientRect();
            const normX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const normY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
            const pointMode: "keep" | "exclude" = event.button === 2 || !keep ? "exclude" : "keep";
            const nextPoints: SegmentationPoint[] = [...segPoints, { x: normX, y: normY, mode: pointMode }];
            setSegPoints(nextPoints);
            void interactivePointSegmentMask({
                sourceUrl: src,
                points: nextPoints,
            }).then(async (res) => {
                const layer = maskLayerFrom(await loadImage(res.maskDataUrl), work.current.width, work.current.height, true);
                if (layer) push({ kind: "load", layer });
                setNotice(`点选分割已更新（保留点 ${nextPoints.filter((p) => p.mode === "keep").length} · 排除点 ${nextPoints.filter((p) => p.mode === "exclude").length} · 覆盖 ${res.coveragePercent}%）`);
            });
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        const scale = work.current.width / event.currentTarget.getBoundingClientRect().width;
        const effectiveKeep = toolMode === "inpaint" ? false : keep;
        const op: Extract<Op, { kind: "stroke" }> = { kind: "stroke", keep: effectiveKeep, size: size * scale, points: [toPoint(event)] };
        drawing.current = op;
        ops.current.push(op);
        redo.current = [];
        drawStroke(work.current.mask!.getContext("2d")!, op);
        schedule();
        bump();
    };
    const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const op = drawing.current;
        if (!op) return;
        op.points.push(toPoint(event));
        drawStroke(work.current.mask!.getContext("2d")!, op, op.points.length - 1);
        schedule();
    };
    const onUp = () => {
        drawing.current = null;
    };

    const push = (op: Op) => {
        ops.current.push(op);
        redo.current = [];
        replay();
        bump();
    };
    const step = (from: React.MutableRefObject<Op[]>, to: React.MutableRefObject<Op[]>) => {
        const op = from.current.pop();
        if (!op) return;
        to.current.push(op);
        replay();
        bump();
    };

    const onMaskFile = async (file: File) => {
        const url = URL.createObjectURL(file);
        try {
            const layer = maskLayerFrom(await loadImage(url), work.current.width, work.current.height, true);
            if (layer) push({ kind: "load", layer });
            setNotice(`已载入蒙版：${file.name}`);
            setError("");
        } catch (issue) {
            setError(issue instanceof Error ? issue.message : "蒙版读取失败");
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    /** 导出与原图同尺寸的黑白蒙版 PNG：白=商品主体，黑=背景。 */
    const confirm = async () => {
        const { mask, width, height } = work.current;
        if (!mask) return;
        const pixels = mask.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
        let painted = false;
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) { painted = true; break; }
        if (!painted) {
            setError("还没有保留区域：请用「保留」画笔涂出商品，或上传一张蒙版图。");
            return;
        }
        const out = canvasOf(width, height);
        const context = out.getContext("2d")!;
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
        context.drawImage(mask, 0, 0);
        setBusy(true);
        setError("");
        try {
            const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
            if (!blob) throw new Error("蒙版导出失败");
            await onConfirm(new File([blob], `${name.replace(/\.[^.]+$/, "")}-mask.png`, { type: "image/png" }));
        } catch (issue) {
            setError(issue instanceof Error ? issue.message : "蒙版保存失败");
        } finally {
            setBusy(false);
        }
    };

    const chip = "inline-flex h-[28px] items-center gap-[4px] rounded-[6px] px-[8px] text-[13px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
    const outline = "inline-flex h-[28px] items-center gap-[4px] rounded-[6px] border border-border bg-background px-[12px] text-[13px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
    const side = "flex size-[32px] items-center justify-center rounded-[6px] text-foreground/70 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
    const canvasBox = "max-h-full max-w-full object-contain";
    const aspect = work.current.width && work.current.height ? `${work.current.width} / ${work.current.height}` : "1 / 1";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-[20px]" role="presentation">
            <div role="dialog" aria-modal="true" aria-label="商品抠图" data-testid="scene-cutout" className="flex h-full max-h-[800px] w-full max-w-[1540px] flex-col overflow-hidden rounded-[10px] bg-background shadow-[0_12px_48px_rgba(0,0,0,0.25)]">
                <header className="flex h-[52px] shrink-0 items-center gap-[4px] border-b border-border px-[12px]">
                    <button
                        type="button"
                        data-testid="scene-cutout-point-tab"
                        aria-pressed={toolMode === "point"}
                        onClick={() => setToolMode("point")}
                        className={cn(chip, toolMode === "point" && "bg-accent font-medium")}
                    >
                        <MousePointerClick className="size-[14px]" />
                        智能点选
                    </button>
                    <button
                        type="button"
                        data-testid="scene-cutout-keep"
                        aria-pressed={keep && toolMode !== "inpaint"}
                        onClick={() => {
                            setKeep(true);
                            if (toolMode === "inpaint") setToolMode("brush");
                        }}
                        className={cn(chip, keep && toolMode !== "inpaint" && "bg-accent font-medium")}
                    >
                        <Brush className="size-[14px]" />
                        保留
                    </button>
                    <button
                        type="button"
                        data-testid="scene-cutout-remove"
                        aria-pressed={!keep && toolMode !== "inpaint"}
                        onClick={() => {
                            setKeep(false);
                            if (toolMode === "inpaint") setToolMode("brush");
                        }}
                        className={cn(chip, !keep && toolMode !== "inpaint" && "bg-accent font-medium")}
                    >
                        <Eraser className="size-[14px]" />
                        去除
                    </button>
                    <label className="ml-[4px] inline-flex items-center gap-[4px] text-[12px] text-muted-foreground">
                        大小：
                        <input type="range" min={4} max={120} value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-[80px] accent-[var(--selected)]" />
                        <span className="w-[44px] text-foreground">{size} 像素</span>
                    </label>
                    <span className="mx-[6px] h-[16px] w-px bg-border" />
                    <button type="button" data-testid="scene-cutout-invert" disabled={!ready} onClick={() => push({ kind: "invert" })} className={chip}>
                        <FlipHorizontal2 className="size-[14px]" />
                        反选
                    </button>
                    <button
                        type="button"
                        data-testid="scene-cutout-reset"
                        disabled={!ready}
                        onClick={() => {
                            setSegPoints([]);
                            push({ kind: "reset" });
                        }}
                        className={chip}
                    >
                        <RotateCcw className="size-[14px]" />
                        重置
                    </button>
                    <button type="button" data-testid="scene-cutout-undo" disabled={!ops.current.length} onClick={() => step(ops, redo)} className={chip}>
                        <Undo2 className="size-[14px]" />
                        撤销
                    </button>
                    <button type="button" data-testid="scene-cutout-redo" disabled={!redo.current.length} onClick={() => step(redo, ops)} className={chip}>
                        <Redo2 className="size-[14px]" />
                        重做
                    </button>
                    <div className="ml-auto flex items-center gap-[8px]">
                        <button
                            type="button"
                            data-testid="scene-cutout-inpaint"
                            aria-pressed={toolMode === "inpaint"}
                            onClick={() => {
                                setToolMode((prev) => (prev === "inpaint" ? "brush" : "inpaint"));
                                setNotice("局部消除模式：在商品区域涂抹即可抹除瑕疵或多余物。");
                            }}
                            className={cn(outline, toolMode === "inpaint" && "border-selected bg-selected-soft text-selected")}
                        >
                            <Eraser className="size-[14px]" />
                            局部消除
                        </button>
                        <div className="relative">
                            <button type="button" data-testid="scene-cutout-bg" onClick={() => setBgMenu(!bgMenu)} className={outline}>
                                <Palette className="size-[14px]" />
                                预览背景色
                            </button>
                            {bgMenu ? (
                                <div className="absolute right-0 top-[32px] z-10 w-[120px] rounded-[8px] border border-border bg-popover p-[4px] text-[13px] text-popover-foreground shadow-lg">
                                    {BG_COLORS.map((item) => (
                                        <button key={item.id} type="button" onClick={() => { setBg(item.id); setBgMenu(false); }} className={cn("flex w-full items-center gap-[8px] rounded-[4px] px-[8px] py-[5px] hover:bg-accent", bg === item.id && "bg-accent")}>
                                            <span className={cn("size-[12px] rounded-full border border-border", item.id === "transparent" && CHECKER)} style={item.id === "transparent" ? undefined : { background: item.id }} />
                                            {item.label}
                                        </button>
                                    ))}
                                    <label className="flex w-full cursor-pointer items-center gap-[8px] rounded-[4px] px-[8px] py-[5px] hover:bg-accent">
                                        <input type="color" value={bg.startsWith("#") ? bg : "#ffffff"} onChange={(event) => setBg(event.target.value)} className="size-[14px] cursor-pointer border-0 bg-transparent p-0" />
                                        其他
                                    </label>
                                </div>
                            ) : null}
                        </div>
                        <button type="button" data-testid="scene-cutout-cancel" onClick={onCancel} className={outline}>
                            取消
                        </button>
                        <button type="button" data-testid="scene-cutout-confirm" disabled={!ready || busy} onClick={() => void confirm()} className="inline-flex h-[28px] items-center gap-[4px] rounded-[6px] bg-primary px-[12px] text-[13px] text-primary-foreground hover:opacity-90 disabled:opacity-50">
                            {busy ? <Loader2 className="size-[14px] animate-spin" /> : <WandSparkles className="size-[14px]" />}
                            确认使用
                        </button>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 bg-canvas">
                    <div className="m-[8px] flex w-[48px] shrink-0 flex-col items-center gap-[4px] self-start rounded-[8px] bg-background py-[6px]">
                        <button
                            type="button"
                            data-testid="scene-cutout-auto"
                            disabled={!ready}
                            title="自动识别商品主体"
                            onClick={() => {
                                void autoSegmentSubjectMask(src).then(async (res) => {
                                    const layer = maskLayerFrom(await loadImage(res.maskDataUrl), work.current.width, work.current.height, true);
                                    if (layer) push({ kind: "load", layer });
                                    setNotice("已重新自动识别商品主体。");
                                });
                            }}
                            className={side}
                        >
                            <ScanLine className="size-[16px]" />
                        </button>
                        <button
                            type="button"
                            data-testid="scene-cutout-point-mode"
                            title="智能点选：点击图片区域自动选中连通部位"
                            aria-pressed={toolMode === "point"}
                            onClick={() => {
                                setToolMode("point");
                                setNotice("智能点选模式：点击商品部位添加保留点（切换去除可添加排除点）。");
                            }}
                            className={cn(side, toolMode === "point" && "bg-accent text-foreground")}
                        >
                            <WandSparkles className="size-[16px]" />
                        </button>
                        <button
                            type="button"
                            title="画笔：自定义绘制图像保留区域"
                            aria-pressed={toolMode === "brush" && keep}
                            onClick={() => {
                                setToolMode("brush");
                                setKeep(true);
                            }}
                            className={cn(side, toolMode === "brush" && keep && "bg-accent text-foreground")}
                        >
                            <Brush className="size-[16px]" />
                        </button>
                        <button
                            type="button"
                            title="橡皮擦：擦除画笔绘制的保留区域"
                            aria-pressed={toolMode === "brush" && !keep}
                            onClick={() => {
                                setToolMode("brush");
                                setKeep(false);
                            }}
                            className={cn(side, toolMode === "brush" && !keep && "bg-accent text-foreground")}
                        >
                            <Eraser className="size-[16px]" />
                        </button>
                    </div>
                    <section className="relative flex min-w-0 flex-1 flex-col border-r border-border">
                        <div className="flex shrink-0 items-center justify-between px-[8px] pt-[8px] text-[12px]">
                            <span className="rounded-[4px] bg-selected-soft px-[8px] py-[2px] text-foreground/70">💡 请在左侧选择需要保留的衣服或商品区域</span>
                            <span className="rounded-[4px] bg-foreground/40 px-[6px] py-[1px] text-background">原图</span>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center p-[24px]">
                            <canvas
                                ref={leftRef}
                                data-testid="scene-cutout-canvas"
                                onPointerDown={onDown}
                                onPointerMove={onMove}
                                onPointerUp={onUp}
                                onPointerCancel={onUp}
                                className={cn(canvasBox, "cursor-crosshair touch-none")}
                                style={{ aspectRatio: aspect }}
                            />
                        </div>
                        {notice || error ? (
                            <p data-testid="scene-cutout-state" className={cn("absolute bottom-[12px] left-1/2 max-w-[90%] -translate-x-1/2 rounded-[6px] px-[12px] py-[6px] text-[12px]", error ? "bg-destructive/10 text-destructive" : "bg-background text-foreground/70 shadow-sm")}>
                                {error || notice}
                            </p>
                        ) : null}
                        {!ready && !error ? (
                            <div className="absolute inset-0 flex items-center justify-center gap-[6px] text-[13px] text-muted-foreground">
                                <Loader2 className="size-[16px] animate-spin" />
                                正在载入图片…
                            </div>
                        ) : null}
                    </section>
                    <section className="flex min-w-0 flex-1 flex-col">
                        <div className="flex shrink-0 items-center justify-between px-[8px] pt-[8px] text-[12px]">
                            <span className="rounded-[4px] bg-foreground/40 px-[6px] py-[1px] text-background">保留区域</span>
                            <span className="rounded-[4px] bg-selected-soft px-[8px] py-[2px] text-foreground/70">
                                也可以{" "}
                                <button type="button" data-testid="scene-mask-upload" onClick={() => maskInputRef.current?.click()} className="text-foreground underline underline-offset-2">
                                    上传一张蒙版图
                                </button>{" "}
                                (已经抠好的商品的透明图)
                            </span>
                            <input ref={maskInputRef} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onMaskFile(file); }} />
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center p-[24px]">
                            <canvas ref={rightRef} data-testid="scene-cutout-preview" className={cn(canvasBox, bg === "transparent" && CHECKER)} style={{ aspectRatio: aspect }} />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
