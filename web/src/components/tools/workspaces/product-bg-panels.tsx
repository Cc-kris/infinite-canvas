import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Copy, Lightbulb, Plus, Search, X } from "lucide-react";

import { uploadCaseFile } from "@/features/tools/case-apply";
import { cn } from "@/lib/utils";
import { adoptLibraryAsset, toolAssetLibraryItemsFromAssets, uploadToolAsset, type ToolAssetConstraints, type ToolAssetRecord } from "@/services/api/tools/assets";
import { useAssetStore } from "@/stores/use-asset-store";
import { useToolTaskStore } from "@/stores/use-tool-task-store";
import { NEW_REPLACE_BG_V2_TOOL_ID } from "@/features/tools/registry/new-replace-bg-v2";
import {
    DEFAULT_PRODUCT_BG_PRESET_CATEGORY,
    PRODUCT_BG_CATEGORIES,
    PRODUCT_BG_DRAWER_TABS,
    PRODUCT_BG_PRESET_CATEGORIES,
    PRODUCT_BG_PRESET_SCENES,
    PRODUCT_BG_PRESET_VIEWS,
    PRODUCT_BG_SCENE_FILTERS,
    PRODUCT_BG_SORTS,
    filterProductBgPresets,
    filterProductBgScenes,
    type ProductBgDrawerTab,
    type ProductBgScene,
} from "@/features/tools/registry/new-replace-bg-v2-scenes";

/** 选中一张参考图：load 负责真实入库，id 用于高亮，title 写进 customPrompt。 */
export type PickReference = (load: () => Promise<ToolAssetRecord>, id: string, title: string) => void;

export const CHECKER = "[background-image:linear-gradient(45deg,#e5e5e5_25%,transparent_25%,transparent_75%,#e5e5e5_75%),linear-gradient(45deg,#e5e5e5_25%,transparent_25%,transparent_75%,#e5e5e5_75%)] [background-position:0_0,8px_8px] [background-size:16px_16px] bg-white";
const CHIP = "rounded-[4px] border px-[8px] py-[3px] text-[12px]";
const CHIP_ON = "border-selected bg-selected-soft text-foreground";
const CHIP_OFF = "border-transparent bg-foreground/[0.04] text-foreground/70 hover:text-foreground";

/** 场景卡：原站 12px 圆角，左下商品示意小图，hover 描边 +「使用此场景」，标题在卡下。 */
export function SceneCard({ scene, active, onPick, testId }: { scene: ProductBgScene; active?: boolean; onPick: (scene: ProductBgScene) => void; testId: string }) {
    return (
        <button type="button" data-testid={testId} aria-pressed={active} onClick={() => onPick(scene)} className="group min-w-0 text-left">
            <span className={cn("relative block aspect-square overflow-hidden rounded-[12px] border-2 transition", active ? "border-selected" : "border-transparent group-hover:border-selected")}>
                <img src={scene.image} alt={scene.title} loading="lazy" className="size-full object-cover" />
                <img src={scene.goods} alt="" loading="lazy" className="absolute bottom-[10px] left-[10px] size-[28%] rounded-[6px] border-2 border-white bg-white object-contain" />
                <span className="absolute left-[8px] top-[8px] hidden items-center gap-1 rounded-[4px] bg-white px-[6px] py-[2px] text-[12px] text-black/85 group-hover:flex">
                    <Copy className="size-3" />
                    使用此场景
                </span>
            </span>
            <span className="mt-[6px] block truncate text-center text-[14px] leading-[22px] text-foreground/70">{scene.title}</span>
        </button>
    );
}

/** 抽屉外壳：原站浮在画布之上（不挤压画布），顶部页签 + 关闭。 */
function DrawerShell<T extends string>({ testId, tabs, tab, onTab, onClose, children }: { testId: string; tabs: readonly T[]; tab: T; onTab: (tab: T) => void; onClose: () => void; children: ReactNode }) {
    return (
        <aside data-testid={testId} className="absolute bottom-0 left-0 top-0 z-20 flex w-[600px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-r-[10px] border-r border-border bg-background shadow-[4px_0_16px_rgba(0,0,0,0.08)]">
            <div className="flex h-[44px] shrink-0 items-center gap-[16px] border-b border-border px-[14px]">
                {tabs.map((item) => (
                    <button key={item} type="button" data-testid={`${testId}-tab-${item}`} aria-pressed={tab === item} onClick={() => onTab(item)} className={cn("h-full border-b-2 text-[14px]", tab === item ? "border-foreground font-medium text-foreground" : "border-transparent text-foreground/70 hover:text-foreground")}>
                        {item}
                    </button>
                ))}
                <span className="flex-1" />
                <button type="button" aria-label="关闭" onClick={onClose} className="text-muted-foreground hover:text-foreground">
                    <X className="size-4" />
                </button>
            </div>
            {children}
        </aside>
    );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-[6px] px-[24px] py-[40px] text-center">
            <p className="text-[14px] font-medium text-foreground">{title}</p>
            {hint ? <p className="text-[12px] leading-[20px] text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

function UploadCard({ label, testId, disabled, constraints, onRecord }: { label: string; testId: string; disabled?: boolean; constraints: ToolAssetConstraints; onRecord: (record: ToolAssetRecord) => void }) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [error, setError] = useState("");
    return (
        <div className="flex flex-col">
            <button type="button" data-testid={testId} disabled={disabled} onClick={() => inputRef.current?.click()} className="flex aspect-square w-full items-center justify-center gap-[4px] rounded-[6px] border border-dashed border-border text-[13px] text-foreground/70 hover:border-selected hover:text-foreground disabled:opacity-50">
                <Plus className="size-[14px]" />
                {label}
            </button>
            <input
                ref={inputRef}
                type="file"
                accept={constraints.mimeTypes.join(",")}
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setError("");
                    uploadToolAsset(file, { constraints }).then(onRecord, (issue: unknown) => setError(issue instanceof Error ? issue.message : "上传失败"));
                }}
            />
            {error ? <p className="mt-[4px] text-[11px] text-destructive">{error}</p> : null}
        </div>
    );
}

/** 「我的 / 素材库」：本地作品库（useAssetStore）里的图片，选中后复用同一份字节入工具资产。 */
function LibraryGrid({ cols, onRecord, lead, empty }: { cols: string; onRecord: (record: ToolAssetRecord, id: string, title: string) => void; lead?: ReactNode; empty: ReactNode }) {
    const assets = useAssetStore((state) => state.assets);
    const images = useMemo(() => assets.filter((asset) => asset.kind === "image"), [assets]);
    const [error, setError] = useState("");
    const pick = async (asset: (typeof images)[number]) => {
        if (asset.kind !== "image") return;
        const [item] = toolAssetLibraryItemsFromAssets([{ id: asset.id, kind: asset.kind, title: asset.title, coverUrl: asset.coverUrl, data: { url: asset.data.dataUrl, storageKey: asset.data.storageKey, bytes: asset.data.bytes, mimeType: asset.data.mimeType, width: asset.data.width, height: asset.data.height } }]);
        try {
            setError("");
            onRecord(await adoptLibraryAsset(item), `library-${asset.id}`, asset.title || "我的素材");
        } catch (issue) {
            setError(issue instanceof Error ? issue.message : "素材读取失败");
        }
    };
    if (!images.length && !lead) return <>{empty}</>;
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-[14px]">
            {error ? <p className="mb-[8px] text-[12px] text-destructive">{error}</p> : null}
            <div className={cn("grid gap-[10px]", cols)}>
                {lead}
                {images.map((asset) => (
                    <button key={asset.id} type="button" data-testid={`scene-library-${asset.id}`} title={asset.title} onClick={() => void pick(asset)} className={cn("aspect-square overflow-hidden rounded-[6px] border border-transparent hover:border-selected", CHECKER)}>
                        <img src={asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "")} alt={asset.title} loading="lazy" className="size-full object-contain" />
                    </button>
                ))}
            </div>
            {!images.length ? empty : null}
        </div>
    );
}

/** 「历史」：本工具真实任务历史里的成功结果图。 */
function HistoryGrid({ onPick }: { onPick: PickReference }) {
    const tasks = useToolTaskStore((state) => state.tasks);
    const hydrated = useToolTaskStore((state) => state.hydrated);
    const hydrate = useToolTaskStore((state) => state.hydrate);
    useEffect(() => {
        if (!hydrated) hydrate();
    }, [hydrated, hydrate]);
    const items = useMemo(
        () =>
            Object.values(tasks)
                .filter((task) => task.toolId === NEW_REPLACE_BG_V2_TOOL_ID && task.status === "succeeded")
                .sort((left, right) => right.createdAt - left.createdAt)
                .flatMap((task) => (task.result?.items ?? []).filter((item) => item.kind === "image" && (item.url || item.dataUrl)).map((item) => ({ id: `${task.id}-${item.id}`, src: (item.url || item.dataUrl)! }))),
        [tasks],
    );
    return (
        <>
            <p className="mx-[14px] mt-[10px] flex shrink-0 items-center gap-[4px] self-end rounded-[4px] bg-selected-soft px-[8px] py-[3px] text-[12px] text-foreground/70">
                <Lightbulb className="size-[14px] text-amber-500" />
                选择没有过多主体的场景图，效果更佳!
            </p>
            {items.length ? (
                <div className="grid min-h-0 flex-1 grid-cols-5 content-start gap-[10px] overflow-y-auto p-[14px]">
                    {items.map((item) => (
                        <button key={item.id} type="button" data-testid={`scene-history-${item.id}`} onClick={() => onPick(() => uploadCaseFile(item.src, `linkfox-history-${item.id}`), `history-${item.id}`, "历史作图")} className="aspect-square overflow-hidden rounded-[6px] border border-transparent hover:border-selected">
                            <img src={item.src} alt="历史作图" loading="lazy" className="size-full object-cover" />
                        </button>
                    ))}
                </div>
            ) : (
                <p className="py-[24px] text-center text-[12px] text-muted-foreground">没有更多数据了</p>
            )}
        </>
    );
}

function Select({ label, options, value, onChange, disabled }: { label: string; options: readonly string[]; value: string; onChange?: (value: string) => void; disabled?: boolean }) {
    return (
        <label className="flex items-center gap-[6px] text-[12px] text-muted-foreground" title={disabled ? "本地预设图没有该维度的标注，仅支持「全部」" : undefined}>
            {label}
            <select value={value} disabled={disabled} onChange={(event) => onChange?.(event.target.value)} className="h-[26px] rounded-[4px] bg-transparent px-[4px] text-[12px] text-foreground outline-none hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60">
                {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </label>
    );
}

/** 编辑器参考图抽屉：智能推荐 / 预设 / 我的 / 收藏 / 历史 / 采集（原站顺序）。 */
export function ReferenceDrawer({ activeId, constraints, onPick, onClose }: { activeId: string; constraints: ToolAssetConstraints; onPick: PickReference; onClose: () => void }) {
    const [tab, setTab] = useState<ProductBgDrawerTab>("智能推荐");
    const [category, setCategory] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [folded, setFolded] = useState(false);
    const [presetCategory, setPresetCategory] = useState<string>(DEFAULT_PRODUCT_BG_PRESET_CATEGORY);
    const scenes = useMemo(() => filterProductBgScenes(category, query), [category, query]);
    const presets = useMemo(() => filterProductBgPresets(presetCategory), [presetCategory]);
    const pickScene = (scene: ProductBgScene) => onPick(() => uploadCaseFile(scene.image, `linkfox-scene-${scene.id}-background`), scene.id, scene.title);

    return (
        <DrawerShell testId="scene-drawer" tabs={PRODUCT_BG_DRAWER_TABS} tab={tab} onTab={setTab} onClose={onClose}>
            {tab === "智能推荐" ? (
                <>
                    <div className="shrink-0 space-y-[10px] border-b border-border px-[14px] py-[10px] text-[12px]">
                        <div className="flex items-center gap-[6px]">
                            <span className="w-[40px] shrink-0 text-muted-foreground">排序：</span>
                            {PRODUCT_BG_SORTS.map((label, index) => (
                                <span key={label} aria-disabled={index > 0} title={index > 0 ? "本地没有收藏 / 热度数据，仅按原站推荐顺序展示" : undefined} className={cn(CHIP, index === 0 ? CHIP_ON : "cursor-not-allowed border-transparent bg-foreground/[0.04] text-muted-foreground")}>
                                    {label}
                                </span>
                            ))}
                            <label className="ml-[4px] flex h-[26px] min-w-0 flex-1 items-center gap-[4px] rounded-[4px] bg-foreground/[0.04] px-[8px]">
                                <Search className="size-[12px] shrink-0 text-muted-foreground" />
                                <input data-testid="scene-drawer-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标签关键词" className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
                            </label>
                        </div>
                        {folded ? null : (
                            <>
                                <div className="flex gap-[6px]">
                                    <span className="w-[40px] shrink-0 pt-[3px] text-muted-foreground">商品：</span>
                                    <div className="flex flex-wrap gap-[6px]">
                                        {[null, ...PRODUCT_BG_CATEGORIES].map((label) => (
                                            <button key={label ?? "all"} type="button" aria-pressed={category === label} onClick={() => setCategory(label)} className={cn(CHIP, category === label ? CHIP_ON : CHIP_OFF)}>
                                                {label ?? "全部"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-[6px]">
                                    <span className="w-[40px] shrink-0 pt-[3px] text-muted-foreground">场景：</span>
                                    <div className="flex flex-wrap gap-[6px]">
                                        {PRODUCT_BG_SCENE_FILTERS.map((label, index) => (
                                            <span key={label} aria-disabled={index > 0} title={index > 0 ? "本地场景图没有室内 / 室外等属性标注，仅支持「全部」" : undefined} className={cn(CHIP, index === 0 ? CHIP_ON : "cursor-not-allowed border-transparent bg-foreground/[0.04] text-muted-foreground")}>
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        <div className="flex justify-center">
                            <button type="button" onClick={() => setFolded(!folded)} className="flex items-center gap-[2px] text-muted-foreground hover:text-foreground">
                                {folded ? "展开" : "收起"}
                                {folded ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
                            </button>
                        </div>
                    </div>
                    <p className="flex shrink-0 items-center gap-[4px] bg-canvas px-[14px] py-[8px] text-[12px] text-foreground/70">
                        <Lightbulb className="size-[14px] text-amber-500" />
                        建议：选择与您上传图片为同类商品，以达到最佳的效果！
                    </p>
                    <div className="grid min-h-0 flex-1 grid-cols-5 content-start gap-x-[10px] gap-y-[8px] overflow-y-auto bg-canvas p-[14px]">
                        {scenes.map((scene) => (
                            <SceneCard key={scene.id} scene={scene} active={activeId === scene.id} testId={`scene-drawer-${scene.id}`} onPick={pickScene} />
                        ))}
                        {scenes.length === 0 ? <p className="col-span-5 py-[24px] text-center text-[12px] text-muted-foreground">没有更多了</p> : null}
                    </div>
                </>
            ) : null}

            {tab === "预设" ? (
                <>
                    <div className="flex shrink-0 items-center gap-[20px] border-b border-border px-[14px] py-[8px]">
                        <Select label="品类：" options={PRODUCT_BG_PRESET_CATEGORIES} value={presetCategory} onChange={setPresetCategory} />
                        <Select label="场景：" options={PRODUCT_BG_PRESET_SCENES} value="全部" disabled />
                        <Select label="视角：" options={PRODUCT_BG_PRESET_VIEWS} value="全部" disabled />
                    </div>
                    <div className="grid min-h-0 flex-1 grid-cols-5 content-start gap-[10px] overflow-y-auto bg-canvas p-[14px]">
                        {presets.map((preset) => (
                            <button key={preset.id} type="button" data-testid={`scene-preset-${preset.id}`} aria-pressed={activeId === preset.id} onClick={() => onPick(() => uploadCaseFile(preset.image, `linkfox-${preset.id}-background`), preset.id, "预设背景")} className={cn("aspect-square overflow-hidden rounded-[6px] border-2", activeId === preset.id ? "border-selected" : "border-transparent hover:border-selected")}>
                                <img src={preset.image} alt="预设背景" loading="lazy" className="size-full object-cover" />
                            </button>
                        ))}
                    </div>
                </>
            ) : null}

            {tab === "我的" ? (
                <LibraryGrid
                    cols="grid-cols-5"
                    lead={<UploadCard label="上传参考图" testId="scene-drawer-upload" constraints={constraints} onRecord={(record) => onPick(async () => record, `upload-${record.id}`, "我的参考图")} />}
                    onRecord={(record, id, title) => onPick(async () => record, id, title)}
                    empty={null}
                />
            ) : null}

            {tab === "收藏" ? <Empty title="暂无收藏" hint="收藏依赖原站账号数据，本地版本没有收藏数据源。可在「我的」里上传参考图，或从作品库选择。" /> : null}
            {tab === "历史" ? <HistoryGrid onPick={onPick} /> : null}
            {tab === "采集" ? <Empty title="暂无素材图" hint="采集依赖原站浏览器插件把网页图片收集到素材库，本地版本没有接入采集插件。" /> : null}
        </DrawerShell>
    );
}

export type BoardAsset = { id: string; url: string; record: ToolAssetRecord };

/** 商品 / 元素抽屉：「商品素材 / 素材库」「我的元素 / 素材库」。 */
export function AssetDrawer({ kind, items, activeId, constraints, onRecord, onClose }: { kind: "goods" | "element"; items: BoardAsset[]; activeId?: string; constraints: ToolAssetConstraints; onRecord: (record: ToolAssetRecord) => void; onClose: () => void }) {
    const tabs = kind === "goods" ? (["商品素材", "素材库"] as const) : (["我的元素", "素材库"] as const);
    const [tab, setTab] = useState<string>(tabs[0]);
    const label = kind === "goods" ? "上传商品图" : "上传元素图";
    return (
        <DrawerShell testId={`scene-${kind}-drawer`} tabs={tabs as readonly string[]} tab={tab} onTab={setTab} onClose={onClose}>
            {tab === tabs[0] ? (
                <div className="grid min-h-0 flex-1 grid-cols-5 content-start gap-[10px] overflow-y-auto bg-canvas p-[14px]">
                    <UploadCard label={label} testId={`scene-${kind}-upload`} constraints={constraints} onRecord={onRecord} />
                    {items.map((item) => (
                        <button key={item.id} type="button" data-testid={`scene-${kind}-item-${item.id}`} aria-pressed={activeId === item.id} onClick={() => onRecord(item.record)} className={cn("aspect-square overflow-hidden rounded-[6px] border-2", CHECKER, activeId === item.id ? "border-selected" : "border-transparent hover:border-selected")}>
                            <img src={item.url} alt={label} className="size-full object-contain" />
                        </button>
                    ))}
                </div>
            ) : (
                <LibraryGrid cols="grid-cols-5" onRecord={(record) => onRecord(record)} empty={<Empty title="暂无素材图" hint="作品库里还没有图片。生成结果「存入作品库」后会出现在这里。" />} />
            )}
        </DrawerShell>
    );
}
