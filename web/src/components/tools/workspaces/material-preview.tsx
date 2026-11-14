import { useCallback, useEffect, useMemo, useState } from "react";
import { Cascader } from "antd";
import { ChevronDown, Loader2, X } from "lucide-react";

import { ToolAssetInput } from "@/components/tools/tool-asset-input";
import { ToolResult } from "@/components/tools/tool-result";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { cn } from "@/lib/utils";
import { assetRecordToReference } from "@/features/tools/adapters/change-color-v2";
import {
    DEFAULT_MATERIAL_PREVIEW_VALUES,
    MATERIAL_PREVIEW_CATEGORIES,
    MATERIAL_PREVIEW_RECOMMENDED,
    MATERIAL_PREVIEW_TOOL_ID,
    buildMaterialPreviewInputs,
    readMaterialPreviewValues,
    type MaterialPreviewValues,
} from "@/features/tools/registry/material-preview";
import type { ToolAssetRecord } from "@/services/api/tools/assets";
import { autoSegmentSubjectMask } from "@/services/api/tools/segmentation";
import { resolveModelChannel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";

const toolId = MATERIAL_PREVIEW_TOOL_ID;
const RECOMMENDED_LABELS = MATERIAL_PREVIEW_RECOMMENDED.name.split("、");

/**
 * 商品预览效果（MATERIAL_UPPER_BODY）。原站是结果图上的「商品预览效果」弹窗（rea 还原 PreviewModal chunk），
 * 本地做成独立页：左侧上传素材图，右侧「素材贴合到商品的效果预览」+「使用原图预览」+「品类：推荐」+ 4 张预览。
 * 原站打开弹窗/切换选项即自动生成；本地改为点「立即生成」，避免每次切换都真实计费。
 */
export function MaterialPreviewWorkspace() {
    const config = useConfigStore((state) => state.config);
    const imageModels = useMemo(() => selectableModelsByCapability(config, "image"), [config]);
    const model = config.imageModel || imageModels[0] || "";
    const modelReady = Boolean(model && resolveModelChannel(config, model));

    const hydrateDraft = useToolDraftStore((state) => state.hydrate);
    const patchDraft = useToolDraftStore((state) => state.patch);
    const draftRevision = useToolDraftStore((state) => state.drafts[toolId]?.revision ?? null);
    const tasks = useToolTaskStore((state) => state.tasks);
    const runTool = useToolTaskStore((state) => state.runTool);

    const [values, setValues] = useState<MaterialPreviewValues>(DEFAULT_MATERIAL_PREVIEW_VALUES);
    const [source, setSource] = useState<ToolAssetRecord | null>(null);
    const [cutoutPreviewUrl, setCutoutPreviewUrl] = useState<string>("");
    const [shownIds, setShownIds] = useState<{ id: string; label: string }[]>([]);
    const [running, setRunning] = useState(false);
    const [errorText, setErrorText] = useState("");

    useEffect(() => {
        let cancelled = false;
        if (!source?.url || !values.isMatting) {
            setCutoutPreviewUrl("");
            return;
        }
        void autoSegmentSubjectMask(source.url)
            .then((seg) => {
                if (!cancelled) setCutoutPreviewUrl(seg.cutoutDataUrl);
            })
            .catch(() => {
                if (!cancelled) setCutoutPreviewUrl("");
            });
        return () => {
            cancelled = true;
        };
    }, [source?.url, values.isMatting]);

    useEffect(() => {
        let alive = true;
        void hydrateDraft(toolId).then((draft) => {
            if (alive && draft) setValues(readMaterialPreviewValues(draft.values));
        });
        return () => {
            alive = false;
        };
    }, [hydrateDraft]);

    const update = useCallback(
        (patch: Partial<MaterialPreviewValues>) => {
            setValues((previous) => {
                const next = { ...previous, ...patch };
                patchDraft(toolId, { values: { categoryId: next.categoryId ?? null, categoryName: next.categoryName, isMatting: next.isMatting } });
                return next;
            });
        },
        [patchDraft],
    );

    const latest = useMemo(() => Object.values(tasks).filter((task) => task.toolId === toolId).sort((a, b) => b.createdAt - a.createdAt)[0], [tasks]);
    const shown = (shownIds.length ? shownIds : latest ? [{ id: latest.id, label: "生成结果" }] : []).flatMap((item) => (tasks[item.id] ? [{ task: tasks[item.id], label: item.label }] : []));
    const blocked = !source ? "请先上传素材图" : !modelReady ? "未配置可用的图像模型" : "";

    const submit = useCallback(async () => {
        if (!source || blocked) return setErrorText(blocked);
        setRunning(true);
        setErrorText("");
        try {
            const ref = assetRecordToReference(source);
            const effectiveRef = values.isMatting && cutoutPreviewUrl ? { ...ref, url: cutoutPreviewUrl, dataUrl: cutoutPreviewUrl } : ref;
            const inputs = buildMaterialPreviewInputs(values, effectiveRef, model);
            const submitted = await Promise.all(
                inputs.map((input) => {
                    const promise = runTool(input, { draftRevision });
                    return promise.catch((error: unknown) => {
                        setErrorText(error instanceof Error ? error.message : "提交失败");
                        return null;
                    });
                }),
            );
            const labels = values.categoryId === undefined ? RECOMMENDED_LABELS : [values.categoryName];
            setShownIds(submitted.flatMap((task, index) => (task ? [{ id: task.id, label: labels[index] }] : [])));
        } finally {
            setRunning(false);
        }
    }, [blocked, draftRevision, model, runTool, source, values]);

    const recommended = values.categoryId === undefined;

    return (
        <div data-testid="material-preview-workspace" className="flex h-full min-h-0 flex-col">
            <ToolWorkspaceColumns
                className="min-h-0 flex-1"
                configClassName="overflow-hidden rounded-[8px] border border-border bg-background"
                mainClassName="min-h-0 overflow-hidden"
                config={
                    <div className="flex h-full min-h-0 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-[10px]" data-testid="material-preview-source">
                            <p className="mb-1 text-[12px] leading-[22px] text-muted-foreground">素材图</p>
                            <ToolAssetInput
                                toolId={toolId}
                                title=""
                                variant="linkfox"
                                uploadLabel="上传素材图"
                                maxCount={1}
                                disabled={running}
                                hint="图片格式：支持jpg、jpeg、png、webp格式，10M以内"
                                onChange={(_ids, records) => setSource(records[0] ?? null)}
                            />
                        </div>
                        <div className="shrink-0 border-t-[3px] border-border px-4 py-2">
                            <button
                                type="button"
                                data-testid="material-preview-submit"
                                disabled={Boolean(blocked) || running}
                                title={blocked}
                                onClick={() => void submit()}
                                className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-[6px] bg-primary text-[12px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                立即生成
                            </button>
                            {errorText ? <p data-testid="material-preview-error" className="mt-1 text-[12px] text-destructive">{errorText}</p> : null}
                        </div>
                    </div>
                }
            >
                <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-border bg-background px-4">
                    <p className="text-[14px] text-foreground">素材贴合到商品的效果预览</p>
                    <div className="flex items-center gap-4 text-[14px]">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-foreground">
                            <input type="checkbox" data-testid="material-preview-origin" className="accent-[var(--selected)]" checked={!values.isMatting} disabled={running} onChange={(event) => update({ isMatting: !event.target.checked })} />
                            使用原图预览
                        </label>
                        <span className="inline-flex items-center gap-1">
                            <Cascader
                                options={MATERIAL_PREVIEW_CATEGORIES}
                                fieldNames={{ label: "name", value: "id", children: "children" }}
                                disabled={running}
                                onChange={(_value, selected) => {
                                    const leaf = selected?.[selected.length - 1];
                                    if (leaf) update({ categoryId: leaf.id, categoryName: leaf.name });
                                }}
                            >
                                <a data-testid="material-preview-category" className="inline-flex cursor-pointer items-center gap-1 text-foreground">
                                    <span className="text-foreground">品类：</span>
                                    {values.categoryName || "推荐"}
                                    <ChevronDown className="size-3.5" />
                                </a>
                            </Cascader>
                            {recommended ? null : (
                                <button type="button" aria-label="恢复推荐品类" disabled={running} onClick={() => update({ categoryId: undefined, categoryName: "" })} className="text-muted-foreground hover:text-foreground">
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </span>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {source ? (
                        /* 原站 _main：500 高、棋盘格底的素材大图。 */
                        <div data-testid="material-preview-source-image" className="mb-4 flex h-[500px] items-center justify-center">
                            <img src={values.isMatting && cutoutPreviewUrl ? cutoutPreviewUrl : source.url} alt="素材图" className="max-h-full max-w-full object-contain [background-image:linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%)] [background-position:0_0,8px_8px] [background-size:16px_16px]" />
                        </div>
                    ) : null}
                    {shown.length ? (
                        <div className={cn("grid gap-3", shown.length > 1 && "grid-cols-2")} data-testid="material-preview-results">
                            {shown.map(({ task, label }) => (
                                <ToolResult key={task.id} task={task} toolId={toolId} title={label} />
                            ))}
                        </div>
                    ) : (
                        <div data-testid="material-preview-empty" className="flex h-full min-h-[320px] flex-col items-center justify-center text-[14px] text-muted-foreground">
                            <p>暂无预览效果</p>
                            <p className="mt-1 text-[12px]">上传素材图，{recommended ? `预览贴合到 ${MATERIAL_PREVIEW_RECOMMENDED.name} 的效果` : `预览贴合到「${values.categoryName}」的效果`}</p>
                        </div>
                    )}
                    <ToolTaskHistory toolId={toolId} className="mt-4" emptyHint="还没有商品预览效果记录" onSelectTask={(task) => setShownIds([{ id: task.id, label: "生成结果" }])} />
                </div>
            </ToolWorkspaceColumns>
        </div>
    );
}

export default MaterialPreviewWorkspace;
