# DRESS_WEAR_SET r12 — 结果面板重建（修 7664498 的 tool-result 缺口）

复用真实任务 **task-mvt74l6q-1vljau**（`succeeded`，storageKey `tool-result:UJkgjc6BIYFLDnO12F3G-`）。
本轮**未新建 task、未注入结果**，只做 hydrate/adapter 修复与 fresh reload 复验。

## 根因

hydrate 链路本身是好的（`useToolTaskStore.hydrate` → `restorePersistedTaskMedia` → `resolveMediaUrl(storageKey)`），
刷新后 `dress-group-*` 也能出图。缺的是**结果面板**：`dress-suite.tsx` 结果区只渲染自有分组块，
从未挂载共享 `ToolResult`，所以 `[data-testid=tool-result]` 永远为 null，三动作只能靠历史坞按钮。

## 修法（代码已提交 61e86fc）

- `adapters/dress-wear-set.ts` 新增 `dressResultPanelTask(tasks)`：把本页真实任务的结果项**原样聚合**
  成面板视图（items 复用，含 storageKey 复原的字节），不新建任务、不伪造/改写字节；无任务返回 null。
- `workspaces/dress-suite.tsx` 结果区挂载 `<ToolResult task={panelTask} ...>`（`data-testid=tool-result`），
  暴露标准三动作 `tool-result-download-N / -save-N / -canvas-N`。
- 单测：空表返回 null、聚合保序且保留 storageKey/bytes、运行中状态跟随。

## 结论

| 项 | 结论 | 证据 |
|---|---|---|
| 整页 reload 后历史恢复 | VERIFIED | `reload-panel.json`：`navType=reload`、`dress-group-modelLook/whiteBg`、`共 2 组 · 成功 2 · 产物 2 张` |
| 结果面板重建 | VERIFIED（原缺口已闭合） | `reload-panel.json`：`panel=true`、`view=succeeded`、`共 2 个结果 · 图片 2`、两项 1024x1024 |
| 真实字节持久化 | VERIFIED | `bytes.json`：item 2516552B / 1883817B，其中 1883817B 与 `r11/bytes.json` 的 storageKey 记录逐字节一致 |
| 三动作 | VERIFIED | `actions.json`：面板按钮真实点击回执「已保存到资产库 k6hs…」「已发送到画布 dqIF3G…」「已下载 dress-wear-set-result-1.png」 |

## 遗留

结果面板与自有分组块并存（分组块保留场景/重试语义），属产品层面的双视图，非缺口。
