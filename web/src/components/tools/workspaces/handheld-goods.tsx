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
import { ImageRulesPopover } from "@/components/tools/image-rules-popover";
import { OrigRail, type RailEntry } from "@/components/tools/workspaces/orig-rail";
import { ToolTaskHistory } from "@/components/tools/tool-task-history";
import {
    Design19Chip,
    Design19ChipGroup,
    Design19Empty,
    Design19FieldLabel,
    Design19PrimaryButton,
    Design19Results,
    Design19Section,
} from "@/components/tools/design19-frame";
import { cn } from "@/lib/utils";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { handheldGoodsResultPanelTask } from "@/features/tools/adapters/handheld-goods";
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
    handheldGoodsOutputLabel,
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
import { uploadToolAsset, type ToolAssetRecord, toolAssetLibraryItemsFromAssets } from "@/services/api/tools/assets";
import { useAssetStore, type ImageAsset, type VideoAsset } from "@/stores/use-asset-store";
import { useToolDraftStore } from "@/stores/use-tool-draft-store";
import { ToolWorkspaceColumns } from "@/components/tools/tool-workspace-columns";
import { CropOriginalDialog } from "@/components/tools/crop-original-dialog";
import { ProductImageEditDialog, type ProductImageEditMode, type ProductImageEditSource } from "@/components/tools/product-image-edit-dialog";

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

/** 原站左 rail（商品图设计族）在内容区的等价展示，顺序取自原站 HANDHELD_GOODS 页。 */
const HANDHELD_GOODS_RAIL: RailEntry[] = [
    { kind: "flat", label: "商品图" },
    { kind: "flat", label: "我的商品" },
    { kind: "flat", label: "场景参考图" },
    { kind: "flat", label: "商品替换" },
    { kind: "flat", label: "场景裂变" },
    { kind: "tool", label: "手持商品", route: "/tools/product-design/handheld-goods" },
    { kind: "flat", label: "历史记录" },
    { kind: "tag", label: "企业功能" },
    { kind: "flat", label: "批量生图" },
];

export function HandheldGoodsWorkspace({ className }: HandheldGoodsWorkspaceProps = {}) {
    const spec = useMemo(() => getHandheldGoodsSpec(), []);

    // 结果面板只认落库任务：刷新后由 hydrate 用 storageKey 复原真实字节，再交给共享 ToolResult。
    const storedTasks = useToolTaskStore((state) => state.tasks);
    const tasksHydrated = useToolTaskStore((state) => state.hydrated);
    const hydrateTasks = useToolTaskStore((state) => state.hydrate);
    const toolTasks = useMemo(
        () => Object.values(storedTasks).filter((task) => task.toolId === HANDHELD_GOODS_TOOL_ID),
        [storedTasks],
    );
    const panelTask = useMemo(() => handheldGoodsResultPanelTask(toolTasks), [toolTasks]);

    useEffect(() => {
        if (!tasksHydrated) hydrateTasks();
    }, [tasksHydrated, hydrateTasks]);

    const [state, setState] = useState<HandheldGoodsState>(() => createHandheldGoodsState());
    const [product, setProduct] = useState<ToolAssetRecord | null>(null);
    /** 外部回填（裁剪/消除/抠图）后要同步给上传区的资产 id；上传区自管选中态，只改 product 不会刷新预览。 */
    const [productSyncIds, setProductSyncIds] = useState<string[] | undefined>(undefined);
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

    // 作品库（本地资产库）：上传卡上的「从作品库选择」从真实资产列表读取，不伪造商品库入口。
    const assets = useAssetStore((state) => state.assets);
    const library = useMemo(
        () => toolAssetLibraryItemsFromAssets(assets.filter((asset): asset is ImageAsset | VideoAsset => asset.kind === "image" || asset.kind === "video")),
        [assets],
    );

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
    const [rightTab, setRightTab] = useState<"result" | "history">("result");
    /** 「一键做同款」之后出现的「点击这里裁剪原图尺寸」入口（原站同位置）。 */
    const [cropEntryVisible, setCropEntryVisible] = useState(false);
    const [cropDialogOpen, setCropDialogOpen] = useState(false);
    /** 「消除 / 抠图」弹窗：真实上游能力，结果回流为新的商品图。 */
    const [editMode, setEditMode] = useState<ProductImageEditMode | null>(null);
    const [editSource, setEditSource] = useState<ProductImageEditSource | null>(null);

    /** 「一键做同款」：套用官方示例配置（首个手持姿势 + 1 张），缺商品图时给出提示。 */
    const applyShowcaseCase = useCallback(() => {
        const pose = poses[0];
        if (!pose) return;
        setState((previous) => ({ ...previous, modelId: pose.id, modelTabType: pose.hand, outputNum: 1 }));
        setNotice(product ? null : "已套用示例配置，请先上传商品图再生成");
        // 原站做同款后会给出原图裁剪入口；本地同位置露出同一句文案，点击走真实裁剪。
        setCropEntryVisible(true);
    }, [poses, product]);

    /** 裁剪确认：真实 canvas 居中裁剪 → 重新入库 → 替换商品图。 */
    const handleCropped = useCallback(async (file: File) => {
        const record = await uploadToolAsset(file, { constraints: SOURCE_CONSTRAINTS });
        setProduct(record);
        setNotice("已按所选比例裁剪原图，并作为商品图使用");
    }, []);

    /** 打开消除 / 抠图：先把已上传的商品图转成 dataUrl（上游只认 data/http URL）。 */
    const openEdit = useCallback(async (mode: ProductImageEditMode) => {
        if (!product) {
            setNotice("请先上传商品图，再做消除或抠图");
            return;
        }
        try {
            const response = await fetch(product.url);
            const blob = await response.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result ?? ""));
                reader.onerror = () => reject(reader.error ?? new Error("读取原图失败"));
                reader.readAsDataURL(blob);
            });
            setEditSource({
                id: product.id,
                name: product.name,
                dataUrl,
                width: product.width ?? 1024,
                height: product.height ?? 1024,
            });
            setEditMode(mode);
        } catch (error) {
            setNotice(error instanceof Error ? `读取原图失败：${error.message}` : "读取原图失败");
        }
    }, [product]);

    /** 消除 / 抠图结果：按普通上传的同一套校验重新入库，替换商品图。 */
    const handleEdited = useCallback(async (file: File) => {
        const record = await uploadToolAsset(file, { constraints: SOURCE_CONSTRAINTS });
        setProduct(record);
        setProductSyncIds([record.id]);
        setEditMode(null);
        setNotice("已用处理后的图替换商品图");
    }, []);

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
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)} data-testid="handheld-workspace-root">
            {notice ? (
                <div
                    role="status"
                    className="mb-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                >
                    {notice}
                </div>
            ) : null}
            <OrigRail items={HANDHELD_GOODS_RAIL} active="手持商品" driver className="mb-2" testId="handheld-family-rail" />
            <ToolWorkspaceColumns
                data-testid="handheld-goods-workspace"
                config={(
                    <div className="flex h-full min-h-0 flex-col gap-2">
                    <div data-testid="handheld-config-scroll" className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {/* 0. 原站左卡标题：工具名 + 一句话 tagline（real/HANDHELD_GOODS/text.txt L47） */}
                    <Design19Section>
                        <p className="text-[16px]! font-medium leading-6 text-foreground!">手持商品</p>
                        <p className="mt-1 text-[12px]! leading-5 text-muted-foreground!">快速生成手持商品图，快速上架</p>
                    </Design19Section>
                    {/* 1. 商品图上传（原站 268x306 浅灰上传面板） */}
                    <Design19Section>
                        <div className="mb-1 flex items-center gap-2">
                            <ImageRulesPopover kind="goods" testId="handheld-rules" />
                            <span className="text-[12px] leading-[18px] text-muted-foreground">选择参考图</span>
                        </div>
                        <Design19FieldLabel>上传商品图</Design19FieldLabel>
                        <p className="mb-1 text-[11px] leading-4 text-muted-foreground">第一步：选择示例图或上传手持商品图</p>
                        <ToolAssetInput
                            toolId={HANDHELD_GOODS_TOOL_ID}
                            constraints={SOURCE_CONSTRAINTS}
                            maxCount={1}
                            disabled={running}
                            variant="linkfox"
                            wide
                            compact
                            thirdAction={null}
                            library={library}
                            title=""
                            hint="10M以内，384*384 ~ 4096*4096"
                            syncIds={productSyncIds}
                            onChange={(assetIds, records) => {
                                const record = records[0] ?? null;
                                setProduct(record);
                                setProductSyncIds(assetIds.length ? assetIds : undefined);
                                if (assetIds.length) setNotice(null);
                            }}
                        />
                    </Design19Section>

                    {/* 2. 手持姿势（部位页签 + 姿势库）：切页签只换姿势候选，不动商品图（规格 §3） */}
                    <Design19Section>
                        <div className="mb-[6px] flex h-[22px] items-center justify-between gap-2">
                            <span className="text-[14px] leading-[22px] text-foreground">选择手持姿势</span>
                            <span className="truncate text-[12px] leading-[22px] text-muted-foreground">手持的部位与姿势参考</span>
                        </div>
                        <Design19ChipGroup>
                            {HANDHELD_GOODS_HAND_TABS.map((tab) => (
                                <Design19Chip
                                    key={tab.id}
                                    selected={tab.id === state.modelTabType}
                                    disabled={running}
                                    onClick={() =>
                                        setState((previous) => switchHandheldGoodsHandTab(previous, tab.id).state)
                                    }
                                >
                                    {tab.label}
                                </Design19Chip>
                            ))}
                        </Design19ChipGroup>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">或试试这些</p>
                        <div className="mt-[6px] flex gap-[10px] overflow-x-auto pb-1">
                            {poses.map((pose) => {
                                const selected = pose.id === state.modelId;
                                return (
                                    <button
                                        key={pose.id}
                                        type="button"
                                        aria-pressed={selected}
                                        disabled={running}
                                        onClick={() =>
                                            setState((previous) => ({
                                                ...previous,
                                                modelId: pose.id,
                                                modelTabType: pose.hand,
                                            }))
                                        }
                                        className={cn(
                                            "flex w-[72px] shrink-0 flex-col gap-1 overflow-hidden rounded-lg border p-1 text-left transition",
                                            selected
                                                ? "border-primary bg-primary/10"
                                                : "border-border bg-card hover:border-primary/50",
                                        )}
                                    >
                                        <img
                                            src={handheldGoodsPoseReferenceUrl(pose)}
                                            alt={`${pose.label} 示意图`}
                                            width={72}
                                            height={72}
                                            className="h-[72px] w-full rounded-md bg-card object-contain"
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </Design19Section>

                    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">我是高手，不再提醒</p>

                    {/* 3. 场景类型页签 + 检测类型（绑定 sceneTabType / checkType，切页签不重置商品图与姿势） */}
                    <Design19Section>
                        <Design19FieldLabel>场景类型</Design19FieldLabel>
                        <Design19ChipGroup>
                            {HANDHELD_GOODS_SCENE_TABS.map((tab) => (
                                <Design19Chip
                                    key={tab.id}
                                    selected={tab.id === state.sceneTabType}
                                    disabled={running}
                                    onClick={() => setState((previous) => switchHandheldGoodsSceneTab(previous, tab.id))}
                                >
                                    {tab.label}
                                </Design19Chip>
                            ))}
                        </Design19ChipGroup>
                        <p className="mb-[6px] mt-2 text-xs leading-[22px] text-muted-foreground">检测类型</p>
                        <Design19ChipGroup>
                            {HANDHELD_GOODS_CHECK_TYPES.map((option) => (
                                <Design19Chip
                                    key={option.id}
                                    selected={option.id === state.checkType}
                                    disabled={running}
                                    onClick={() => setState((previous) => ({ ...previous, checkType: option.id }))}
                                >
                                    {option.label}
                                </Design19Chip>
                            ))}
                        </Design19ChipGroup>
                    </Design19Section>

                    {/* 4. 生成张数（原站 margin-top 20 + 12px 标题 + 40x26 chip） */}
                    <Design19Section className="mt-[8px]">
                        <Design19FieldLabel>选择生成张数</Design19FieldLabel>
                        <Design19ChipGroup>
                            {HANDHELD_GOODS_OUTPUT_OPTIONS.map((num) => (
                                <Design19Chip
                                    key={num}
                                    selected={num === state.outputNum}
                                    disabled={running}
                                    onClick={() => setState((previous) => ({ ...previous, outputNum: num }))}
                                >
                                    {num}
                                </Design19Chip>
                            ))}
                        </Design19ChipGroup>
                        <p className="mt-[6px] text-[12px] leading-[18px] text-muted-foreground">
                            {handheldGoodsOutputLabel(state.outputNum)}；每张单独发一次真实请求（并发生效上限 2），失败张可单独重试。
                        </p>
                        {issues.length ? (
                            <ul className="mt-2 space-y-1 text-[12px] leading-[18px] text-[#d46b08]">
                                {issues.map((issue) => (
                                    <li key={`${issue.code}-${issue.field}`}>· {issue.message}</li>
                                ))}
                            </ul>
                        ) : null}
                    </Design19Section>
                    </div>
                        <div className="shrink-0 border-t border-border pt-2">
                        <Design19PrimaryButton
                            data-testid="handheld-submit"
                            onClick={() => void submit()}
                            disabled={submitDisabled}
                            title={issues[0]?.message}
                        >
                            <span>{running ? "生成中…" : "立即生成"}</span>
                        </Design19PrimaryButton>
                        </div>
                    </div>
                )}
            >
                <section data-region="results" className="flex min-h-[480px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-card">
                <Design19Results
                    tabs={[{ id: "result", label: "生成结果" }]}
                    active={rightTab}
                    onTabChange={(id) => setRightTab(id === "history" ? "history" : "result")}
                    extraTab={{ id: "history", label: "历史记录" }}
                >
                    <div role="tabpanel" hidden={rightTab !== "result"} data-testid="handheld-panel-result" className="flex min-h-full flex-col px-3 py-3">
                        {view.status !== "idle" ? (
                            <p className="mb-2 text-[12px] leading-[18px] text-muted-foreground">{handheldGoodsStatusText(view)}</p>
                        ) : null}
                        {stale ? (
                            <p className="mb-2 rounded-md bg-card px-2 py-1 text-[12px] leading-[18px] text-muted-foreground">
                                配置已修改，下面的结果来自旧版本（快照指纹不同）。
                            </p>
                        ) : null}

                        {appliedFields ? (
                            <p className="mb-2 text-[12px] leading-[18px] text-muted-foreground">
                                已回填输出字段：imageResultUrl / targetResultUrl
                            </p>
                        ) : null}

                        {view.items.length ? (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                                {view.items.map((item) => (
                                    <figure key={item.index} className="overflow-hidden rounded-lg border border-border">
                                        <div className="flex aspect-square items-center justify-center bg-card">
                                            {item.url ? (
                                                <img src={item.url} alt={`第 ${item.index + 1} 张结果`} className="size-full object-contain" />
                                            ) : (
                                                <span className="px-2 text-center text-[12px] leading-[18px] text-muted-foreground">
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
                                        <figcaption className="flex items-center justify-between gap-1 px-2 py-1 text-[12px] leading-[18px] text-muted-foreground">
                                            <span>第 {item.index + 1} 张</span>
                                            {item.status === "failed" ? (
                                                <button
                                                    type="button"
                                                    disabled={running || retrying !== null}
                                                    onClick={() => {
                                                        const run = runs.find((candidate) => candidate.index === item.index);
                                                        if (run) void retryOne(run);
                                                    }}
                                                    className="rounded-md border border-border px-1.5 py-0.5 transition hover:bg-primary/10 disabled:opacity-50"
                                                >
                                                    {retrying === item.index ? "重试中…" : "重试"}
                                                </button>
                                            ) : null}
                                        </figcaption>
                                    </figure>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <Design19Empty title="暂无生成结果图" hint="快在左侧上传商品图并选择手持姿势吧~" />
                                <button
                                    type="button"
                                    data-testid="handheld-apply-case"
                                    onClick={applyShowcaseCase}
                                    className="rounded-lg border border-border px-4 py-2 text-[12px] leading-[18px] transition hover:bg-primary/10"
                                >
                                    一键做同款
                                </button>
                                {cropEntryVisible ? (
                                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                                        <button
                                            type="button"
                                            data-testid="handheld-crop-original"
                                            onClick={() => setCropDialogOpen(true)}
                                            className="text-[12px] leading-[18px] text-primary underline underline-offset-2 transition hover:opacity-80"
                                        >
                                            点击这里裁剪原图尺寸
                                        </button>
                                        <button
                                            type="button"
                                            data-testid="handheld-erase-original"
                                            onClick={() => void openEdit("erase")}
                                            className="text-[12px] leading-[18px] text-primary underline underline-offset-2 transition hover:opacity-80"
                                        >
                                            点击这里消除原图瑕疵
                                        </button>
                                        <button
                                            type="button"
                                            data-testid="handheld-cutout-original"
                                            onClick={() => void openEdit("cutout")}
                                            className="text-[12px] leading-[18px] text-primary underline underline-offset-2 transition hover:opacity-80"
                                        >
                                            点击这里继续抠图
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {running ? (
                            <button
                                type="button"
                                onClick={cancel}
                                className="mt-3 self-start rounded-lg border border-border px-3 py-1 text-[12px] leading-[18px] transition hover:bg-card"
                            >
                                取消本次生成
                            </button>
                        ) : null}

                        {lastTask || panelTask ? (
                            <div
                                className="mt-4"
                                data-testid="handheld-result-panel"
                                data-tool-id={HANDHELD_GOODS_TOOL_ID}
                                data-task-id={(lastTask ?? panelTask)!.id}
                                data-task-status={(lastTask ?? panelTask)!.status}
                            >
                                <ToolResult
                                    task={(lastTask ?? panelTask)!}
                                    toolId={HANDHELD_GOODS_TOOL_ID}
                                    title="最近一次上游返回"
                                />
                            </div>
                        ) : null}

                    </div>

                    <div role="tabpanel" hidden={rightTab !== "history"} data-testid="handheld-panel-history" className="min-h-full px-3 py-3">
                        <ToolTaskHistory toolId={HANDHELD_GOODS_TOOL_ID} limit={8} emptyHint="还没有手持商品任务记录" />
                    </div>
                </Design19Results>
                </section>
            </ToolWorkspaceColumns>

            <CropOriginalDialog
                open={cropDialogOpen}
                src={product?.url ?? null}
                onClose={() => setCropDialogOpen(false)}
                onCropped={handleCropped}
            />

            <ProductImageEditDialog
                open={editMode !== null}
                mode={editMode ?? "erase"}
                source={editSource}
                onClose={() => setEditMode(null)}
                onApply={handleEdited}
            />
        </div>
    );
}


export default HandheldGoodsWorkspace;
