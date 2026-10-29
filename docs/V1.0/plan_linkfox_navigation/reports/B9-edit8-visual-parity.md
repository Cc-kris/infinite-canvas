# B9 · 图片编辑 edit8 视觉 1:1 复刻进展（AREA_REPAIR / REMOVE_PEN 已复刻，其余 PARTIAL）

分支：`feat/linkfox-v1-real` ｜ 基准：`https://www.linkfox.com/draw/*`，视口 1908×781 ｜ 本机：`http://localhost:3000/tools/smart-edit/*`

## 统一骨架（新增，可被其余 6 个工具复用）

`web/src/components/tools/edit8-frame.tsx`

| 组件 | 规格（取自原站实测） |
| --- | --- |
| `Edit8Page` | `flex h-full gap-[10px] p-[10px] bg-[#f5f7fa]`，透传 `data-*` |
| `Edit8Canvas` | `flex-1`，`bg #EDEFF5`，圆角 8，`overflow-hidden` |
| `Edit8CanvasToolbar` | 高 41px（原站 y120→161），左右分组 |
| `Edit8CanvasCard` | 白卡 `w-[542px]` 圆角 12，pad 16，`0 2px 12px rgba(31,31,44,.04)` |
| `Edit8Config` | 宽 240，白卡，分区 pad `10px 16px`，footer 贴底 |
| `Edit8Results` | 宽 300，`bg #EDEFF5`，顶部 42px 标签栏，内容 pad `16px 12px` |
| `edit8PrimaryButtonClass` | `h-8 w-full`，`bg #723CF9`，圆角 6，14px 白字 |

`ToolAssetInput` 新增 `wide` 变体（linkfox）：上传区铺满容器、高 249px 虚线框，底部「从本地上传」整行 + 「从作品库选择 / 从商品库选择」两列。

## 已完成（DONE）

### 1. AREA_REPAIR 局部重绘 — 提交 `00515af`

原站为三列：画布 1148 / 配置 240 / 结果 300，间距与内边距 10px。

本机实测（1908×781）：

| 区域 | 本机 | 原站 |
| --- | --- | --- |
| 画布列宽 / 底色 | 1108 / `rgb(237,239,245)` r8 | 1148 / 同 |
| 配置列 | 240 白卡 | 240 白卡 |
| 结果列 | 300 `#EDEFF5` | 300 同 |
| 「立即生成」 | 240×32 `rgb(114,60,249)` r6 | 240×32 同 |
| 空态白卡 | 542×427 | 542×495（差在上传区上下留白，PARTIAL） |

### 2. REMOVE_PEN 局部消除 — 提交 `998cf6f`

原站是**单列全宽画布**（无配置列、无结果列）：画布 `x190 w1708 h651`，工具条位于画布顶部，空态白卡 `(784,263) 520×412`。

本机实测：

| 项 | 本机 | 原站 |
| --- | --- | --- |
| 画布 | `x210 w1668 h472`（全宽、`#EDEFF5` r8） | `x190 w1708 h651` |
| 工具条 | 高 41，含 画笔 / 大小滑杆+像素 / 重置 / 撤销 / 重做 ｜ 重新上传 / 开始消除 / 下载图片 / 高清放大 / 商品图 / 手部修复 | 同结构同顺序 |
| 空态白卡 | `(784,271) 520×415` | `(784,263) 520×412` |
| 「开始消除」 | 78×28 `rgb(114,60,249)` r6 | 同色系 |

差值来源：本机 App 外壳（顶栏/侧栏）比原站多约 52px，工具内容区因此更矮（h472 vs 651），非工具内部布局问题。

## 未完成（PARTIAL，交给下一批）

| 工具 | 现状 | 待做 |
| --- | --- | --- |
| CHANGE_COLOR 一键换色 | 沿用旧版三列，未换骨架 | 配置列须为 `x1248 w307 pad 10 10 0`：收藏色卡 / 选择颜色 / 颜色参考图上传 / 去除杂色开关 / 色调·饱和度·亮度·对比度 4 滑块（数值框 48×22）/ 光影优化 / 边缘优化（色彩平衡·曲线）/ 立即生成(10算力)；结果列 `x1566 w332`，标签 生成结果·优秀案例·历史记录，空态「暂无生成结果图」 |
| IMAGE_CROP 图片裁剪 | 未动 | 待抓原站几何 |
| PRODUCT_REFINE 商品精修 | 未动 | 待抓原站几何 |
| FIX_COLOR 色差修复 / HAND_REPAIR 手部修复 | 未动 | 待抓原站几何 |
| PRINTING_REPAIR 印花修复 | 未动 | 待抓原站几何 |

## 如何验证

1. `cd web && /opt/homebrew/bin/node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 干净退出。
2. 用 `probe.py <url> <js> 1908x781` 取本机 DOM 几何，与 `docs/V1.0/plan_linkfox_navigation/evidence/b9-visual-parity-20261029/real/<TOOL>/` 的原站数据逐项对照（本报告表格即为对照结果）。
3. 注意：本仓库**未安装测试运行器**（`bun`/`vitest` 均不存在，`package.json` 的 `test: bun test` 无法执行），本批以「tsc + 真实 DOM 几何对照」作为验证证据。
