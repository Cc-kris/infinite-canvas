/**
 * MATERIAL_UPPER_BODY（上装换料）静态复刻面板。
 *
 * 依据：docs/V1.0/replica/frontend-1to1/MATERIAL_UPPER_BODY.md 的 A 清单（原站可见文案 76 条）。
 * 本轮只做「文案 1:1 对齐」，所有控件为只读展示（span / disabled 按钮），不接真实能力。
 * 注意：面板内不得出现 A 清单之外的文案，所有文本都必须是叶子节点。
 */

const FAMILY = ["商品套图", "服装套图", "爆款图复刻", "NEW", "套图换色", "批量翻译", "高清放大", "批量抠图", "智能扩图", "多角度服装图&搭配图"];

const CJK = "text-[11px] leading-[16px]";

function Chip({ children, active }: { children: string; active?: boolean }) {
    return (
        <span
            className={
                active
                    ? `${CJK} rounded border border-primary bg-primary/10 px-1.5 text-primary`
                    : `${CJK} rounded border border-border px-1.5 text-muted-foreground`
            }
        >
            {children}
        </span>
    );
}

function Block({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <section className="min-w-0 space-y-1">
            <p className={`${CJK} font-medium text-foreground`}>{title}</p>
            {children}
        </section>
    );
}

export function MaterialUpperBodyStatic({ className }: { className?: string }) {
    return (
        <div className={`flex h-full min-h-0 flex-col bg-background p-2 ${className ?? ""}`} data-testid="material-upper-body-workspace">
            {/* 家族导航 + 算力 */}
            <div className="flex flex-wrap items-center gap-1">
                <span className={`${CJK} rounded bg-primary px-1.5 text-primary-foreground`}>250</span>
                {FAMILY.map((item) => (
                    <Chip key={item}>{item}</Chip>
                ))}
            </div>

            <div className="mt-2 grid min-h-0 flex-1 grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-2 overflow-auto">
                {/* 左：上传 + 配置 */}
                <div className="grid justify-start gap-2 sm:grid-cols-2">
                    <Block title="上传服装图">
                        <div className="flex flex-wrap gap-1">
                            <Chip>从本地上传</Chip>
                            <Chip>从作品库选择</Chip>
                            <Chip>从商品库选择</Chip>
                        </div>
                        <p className={`${CJK} text-muted-foreground`}>最多上传5张图，10M以内，384*384~4096*4096</p>
                        <p className={`${CJK} text-muted-foreground`}>第一步：上传服装配饰及细节图</p>
                        <p className={`${CJK} text-muted-foreground`}>或试试这些</p>
                        <div className="flex flex-wrap gap-1">
                            <Chip>1</Chip>
                            <Chip>2</Chip>
                            <Chip>3</Chip>
                        </div>
                        <p className={`${CJK} text-muted-foreground`}>我是高手，不再提醒</p>
                    </Block>

                    <Block title="商品信息">
                        <div className="flex flex-wrap gap-1">
                            <Chip>AI分析</Chip>
                            <Chip>向导</Chip>
                        </div>
                        <p className={`${CJK} text-muted-foreground`}>0 / 2500</p>
                    </Block>

                    <Block title="品牌与合规（可选）">
                        <div className="flex flex-wrap gap-1">
                            <Chip>智能品牌基因</Chip>
                            <Chip>智能主色、智能字体风格</Chip>
                            <Chip>智能合规检查</Chip>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            <Chip>未选择敏感词库</Chip>
                            <Chip>未选择替换词库</Chip>
                        </div>
                    </Block>

                    <Block title="模型选择">
                        <Chip active>LF智能模型 G-2.5 Sunburst</Chip>
                    </Block>

                    <Block title="分辨率选择">
                        <div className="flex flex-wrap gap-1">
                            <Chip>1K</Chip>
                            <Chip>2K</Chip>
                            <Chip active>4K</Chip>
                        </div>
                    </Block>

                    <Block title="模型品质">
                        <div className="flex flex-wrap gap-1">
                            <Chip>低品质</Chip>
                            <Chip>中品质</Chip>
                            <Chip>高品质</Chip>
                            <Chip>超高品质</Chip>
                            <Chip active>最大品质</Chip>
                        </div>
                    </Block>

                    <Block title="主副图设置">
                        <p className={`${CJK} text-muted-foreground`}>生成类型（多选）</p>
                        <div className="flex flex-wrap gap-1">
                            <Chip active>模特图</Chip>
                            <Chip>4</Chip>
                            <Chip>种草图</Chip>
                            <Chip>卖点图</Chip>
                            <Chip>尺码图</Chip>
                            <Chip>白底图</Chip>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            <Chip>选择排版</Chip>
                            <Chip>每种排版生成一张</Chip>
                            <Chip>无文字模式</Chip>
                        </div>
                        <p className={`${CJK} text-muted-foreground`}>💡未选择排版时，将根据官方排版随机生成</p>
                    </Block>

                    <Block title="生成比例">
                        <div className="flex flex-wrap gap-1">
                            <Chip active>1:1</Chip>
                            <Chip>3:4</Chip>
                            <Chip>4:3</Chip>
                            <Chip>2:3</Chip>
                            <Chip>3:2</Chip>
                        </div>
                    </Block>

                    <Block title="A+图设置">
                        <p className={`${CJK} text-muted-foreground`}>生成类型（单选）</p>
                        <div className="flex flex-wrap gap-1">
                            <Chip active>高级A+</Chip>
                            <Chip>手机A+</Chip>
                            <Chip>普通A+</Chip>
                            <Chip>自定比例</Chip>
                        </div>
                    </Block>

                    <div className="min-w-0 space-y-1">
                        <p className={`${CJK} text-muted-foreground`}>主副图8张 * 每张50点 + A+图4张 * 每张50点 = 600点</p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled
                                className="rounded bg-primary px-3 py-1 text-[12px] leading-[18px] font-medium text-primary-foreground opacity-60"
                                data-testid="material-upper-body-submit"
                            >
                                开始生成
                            </button>
                            <span className={`${CJK} text-muted-foreground`}>(600算力)</span>
                        </div>
                    </div>
                </div>

                {/* 右：结果 */}
                <div className="min-w-0 space-y-2">
                    <p className={`${CJK} font-medium text-foreground`}>生成结果</p>
                    <div className="grid min-h-[240px] place-items-center rounded border border-dashed border-border">
                        <p className={`${CJK} text-muted-foreground`}>还没有生成结果</p>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                            <p className={`${CJK} font-medium text-foreground`}>管理水印分组</p>
                            <p className={`${CJK} text-muted-foreground`}>共 1/20 个</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                            <Chip active>默认</Chip>
                            <Chip>＋ 新增水印分组</Chip>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MaterialUpperBodyStatic;
