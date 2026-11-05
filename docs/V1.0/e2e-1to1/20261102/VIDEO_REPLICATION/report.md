# VIDEO_REPLICATION｜视频复刻 · 1:1 E2E 验收

- 原站 URL：https://www.linkfox.com/draw/video-replication （HTTP 200，未重定向，标题「视频复刻 - LinkFox」）
- 本地 URL：http://127.0.0.1:3000/tools/ai-video/video-replication （标题「无限画布」）
- 视口：双端 1600×1000，DPR=1
- 验收时间：2026-11-02
- 只读验收：未改源码；未提交生成；未点购买/删除；未操作既有用户标签

## 截图

| 说明 | 路径 |
|---|---|
| 原站 baseline | `docs/V1.0/e2e-1to1/20261102/VIDEO_REPLICATION/orig-01-entry.png` |
| 本地 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/VIDEO_REPLICATION/local-01-entry.png` |
| 本地 · 「图片规则」弹层 | `docs/V1.0/e2e-1to1/20261102/VIDEO_REPLICATION/local-ix-01-图片规则.png` |
| 本地 · 「默认自动分析」→「手动填写脚本」 | `docs/V1.0/e2e-1to1/20261102/VIDEO_REPLICATION/local-ix-02-默认自动分析.png` |
| 本地 · 480P | `docs/V1.0/e2e-1to1/20261102/VIDEO_REPLICATION/local-ix-04-480P.png` |

## 容器 boundingRect（1600×1000）

| 端 | 容器 | rect |
|---|---|---|
| 原站 | 工作区 `_bodyLayout` | @180,110 **1420×890** |
| 本地 | `main` | @180,165 **1420×835**（`scrollHeight/clientHeight = 1141/835`） |
| 本地 | 配置栏（左） | @216,272 **300**×628 |
| 本地 | 配置栏（中：模型/分辨率/生成设置） | @528,272 **320**×628 |
| 本地 | 结果栏（右） | @864,272 **700**×628 |

> 注意：本工具本地是**三栏**（300 / 320 / 700），原站是两栏（左配置 + 右结果）。这是本组唯一布局范式不同的工具。

## 可见文本（本地首屏）

面包屑「AI 视频 / 视频复刻」+ H1「视频复刻」；「TikTok 视频链接」输入（placeholder `https://www.tiktok.com/@user/video/...`）+「解析」（disabled）；「或 手动上传参考视频」「上传参考视频 / 本地上传 / 作品选择 / 支持MP4/MOV格式，100M以内 / 上传后可截取5-30s参考片段」；「关闭」；「上传商品与参考图 / 图片规则 / 本地上传 / 作品选择 / 商品库选择」；「AI脚本分析 （选填）」「默认自动分析」「链接解析成功或上传视频后可自动分析脚本；默认自动分析」「0/4000」；「视频模型 Seedance 2.0 fast 适合日常稳妥出片」（disabled）；「视频分辨率 480P / 720P」；「生成设置 / 视频时长 / 拖动选择时长 / Auto（15秒）/ Auto / 5 / 10 / 15」「视频比例 9:16/16:9/1:1/3:4/4:3/21:9」「销售国家/地区 US(美国)」「目标语言 英语」；「立即生成」（disabled）+ 汇总「9:16 · 720P · 约 5 秒 · 英语 · US(美国)」+ 三条阻断原因「请先上传参考视频（MP4/MOV，100MB 以内）。」「请上传至少 1 张商品参考图。」「请填写口播脚本（或用 AI 脚本分析生成后校对）。」

原站可见文本要点：「TikTok 视频链接」「解析」「或 手动上传参考视频」「上传参考视频」「本地上传 / 作品选择」「支持MP4/MOV格式，100M以内」「上传后可截取5-30s参考片段」「上传商品与参考图」「图片规则」「支持上传6张图」」「AI脚本分析（选填）」「默认自动分析」「视频模型」。

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | **PARTIAL** | 控件清单/文案高度对齐；但左栏分区、三栏结构、卡片留白与原站两栏不一致 |
| 布局 | **PASS（含 P1 结构差异）** | 三栏 300/320/700 vs 原站两栏；`main` 可滚动 1141/835，无阻断 |
| 交互 | **PASS** | 5 个零费用控件有差异 + 「解析」禁用态确认 |
| 功能 | **NOT_RUN / 已知缺口** | 链接解析（TikTok 分享页）当前**必然失败**：`adapters/video-replication.ts:601-602` 对 tiktok/douyin/kuaishou 直接返回 `link-unresolved`「分享页链接需要服务端解析，当前未接入；请填视频文件直链（.mp4/.mov）」 |

## 交互实测（零费用，未提交生成）

| # | 控件 | 操作 | 前后差异 | 证据 |
|---|---|---|---|---|
| 1 | 「图片规则」 | 点击 | 弹出规则层：「上传正确的参考图，让商品视频还原度更准确」「通用 / 服装 / 3C数码」「建议这样传：1 正面主图 / 2 45°侧面 / 3 细节特写 / 4 使用场景」「避免上传：× 多主体同框 … × 牛皮癣图片 …」；「关闭」可收起 | `local-ix-01-图片规则.png` |
| 2 | 「默认自动分析」 | 点击 | 出现「手动填写脚本」；脚本策略在「默认自动分析 ↔ 手动填写」间切换 | `local-ix-02-默认自动分析.png` |
| 3 | 「视频分辨率 480P」 | 720P→480P | `aria-checked` 720P→480P | `local-ix-04-480P.png` |
| 4 | 「视频比例 16:9」 | 9:16→16:9 | `aria-checked` 9:16→16:9 | `local-ix-03-ratio-169.png` |
| 5 | 「视频时长 5」 | Auto→5 | `aria-checked`；汇总文案同步（`… · 约 5 秒 …`） | `local-ix-03-5.png` |
| 6 | 「TikTok 视频链接」输入 + 「解析」 | 读取控件态 | 输入框可编辑；**「解析」disabled**（空值态）。填入链接后仍受下面的解析缺口限制 | DOM 断言 |
| 7 | 上传入口 | 读 file input | 2 个：`video/mp4,video/quicktime`（单文件）+ `image/png,image/jpeg,image/jpg,image/webp`（多文件） | DOM 断言 |

## 功能代码路径与禁用/缺失能力核对

- **链接解析**：`parsePublicVideoLink`（`web/src/features/tools/adapters/video-replication.ts:592`）只放行 `.mp4/.mov` 直链；命中 `tiktok.com|douyin.com|kuaishou.com` 时**直接拒绝**并返回 `link-unresolved`，文案「分享页链接需要服务端解析，当前未接入」。→ 原站核心入口（粘贴 TikTok 链接→解析）在本地**不可用**。
- **脚本分析**：`analyzeRedisKey` 允许为空（`VIDEO_REPLICATION_EMPTY_ALLOWED_FIELDS` 含 `analyzeRedisKey`）；`buildVideoReplicationPrompt` 校验 prompt 必须含脚本段（:392）。页面文案「链接解析成功或上传视频后可自动分析脚本」——在链接解析不可用时，该自动分析只能依赖**手动上传视频**路径。
- 禁用态：视频模型选择器（Seedance 2.0 fast）disabled；「作品选择」disabled；「商品库选择」disabled；「立即生成」disabled（缺视频/图/脚本）。
- 必填：`refVideoUrl`、`coverUrl`、`imageSegUrl`、`originalVideoUrl`、`aspectRatio`、`ratio`、`resolution`、`sourceVideoUrl`、`targetLanguage` 等（registry 声明 28 字段），页面未全部暴露为可见控件（如 `refVideoName`、`clipStart/clipEnd` 走上传后裁剪）。

## 逐条差异

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 功能 · 链接解析 | **P1** | 「TikTok 视频链接」+「解析」 | 粘贴 TikTok 分享链接 →「解析」抓取视频并进入裁剪/脚本分析 | 非直链一律拒绝：`link-unresolved`；「解析」按钮 disabled；UI 只在 placeholder 给出 `tiktok.com/@user/video/...` 示例，实际填入会失败 | `adapters/video-replication.ts:592-606`；`local-01-entry.png` |
| 2 | 布局 · 栏数 | **P1** | 整体栅格 | 两栏：左配置 + 右结果 | 三栏：300 素材 / 320 模型与生成设置 / 700 结果；模型与分辨率被拆到中间栏，与原站「配置集中在一栏」不同 | boundingRect 表 |
| 3 | 功能 · 脚本分析触发 | P2 | 「AI脚本分析（选填）」+「默认自动分析」 | 解析/上传后自动分析脚本并回填 | 本地为「默认自动分析 ↔ 手动填写脚本」二选一开关，自动路径依赖已上传视频；无独立「分析」动作按钮 | `local-ix-02-默认自动分析.png` |
| 4 | 功能 · 参考图上限 | P2 | 「上传商品与参考图」 | 支持 6 张 | 本地可见文案未标张数上限（`refImageList` 为 array），规则弹层也未给张数 | `local-ix-01-图片规则.png` |
| 5 | 视觉 · 实现态泄漏 | P2 | 面包屑 / 路由串 / `ljq_driver: 已连接` / `sub2::MiniMax-H3` | 无 | 均直接可见 | `local-01-entry.png` |
| 6 | 布局 · 顶栏 | P2 | 全局 shell | 110px | 165px，工作区少 55px | boundingRect |
| 7 | 视觉 · 壳层缺失 | P2 | 促销条 / 算力 / 购买 / 学习中心 / 操作咨询 / 产品教程 | 有 | 无 | 双端截图 |
| 8 | 状态 · 首屏失败/历史混杂 | P3 | 结果区 | 空态展示「优秀案例」 | 本地结果区为「已完成 1 个」+「历史任务 3 条（含 2 条失败）」，首屏即有失败记录 | `local-01-entry.png` |

## 结论

- 控件与文案的 1:1 覆盖度较好，但**结构与核心入口两处 P1**：三栏 vs 两栏；TikTok 链接解析明确未接入（代码级拒绝）。
- 脚本分析能力存在，但只能靠手动上传视频触发，原站「链接→解析→自动分析」主链路在本地断裂。
- 生成未提交，功能判定 NOT_RUN；不以任何既有历史结果（含已完成记录）作为 PASS 依据。
