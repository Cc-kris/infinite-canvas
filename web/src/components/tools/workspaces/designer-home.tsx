import { useMemo, useState, type DragEvent } from "react";
import { Brush, House, LayoutTemplate, Loader2, Search, Upload, Users } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 商品图设计器首页（原站 `/draw/designer-home`）。
 * 模板图取自原站「模板推荐」首屏前 40 个（512 宽带原站水印），类型/品类按原站筛选结果逐个记录，版式按宽高比判定；
 * 原站模板列表接口返回体加密，没有名称字段，所以搜索只匹配类型/品类/版式标签。
 */

const CASE_DIR = "/__cases/new-designer";
const TYPES = ["卖点图", "场景图", "尺寸图", "细节图", "白底图"];
const CATEGORIES = ["日用百货", "家居家装", "服饰箱包", "美妆个护", "家用电器", "玩具类目", "儿童 & 母婴", "3C数码", "办公用品"];
const LAYOUTS = ["方形", "横版", "竖版"];
const NAV = [
    { label: "创建设计", icon: House },
    { label: "我的设计", icon: Brush },
    { label: "我的模板", icon: LayoutTemplate },
    { label: "团队空间", icon: Users },
];

/** [原站图片 id, 宽, 高, 类型, 适合品类] */
const RAW_TEMPLATES: Array<[string, number, number, string, string[]]> = [
    ["e43eac94361f", 512, 687, "卖点图", ["服饰箱包"]],
    ["f6dab832e3b9", 512, 564, "卖点图", ["服饰箱包"]],
    ["e217b11d7f4d", 768, 512, "卖点图", ["美妆个护"]],
    ["fee73da60bfb", 768, 512, "场景图", ["服饰箱包"]],
    ["010ddbd23614", 978, 512, "场景图", ["美妆个护"]],
    ["59b857bd8f9f", 512, 683, "场景图", ["服饰箱包"]],
    ["d256299979f3", 512, 683, "场景图", ["美妆个护"]],
    ["758ebabaee14", 978, 512, "场景图", []],
    ["f199df3c634d", 512, 512, "卖点图", ["服饰箱包"]],
    ["eb5b3b61f4c3", 512, 512, "卖点图", ["美妆个护"]],
    ["f132c4cd1755", 512, 512, "场景图", ["美妆个护"]],
    ["ec2768e1069a", 512, 686, "卖点图", []],
    ["f736c2e78c8f", 512, 512, "场景图", ["家用电器"]],
    ["e899bb6616d5", 512, 512, "卖点图", ["美妆个护"]],
    ["7d2db182c3ff", 512, 683, "场景图", ["美妆个护"]],
    ["254b9599d6fa", 512, 683, "场景图", []],
    ["bfc39f5adb62", 512, 683, "卖点图", ["日用百货"]],
    ["af6ea0c9cd7b", 512, 512, "卖点图", []],
    ["6311692460f6", 978, 512, "卖点图", ["家用电器"]],
    ["53af9963e478", 512, 683, "场景图", []],
    ["640a15d91028", 978, 512, "卖点图", ["服饰箱包"]],
    ["763c83a78f49", 512, 512, "卖点图", ["儿童 & 母婴", "3C数码", "办公用品"]],
    ["9466d67d561f", 823, 512, "场景图", []],
    ["78de5fe3f7a8", 823, 512, "场景图", ["服饰箱包"]],
    ["c35be7a1b9b5", 512, 683, "卖点图", ["日用百货"]],
    ["f2af6c44a1b1", 512, 512, "卖点图", ["美妆个护"]],
    ["f0e2d4865607", 512, 683, "场景图", ["美妆个护"]],
    ["818d5ac197f1", 512, 683, "场景图", ["服饰箱包"]],
    ["a2f98703956c", 512, 512, "场景图", ["服饰箱包"]],
    ["f0aee4191654", 512, 512, "场景图", []],
    ["933254f46105", 512, 512, "细节图", []],
    ["40f042c4b39a", 512, 512, "场景图", ["玩具类目"]],
    ["1a1dc6e950cf", 512, 512, "尺寸图", []],
    ["3888ccbfb7f7", 512, 512, "白底图", ["玩具类目"]],
    ["915331ea3d6d", 512, 640, "场景图", ["日用百货"]],
    ["ccf4f4770b51", 512, 512, "尺寸图", []],
    ["fbc8b23823ef", 512, 640, "卖点图", ["家用电器"]],
    ["2de915c3a1e4", 512, 512, "尺寸图", []],
    ["a5925c1c92cd", 512, 512, "卖点图", ["日用百货"]],
    ["f3500fec2bc3", 512, 512, "卖点图", ["日用百货"]],
];

export type DesignerHomeTemplate = { id: string; src: string; width: number; height: number; type: string; categories: string[]; layout: string };

/** 新文档尺寸：保持模板宽高比，长边 1024（原站默认画布 1024×1024）。 */
export const DESIGNER_HOME_TEMPLATES: DesignerHomeTemplate[] = RAW_TEMPLATES.map(([id, w, h, type, categories]) => {
    const scale = 1024 / Math.max(w, h);
    return { id, src: `${CASE_DIR}/templates/${id}.webp`, width: Math.round(w * scale), height: Math.round(h * scale), type, categories, layout: w === h ? "方形" : w > h ? "横版" : "竖版" };
});

const EXAMPLES = [1, 2, 3, 4, 5, 6].map((index) => `${CASE_DIR}/examples/product-${index}.webp`);
const COLUMNS = 6;

export type DesignerHomeProps = {
    busy?: boolean;
    note?: string;
    /** 本地唯一草稿的概要；没有草稿时为 null。 */
    draft: { layers: number; width: number; height: number } | null;
    onUpload: (file: File) => void;
    onTemplate: (template: DesignerHomeTemplate) => void;
    onResume: () => void;
};
export function DesignerHome({ busy, note, draft, onUpload, onTemplate, onResume }: DesignerHomeProps) {
    const [tab, setTab] = useState(NAV[0].label);
    const [type, setType] = useState("全部");
    const [category, setCategory] = useState("全部");
    const [layout, setLayout] = useState("全部");
    const [keyword, setKeyword] = useState("");
    const [dragging, setDragging] = useState(false);

    /** 瀑布流：按原站规则把每个模板放进当前最矮的一列（列等宽，所以按宽高比累计高度）。 */
    const columns = useMemo(() => {
        const word = keyword.trim();
        const list = DESIGNER_HOME_TEMPLATES.filter(
            (item) =>
                (type === "全部" || item.type === type) &&
                (category === "全部" || item.categories.includes(category)) &&
                (layout === "全部" || item.layout === layout) &&
                (!word || [item.type, item.layout, ...item.categories].some((tag) => tag.includes(word))),
        );
        const cols = Array.from({ length: COLUMNS }, () => ({ height: 0, items: [] as DesignerHomeTemplate[] }));
        for (const item of list) {
            const target = cols.reduce((low, col) => (col.height < low.height ? col : low), cols[0]);
            target.items.push(item);
            target.height += item.height / item.width;
        }
        return { cols, count: list.length };
    }, [category, keyword, layout, type]);

    const pickExample = async (src: string, index: number) => {
        const blob = await (await fetch(src)).blob();
        onUpload(new File([blob], `示例商品-${index + 1}.webp`, { type: blob.type || "image/webp" }));
    };

    const onDrop = (event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onUpload(file);
    };

    const filters = [
        { label: "类型", value: type, set: setType, options: TYPES },
        { label: "适合品类", value: category, set: setCategory, options: CATEGORIES },
        { label: "版式", value: layout, set: setLayout, options: LAYOUTS },
    ];

    return (
        <div className="flex h-full min-h-0 bg-[#f5f7fa]" data-testid="designer-home">
            <nav aria-label="设计入口" className="flex w-[180px] shrink-0 flex-col bg-white pt-0" data-testid="designer-home-tabs">
                {NAV.map(({ label, icon: Icon }, index) => (
                    <div key={label}>
                        {index === 3 ? <div className="my-2 h-px bg-black/[0.06]" /> : null}
                        <button
                            type="button"
                            role="tab"
                            aria-selected={tab === label}
                            onClick={() => setTab(label)}
                            className={cn(
                                "flex h-10 w-full items-center gap-[10px] pl-[18px] pr-3 text-left text-[16px]",
                                tab === label ? "bg-[rgba(141,52,249,0.05)] text-[#723cf9]! shadow-[inset_3px_0_0_#723cf9]" : "text-black/60! hover:bg-black/[0.03]",
                            )}
                        >
                            <Icon className="size-4" strokeWidth={1.6} />
                            {label}
                        </button>
                    </div>
                ))}
            </nav>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-[10px]">
                {tab === "创建设计" ? (
                    <>
                        <section className="flex h-[240px] gap-10 rounded-[8px] bg-white px-5 py-4">
                            <label
                                data-testid="designer-home-upload"
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={onDrop}
                                className={cn("flex min-w-0 flex-1 cursor-pointer flex-col items-center rounded-[8px] border border-dashed px-4 pt-[20px]", dragging ? "border-[#723cf9] bg-[#723cf9]/[0.03]" : "border-[#d9d9d9] hover:border-[#723cf9]")}
                            >
                                <span className="inline-flex h-8 items-center gap-2 rounded-[6px] bg-[linear-gradient(90deg,#3a7df9,#723cf9)] px-[15px] text-[14px] text-white">
                                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                    上传商品图
                                </span>
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) onUpload(file);
                                }} />
                                <div className="mt-[10px] text-[12px] leading-[19px] text-black/60">或拖拽图片到此处</div>
                                {note ? <div className="text-[12px] text-[#ff4d4f]">{note}</div> : null}
                                <div className="mt-[10px] flex items-center gap-2 text-[12px] leading-[19px] text-black/30">
                                    <span className="h-px w-10 bg-black/10" />
                                    或试试这些
                                    <span className="h-px w-10 bg-black/10" />
                                </div>
                                <span className="mt-[10px] flex gap-[10px]">
                                    {EXAMPLES.map((src, index) => (
                                        <button
                                            key={src}
                                            type="button"
                                            title="用这张示例商品图开始设计"
                                            disabled={busy}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                void pickExample(src, index);
                                            }}
                                            className="size-[60px] overflow-hidden rounded-[4px] border border-black/[0.06] bg-white hover:border-[#723cf9]"
                                        >
                                            <img src={src} alt={`示例商品 ${index + 1}`} className="size-full object-cover" />
                                        </button>
                                    ))}
                                </span>
                            </label>
                            <video src={`${CASE_DIR}/guide-ai-designer.mp4`} className="h-[208px] w-[370px] shrink-0 object-contain" autoPlay muted loop playsInline aria-label="商品图设计器演示：场景图、功能对比图" />
                        </section>

                        <section className="mt-[10px] rounded-[8px] bg-white">
                            <header className="flex h-14 items-center gap-6 border-b border-black/[0.08] px-4">
                                <h3 className="mr-auto text-[14px] font-semibold text-[#202020]">模板推荐</h3>
                                {filters.map((filter) => (
                                    <label key={filter.label} className="flex items-center gap-1 text-[14px] text-black/60">
                                        {filter.label}：
                                        <select
                                            value={filter.value}
                                            onChange={(event) => filter.set(event.target.value)}
                                            className="h-[30px] cursor-pointer rounded-[4px] bg-transparent pr-1 text-[14px] text-black/[0.88] outline-none hover:bg-black/[0.04]"
                                        >
                                            {["全部", ...filter.options].map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                                <span className="flex h-[27px] w-[202px] items-center gap-1.5 rounded-[4px] bg-black/[0.04] px-[7px]">
                                    <Search className="size-3.5 text-black/60" />
                                    <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索关键词" title="按类型 / 品类 / 版式标签搜索" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-black/30" />
                                </span>
                            </header>
                            <div className="flex gap-[10px] p-4" data-testid="designer-home-templates">
                                {columns.count ? (
                                    columns.cols.map((col, index) => (
                                        <div key={index} className="flex min-w-0 flex-1 flex-col gap-[10px]">
                                            {col.items.map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => onTemplate(item)}
                                                    aria-label={`以此模版创建新设计（${item.type} · ${item.width}×${item.height}）`}
                                                    className="group relative overflow-hidden rounded-[6px]"
                                                    style={{ aspectRatio: `${item.width} / ${item.height}` }}
                                                >
                                                    <img src={item.src} alt="" loading="lazy" className="size-full object-cover" />
                                                    <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-[14px] text-white group-hover:flex">以此模版创建新设计</span>
                                                </button>
                                            ))}
                                        </div>
                                    ))
                                ) : (
                                    <div className="w-full py-16 text-center text-[14px] text-black/45">暂无符合条件的模板</div>
                                )}
                            </div>
                        </section>
                    </>
                ) : (
                    <section className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-[8px] bg-white text-[14px] text-black/45" data-testid="designer-home-empty">
                        {tab === "我的设计" && draft ? (
                            <>
                                <div>本地草稿：{draft.layers} 个图层 · {draft.width}×{draft.height}（只保存在当前浏览器）</div>
                                <button type="button" onClick={onResume} className="h-8 rounded-[6px] bg-[linear-gradient(90deg,#3a7df9,#723cf9)] px-4 text-white!">
                                    继续编辑
                                </button>
                            </>
                        ) : (
                            <div>{tab === "我的设计" ? "暂无设计" : tab === "我的模板" ? "暂无模板，本地模式不支持保存自定义模板" : "暂无团队空间，本地模式不支持多人协作"}</div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
