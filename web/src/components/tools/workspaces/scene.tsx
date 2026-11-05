import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { ToolResult } from "@/components/tools/tool-result";
import type { Design19TabId } from "@/components/tools/design19-frame";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { loadToolAssetRecords } from "@/services/api/tools/assets";
import type { ToolTask } from "@/services/api/tools/task-machine";
import { useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { getPersistedToolGateway, useToolTaskStore } from "@/stores/use-tool-task-store";

/* ==== 商品图 NEW_REPLACE_BG_V2：按原站 product-home → ai-product 两步结构，实现在 product-bg.tsx ==== */
export { SceneWorkspace, SceneWorkspace as default } from "./product-bg";

/* ==== 场景裂变 PRODUCT_SCENE（TASK-024）：实现在 scene-fission.tsx，入口统一收在 scene.tsx ==== */
export { ProductSceneWorkspace } from "./scene-fission";

/* ================================================================== *
 * 场景迁移 SCENE_TRANSFER（TASK-033）
 * 规格 §2：输入 = 商品图 + 场景风格参考图 + 商品分割图 + 相似度；
 * 规格 §3：相似度滑杆实时更新约束强度，任一必填图缺失禁用生成；
 * 规格 §5：提交失败/部分失败/刷新恢复都如实展示，不伪造成功。
 * 与 NEW_REPLACE_BG_V2 / PRODUCT_SCENE / FISSION_LINK 无共享状态，只共享 scene 布局。
 * ================================================================== */

import { cn } from "@/lib/utils";
import { describeToolExecution } from "@/services/api/tools/gateway";
import {
    SCENE_TRANSFER_SIMILARITY,
    SCENE_TRANSFER_SOURCE_LIMITS,
    SCENE_TRANSFER_TOOL_ID,
    SCENE_TRANSFER_TITLE,
    SCENE_TRANSFER_VALUES_SLOT,
    SCENE_TRANSFER_SNAPSHOT_SLOT,
    DEFAULT_SCENE_TRANSFER_VALUES,
    clampSimilarity,
    createSceneTransferSnapshot,
    readSceneTransferValues,
    resolveTransferSegmentation,
    restoreSceneTransferSnapshot,
    serializeSceneTransferValues,
    validateSceneTransferState,
    type SceneTransferSnapshot,
    type SceneTransferValues,
} from "@/features/tools/registry/scene-transfer";
import {
    retrySceneTransfer,
    runSceneTransfer,
    sceneTransferResultFromTask,
    transferImageRef,
    type SceneTransferAsset,
    type SceneTransferGateway,
} from "@/features/tools/adapters/scene-transfer";

export type SceneTransferWorkspaceProps = {
    className?: string;
    toolId?: string;
    /** 测试注入的执行端口；默认走共享任务网关（真实 provider 请求）。 */
    port?: SceneTransferGateway;
};

function transferAssetFromRecord(record: {
    id: string;
    name: string;
    mimeType: string;
    url: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
}): SceneTransferAsset {
    return {
        assetId: record.id,
        id: record.id,
        name: record.name,
        type: record.mimeType,
        mimeType: record.mimeType,
        url: record.url,
        storageKey: record.storageKey,
        width: record.width,
        height: record.height,
        bytes: record.bytes,
    };
}

export function SceneTransferWorkspace({ className, toolId = SCENE_TRANSFER_TOOL_ID, port }: SceneTransferWorkspaceProps) {
    const hydrate = useToolDraftStore((store) => store.hydrate);
    const patchDraft = useToolDraftStore((store) => store.patch);
    const draft = useToolDraftStore((store) => store.drafts[toolId]);
    const imageModel = useConfigStore((state) => state.config.imageModel);

    const [values, setValues] = useState<SceneTransferValues>(() => ({ ...DEFAULT_SCENE_TRANSFER_VALUES }));
    const [product, setProduct] = useState<SceneTransferAsset | null>(null);
    const [style, setStyle] = useState<SceneTransferAsset | null>(null);
    const [seg, setSeg] = useState<SceneTransferAsset | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [lostAssets, setLostAssets] = useState<string[]>([]);
    const [task, setTask] = useState<ToolTask | undefined>();
    const [snapshot, setSnapshot] = useState<SceneTransferSnapshot | undefined>();
    /** 右栏页签：原站「生成结果 / 优秀案例 / 历史记录」。 */
    const [resultTab, setResultTab] = useState<Design19TabId>("result");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const hydratedRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);
    /** 任务落库（G1）：刷新后从 localStorage/IndexedDB 取回任务与结果字节。 */
    const storedTasks = useToolTaskStore((store) => store.tasks);
    const upsertStoredTask = useToolTaskStore((store) => store.upsertTask);
    const hydrateTasks = useToolTaskStore((store) => store.hydrate);

    /** 草稿只恢复输入与资产引用；资产解析不到就明确标“丢失”，不假装已恢复。 */
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        void hydrate(toolId);
        const restored = readSceneTransferValues(draft?.values?.[SCENE_TRANSFER_VALUES_SLOT] as Record<string, unknown> | undefined);
        setValues(restored);
        const ids = [restored.imageUrl, restored.imageStyleUrl, restored.segImageUrl].filter((id) => id && !/^(https?:|data:|blob:)/.test(id));
        if (!ids.length) return;
        setRestoring(true);
        void (async () => {
            try {
                const { records } = await loadToolAssetRecords(ids);
                const byId = new Map(records.map((record) => [record.id, record]));
                const missing: string[] = [];
                const pick = (id: string) => (id ? byId.get(id) : undefined);
                const productRecord = pick(restored.imageUrl);
                const styleRecord = pick(restored.imageStyleUrl);
                const segRecord = pick(restored.segImageUrl);
                if (productRecord) setProduct(transferAssetFromRecord(productRecord));
                else if (restored.imageUrl && !/^(https?:|data:|blob:)/.test(restored.imageUrl)) missing.push("商品图");
                if (styleRecord) setStyle(transferAssetFromRecord(styleRecord));
                else if (restored.imageStyleUrl && !/^(https?:|data:|blob:)/.test(restored.imageStyleUrl)) missing.push("场景风格参考图");
                if (segRecord) setSeg(transferAssetFromRecord(segRecord));
                else if (restored.segImageUrl && !/^(https?:|data:|blob:)/.test(restored.segImageUrl)) missing.push("商品分割图");
                setLostAssets(missing);
            } finally {
                setRestoring(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrate, toolId]);

    /**
     * G1 刷新恢复：任务本身落 `useToolTaskStore`（localStorage + IndexedDB 产物字节），
     * 挂载时 hydrate 一次；刷新后即使组件 state 清空，也能从持久化任务里把结果取回来。
     */
    useEffect(() => {
        hydrateTasks();
    }, [hydrateTasks]);

    /** 本次会话没有新任务时，回落到最近一条已持久化的同工具任务（不伪造、只读回填）。 */
    const storedTask = useMemo(() => {
        if (port) return undefined;
        return Object.values(storedTasks)
            .filter((item) => item.toolId === toolId)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    }, [storedTasks, port, toolId]);

    const activeTask = task ?? storedTask;

    /** 提交快照写进草稿：刷新后「本次提交快照」不空，且能提示输入是否已漂移。 */
    const snapshotRestoredRef = useRef(false);
    useEffect(() => {
        if (snapshotRestoredRef.current || snapshot) return;
        const restored = restoreSceneTransferSnapshot(draft?.values?.[SCENE_TRANSFER_SNAPSHOT_SLOT]);
        if (!restored) return;
        snapshotRestoredRef.current = true;
        setSnapshot(restored);
    }, [draft?.values, snapshot]);

    const update = useCallback(
        (next: Partial<SceneTransferValues>) => {
            setValues((current) => {
                const merged = serializeSceneTransferValues({ ...current, ...next });
                patchDraft(toolId, {
                    values: { [SCENE_TRANSFER_VALUES_SLOT]: merged },
                    assetIds: [merged.imageUrl, merged.imageStyleUrl, merged.segImageUrl].filter((id) => id && !/^(https?:|data:|blob:)/.test(id)),
                });
                return merged;
            });
        },
        [patchDraft, toolId],
    );

    const segmentation = useMemo(
        () => resolveTransferSegmentation({ segImageUrl: seg ? (seg.dataUrl ?? "").trim() || (seg.url ?? "").trim() : "" }),
        [seg],
    );

    const descriptor = useMemo(() => describeToolExecution(SCENE_TRANSFER_TOOL_ID), []);

    const issues = useMemo(
        () =>
            validateSceneTransferState({
                values,
                productReady: Boolean(product),
                styleReady: Boolean(style),
                imageModelReady: Boolean(imageModel?.trim()),
                executable: descriptor.executable,
                segmentation,
            }),
        [values, product, style, imageModel, descriptor.executable, segmentation],
    );

    const blocked = running || issues.length > 0;

    const currentSnapshot = useMemo<SceneTransferSnapshot | null>(() => {
        if (!product || !style) return null;
        return createSceneTransferSnapshot({
            values,
            product,
            style,
            segmentation,
            revision: draft?.revision ?? null,
        });
    }, [values, product, style, segmentation, draft?.revision]);

    const view = useMemo(
        () => sceneTransferResultFromTask(activeTask, snapshot, currentSnapshot),
        [activeTask, snapshot, currentSnapshot],
    );

    const submit = useCallback(async () => {
        if (!product || !style || issues.length) return;
        setRunning(true);
        setError("");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await runSceneTransfer({
                gateway: port ?? getPersistedToolGateway(),
                values,
                product,
                style,
                segAsset: seg,
                imageModelReady: Boolean(imageModel?.trim()),
                descriptor,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUpdate: (next) => {
                    setTask(next);
                    if (!port) upsertStoredTask(next);
                },
            });
            setTask(run.task);
            if (!port) upsertStoredTask(run.task);
            setSnapshot(run.snapshot);
            if (run.snapshot) {
                patchDraft(toolId, { values: { [SCENE_TRANSFER_SNAPSHOT_SLOT]: run.snapshot } });
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "提交失败");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [product, style, seg, values, issues, port, imageModel, descriptor, draft?.revision, patchDraft, toolId, upsertStoredTask]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        const current = activeTask;
        if (current && current.status === "running") {
            const cancelled = (port ?? getPersistedToolGateway()).cancel?.(current.id);
            if (cancelled) {
                setTask(cancelled);
                if (!port) upsertStoredTask(cancelled);
            }
        }
    }, [activeTask, port, upsertStoredTask]);

    /** 规格 §5：按相同快照重试 —— 沿用当前页面参数重建请求并走网关 retry，不静默换配置。 */
    const retry = useCallback(async () => {
        if (!product || !style || running || issues.length) return;
        const previous = activeTask;
        if (!previous) return;
        setRunning(true);
        setError("");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const run = await retrySceneTransfer({
                gateway: port ?? getPersistedToolGateway(),
                taskId: previous.id,
                values,
                product,
                style,
                segAsset: seg,
                imageModelReady: Boolean(imageModel?.trim()),
                descriptor,
                revision: draft?.revision ?? null,
                signal: controller.signal,
                onUpdate: (next) => {
                    setTask(next);
                    if (!port) upsertStoredTask(next);
                },
            });
            setTask(run.task);
            if (!port) upsertStoredTask(run.task);
            setSnapshot(run.snapshot);
            if (run.snapshot) {
                patchDraft(toolId, { values: { [SCENE_TRANSFER_SNAPSHOT_SLOT]: run.snapshot } });
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "重试失败");
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    }, [product, style, seg, values, issues, running, activeTask, port, imageModel, descriptor, draft?.revision, patchDraft, toolId, upsertStoredTask]);

    /** 原站上传卡（UploadImage）：140px 虚线框，商品图自动抠图、风格图不抠图；本地沿用 ToolAssetInput 真实入库。 */
    const uploadCard = (testId: string, label: string, slot: "product" | "style") => (
        <div className="mb-[10px]" data-testid={testId}>
            <ToolAssetInput
                toolId={`${toolId}-${slot}`}
                title=""
                variant="linkfox"
                uploadLabel={`上传${label}`}
                maxCount={1}
                constraints={SCENE_TRANSFER_SOURCE_LIMITS}
                disabled={running || restoring}
                hint="图片格式：支持jpg、jpeg、png、webp格式，10M以内，最小：32*32，最大：8192*8192"
                onChange={(_ids, records) => {
                    const record = records[0];
                    const asset = record ? transferAssetFromRecord(record) : null;
                    if (slot === "product") {
                        setProduct(asset);
                        update({ imageUrl: asset ? transferImageRef(asset) || record.id : "" });
                    } else {
                        setStyle(asset);
                        update({ imageStyleUrl: asset ? transferImageRef(asset) || record.id : "" });
                    }
                }}
            />
        </div>
    );

    return (
        <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)} data-testid="scene-transfer-workspace">
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                configClassName="overflow-hidden rounded-[8px] border border-black/[0.08] bg-white"
                mainClassName="min-h-0 overflow-hidden"
                config={(
            <section data-testid="scene-transfer-config" className="flex h-full min-h-0 min-w-0 flex-col">
                <div data-testid="scene-transfer-config-scroll" className="min-h-0 flex-1 overflow-y-auto py-[10px] pl-4 pr-3 [scrollbar-gutter:stable]">
                    {lostAssets.length ? (
                        <p className="mb-[10px] rounded border border-border bg-accent px-3 py-2 text-[11px] text-foreground" data-testid="scene-transfer-lost-assets">
                            草稿里的这些图在本地已找不到，请重新选择：{lostAssets.join("、")}
                        </p>
                    ) : null}
                    {uploadCard("scene-transfer-product", "商品图", "product")}
                    {uploadCard("scene-transfer-style", "风格图", "style")}
                    <div data-testid="scene-transfer-similarity">
                        <p className="text-[14px] leading-[22px] text-[#999]">风格相似度：</p>
                        <input
                            type="range"
                            min={SCENE_TRANSFER_SIMILARITY.min}
                            max={SCENE_TRANSFER_SIMILARITY.max}
                            step={SCENE_TRANSFER_SIMILARITY.step}
                            value={clampSimilarity(values.similarity)}
                            disabled={running}
                            aria-label="风格相似度"
                            data-testid="scene-transfer-similarity-slider"
                            className="w-full accent-[#723cf9]"
                            onChange={(event) => update({ similarity: clampSimilarity(event.target.value) })}
                        />
                        <p className="text-right text-[12px] text-black/45" data-testid="scene-transfer-similarity-value">{(clampSimilarity(values.similarity) / 100).toFixed(2)}</p>
                    </div>
                    {issues.length || error ? (
                        <div className="mt-2 space-y-1">
                            {product && style
                                ? issues.map((issue) => (
                                      <p key={`${issue.code}-${issue.field}`} className="text-[11px] text-destructive" data-testid="scene-transfer-issue">
                                          {issue.message}
                                      </p>
                                  ))
                                : null}
                            {error ? <p className="text-[11px] text-destructive" data-testid="scene-transfer-error">{error}</p> : null}
                        </div>
                    ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2 border-t-[3px] border-[#f5f7fa] px-4 py-2">
                    <button
                        type="button"
                        disabled={blocked}
                        data-testid="scene-transfer-submit"
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[6px] bg-[linear-gradient(90deg,#3a7df9,#723cf9)] text-[12px] text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void submit()}
                    >
                        {running ? "生成中…" : "立即生成"}
                    </button>
                    {running ? (
                        <button type="button" data-testid="scene-transfer-cancel" className="h-8 rounded-[6px] border border-border px-3 text-[12px] text-muted-foreground hover:bg-accent" onClick={cancel}>
                            取消
                        </button>
                    ) : null}
                </div>
            </section>
                )}
            >
                <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-black/[0.08] bg-white px-3">
                    <button type="button" onClick={() => setResultTab("result")} className={cn("h-[42px] border-b-2 text-[14px]", resultTab === "result" ? "border-[#723cf9] text-[#723cf9]" : "border-transparent text-black/60")}>
                        生成结果
                    </button>
                    <button type="button" onClick={() => setResultTab("history")} className={cn("text-[12px]", resultTab === "history" ? "text-[#723cf9]" : "text-black/60 hover:text-[#723cf9]")}>
                        历史记录
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {resultTab === "result" ? (
                        <div className="space-y-3" data-testid="scene-transfer-result">
                            {activeTask ? (
                                <>
                                    <ToolResult task={activeTask} toolId={toolId} title={`${SCENE_TRANSFER_TITLE}结果`} onCancel={running ? cancel : undefined} onRetry={!running && task ? () => void retry() : undefined} />
                                    {view.stale ? (
                                        <p className="rounded border border-border bg-accent px-3 py-2 text-[11px] text-foreground" data-testid="scene-transfer-stale">
                                            {view.stale}
                                        </p>
                                    ) : null}
                                </>
                            ) : (
                                <div className="flex min-h-[420px] flex-col items-center justify-center text-[14px] text-black/45" data-testid="scene-transfer-snapshot-empty">
                                    <p>暂无生成结果图</p>
                                    <p className="mt-1 text-[12px]">快在左侧上传商品图和风格图生成吧~</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <ToolTaskHistory toolId={toolId} emptyHint="还没有场景迁移任务记录" onSelectTask={(next) => (setTask(next), setResultTab("result"))} />
                    )}
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}
