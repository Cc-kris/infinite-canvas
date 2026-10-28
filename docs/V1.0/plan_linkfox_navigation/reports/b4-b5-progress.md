# B4/B5 落地进度（2026-10-29）

## 前置：WIP 备份（禁止 reset/覆盖）

- 分支 `feat/linkfox-v1-real`，中断前的翻译/扩图/B2/B7 改动**保留在工作树**。
- 备份点：分支 `backup-wip-20261029`（stash commit `12972ae`）+ `.backup-wip-20261029/wip-tracked.diff`（全量 tracked diff）。
- 只提交本任务相关文件；其它 WIP 不动、不提交。

## 范围（B4）

14 个工具的结果区三动作（下载 / 存入资产 / 发送画布）+ 动作后 busy 必须恢复：

AI_DRESSING_V2 / AI_POSE_GENERATOR / AI_POSTURE / AI_WEARABLE / FISSION_LINK / NEW_REPLACE_BG_V2 /
AI_OUTPAINTING / HANDHELD_GOODS / MATERIAL_UPPER_BODY / CHANGE_COLOR_V2 / SCALE_UP /
IMAGE_TRANSLATION / AI_VIDEO_EDITING / SALE_VIDEO

## 已修（通用层）

- `web/src/components/tools/tool-result.tsx` + `tool-result-actions.ts`
  - 单卡 busy 判定从 `pending.endsWith("-"+index)` 改为 `isItemPending()` 精确解析：
    旧实现下 `retry-10` 会命中第 0 张，导致「一张在跑、另一张锁死」。
  - 三动作仍走真实链路（file-saver / image-storage / 资产库 / 画布 store），
    `run()` 的 `finally` 保证失败也恢复 busy。

## 工具 → 工作区映射（复核用）

| 工具 | 工作区文件 | 结果区形态 |
| --- | --- | --- |
| AI_DRESSING_V2 | workspaces/dressing.tsx | ToolResult（共享） |
| AI_POSE_GENERATOR / AI_POSTURE | workspaces/model.tsx | 定制结果区 |
| AI_WEARABLE / MATERIAL_UPPER_BODY | workspaces/dress.tsx | 定制结果区 |
| FISSION_LINK / NEW_REPLACE_BG_V2 | workspaces/scene.tsx | ToolResult |
| AI_OUTPAINTING | workspaces/outpaint.tsx | ToolResult + 历史面板 |
| HANDHELD_GOODS | workspaces/handheld-goods.tsx | ToolResult |
| CHANGE_COLOR_V2 | workspaces/color-v2.tsx | 定制结果区 |
| SCALE_UP | workspaces/enhance.tsx | ToolResult + 历史面板 |
| IMAGE_TRANSLATION | workspaces/translate.tsx | 定制结果区 |
| AI_VIDEO_EDITING / SALE_VIDEO | workspaces/video.tsx | ToolResult |

## 验收方式（不 mock、不重复生成）

- 复用证据目录里的真实产物字节（`evidence/real-acceptance/<TOOL>/result.*`），
  经应用自身 `persistTask()` 落盘 → 刷新 → 历史「查看结果」→ 点真实按钮；
- 证据：DOM（data-testid）、资产库 store、画布 store、下载文件字节数。

## 未完成清单

- [ ] 定制结果区（model / dress / color-v2 / translate）三动作与 busy 恢复逐一核对
- [ ] B5 历史面板铺开到 14 工具
- [ ] 14 工具逐工具真实验收证据（DOM/IDB/画布）
