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
import { readToolAssetBlob, type ToolAssetRecord } from "@/services/api/tools/assets";
import { useConfigStore } from "@/stores/use-config-store";
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
            <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
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
                </div>
            </div>
        </ToolShell>
    );
}

export default SaleVideoWorkspace;
