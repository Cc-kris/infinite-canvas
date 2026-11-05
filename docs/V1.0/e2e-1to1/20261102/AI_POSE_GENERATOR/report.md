# AI_POSE_GENERATOR｜AI姿势生成 · 1:1 E2E 验收

- 原站 URL：https://www.linkfox.com/draw/ai-pose-generator （**原站返回 404**：标题「404 - 页面不存在 | Linkfox」，正文「页面不存在 / 您访问的页面可能已被删除、移动或暂时不可用 / 返回首页」）
- 本地 URL：http://127.0.0.1:3000/tools/product-design/ai-pose-generator （标题「无限画布」）
- 视口：双端均用 CDP `Emulation.setDeviceMetricsOverride` 固定 1600×1000（实测 innerWidth/innerHeight = 1600/1000，DPR=1）
- 验收时间：2026-11-02
- 只读验收：未修改任何源码；未点击任何生成/购买/删除类按钮；未提交生成任务。

## 原站 baseline 说明（重要）

该工具在 tool-matrix 中被标记为 `补充`（不在原站五类 draw 菜单内），实际访问 `/draw/ai-pose-generator` 原站 **404**；page-spec 也写明「补充工具，依据字段 prompt 与 scenePrompts」。因此：

| 说明 | 路径 |
|---|---|
| 原站 baseline = `/draw/ai-pose-generator` 的 404 页 | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/original.png` |

- 已核对的相邻 slug：`/draw/ai-pose-generator` → 404；`/draw/ai-pose` → 404；`/draw/ai-posture` → 200（但那是**姿势裂变 AI_POSTURE**，另一个工具，不属本 ID）。
- 结论：**原站无对应页面，baseline 天然缺失**；视觉/布局 1:1 判定为 BLOCKED，不伪造原站截图，也不把 404 页当工作区比对。

## 截图

| 说明 | 路径 |
|---|---|
| 原站 baseline（404 页） | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/original.png` |
| 本地 1600×1000 基线（清草稿后） | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local.png` |
| 本地 · 切「自定义」Tab | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local-interact-01-custom.png` |
| 本地 · 张数切 3 + 加 1 个场景 | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local-interact-02-scene.png` |
| 本地 · 姿势描述填写后 | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local-interact-03-ready.png` |
| 本地 · 场景内容填写后（生成可用） | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local-interact-04-scene-filled.png` |
| 本地 · 删 1 条 + 加 2 条场景（4 张预算） | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local-interact-05-scenes.png` |
| 本地 · 「姿势库」Tab | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local-interact-06-pose-lib.png` |
| 本地 · 选中姿势「3/4 侧身」 | `docs/V1.0/e2e-1to1/20261102/AI_POSE_GENERATOR/local-interact-07-pose-selected.png` |

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | BLOCKED | 原站 404，无工作区可比对 |
| 布局 | BLOCKED（含 1 个本地 P1 缺陷） | 无原站布局可对照；本地自身有溢出：「立即生成」@242,900（22 高，贴底）、「本次输入快照」「生成结果」「历史任务 6 条」在 y>1000，`main` 926 高且 `overflow-y:hidden` |
| 交互 | PASS | 本地实测 8 个零成本控件（姿势库↔自定义 Tab、姿势库 4 张卡片选择、清空已选、张数 1–4、添加场景、删除场景、场景 textarea、姿势描述 textarea），均有前后差异证据 |
| 功能 | REAL_PROVIDER（引用既有真实证据，本轮未提交） | `web/src/components/tools/workspaces/model.tsx:1212` → `runAiPoseGeneratorPlan` → 每单元 `port.run` → `useToolTaskStore.runTool` → 网关真实 `requestGeneration/requestEdit`；既有真实取证 `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_POSE_GENERATOR/result.json`（`status: PASS`，`realProviderCall: true`，上游 200 出图 1024×1024，且结果区三动作实测可用） |

## 本地实测数据（1600×1000）

- 页头：页面上方原站页面 nav chip 条「真人换模特 模特换场景 AI穿衣 姿势裂变 AI穿戴 历史记录 企业功能 批量生图 即将下架 人台换模特 下架」+「ljq_driver: 已连接」。
- 说明条：「本页从文字生成姿势参考：姿势描述 → 场景（可选）→ 生成」。
- 段控 Tab「姿势库（默认）/ 自定义」（各 165×28）。
- 内容网格 360 + 958（@219,123，可视 840），配置栏：
  - 「选择姿势（可选）」+「生成图片的模特姿势」；姿势库 4 张 79×105 卡片（aria-label：正面站姿 / 3/4 侧身 / 背面回眸 / 倚墙，title 各带一句说明）；「未选姿势：按纯姿势描述生成」+「清空已选」（默认 disabled）
  - 姿势描述 textarea（占位「例：女性模特侧身站立，一手扶腰，重心落在后腿，头部转向镜头，全身入镜」）+ 计数 `0/4000` + 撤销/重做（默认 disabled）+「预设名称」input +「保存预设」（默认 disabled）
  - 「选择生成张数」1/2/3/4（28×24，默认 1）+「默认场景等 1 个场景 × 每场景 1 张 = 共 1 张」
  - 「场景描述（可选，最多 6 条）」+「+ 添加场景」；副文「场景只描述环境、光线、道具，不能改写姿势约束。」；空态「还没有场景：不添加则按默认影棚背景生成。」；计数 `0/6 条场景`
  - 「参考预览」只读提示词块（英文模板：`Create a full-body pose reference photo of a single fashion model. Pose: natural, relaxed standing pose…`）
  - 「立即生成」334×22 @242,900（**disabled**，贴底）+「预计输出 1 张」+ 红字「待填写：请先填写姿势描述」
  - `<details>`「本次输入快照」（首屏外）
- 右侧：「生成结果」卡 + 空态「还没有生成结果 / 先填写姿势描述（无姿势描述不能生成），场景可留空按默认影棚背景生成。」
- 底部：「历史任务 6 条」（2026-10-29 17:53 已完成 / 2026-10-28 22:13 已完成 / 22:10 失败 / 22:04 失败 / 21:59 失败 …，含「原始文件未保留（历史快照只存元数据）」说明）——首屏外。
- 本地自造：「预设名称/保存预设」「参考预览」英文提示词块「本次输入快照」「历史任务」通栏。

## 逐条差异

> 原站为 404，无工作区 DOM；下表只列本地可验证问题与对 page-spec 契约（`prompt` + `scenePrompts` 两个字段）的符合度。

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | baseline | — | 整页 | `/draw/ai-pose-generator` 返回 404（「页面不存在 / 您访问的页面可能已被删除、移动或暂时不可用」） | 本地有完整工作区 | `original.png` |
| 2 | 布局 · 提交/结果不可达 | **P1** | 立即生成 / 本次输入快照 / 生成结果 / 历史任务 | 无 | `main` 926 高 / 内容 1549 高 / `overflow-y:hidden`；「立即生成」@242,900 已贴底（22px 高，比其它工具 40px 矮），下方「本次输入快照」「生成结果」「历史任务」全部在 y>1000 不可见 | local.png；`mainSH=1549, mainCH=926` |
| 3 | 视觉 · 主按钮尺寸 | P2 | 立即生成 | 无 | 334×**22**（`min-h` 未生效），同批其它工具主按钮 32–40 高；视觉上像一段文字而非按钮 | rect 334×22 @242,900 |
| 4 | 契约 · 字段覆盖 | P2 | prompt / scenePrompts | 无 | 2 个 §7 字段都有控件（姿势描述 textarea、场景描述多条 textarea），满足 | `local-interact-04-scene-filled.png` |
| 5 | 本地自造 · 姿势库 | P2 | 姿势库 Tab + 4 张姿势卡 | 无（page-spec 只列 prompt/scenePrompts） | 新增「姿势库 / 自定义」段控 + 4 张姿势卡（正面站姿/3/4 侧身/背面回眸/倚墙）+「清空已选」+「保存预设」 | `local-interact-06/07` |
| 6 | 本地自造 · 参考预览 | P2 | 参考预览（英文模板） | 无 | 只读英文提示词块常驻，文本长度 500+ 字符，占配置栏一大段高度 | local.png y755~875 |
| 7 | 本地自造 · 历史任务 | P2 | 历史任务 6 条 | 无 | 页面底部通栏历史列表（含 5 条失败记录 + 「原始文件未保留」说明） | local.png 首屏外 |
| 8 | 交互 · 场景校验 | P1 | 添加场景 / 删除场景 | 无 | 「+ 添加场景」后新增的空场景会**立刻让主按钮变 disabled** 并报「待填写：场景 1 内容为空，请补充或删除该条」——即"可选"的场景一旦添加就变成必填，与副文「场景描述（可选，最多 6 条）」措辞冲突 | 实测 S2→genDisabled true；S1(删空)→false |
| 9 | 壳层 · 全局 | P2 | 促销条 / 算力 / 学习中心 / HelpDock | 无（404 页无壳层） | 本地缺失促销/算力/学习中心；有本地自造 top-right 图标组、右缘竖条、右侧 Agent 面板 | 双端截图 |

## 交互实测（本地，原站 404）

1. 「自定义」Tab → 姿势库卡片区消失，仅保留姿势描述 textarea；「立即生成」由 334×22 @y900（姿势库态）变 334×40 @y734（自定义态，高度恢复 40）。
2. 「3」张 → 预算文案「默认场景等 1 个场景 × 每场景 1 张 = 共 1 张」→「…每场景 3 张 = 共 3 张」；「预计输出 1 张」→「预计输出 3 张」。
3. 「+ 添加场景」→ 出现「场景 1」textarea + 删除按钮（aria-label「删除场景 1」）+ 上移/下移；计数 `0/6 条场景`→`1/6`；预算文案前缀变「场景 1等 1 个场景…」；主按钮变 disabled + 红字「待填写：场景 1 内容为空，请补充或删除该条」（见差异 8）。
4. 填「场景 1」内容「明亮影棚，柔和顶光，浅灰背景」→ 红字消失、主按钮 enabled；预算文案同步「场景 1 · 明亮影棚，柔和顶光，浅灰背景等 1 个场景 × 每场景 3 张 = 共 3 张」。
5. 「删除场景 1」→ 场景 textarea 2→1 个，预算文案回到「默认场景等 1 个场景…」。
6. 「+ 添加场景」×2 → 3 个 textarea、`2/6 条场景`、预算「场景 1等 2 个场景 × 每场景 2 张 = 共 4 张」「预计输出 4 张」。
7. 「姿势库」Tab → 出现 4 张姿势卡（79×105）+「未选姿势：按纯姿势描述生成」+「清空已选」(disabled)。
8. 点「3/4 侧身」→ `aria-pressed` 从 false→true，卡片右上出现 ✓ 边框高亮；说明变「已选姿势：3/4 侧身」；「清空已选」enabled；「参考预览」提示词从 `Pose: natural, relaxed standing pose...` 变 `Pose: 女性模特侧身站立… Additional pose constraints: standing at a three-quarter angle to the camera, weight on the back leg, one hand resting lightly on the hip.`
9. 姿势描述填「女性模特侧身站立，一手扶腰，重心落在后腿」→ 计数 `0/4000`→`20/4000`；红字由「待填写：请先填写姿势描述」变为针对场景的空校验。

## 结论

- 原站 `/draw/ai-pose-generator` 是 404（`ai-pose` 也 404；`ai-posture` 是另一个工具 AI_POSTURE）。已如实截图 404，未伪造工作区截图；**视觉/布局判定 BLOCKED**，不做 1:1 像素结论。
- 本地自身问题：P1 布局溢出（差异 2，主按钮贴底 22px 高、结果区/历史任务全在视口外）、P1 语义冲突（差异 8，「可选」场景一添加就变必填）。
- 由于是 `补充` 工具且原站无页，建议后续验收口径改为「按 page-spec 契约 + 与同类工具（AI_POSTURE）一致性」而非原站 1:1。
- 交互 PASS（本地 8 个控件实测）；功能 REAL_PROVIDER 依据既有真实取证 `evidence/real-acceptance/AI_POSE_GENERATOR/result.json`（PASS，真实 1024×1024 出图 + 三动作可用），本轮未真实提交。
