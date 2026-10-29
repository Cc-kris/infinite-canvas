# REMOVE_PEN 落盘任务 fresh reload 恢复：真实回执与字节审计（2026-10-29）

## 1. 本次修复（已提交）

| 项 | 内容 |
|---|---|
| commit | `2f0b607` fix(remove-pen): 刷新后从落盘任务恢复真实结果与三动作 |
| 改动 | `web/src/components/tools/workspaces/mask.tsx`（RemovePenWorkspace hydrate 任务库 + `restoredRun` + 结果区不再以本会话原图为门禁）、`web/src/features/tools/adapters/remove-pen.ts`（`RemovePenUnitRef`，只需 id/snapshotHash）、`remove-pen.test.ts`（+2 条恢复回归用例） |
| tsc | `tsc --noEmit` exit 0 |
| 测试 | `bun test src/components/tools/workspaces src/features/tools src/stores` → 1211 pass / 0 fail（59 files）；`remove-pen.test.ts` 18 pass |

改动语义：本会话 `run` 优先；没有时从 `use-tool-task-store` 里取最近一条带图片地址的 `REMOVE_PEN` succeeded 任务，
用既有 `removePenRunFromTask` 还原成同构 run，下载/存资产库/发画布继续吃该任务的真实字节；**没有字节就不标成功，绝不补造占位图**。

## 2. 真实运行态审计（只读，未注入、未新生成）

来源：`http://127.0.0.1:3000` 同源页面的 `localStorage` / `indexedDB`（65 个 task 键；其中 REMOVE_PEN 6 条）。

### 2.1 指定的两条接续任务

| taskId | toolId | status | result.items | 结论 |
|---|---|---|---|---|
| `task-mvsaz6ar-m6osdl` | REMOVE_PEN | **failed**（submit-unconfirmed，页面刷新中断提交） | `[]` | 无结果、无可恢复字节；是失败任务，不做恢复 |
| `task-mvsc4fyg-qobp8k` | CHANGE_COLOR_V2 | succeeded | `[{ id: "...-0", kind: "image", payloadDropped: true }]` | 结果项**无 url / 无 storageKey**，字节未入库 |

### 2.2 REMOVE_PEN 三条 succeeded 任务（原以为可恢复的字节来源）

| taskId | status | receivedAt | result.items |
|---|---|---|---|
| `task-mvsa3pt6-4wqy46` | succeeded | 1793202144236 | `[{ id: "task-mvsa3pt6-4wqy46-0", kind: "image", payloadDropped: true }]` |
| `task-mvsba8fo-iplfjq` | succeeded | 1793203903627 | `[{ kind: "image", payloadDropped: true }]` |
| `task-mvsaus49-i7vsmt` | succeeded | 1793203168489 | `[{ kind: "image", payloadDropped: true }]` |

补充：`task-mvsaq4oa-4giro0`、`task-mvs9xe7s-9jmboc` 为今日新增 failed（0 items）。

## 3. 关键结论（如实记录，不美化）

1. **字节缺口发生在落盘入库阶段，不在恢复阶段**：三条 succeeded 的 REMOVE_PEN 任务与 `task-mvsc4fyg-qobp8k`（CC_V2）全部 `payloadDropped: true`，即 `ingestResultMedia` → `uploadMediaFile` 抛错后按设计“保留内存字节、落盘标记丢弃”。
2. 因此**当前这批历史任务在 fresh reload 后不可能给出真实图片字节**；任何“恢复出图”都会是伪造，本次修复选择明确降级：
   - 有字节（`url`/`dataUrl`/`storageKey`）→ 结果卡 + 三动作真实可用；
   - 无字节 → 判失败并显示上游/缺字节原因，不渲染占位图、不点亮三动作。
3. 由于弹窗被浏览器拦截（`window.open` 未产生新标签），本次**未完成独立标签的 fresh reload UI 取证**；现有证据为同源页面只读数据审计 + 单测覆盖（两条用例分别验证“仅有 id/snapshotHash 也能还原真实字节”与“成功但无字节不伪造”）。
4. `indexedDB` 现状（`infinite-canvas`）：`media_files` 92 条、`tool_assets` 57 条、`image_files` 76 条 —— 说明媒体仓本身可用，缺的是**结果项入库这一步在真实链路上抛错**，属于待查根因（下一步应抓 `uploadMediaFile` 的实际异常：CORS/CSP 下 `fetchMediaBlob` 失败、或 0 字节/超时）。

## 4. 复验入口

```bash
cd web
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit
~/.bun/bin/bun test src/components/tools/workspaces src/features/tools src/stores
```

页面：`http://127.0.0.1:3000/tools/smart-edit/remove-pen` → 整页刷新后，结果区应显示
`data-testid="remove-pen-restored-task"` 或如实显示无结果（取决于该任务是否真有字节）。
