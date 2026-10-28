# TASK-033 AI_POSE_GENERATOR「AI 姿势生成」实施报告

- 分支：`feat/linkfox-v1-real`
- 代码提交：`a9a019b` feat(tools): AI_POSE_GENERATOR AI姿势生成工作区与提交契约（24 用例）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/26-ai-pose-generator.md`
- 注册表：`registry/index.ts` 已有 `id: AI_POSE_GENERATOR`、`makeType: 57`、`layout: "model"`、`category: product-design`、`route: /tools/product-design/ai-pose-generator`
- 网关：`gateway.ts:87` 已声明 `kind: "image"`、`requiresReferences: false`、`promptRequired: true`、`fields: ["prompt", "scenePrompts"]`

## 1. 改了什么

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-pose-generator.ts` | 647 | 页面契约：姿势库（分站姿/角度/动态/坐姿四类的结构化指令）、姿势预设保存与应用、多场景列表（增删改调序）、可编辑状态与 40 步撤销重做、字段级校验（9 个错误码）、prompt 合成、快照指纹与漂移、草稿容错读写 |
| `web/src/features/tools/adapters/ai-pose-generator.ts` | 452 | 按场景摊平成单元、请求装配（`prompt` + `scenePrompts`，无参考图）+ 提交前守卫、`runAiPoseGeneratorPlan` 串行执行与单组重试、结果出口（空结果/未知状态/过期）与字段回读审计 |
| `web/src/components/tools/workspaces/model.tsx` | 1450（原 749） | 新增 `AiPoseGeneratorWorkspace`：左「姿势描述 + 姿势库 + 预设」· 中「场景列表 + 每场景真实 prompt 预览」· 右「结果（按场景分组，失败组可单独重试）」；工具栏撤销/重做/存预设；移动端分区；无假结果 |
| `web/src/features/tools/adapters/ai-pose-generator.test.ts` | 440 | 24 个用例：契约/姿势库/场景冲突/校验/草稿/快照/预设与撤销/请求装配/串行执行/空结果/单组重试/过期/SSR 首屏 |

## 2. 关键设计决定（都有代码依据）

### 2.1 「场景」不允许偷偷改写姿势

规格要求场景只能约束环境/光线/道具。`aiPoseSceneConflicts(sceneText)` 用一组姿势动词与身体部位词做交叉检测，命中即产出 `scene-overrides-pose`，并且**在两层都拦**：

- 注册表 `validateAiPoseGeneratorWorkspace` → 工作区提交按钮禁用 + 给出具体是哪条场景；
- 适配器 `assertAiPoseGeneratorWorkspace` → 即使绕过 UI 直接调适配器也抛错，不发请求。

测试同时覆盖正例与反例（"纯白影棚，地面浅灰反光" 不误判），避免过度拦截。

### 2.2 一个场景 = 一个真实请求，不是一次请求的 N 张

`planAiPoseGeneratorUnits` 为每条场景产出一个 `AiPoseGeneratorUnit`，`count = outputNum`（1–4），于是总产出 = 场景数 × 每场景张数，并有 `image-budget` 上限 24（6 场景 × 4 张）。这样每个场景的 prompt 是**各自合成**的（`buildAiPoseGeneratorPrompt(workspace, sceneText)`），预览区显示的正是会发出去的那段文本，不存在"预览与实发不一致"。

### 2.3 prompt 合成：姿势是主语，场景是状语

`buildAiPoseGeneratorPrompt` 逐段拼接：固定主体句 → 姿势描述（用户原文）→ 姿势库选中的结构化指令 → 场景（环境/光线/道具）→ 明确约束"场景不得改变姿势、不得增减肢体"。姿势库不是装饰：测试断言选中姿势的 `instruction` 必须出现在最终 prompt 里。

### 2.4 提交锁快照，配置一改结果立刻标旧

提交时把 `snapshotHash` 锁进单元与结果视图；之后任何编辑（姿势/场景/张数/预设）都会使 `isAiPoseGeneratorResultStale` 为真，结果区显示"配置已改，结果属旧版本"。旧结果不会被当成新配置的产物，也不会被清空丢失。

### 2.5 失败不伪装：空结果 / 未知状态 / 单组重试

- 上游 `status: "completed"` 但无图 → `failed` + `empty-result`，绝不补占位图；
- 上游状态异常 → `unknown` + `task-<status>`，提示"只能查询或人工确认，禁止盲目重提"；
- `failedAiPoseGeneratorUnits` 挑出失败单元，`retryAiPoseGeneratorUnit` **复用同一 `unit.id` 与 `clientOperationId`**，重试结果归回同一场景分组，不产生重复分组。

### 2.6 输入即截断，不产生超限草稿

`setAiPosePrompt` / `updateAiPoseScene` 在写入时就截断到 4000 字，预设名截断到 24 字、最多保存 12 条。因此"超长"只能从外部（草稿/注入）进入，`pose-prompt-too-long` 与 `scene-too-long` 仍在校验里兜底。测试最初按"setter 可超限"写，跑出失败后按真实语义改正——这是设计意图，不是放宽断言。

## 3. 验证（跑出来的，不是读出来的）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 本任务用例 | `bun test src/features/tools/adapters/ai-pose-generator.test.ts` | **24 pass / 0 fail**，133 断言 |
| 相邻回归 | 上者 + `ai-posture.test.ts`（同一 `model.tsx` 文件内的另一个工作区） | **47 pass / 0 fail**，303 断言 |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 本次 4 个文件 **0 错**；仓库内 `pod.tsx`、`sds-design.test.ts` 有他人遗留错误 |
| 全量基线 | `bun test`（817 用例 / 40 文件） | 13 fail，**全部集中在 `adapters/sds-design.test.ts`**（TASK-031 范围），与本改动无交集 |

SSR 首屏断言（`renderToStaticMarkup` + `MemoryRouter`）确认：页面根节点、姿势输入、场景列表、按场景分组的 prompt 预览、张数 1–4（默认 1 选中）、预设芯片、草稿键名都在；空姿势时提交按钮 `disabled` 且给出"请先填写姿势描述"。

## 4. 未完成 / 风险

1. **路由还没接上工作区组件**：`features/tools/tool-page.tsx` 目前不按 `layout` 分发，`workspaces/model.tsx` 只被测试引用（`AiPostureWorkspace` 同样是这种状态）。所以 `/tools/product-design/ai-pose-generator` 仍渲染占位页。接线需要改 `tool-page.tsx`（不在本任务允许文件内），建议单独开一个 TASK 统一处理 `layout: "model" | "text" | "image"` 的分发表。
2. **未跑真实 provider**：所有执行断言都走注入的 mock `run` 端口，覆盖了请求装配、抛错、空结果、串行与重试；真实网关返回结构变化（例如多返回一张图）不会被这些用例发现，需要一次真机联调。
3. **全量基线不干净**：提交前若看到 13 处失败，请先确认都在 `sds-design.test.ts`，不要误判为本任务回归。
4. **场景冲突检测是启发式**：基于措辞与部位词的交叉匹配，可能漏掉极其隐晦的改写（如纯隐喻）。这是"宁可让用户改写，也不默默生成错姿势"的取舍。

## 5. 使用入口

- 代码：`registry/ai-pose-generator.ts`（契约）→ `adapters/ai-pose-generator.ts`（请求与结果）→ `components/tools/workspaces/model.tsx` 的 `AiPoseGeneratorWorkspace`（界面）
- 用例：`bun test src/features/tools/adapters/ai-pose-generator.test.ts`
- 接线待办：`features/tools/tool-page.tsx` 增加 `layout === "model"` → AI 姿势生成 / 姿势裂变的分发
