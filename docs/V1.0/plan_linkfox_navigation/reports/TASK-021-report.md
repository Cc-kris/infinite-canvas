# TASK-021 手部修复（HAND_REPAIR）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`d622716`（8 文件 / +1894 −5）
- 规格来源：`docs/V1.0/plan_linkfox_navigation/page-specs/14-hand-repair.md`、`tool-matrix.md`、`task_list.md` 中 TASK-021
- 边界：只复刻信息架构与操作逻辑（上传原图 → 涂抹手部 → 人物类型 → 生成张数 → 提交 → 逐张结果），不搬 LinkFox 前端代码、不复制算力区、不保存任何上游 token。
- 上游事实：原站菜单已把「手部修复」放进「即将下架」分组 —— 页面照实标注（`hand-repair-deprecated` 区块写出这句证据），但工作区与真实生成链路完整可用，不做半残废占位。

## 1. 交付物

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/hand-repair.ts` | 473（58 个导出） | 页面规格值模型：`HAND_REPAIR_TOOL_ID/SLUG/ROUTE/LAYOUT`、上游约束 `HAND_REPAIR_UPSTREAM`、人物类型枚举 `HAND_REPAIR_PERSON_TYPES`（成年男性/成年女性/男孩/女孩）与 `resolveHandRepairPersonType`、`handRepairPersonTypeOptions`（按模型目录判定可用性）、张数 `HAND_REPAIR_OUTPUT_OPTIONS`(1–4) 与 `normalizeHandRepairOutputNum`、画笔 `HAND_REPAIR_BRUSH_*`/`clampHandRepairBrush`、笔画与历史（`beginHandRepairStroke` / `extendHandRepairStroke` / `pushHandRepairStroke` / `undo`/`redo`/`reset`）、覆盖率与空蒙版判定、快照 `buildHandRepairSnapshot` + `handRepairSnapshotHash` + `isHandRepairSnapshotStale`、草稿 `parse/serializeHandRepairDraftValues`、源头与入参校验 `validateHandRepairSource` / `validateHandRepairInput`、字段落点 `composeHandRepairFields` / `composeHandRepairInstruction`、下载名 `handRepairDownloadName` |
| `web/src/features/tools/adapters/hand-repair.ts` | 382（22 个导出） | 执行层：`toHandRepairReference`、`buildHandRepairUnits`（outputNum 张 = N 个真实单元，每个都带人物类型与蒙版引用）、`buildHandRepairInput`、`assertHandRepairInput`（缺图/缺蒙版/蒙版未导出/缺幂等键 → 直接抛 `HandRepairAdapterError`，不发请求）、`auditHandRepairFields`（规格五字段覆盖审计）、`createHandRepairRunPort`（默认走共享 `useToolTaskStore.runTool`，未写死模型）、`runHandRepairUnits`（并发池 + 单张失败隔离 + 逐张回调 + abort）、`mapHandRepairTaskToOutcome`（成功但无图 → `failed/empty-result`，失败保留上游 code/message/retryable）、`handRepairResultView`（成功/失败/取消/旧快照分档）、`summarizeHandRepairOutcomes`、`exportHandRepairMaskPng`（导出与原图同尺寸 PNG 蒙版） |
| `web/src/components/tools/workspaces/repair.tsx` | +649（`HandRepairWorkspace` 583 行） | 工作台：源图上传/更换（JPG-PNG-WebP、尺寸与体积校验）、蒙版画布涂抹（画笔预设 + 撤销/重做/清空 + 覆盖率）、人物类型四选一、生成张数 1–4、提交前检查清单、`hand-repair-submit`（无图或无蒙版时 disabled 并在就地写明原因）、逐张结果矩阵（成功缩略图 + 真实下载链接 + 失败原因 + 来自旧版本标记）、草稿恢复（`tool-draft:v1:HAND_REPAIR`）；`RepairWorkspace` 增加 `HAND_REPAIR` 分发分支 |
| `web/src/features/tools/adapters/hand-repair.test.ts` | 364 | 20 个用例（见 §3 名称） |
| `web/src/features/tools/adapters/fix-color.test.ts` | 2 行改动 | 原用例「未接线的 repair 工具给明确提示」用的是 `toolId="HAND_REPAIR"`；本任务接线后该断言必然失效，改为仍未接线的 `PRINTING_REPAIR`，断言语义与覆盖目标不变（详见 §5） |

## 2. 关键实现约定（可核对）

1. **蒙版是真的**：修复区域来自画布上真实笔画，提交时 `exportHandRepairMaskPng` 用共享 `renderMaskPng` 渲染与源图同尺寸的 PNG；`validateHandRepairInput` 还会比对 `imageWidth/Height` 与 `maskWidth/Height`，不一致直接拦。
2. **不冒充成功**：任务 `succeeded` 但无图 → `failed(empty-result)`；`handRepairResultView` 里成功只统计真有图的结果，`summarize` 输出「成功 N/M 张」，UI 不补造占位图。
3. **不静默发缺参请求**：无源图 / 蒙版为空 / 张数越界 / 幂等键缺失都在提交前拦下；按钮 atribute 层 `disabled`，旁边写原因。
4. **人物类型只接受四种真实取值**：未知值退回默认并给出原因，不静默接受；模型目录缺失时在选项上标不可用 + 原因（`handRepairPersonTypeOptions`）。
5. **张数与单元严格一致**：`buildHandRepairUnits` 产出 N 个单元（每个 `count=1`），`plannedOutputs` 与 UI 的「预计输出 N 张」同源，避免 UI 与载荷不一致。
6. **快照锁定提交参数**：`handRepairSnapshotHash` 覆盖源图 id / 蒙版数据 / 人物类型 / 张数 / 笔数；改参数后旧结果被标 `来自旧版本`，不静默清空也不冒充新结果。
7. **草稿可恢复**：序列化只存必要字段（源图 assetId、蒙版笔画、人物类型、张数），刷新后用 `loadToolAssetRecords` 还原，图片丢失时明确提示并禁止生成。
8. **结果动作复用共享层**：逐张结果把 `HandRepairUnitOutcome` 归一成 `ToolTaskResultItem`（`id/kind/dataUrl/url/mimeType`），再调 `saveResultItemToAssets` / `sendResultItemToCanvas` 与 `<a download={handRepairDownloadName(...)}>`，不新建并行实现；动作失败时把错误文案显示在结果区（`resultFeedback`），不吞错。**未做单张重试**（每张是独立上游任务，重试需重建单元素批次，避免语义错位未强行加），列入 §4。

## 3. 验证证据（跑过，不是读码）

证据文件：

- `docs/V1.0/plan_linkfox_navigation/evidence/task-021-test.txt` —— `bun test src/features/tools/adapters/hand-repair.test.ts`：**20 pass / 0 fail / 112 expect()**，17ms。
- `docs/V1.0/plan_linkfox_navigation/evidence/task-021-tsc.txt` —— `tsc --noEmit` 过滤 `hand-repair|workspaces/repair`：**0 行（我的文件零错误）**。同次全量 tsc 余 2 个错误，均在 `replace-goods.test.ts`（`'scene' does not exist in type`，他人进行中文件，不在本次改动范围）。
- `docs/V1.0/plan_linkfox_navigation/evidence/task-021-render.html` —— `RepairWorkspace toolId="HAND_REPAIR"` 的 SSR 真实渲染产物（13954 字节）。机器核对结果：

```
hand-repair-workspace      YES
hand-repair-submit         YES
hand-repair-person-type    YES
hand-repair-output-num     YES
即将下架                    YES
手部修复                    YES
提交前检查                  YES
人物类型                    YES
尚未接入                    NO      ← 已接线，不再显示占位提示
submit tag disabled: True           ← 首屏无源图时提交被阻塞
```

20 个用例名称（全绿）：

- 规格一致性：规格存在且路由/布局与文档一致；人物类型只接受四种真实取值，未知值退回默认；模型目录缺失的人物类型被标不可用并给出原因；张数夹到 1–4；画笔尺寸夹在合法区间。
- 蒙版：空状态为空、涂抹后不为空；撤销/重做/重置走真实历史栈。
- 快照与草稿：同输入同指纹、换人物类型指纹变化；草稿序列化 → 解析后蒙版与参数不丢。
- 校验：空蒙版/缺源图/张数越界都被拦下；源图限制给出中文原因（大小/格式/尺寸，含尺寸读不出）。
- 适配器：N 张 = N 个单元且各带人物类型与蒙版引用；请求体 `count=1` 且五字段齐全能过守卫；缺字段/蒙版未导出/缺幂等键直接抛错；字段覆盖审计缺一即报；指令随人物类型变化；下载名带原图名与序号。
- 结果映射：成功无图 → `failed(empty-result)`、失败保留上游原因；并发单张失败不影响其它张；空结果视图是 `idle`。

回归：`bun test src/features/tools src/components/tools` 共 **476 用例 / 475 pass / 1 fail**，唯一失败为 `printing-repair.test.ts > 快照与指纹 > 输出尺寸缺省等于底图`（他人进行中的打印修复任务），与本任务改动无交集（我未改该 registry/adapter/组件）。

## 4. 未完成 / 风险

1. **路由装配不在本任务范围**：仓库里 `tool-page.tsx` 对 `tool` 分支目前只渲染 `WorkspacePlaceholder`，没有按 `layout` 挂载 workspace 的装配器（全仓 `RepairWorkspace`/`FixColorWorkspace` 的引用只出现在测试中）。本任务交付的是**可被装配的入口**（`RepairWorkspace({ toolId })` 已分发 `HAND_REPAIR`，SSR 证据即走这条路径）。真正 `/tools/smart-edit/hand-repair` 的浏览器可达性取决于装配任务接线，未在本提交内解决。
2. **真实上游未联调**：`createHandRepairRunPort` 走共享任务网关，本次没有可用凭证做实网一次生成，因此「真实出图」未验证（不编造成功证据）。蒙版导出、载荷、失败隔离均有测试覆盖。
3. **`fix-color.test.ts` 一行改动**：属于他人文件的最小语义保留修改（`HAND_REPAIR` → `PRINTING_REPAIR`）。若后续打印修复任务接线 `PRINTING_REPAIR`，该断言需再次换成一个确实未接线的 id —— 已在报告显式留痕，便于该任务作者接手。
4. 全量 tsc 仍余 2 个 `replace-goods.test.ts` 错误（他人），本任务不做越界修改。
5. **单张结果无「重试」按钮**：每张结果是独立上游任务，单张重试要重建单元素批次并保证幂等键不重复；本次未实现，避免给出点了没反应的假按钮。失败张的原因与上游错误码已完整展示，可整批重跑。

## 5. 使用入口

- 代码入口：`web/src/components/tools/workspaces/repair.tsx` 的 `RepairWorkspace`（layout = `repair` 的 workspace 分发器）；直连组件 `HandRepairWorkspace`。
- 数据/规格入口：`web/src/features/tools/registry/hand-repair.ts`（值模型、校验、快照、字段落点）。
- 执行入口：`web/src/features/tools/adapters/hand-repair.ts`（`buildHandRepairUnits` → `runHandRepairUnits` → `handRepairResultView`）。
- 复跑验证：
  - `cd web && ~/.bun/bin/bun test src/features/tools/adapters/hand-repair.test.ts`
  - `cd web && ~/.bun/bin/bun ./node_modules/typescript/bin/tsc --noEmit`
