# PRODUCT_MARKET_MATERIAL：同工具 LinkFox 1:1 对照（feat/linkfox-v1-real）

- 原站入口：`https://www.linkfox.com/draw/batch-generate-images/:id/product-market-material`（**登录墙**：未登录访问被重定向，取不到页面 DOM）
- 原站建任务路径：`https://www.linkfox.com/draw/batch-generate-images/create-task/64`
- 本站路由：`/tools/product-design/product-market-material`
- 原站事实来源（均为仓库内已有抓取产物，非推测）：
  1. `docs/analysis/assets/linkfox/schema_final.json#PRODUCT_MARKET_MATERIAL`（chunk `ProductTask-FDmCdDjl.js`，bizType 64）
     字段：`APlusAspectRatio / aspectRatio / brandDNA / brandKey / brandName / coverList / images / isCustomAspectRatio / language / name / platform / provider / quality / resolution / salesRegion`
  2. `docs/analysis/assets/linkfox/create_payload_product_suite.json`（同族 ProductTask 真实提交体：`brandKey={salesRegion:"美国",language:"英语",platform:"亚马逊"}`，`configData.aPlusConfig.sceneType ∈ {APlusPro, A+, custom, APlusHasPhone}`）
  3. `docs/analysis/assets/linkfox/models_catalog.json#image.69`（makeType 64 未单列模型，按同族套图 69 的 provider/quality/resolution 目录落地）
  4. `docs/V1.0/plan_linkfox_navigation/page-specs/32-product-market-material.md`（四大区域与状态机）
- 本站实现：`web/src/features/tools/registry/product-market-material.ts` + `web/src/components/tools/workspaces/suite.tsx`（MARKET 分支）

## 1. 逐字段对照

| # | 原站字段/交互 | 原站行为（证据） | 本站实现 | 结论 |
|---|---|---|---|---|
| 1 | `images` | 商品多图数组，任务提交体为图片 URL 数组 | 1–6 张，10MB/张，384–4096px，宽高比 ≤5:1，前端校验 + 预览 | ✅ 能力对齐 |
| 2 | `name` | 任务名，提交体必填 | 任务名字段，空白拦截 | ✅ 1:1 |
| 3 | `platform` | `brandKey.platform` 为中文平台名（亚马逊等） | 5 个平台卡片：亚马逊/Shopify/沃尔玛/Etsy/Temu，映射 `brandKeyValue` | ✅ 同构 |
| 4 | `salesRegion` | `brandKey.salesRegion`（美国/英国/…） | 4 个销售地区，映射 `brandKeyValue` | ✅ 同构 |
| 5 | `language` | `brandKey.language`（英语等） | 多语言选择，映射 `brandKeyValue` | ✅ 同构 |
| 6 | `brandKey` | 由「地区+语言+平台」组合出的对象 | 由三字段派生，提交体结构与原站一致（单测断言键集合 = language/platform/salesRegion） | ✅ 1:1 |
| 7 | `brandName` + `brandDNA` | 品牌名 + 品牌 DNA（控制字体/主色） | 品牌名输入 + 品牌色/字体风格选择，注入 Prompt 与模块指令 | ✅ 能力对齐 |
| 8 | `APlusAspectRatio` + A+ 模板 | `sceneType ∈ {APlusPro, A+, custom, APlusHasPhone}`，仅亚马逊有 A+ | 4 个 A+ 模板（高级A+/普通A+/手机A+/自定比例），非亚马逊平台显式禁用 A+ 区域 | ✅ 1:1 |
| 9 | `aspectRatio` | 营销/A+ 画幅比例 | 营销 6 档 `1:1 / 4:5 / 9:16 / 16:9 / 3:4 / 3:2`；A+ 比例按平台过滤 | ✅ 能力对齐 |
| 10 | `isCustomAspectRatio` | 自定义比例展开宽高输入 | 选「自定比例」展开宽×高输入，非法值拦截 | ✅ 1:1 |
| 11 | `provider` / `quality` / `resolution` | 同族目录：provider、quality（如 high/medium）、resolution（1K/2K/4K） | 三组选择器复用同族目录 | ✅ 同构 |
| 12 | `coverList` | 封面/模块勾选清单 | 未实现（原站交互无真实样本，说明不足以还原） | ⚠️ 偏差 |
| 13 | 状态机 | 任务提交后锁定快照，可编辑下一稿；失败/取消可区分 | `draft/dirty → validating → submitting → running → succeeded/failed/cancelled`，提交后锁定本次配置快照 | ✅ 1:1 |
| 14 | 输出按模块分组 | 结果按营销模块（A+ 模块/营销图）分组展示 | 结果区按模块分组，单结果可重试 | ✅ 能力对齐 |
| 15 | 结果动作 | 下载、保存资产、（如适用）发送到画布 | 下载 / 保存到资产库（`saveResultItemToAssets`）/ 发送到画布，均已在真实产物上验证 | ✅ 1:1 |
| 16 | 提交前产物数量提示 | 按钮旁显示本次产物数量，不显示算力 | 提交按钮旁显示模块数/产物数 | ✅ 1:1 |
| 17 | 优秀案例展示 | 原站有案例画廊 | 未实现；无授权素材，按 PRD 不用假图充数 | ⚠️ 偏差（有意） |
| 18 | 草稿持久化 | 未在 chunk 中得到证据 | 本站按工具统一草稿规范落 `tool-draft:v1:PRODUCT_MARKET_MATERIAL`（revision 冲突处理） | ➕ 本站补充 |

## 2. 本轮实测产物证据（result.json 对应项）

| 项 | 实测值 |
|---|---|
| 真实产物字节 | PNG 970×600，703458 B，sha256 `d1343fdf…` |
| 产物用于画布 | 节点 `image-1793200842226-vrifp` 同 storageKey、同尺寸同字节 |
| 保存到资产库 | assetId `yLlHBN0-w4l0JkzZoRe7Y`，bytes/宽高/sha256 与产物一致 |
| 资产库可见 | `/assets` 卡片标题「商品营销素材 · 970×600」 |
| 来源标记 | `source=product-market-material`，`metadata.toolId=PRODUCT_MARKET_MATERIAL` |

## 3. 未完成 / 风险

- 原站页面在登录墙内，本轮**没有**取到页面 DOM 文案、组件布局、按钮命名，因此不做布局级（像素/间距/区域比例）1:1 断言，只做字段与状态机级对齐。
- `coverList`（封面/模块勾选）、优秀案例画廊两项未实现：前者缺真实交互样本，后者缺授权素材；均不伪造。
- 产物复用本轮早前真实 provider 结果（未重复调用计费接口），保存链路在真实字节上执行，已在 result.json `deviations` 中注明。
