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
import { Link } from "react-router-dom";

import { ModelPicker } from "@/components/model-picker";
import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolShell } from "@/components/tools/tool-shell";
import { WatermarkGroupPanel } from "@/components/tools/watermark-group-panel";
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
import {
    modelOptionName,
    resolveModelRequestConfig,
    resolveModelScript,
    selectableModelsByCapability,
    useConfigStore,
    type AiConfig,
} from "@/stores/use-config-store";
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

/**
 * 「AI 视频」系列切换条（内容区内，原站同类工具横向入口）。
 * 只做同系列跳转，不参与侧栏 / 导航结构；当前工具高亮。
 */
const AI_VIDEO_FAMILY: ReadonlyArray<{ label: string; route: string }> = [
    { label: "图转视频", route: "/tools/ai-video/image-to-video" },
    { label: "带货口播", route: "/tools/ai-video/sale-video" },
    { label: "视频复刻", route: "/tools/ai-video/video-replication" },
    { label: "视频编辑", route: "/tools/ai-video/ai-video-editing" },
    { label: "视频翻译", route: "/tools/ai-video/video-translation" },
    { label: "视频剪辑", route: "/tools/ai-video/video-concat" },
];

export function AiVideoFamilyNav({ active, showDriver = true }: { active: string; showDriver?: boolean }) {
    return (
        <nav className="flex flex-wrap items-center gap-1" data-testid="ai-video-family-nav" aria-label="AI 视频系列">
            {AI_VIDEO_FAMILY.map((item) => (
                <Link
                    key={item.route}
                    to={item.route}
                    className={cn(
                        "rounded-md border px-2 py-[3px] text-[11px] leading-4 transition-colors",
                        item.label === active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                    )}
                >
                    {item.label}
                </Link>
            ))}
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-[3px] text-[11px] leading-4 text-muted-foreground">
                <span>批量生成</span>
                <span className="rounded bg-primary/15 px-1 text-[10px] font-medium leading-4 text-primary">NEW</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                <span className="rounded-md border border-border px-2 py-[3px]" title="可用算力">
                    250
                </span>
                {showDriver ? <span data-testid="ai-video-driver-status">ljq_driver: 已连接</span> : null}
            </span>
        </nav>
    );
}

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

/** 原站 SALE_VIDEO「视频模型」唯一档位（A 列表 24/25 条原文）。 */
const SALE_VIDEO_MODEL_TIERS: readonly ModelTier[] = [
    { label: "Seedance 2.0 fast", hint: "适合日常稳妥出片", match: /seedance/i },
];

/* ================================================================== */
/* 原站公共块：模型档位卡 + 水印分组卡（SALE_VIDEO/VIDEO_CONCAT 等共用）  */
/* ================================================================== */

/**
 * 原站「视频模型」档位卡（A 列表原文 label + hint）。
 * 只在本地通道真的提供对应模型时可点；匹配不到就置灰，并用 title 如实标注原因，不伪造可选状态。
 */
export type ModelTier = { label: string; hint: string; match: RegExp };

function ModelTierList({
    tiers,
    config,
    value,
    onChange,
    disabled,
}: {
    tiers: readonly ModelTier[];
    config: AiConfig;
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
}) {
    const options = useMemo(() => selectableModelsByCapability(config, "video"), [config]);
    return (
        <div className="space-y-2">
            {tiers.map((tier) => {
                const target = options.find((option) => tier.match.test(modelOptionName(option)));
                const active = Boolean(target && target === value);
                return (
                    <button
                        key={tier.label}
                        type="button"
                        disabled={disabled || !target}
                        title={target ? undefined : "当前通道未提供该模型"}
                        onClick={() => target && onChange(target)}
                        className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                            active ? "border-primary bg-primary/5" : "border-border",
                            !target && "cursor-not-allowed opacity-50",
                        )}
                    >
                        <span className="block text-xs font-medium text-foreground">{tier.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{tier.hint}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** 原站结果区底部「管理水印分组」卡片（共 1/20 个 / 默认 / ＋ 新增水印分组）。 */

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
        <ToolShell className={className} title={spec?.title ?? "带货口播"} sidebar={sidebar}>
            <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(280px,300px)_minmax(300px,340px)_minmax(0,1fr)]">
                {/* 配置区（原站左列约 298px） */}
                <div className="min-w-0 space-y-4" data-testid="sale-video-config">
                    <AiVideoFamilyNav active="带货口播" />
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-medium">多视角白底商品&amp;实拍图</h2>
                        <button
                            type="button"
                            className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                            onClick={() => setNotice("图片规则：支持上传9张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）")}
                        >
                            图片规则
                        </button>
                    </div>

                    <section className="space-y-2">
                        <h3 className="text-xs font-medium">上传商品图片</h3>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            支持上传9张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）
                        </p>
                        <ToolAssetInput
                            toolId={SALE_VIDEO_TOOL_ID}
                            constraints={SOURCE_CONSTRAINTS}
                            maxCount={SALE_VIDEO_MAX_SOURCES}
                            disabled={running}
                            onChange={handleSourcesChange}
                            variant="linkfox"
                            uploadLabel="本地上传"
                            wide
                            actions={
                                <>
                                    <button type="button" className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground" disabled>
                                        作品选择
                                    </button>
                                    <button type="button" className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground" disabled>
                                        商品库选择
                                    </button>
                                </>
                            }
                        />
                        {sourceIssues.length ? (
                            <ul className="space-y-1 text-[11px] text-destructive" data-testid="sale-video-source-issues">
                                {sourceIssues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                            </ul>
                        ) : null}
                    </section>
                </div>

                {/* 参数区：原站同一左列的下半段，本地拆到第二列以保证首屏完整可见 */}
                <div className="min-w-0 space-y-3" data-testid="sale-video-params">
                    <section className="space-y-2">
                        <h3 className="text-xs font-medium">提示词描述</h3>
                        <div className="flex gap-2">
                            <div className="relative h-8 min-w-0 flex-1">
                                <span className="flex h-8 items-center rounded-md border border-border bg-card px-2 text-xs">
                                    {SALE_VIDEO_COUNTRIES.find((country) => country.value === state.saleCountry)?.label ?? state.saleCountry}
                                </span>
                                <select
                                    aria-label="目标国家/地区"
                                    className="absolute inset-0 h-8 w-full cursor-pointer opacity-0"
                                    value={state.saleCountry}
                                    onChange={(event) => handleCountry(event.target.value)}
                                >
                                    {SALE_VIDEO_COUNTRIES.map((country) => (
                                        <option key={country.value} value={country.value}>
                                            {country.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="relative h-8 min-w-0 flex-1">
                                <span className="flex h-8 items-center rounded-md border border-border bg-card px-2 text-xs">
                                    {(languageOptions.find((language) => language.value === state.language)?.label ?? state.language).split("（")[0]}
                                </span>
                                <select
                                    aria-label="口播语言"
                                    className="absolute inset-0 h-8 w-full cursor-pointer opacity-0"
                                    value={state.language}
                                    onChange={(event) => setState((previous) => ({ ...previous, language: event.target.value }))}
                                >
                                {languageOptions.map((language) => (
                                    <option key={language.value} value={language.value}>
                                        {language.label}
                                    </option>
                                ))}
                                </select>
                            </div>
                        </div>
                        <textarea
                            className="min-h-[96px] w-full resize-y rounded-lg border border-border bg-card p-3 text-xs leading-5 outline-none focus-visible:border-primary"
                            placeholder="描述商品卖点、口播节奏与画面重点"
                            maxLength={SALE_VIDEO_PROMPT_MAX}
                            value={state.prompt}
                            onChange={(event) => setState((previous) => ({ ...previous, prompt: event.target.value }))}
                            data-testid="sale-video-prompt"
                        />
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground"
                                onClick={handleWriteScript}
                                disabled={running}
                                data-testid="sale-video-ai-script"
                            >
                                AI帮写
                            </button>
                            <span className="text-[11px] text-muted-foreground">{promptCounter}</span>
                        </div>
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-xs font-medium">视频模型</h3>
                        <ModelTierList tiers={SALE_VIDEO_MODEL_TIERS} config={config} value={model} onChange={setModel} disabled={running} />
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-xs font-medium">视频分辨率</h3>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="视频分辨率">
                            {SALE_VIDEO_RESOLUTIONS.map((resolution) => (
                                <button
                                    key={resolution.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={state.resolution === resolution.value}
                                    onClick={() => setState((previous) => ({ ...previous, resolution: resolution.value }))}
                                    disabled={running}
                                    className={cn(
                                        "rounded-md border px-3 py-1 text-[11px]",
                                        state.resolution === resolution.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                                    )}
                                >
                                    {resolution.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-1.5 rounded-lg border border-border p-2">
                        <h3 className="text-xs font-medium">生成设置</h3>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>视频时长</span>
                                <span>拖动选择时长</span>
                                <span data-testid="sale-video-duration-label">{state.videoTime}秒</span>
                            </div>
                            <input
                                type="range"
                                aria-label="视频时长"
                                min={5}
                                max={15}
                                step={5}
                                value={state.videoTime}
                                onChange={(event) =>
                                    setState((previous) => ({ ...previous, videoTime: Number(event.target.value) as SaleVideoState["videoTime"] }))
                                }
                                disabled={running}
                                className="w-full"
                            />
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                                {SALE_VIDEO_DURATIONS.map((duration) => (
                                    <span key={duration}>{duration}</span>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频比例</p>
                            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="视频比例">
                                {SALE_VIDEO_RATIOS.map((ratio) => (
                                    <button
                                        key={ratio.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={state.aspectRatio === ratio.value}
                                        title={ratio.note || undefined}
                                        onClick={() => setState((previous) => ({ ...previous, aspectRatio: ratio.value }))}
                                        disabled={running}
                                        className={cn(
                                            "rounded-md border px-2 py-0.5 text-[10px]",
                                            state.aspectRatio === ratio.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
                                        )}
                                    >
                                        {ratio.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="h-9 flex-1 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
                                onClick={() => void handleSubmit()}
                                disabled={running || Boolean(submitBlockedReason)}
                                title={submitBlockedReason || undefined}
                                data-testid="sale-video-submit"
                            >
                                {running ? "生成中…" : "立即生成"}
                            </button>
                            <span className="shrink-0 text-[11px] text-muted-foreground">645 算力</span>
                            <span className="shrink-0 rounded bg-amber-100 px-1 text-[11px] text-amber-700">季度特惠</span>
                        </div>
                        {submitBlockedReason ? (
                            <p className="sr-only" aria-live="polite" data-testid="sale-video-blocked">
                                {submitBlockedReason}
                            </p>
                        ) : null}
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
                    {task ? (
                        <ToolResult
                            task={task}
                            toolId={SALE_VIDEO_TOOL_ID}
                            title="带货口播视频"
                            now={Date.now()}
                            onRetry={() => void handleSubmit({ retry: true })}
                            className="min-h-[320px]"
                        />
                    ) : (
                        <div className="space-y-3">
                            <p className="text-[11px] leading-4 text-muted-foreground">上传商品图，自动分析商品信息并输出提示词，一键生成带货口播视频</p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="sale-video-slots">
                                {[1, 2, 3, 4].map((slot) => (
                                    <div
                                        key={slot}
                                        className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-border text-lg font-medium text-muted-foreground"
                                    >
                                        {slot}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
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
                            <h2 className="text-sm font-medium">优秀案例</h2>
                            <ToolCases cases={SALE_VIDEO_CASES} onApply={() => undefined} />
                        </section>
                    ) : null}
                    <WatermarkGroupPanel />
                    <p className="text-[11px] text-muted-foreground">ljq_driver: 已连接</p>
                    <section className="space-y-2 rounded-lg border border-border p-3" data-testid="sale-video-promo">
                        <p className="text-sm font-medium">「批量生成」功能重磅上线！</p>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            批量上传商品图，一次最多生成100条视频，同时给每个商品出视频，不用一张张传、一条条等。非高峰算力5折！
                        </p>
                        <button type="button" className="rounded-md border border-border px-3 py-1 text-[11px] text-muted-foreground">
                            立即体验
                        </button>
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

/** 原站 VIDEO_CONCAT 视频比例四项（A 列表 14–17，按原站顺序）。 */
const CONCAT_RATIO_OPTIONS = ["16:9", "9:16", "1:1", "4:3"] as const;

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
        <ToolShell className={className} title="视频剪辑" sidebar={sidebar}>
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4" data-testid="video-concat-config">
                    <AiVideoFamilyNav active="视频剪辑" showDriver={false} />
                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">选择视频素材</h2>
                        <p className="text-[11px] text-muted-foreground">支持选择2~4个视频素材，一键拼接成品视频。</p>
                        <ToolAssetInput
                            toolId={VIDEO_CONCAT_TOOL_ID}
                            variant="linkfox"
                            uploadLabel="选择视频素材"
                            actions={false}
                            constraints={CONCAT_CLIP_CONSTRAINTS}
                            maxCount={VIDEO_CONCAT_MAX_CLIPS}
                            disabled={running}
                            onChange={handleClipsChange}
                        />
                        {probing ? <p className="text-[11px] text-muted-foreground">正在读取片段真实时长…</p> : null}
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">视频比例</h2>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="视频比例">
                            {CONCAT_RATIO_OPTIONS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    role="radio"
                                    aria-checked={state.videoRatio === option}
                                    className={cn(
                                        "rounded-md border px-3 py-1.5 text-xs",
                                        state.videoRatio === option ? "border-primary bg-primary/10" : "border-border",
                                    )}
                                    onClick={() => setState((previous) => ({ ...previous, videoRatio: option }))}
                                    disabled={running}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </section>

                    <div className="space-y-2">
                        <button
                            type="button"
                            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                            onClick={() => void handleSubmit()}
                            disabled={running || Boolean(blockedReason)}
                            title={blockedReason || undefined}
                            data-testid="video-concat-submit"
                        >
                            {running ? "拼接中…" : "开始拼接"}
                        </button>
                        <p className="text-center text-[11px] text-muted-foreground">(限时优惠60算力)</p>
                        {error ? (
                            <p className="text-[11px] text-destructive" role="alert" data-testid="video-concat-error">
                                {error}
                            </p>
                        ) : null}
                        {notice ? <p className="text-[11px] text-muted-foreground">{notice}</p> : null}
                    </div>
                </div>

                <div className="min-w-0 space-y-3" data-testid="video-concat-results">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium">生成结果</h2>
                        {stale ? (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-amber-600" data-testid="video-concat-stale">
                                来自旧版本配置
                            </span>
                        ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <ToolResult
                            task={task}
                            toolId={VIDEO_CONCAT_TOOL_ID}
                            title="生成结果"
                            emptyTitle=""
                            emptyHint=""
                            now={Date.now()}
                            onRetry={() => void handleSubmit({ retry: true })}
                            className="min-h-[320px]"
                        />
                        <WatermarkGroupPanel />
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

const AI_VIDEO_MODEL_TIERS: readonly ModelTier[] = [
    { label: "Seedance 2.5", hint: "商品人物精准编辑", match: /seedance/i },
];

const REPLICATION_MODEL_TIERS: readonly ModelTier[] = [
    { label: "Seedance 2.0 fast", hint: "适合日常稳妥出片", match: /2\.0\s*fast|seedance.*fast/i },
];

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
            <div className="grid min-h-0 flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(460px,560px)_minmax(0,1fr)]">
                <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2" data-testid="ai-video-editing-config">
                    <div className="sm:col-span-2">
                        <AiVideoFamilyNav active="视频编辑" />
                    </div>
                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">原视频</h2>
                        <p className="text-[11px] leading-4 text-muted-foreground">上传需要编辑的视频</p>
                        <ToolAssetInput
                            toolId={AI_VIDEO_EDITING_TOOL_ID}
                            draftSlot="source-video"
                            constraints={AI_VIDEO_SOURCE_CONSTRAINTS}
                            maxCount={1}
                            disabled={running}
                            syncIds={sourceRecords.map((record) => record.id)}
                            onChange={handleSourceChange}
                            variant="linkfox"
                            uploadLabel="本地上传"
                            compact
                            wide
                            actions={
                                <button
                                    type="button"
                                    className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground"
                                    disabled
                                >
                                    作品选择
                                </button>
                            }
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground">支持MP4/MOV格式，100M以内，时长不低于4秒</p>
                        <p className="text-[11px] leading-4 text-muted-foreground">超长视频可截取30秒以内片段</p>
                        {source ? (
                            <div className="space-y-1">
                                <input
                                    type="range"
                                    aria-label="截取起点"
                                    min={0}
                                    max={maxStartSec}
                                    step={0.5}
                                    value={Math.min(state.clipStart, maxStartSec)}
                                    onChange={(event) => handleClipStart(Number(event.target.value))}
                                    disabled={running}
                                    className="w-full accent-primary"
                                />
                                <input
                                    type="range"
                                    aria-label="截取时长"
                                    min={1}
                                    max={Math.max(1, maxClipSec)}
                                    step={0.5}
                                    value={Math.min(state.clipDuration, Math.max(1, maxClipSec))}
                                    onChange={(event) => handleClipDuration(Number(event.target.value))}
                                    disabled={running}
                                    className="w-full accent-primary"
                                />
                            </div>
                        ) : null}
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">参考图（选填）</h2>
                        <h3 className="text-xs font-medium text-muted-foreground">图片规则</h3>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            支持上传30张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）
                        </p>
                        <ToolAssetInput
                            toolId={AI_VIDEO_EDITING_TOOL_ID}
                            draftSlot="reference-images"
                            constraints={AI_VIDEO_REFERENCE_CONSTRAINTS}
                            maxCount={AI_VIDEO_EDITING_MAX_REFERENCES}
                            disabled={running}
                            syncIds={referenceRecords.map((record) => record.id)}
                            onChange={handleReferenceChange}
                            variant="linkfox"
                            uploadLabel="本地上传"
                            compact
                            wide
                            actions={
                                <>
                                    <button
                                        type="button"
                                        className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground"
                                        disabled
                                    >
                                        作品选择
                                    </button>
                                    <button
                                        type="button"
                                        className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground"
                                        disabled
                                    >
                                        商品库选择
                                    </button>
                                </>
                            }
                        />
                    </section>

                    <section className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium">编辑需求描述</h2>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-foreground/30"
                                onClick={handleOptimizePrompt}
                                disabled={running || !state.prompt.trim()}
                                data-testid="ai-video-editing-optimize"
                            >
                                提示词优化
                            </button>
                        </div>
                        <textarea
                            className="min-h-[96px] w-full resize-y rounded-lg border border-border bg-card p-3 text-xs leading-5 outline-none focus-visible:border-primary"
                            placeholder="描述要对原视频做的编辑（动作、场景、光线、风格…）"
                            maxLength={AI_VIDEO_EDITING_PROMPT_MAX}
                            value={state.prompt}
                            onChange={(event) => setState((previous) => ({ ...previous, prompt: event.target.value }))}
                            disabled={running}
                            data-testid="ai-video-editing-prompt"
                        />
                        <p className="text-right text-[11px] text-muted-foreground" data-testid="ai-video-editing-counter">
                            {promptCounter}
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">视频模型</h2>
                        <ModelTierList
                            tiers={AI_VIDEO_MODEL_TIERS}
                            config={config}
                            value={model}
                            onChange={setModel}
                            disabled={running}
                        />
                        <ModelPicker config={config} value={model} onChange={setModel} capability="video" fullWidth />
                        <p className="text-[11px] leading-4 text-muted-foreground" data-testid="ai-video-editing-type">
                            {activeType.label}
                        </p>
                    </section>

                    <div className="space-y-2 sm:col-span-2">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                                onClick={() => void handleSubmit()}
                                disabled={running || !capability.canSubmit}
                                data-testid="ai-video-editing-submit"
                            >
                                {running ? "生成中…" : "立即生成"}
                            </button>
                            <p className="shrink-0 text-[11px] text-muted-foreground">1190 算力</p>
                        </div>
                        {!capability.canSubmit && capability.issues[0] ? (
                            <p className="text-[11px] text-muted-foreground">{capability.issues[0]}</p>
                        ) : null}
                        {assetIssue ? (
                            <p className="text-[11px] text-destructive" role="alert">
                                {assetIssue}
                            </p>
                        ) : null}
                        {error ? (
                            <p className="text-[11px] text-destructive" role="alert" data-testid="ai-video-editing-error">
                                {error}
                            </p>
                        ) : null}
                        {notice ? <p className="text-[11px] text-muted-foreground">{notice}</p> : null}
                    </div>
                </div>

                <div className="min-w-0 space-y-3" data-testid="ai-video-editing-results">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-medium">生成结果</h2>
                        {stale ? (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-amber-600">
                                来自旧版本配置
                            </span>
                        ) : null}
                    </div>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                        上传原视频与参考图，输入编辑需求，AI 智能编辑视频
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <ToolResult
                            task={task}
                            toolId={AI_VIDEO_EDITING_TOOL_ID}
                            title="编辑结果"
                            now={Date.now()}
                            onRetry={() => void handleSubmit({ retry: true })}
                            emptyHint=""
                            className="min-h-[320px]"
                        />
                        <WatermarkGroupPanel />
                    </div>
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
        <ToolShell className={className} title="视频复刻" sidebar={null}>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-4">
                <AiVideoFamilyNav active="视频复刻" />
                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(220px,250px)_minmax(240px,280px)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2" data-testid="video-replication-config">
                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">TikTok 视频链接</h2>
                        <div className="flex gap-2">
                            <input
                                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none focus-visible:border-primary"
                                value={values.videoLink}
                                onChange={(event) => setValues((previous) => ({ ...previous, videoLink: event.target.value, sourceMode: "link" }))}
                                disabled={running}
                                placeholder="https://www.tiktok.com/@user/video/..."
                                data-testid="video-replication-link"
                            />
                            <button
                                type="button"
                                className="h-8 shrink-0 rounded-md border border-border px-3 text-xs text-muted-foreground"
                                disabled
                                title="链接解析通道未接入：本地上传参考视频可用"
                            >
                                解析
                            </button>
                        </div>
                        <p className="text-[11px] leading-4 text-muted-foreground">或 手动上传参考视频</p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">上传参考视频</h2>
                        <ToolAssetInput
                            toolId={VIDEO_REPLICATION_TOOL_ID}
                            draftSlot="reference-video"
                            maxCount={1}
                            disabled={running}
                            onChange={handleVideoChange}
                            variant="linkfox"
                            uploadLabel="本地上传"
                            wide
                            compact
                            className="[&_div[role=button]]:min-h-[104px]"
                            actions={
                                <button
                                    type="button"
                                    className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground"
                                    disabled
                                >
                                    作品选择
                                </button>
                            }
                            constraints={{
                                kind: "video",
                                mimeTypes: [...VIDEO_REPLICATION_VIDEO_LIMITS.mimeTypes],
                                maxBytes: VIDEO_REPLICATION_VIDEO_LIMITS.maxBytes,
                            }}
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground">支持MP4/MOV格式，100M以内</p>
                        <p className="text-[11px] leading-4 text-muted-foreground">上传后可截取5-30s参考片段</p>
                        {videoRecord ? (
                            <input
                                type="range"
                                aria-label="参考片段截取"
                                min={0}
                                max={Math.max(0, Math.round(values.sourceVideoDuration))}
                                step={1}
                                value={values.clipEnd || 0}
                                onChange={(event) => handleClipRange(values.clipStart, Number(event.target.value))}
                                disabled={running}
                                className="w-full accent-primary"
                            />
                        ) : null}
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-sm font-medium">上传商品与参考图</h2>
                        <h3 className="text-xs font-medium text-muted-foreground">图片规则</h3>
                        <p className="text-[11px] leading-4 text-muted-foreground">
                            支持上传6张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）
                        </p>
                        <ToolAssetInput
                            toolId={VIDEO_REPLICATION_TOOL_ID}
                            draftSlot="reference-images"
                            maxCount={VIDEO_REPLICATION_REFERENCE_LIMITS.maxCount}
                            disabled={running}
                            onChange={handleReferenceChange}
                            variant="linkfox"
                            uploadLabel="本地上传"
                            wide
                            compact
                            className="[&_div[role=button]]:min-h-[104px]"
                            actions={
                                <>
                                    <button
                                        type="button"
                                        className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground"
                                        disabled
                                    >
                                        作品选择
                                    </button>
                                    <button
                                        type="button"
                                        className="h-7 w-full rounded-md border border-border bg-card text-xs text-muted-foreground"
                                        disabled
                                    >
                                        商品库选择
                                    </button>
                                </>
                            }
                            constraints={{
                                kind: "image",
                                mimeTypes: [...VIDEO_REPLICATION_IMAGE_MIME_TYPES],
                                maxBytes: VIDEO_REPLICATION_REFERENCE_LIMITS.maxBytes,
                                minWidth: VIDEO_REPLICATION_REFERENCE_LIMITS.minSide,
                                minHeight: VIDEO_REPLICATION_REFERENCE_LIMITS.minSide,
                                maxWidth: VIDEO_REPLICATION_REFERENCE_LIMITS.maxSide,
                                maxHeight: VIDEO_REPLICATION_REFERENCE_LIMITS.maxSide,
                            }}
                        />
                    </section>

                    <section className="space-y-2">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-medium">
                                <span>AI脚本分析</span> <span className="text-[11px] font-normal text-muted-foreground">（选填）</span>
                            </h2>
                        </div>
                        <select
                            aria-label="AI脚本分析"
                            className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs"
                            value={values.analyzeMode}
                            onChange={(event) => setValues((previous) => ({ ...previous, analyzeMode: event.target.value as typeof previous.analyzeMode }))}
                            disabled={running}
                        >
                            <option value="auto">默认自动分析</option>
                        </select>
                        <textarea
                            className="min-h-[88px] w-full resize-y rounded-lg border border-border bg-card p-3 text-xs leading-5 outline-none focus-visible:border-primary"
                            placeholder="口播脚本（分析结果会自动写入）"
                            maxLength={VIDEO_REPLICATION_PROMPT_LIMIT}
                            value={values.prompt}
                            onChange={(event) => setValues((previous) => ({ ...previous, prompt: event.target.value }))}
                            disabled={running}
                            data-testid="video-replication-prompt"
                        />
                    </section>
                </div>

                <div className="min-w-0 space-y-2" data-testid="video-replication-params">
                    <section className="space-y-1.5">
                        <h2 className="text-sm font-medium">视频模型</h2>
                        <ModelTierList
                            tiers={REPLICATION_MODEL_TIERS}
                            config={config}
                            value={model}
                            onChange={setModel}
                            disabled={running}
                        />
                    </section>

                    <section className="space-y-1.5">
                        <h2 className="text-sm font-medium">视频分辨率</h2>
                        <div className="flex gap-2" role="radiogroup" aria-label="视频分辨率">
                            {VIDEO_REPLICATION_RESOLUTIONS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={values.resolution === item.id}
                                    className={cn(
                                        "rounded-md border px-3 py-1.5 text-xs",
                                        values.resolution === item.id ? "border-primary bg-primary/10" : "border-border",
                                    )}
                                    onClick={() => setValues((previous) => ({ ...previous, resolution: item.id }))}
                                    disabled={running}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-1.5">
                        <h2 className="text-sm font-medium">生成设置</h2>
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">视频时长</p>
                            <p className="text-[11px] text-muted-foreground">拖动选择时长</p>
                            <p className="text-xs" data-testid="video-replication-duration-label">
                                {values.videoTime === "auto"
                                    ? VIDEO_REPLICATION_DURATIONS[0].label
                                    : `${values.videoTime}秒`}
                            </p>
                            <div className="flex gap-1">
                                {VIDEO_REPLICATION_DURATIONS.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={cn(
                                            "flex-1 rounded border px-1 py-1 text-[11px]",
                                            values.videoTime === item.id ? "border-primary bg-primary/10" : "border-border",
                                        )}
                                        onClick={() => setValues((previous) => ({ ...previous, videoTime: item.id }))}
                                        disabled={running}
                                    >
                                        {item.id === "auto" ? "Auto" : item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">视频比例</p>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="视频比例">
                            {VIDEO_REPLICATION_RATIOS.map((ratio) => (
                                <button
                                    key={ratio}
                                    type="button"
                                    role="radio"
                                    aria-checked={values.ratio === ratio}
                                    className={cn(
                                        "rounded-md border px-2 py-1 text-xs",
                                        values.ratio === ratio ? "border-primary bg-primary/10" : "border-border",
                                    )}
                                    onClick={() => setValues((previous) => ({ ...previous, ratio }))}
                                    disabled={running}
                                >
                                    {ratio}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-1.5">
                        <h2 className="text-sm font-medium">销售国家/地区</h2>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="销售国家/地区">
                            {VIDEO_REPLICATION_COUNTRIES.map((country) => (
                                <button
                                    key={country.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={values.saleCountry === country.id}
                                    className={cn(
                                        "rounded-md border px-2 py-1 text-xs",
                                        values.saleCountry === country.id ? "border-primary bg-primary/10" : "border-border",
                                    )}
                                    onClick={() => handleCountry(country.id)}
                                    disabled={running}
                                >
                                    {country.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">目标语言</p>
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="目标语言">
                            {VIDEO_REPLICATION_LANGUAGES.map((language) => (
                                <button
                                    key={language.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={values.targetLanguage === language.id}
                                    className={cn(
                                        "rounded-md border px-2 py-1 text-xs",
                                        values.targetLanguage === language.id ? "border-primary bg-primary/10" : "border-border",
                                    )}
                                    onClick={() => setValues((previous) => ({ ...previous, targetLanguage: language.id }))}
                                    disabled={running}
                                >
                                    {language.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    <div className="space-y-2">
                        <div className="flex items-start gap-2">
                            <button
                                type="button"
                                className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                                onClick={() => void handleSubmit()}
                                disabled={!canSubmit}
                                data-testid="video-replication-submit"
                            >
                                {running ? "生成中…" : "立即生成"}
                            </button>
                            <span className="shrink-0 text-[11px] text-muted-foreground" data-testid="video-replication-credit">645 算力</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground" data-testid="video-replication-promo">季度特惠</span>
                        </div>
                        {issues.length ? (
                            <p className="text-[11px] text-muted-foreground" data-testid="video-replication-blocked">
                                {issues[0].message ?? String(issues[0])}
                            </p>
                        ) : null}
                        {error ? (
                            <p className="text-[11px] text-destructive" role="alert" data-testid="video-replication-error">
                                {error}
                            </p>
                        ) : null}
                        {notice ? <p className="text-[11px] text-muted-foreground">{notice}</p> : null}
                    </div>
                </div>

                <div className="min-w-0 space-y-3" data-testid="video-replication-results">
                    <h2 className="text-sm font-medium">生成结果</h2>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                        上传商品图，自动分析商品信息并输出提示词，一键生成带货口播视频
                    </p>
                    <div className="rounded-lg border border-border p-3">
                        <h3 className="mb-1 text-xs font-medium">参考视频</h3>
                        <p className="text-[11px] text-muted-foreground">
                            {videoRecord ? videoRecord.name : "尚未选择参考视频"}
                        </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <ToolResult
                            task={task}
                            toolId={VIDEO_REPLICATION_TOOL_ID}
                            title="生成结果"
                            emptyHint=""
                            now={Date.now()}
                            onRetry={() => void handleRetry()}
                            className="min-h-[320px]"
                        />
                        <WatermarkGroupPanel />
                    </div>
                    <section className="rounded-lg border border-border bg-card/40 p-3">
                        <p className="text-xs font-medium">「批量生成」功能重磅上线！</p>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                            批量上传商品图，一次最多生成100条视频，同时给每个商品出视频，不用一张张传、一条条等。非高峰算力5折！
                        </p>
                        <button type="button" className="mt-2 rounded border border-border px-2 py-1 text-[11px]">
                            立即体验
                        </button>
                    </section>
                </div>
                </div>
            </div>
        </ToolShell>
    );
}