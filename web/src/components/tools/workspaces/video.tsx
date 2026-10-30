/**
 * TASK-042：「带货口播」SALE_VIDEO 工作区（layout = video）。
 *
 * 结构（对齐 docs/.../page-specs/35-sale-video.md，不是「上传 + 提示词 + 生成」空壳）：
 *  1. 商品多图上传（≤9 张 / 10MB / 384²–4096² / 宽高比 0.4–2.5，规则来自 registry）；
 *  2. 口播提示词（0/4000 计数）+「AI帮写」按国家/语言/张数拼口播草稿（本地模板，不冒充模型结果）；
 *  3. 目标国家/地区 → 联动口播语言；
 *  4. 视频模型（ModelPicker，真实 config.videoModel）+ 480P/720P；
 *  5. 视频时长（5/10/15 拖动档）+ 视频比例（自适应/9:16/16:9/1:1/4:3/3:4/21:9）；
 *  6. 结果区：真实 `ToolResult`（video 播放/下载/入库/送画布），配置一变旧结果标「来自旧版本」。
 *
 * 真实边界：不伪造生成成功；提交失败展示 adapter 真实错误；缺图/缺提示词/缺模型时按钮禁用并给出原因。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { useStoredToolTask } from "@/features/tools/use-stored-tool-task";
import { ToolCases } from "../tool-cases";
import {
    SALE_VIDEO_COUNTRIES,
    SALE_VIDEO_DURATIONS,
    SALE_VIDEO_LANGUAGES,
    SALE_VIDEO_MAX_SOURCES,
    SALE_VIDEO_PROMPT_MAX,
    SALE_VIDEO_RATIOS,
    SALE_VIDEO_RESOLUTIONS,
    SALE_VIDEO_SOURCE_RULE,
    SALE_VIDEO_TOOL_ID,
    applySaleVideoCountry,
    composeSaleVideoScriptDraft,
    createSaleVideoSnapshot,
    createSaleVideoState,
    getSaleVideoSpec,
    isSaleVideoSnapshotStale,
    parseSaleVideoDraftValues,
    saleVideoLanguageOptions,
    saleVideoOutputLabel,
    saleVideoPromptCounter,
    serializeSaleVideoDraftValues,
    type SaleVideoSnapshot,
    type SaleVideoState,
} from "@/features/tools/registry/sale-video";
import {
    buildSaleVideoBrowserInput,
    createSaleVideoRunPort,
    retrySaleVideoTask,
    runSaleVideoTask,
    saleVideoResultView,
    SaleVideoAdapterError,
    toSaleVideoReference,
    type SaleVideoImageEntry,
    type SaleVideoSourceCheck,
} from "@/features/tools/adapters/sale-video";
import {
    AI_VIDEO_EDITING_MAX_REFERENCES,
    AI_VIDEO_EDITING_PROMPT_MAX,
    AI_VIDEO_EDITING_REFERENCE_RULE,
    AI_VIDEO_EDITING_TOOL_ID,
    AI_VIDEO_EDITING_TYPES,
    AI_VIDEO_EDITING_VIDEO_RULE,
    aiVideoEditingClipLabel,
    aiVideoEditingOutputLabel,
    aiVideoEditingPromptCounter,
    applyAiVideoEditingClipDuration,
    applyAiVideoEditingClipStart,
    applyAiVideoEditingType,
    buildAiVideoEditingHiddenPrompt,
    composeAiVideoEditingPromptDraft,
    createAiVideoEditingSnapshot,
    createAiVideoEditingState,
    formatSeconds,
    getAiVideoEditingSpec,
    isAiVideoEditingSnapshotStale,
    normalizeAiVideoEditingState,
    parseAiVideoEditingDraftValues,
    resetAiVideoEditingClipForSource,
    resolveAiVideoEditingCapability,
    resolveAiVideoEditingClip,
    roundSeconds,
    serializeAiVideoEditingDraftValues,
    type AiVideoEditingSnapshot,
    type AiVideoEditingState,
    type AiVideoEditingType,
} from "@/features/tools/registry/ai-video-editing";
import {
    aiVideoEditingClipWindow,
    aiVideoEditingGatewayRequires,
    aiVideoEditingResultView,
    buildAiVideoEditingBrowserInput,
    collectAiVideoEditingAssetIssues,
    createAiVideoEditingRunPort,
    retryAiVideoEditingTask,
    runAiVideoEditingTask,
    toAiVideoEditingReference,
    AiVideoEditingAdapterError,
} from "@/features/tools/adapters/ai-video-editing";
import {
    VIDEO_CONCAT_CLIP_MAX_MS,
    VIDEO_CONCAT_CLIP_MIN_MS,
    VIDEO_CONCAT_DEFAULT_RATIO,
    VIDEO_CONCAT_DURATIONS,
    VIDEO_CONCAT_MAX_CLIPS,
    VIDEO_CONCAT_MIN_CLIPS,
    VIDEO_CONCAT_RATIOS,
    VIDEO_CONCAT_SOURCE_RULE,
    VIDEO_CONCAT_TOOL_ID,
    applyVideoConcatDraft,
    createVideoConcatSnapshot,
    createVideoConcatState,
    effectiveVideoConcatSeconds,
    formatVideoConcatDuration,
    getVideoConcatSpec,
    isVideoConcatCoverMime,
    isVideoConcatSnapshotStale,
    moveVideoConcatClip,
    normalizeVideoConcatClip,
    parseVideoConcatDraftValues,
    removeVideoConcatClip,
    resetVideoConcatTrim,
    serializeVideoConcatDraftValues,
    trimVideoConcatClip,
    validateVideoConcatState,
    videoConcatClipMs,
    type VideoConcatClip,
    type VideoConcatCover,
    type VideoConcatSnapshot,
    type VideoConcatState,
} from "@/features/tools/registry/video-concat";
import {
    assertVideoConcatInput,
    buildVideoConcatBrowserInput,
    buildVideoConcatFields,
    createVideoConcatRunPort,
    mapVideoConcatIssues,
    resolveVideoConcatProviderCapability,
    retryVideoConcatTask,
    runVideoConcatTask,
    videoConcatBlockedReason,
    videoConcatResultView,
    videoConcatSummary,
    VideoConcatAdapterError,
} from "@/features/tools/adapters/video-concat";
import { loadToolAssetRecords, readToolAssetBlob, type ToolAssetRecord } from "@/services/api/tools/assets";
import { resolveModelRequestConfig, resolveModelScript, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import type { ToolTask } from "@/services/api/tools/task-machine";
import type { ReferenceImage } from "@/types/image";
import { cn } from "@/lib/utils";

const SOURCE_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: [...SALE_VIDEO_SOURCE_RULE.mimeTypes],
    maxBytes: SALE_VIDEO_SOURCE_RULE.maxBytes,
    minBytes: 1,
    minWidth: SALE_VIDEO_SOURCE_RULE.minSide,
    minHeight: SALE_VIDEO_SOURCE_RULE.minSide,
    maxWidth: SALE_VIDEO_SOURCE_RULE.maxSide,
    maxHeight: SALE_VIDEO_SOURCE_RULE.maxSide,
    maxPixels: SALE_VIDEO_SOURCE_RULE.maxSide * SALE_VIDEO_SOURCE_RULE.maxSide,
};

import type { ComponentProps } from "react";

/** 优秀案例数据（复用上游 /image/make-case/list?type=… 真实抓取产物；为空时不渲染案例模块，避免占位空态）。 */
const SALE_VIDEO_CASES: ComponentProps<typeof ToolCases>["cases"] = [];


/** 优秀案例数据（复用上游 /image/make-case/list?type=… 真实抓取产物；为空时不渲染案例模块，避免占位空态）。 */
const AI_VIDEO_EDITING_CASES: ComponentProps<typeof ToolCases>["cases"] = [];
const VIDEO_REPLICATION_CASES: ComponentProps<typeof ToolCases>["cases"] = [];
const VIDEO_CONCAT_CASES: ComponentProps<typeof ToolCases>["cases"] = [];

function newOperationId(): string {
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return `sale-video-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("读取本地图片失败"));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(blob);
    });
}

/** 资产记录 → 真实参考图（从本地库存取回 Blob，不拿占位图冒充）。 */
async function loadSaleVideoReferences(records: readonly ToolAssetRecord[]): Promise<ReferenceImage[]> {
    const references: ReferenceImage[] = [];
    for (const record of records) {
        const blob = await readToolAssetBlob(record.storageKey);
        if (!blob) throw new SaleVideoAdapterError("reference-unavailable", `${record.name} 本地数据已失效，请重新上传`);
        const dataUrl = await blobToDataUrl(blob);
        references.push(
            toSaleVideoReference({
                id: record.id,
                name: record.name,
                dataUrl,
                type: record.mimeType,
                url: record.url,
                storageKey: record.storageKey,
            }),
        );
    }
    return references;
}

function sourceCheckLabel(check: SaleVideoSourceCheck): string {
    return check.ok ? "" : check.message;
}

export type SaleVideoWorkspaceProps = { className?: string };

export function SaleVideoWorkspace({ className }: SaleVideoWorkspaceProps = {}) {
    const spec = useMemo(() => getSaleVideoSpec(), []);
    const config = useConfigStore((state) => state.config);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);

    const [state, setState] = useState<SaleVideoState>(() => createSaleVideoState());
    const [model, setModel] = useState(() => config.videoModel || "");
    const [records, setRecords] = useState<ToolAssetRecord[]>([]);
    const [sourceIssues, setSourceIssues] = useState<string[]>([]);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [snapshot, setSnapshot] = useState<SaleVideoSnapshot | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [running, setRunning] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    const revisionRef = useRef<number | null>(null);
    const aliveRef = useRef(true);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    /* ---------- 草稿：先恢复再回写，避免覆盖用户上次配置 ---------- */
    useEffect(() => {
        let alive = true;
        hydrateDraft(SALE_VIDEO_TOOL_ID)
            .then((draft) => {
                if (!alive || !draft) return;
                const parsed = parseSaleVideoDraftValues(draft.values);
                revisionRef.current = draft.revision;
                setState((previous) => ({ ...previous, ...parsed.state }));
                if (draft.assetIds.length) setSourceIssues([]);
            })
            .finally(() => {
                if (alive) setDraftReady(true);
            });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(SALE_VIDEO_TOOL_ID, {
            values: serializeSaleVideoDraftValues(state),
            assetIds: records.map((record) => record.id),
        });
    }, [draftReady, patchDraft, records, state]);

    /* ---------- 联动 ---------- */
    const handleCountry = useCallback((country: string) => {
        setState((previous) => {
            const next = applySaleVideoCountry(previous, country);
            setNotice(next.languageChanged ? `已按 ${country} 切换口播语言` : "");
            return next.state;
        });
    }, []);

    const handleSourcesChange = useCallback((_ids: string[], nextRecords: ToolAssetRecord[]) => {
        setRecords(nextRecords);
        setSourceIssues([]);
    }, []);

    const handleWriteScript = useCallback(() => {
        setState((previous) => ({
            ...previous,
            prompt: composeSaleVideoScriptDraft({
                state: previous,
                sourceCount: records.length,
            }),
        }));
        setNotice("已按国家/语言/商品图生成口播草稿（本地模板，可自行修改）");
    }, [records]);

    const sources: SaleVideoImageEntry[] = useMemo(
        () =>
            records.map((record) => ({
                id: record.id,
                name: record.name,
                url: record.url,
                width: record.width,
                height: record.height,
            })),
        [records],
    );

    const currentSnapshot = useMemo(
        () =>
            createSaleVideoSnapshot({
                state,
                model,
                sourceAssetIds: sources.map((source) => source.id),
                sources,
                draftRevision: revisionRef.current,
                clientOperationId: "preview",
            }),
        [model, sources, state],
    );

    const stale = isSaleVideoSnapshotStale(snapshot, currentSnapshot);

    const submitBlockedReason = useMemo(() => {
        if (!model.trim()) return "请选择视频模型";
        if (!records.length) return "请上传至少 1 张商品图";
        if (!state.prompt.trim()) return "请填写口播提示词";
        if (state.prompt.length > SALE_VIDEO_PROMPT_MAX) return `提示词超过 ${SALE_VIDEO_PROMPT_MAX} 字`;
        return "";
    }, [model, records.length, state.prompt]);

    /* ---------- 提交 ---------- */
    const handleSubmit = useCallback(
        async (options?: { retry?: boolean }) => {
            if (running) return;
            setError("");
            setNotice("");
            setRunning(true);
            try {
                const references = options?.retry && lastReferencesRef.current.length
                    ? lastReferencesRef.current
                    : await loadSaleVideoReferences(records);
                lastReferencesRef.current = references;
                const browserInput = buildSaleVideoBrowserInput({
                    state,
                    model,
                    prompt: state.prompt,
                    sources,
                    references,
                });
                const port = await createSaleVideoRunPort();
                const submittedAt = createSaleVideoSnapshot({
                    state,
                    model,
                    sourceAssetIds: sources.map((source) => source.id),
                    sources,
                    draftRevision: revisionRef.current,
                    clientOperationId: newOperationId(),
                });
                setSnapshot(submittedAt);
                const next = options?.retry && task
                    ? await retrySaleVideoTask({ snapshot: submittedAt, browserInput, port })
                    : await runSaleVideoTask({ browserInput, port, draftRevision: revisionRef.current });
                if (!aliveRef.current) return;
                setTask(next);
            } catch (cause) {
                if (!aliveRef.current) return;
                const message = cause instanceof Error ? cause.message : String(cause);
                setError(message || "提交失败");
            } finally {
                if (aliveRef.current) setRunning(false);
            }
        },
        [model, records, running, sources, state, task],
    );

    const lastReferencesRef = useRef<ReferenceImage[]>([]);

    const view = saleVideoResultView({ task, snapshot, current: currentSnapshot });
    const languageOptions = useMemo(() => saleVideoLanguageOptions(state.saleCountry), [state.saleCountry]);
    const promptCounter = saleVideoPromptCounter(state.prompt);

    const sidebar = (
        <div className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">同类工具</p>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">
                商品图 {SALE_VIDEO_MAX_SOURCES} 张内，10MB 内，384²–4096²，png/jpeg/webp
            </p>
        </div>
    );

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "带货口播"}
            subtitle="上传商品图 · 写口播脚本 · 生成带货视频"
            sidebar={sidebar}
            badges={
                <>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        商品图 10M · 384²–4096²
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {saleVideoOutputLabel(state)}
                    </span>
                </>
            }
        >
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
                {/* 配置区 */}
                <div className="min-w-0 space-y-4" data-testid="sale-video-config">
                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">商品多图</h2>
                            <span className="text-[11px] text-muted-foreground">{`${records.length} / ${SALE_VIDEO_MAX_SOURCES} 张`}</span>
                        </div>
                        <ToolAssetInput
                            toolId={SALE_VIDEO_TOOL_ID}
                            title="上传商品图片"
                            constraints={SOURCE_CONSTRAINTS}
                            maxCount={SALE_VIDEO_MAX_SOURCES}
                            disabled={running}
                            onChange={handleSourcesChange}
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            支持上传 {SALE_VIDEO_MAX_SOURCES} 张图，10M 以内，384×384 ~ 4096×4096，宽高比（宽÷高）0.4～2.5（含边界）
                        </p>
                        {sourceIssues.length > 0 ? (
                            <ul className="space-y-1 text-[11px] text-destructive" role="alert">
                                {sourceIssues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                            </ul>
                        ) : null}
                        {sourceIssues.length === 0 && records.length > 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                                已选 {records.length} 张：{records.map((record) => record.name).join("、")}
                            </p>
                        ) : null}
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">提示词描述</h2>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
                                onClick={handleWriteScript}
                                disabled={running}
                                data-testid="sale-video-ai-write"
                            >
                                AI帮写
                            </button>
                        </div>
                        <textarea
                            className="min-h-[120px] w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={state.prompt}
                            maxLength={SALE_VIDEO_PROMPT_MAX}
                            placeholder="描述商品卖点、口播语气与镜头要求…"
                            onChange={(event) => setState((previous) => ({ ...previous, prompt: event.target.value }))}
                            disabled={running}
                            data-testid="sale-video-prompt"
                        />
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>AI帮写按国家/语言/商品生成口播草稿（本地模板，可改）</span>
                            <span data-testid="sale-video-counter">{promptCounter}</span>
                        </div>
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">目标市场</h2>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="space-y-1 text-[11px] text-muted-foreground">
                                国家/地区
                                <select
                                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={state.saleCountry}
                                    onChange={(event) => handleCountry(event.target.value)}
                                    disabled={running}
                                    data-testid="sale-video-country"
                                >
                                    {SALE_VIDEO_COUNTRIES.map((country) => (
                                        <option key={country.value} value={country.value}>
                                            {country.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-1 text-[11px] text-muted-foreground">
                                口播语言
                                <select
                                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={state.language}
                                    onChange={(event) => setState((previous) => ({ ...previous, language: event.target.value }))}
                                    disabled={running}
                                    data-testid="sale-video-language"
                                >
                                    {languageOptions.map((language) => (
                                        <option key={language.value} value={language.value}>
                                            {language.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className="text-[11px] text-muted-foreground">共 {SALE_VIDEO_LANGUAGES.length} 种可选语言，切换国家会自动带推荐语言</p>
                    </section>

                    <section className="space-y-3 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">生成设置</h2>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频模型</p>
                            <ModelPicker config={config} value={model} onChange={setModel} capability="video" fullWidth />
                            <p className="text-[11px] text-muted-foreground">适合日常稳妥出片</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频分辨率</p>
                            <div className="flex gap-2" role="radiogroup" aria-label="视频分辨率">
                                {SALE_VIDEO_RESOLUTIONS.map((resolution) => (
                                    <button
                                        key={resolution.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={state.resolution === resolution.value}
                                        className={cn(
                                            "h-9 flex-1 rounded-md border border-border text-sm",
                                            state.resolution === resolution.value ? "bg-accent font-medium" : "hover:bg-accent/60",
                                        )}
                                        onClick={() => setState((previous) => ({ ...previous, resolution: resolution.value }))}
                                        disabled={running}
                                    >
                                        {resolution.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频时长</p>
                            <div className="flex gap-2" role="radiogroup" aria-label="视频时长">
                                {SALE_VIDEO_DURATIONS.map((duration) => (
                                    <button
                                        key={duration}
                                        type="button"
                                        role="radio"
                                        aria-checked={state.videoTime === duration}
                                        className={cn(
                                            "h-9 flex-1 rounded-md border border-border text-sm",
                                            state.videoTime === duration ? "bg-accent font-medium" : "hover:bg-accent/60",
                                        )}
                                        onClick={() => setState((previous) => ({ ...previous, videoTime: duration }))}
                                        disabled={running}
                                    >
                                        {duration}秒
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频比例</p>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="视频比例">
                                {SALE_VIDEO_RATIOS.map((ratio) => (
                                    <button
                                        key={ratio.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={state.aspectRatio === ratio.value}
                                        className={cn(
                                            "h-8 rounded-md border border-border px-2 text-xs",
                                            state.aspectRatio === ratio.value ? "bg-accent font-medium" : "hover:bg-accent/60",
                                        )}
                                        onClick={() => setState((previous) => ({ ...previous, aspectRatio: ratio.value }))}
                                        disabled={running}
                                        title={ratio.note}
                                    >
                                        {ratio.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <div className="space-y-2">
                        <button
                            type="button"
                            className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
                            onClick={() => void handleSubmit()}
                            disabled={running || Boolean(submitBlockedReason)}
                            data-testid="sale-video-submit"
                        >
                            {running ? "生成中…" : "立即生成"}
                        </button>
                        {submitBlockedReason ? (
                            <p className="text-[11px] text-muted-foreground" data-testid="sale-video-blocked">
                                {submitBlockedReason}
                            </p>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">{saleVideoOutputLabel(state)}</p>
                        )}
                        {error ? (
                            <p className="text-[11px] text-destructive" role="alert" data-testid="sale-video-error">
                                {error}
                            </p>
                        ) : null}
                        {notice ? <p className="text-[11px] text-muted-foreground">{notice}</p> : null}
                    </div>
                </div>

                {/* 结果区 */}
                <div className="min-w-0 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium">生成结果</h2>
                        {stale ? (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-amber-600" data-testid="sale-video-stale">
                                来自旧版本配置
                            </span>
                        ) : null}
                    </div>
                    <ToolResult
                        task={task}
                        toolId={SALE_VIDEO_TOOL_ID}
                        title="带货口播视频"
                        now={Date.now()}
                        onRetry={() => void handleSubmit({ retry: true })}
                        className="min-h-[320px]"
                    />
                    {!task ? (
                        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="sale-video-empty">
                            {view.message}
                        </div>
                    ) : null}
                    {snapshot ? (
                        <details className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
                            <summary className="cursor-pointer text-xs font-medium text-foreground">本次输入快照</summary>
                            <dl className="mt-2 grid grid-cols-2 gap-1">
                                <dt>模型</dt>
                                <dd>{snapshot.model || "—"}</dd>
                                <dt>国家/语言</dt>
                                <dd>
                                    {snapshot.saleCountry} / {snapshot.language}
                                </dd>
                                <dt>分辨率</dt>
                                <dd>{snapshot.resolution}</dd>
                                <dt>时长/比例</dt>
                                <dd>
                                    {snapshot.videoTime}s / {snapshot.aspectRatio}
                                </dd>
                                <dt>商品图</dt>
                                <dd>{snapshot.sourceAssetIds.length} 张</dd>
                            </dl>
                        </details>
                    ) : null}
                    {SALE_VIDEO_CASES.length > 0 ? (
                        <section className="space-y-2 rounded-lg border border-border p-3" data-testid="sale-video-cases">
                                                        {/* SALE_VIDEO（type=73）：原站「优秀案例」数据源为上游 `/image/make-case/list?type=<bizType>`；本地已抓取到真实案例时用 SALE_VIDEO_CASES 渲染，未抓取到则整块不渲染，不输出任何空态文案。 */}
<h2 className="text-sm font-medium">优秀案例</h2>
                            <ToolCases cases={SALE_VIDEO_CASES} onApply={() => undefined} />
                        </section>
                    ) : null}
                    <section className="space-y-2 rounded-lg border border-border p-3" data-testid="sale-video-history">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">历史任务</h2>
                            <span className="text-[11px] text-muted-foreground">点击「查看结果」把历史任务放回上方结果区</span>
                        </div>
                        <ToolTaskHistory
                            toolId={SALE_VIDEO_TOOL_ID}
                            emptyHint="还没有带货口播视频任务：提交后这里会出现真实任务记录"
                            onSelectTask={(historyTask) => {
                                setTask(historyTask);
                                setNotice("已载入历史任务结果；国家/语言与商品图未改动，不会重新提交");
                            }}
                        />
                    </section>
                </div>
            </div>
        </ToolShell>
    );
}

export default SaleVideoWorkspace;

/* ================================================================== */
/* TASK-052：VIDEO_CONCAT「视频拼接」工作区（layout = video）            */
/* ================================================================== */

const CONCAT_CLIP_CONSTRAINTS = {
    kind: "video" as const,
    mimeTypes: [...VIDEO_CONCAT_SOURCE_RULE.mimeTypes],
    maxBytes: VIDEO_CONCAT_SOURCE_RULE.maxBytes,
    minDurationMs: VIDEO_CONCAT_CLIP_MIN_MS,
    maxDurationMs: VIDEO_CONCAT_CLIP_MAX_MS,
};

const CONCAT_COVER_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    minWidth: 128,
    minHeight: 128,
};

/** 用真实 video 元素读时长；读不到返回 0（由校验层阻断，绝不猜默认值）。 */
function probeVideoDurationMs(url: string): Promise<number> {
    return new Promise((resolve) => {
        const element = document.createElement("video");
        element.preload = "metadata";
        let settled = false;
        const finish = (value: number) => {
            if (settled) return;
            settled = true;
            element.removeAttribute("src");
            element.load();
            resolve(value);
        };
        const timer = window.setTimeout(() => finish(0), 8000);
        element.onloadedmetadata = () => {
            const ms = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : 0;
            window.clearTimeout(timer);
            finish(ms);
        };
        element.onerror = () => {
            window.clearTimeout(timer);
            finish(0);
        };
        element.src = url;
    });
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({ width: 0, height: 0 });
        image.src = url;
    });
}

type ConcatClip = VideoConcatClip;

export type VideoConcatWorkspaceProps = { className?: string };

export function VideoConcatWorkspace({ className }: VideoConcatWorkspaceProps = {}) {
    const spec = useMemo(() => getVideoConcatSpec(), []);
    const config = useConfigStore((state) => state.config);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);

    const [state, setState] = useState<VideoConcatState>(() => createVideoConcatState());
    const [model, setModel] = useState(() => config.videoModel || "");
    const [clipRecords, setClipRecords] = useState<ToolAssetRecord[]>([]);
    const [coverRecords, setCoverRecords] = useState<ToolAssetRecord[]>([]);
    const [activeClipId, setActiveClipId] = useState("");
    const [task, setTask] = useState<ToolTask | null>(null);
    const [snapshot, setSnapshot] = useState<VideoConcatSnapshot | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [running, setRunning] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    const [probing, setProbing] = useState(false);
    const revisionRef = useRef<number | null>(null);
    const aliveRef = useRef(true);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    /* ---------- 草稿：先恢复再回写 ---------- */
    useEffect(() => {
        let alive = true;
        hydrateDraft(VIDEO_CONCAT_TOOL_ID)
            .then((draft) => {
                if (!alive || !draft) return;
                const parsed = parseVideoConcatDraftValues(draft.values);
                revisionRef.current = draft.revision;
                setState((previous) => ({
                    ...previous,
                    editType: parsed?.editType ?? previous.editType,
                    videoRatio: parsed?.videoRatio ?? previous.videoRatio,
                    videoTime: parsed ? (parsed.videoTime ?? previous.videoTime) : previous.videoTime,
                }));
            })
            .finally(() => {
                if (alive) setDraftReady(true);
            });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(VIDEO_CONCAT_TOOL_ID, {
            values: serializeVideoConcatDraftValues(state),
            assetIds: clipRecords.map((record) => record.id),
        });
    }, [clipRecords, draftReady, patchDraft, state]);

    /* ---------- 片段：资产 → 片段（顺序以 ToolAssetInput 记录顺序为准） ---------- */
    const syncClips = useCallback(
        async (records: ToolAssetRecord[]) => {
            setProbing(true);
            try {
                const next: ConcatClip[] = [];
                for (const record of records) {
                    const durationMs = record.durationMs && record.durationMs > 0
                        ? record.durationMs
                        : await probeVideoDurationMs(record.url);
                    next.push(
                        normalizeVideoConcatClip({
                            id: record.id,
                            assetId: record.id,
                            name: record.name,
                            url: record.url,
                            storageKey: record.storageKey,
                            mimeType: record.mimeType,
                            bytes: record.bytes,
                            width: record.width,
                            height: record.height,
                            durationMs,
                        }),
                    );
                }
                setState((previous) => {
                    const kept = next.map((clip) => {
                        const old = previous.clips.find((item) => item.assetId === clip.assetId);
                        if (!old) return clip;
                        return trimVideoConcatClip(clip, { startMs: old.startMs, endMs: old.endMs });
                    });
                    return { ...previous, clips: kept };
                });
                setActiveClipId((current) => (next.some((clip) => clip.id === current) ? current : next[0]?.id ?? ""));
            } finally {
                if (aliveRef.current) setProbing(false);
            }
        },
        [],
    );

    const handleClipsChange = useCallback(
        (_ids: string[], records: ToolAssetRecord[]) => {
            setClipRecords(records);
            void syncClips(records);
        },
        [syncClips],
    );

    /* ---------- 封面 ---------- */
    const handleCoverChange = useCallback(
        async (_ids: string[], records: ToolAssetRecord[]) => {
            setCoverRecords(records);
            const record = records[0];
            if (!record) {
                setState((previous) => ({ ...previous, cover: null }));
                return;
            }
            if (!isVideoConcatCoverMime(record.mimeType)) {
                // 封面只能是位图：视频文件被塞进 images 会让上游拿到 data:video/mp4
                setError(`封面必须是图片（PNG / JPG / WebP），「${record.name}」是 ${record.mimeType || "未知格式"}，请换图或从片段抓帧`);
                setCoverRecords(records.filter((item) => item.id !== record.id));
                setState((previous) => ({ ...previous, cover: null }));
                return;
            }
            setError("");
            const size = record.width && record.height
                ? { width: record.width, height: record.height }
                : await readImageSize(record.url);
            setState((previous) => ({
                ...previous,
                cover: {
                    source: "upload",
                    url: record.url,
                    storageKey: record.storageKey,
                    name: record.name,
                    mimeType: record.mimeType,
                    width: size.width || undefined,
                    height: size.height || undefined,
                    bytes: record.bytes,
                },
            }));
        },
        [],
    );

    /** 从播放器当前帧抓封面：canvas 真实取帧，失败就报错，不生成空白图。 */
    const handleGrabFrame = useCallback(() => {
        const video = videoRef.current;
        const clip = state.clips.find((item) => item.id === activeClipId) ?? state.clips[0];
        if (!video || !clip) {
            setError("请先选择一段视频并在播放器里定位到要作为封面的画面");
            return;
        }
        try {
            const width = video.videoWidth || clip.width || 0;
            const height = video.videoHeight || clip.height || 0;
            if (!width || !height) throw new Error("播放器还没有解析出画面尺寸");
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("浏览器不支持 canvas 抓帧");
            context.drawImage(video, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
            const frameMs = Math.round(video.currentTime * 1000);
            const cover: VideoConcatCover = {
                source: "frame",
                url: dataUrl,
                dataUrl,
                name: `${clip.name} 封面`,
                mimeType: "image/jpeg",
                width,
                height,
                bytes: Math.round((dataUrl.length * 3) / 4),
                clipId: clip.id,
                frameMs,
            };
            setState((previous) => ({ ...previous, cover }));
            setCoverRecords([]);
            setNotice(`已从「${clip.name}」第 ${formatVideoConcatDuration(frameMs)} 抓取封面`);
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [activeClipId, state.clips]);

    /* ---------- 裁剪 ---------- */
    const handleTrim = useCallback((clipId: string, trim: { startMs?: number; endMs?: number }) => {
        setState((previous) => ({
            ...previous,
            clips: previous.clips.map((clip) => (clip.id === clipId ? trimVideoConcatClip(clip, trim) : clip)),
        }));
    }, []);

    const handleMove = useCallback((index: number, delta: number) => {
        setState((previous) => ({ ...previous, clips: moveVideoConcatClip(previous.clips, index, delta) }));
    }, []);

    const handleRemove = useCallback((index: number) => {
        setState((previous) => ({ ...previous, clips: removeVideoConcatClip(previous.clips, index) }));
        setClipRecords((previous) => previous.filter((_, position) => position !== index));
    }, []);

    const handleResetTrim = useCallback((clipId: string) => {
        setState((previous) => ({
            ...previous,
            clips: previous.clips.map((clip) => (clip.id === clipId ? resetVideoConcatTrim(clip) : clip)),
        }));
    }, []);

    /* ---------- 派生状态 ---------- */
    const issues = useMemo(() => validateVideoConcatState({ state, model }), [model, state]);
    const capability = useMemo(
        () =>
            resolveVideoConcatProviderCapability({
                model,
                apiFormat: resolveModelRequestConfig(config, model).apiFormat,
                hasPluginScript: Boolean(resolveModelScript(config, model)),
            }),
        [config, model],
    );
    const blockedReason = videoConcatBlockedReason({ issues, capability });

    const currentSnapshot = useMemo(
        () =>
            createVideoConcatSnapshot({
                state,
                model,
                draftRevision: revisionRef.current,
                clientOperationId: "preview",
            }),
        [model, state],
    );
    const stale = snapshot ? isVideoConcatSnapshotStale(snapshot, currentSnapshot) : false;
    const view = videoConcatResultView(task);
    const activeClip = state.clips.find((clip) => clip.id === activeClipId) ?? state.clips[0] ?? null;

    /* ---------- 提交 ---------- */
    const handleSubmit = useCallback(
        async (options?: { retry?: boolean }) => {
            if (running) return;
            setError("");
            setNotice("");
            setRunning(true);
            try {
                assertVideoConcatInput({ state, model, capability });
                const browserInput = buildVideoConcatBrowserInput({ state, model });
                setSnapshot(
                    createVideoConcatSnapshot({
                        state,
                        model,
                        draftRevision: revisionRef.current,
                        clientOperationId: `concat-${Date.now()}`,
                    }),
                );
                const port = await createVideoConcatRunPort();
                const next = options?.retry
                    ? await retryVideoConcatTask({ browserInput, port, draftRevision: revisionRef.current })
                    : await runVideoConcatTask({ browserInput, port, draftRevision: revisionRef.current });
                if (!aliveRef.current) return;
                setTask(next);
                const view = videoConcatResultView(next);
                // succeeded 但拿不到视频 = 没结果，必须报出来，不能只留一句「上游报告完成」。
                if (next.status === "failed" || next.status === "unknown" || (next.status === "succeeded" && !view.videoUrl)) {
                    setError(view.failure?.message ?? view.statusText ?? "任务未成功");
                }
            } catch (cause) {
                if (!aliveRef.current) return;
                const message = cause instanceof Error ? cause.message : String(cause);
                setError(message || "提交失败");
                if (cause instanceof VideoConcatAdapterError) setTask(null);
            } finally {
                if (aliveRef.current) setRunning(false);
            }
        },
        [capability, model, running, state],
    );

    const sidebar = (
        <div className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">拼接说明</p>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">
                片段 {VIDEO_CONCAT_MIN_CLIPS}–{VIDEO_CONCAT_MAX_CLIPS} 段，单段 ≤ {Math.round(VIDEO_CONCAT_SOURCE_RULE.maxBytes / 1024 / 1024)}MB，
                时长 0.5s–5min。顺序即拼接顺序，裁剪区间会写进提示词。
            </p>
        </div>
    );

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "视频拼接"}
            subtitle="按顺序拼接多段视频 · 逐段裁剪 · 抓帧做封面"
            sidebar={sidebar}
        >
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4" data-testid="video-concat-config">
                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">视频片段</h2>
                            <span className="text-[11px] text-muted-foreground">{`${state.clips.length} / ${VIDEO_CONCAT_MAX_CLIPS} 段`}</span>
                        </div>
                        <ToolAssetInput
                            toolId={VIDEO_CONCAT_TOOL_ID}
                            title="上传视频片段"
                            constraints={CONCAT_CLIP_CONSTRAINTS}
                            maxCount={VIDEO_CONCAT_MAX_CLIPS}
                            disabled={running}
                            onChange={handleClipsChange}
                        />
                        {probing ? <p className="text-[11px] text-muted-foreground">正在读取片段真实时长…</p> : null}
                        <p className="text-[11px] text-muted-foreground">
                            支持 MP4 / MOV / WebM，单段 ≤ {Math.round(VIDEO_CONCAT_SOURCE_RULE.maxBytes / 1024 / 1024)}MB；读不到时长会阻止提交，不用默认值猜测。
                        </p>
                        {state.clips.length > 0 ? (
                            <ol className="space-y-2" data-testid="video-concat-clips">
                                {state.clips.map((clip, index) => {
                                    const ms = videoConcatClipMs(clip);
                                    const unknown = clip.durationMs <= 0;
                                    return (
                                        <li
                                            key={clip.id}
                                            className={cn(
                                                "space-y-1 rounded-md border border-border p-2",
                                                activeClip?.id === clip.id ? "bg-accent/40" : "",
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="flex-1 truncate text-left text-xs"
                                                    onClick={() => setActiveClipId(clip.id)}
                                                    title={clip.name}
                                                >
                                                    {index + 1}. {clip.name}
                                                </button>
                                                <button type="button" className="rounded border border-border px-1 text-[11px]" onClick={() => handleMove(index, -1)} disabled={running || index === 0} aria-label="上移">
                                                    ↑
                                                </button>
                                                <button type="button" className="rounded border border-border px-1 text-[11px]" onClick={() => handleMove(index, 1)} disabled={running || index === state.clips.length - 1} aria-label="下移">
                                                    ↓
                                                </button>
                                                <button type="button" className="rounded border border-border px-1 text-[11px] text-destructive" onClick={() => handleRemove(index)} disabled={running} aria-label="删除">
                                                    ×
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                                <span>{unknown ? "时长未知" : `原始 ${formatVideoConcatDuration(clip.durationMs)}`}</span>
                                                <span>· 有效 {unknown ? "—" : formatVideoConcatDuration(ms)}</span>
                                                <button type="button" className="rounded border border-border px-1" onClick={() => handleResetTrim(clip.id)} disabled={running || unknown}>
                                                    还原
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 text-[11px]">
                                                <label className="flex items-center gap-1">
                                                    起
                                                    <input
                                                        type="number"
                                                        className="h-7 w-16 rounded border border-border bg-background px-1 text-[11px]"
                                                        step={0.1}
                                                        min={0}
                                                        max={Math.max(0, clip.durationMs / 1000)}
                                                        value={Number((clip.startMs / 1000).toFixed(1))}
                                                        disabled={running || unknown}
                                                        onChange={(event) => handleTrim(clip.id, { startMs: Math.round(Number(event.target.value) * 1000) })}
                                                    />
                                                </label>
                                                <label className="flex items-center gap-1">
                                                    止
                                                    <input
                                                        type="number"
                                                        className="h-7 w-16 rounded border border-border bg-background px-1 text-[11px]"
                                                        step={0.1}
                                                        min={0}
                                                        max={Math.max(0, clip.durationMs / 1000)}
                                                        value={Number((clip.endMs / 1000).toFixed(1))}
                                                        disabled={running || unknown}
                                                        onChange={(event) => handleTrim(clip.id, { endMs: Math.round(Number(event.target.value) * 1000) })}
                                                    />
                                                </label>
                                                <span>秒</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <p className="text-[11px] text-muted-foreground" data-testid="video-concat-no-clip">
                                还没有片段：至少上传 {VIDEO_CONCAT_MIN_CLIPS} 段视频才能拼接。
                            </p>
                        )}
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">视频封面</h2>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
                                onClick={handleGrabFrame}
                                disabled={running || !activeClip || activeClip.durationMs <= 0}
                                data-testid="video-concat-grab-cover"
                            >
                                从当前帧抓取
                            </button>
                        </div>
                        <ToolAssetInput
                            toolId={VIDEO_CONCAT_TOOL_ID}
                            title="上传封面图"
                            constraints={CONCAT_COVER_CONSTRAINTS}
                            maxCount={1}
                            disabled={running}
                            onChange={(ids, records) => void handleCoverChange(ids, records)}
                        />
                        {state.cover ? (
                            <div className="flex items-center gap-2">
                                <img src={state.cover.url} alt="封面预览" className="h-14 w-14 rounded border border-border object-cover" />
                                <div className="text-[11px] text-muted-foreground">
                                    <p data-testid="video-concat-cover-name">{state.cover.name}</p>
                                    <p>
                                        {state.cover.source === "frame" ? `抓帧 ${formatVideoConcatDuration(state.cover.frameMs ?? 0)}` : "上传封面"} ·{" "}
                                        {state.cover.width ?? "?"}×{state.cover.height ?? "?"}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-[11px] text-muted-foreground">封面必填：上传一张图，或用播放器把画面拖到目标位置后抓帧。</p>
                        )}
                    </section>
                </div>

                <div className="min-w-0 space-y-3">
                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">播放与裁剪预览</h2>
                            <span className="text-[11px] text-muted-foreground">
                                {activeClip ? `${activeClip.name} · ${formatVideoConcatDuration(videoConcatClipMs(activeClip))}` : "未选择片段"}
                            </span>
                        </div>
                        {activeClip ? (
                            <video
                                key={activeClip.id}
                                ref={videoRef}
                                src={activeClip.url}
                                className="max-h-[320px] w-full rounded-md border border-border bg-black"
                                controls
                                playsInline
                                onTimeUpdate={(event) => {
                                    const element = event.currentTarget;
                                    if (activeClip.durationMs <= 0) return;
                                    const currentMs = element.currentTime * 1000;
                                    if (currentMs < activeClip.startMs - 50) element.currentTime = activeClip.startMs / 1000;
                                    else if (currentMs > activeClip.endMs) element.pause();
                                }}
                                data-testid="video-concat-preview"
                            />
                        ) : (
                            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                                上传片段后可在这里预览并按裁剪区间播放
                            </div>
                        )}
                        {state.cover?.source === "frame" && state.cover.clipId ? (
                            <p className="text-[11px] text-muted-foreground">
                                封面来自「{state.clips.find((clip) => clip.id === state.cover?.clipId)?.name ?? "片段"}」第{" "}
                                {formatVideoConcatDuration(state.cover.frameMs ?? 0)} 帧；改动该片段顺序不影响封面内容。
                            </p>
                        ) : null}
                    </section>

                    <section className="space-y-3 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">生成设置</h2>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频模型</p>
                            <ModelPicker config={config} value={model} onChange={setModel} capability="video" className="w-full" fullWidth />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频比例</p>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="视频比例">
                                {VIDEO_CONCAT_RATIOS.map((ratio) => (
                                    <button
                                        key={ratio.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={state.videoRatio === ratio.value}
                                        className={cn(
                                            "h-8 rounded-md border border-border px-2 text-xs",
                                            state.videoRatio === ratio.value ? "bg-accent font-medium" : "hover:bg-accent/60",
                                        )}
                                        onClick={() => setState((previous) => ({ ...previous, videoRatio: ratio.value }))}
                                        disabled={running}
                                        title={ratio.note}
                                    >
                                        {ratio.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">默认 {VIDEO_CONCAT_DEFAULT_RATIO}；片段比例不一致时由模型按输出比例统一。</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">输出时长</p>
                            <div className="flex gap-2" role="radiogroup" aria-label="输出时长">
                                {VIDEO_CONCAT_DURATIONS.map((duration) => (
                                    <button
                                        key={String(duration)}
                                        type="button"
                                        role="radio"
                                        aria-checked={state.videoTime === duration}
                                        className={cn(
                                            "h-9 flex-1 rounded-md border border-border text-sm",
                                            state.videoTime === duration ? "bg-accent font-medium" : "hover:bg-accent/60",
                                        )}
                                        onClick={() => setState((previous) => ({ ...previous, videoTime: duration }))}
                                        disabled={running}
                                    >
                                        {duration === "auto" ? "自动" : `${duration}秒`}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                自动 = 片段有效时长之和 {effectiveVideoConcatSeconds({ videoTime: state.videoTime, clips: state.clips })}s
                            </p>
                        </div>
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">通道能力</h2>
                        <p className="text-[11px] text-muted-foreground" data-testid="video-concat-channel">
                            通道 {capability.channel} · 多段视频{" "}
                            {capability.evidence.multiReference === "supported"
                                ? "已验证发送"
                                : capability.evidence.multiReference === "unsupported"
                                    ? "不会发送（阻断）"
                                    : "无证据（阻断）"}
                        </p>
                        {capability.maxInputVideos !== null ? (
                            <p className="text-[11px] text-muted-foreground">该通道单次最多可真实上传 {capability.maxInputVideos} 段</p>
                        ) : null}
                        {capability.notes.map((note) => (
                            <p key={note} className="text-[11px] text-muted-foreground">
                                {note}
                            </p>
                        ))}
                        {capability.blockers.map((blocker) => (
                            <p key={blocker} className="text-[11px] text-destructive" role="alert">
                                {blocker}
                            </p>
                        ))}
                        {issues.length > 0 ? (
                            <ul className="space-y-1 text-[11px] text-destructive" role="alert" data-testid="video-concat-issues">
                                {mapVideoConcatIssues(issues).map((issue) => (
                                    <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </section>

                    <div className="space-y-2">
                        <button
                            type="button"
                            className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
                            onClick={() => void handleSubmit()}
                            disabled={running || Boolean(blockedReason)}
                            data-testid="video-concat-submit"
                        >
                            {running ? "拼接中…" : "开始拼接"}
                        </button>
                        {blockedReason ? (
                            <p className="text-[11px] text-muted-foreground" data-testid="video-concat-blocked">
                                {blockedReason}
                            </p>
                        ) : (
                            <p className="text-[11px] text-muted-foreground" data-testid="video-concat-summary">
                                {videoConcatSummary(state)}
                            </p>
                        )}
                        {error ? (
                            <p className="text-[11px] text-destructive" role="alert" data-testid="video-concat-error">
                                {error}
                            </p>
                        ) : null}
                        {notice ? <p className="text-[11px] text-muted-foreground">{notice}</p> : null}
                    </div>

                    <div className="min-w-0 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">拼接结果</h2>
                            {stale ? (
                                <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-amber-600" data-testid="video-concat-stale">
                                    来自旧版本配置
                                </span>
                            ) : null}
                        </div>
                        <ToolResult
                            task={task}
                            toolId={VIDEO_CONCAT_TOOL_ID}
                            title="拼接视频"
                            now={Date.now()}
                            onRetry={() => void handleSubmit({ retry: true })}
                            className="min-h-[320px]"
                        />
                        {!task ? (
                            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="video-concat-empty">
                                {view.statusText}
                            </div>
                        ) : null}
                        {snapshot ? (
                            <details className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
                                <summary className="cursor-pointer text-xs font-medium text-foreground">本次输入快照</summary>
                                <dl className="mt-2 grid grid-cols-2 gap-1">
                                    <dt>模型</dt>
                                    <dd>{snapshot.model || "—"}</dd>
                                    <dt>片段</dt>
                                    <dd>{snapshot.clips.length} 段</dd>
                                    <dt>比例/时长</dt>
                                    <dd>
                                        {snapshot.videoRatio} / {snapshot.videoTime}s
                                    </dd>
                                    <dt>封面</dt>
                                    <dd>{snapshot.coverSource === "frame" ? "抓帧" : "上传"}</dd>
                                    <dt>字段</dt>
                                    <dd>{Object.keys(buildVideoConcatFields({ state, model })).length} 个</dd>
                                </dl>
                            </details>
                        ) : null}
                        {VIDEO_CONCAT_CASES.length > 0 ? (
                            <section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-concat-cases">
                                                                {/* VIDEO_CONCAT（type=52）：原站「优秀案例」数据源为上游 `/image/make-case/list?type=<bizType>`；本地已抓取到真实案例时用 VIDEO_CONCAT_CASES 渲染，未抓取到则整块不渲染，不输出任何空态文案。 */}
<h2 className="text-sm font-medium">优秀案例</h2>
                                <ToolCases cases={VIDEO_CONCAT_CASES} onApply={() => undefined} />
                            </section>
                        ) : null}
                        <section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-concat-history">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-medium">历史任务</h2>
                                <span className="text-[11px] text-muted-foreground">点击「查看结果」把历史任务放回上方结果区</span>
                            </div>
                            <ToolTaskHistory
                                toolId={VIDEO_CONCAT_TOOL_ID}
                                emptyHint="还没有视频拼接任务：提交后这里会出现真实任务记录"
                                onSelectTask={(historyTask) => {
                                    setTask(historyTask);
                                    setNotice("已载入历史任务结果；片段与配置未改动，不会重新提交");
                                }}
                            />
                        </section>
                    </div>
                </div>
            </div>
        </ToolShell>
    );
}



/* ==========================================================================================
 * TASK-044：「视频编辑」AI_VIDEO_EDITING 工作区（layout = video）
 *
 * 结构（对齐 page-specs/37-ai-video-editing.md，不是「上传 + 提示词 + 生成」空壳）：
 *  1. 原视频上传（MP4/MOV、100M、≥4 秒）+ 截取区间（起点/时长，≤30 秒，与视频类型联动）；
 *  2. 参考图（原站标注选填，本地网关要求 ≥1 张；≤30 张 / 10MB / 384²–4096² / 宽高比 0.4–2.5）；
 *  3. 编辑需求描述（0/2500）+「提示词优化」（本地模板，不冒充模型结果，可撤销）；
 *  4. 视频模型（真实 config.videoModel）+ 视频类型「商品人物精准编辑」（选项来自模型目录事实）；
 *  5. 结果区：真实 `ToolResult`（video 播放/下载/入库/送画布），配置一变旧结果标「来自旧版本」。
 *
 * 真实边界：不伪造生成成功；提交失败展示 adapter 真实错误；缺视频/缺参考图/缺需求/缺模型时按钮禁用并给出原因。
 * 响应式：<1199px 结果区置顶（lg:order），<767px 单列（grid-cols-1 兜底）。
 * ========================================================================================== */

const AI_VIDEO_SOURCE_CONSTRAINTS = {
    kind: "video" as const,
    mimeTypes: [...AI_VIDEO_EDITING_VIDEO_RULE.mimeTypes],
    maxBytes: AI_VIDEO_EDITING_VIDEO_RULE.maxBytes,
    minBytes: 1,
    maxWidth: 4096,
    maxHeight: 4096,
    minDurationMs: AI_VIDEO_EDITING_VIDEO_RULE.minSourceMs,
};

const AI_VIDEO_REFERENCE_CONSTRAINTS = {
    kind: "image" as const,
    mimeTypes: [...AI_VIDEO_EDITING_REFERENCE_RULE.mimeTypes],
    maxBytes: AI_VIDEO_EDITING_REFERENCE_RULE.maxBytes,
    minBytes: 1,
    minWidth: AI_VIDEO_EDITING_REFERENCE_RULE.minSide,
    minHeight: AI_VIDEO_EDITING_REFERENCE_RULE.minSide,
    maxWidth: AI_VIDEO_EDITING_REFERENCE_RULE.maxSide,
    maxHeight: AI_VIDEO_EDITING_REFERENCE_RULE.maxSide,
    maxPixels: AI_VIDEO_EDITING_REFERENCE_RULE.maxSide * AI_VIDEO_EDITING_REFERENCE_RULE.maxSide,
};

function newAiVideoEditingOperationId(): string {
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    return `ai-video-editing-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** 资产记录 → 真实参考图（从本地库存取回 Blob，不拿占位图冒充）。 */
async function loadAiVideoEditingReferences(records: readonly ToolAssetRecord[]): Promise<ReferenceImage[]> {
    const references: ReferenceImage[] = [];
    for (const record of records) {
        const blob = await readToolAssetBlob(record.storageKey);
        if (!blob) throw new AiVideoEditingAdapterError("reference-unavailable", `${record.name} 本地数据已失效，请重新上传`);
        const dataUrl = await blobToDataUrl(blob);
        references.push(toAiVideoEditingReference({ record, dataUrl }));
    }
    return references;
}

export type AiVideoEditingWorkspaceProps = { className?: string };

export function AiVideoEditingWorkspace({ className }: AiVideoEditingWorkspaceProps = {}) {
    const spec = useMemo(() => getAiVideoEditingSpec(), []);
    const config = useConfigStore((state) => state.config);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);

    const [state, setState] = useState<AiVideoEditingState>(() => createAiVideoEditingState());
    const [model, setModel] = useState(() => config.videoModel || "");
    const [sourceRecords, setSourceRecords] = useState<ToolAssetRecord[]>([]);
    const [referenceRecords, setReferenceRecords] = useState<ToolAssetRecord[]>([]);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [snapshot, setSnapshot] = useState<AiVideoEditingSnapshot | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [running, setRunning] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    /** D3：本地 Blob 失效的具体原因（空串 = 素材可用），直接决定按钮是否可点。 */
    const [assetIssue, setAssetIssue] = useState("");
    /**
     * 结果回填：任务与结果字节都已落库（use-tool-task-store + media_files/storageKey），
     * 刷新/重进后按最近一条落盘任务还原结果区；否则「编辑成功 → 刷新 → 结果空白」，
     * 下载 / 存资产 / 发画布全部点不到。只在本会话还没有任务时回填，不覆盖新提交。
     */
    const storedTask = useStoredToolTask(AI_VIDEO_EDITING_TOOL_ID);
    useEffect(() => {
        if (!task && storedTask) setTask(storedTask);
    }, [storedTask, task]);
    const revisionRef = useRef<number | null>(null);
    const aliveRef = useRef(true);
    const lastReferencesRef = useRef<ReferenceImage[]>([]);
    const promptUndoRef = useRef<string | null>(null);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    /* ---------- 草稿：先恢复再回写，避免覆盖用户上次配置 ---------- */
    useEffect(() => {
        let alive = true;
        hydrateDraft(AI_VIDEO_EDITING_TOOL_ID)
            .then(async (draft) => {
                if (!alive || !draft) return;
                const parsed = parseAiVideoEditingDraftValues(draft.values);
                revisionRef.current = draft.revision;
                setState((previous) => ({ ...previous, ...parsed.state }));
                /* 旧草稿（分槽字段上线前）只有顶层 assetIds（源视频与参考图的并集）。
                 * 不迁移就会整块丢掉参考图：这里按 mimeType 归位——视频回源视频位，图片回参考图位。 */
                const legacyIds = (draft.assetIds ?? []).filter(
                    (id) => typeof id === "string" && id.length > 0 && id !== parsed.sourceAssetId,
                );
                const ids = [...new Set([parsed.sourceAssetId, ...parsed.referenceAssetIds, ...legacyIds].filter(Boolean))];
                if (!ids.length) return;
                const restored = await loadToolAssetRecords(ids);
                if (!alive) return;
                setSourceRecords(restored.records.filter((record) => record.id === parsed.sourceAssetId));
                const referenceIds = parsed.referenceAssetIds.length
                    ? parsed.referenceAssetIds
                    : legacyIds.filter((id) => {
                          const record = restored.records.find((item) => item.id === id);
                          return Boolean(record) && !String(record?.mimeType ?? "").startsWith("video/");
                      });
                setReferenceRecords(restored.records.filter((record) => referenceIds.includes(record.id)));
                if (restored.lostIds.length) setNotice(`${restored.lostIds.length} 个素材本地数据已失效，请重新上传`);
            })
            .catch(() => undefined)
            .finally(() => {
                if (alive) setDraftReady(true);
            });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(AI_VIDEO_EDITING_TOOL_ID, {
            values: serializeAiVideoEditingDraftValues(
                state,
                sourceRecords[0]?.id ?? "",
                referenceRecords.map((record) => record.id),
            ),
            assetIds: [...sourceRecords, ...referenceRecords].map((record) => record.id),
        });
    }, [draftReady, patchDraft, referenceRecords, sourceRecords, state]);

    /* ---------- 派生 ---------- */
    const source = sourceRecords[0] ?? null;
    const window = useMemo(() => aiVideoEditingClipWindow(state, source), [source, state]);
    const gatewayRequires = useMemo(() => aiVideoEditingGatewayRequires(), []);

    /* D3：素材记录还在、本地 Blob 却可能已经没了（素材库清理 / 别的标签页删除 / 浏览器回收）。
     * 提交前先核对真实字节；失效就禁用按钮并把原因写在按钮下方，不能等点了才只弹一句提示。 */
    useEffect(() => {
        let alive = true;
        const records = [...sourceRecords, ...referenceRecords];
        if (!records.length) {
            setAssetIssue("");
            return () => {
                alive = false;
            };
        }
        const check = () => {
            void collectAiVideoEditingAssetIssues(records, readToolAssetBlob).then((issues) => {
                if (alive) setAssetIssue(issues[0] ?? "");
            });
        };
        check();
        /* 切回页面/标签时再核一次：用户可能刚在别处删了素材。
         * 注意：本组件内 `window` 是截取窗对象，全局事件必须走 globalThis。 */
        globalThis.addEventListener("focus", check);
        document.addEventListener("visibilitychange", check);
        return () => {
            alive = false;
            globalThis.removeEventListener("focus", check);
            document.removeEventListener("visibilitychange", check);
        };
    }, [referenceRecords, sourceRecords]);

    const capability = useMemo(
        () =>
            resolveAiVideoEditingCapability({
                model,
                hasSourceVideo: Boolean(source),
                sourceIssues: assetIssue ? [assetIssue] : [],
                referenceCount: referenceRecords.length,
                gatewayRequiresReferences: gatewayRequires.references,
                prompt: state.prompt,
                clip: window,
            }),
        [assetIssue, gatewayRequires.references, model, referenceRecords.length, source, state.prompt, window],
    );

    const activeType: AiVideoEditingType = useMemo(
        () => AI_VIDEO_EDITING_TYPES.find((type) => type.id === state.videoType) ?? AI_VIDEO_EDITING_TYPES[0],
        [state.videoType],
    );

    const hiddenPrompt = useMemo(
        () =>
            buildAiVideoEditingHiddenPrompt({
                state,
                model,
                window,
                referenceCount: referenceRecords.length,
            }),
        [model, referenceRecords.length, state, window],
    );

    const currentSnapshot = useMemo(
        () =>
            createAiVideoEditingSnapshot({
                state,
                model,
                window,
                sourceAssetId: source?.id ?? "",
                referenceAssetIds: referenceRecords.map((record) => record.id),
                draftRevision: revisionRef.current,
                clientOperationId: "preview",
            }),
        [model, referenceRecords, source, state, window],
    );

    const stale = isAiVideoEditingSnapshotStale(snapshot, currentSnapshot);

    /* ---------- 联动 ---------- */
    const handleSourceChange = useCallback((_ids: string[], records: ToolAssetRecord[]) => {
        const nextSource = records[0] ?? null;
        setSourceRecords(nextSource ? [nextSource] : []);
        const durationMs = nextSource?.durationMs ?? 0;
        setState((previous) => resetAiVideoEditingClipForSource(previous, durationMs));
        setNotice(nextSource ? `已读取源视频时长 ${formatSeconds(durationMs)}，截取区间已按上限重置` : "");
    }, []);

    const handleReferenceChange = useCallback((_ids: string[], records: ToolAssetRecord[]) => {
        setReferenceRecords(records);
    }, []);

    const handleClipStart = useCallback(
        (startSec: number) => {
            setState((previous) =>
                applyAiVideoEditingClipStart({ state: previous, sourceDurationMs: window.sourceDurationMs, startSec }),
            );
        },
        [window.sourceDurationMs],
    );

    const handleClipDuration = useCallback(
        (durationSec: number) => {
            setState((previous) =>
                applyAiVideoEditingClipDuration({ state: previous, sourceDurationMs: window.sourceDurationMs, durationSec }),
            );
        },
        [window.sourceDurationMs],
    );

    const handleType = useCallback(
        (videoType: string) => {
            setState((previous) => applyAiVideoEditingType({ state: previous, sourceDurationMs: window.sourceDurationMs, videoType }));
        },
        [window.sourceDurationMs],
    );

    const handleOptimizePrompt = useCallback(() => {
        promptUndoRef.current = state.prompt;
        setState((previous) => ({
            ...previous,
            prompt: composeAiVideoEditingPromptDraft({
                state: previous,
                window,
                referenceCount: referenceRecords.length,
            }),
        }));
        setNotice("已用本地模板生成编辑需求草稿（模板优化，可撤销）");
    }, [referenceRecords.length, state.prompt, window]);

    const handleUndoPrompt = useCallback(() => {
        if (promptUndoRef.current === null) return;
        setState((previous) => ({ ...previous, prompt: promptUndoRef.current ?? "" }));
        promptUndoRef.current = null;
        setNotice("已撤销模板优化");
    }, []);

    /* ---------- 提交 ---------- */
    const handleSubmit = useCallback(
        async (options?: { retry?: boolean }) => {
            if (running) return;
            /* D3：素材本地字节已失效时不要进入提交流程，直接把原因落到错误区。 */
            if (assetIssue) {
                setError(assetIssue);
                return;
            }
            setError("");
            setNotice("");
            setRunning(true);
            try {
                const references =
                    options?.retry && lastReferencesRef.current.length
                        ? lastReferencesRef.current
                        : await loadAiVideoEditingReferences(referenceRecords);
                lastReferencesRef.current = references;
                const browserInput = buildAiVideoEditingBrowserInput({
                    state,
                    model,
                    source,
                    references: referenceRecords,
                    referenceImages: references,
                });
                const port = await createAiVideoEditingRunPort();
                const submittedAt = createAiVideoEditingSnapshot({
                    state,
                    model,
                    window,
                    sourceAssetId: source?.id ?? "",
                    referenceAssetIds: referenceRecords.map((record) => record.id),
                    draftRevision: revisionRef.current,
                    clientOperationId: newAiVideoEditingOperationId(),
                });
                setSnapshot(submittedAt);
                const next =
                    options?.retry && task
                        ? await retryAiVideoEditingTask({ snapshot: submittedAt, browserInput, port })
                        : await runAiVideoEditingTask({ browserInput, port, draftRevision: revisionRef.current });
                if (!aliveRef.current) return;
                setTask(next);
            } catch (cause) {
                if (!aliveRef.current) return;
                setError(cause instanceof Error && cause.message ? cause.message : "提交失败");
            } finally {
                if (aliveRef.current) setRunning(false);
            }
        },
        [assetIssue, model, referenceRecords, running, source, state, task, window],
    );

    const view = aiVideoEditingResultView({ task, snapshot, current: currentSnapshot });
    const promptCounter = aiVideoEditingPromptCounter(state.prompt);
    const maxClipSec = roundSeconds(window.maxClipMs / 1000);
    const maxStartSec = Math.max(0, roundSeconds((window.sourceDurationMs - window.durationMs) / 1000));

    const sidebar = (
        <div className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">同类工具</p>
            <p className="mt-3 px-2 text-[11px] leading-4 text-muted-foreground">
                源视频 MP4/MOV，100M 内，≥{Math.round(AI_VIDEO_EDITING_VIDEO_RULE.minSourceMs / 1000)} 秒；截取 ≤{maxClipSec} 秒
            </p>
            <p className="px-2 text-[11px] leading-4 text-muted-foreground">
                参考图 ≤{AI_VIDEO_EDITING_MAX_REFERENCES} 张，10M 内，384²–4096²，宽高比 0.4–2.5
            </p>
        </div>
    );

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "视频编辑"}
            subtitle="上传原视频与参考图，输入编辑需求，AI 智能编辑视频"
            sidebar={sidebar}
        >
            {/* 原站：左侧窄配置列（216–490px 内实测 274px）+ 右侧宽结果区（520–1910px） */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
                {/* 表单区 */}
                <div className="min-w-0 space-y-3">
                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">原视频</h2>
                            <span className="text-[11px] text-muted-foreground">
                                {source ? `${source.name} · ${window.sourceDurationMs > 0 ? formatSeconds(window.sourceDurationMs) : "时长未知"}` : "支持MP4/MOV格式，100M以内，时长不低于4秒"}
                            </span>
                        </div>
                        <ToolAssetInput
                            toolId={AI_VIDEO_EDITING_TOOL_ID}
                            /* 原视频与参考图是两个上传区：必须各自占草稿槽位，否则刷新后两块都按顶层
                             * assetIds（两槽并集）恢复，源视频位会冒出参考图、参考图位会冒出源视频。 */
                            draftSlot="source-video"
                            syncIds={sourceRecords.map((record) => record.id)}
                            title="上传需要编辑的视频"
                            constraints={AI_VIDEO_SOURCE_CONSTRAINTS}
                            maxCount={1}
                            disabled={running}
                            onChange={handleSourceChange}
                        />
                        {source ? (
                            <div className="space-y-2 rounded-md border border-dashed border-border p-2">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>截取区间</span>
                                <span data-testid="ai-video-editing-clip-label">{aiVideoEditingClipLabel(window)}</span>
                            </div>
                            <label className="block space-y-1 text-[11px] text-muted-foreground">
                                起点（秒）
                                <input
                                    type="range"
                                    min={0}
                                    max={Math.max(0, maxStartSec)}
                                    step={0.5}
                                    value={Math.min(state.clipStart, Math.max(0, maxStartSec))}
                                    onChange={(event) => handleClipStart(Number(event.target.value))}
                                    disabled={running || !source}
                                    className="w-full"
                                    data-testid="ai-video-editing-clip-start"
                                />
                            </label>
                            <label className="block space-y-1 text-[11px] text-muted-foreground">
                                时长（秒，≤{maxClipSec}）
                                <input
                                    type="range"
                                    min={1}
                                    max={Math.max(1, maxClipSec)}
                                    step={0.5}
                                    value={Math.min(state.clipDuration, Math.max(1, maxClipSec))}
                                    onChange={(event) => handleClipDuration(Number(event.target.value))}
                                    disabled={running || !source}
                                    className="w-full"
                                    data-testid="ai-video-editing-clip-duration"
                                />
                            </label>
                            {window.notice ? (
                                <p className="text-[11px] text-amber-600" data-testid="ai-video-editing-clip-notice">
                                    {window.notice}
                                </p>
                            ) : null}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>截取区间</span>
                                <span data-testid="ai-video-editing-clip-label">超长视频可截取30秒以内片段</span>
                            </div>
                        )}
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">
                                参考图 <span className="text-[11px] font-normal text-muted-foreground">（选填）</span>
                            </h2>
                            <span className="text-[11px] text-muted-foreground">{referenceRecords.length}/{AI_VIDEO_EDITING_MAX_REFERENCES}</span>
                        </div>
                        <ToolAssetInput
                            toolId={AI_VIDEO_EDITING_TOOL_ID}
                            draftSlot="reference-images"
                            syncIds={referenceRecords.map((record) => record.id)}
                            title="上传参考图"
                            constraints={AI_VIDEO_REFERENCE_CONSTRAINTS}
                            maxCount={AI_VIDEO_EDITING_MAX_REFERENCES}
                            disabled={running}
                            onChange={handleReferenceChange}
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            支持上传 {AI_VIDEO_EDITING_MAX_REFERENCES} 张图，10M 以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）
                        </p>
                        {gatewayRequires.references ? (
                            <details className="text-[11px] leading-4 text-muted-foreground" data-testid="ai-video-editing-reference-rule">
                                <summary className="cursor-pointer select-none">图片规则</summary>
                                <p className="mt-1">
                                    原站标注「选填」，但本地网关对本工具要求 ≥1 张参考图（requiresReferences），因此提交前必须至少 1 张。
                                </p>
                            </details>
                        ) : null}
                    </section>

                    <section className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">编辑需求描述</h2>
                            <span className="text-[11px] text-muted-foreground" data-testid="ai-video-editing-counter">
                                {promptCounter}
                            </span>
                        </div>
                        <textarea
                            className="min-h-[120px] w-full resize-y rounded-md border border-border bg-background p-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="描述要改什么：动作、场景、光线、风格……保留商品与人物的哪些特征"
                            value={state.prompt}
                            maxLength={AI_VIDEO_EDITING_PROMPT_MAX}
                            onChange={(event) => setState((previous) => ({ ...previous, prompt: event.target.value }))}
                            disabled={running}
                            data-testid="ai-video-editing-prompt"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                className="h-8 rounded-md border border-border px-2 text-xs hover:bg-accent/60"
                                onClick={handleOptimizePrompt}
                                disabled={running}
                                title="本地模板生成，不调用模型"
                                data-testid="ai-video-editing-optimize"
                            >
                                提示词优化
                            </button>
                            <button
                                type="button"
                                className="h-8 rounded-md border border-border px-2 text-xs hover:bg-accent/60 disabled:opacity-50"
                                onClick={handleUndoPrompt}
                                disabled={running || promptUndoRef.current === null}
                            >
                                撤销
                            </button>
                        </div>
                    </section>

                    <section className="space-y-3 rounded-lg border border-border p-3">
                        <h2 className="text-sm font-medium">生成设置</h2>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频模型</p>
                            <ModelPicker config={config} value={model} onChange={setModel} capability="video" fullWidth />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频类型</p>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="视频类型">
                                {AI_VIDEO_EDITING_TYPES.map((type) => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={state.videoType === type.id}
                                        className={cn(
                                            "h-8 rounded-md border border-border px-2 text-xs",
                                            state.videoType === type.id ? "bg-accent font-medium" : "hover:bg-accent/60",
                                        )}
                                        onClick={() => handleType(type.id)}
                                        disabled={running}
                                        title={type.note}
                                        data-testid="ai-video-editing-type"
                                    >
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{activeType.note}；最长可截 {roundSeconds(activeType.maxClipMs / 1000)} 秒</p>
                        </div>
                        <details className="rounded-md border border-dashed border-border p-2">
                            <summary className="cursor-pointer text-[11px] text-muted-foreground">查看模板段（只读，随请求发送）</summary>
                            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground" data-testid="ai-video-editing-hidden-prompt">
                                {hiddenPrompt}
                            </pre>
                        </details>
                    </section>

                    <div className="space-y-2">
                        <button
                            type="button"
                            className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
                            onClick={() => void handleSubmit()}
                            disabled={running || !capability.canSubmit}
                            data-testid="ai-video-editing-submit"
                        >
                            {running ? "编辑中…" : "立即生成"}
                        </button>
                        {assetIssue ? (
                            <p className="text-[11px] text-destructive" role="alert" data-testid="ai-video-editing-asset-issue">
                                {assetIssue}
                            </p>
                        ) : null}
                        {capability.canSubmit ? (
                            <p className="text-[11px] text-muted-foreground" data-testid="ai-video-editing-output">
                                {aiVideoEditingOutputLabel(window)}
                            </p>
                        ) : (
                            <ul className="space-y-0.5 text-[11px] text-muted-foreground" data-testid="ai-video-editing-blocked">
                                {capability.issues.map((issue) => (
                                    <li key={issue}>· {issue}</li>
                                ))}
                            </ul>
                        )}
                        {error ? (
                            <p className="text-[11px] text-destructive" role="alert" data-testid="ai-video-editing-error">
                                {error}
                            </p>
                        ) : null}
                        {notice ? <p className="text-[11px] text-muted-foreground">{notice}</p> : null}
                    </div>
                </div>

                {/* 结果区（<1199px 置顶） */}
                <div className="order-first min-w-0 space-y-3 lg:order-none">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium">编辑结果</h2>
                        {stale ? (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-amber-600" data-testid="ai-video-editing-stale">
                                来自旧版本配置
                            </span>
                        ) : null}
                    </div>
                    <ToolResult
                        task={task}
                        toolId={AI_VIDEO_EDITING_TOOL_ID}
                        title="视频编辑结果"
                        now={Date.now()}
                        onRetry={() => void handleSubmit({ retry: true })}
                        className="min-h-[320px]"
                    />
                    {!task ? (
                        <div
                            className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
                            data-testid="ai-video-editing-empty"
                        >
                            {view.message}
                        </div>
                    ) : null}
                    {AI_VIDEO_EDITING_CASES.length > 0 ? (
<section className="space-y-2 rounded-lg border border-border p-3" data-testid="ai-video-editing-cases">
                        <h2 className="text-sm font-medium">优秀案例</h2>
                        {/* AI_VIDEO_EDITING（type=95）：原站「优秀案例」数据源为上游 `/image/make-case/list?type=<bizType>`；本地已抓取到真实案例时渲染，未抓取到则整块不渲染，不输出任何空态文案。 */}

                        <ToolCases cases={AI_VIDEO_EDITING_CASES} onApply={() => undefined} />
                    </section>
                    ) : null}
                    <section className="space-y-2 rounded-lg border border-border p-3" data-testid="ai-video-editing-history">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">历史任务</h2>
                            <span className="text-[11px] text-muted-foreground">点击「查看结果」把历史任务放回上方结果区</span>
                        </div>
                        <ToolTaskHistory
                            toolId={AI_VIDEO_EDITING_TOOL_ID}
                            emptyHint="还没有视频编辑任务：提交后这里会出现真实任务记录"
                            onSelectTask={(historyTask) => {
                                setTask(historyTask);
                                setNotice("已载入历史任务结果；素材与编辑需求未改动，不会重新提交");
                            }}
                        />
                    </section>
                </div>
            </div>
        </ToolShell>
    );
}

import {
    VIDEO_REPLICATION_COUNTRIES,
    VIDEO_REPLICATION_DURATIONS,
    VIDEO_REPLICATION_LANGUAGES,
    VIDEO_REPLICATION_PROMPT_LIMIT,
    VIDEO_REPLICATION_RATIOS,
    VIDEO_REPLICATION_REFERENCE_LIMITS,
    VIDEO_REPLICATION_RESOLUTIONS,
    VIDEO_REPLICATION_TOOL_ID,
    VIDEO_REPLICATION_VIDEO_LIMITS,
    VIDEO_REPLICATION_VIDEO_TYPES,
    applyVideoReplicationCountry,
    composeVideoReplicationScriptDraft,
    createVideoReplicationValues,
    normalizeVideoReplicationClip,
    parseVideoReplicationDraftValues,
    resolveVideoReplicationCatalog,
    serializeVideoReplicationDraftValues,
    validateVideoReplicationState,
    videoReplicationClipReady,
    videoReplicationOutputLabel,
    videoReplicationPromptCounter,
    type VideoReplicationValues,
} from "@/features/tools/registry/video-replication";
import {
    VIDEO_REPLICATION_IMAGE_MIME_TYPES,
    VideoReplicationAdapterError,
    buildVideoReplicationBrowserInput,
    checkVideoReplicationReference,
    checkVideoReplicationVideo,
    createVideoReplicationRunPort,
    loadVideoReplicationReferences,
    parsePublicVideoLink,
    linkToVideoReplicationVideoRef,
    retryVideoReplicationTask,
    runVideoReplicationTask,
    toVideoReplicationVideoRef,
    videoReplicationFingerprint,
    videoReplicationMissingHints,
    videoReplicationResultView,
} from "@/features/tools/adapters/video-replication";

/* ============================ TASK-043 视频复刻工作区 ============================ */

export type VideoReplicationWorkspaceProps = { className?: string };

/**
 * 「视频复刻」workspace（layout = video-replication）。
 *
 * 信息架构对齐原站（page-specs/36-video-replication.md）：
 *  1. 参考视频：本地上传（MP4/MOV ≤100MB）或链接（解析能力未接入 → 明确禁用，不假装成功）；
 *  2. 片段时间轴：Auto / 手动 5–30s；
 *  3. 商品参考图：≤6 张，约束走 registry（10MB / 384²–4096² / 0.4–2.5）；
 *  4. 口播脚本：0–4000 字 +「AI 帮写」本地模板（明确标注未调用模型）；
 *  5. 生成参数：比例 / 分辨率 / 时长 / 国家→语言联动 / 视频类型；
 *  6. 提交 → ToolResult；用「提交时指纹」判断结果是否来自旧配置。
 */
export function VideoReplicationWorkspace({ className }: VideoReplicationWorkspaceProps = {}) {
    const config = useConfigStore((state) => state.config);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);

    const catalog = useMemo(() => resolveVideoReplicationCatalog(), []);
    const [values, setValues] = useState<VideoReplicationValues>(() => createVideoReplicationValues());
    const [model, setModel] = useState(() => config.videoModel || "");
    const [videoRecord, setVideoRecord] = useState<ToolAssetRecord | null>(null);
    const [refRecords, setRefRecords] = useState<ToolAssetRecord[]>([]);
    const [task, setTask] = useState<ToolTask | null>(null);
    const [submittedFingerprint, setSubmittedFingerprint] = useState<string | null>(null);
    /**
     * 结果回填：任务与结果字节都已落库，刷新/重进后按最近一条落盘任务还原结果区，
     * 否则「生成成功 → 刷新 → 结果空白」，下载 / 存资产 / 发画布全部点不到。
     */
    const storedTask = useStoredToolTask(VIDEO_REPLICATION_TOOL_ID);
    useEffect(() => {
        if (!task && storedTask) setTask(storedTask);
    }, [storedTask, task]);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [draftReady, setDraftReady] = useState(false);

    /* ---------- 草稿：只回填用户填过的参数，视频/图片走资产库 ---------- */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const draft = await hydrateDraft(VIDEO_REPLICATION_TOOL_ID);
            if (cancelled) return;
            if (draft) {
                const restored = parseVideoReplicationDraftValues(draft.values);
                setValues((previous) => ({ ...previous, ...restored }));
            }
            setDraftReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [hydrateDraft]);

    useEffect(() => {
        if (!draftReady) return;
        patchDraft(VIDEO_REPLICATION_TOOL_ID, { values: serializeVideoReplicationDraftValues(values) });
    }, [draftReady, patchDraft, values]);

    /* ---------- 派生：校验、缺口提示、字数、产物摘要 ---------- */
    const videoCheck = videoRecord ? checkVideoReplicationVideo(videoRecord) : null;
    const referenceIssues = useMemo(
        () => refRecords.map((record) => checkVideoReplicationReference(record)).filter((check) => !check.ok),
        [refRecords],
    );
    const clip = useMemo(
        () => normalizeVideoReplicationClip(values.clipStart, values.clipEnd, values.sourceVideoDuration),
        [values.clipEnd, values.clipStart, values.sourceVideoDuration],
    );
    const clipReady = videoReplicationClipReady(values);
    const counter = videoReplicationPromptCounter(values);
    /* 链接模式：公网直链本身就是可用源（上游 videos[] 直接吃 URL），不需要服务端解析。 */
    const linkParse = useMemo(() => parsePublicVideoLink(values.videoLink), [values.videoLink]);
    const videoReady = values.sourceMode === "link" ? linkParse.ok : Boolean(videoRecord) && Boolean(videoCheck?.ok);
    const sourceState = useMemo(
        () => ({
            videoReady,
            linkResolved: linkParse.ok,
            referenceCount: refRecords.length,
            referenceIssues: referenceIssues.map((issue) => (issue.ok ? "" : issue.message)),
        }),
        [linkParse.ok, referenceIssues, refRecords.length, videoReady],
    );
    const issues = useMemo(() => validateVideoReplicationState(values, sourceState, catalog), [catalog, sourceState, values]);
    const hints = useMemo(
        () => videoReplicationMissingHints({ values, videoReady, referenceCount: refRecords.length }),
        [refRecords.length, values, videoReady],
    );
    const blocking = issues.length > 0;
    const canSubmit = !running && !blocking && values.prompt.trim().length > 0 && model.trim().length > 0;
    const handleCancel = useCallback(() => {
        setTask((previous) => (previous && previous.status === "running" ? { ...previous, status: "cancelled" } : previous));
        setRunning(false);
    }, []);
    const outputLabel = videoReplicationOutputLabel(values, catalog);
    const result = videoReplicationResultView({ task, values, submittedFingerprint });

    /* ---------- 交互 ---------- */
    const update = useCallback(<K extends keyof VideoReplicationValues>(key: K, value: VideoReplicationValues[K]) => {
        setValues((previous) => ({ ...previous, [key]: value }));
    }, []);

    const handleCountry = useCallback(
        (countryId: string) => {
            const next = applyVideoReplicationCountry(values, countryId, catalog);
            setValues(next);
            setNotice(
                next.targetLanguage !== values.targetLanguage
                    ? `已按销售国家切换到${catalog.languages.find((item) => item.id === next.targetLanguage)?.label ?? next.targetLanguage}`
                    : "",
            );
        },
        [catalog, values],
    );

    const handleClipRange = useCallback((start: number, end: number) => {
        setValues((previous) => ({ ...previous, clipMode: "manual", clipStart: start, clipEnd: end }));
    }, []);

    const handleScriptDraft = useCallback(() => {
        const draft = composeVideoReplicationScriptDraft({ values, catalog });
        setValues((previous) => ({ ...previous, prompt: draft.slice(0, VIDEO_REPLICATION_PROMPT_LIMIT) }));
        setNotice("已按当前国家/语言/时长生成脚本草稿（本地模板，未调用模型）");
    }, [catalog, values]);

    /* ---------- 提交 / 重试 ---------- */
    const buildInput = useCallback(async () => {
        const isLink = values.sourceMode === "link";
        const link = isLink ? parsePublicVideoLink(values.videoLink) : null;
        if (isLink) {
            if (!link || !link.ok) {
                throw new VideoReplicationAdapterError(link?.ok === false ? link.code : "link-empty", link?.ok === false ? link.message : "请粘贴公网视频直链");
            }
        } else if (!videoRecord) {
            throw new VideoReplicationAdapterError("no-video", "请先上传参考视频");
        }
        const video = isLink && link?.ok
            ? {
                assetId: "",
                name: link.url.split("?")[0].split("/").pop() || "参考视频.mp4",
                url: link.url,
                mimeType: "video/mp4",
                bytes: undefined,
                durationMs: undefined,
            }
            : {
                assetId: videoRecord!.id,
                name: videoRecord!.name,
                url: videoRecord!.url,
                storageKey: videoRecord!.storageKey,
                mimeType: videoRecord!.mimeType,
                bytes: videoRecord!.bytes,
                durationMs: videoRecord!.durationMs,
            };
        const videoRef = isLink && link?.ok ? linkToVideoReplicationVideoRef(link.url) : toVideoReplicationVideoRef(videoRecord!);
        const references = refRecords.map((record) => ({
            id: record.id,
            name: record.name,
            url: record.url ?? "",
            width: record.width,
            height: record.height,
        }));
        const referenceImages = await loadVideoReplicationReferences(refRecords);
        return buildVideoReplicationBrowserInput({
            values,
            model: model.trim(),
            video,
            references,
            catalog,
            referenceImages,
            videoRef,
        });
    }, [catalog, model, refRecords, videoRecord, values]);

    const handleSubmit = useCallback(async () => {
        setError("");
        setNotice("");
        if (blocking) {
            setError(issues[0]?.message ?? "配置不完整，无法提交");
            return;
        }
        const fingerprint = videoReplicationFingerprint(values);
        setRunning(true);
        try {
            const browserInput = await buildInput();
            const port = await createVideoReplicationRunPort();
            const next = await runVideoReplicationTask({
                browserInput,
                port,
                onUpdate: (update) => setTask(update),
            });
            setTask(next ?? null);
            setSubmittedFingerprint(fingerprint);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "提交失败，请稍后再试");
        } finally {
            setRunning(false);
        }
    }, [blocking, buildInput, issues, values]);

    const handleRetry = useCallback(async () => {
        if (!task) return;
        setError("");
        setRunning(true);
        try {
            const browserInput = await buildInput();
            const port = await createVideoReplicationRunPort();
            const next = await retryVideoReplicationTask({
                browserInput,
                port,
                onUpdate: (update) => setTask(update),
            });
            setTask(next ?? null);
            setSubmittedFingerprint(videoReplicationFingerprint(values));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "重试失败，请稍后再试");
        } finally {
            setRunning(false);
        }
    }, [buildInput, task, values]);

    /* ---------- 资产回调 ---------- */
    const handleVideoChange = useCallback((_ids: string[], records: ToolAssetRecord[]) => {
        const record = records[0] ?? null;
        setVideoRecord(record);
        if (!record) {
            update("refVideoAssetId", "");
            update("refVideoName", "");
            return;
        }
        const check = checkVideoReplicationVideo(record);
        if (!check.ok) {
            setError(check.message);
            return;
        }
        setError("");
        setValues((previous) => {
            // 真实源视频时长（秒，一位小数）：留给片段校验/滑杆上限/提示词用；读不到时退回 0（表示未知）。
            const durationSeconds = record.durationMs && record.durationMs > 0 ? Math.round(record.durationMs / 10) / 100 : 0;
            const fallbackEnd = Math.min(
                VIDEO_REPLICATION_VIDEO_LIMITS.autoSeconds,
                Math.max(VIDEO_REPLICATION_VIDEO_LIMITS.clipMinSeconds, previous.clipEnd || VIDEO_REPLICATION_VIDEO_LIMITS.autoSeconds),
            );
            return {
                ...previous,
                sourceMode: "upload",
                refVideoAssetId: record.id,
                refVideoName: record.name,
                sourceVideoDuration: durationSeconds,
                clipStart: 0,
                clipEnd: durationSeconds > 0 ? Math.min(VIDEO_REPLICATION_VIDEO_LIMITS.autoSeconds, durationSeconds) : fallbackEnd,
            };
        });
    }, [update]);

    const handleReferenceChange = useCallback((ids: string[], records: ToolAssetRecord[]) => {
        setRefRecords(records);
        setValues((previous) => ({ ...previous, refImageAssetIds: ids }));
    }, []);

    const sourceMode = values.sourceMode;

    return (
        <ToolShell
            className={className}
            title="视频复刻"
            subtitle="上传参考视频与商品图，复刻原片镜头与节奏，生成可投放的带货视频。"
            sidebar={null}
            actions={
                <button
                    type="button"
                    className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    disabled={running || blocking}
                    onClick={() => void handleSubmit()}
                    data-testid="video-replication-submit-top"
                >
                    {running ? "生成中…" : "开始生成"}
                </button>
            }
        >
            <div className="grid gap-6 lg:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]" data-testid="video-replication-workspace">
                <div className="space-y-4">
                    <section className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">1. 参考视频</h2>
                            <div className="flex items-center gap-1 rounded border border-border p-0.5">
                                {(["upload", "link"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        className={`rounded px-2 py-1 text-[11px] ${sourceMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                                        onClick={() => update("sourceMode", mode)}
                                    >
                                        {mode === "upload" ? "本地上传" : "TikTok 链接"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">支持 MP4/MOV，100MB 以内；后续按片段复刻镜头结构。</p>

                        {sourceMode === "upload" ? (
                            <div className="mt-3">
                                <ToolAssetInput
                                    toolId={VIDEO_REPLICATION_TOOL_ID}
                                    draftSlot="source-video"
                                    maxCount={1}
                                    constraints={{
                                        kind: "video",
                                        mimeTypes: [...VIDEO_REPLICATION_VIDEO_LIMITS.mimeTypes],
                                        maxBytes: VIDEO_REPLICATION_VIDEO_LIMITS.maxBytes,
                                    }}
                                    onChange={handleVideoChange}
                                />
                                {videoCheck && !videoCheck.ok ? (
                                    <p className="mt-2 text-[11px] text-red-600">{videoCheck.message}</p>
                                ) : null}
                                {videoRecord && videoCheck?.ok ? (
                                    <p className="mt-2 text-[11px] text-emerald-600">已选：{videoRecord.name}</p>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mt-3 space-y-2">
                                <input
                                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                                    placeholder="粘贴公网视频直链（https://…/xxx.mp4）"
                                    value={values.videoLink}
                                    onChange={(event) => update("videoLink", event.target.value)}
                                />
                                {linkParse.ok ? (
                                    <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-700">
                                        已识别公网直链：{linkParse.url}
                                    </p>
                                ) : (
                                    <p className="rounded border border-border bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                                        {linkParse.message}
                                    </p>
                                )}
                                <p className="text-[11px] leading-4 text-muted-foreground">
                                    上游只接受公网可访问的视频地址；TikTok/抖音分享页需要服务端解析（未接入），请填视频文件直链。
                                </p>
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">2. 复刻片段</h2>
                            <span className="text-[11px] text-muted-foreground" data-testid="video-replication-clip">
                                {clip.start}–{clip.end}s（共 {clip.seconds}s）
                            </span>
                        </div>
                        <div className="mt-3 flex items-center gap-1 rounded border border-border p-0.5">
                            {(["auto", "manual"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    className={`rounded px-2 py-1 text-[11px] ${values.clipMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                                    onClick={() => update("clipMode", mode)}
                                >
                                    {mode === "auto" ? "Auto（自动）" : "手动截取"}
                                </button>
                            ))}
                        </div>
                        {values.clipMode === "manual" ? (
                            <div className="mt-3 space-y-2">
                                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    起点
                                    <input
                                        type="range"
                                        min={0}
                                        max={Math.max(0, (values.sourceVideoDuration || 60) - 5)}
                                        step={0.5}
                                        value={clip.start}
                                        className="flex-1"
                                        onChange={(event) => handleClipRange(Number(event.target.value), clip.end)}
                                    />
                                    <span className="w-10 text-right">{clip.start}s</span>
                                </label>
                                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    终点
                                    <input
                                        type="range"
                                        min={5}
                                        max={values.sourceVideoDuration || 60}
                                        step={0.5}
                                        value={clip.end}
                                        className="flex-1"
                                        onChange={(event) => handleClipRange(clip.start, Number(event.target.value))}
                                    />
                                    <span className="w-10 text-right">{clip.end}s</span>
                                </label>
                            </div>
                        ) : (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                                自动模式按 {VIDEO_REPLICATION_VIDEO_LIMITS.autoSeconds}s 取片（无可用片段时）。
                            </p>
                        )}
                        {!clipReady ? (
                            <p className="mt-2 text-[11px] text-amber-600">
                                片段需 5–30 秒，当前 {clip.seconds}s，不满足无法提交。
                            </p>
                        ) : null}
                    </section>

                    <section className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">3. 商品参考图</h2>
                            <span className="text-[11px] text-muted-foreground">
                                {refRecords.length}/{VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount} 张
                            </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            JPG/PNG/WEBP，单张 ≤10MB，边长 384–4096，宽高比 0.4–2.5。
                        </p>
                        <div className="mt-3">
                            <ToolAssetInput
                                toolId={VIDEO_REPLICATION_TOOL_ID}
                                draftSlot="reference-images"
                                maxCount={VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount}
                                constraints={{
                                    kind: "image",
                                    mimeTypes: [...VIDEO_REPLICATION_IMAGE_MIME_TYPES],
                                    maxBytes: VIDEO_REPLICATION_REFERENCE_LIMITS.maxBytes,
                                    minWidth: VIDEO_REPLICATION_REFERENCE_LIMITS.minSide,
                                    minHeight: VIDEO_REPLICATION_REFERENCE_LIMITS.minSide,
                                    maxWidth: VIDEO_REPLICATION_REFERENCE_LIMITS.maxSide,
                                    maxHeight: VIDEO_REPLICATION_REFERENCE_LIMITS.maxSide,
                                }}
                                onChange={handleReferenceChange}
                            />
                        </div>
                        {referenceIssues.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-[11px] text-red-600">
                                {referenceIssues.map((issue, index) => (
                                    <li key={index}>{issue.ok ? "" : issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </section>

                    <section className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">4. 口播脚本</h2>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
                                onClick={handleScriptDraft}
                                data-testid="video-replication-script-draft"
                            >
                                生成脚本草稿
                            </button>
                        </div>
                        <textarea
                            className="mt-2 h-32 w-full resize-y rounded border border-border bg-transparent p-2 text-xs leading-5 outline-none focus:border-primary"
                            placeholder="描述视频要卖什么、卖点、镜头节奏…（会连同国家/语言/时长一起写进提示词）"
                            maxLength={VIDEO_REPLICATION_PROMPT_LIMIT}
                            value={values.prompt}
                            onChange={(event) => update("prompt", event.target.value)}
                            data-testid="video-replication-script"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                            <span className={counter.over ? "text-red-600" : "text-muted-foreground"}>
                                {counter.length}/{counter.limit} 字
                            </span>
                            {values.promptOptimizer ? (
                                <span className="text-muted-foreground">已开启提示词优化</span>
                            ) : null}
                        </div>
                        <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={values.promptOptimizer}
                                onChange={(event) => update("promptOptimizer", event.target.checked)}
                            />
                            提交前由模型优化提示词
                        </label>
                    </section>
                </div>

                <div className="space-y-4">
                    <section className="rounded-lg border border-border bg-card p-4">
                        <h2 className="text-sm font-medium">5. 生成参数</h2>

                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频模型</p>
                            <input
                                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-primary"
                                placeholder="视频模型（默认 单卡 Seedance 2.0 fast）"
                                value={model}
                                onChange={(event) => setModel(event.target.value)}
                            />
                        </div>

                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">出片比例</p>
                            <div className="flex flex-wrap gap-1">
                                {VIDEO_REPLICATION_RATIOS.map((ratio) => (
                                    <button
                                        key={ratio}
                                        type="button"
                                        className={`rounded border px-2 py-1 text-[11px] ${values.ratio === ratio ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                                        onClick={() => update("ratio", ratio)}
                                    >
                                        {ratio}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">分辨率</p>
                            <div className="flex gap-1">
                                {VIDEO_REPLICATION_RESOLUTIONS.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`rounded border px-2 py-1 text-[11px] ${values.resolution === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                                        onClick={() => update("resolution", item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-4">
                        <h2 className="text-sm font-medium">6. 时长与市场</h2>

                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频时长</p>
                            <div className="flex gap-1">
                                {VIDEO_REPLICATION_DURATIONS.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`rounded border px-2 py-1 text-[11px] ${values.videoTime === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                                        onClick={() => update("videoTime", item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">目标国家</p>
                            <select
                                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-primary"
                                value={values.saleCountry}
                                onChange={(event) => handleCountry(event.target.value)}
                                data-testid="video-replication-country"
                            >
                                {VIDEO_REPLICATION_COUNTRIES.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">口播语言</p>
                            <select
                                className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-primary"
                                value={values.targetLanguage}
                                onChange={(event) => update("targetLanguage", event.target.value)}
                            >
                                {VIDEO_REPLICATION_LANGUAGES.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频类型</p>
                            <div className="flex flex-wrap gap-1">
                                {VIDEO_REPLICATION_VIDEO_TYPES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`rounded border px-2 py-1 text-[11px] ${values.videoType === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                                        onClick={() => update("videoType", item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-4">
                        <button
                            type="button"
                            className="w-full rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                            disabled={running || !canSubmit}
                            onClick={() => void handleSubmit()}
                            data-testid="video-replication-submit"
                        >
                            {running ? "生成中…" : `生成视频（${outputLabel}）`}
                        </button>
                        {hints.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
                                {hints.map((hint, index) => (
                                    <li key={index}>· {hint}</li>
                                ))}
                            </ul>
                        ) : null}
                        {error ? (
                            <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                                {error}
                            </p>
                        ) : null}
                        {notice ? (
                            <p className="mt-2 rounded border border-border bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                                {notice}
                            </p>
                        ) : null}
                        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                            消耗：按生成时长计费；同参数重复提交会复用未完成任务。
                        </p>
                    </section>
                </div>
            </div>

            {result.status !== "idle" || task ? (
                <div className="mt-4" data-testid="video-replication-result">
                    <ToolResult
                        task={task}
                        toolId={VIDEO_REPLICATION_TOOL_ID}
                        title="生成结果"
                        onCancel={handleCancel}
                        onRetry={handleRetry}
                    />
                </div>
            ) : null}

            {VIDEO_REPLICATION_CASES.length > 0 ? (
<section className="space-y-2 rounded-lg border border-border p-3" data-testid="video-replication-cases">
                <h2 className="text-sm font-medium">优秀案例</h2>
                {/* VIDEO_REPLICATION（type=89）：原站「优秀案例」数据源为上游 `/image/make-case/list?type=<bizType>`；本地已抓取到真实案例时渲染，未抓取到则整块不渲染，不输出任何空态文案。 */}

                <ToolCases cases={VIDEO_REPLICATION_CASES} onApply={() => undefined} />
            </section>
            ) : null}
            <section className="mt-4 space-y-2 rounded-lg border border-border p-3" data-testid="video-replication-history">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">历史任务</h2>
                    <span className="text-[11px] text-muted-foreground">点击「查看结果」把历史任务放回上方结果区</span>
                </div>
                <ToolTaskHistory
                    toolId={VIDEO_REPLICATION_TOOL_ID}
                    emptyHint="还没有视频复刻任务：提交后这里会出现真实任务记录"
                    onSelectTask={(historyTask) => {
                        setTask(historyTask);
                        setNotice("已载入历史任务结果；脚本与配置未改动，不会重新提交");
                    }}
                />
            </section>
        </ToolShell>
    );
}