import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolShell } from "@/components/tools/tool-shell";
import { saveResultItemToAssets, sendResultItemToCanvas } from "@/components/tools/tool-result-actions";
import {
    auditConfirmed,
    auditTranslations,
    buildTranslationUnits,
    createModelTextPort,
    createTaskStoreRunPort,
    mergeOutcomes,
    outcomeOf,
    prepareTranslationRun,
    retryableUnits,
    runTranslationUnits,
    summarizeByLanguage,
    transcribeImage,
    translateBoxes,
    type TranslationTextPort,
    type TranslationUnit,
    type TranslationUnitOutcome,
    type TranslationUnitStatus,
} from "@/features/tools/adapters/image-translation";
import {
    IMAGE_TRANSLATION_DRAFT_KEY,
    IMAGE_TRANSLATION_MAX_IMAGES,
    IMAGE_TRANSLATION_MAX_TARGETS,
    IMAGE_TRANSLATION_MAX_TEXT_CHARS,
    IMAGE_TRANSLATION_MIN_EDGE,
    IMAGE_TRANSLATION_MAX_EDGE,
    IMAGE_TRANSLATION_SLUG,
    IMAGE_TRANSLATION_TOOL_ID,
    SOURCE_LANGUAGES,
    TARGET_LANGUAGE_GROUPS,
    TRANSLATION_AUTO_SOURCE,
    addManualBox,
    applyRecognition,
    blockingIssues,
    createTranslationValues,
    groupSelectedCounts,
    imageCharCount,
    imageStateOf,
    isSnapshotStale,
    languageLabel,
    parseTranslationValues,
    plannedCells,
    removeBox,
    setActiveAsset,
    setActiveLanguage,
    setImageConfirmed,
    setSourceLanguage,
    syncImages,
    toggleTargetLanguage,
    updateBoxSourceText,
    updateBoxTargetText,
    validateTranslationState,
    buildTranslationSnapshot,
} from "@/features/tools/registry/image-translation";
import { getToolById } from "@/features/tools/registry";
import { imageToDataUrl } from "@/services/image-storage";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { flushToolDrafts, useToolDraftStore } from "@/stores/use-tool-draft-store";
import { cn } from "@/lib/utils";

const TOOL_ID = IMAGE_TRANSLATION_TOOL_ID;

/** 页面规格 §2：20M 以内，384*384 ~ 4096*4096。 */
const TRANSLATE_CONSTRAINTS = {
    kind: "image" as const,
    maxBytes: 20 * 1024 * 1024,
    minWidth: IMAGE_TRANSLATION_MIN_EDGE,
    minHeight: IMAGE_TRANSLATION_MIN_EDGE,
    maxWidth: IMAGE_TRANSLATION_MAX_EDGE,
    maxHeight: IMAGE_TRANSLATION_MAX_EDGE,
};

const STATUS_LABEL: Record<TranslationUnitStatus, string> = {
    succeeded: "已完成",
    failed: "失败",
    unknown: "结果未定",
    cancelled: "已取消",
};

/** 原站语言 chip：26px 高、6px 圆角、浅灰底；选中为品牌紫底白字。 */
const CHIP_CLASS = (active: boolean) =>
    cn(
        "h-[26px] rounded-[6px] px-3 text-xs leading-none transition disabled:cursor-not-allowed disabled:opacity-50",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80",
    );

function Section({
    id,
    title,
    titleClassName,
    hint,
    titleExtra,
    collapsible,
    defaultOpen = false,
    children,
}: {
    id: string;
    title?: string;
    titleClassName?: string;
    hint?: string;
    titleExtra?: React.ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const header = (
        <header className={collapsible ? "flex items-center justify-between gap-2" : "mb-2 flex items-center justify-between gap-2"}>
            {title || titleExtra ? (
                <h2 className={cn("text-sm font-medium", titleClassName)}>
                    {title}
                    {titleExtra}
                </h2>
            ) : null}
            {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
        </header>
    );
    if (collapsible) {
        return (
            <details id={id} open={defaultOpen} className="scroll-mt-16 rounded-lg border border-border bg-card p-3">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{header}</summary>
                <div className="mt-2 space-y-2">{children}</div>
            </details>
        );
    }
    return (
        <section id={id} className="scroll-mt-16 rounded-lg border border-border bg-card p-3">
            {header}
            <div className="space-y-2">{children}</div>
        </section>
    );
}

export interface TranslateWorkspaceProps {
    className?: string;
}

/**
 * 批量翻译工作台（IMAGE_TRANSLATION）。
 * 真话边界：文字框只来自真实视觉识别或用户手填；译文只来自真实翻译调用；
 * 结果只来自共享 TaskGateway；失败/取消/未定一律如实展示，不计入成功。
 */
export function TranslateWorkspace({ className }: TranslateWorkspaceProps = {}) {
    const spec = useMemo(() => getToolById(TOOL_ID), []);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const draftRevision = useToolDraftStore((state) => state.drafts[TOOL_ID]?.revision ?? 0);
    const conflict = useToolDraftStore((state) => state.conflicts[TOOL_ID]);

    const [values, setValues] = useState(() => createTranslationValues());
    const [records, setRecords] = useState<ToolAssetRecord[]>([]);
    const [assetIds, setAssetIds] = useState<string[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [outcomes, setOutcomes] = useState<TranslationUnitOutcome[]>([]);
    const [units, setUnits] = useState<TranslationUnit[]>([]);
    const [runHash, setRunHash] = useState<string | null>(null);
    const [recognizing, setRecognizing] = useState<string | null>(null);
    const [translating, setTranslating] = useState<string | null>(null);
    const [showSnapshot, setShowSnapshot] = useState(false);

    const valuesRef = useRef(values);
    const abortRef = useRef<AbortController | null>(null);
    const textPortRef = useRef<TranslationTextPort | null>(null);

    const textPort = useCallback((): TranslationTextPort => {
        if (!textPortRef.current) textPortRef.current = createModelTextPort();
        return textPortRef.current;
    }, []);

    const commit = useCallback(
        (next: typeof values) => {
            valuesRef.current = next;
            setValues(next);
            patchDraft(TOOL_ID, { values: next as unknown as Record<string, unknown> });
        },
        [patchDraft],
    );

    /* ---------------- 草稿恢复 ---------------- */

    useEffect(() => {
        let alive = true;
        void (async () => {
            const draft = await hydrateDraft(TOOL_ID);
            if (!alive) return;
            const restored = parseTranslationValues(draft?.values);
            const ids = Array.isArray(draft?.assetIds) ? draft!.assetIds : restored.images.map((image) => image.assetId);
            const synced = syncImages(restored, ids);
            valuesRef.current = synced;
            setValues(synced);
            setAssetIds(ids);
            setHydrated(true);
            if (ids.length) {
                const { loadToolAssetRecords } = await import("@/services/api/tools/assets");
                const { records: loaded } = await loadToolAssetRecords(ids);
                if (alive) setRecords(loaded);
            }
        })();
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => {
        if (!hydrated) return;
        void flushToolDrafts([TOOL_ID]);
    }, [values, hydrated]);

    /* ---------------- 派生状态 ---------------- */

    const issues = useMemo(() => validateTranslationState({ assetIds, values }), [assetIds, values]);
    const blocking = useMemo(() => blockingIssues(issues), [issues]);
    const currentSnapshot = useMemo(() => buildTranslationSnapshot({ assetIds, values }), [assetIds, values]);
    const stale = runHash ? isSnapshotStale(currentSnapshot, runHash) : false;
    const activeImage = imageStateOf(values, values.activeAssetId);
    const activeRecord = records.find((record) => record.id === values.activeAssetId);
    const plannedTotal = assetIds.length * values.targetLanguages.length;
    const succeededTotal = outcomes.filter((outcome) => outcome.status === "succeeded").length;
    const languageRows = useMemo(() => summarizeByLanguage(values.targetLanguages, outcomes), [values.targetLanguages, outcomes]);
    const cells = useMemo(() => plannedCells(assetIds, values.targetLanguages), [assetIds, values.targetLanguages]);
    const groupCounts = useMemo(() => groupSelectedCounts(values.targetLanguages), [values.targetLanguages]);

    /* ---------------- 图片 ---------------- */

    const onAssetsChange = useCallback(
        (ids: string[], nextRecords: ToolAssetRecord[]) => {
            setAssetIds(ids);
            setRecords(nextRecords);
            commit(syncImages(valuesRef.current, ids));
        },
        [commit],
    );

    const recognize = useCallback(
        async (assetId: string) => {
            const record = records.find((item) => item.id === assetId);
            if (!record) {
                setNotice("找不到这张图片的资产记录，请重新上传");
                return;
            }
            setRecognizing(assetId);
            setNotice("正在调用视觉模型识别文字…");
            try {
                const imageUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
                if (!imageUrl) throw new Error("图片读取失败，无法识别");
                const result = await transcribeImage(textPort(), {
                    imageUrl,
                    sourceLanguage: valuesRef.current.sourceLanguage,
                    signal: abortRef.current?.signal,
                });
                const current = valuesRef.current;
                const next = applyRecognition(
                    current,
                    assetId,
                    result.boxes.map((box) => ({
                        id: box.id,
                        sourceText: box.sourceText,
                        targets: {} as Record<string, string>,
                        origin: "recognized" as const,
                        ...(box.bbox ? { bbox: box.bbox } : {}),
                        ...(box.confidence === undefined ? {} : { confidence: box.confidence }),
                    })),
                    { detectedLanguage: result.detectedLanguage, at: Date.now() },
                );
                commit(next);
                setNotice(
                    result.boxes.length
                        ? `识别到 ${result.boxes.length} 个文字框（${result.detectedLanguage ? languageLabel(result.detectedLanguage) : "语言未标注"}），请逐框校对后点「翻译全部目标语言」`
                        : "识别调用成功但没有返回文字框：可手动添加文本框，或换用支持视觉输入的模型后重试",
                );
            } catch (error) {
                setNotice(error instanceof Error ? `识别失败：${error.message}` : "识别失败");
            } finally {
                setRecognizing(null);
            }
        },
        [commit, records, textPort],
    );

    const translateAll = useCallback(
        async (assetId: string) => {
            const current = valuesRef.current;
            const state = imageStateOf(current, assetId);
            if (!state || state.boxes.length === 0) {
                setNotice("这张图片还没有文字框：先识别文字或手动添加");
                return;
            }
            if (current.targetLanguages.length === 0) {
                setNotice("先在右侧选择至少一个目标语言");
                return;
            }
            const source = current.sourceLanguage === TRANSLATION_AUTO_SOURCE ? (state.detectedLanguage ?? TRANSLATION_AUTO_SOURCE) : current.sourceLanguage;
            setTranslating(assetId);
            let next = current;
            const failures: string[] = [];
            for (const language of current.targetLanguages) {
                if (language === source) {
                    failures.push(`${languageLabel(language)}（与原文相同，已跳过）`);
                    continue;
                }
                setNotice(`正在翻译为 ${languageLabel(language)}…`);
                try {
                    const map = await translateBoxes(textPort(), {
                        sourceLanguage: source,
                        targetLanguage: language,
                        boxes: state.boxes,
                        signal: abortRef.current?.signal,
                    });
                    next = {
                        ...next,
                        images: next.images.map((image) =>
                            image.assetId === assetId
                                ? {
                                      ...image,
                                      boxes: image.boxes.map((box) => ({
                                          ...box,
                                          targets: { ...box.targets, [language]: map[box.id] ?? box.targets[language] ?? "" },
                                      })),
                                      confirmed: false,
                                  }
                                : image,
                        ),
                    };
                    commit(next);
                } catch (error) {
                    failures.push(`${languageLabel(language)}（${error instanceof Error ? error.message : "翻译失败"}）`);
                }
            }
            setTranslating(null);
            setNotice(failures.length ? `部分语言未完成：${failures.join("；")}` : "全部目标语言已翻译，请逐框校对后确认");
        },
        [commit, textPort],
    );

    const confirmActive = useCallback(() => {
        const assetId = valuesRef.current.activeAssetId;
        if (!assetId) return;
        const state = imageStateOf(valuesRef.current, assetId);
        // 这里只校验「每个目标语言都有译文」，不能用 auditConfirmed（它要求已经 confirmed，会把确认动作锁死）。
        const audit = auditTranslations(state, valuesRef.current.targetLanguages);
        if (!audit.ok) {
            setNotice(audit.reason ?? "还不能确认");
            return;
        }
        commit(setImageConfirmed(valuesRef.current, assetId, true));
        setNotice("已确认这张图的译文，可继续批量翻译");
    }, [commit]);

    /* ---------------- 运行 ---------------- */

    const execute = useCallback(
        async (targets: readonly TranslationUnit[], hash: string) => {
            if (!targets.length) return;
            abortRef.current = new AbortController();
            setBusy(true);
            setProgress({ done: 0, total: targets.length });
            setRunHash(hash);
            const port = createTaskStoreRunPort();
            try {
                const result = await runTranslationUnits(targets, {
                    port,
                    signal: abortRef.current.signal,
                    onOutcome: (outcome, _unit, done, total) => {
                        setProgress({ done, total });
                        setOutcomes((prev) => mergeOutcomes(prev, [outcome]));
                    },
                });
                setOutcomes((prev) => mergeOutcomes(prev, result));
                const failed = result.filter((outcome) => outcome.status !== "succeeded").length;
                setNotice(failed ? `${result.length - failed} 张完成，${failed} 张未完成（可单张重试）` : `全部 ${result.length} 张已完成`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "运行失败");
            } finally {
                setBusy(false);
                abortRef.current = null;
            }
        },
        [],
    );

    const runAll = useCallback(async () => {
        if (busy) return;
        const issuesNow = validateTranslationState({ assetIds, values: valuesRef.current });
        const blockingNow = blockingIssues(issuesNow);
        if (blockingNow.length) {
            setNotice(blockingNow[0].message);
            return;
        }
        setNotice("正在读取图片并锁定本次快照…");
        // 图片 URL 需要在提交前转成 provider 可读的 data URL（blob: 地址上游读不到）。
        const { toReference } = await import("@/features/tools/adapters/image-translation");
        const readable: ToolAssetRecord[] = [];
        for (const record of records) {
            const dataUrl = await imageToDataUrl({ storageKey: record.storageKey, url: record.url });
            readable.push({ ...record, url: dataUrl || record.url });
        }
        const prepared = prepareTranslationRun({
            records: readable.map((record) => ({ ...record, ...{ url: record.url } })),
            assetIds,
            values: valuesRef.current,
            imageNames: Object.fromEntries(readable.map((record) => [record.id, record.name])),
            draftRevision,
            clientOperationId:
                typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        });
        const built = prepared.units.map((unit) => ({ ...unit, references: [toReference(readable.find((record) => record.id === unit.assetId) ?? readable[0])] }));
        if (!built.length) {
            setNotice("没有可执行的请求单元");
            return;
        }
        setUnits(built);
        setOutcomes([]);
        await execute(built, prepared.snapshot.hash);
    }, [assetIds, busy, draftRevision, execute, records]);

    const retryFailed = useCallback(async () => {
        if (busy) return;
        const targets = retryableUnits(units, outcomes);
        if (!targets.length) {
            setNotice("没有可重试的失败单元");
            return;
        }
        await execute(targets, runHash ?? units[0]?.snapshotHash ?? "");
    }, [busy, execute, outcomes, runHash, units]);

    const retryCell = useCallback(
        async (assetId: string, language: string) => {
            if (busy) return;
            const unit = units.find((item) => item.assetId === assetId && item.language === language);
            if (!unit) {
                setNotice("这个单元格还没有请求快照：先点「开始批量翻译」");
                return;
            }
            await execute([unit], unit.snapshotHash);
        },
        [busy, execute, units],
    );

    const stop = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const download = useCallback(
        (outcome: TranslationUnitOutcome) => {
            const url = outcome.image?.dataUrl || outcome.image?.url;
            if (!url) return;
            const record = records.find((item) => item.id === outcome.assetId);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${(record?.name ?? "图片").replace(/\.[^.]+$/, "")}-${outcome.language}.png`;
            anchor.rel = "noopener";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        },
        [records],
    );

    const resultItemOf = useCallback((outcome: TranslationUnitOutcome) => {
        const url = outcome.image?.url;
        const dataUrl = outcome.image?.dataUrl;
        return {
            id: outcome.taskId ?? outcome.unitId,
            kind: "image" as const,
            ...(dataUrl ? { dataUrl } : {}),
            ...(url ? { url } : {}),
            ...(outcome.image?.mimeType ? { mimeType: outcome.image.mimeType } : {}),
        };
    }, []);

    const saveToAssets = useCallback(
        async (outcome: TranslationUnitOutcome) => {
            const record = records.find((item) => item.id === outcome.assetId);
            const base = (record?.name ?? "图片").replace(/\.[^.]+$/, "");
            try {
                await saveResultItemToAssets(resultItemOf(outcome), 0, {
                    toolId: IMAGE_TRANSLATION_TOOL_ID,
                    ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
                    title: `${base}-${languageLabel(outcome.language)}`,
                });
                setNotice(`已存入资产库：${base}-${languageLabel(outcome.language)}`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "存入资产库失败");
            }
        },
        [records, resultItemOf],
    );

    const sendToCanvas = useCallback(
        async (outcome: TranslationUnitOutcome) => {
            try {
                const created = await sendResultItemToCanvas(resultItemOf(outcome), {
                    toolId: IMAGE_TRANSLATION_TOOL_ID,
                    projectTitle: "图片翻译结果",
                });
                setNotice(`已发送到画布（项目 ${created.projectId.slice(0, 8)}）`);
            } catch (error) {
                setNotice(error instanceof Error ? error.message : "发送到画布失败");
            }
        },
        [resultItemOf],
    );

    /* ---------------- 渲染 ---------------- */

    return (
        <ToolShell
            className={className}
            title={spec?.title ?? "批量翻译"}
            actions={
                busy ? (
                    <button type="button" onClick={stop} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                        停止
                    </button>
                ) : undefined
            }
            notices={
                <>
                    {conflict ? (
                        <p className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            该工具的其他标签页修改了草稿，当前页面可能覆盖远端改动；刷新后再编辑可避免冲突。
                        </p>
                    ) : null}
                    {notice ? <p className="mb-2 rounded border border-border bg-accent px-3 py-2 text-xs">{notice}</p> : null}
                    {stale ? (
                        <p className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                            输入已变更，下面的结果是旧快照的产物（快照 {runHash?.slice(0, 8)}），重新生成才会反映当前设置。
                        </p>
                    ) : null}
                </>
            }
            sidebar={
                <nav className="space-y-1 p-2 text-sm">
                    {[
                        ["images", "上传图片"],
                        ["source", "原文语言"],
                        ["targets", "目标语言"],
                        ["proofread", "逐框校对"],
                        ["results", "生成结果"],
                    ].map(([id, label]) => (
                        <a key={id} href={`#${id}`} className="block rounded px-2 py-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground">
                            {label}
                        </a>
                    ))}
                </nav>
            }
        >
            <div className="grid min-h-0 gap-3 bg-muted/40 p-3 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-3">
                    <Section id="images" title="上传需要翻译的图片" titleClassName="text-xs font-normal">
                        <ToolAssetInput
                            toolId={TOOL_ID}
                            variant="linkfox"
                            title=""
                            uploadLabel="从本地上传"
                            className="w-full"
                            maxCount={IMAGE_TRANSLATION_MAX_IMAGES}
                            constraints={TRANSLATE_CONSTRAINTS}
                            disabled={busy}
                            onChange={onAssetsChange}
                            hint={
                                <>
                                    20M以内，{IMAGE_TRANSLATION_MIN_EDGE}*{IMAGE_TRANSLATION_MIN_EDGE} ~ {IMAGE_TRANSLATION_MAX_EDGE}*{IMAGE_TRANSLATION_MAX_EDGE}
                                </>
                            }
                        />
                        {assetIds.length ? (
                            <ul className="space-y-1">
                                {assetIds.map((assetId) => {
                                    const record = records.find((item) => item.id === assetId);
                                    const state = imageStateOf(values, assetId);
                                    const chars = state ? imageCharCount(state) : 0;
                                    const active = values.activeAssetId === assetId;
                                    return (
                                        <li key={assetId} className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => commit(setActiveAsset(valuesRef.current, assetId))}
                                                aria-pressed={active}
                                                className={cn(
                                                    "min-w-0 flex-1 truncate rounded border px-2 py-1 text-left text-xs transition",
                                                    active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                                                )}
                                                title={record?.name ?? assetId}
                                            >
                                                {record?.name ?? assetId}
                                            </button>
                                            <span className="shrink-0 text-[11px] text-muted-foreground">
                                                {state?.boxes.length ?? 0} 框 · {chars} 字{state?.confirmed ? " · 已确认" : ""}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={busy || recognizing === assetId}
                                                onClick={() => void recognize(assetId)}
                                                className="shrink-0 rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:opacity-50"
                                            >
                                                {recognizing === assetId ? "识别中…" : "识别文字"}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            hydrated ? (
                                <p className="text-sm text-primary">上传多张图片，开始批量翻译</p>
                            ) : (
                                <p className="text-xs text-muted-foreground">正在恢复草稿…</p>
                            )
                        )}
                        <p className="text-xs text-[#FA5151]">
                            💡当前仅支持单张图内{IMAGE_TRANSLATION_MAX_TEXT_CHARS}字以下的内容翻译
                        </p>
                    </Section>

                    <Section id="source" title="原文语言">
                        <div className="flex flex-wrap gap-1.5">
                            {SOURCE_LANGUAGES.map((language) => (
                                <button
                                    key={language.code}
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        commit(
                                            setSourceLanguage(
                                                valuesRef.current,
                                                valuesRef.current.sourceLanguage === language.code ? "" : language.code,
                                            ),
                                        )
                                    }
                                    aria-pressed={values.sourceLanguage === language.code}
                                    className={CHIP_CLASS(values.sourceLanguage === language.code)}
                                >
                                    {language.label}
                                </button>
                            ))}
                        </div>
                        {activeImage?.detectedLanguage && !values.sourceLanguage ? (
                            <p className="text-[11px] text-muted-foreground">识别图像语言：{languageLabel(activeImage.detectedLanguage)}</p>
                        ) : null}
                    </Section>

                    <Section
                        id="targets"
                        title="目标语言"
                        titleExtra={
                            <span className="ml-1 text-sm font-normal text-black/60 dark:text-white/60">
                                （可多选，已选 {values.targetLanguages.length} 个语言）
                            </span>
                        }
                    >
                        <div className="space-y-2">
                            {TARGET_LANGUAGE_GROUPS.map((group) => {
                                const count = groupCounts.find((item) => item.key === group.key)?.selected ?? 0;
                                return (
                                    <div key={group.key} className="space-y-1.5">
                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <span>{group.label}</span>
                                            {count ? <span className="text-primary">已选 {count}</span> : null}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {group.languages.map((language) => {
                                                const selected = values.targetLanguages.includes(language.code);
                                                const sameAsSource = values.sourceLanguage === language.code;
                                                return (
                                                    <button
                                                        key={language.code}
                                                        type="button"
                                                        disabled={busy || (!selected && values.targetLanguages.length >= IMAGE_TRANSLATION_MAX_TARGETS)}
                                                        onClick={() => commit(toggleTargetLanguage(valuesRef.current, language.code))}
                                                        aria-pressed={selected}
                                                        title={sameAsSource ? "与原文语言相同：该语言不会重复出图" : undefined}
                                                        className={cn(CHIP_CLASS(selected), sameAsSource && !selected ? "ring-1 ring-dashed ring-primary/40" : "")}
                                                    >
                                                        {language.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {values.sourceLanguage !== TRANSLATION_AUTO_SOURCE && values.targetLanguages.includes(values.sourceLanguage) ? (
                            <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
                                目标语言与原文语言相同，该语言不会产生新的翻译图。
                            </p>
                        ) : null}
                        <button
                            type="button"
                            disabled={busy || !assetIds.length || !values.targetLanguages.length}
                            onClick={() => void runAll()}
                            className="h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {busy ? `翻译中 ${progress.done}/${progress.total}` : "开始翻译"}
                        </button>
                    </Section>
                </div>

                <div className="flex min-h-0 flex-col gap-3">
                    <div className="flex h-[41px] shrink-0 items-center gap-6 border-b border-border bg-card px-4 text-sm">
                        <span className="-mb-px flex h-full items-center border-b-2 border-primary font-medium text-primary">生成结果</span>
                    </div>
                    <Section
                        id="proofread"
                        collapsible
                        defaultOpen={false}
                        title="逐文本框校对"
                        hint={activeRecord ? `${activeRecord.name} · ${activeImage?.boxes.length ?? 0} 个文字框` : "先在左侧选择图片"}
                    >
                        {activeRecord ? (
                            <>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={busy || recognizing === activeRecord.id}
                                        onClick={() => void recognize(activeRecord.id)}
                                        className="rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:opacity-50"
                                    >
                                        {recognizing === activeRecord.id ? "识别中…" : "识别文字（视觉模型）"}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => commit(addManualBox(valuesRef.current, activeRecord.id))}
                                        className="rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:opacity-50"
                                    >
                                        添加文本框
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || translating === activeRecord.id || values.targetLanguages.length === 0}
                                        onClick={() => void translateAll(activeRecord.id)}
                                        className="rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:opacity-50"
                                    >
                                        {translating === activeRecord.id ? "翻译中…" : "翻译全部目标语言"}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={confirmActive}
                                        className="rounded bg-primary/90 px-2 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary disabled:opacity-50"
                                    >
                                        {activeImage?.confirmed ? "重新确认" : "确认译文"}
                                    </button>
                                    <span className={cn("text-[11px]", activeImage?.confirmed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                                        {activeImage?.confirmed ? "已确认" : "未确认"} · 识别字符 {activeImage ? imageCharCount(activeImage) : 0}/{IMAGE_TRANSLATION_MAX_TEXT_CHARS}
                                    </span>
                                </div>

                                {values.targetLanguages.length === 0 ? <p className="text-xs text-muted-foreground">先选择目标语言，译文列才会出现。</p> : null}

                                {activeImage && activeImage.boxes.length ? (
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[11px] text-muted-foreground">校对语言：</span>
                                            {values.targetLanguages.map((code) => (
                                                <button
                                                    key={code}
                                                    type="button"
                                                    onClick={() => commit(setActiveLanguage(valuesRef.current, code))}
                                                    aria-pressed={values.activeLanguage === code}
                                                    className={cn(
                                                        "rounded-full border px-2 py-0.5 text-[11px] transition",
                                                        values.activeLanguage === code
                                                            ? "border-primary bg-primary text-primary-foreground"
                                                            : "border-border text-muted-foreground hover:bg-accent",
                                                    )}
                                                >
                                                    {languageLabel(code)}
                                                </button>
                                            ))}
                                        </div>
                                        <ul className="space-y-2">
                                            {activeImage.boxes.map((box, index) => (
                                                <li key={box.id} className="rounded border border-border p-2">
                                                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                                        <span>
                                                            #{index + 1} · {box.origin === "manual" ? "手工" : "识别"}
                                                            {box.bbox ? ` · 位置 ${Math.round(box.bbox.x * 100)}%,${Math.round(box.bbox.y * 100)}%` : ""}
                                                            {typeof box.confidence === "number" ? ` · 置信 ${(box.confidence * 100).toFixed(0)}%` : ""}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => commit(removeBox(valuesRef.current, activeRecord.id, box.id))}
                                                            className="rounded px-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                                            aria-label={`删除第 ${index + 1} 个文字框`}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        <label className="space-y-1">
                                                            <span className="text-[11px] text-muted-foreground">原文</span>
                                                            <textarea
                                                                value={box.sourceText}
                                                                disabled={busy}
                                                                rows={2}
                                                                onChange={(event) => commit(updateBoxSourceText(valuesRef.current, activeRecord.id, box.id, event.target.value))}
                                                                className="w-full resize-y rounded border border-border bg-background px-2 py-1 text-xs"
                                                            />
                                                        </label>
                                                        <label className="space-y-1">
                                                            <span className="text-[11px] text-muted-foreground">{languageLabel(values.activeLanguage ?? values.targetLanguages[0] ?? "")}</span>
                                                            <textarea
                                                                value={box.targets[values.activeLanguage ?? values.targetLanguages[0] ?? ""] ?? ""}
                                                                disabled={busy || !values.activeLanguage}
                                                                rows={2}
                                                                placeholder={values.activeLanguage ? "待翻译：可直接改写" : "先选校对语言"}
                                                                onChange={(event) =>
                                                                    commit(
                                                                        updateBoxTargetText(
                                                                            valuesRef.current,
                                                                            activeRecord.id,
                                                                            box.id,
                                                                            values.activeLanguage ?? values.targetLanguages[0] ?? "",
                                                                            event.target.value,
                                                                        ),
                                                                    )
                                                                }
                                                                className="w-full resize-y rounded border border-border bg-background px-2 py-1 text-xs"
                                                            />
                                                        </label>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        还没有文字框：点「识别文字」用视觉模型识别，或「添加文本框」手工录入（识别为空时不会编造文字）。
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-xs text-muted-foreground">上传图片后在这里逐框校对原文与译文。</p>
                        )}

                        {issues.length ? (
                            <ul className="space-y-1">
                                {issues.slice(0, 6).map((issue, index) => (
                                    <li
                                        key={`${issue.code}-${index}`}
                                        className={cn(
                                            "rounded border px-2 py-1 text-[11px]",
                                            issue.level === "error"
                                                ? "border-destructive/40 bg-destructive/10 text-destructive"
                                                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                                        )}
                                    >
                                        {issue.message}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </Section>

                    <Section id="results" hint={`${succeededTotal}/${plannedTotal} 完成`}>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                disabled={busy || outcomes.length === 0}
                                onClick={() => void retryFailed()}
                                className="rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent disabled:opacity-50"
                            >
                                重试失败单元
                            </button>
                            <button type="button" onClick={() => setShowSnapshot((prev) => !prev)} className="rounded border border-border px-2 py-1 text-[11px] transition hover:bg-accent">
                                {showSnapshot ? "隐藏快照" : "查看快照"}
                            </button>
                            {busy ? <span className="text-[11px] text-muted-foreground">进度 {progress.done}/{progress.total}</span> : null}
                        </div>

                        {showSnapshot ? (
                            <pre className="max-h-48 overflow-auto rounded border border-border bg-muted/30 p-2 text-[10px] leading-relaxed">
                                {JSON.stringify(currentSnapshot, null, 2)}
                            </pre>
                        ) : null}

                        {!assetIds.length || !values.targetLanguages.length ? (
                            <p className="text-xs text-muted-foreground">上传图片并选择目标语言后，这里会出现「图片 × 语言」结果矩阵。</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] border-collapse text-xs">
                                    <thead>
                                        <tr>
                                            <th className="border-b border-border px-2 py-1 text-left font-medium">图片</th>
                                            {languageRows.map((row) => (
                                                <th key={row.language} className="border-b border-border px-2 py-1 text-left font-medium">
                                                    {row.label}
                                                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                                        {row.total ? `${row.succeeded}/${row.total}` : ""}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assetIds.map((assetId) => (
                                            <tr key={assetId}>
                                                <td className="border-b border-border px-2 py-1 align-top">
                                                    <span className="line-clamp-2 text-[11px]">{records.find((record) => record.id === assetId)?.name ?? assetId}</span>
                                                </td>
                                                {values.targetLanguages.map((language) => {
                                                    const outcome = outcomeOf(outcomes, assetId, language);
                                                    const cell = cells.find((item) => item.assetId === assetId && item.language === language);
                                                    return (
                                                        <td key={language} className="border-b border-border px-2 py-1 align-top">
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-1">
                                                                    <span
                                                                        className={cn(
                                                                            "rounded px-1 py-0.5 text-[10px]",
                                                                            !outcome
                                                                                ? "bg-muted text-muted-foreground"
                                                                                : outcome.status === "succeeded"
                                                                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                                                                  : outcome.status === "failed"
                                                                                    ? "bg-destructive/15 text-destructive"
                                                                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                                                                        )}
                                                                    >
                                                                        {outcome ? STATUS_LABEL[outcome.status] : cell ? "待翻译" : "—"}
                                                                    </span>
                                                                    {outcome?.image?.url || outcome?.image?.dataUrl ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => download(outcome)}
                                                                            className="rounded border border-border px-1 text-[10px] transition hover:bg-accent"
                                                                        >
                                                                            下载
                                                                        </button>
                                                                    ) : null}
                                                                    {outcome?.image?.dataUrl || outcome?.image?.url ? (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => void saveToAssets(outcome)}
                                                                                className="rounded border border-border px-1 text-[10px] transition hover:bg-accent"
                                                                            >
                                                                                存库
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => void sendToCanvas(outcome)}
                                                                                className="rounded border border-border px-1 text-[10px] transition hover:bg-accent"
                                                                            >
                                                                                发画布
                                                                            </button>
                                                                        </>
                                                                    ) : null}
                                                                    <button
                                                                        type="button"
                                                                        disabled={busy}
                                                                        onClick={() => void retryCell(assetId, language)}
                                                                        className="rounded border border-border px-1 text-[10px] transition hover:bg-accent disabled:opacity-50"
                                                                    >
                                                                        {outcome?.status === "succeeded" ? "重跑" : "重试"}
                                                                    </button>
                                                                </div>
                                                                {outcome?.image?.url || outcome?.image?.dataUrl ? (
                                                                    <img
                                                                        src={outcome.image.dataUrl || outcome.image.url}
                                                                        alt={`${language} 翻译结果`}
                                                                        className="h-16 w-full rounded border border-border object-cover"
                                                                    />
                                                                ) : null}
                                                                {outcome?.error ? (
                                                                    <p className="line-clamp-3 text-[10px] text-destructive" title={outcome.error.message}>
                                                                        {outcome.error.code}：{outcome.error.message}
                                                                    </p>
                                                                ) : null}
                                                                {outcome && stale ? <p className="text-[10px] text-amber-600 dark:text-amber-400">来自旧版本</p> : null}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Section>
                </div>
            </div>
        </ToolShell>
    );
}
