# 收尾实测报告：SCALE_UP / CHANGE_COLOR_V2（LinkFox 1:1 对齐）

- 分支：`feat/linkfox-v1-real`
- 时间：2026-10-29 00:20–00:45（CST）
- 验证方式：真实 Chrome + Browser Control（TMWebDriver，非 mock），真实上游渠道 `ccai-tmp / gpt-image-2` 经 `canvas-proxy 127.0.0.1:23210`
- 证据根目录：[evidence/real-acceptance](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance)

## 一、SCALE_UP（高清放大）→ PASS

| 动作 | 结果 | 物理证据 |
|---|---|---|
| 复用会话内真实结果 | 不重复付费生成，task `task-mvsbn0zb-rmqos4`，1024×752 | 结果区 `共 1 个结果 · 图片 1`，[06-result-actions.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SCALE_UP/06-result-actions.json) |
| 下载 | 1,152,074 B，sha256 前 16 位 `1e12a562cb2cdc19` | [05-downloaded.png](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SCALE_UP/05-downloaded.png)；同时落盘 `~/Downloads/scale-up-result-1.png` |
| 存入资产 | `已保存到资产库（AzmBB3Km3nlGYqUY4POms）`；IDB 直读 bytes=1152074、1024×752、storageKey=`image:ZGoJmi2_gBeofwfV5S5fB`、toolId=`SCALE_UP` | [07-result-actions-verified.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SCALE_UP/07-result-actions-verified.json) |
| 发送画布 | `已发送到画布（aFEdKzyxmfug5VRJNTkWN）`；canvas_store 直读 project「SCALE_UP 结果」nodes=1（`image-1793204985747-k7zvh`） | 同 07 |

> 说明：本会话结果（1,152,074 B）与 18:37 首跑产物（02-result.png，755,743 B）是两次独立真实生成，尺寸同为 1024×752。

### LinkFox 逐项对照（[08-linkfox-dom.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SCALE_UP/08-linkfox-dom.json) vs [09-site-config-dom.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SCALE_UP/09-site-config-dom.json)）

| 项 | LinkFox | 本站 | 结论 |
|---|---|---|---|
| 放大模式 | 变高清 / 高清+2倍 / 高清+4倍 / 自定义 | 变高清 / 高清+2倍放大 / 高清+4倍放大 / 自定义 | 1:1 |
| 输出尺寸联动 | 切换倍率显示输出尺寸 | `输出 1024×752`、`倍率 1×`、自定义可编辑 | 1:1 |
| 面部美化 | 面部美化开关 | 增强选项·面部美化（附人脸检测不支持提示） | 1:1 |
| 上传 | 本地/作品库/批量，jpg-jpeg-png-webp ≤4096² | 上传素材 + 资产库 | 基本一致（本站无独立「批量」入口） |
| 结果对比 | 原图 / 高清放大后 | 前后对比滑块（左原图 50% / 右放大后） | 1:1 |
| 结果操作 | 下载图片 / 历史记录 | 下载 / 存入资产 / 发送画布 | 本站按画布能力扩展 |

差异（按「保留现有差异」要求，仅记录未改）：原站「历史记录」独立 tab、「批量高清放大/从作品库选择」独立入口，本站由任务历史 + 资产库多选承载。

## 二、CHANGE_COLOR_V2（套图换色 V2）→ PARTIAL（1/2 单元真实出图）

| 单元 | 输入 | 任务 | 结果 |
|---|---|---|---|
| 0 | apparel-print.jpg + ref | `task-mvsc4fyg-qobp8k`（00:34:38 提交 → 00:35:08 succeeded） | **真实出图** 1024×1024，上游 OSS `.../1793205308_f2532a74...`；下载 1,115,668 B，sha256 前 16 位 `dd56d50404c37c6a` → [05-unit1-result.png](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/CHANGE_COLOR_V2/05-unit1-result.png) |
| 1 | product-watch.jpg + ref | `task-mvsc7s58-2rrnqz`（00:37:13 重试提交） | 停在 `submitting`；00:38:41 整页重置后结果不可回收 → 仍为未定 |

### 为什么是 PARTIAL 而不是 PASS/FAIL
- 单元 0 是真实上游产物（OSS URL + 落盘字节 + sha 三重可查），**不是 mock**。
- 单元 1 两次都没拿到结果：首次 `unclassified 请求失败`（当时 canvas-proxy 401 后崩溃，上游未受理），重试期间页面重置导致会话结果丢失；任务记录 result item 标记 `payloadDropped: true`，结果区无「存入资产/发送画布」入口，故这两项在 CCV2 上无法验收。

### 防重复扣费证据（成本保护）
- 首次 2 个单元状态 `unknown`（`任务状态未知，只能查询或人工确认`），前端不自动重发；
- 重试前做零成本探活：`GET https://api.cc-ai.xyz/v1/models` → `401 / 1.54s`（无 key，链路可达）；
- 探活通过后仅对「请求失败」单元点击单元级「重试」，每单元各 1 次，未对 unknown 单元批量自动重发。
- 证据：[01-task-history.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/CHANGE_COLOR_V2/01-task-history.json)、[10-retry-unit1-state.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/CHANGE_COLOR_V2/10-retry-unit1-state.json)

### LinkFox 逐项对照（[08-linkfox-dom.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/CHANGE_COLOR_V2/08-linkfox-dom.json)）

| 项 | LinkFox | 本站 | 结论 |
|---|---|---|---|
| 上传 | 本地上传 / 作品库 / 商品库（多张） | 商品图多选 + 资产库 | 基本一致 |
| 提色 | 商品图提色 / 历史使用颜色 | 换色方案（多方案）× 提色/部位/品质 | 1:1（矩阵更细） |
| 批量 | 上传多张开始批量换色 | N 图 × M 方案 = 结果矩阵，单元级状态 | 优于原站（单元级重试 + unknown 保护） |
| 结果操作 | 下载 / 一键做同款 | 下载 / 重试失败项 / 复制提示词 | 本站多了失败项单独重试 |
| 历史 | 历史记录 tab | 任务历史 + 整套结果区 | 承载方式不同 |

## 三、未完成 / 风险

1. CCV2 单元 1（product-watch.jpg）未出图，建议恢复后单独补跑 1 次再升级为 PASS（成本 1 张）。
2. 页面在 00:38:41 发生整页重置（疑 Vite HMR/dev server 重启），导致提交中任务停滞、结果面板清空；属环境问题，未改代码规避。
3. SCALE_UP 历史遗留提示「原图或参数已变更…请重新生成」为自动人脸检测回写副作用，不影响结果可用性，按「保留现有差异」未修。

## 四、复现入口

- SCALE_UP：`http://127.0.0.1:3000/tools/ecommerce-suite/scale-up`
- CHANGE_COLOR_V2：`http://127.0.0.1:3000/tools/ecommerce-suite/change-color-v2`
- 对照站：`https://www.linkfox.com/draw/quality-increase`、`https://www.linkfox.com/draw/product-color-change`
