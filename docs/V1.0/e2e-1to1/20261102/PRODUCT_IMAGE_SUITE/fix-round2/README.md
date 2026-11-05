# 商品套图 / 商品营销素材 · 1:1 修复（第二轮，仅改 suite.tsx + suite.test.tsx）

- 视口：1600×1000（CDP `Emulation.setDeviceMetricsOverride`，实测 innerWidth/innerHeight = 1600/1000）
- 原站：https://www.linkfox.com/draw/product-image-suite（已登录，只读对照；**未点击「开始生成」**）
- 本地：http://127.0.0.1:3000/tools/ecommerce-suite/product-image-suite 、/tools/product-design/product-market-material
- 本轮**未提交任何生成请求**，未产生算力消耗；上传截图用的是本地生成的 800×800 纯色 PNG 夹具。

## 截图

| 说明 | 文件 |
|---|---|
| 套图 本地基线（对齐后，1600×1000） | `local-suite-baseline-1600x1000.png` |
| 套图 上传 multiple（3 张同时选择，全部 ready） | `local-suite-upload-3-images.png` |
| 套图 商品类目可搜索级联弹层 | `local-suite-category-popup.png` |
| 套图 「向导」商品信息弹窗 | `local-suite-wizard-dialog.png` |
| 套图 品牌与合规两行行卡展开 | `local-suite-brand-compliance-rows.png` |
| 套图 模型行展开（含「完成」） | `local-suite-model-expanded.png` |
| 套图 「从商品库选择」诚实空态 | `local-suite-product-library-empty.png` |
| 营销素材 本地基线 | `local-market-baseline-1600x1000.png` |
| 营销素材 「向导」弹窗 | `local-market-wizard-dialog.png` |
| 营销素材 品牌与合规两行行卡展开 | `local-market-brand-compliance-rows.png` |

## 实测数值（1600×1000，本地）

- 配置列 300×944 @180,56；结果列 1108×944 @492,56（原站 300 / 1100，列宽由共享壳提供，本轮未改共享壳）
- 结果区页签栏 42px；「生成结果」56×42、`rgb(114,60,249)`（= `--primary` #723cf9，与原站同色）
- 「开始生成」268×32、紫底白字（原站 268×32 紫底；本轮只把本地按钮由 56 宽改为 268 满宽）
- 上传主按钮「从本地上传」224×24 紫底；`input[type=file]` `multiple=true`、`accept=image/jpeg,image/png,image/webp`
- 上传卡限制行逐字：`最多上传16张图，10M以内，384*384~4096*4096，最大宽高比5`
- 模型行 34px 高折叠态，行内仅「LF智能模型 G-2.5 Sunburst / 2K · 中品质」

## 未验证 / 已知剩余

- 未跑真实生成（按要求禁止提交），故运行期产物、计费、单张重试链路只做了代码路径核对（`runSuite` → `getPersistedToolGateway()` 未改动）。
- 原站「或试试这些」示例缩略图、右侧案例轮播卡、底部「操作咨询/产品教程」等壳层元素不在本文件范围（壳层差异，未处理）。
- 原站「历史记录 ↗」是 `/draw/history?type=71` 外链；本地无独立历史页，只保留同位置入口位并写明 title，不伪造跳转。
- 原站类目是 Amazon 全类目树；本地仍是内置 8 个电商大类（交互形态改为可搜索弹层，数据未扩展）。
- 原站 a11y 与动效（气泡箭头、过渡）未逐项比对。
- `tsc --noEmit` 全仓有他人改动导致的 4 处报错（mask.tsx / dress.tsx / case-module-copy.test.ts），与本文件无关；`suite.tsx`、`suite.test.tsx` 零报错。
