# 套图设计器 4 工具 × 共享历史坞 复核（2026-10-29）

范围：仅 POSE_SUITE / POSE_UB / FLITE / AMAZON_PRODUCT_DESIGNER 四个工具页与其共享历史坞（`data-testid=tool-history-dock`）。
约束：禁止注入、禁止重新生成、不派子 worker、不读调度 SOP。所有数据均来自 `http://127.0.0.1:3000` 真实页面 `location.reload()`（`performance.getEntriesByType('navigation')[0].type === "reload"`）后的 DOM 与 localStorage（`tool-task:v1:task-*`）。

## 结论总表

| 别名 | toolId | 路由 | 真实任务 | 结果数 | 下载/资产/画布 | 判定 |
|---|---|---|---|---|---|---|
| POSE_UB | AI_POSE_GENERATOR | /tools/product-design/ai-pose-generator | `task-mvs73hbe-ak20fw`（succeeded，2026-10-28 22:13） | 1 | 三键点击均返回「原始文件未保留（历史快照只存元数据），如需文件请重新生成。」 | **REAL_TASK_PRESENT_BYTES_DROPPED** |
| POSE_SUITE | AI_POSTURE | /tools/product-design/ai-posture | 无（localStorage 0 条） | 0 | 无按钮（空态） | **BLOCKED** |
| FLITE | MATERIAL_UPPER_BODY | /tools/product-design/material-upper-body | 无（0 条） | 0 | 无按钮（空态） | **BLOCKED** |
| AMAZON_PRODUCT_DESIGNER | NEW_DESIGNER | /tools/product-design/new-designer | 无（0 条） | 0 | 无按钮（空态） | **BLOCKED** |

## POSE_UB 细节（唯一有真实历史的工具）

- reload 后共享历史坞：`5 条`，1 succeeded / 4 failed；失败 taskId：`task-mvs6zovx-pod3rz`、`task-mvs6r088-39u8zq`、`task-mvs6l55s-fufs7l`、`task-mvs6fr7b-plo8es`。
- 成功任务展开后可见「配置快照（可复用）」：能力 image、模型 `default::gpt-image-2`、接口 openai、尺寸 1:1、质量 auto、数量 1、channelId default，并有「复制配置 JSON」。
- 结果区：`结果（1）`，条目 `task-mvs73hbe-ak20fw-0` 旁标注 **无字节**。
- 持久化数据：`result.items[0] = {id:"task-mvs73hbe-ak20fw-0", kind:"image", payloadDropped:true}` —— 落盘策略已剥离 dataUrl/url/blob。
- 三键 DOM 存在且 `disabled=false`：`tool-history-dock-download`(下载)、`tool-history-dock-save`(存入资产)、`tool-history-dock-canvas`(发送到画布)；逐个点击后返回同一条错误提示，无文件产出。
- 顶栏入口存在：`a[data-testid=workspace-link-assets]`（我的资产）、`a[data-testid=workspace-link-canvas]`（我的画布）。

判定：**历史列表与配置可复原，结果字节不可复原**。要让下载/资产/画布真正可用，必须重新生成（本次明确禁止），因此本轮不做任何代码改动，也不伪造证据。

## 三个 BLOCKED 工具

三者 fresh reload 后共享历史坞均显示 `0 条` + 空态文案「本工具还没有历史任务；提交一次后会在这里留下任务、配置与结果，刷新后仍在。」，localStorage 中对应 toolId 任务数为 0，无任何可复现真实结果 → 按规则记 BLOCKED（不注入、不补造）。

## 证据文件

- `POSE_UB.AI_POSE_GENERATOR.json`
- `POSE_SUITE.AI_POSTURE.json`
- `FLITE.MATERIAL_UPPER_BODY.json`
- `AMAZON_PRODUCT_DESIGNER.NEW_DESIGNER.json`

每份含：toolId/alias/route、freshReload.navType、真实 taskId、resultCount、结果项 payload 状态、历史坞 DOM（testid、计数、条目）、三键 DOM 与点击反馈文本、结论。
