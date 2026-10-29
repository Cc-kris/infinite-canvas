/**
 * TASK-025：「手持商品」HANDHELD_GOODS 工作区（layout = model）。
 *
 * 结构（对齐 page-spec 18-handheld-goods.md，不是「上传 + 提示词 + 结果」空壳）：
 *  1. 商品图上传（10MB / 384–4096 / png·jpeg·webp，来自 registry 的 SOURCE_RULE）；
 *  2. 手持部位页签（左手 / 右手 / 双手）+ 姿势库结构化卡片（每张卡 = registry 确定性生成的
 *     姿势示意图 SVG，切换页签只换姿势候选，**不动商品图**）；
 *  3. 场景页签 + 检测类型 + 张数 1–4（每张 = 一次真实上游请求，adapter 逐张发）；
 *  4. 结果区按张显示，失败张可单独重试；配置一变，旧结果立刻标「来自旧版本」。
 *
 * 真实边界：本组件不造数据 —— 缺商品图/缺姿势时提交禁用并给出原因；结果只来自
 * `runHandheldGoods` 返回的 `run.image`，上游没给图就是失败。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { listToolsByCategory } from "@/features/tools/registry";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import {
    buildHandheldGoodsSnapshot,
    createHandheldGoodsState,
    findHandheldGoodsPose,
    getHandheldGoodsSpec,
    HANDHELD_GOODS_CHECK_TYPES,
    HANDHELD_GOODS_HAND_TABS,
    HANDHELD_GOODS_OUTPUT_OPTIONS,
    HANDHELD_GOODS_SCENE_TABS,
    HANDHELD_GOODS_SOURCE_RULE,
    HANDHELD_GOODS_TOOL_ID,
    handheldGoodsHandTabLabel,
    handheldGoodsOutputLabel,
    handheldGoodsPoseLabel,
    handheldGoodsPoseReferenceUrl,
    handheldGoodsPoseSvg,
    isHandheldGoodsSnapshotStale,
    listHandheldGoodsPoses,
    parseHandheldGoodsDraftValues,
    serializeHandheldGoodsDraftValues,
    switchHandheldGoodsHandTab,
    switchHandheldGoodsSceneTab,
    validateHandheldGoodsInput,
    type HandheldGoodsSnapshot,
    type HandheldGoodsState,
} from "@/features/tools/registry/handheld-goods";
import {
    buildHandheldGoodsUnits,
    createHandheldGoodsRunPort,
    handheldGoodsOutputFields,
    handheldGoodsResultView,
    handheldGoodsStatusText,
    retryHandheldGoodsUnit,
    runHandheldGoods,
    toHandheldGoodsReference,
    type HandheldGoodsGatewayLike,
    type HandheldGoodsRun,
} from "@/features/tools/adapters/handheld-goods";
import type { ReferenceImage } from "@/types/image";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";

const SOURCE_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: [...HANDHELD_GOODS_SOURCE_RULE.mimeTypes],
    maxBytes: HANDHELD_GOODS_SOURCE_RULE.maxBytes,
    minBytes: 1,
    minWidth: HANDHELD_GOODS_SOURCE_RULE.minSide,
    minHeight: HANDHELD_GOODS_SOURCE_RULE.minSide,
    maxWidth: HANDHELD_GOODS_SOURCE_RULE.maxSide,
    maxHeight: HANDHELD_GOODS_SOURCE_RULE.maxSide,
    maxPixels: HANDHELD_GOODS_SOURCE_RULE.maxSide * HANDHELD_GOODS_SOURCE_RULE.maxSide,
};

export type HandheldGoodsWorkspaceProps = { className?: string };

export function HandheldGoodsWorkspace({ className }: HandheldGoodsWorkspaceProps = {}) {
    const spec = useMemo(() => getHandheldGoodsSpec(), []);

    const [state, setState] = useState<HandheldGoodsState>(() => createHandheldGoodsState());
    const [product, setProduct] = useState<ToolAssetRecord | null>(null);
    const [draftReady, setDraftReady] = useState(false);
    const [running, setRunning] = useState(false);
    const [runs, setRuns] = useState<HandheldGoodsRun[]>([]);
    const [snapshot, setSnapshot] = useState<HandheldGoodsSnapshot | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [retrying, setRetrying] = useState<number | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const portRef = useRef<HandheldGoodsGatewayLike | null>(null);
    const revisionRef = useRef<number | null>(null);
    /** 提交时把商品图落成真实 dataUrl 的参考图，重试沿用它，避免重试时再读一遍 Blob。 */
    const productRef = useRef<ReferenceImage | null>(null);

    const hydrateDraft = useToolDraftStore((store) => store.hydrate);
    const patchDraft = useToolDraftStore((store) => store.patch);

    /* ---------------- 草稿：恢复 → 回写 ---------------- */

    useEffect(() => {
        let alive = true;
        void (async () => {
            try {
                const draft = await hydrateDraft(HANDHELD_GOODS_TOOL_ID);
                if (!alive) return;
                const parsed = parseHandheldGoodsDraftValues(draft?.values);
                setState(createHandheldGoodsState(parsed.state));
                // 草稿只带 assetId/名称；商品图对象要由上传控件重新给出，这里记为「待重新挂载」。
                if (parsed.product.assetId) {
                    setNotice("已恢复上次配置；商品图需重新选择一次（文件不落草稿）");
                }
                revisionRef.current = typeof draft?.revision === "number" ? draft.revision : null;
            } catch {
                // 恢复失败不阻塞新建：用默认状态继续，下一次编辑会覆盖草稿。
                if (alive) setState(createHandheldGoodsState());
            } finally {
                if (alive) setDraftReady(true);
            }
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(HANDHELD_GOODS_TOOL_ID, {
            values: serializeHandheldGoodsDraftValues(state, {
                assetId: product?.id ?? null,
                name: product?.name ?? null,
            }),
        });
    }, [draftReady, patchDraft, product?.id, product?.name, state]);

    /* ---------------- 派生状态 ---------------- */

    const poses = useMemo(() => listHandheldGoodsPoses(state.modelTabType), [state.modelTabType]);
    const activePose = useMemo(() => findHandheldGoodsPose(state.modelId), [state.modelId]);

    const sourceMeta = useMemo(
        () =>
            product
                ? {
                      name: product.name,
                      mimeType: product.mimeType,
                      bytes: product.bytes,
                      width: product.width,
                      height: product.height,
                      url: product.url,
                  }
                : undefined,
        [product],
    );

    const issues = useMemo(
        () =>
            validateHandheldGoodsInput({
                productUrl: product?.url ?? "",
                state,
                source: sourceMeta,
            }),
        [product?.url, sourceMeta, state],
    );

    /** 当前配置的快照（未提交时用于判断结果是否已过期）。 */
    const candidateSnapshot = useMemo(() => {
        if (!product) return null;
        return buildHandheldGoodsSnapshot({
            productAssetId: product.id,
            productName: product.name,
            productWidth: product.width,
            productHeight: product.height,
            state,
            draftRevision: revisionRef.current,
            clientOperationId: "preview",
        });
    }, [product, state]);

    const stale = isHandheldGoodsSnapshotStale(snapshot, candidateSnapshot);
    const view = useMemo(
        () =>
            handheldGoodsResultView({
                runs,
                running,
                requested: runs.length || state.outputNum,
                sourceUrl: product?.url,
                stale,
            }),
        [product?.url, running, runs, stale, state.outputNum],
    );

    const lastTask = runs.length ? runs[runs.length - 1]?.task : undefined;

    /* ---------------- 提交 ---------------- */

    const submit = useCallback(async () => {
        if (!product) {
            setNotice("请先上传商品图");
            return;
        }
        if (!activePose) {
            setNotice("请选择一个手持姿势");
            return;
        }
        if (issues.length) {
            setNotice(issues[0].message);
            return;
        }

        setNotice(null);
        setRunning(true);
        const controller = new AbortController();
        abortRef.current = controller;

        const current = buildHandheldGoodsSnapshot({
            productAssetId: product.id,
            productName: product.name,
            productWidth: product.width,
            productHeight: product.height,
            state,
            draftRevision: revisionRef.current,
            clientOperationId: `handheld-${Date.now().toString(36)}`,
        });

        try {
            const { imageToDataUrl } = await import("@/services/image-storage");
            const productDataUrl = await imageToDataUrl({ storageKey: product.storageKey, url: product.url });
            if (!productDataUrl) throw new Error("商品图本地数据已不可用，请重新上传");
            const reference = toHandheldGoodsReference({
                id: product.id,
                name: product.name,
                type: product.mimeType,
                dataUrl: productDataUrl,
                url: product.url,
                storageKey: product.storageKey,
            });
            productRef.current = reference;
            const port = portRef.current ?? (await createHandheldGoodsRunPort());
            portRef.current = port;
            const units = buildHandheldGoodsUnits({ snapshot: current, product: reference });
            setSnapshot(current);
            setRuns([]);
            const done = await runHandheldGoods({
                units,
                port,
                signal: controller.signal,
                draftRevision: revisionRef.current,
                concurrency: 2,
                onUnitDone: (run) =>
                    setRuns((previous) => {
                        const next = [...previous];
                        next[run.index] = run;
                        return next.filter(Boolean);
                    }),
            });
            setRuns(done.filter(Boolean));
            const failed = handheldGoodsResultView({ runs: done, requested: units.length }).status;
            if (failed === "failed") setNotice("全部失败：上游没有返回可用图片");
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "提交失败");
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    }, [activePose, issues, product, state]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        setNotice("已取消：已发出的上游请求可能仍在计费");
    }, []);

    const retryOne = useCallback(
        async (run: HandheldGoodsRun) => {
            if (!snapshot || !product) return;
            const pose = findHandheldGoodsPose(snapshot.modelId);
            if (!pose) return;
            setRetrying(run.index);
            try {
                const port = portRef.current ?? (await createHandheldGoodsRunPort());
                portRef.current = port;
                let reference = productRef.current;
                if (!reference) {
                    const { imageToDataUrl } = await import("@/services/image-storage");
                    const dataUrl = await imageToDataUrl({ storageKey: product.storageKey, url: product.url });
                    if (!dataUrl) throw new Error("商品图本地数据已不可用，请重新上传");
                    reference = toHandheldGoodsReference({
                        id: product.id,
                        name: product.name,
                        type: product.mimeType,
                        dataUrl,
                        url: product.url,
                        storageKey: product.storageKey,
                    });
                    productRef.current = reference;
                }
                const units = buildHandheldGoodsUnits({ snapshot, product: reference });
                const unit = units[run.index];
                if (!unit) return;
                const next = await retryHandheldGoodsUnit({ unit, port, draftRevision: revisionRef.current });
                setRuns((previous) => previous.map((item) => (item.index === next.index ? next : item)));
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "重试失败");
            } finally {
                setRetrying(null);
            }
        },
        [product, snapshot],
    );

    const outputFields = useMemo(() => handheldGoodsOutputFields(runs), [runs]);
    const appliedFields = useMemo(() => Object.keys(outputFields).length, [outputFields]);

    /* ---------------- 渲染 ---------------- */

    const submitDisabled = running || issues.length > 0;

    const sidebar = (
        <div className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">同类工具</p>
            {listToolsByCategory("product-design")
                .filter((tool) => tool.id !== HANDHELD_GOODS_TOOL_ID)
                .slice(0, 8)
                .map((tool) => (
                    <Link
                        key={tool.id}
                        to={tool.route}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent"
                    >
                        <span>{tool.title}</span>
                        <ArrowRight aria-hidden="true" className="size-3.5 opacity-60" />
                    </Link>
                ))}
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">商品图 10MB 内，384²–4096²，png/jpeg/webp</p>
        </div>
    );

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "手持商品"}
            subtitle="快速生成手持商品图，快速上架"
            sidebar={sidebar}
            badges={
                <>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        商品图 10M · 384²–4096²
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        张数 {handheldGoodsOutputLabel(state.outputNum)}
                    </span>
                </>
            }
            notices={
                notice ? (
                    <div
                        role="status"
                        className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                    >
                        {notice}
                    </div>
                ) : null
            }
            actions={
                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitDisabled}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {running ? "生成中…" : "立即生成"}
                </button>
            }
        >
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                {/* 左栏：商品图 + 姿势库 */}
                <div className="flex min-w-0 flex-col gap-4">
                    <section className="rounded-lg border border-border bg-card p-3">
                        <ToolAssetInput
                            toolId={HANDHELD_GOODS_TOOL_ID}
                            constraints={SOURCE_CONSTRAINTS}
                            maxCount={1}
                            disabled={running}
                            variant="linkfox"
                            title="上传商品图"
                            hint="10M以内，384*384 ~ 4096*4096"
                            onChange={(assetIds, records) => {
                                const record = records[0] ?? null;
                                setProduct(record);
                                if (assetIds.length) setNotice(null);
                            }}
                        />
                    </section>

                    <section className="rounded-lg border border-border bg-card p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">手持姿势</h2>
                            {activePose ? (
                                <span className="text-[11px] text-muted-foreground">
                                    {handheldGoodsPoseLabel(activePose.id)}
                                </span>
                            ) : null}
                        </div>

                        <div role="tablist" aria-label="手持部位" className="mb-2 flex gap-1 rounded-md bg-muted p-1">
                            {HANDHELD_GOODS_HAND_TABS.map((tab) => {
                                const selected = tab.id === state.modelTabType;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={selected}
                                        disabled={running}
                                        onClick={() => {
                                            const next = switchHandheldGoodsHandTab(state, tab.id);
                                            setState(next.state);
                                            if (next.poseChanged) setNotice(`已切换到${handheldGoodsHandTabLabel(tab.id)}，姿势按该部位重新选择`);
                                        }}
                                        className={
                                            selected
                                                ? "flex-1 rounded bg-background px-2 py-1 text-xs font-medium shadow-sm"
                                                : "flex-1 rounded px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                                        }
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {poses.map((pose) => {
                                const selected = pose.id === state.modelId;
                                return (
                                    <button
                                        key={pose.id}
                                        type="button"
                                        aria-pressed={selected}
                                        disabled={running}
                                        onClick={() => setState((previous) => ({ ...previous, modelId: pose.id, modelTabType: pose.hand }))}
                                        className={
                                            selected
                                                ? "flex flex-col gap-1 rounded-lg border-2 border-primary bg-primary/5 p-1 text-left"
                                                : "flex flex-col gap-1 rounded-lg border border-border p-1 text-left transition hover:border-primary/40"
                                        }
                                    >
                                        <img
                                            src={handheldGoodsPoseReferenceUrl(pose)}
                                            alt={`${pose.label} 示意图`}
                                            width={96}
                                            height={96}
                                            className="h-20 w-full rounded bg-muted object-contain"
                                        />
                                        <span className="line-clamp-2 text-[11px] leading-tight">{pose.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                            姿势示意图由本地按部位/握法确定性绘制，仅用于指向上游“怎么握”，不是成品图。
                        </p>
                    </section>
                </div>

                {/* 右栏：配置 + 结果 */}
                <div className="flex min-w-0 flex-col gap-4">
                    <section className="rounded-lg border border-border bg-card p-3">
                        <h2 className="mb-2 text-sm font-medium">场景与张数</h2>

                        <div role="tablist" aria-label="场景类型" className="mb-3 flex gap-1 rounded-md bg-muted p-1">
                            {HANDHELD_GOODS_SCENE_TABS.map((tab) => {
                                const selected = tab.id === state.sceneTabType;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={selected}
                                        disabled={running}
                                        onClick={() => setState((previous) => switchHandheldGoodsSceneTab(previous, tab.id))}
                                        className={
                                            selected
                                                ? "flex-1 rounded bg-background px-2 py-1 text-xs font-medium shadow-sm"
                                                : "flex-1 rounded px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                                        }
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mb-3">
                            <span className="mb-1 block text-xs text-muted-foreground">检测类型</span>
                            <div className="flex flex-wrap gap-2">
                                {HANDHELD_GOODS_CHECK_TYPES.map((option) => {
                                    const selected = option.id === state.checkType;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            aria-pressed={selected}
                                            disabled={running}
                                            onClick={() => setState((previous) => ({ ...previous, checkType: option.id }))}
                                            className={
                                                selected
                                                    ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium"
                                                    : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                                            }
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <span className="mb-1 block text-xs text-muted-foreground">生成张数</span>
                            <div className="flex gap-2">
                                {HANDHELD_GOODS_OUTPUT_OPTIONS.map((num) => {
                                    const selected = num === state.outputNum;
                                    return (
                                        <button
                                            key={num}
                                            type="button"
                                            aria-pressed={selected}
                                            disabled={running}
                                            onClick={() => setState((previous) => ({ ...previous, outputNum: num }))}
                                            className={
                                                selected
                                                    ? "size-9 rounded-md border border-primary bg-primary text-sm font-medium text-primary-foreground"
                                                    : "size-9 rounded-md border border-border text-sm text-muted-foreground transition hover:text-foreground"
                                            }
                                        >
                                            {num}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                每张单独发一次真实请求（并发生效上限 2），失败张可单独重试。
                            </p>
                        </div>

                        {issues.length ? (
                            <ul className="mt-3 space-y-1 text-[11px] text-amber-700 dark:text-amber-300">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`}>· {issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </section>

                    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">生成结果</h2>
                            <span className="text-[11px] text-muted-foreground">{handheldGoodsStatusText(view)}</span>
                        </div>

                        {stale ? (
                            <p className="mb-2 rounded border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                                配置已修改，下面的结果来自旧版本（快照指纹不同）。
                            </p>
                        ) : null}

                        {appliedFields ? (
                            <p className="mb-2 text-[11px] text-muted-foreground">
                                已回填输出字段：imageResultUrl / targetResultUrl
                            </p>
                        ) : null}

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            {view.items.map((item) => (
                                <figure key={item.index} className="overflow-hidden rounded-lg border border-border">
                                    <div className="flex aspect-square items-center justify-center bg-muted">
                                        {item.url ? (
                                            <img src={item.url} alt={`第 ${item.index + 1} 张结果`} className="size-full object-contain" />
                                        ) : (
                                            <span className="px-2 text-center text-[11px] text-muted-foreground">
                                                {item.status === "failed"
                                                    ? item.error?.message ?? "该张失败"
                                                    : item.status === "cancelled"
                                                      ? "已取消"
                                                      : item.status === "unknown"
                                                        ? "状态未知"
                                                        : "生成中…"}
                                            </span>
                                        )}
                                    </div>
                                    <figcaption className="flex items-center justify-between gap-1 px-2 py-1 text-[11px] text-muted-foreground">
                                        <span>第 {item.index + 1} 张</span>
                                        {item.status === "failed" ? (
                                            <button
                                                type="button"
                                                disabled={running || retrying !== null}
                                                onClick={() => {
                                                    const run = runs.find((candidate) => candidate.index === item.index);
                                                    if (run) void retryOne(run);
                                                }}
                                                className="rounded border border-border px-1.5 py-0.5 transition hover:bg-accent disabled:opacity-50"
                                            >
                                                {retrying === item.index ? "重试中…" : "重试"}
                                            </button>
                                        ) : null}
                                    </figcaption>
                                </figure>
                            ))}
                        </div>

                        {view.status === "idle" ? (
                            <div className="mt-3 space-y-1">
                                <p className="text-sm text-muted-foreground">暂无生成结果图</p>
                                <p className="text-xs text-muted-foreground">快在左侧上传商品图并选择手持姿势吧~</p>
                            </div>
                        ) : null}

                        {running ? (
                            <button
                                type="button"
                                onClick={cancel}
                                className="mt-3 self-start rounded-md border border-border px-3 py-1 text-xs transition hover:bg-accent"
                            >
                                取消本次生成
                            </button>
                        ) : null}

                        {lastTask ? (
                            <div className="mt-4">
                                <ToolResult task={lastTask} toolId={HANDHELD_GOODS_TOOL_ID} title="最近一次上游返回" />
                            </div>
                        ) : null}
                    </section>
                </div>
            </div>
        </ToolShell>
    );
}

export default HandheldGoodsWorkspace;
