# TASK-014 notes（局部重绘 AREA_REPAIR 页面 + adapter）

- 分支：`feat/linkfox-v1-real`
- 提交：`6fbb5de`（实现 4 文件）、`0957c65`（工作台渲染证据测试）
- 任务卡：`docs/V1.0/plan_linkfox_navigation/task_list.md#TASK-014`（TC-022 / AC-022）

## 1. 交付物

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/area-repair.ts` | 480 | 规格与状态机：笔刷/橡皮/羽化/反选/自动扩边、可撤销笔画历史、蒙版栅格化、快照指纹与字段守卫、zod 校验 |
| `web/src/features/tools/adapters/area-repair.ts` | 441 | 蒙版 PNG 导出（与原图同尺寸）、提示词合成、请求单元（原图+蒙版双参考）、逐单元并发执行与结果映射 |
| `web/src/components/tools/workspaces/mask.tsx` | 697 | 涂抹工作台：画布涂抹、工具条、描述/张数、草稿水合与落盘、原图与结果并排、下载/存素材/送画布 |
| `web/src/features/tools/adapters/area-repair.test.ts` | 541 | 32 用例 / 123 断言：规格、笔刷历史、栅格化、草稿往返、校验、单元构建、字段守卫、并发与取消 |
| `web/src/components/tools/workspaces/mask.test.tsx` | 86 | 4 用例 / 36 断言：真实组件渲染，断言分区齐全与阻塞态 |

## 2. 关键实现取舍

1. **蒙版只做「涂抹」这一条真实链路**：笔画是唯一真源（`MaskHistory`），撤销/重做/重置都走历史栈。重置被实现为**可撤销**的清空（`past` 保留当前笔画），避免用户误点丢工作 —— 有专门用例固定这个行为。
2. **蒙版 PNG 与原图严格同尺寸**：`renderMaskPng` 以原图长边为基准等比铺满导出，避免「蒙版尺寸 ≠ 原图尺寸」被上游拒；`validateAreaRepairInput` 对此有硬校验（用例覆盖尺寸不一致报错）。
3. **请求只发两张参考图**：原图 + 蒙版，并显式声明「只修改蒙版内区域」。`auditAreaRepairFields` 做「规格字段 → 请求体」的落地检查，缺一项就报 issue，防止规格字段被静默丢掉。
4. **张数不合规回落默认值**（`normalizeOutputNum(9) → 1`），而不是钳到边界 4 —— 避免用户误以为选了 4 张。
5. **草稿**：`use-tool-draft-store` 的 `hydrate/patch` + `flushToolDrafts`，键与共享约定一致（`tool-draft:v1:<toolId>`）；换图会清空蒙版（坐标失效）。
6. **不编造结果**：结果区只渲染上游返回的 outcome；空态文案明确「完成涂抹 + 描述后点「立即生成」」，未上传/未涂抹/未填描述时提交按钮阻塞并列 issue。

## 3. 验证证据（跑，不是读码）

```
$ cd web && npx prettier --write <5 files>        → 全部成功
$ npx tsc --noEmit                                → TSC_EXIT=0（全仓 0 错误）
$ npx bun test src/features/tools/adapters/area-repair.test.ts
  32 pass / 0 fail / 123 expect()
$ npx bun test src/components/tools/workspaces/mask.test.tsx
  4 pass / 0 fail / 36 expect()
$ npx bun test <两个测试文件>
  36 pass / 0 fail / 159 expect() across 2 files
```

渲染证据细节（`mask.test.tsx`，`react-dom/server` + `MemoryRouter`）：

- 分区：`area-repair-workspace` / `mask-toolbar` / `area-repair-prompt` / `area-repair-output-num` + 文案「重绘描述 / 生成张数 / 结果 / 立即生成」。
- 工具：`mask-tool-brush`、`mask-tool-eraser`、`mask-brush-size`、`mask-feather`、`mask-auto-expand`、`mask-invert`、`mask-undo`、`mask-redo`、`mask-reset`。
- 阻塞态：未上传时提交按钮带 `disabled=""`，无「生成中」，无 `area-repair-results`，issue 列表含「请先上传要重绘的图片 / 请先在图片上涂抹需要重绘的区域 / 请填写重绘描述」。
- 空蒙版：出现涂抹指引与 `mask-coverage`，且不渲染 `mask-canvas`（画布依赖真实原图尺寸）。

## 4. 偏差与风险

- **多交付 1 个文件**：任务卡允许文件列表是 4 个，我额外加了 `mask.test.tsx`（渲染证据）。仓库已有同类先例（`workspaces/enhance.test.tsx`、`scale-up.test.ts`），按「验证=跑不是读码」补充，未改任何他人文件。
- **未接路由**：`AREA_REPAIR_ROUTE = "/tools/smart-edit/area-repair"`、`AREA_REPAIR_LAYOUT = "mask"` 已在 registry 定义，但 `tool-page.tsx` 的 layout→workspace 映射属于页面装配任务（与 color-v2 / outpaint 同批），本次未改动，避免与并行 worker 冲突。
- **无真实上游调用**：`createAreaRepairRunPort` 走的是任务机 `runTool`；端到端出图需配好模型与额度后在真实页面点一次（本地无凭据，未跑）。
- **画布交互靠逻辑测试兜底**：`mask-canvas` 的指针涂抹无法在 SSR 环境跑，覆盖方式是「笔画状态机 + 栅格化纯函数」的单元测试（覆盖率、反选互补、自动扩边变大、撤销重做），交互层未做 DOM 事件仿真。
- **与并行 worker 的文件碰撞（局部消除 REMOVE_PEN）**：`mask.tsx` 被另一路 worker 继续追加 remove-pen 代码（当前工作区 `+32` 行未提交，非我改动，我未提交它）。因此**工作区当前 `tsc` 会报 2 个错误，均不在我的代码上**：
  - `mask.tsx(46,29)` —— 那行是对方新增的 `import { exportRemovePenMaskPng } from "@/features/tools/adapters/remove-pen"`，其 adapter 尚未导出该成员；
  - `features/tools/adapters/change-color.ts(332,5)` —— 另一路 change-color 的类型不匹配。

  我这 4 个交付文件在提交时 `tsc --noEmit` = 0 错误（见第 3 节证据），提交后我的两个测试文件仍 36/36 通过。

## 5. 使用入口

- 路由：`/tools/smart-edit/area-repair`（需页面装配完成后可达）
- 模块入口：`registry/area-repair.ts`（规格/状态机）、`adapters/area-repair.ts`（出图链路）
- 自测命令：`cd web && npx bun test src/features/tools/adapters/area-repair.test.ts src/components/tools/workspaces/mask.test.tsx`
