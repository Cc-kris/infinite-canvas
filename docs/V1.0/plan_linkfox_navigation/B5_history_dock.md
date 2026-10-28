# B5 · 工具页共享历史面板（ToolHistoryDock）

**状态**：已实现并通过真实 UI 验收（17/17）

## 1. 问题

17 个工具工作台（AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN / SCENE_TRANSFER / AI_DRESSING_V2 /
AI_DRESSING_XSY / AI_POSE_GENERATOR / AI_POSTURE / AI_WEARABLE / FISSION_LINK /
NEW_REPLACE_BG_V2 / HANDHELD_GOODS / MATERIAL_UPPER_BODY / CHANGE_COLOR_V2 / SCALE_UP /
AI_VIDEO_EDITING / SALE_VIDEO）提交后只能看当前这一单：刷新即丢，无法回看上一单做了什么、
用了什么配置、产出什么。用户只能重新点一遍生成，等于把已付过费的结果扔掉。

`PRODUCT_REFINE` / `CHANGE_COLOR` / `AI_OUTPAINTING` / `VIDEO_CONCAT` / `VIDEO_TRANSLATION`
已有结果区内的「历史记录」tab（`ToolTaskHistory`），这 5 个不需要也不应该再叠一层。

## 2. 方案

新增**页面级共享组件** `web/src/components/tools/tool-history-dock.tsx`，一次开发覆盖 17 个工具：

- 数据源与应用自身完全同一条链路：`useToolTaskStore.tasks`（`persistTask()` 落盘的
  `ToolTask` 快照），不新开存储、不复制一份历史。
- 挂载点单一：`web/src/features/tools/tool-page.tsx` 的 `case "tool"` 分支，
  在真实 workspace 之下渲染；`WORKSPACE_OWN_HISTORY`（5 个自带历史的 toolId）跳过挂载，
  避免同页出现两块历史。
- 不伪造复用：面板展示配置快照与输入素材 id，并可**复制配置 JSON**；不做「一键回填整个表单」
  的假承诺（那需要各工具自己声明字段映射，属另一个量级的改造）。

## 3. 面板呈现

折叠行（默认）：
- 状态徽标（复用 `TaskStatusBadge`）、创建时间、提示词摘要（空则「（无提示词）」）
- `模型 · 能力 · N 个结果` 摘要
- 图片结果缩略图（最多 3 张，真实 `<img>` 解码）；视频结果显示「视频结果 N 个」徽标
- 字节已被剥离（`payloadDropped`）时明确写「结果字节未保留」，不画假图

展开行：
- 配置快照 `dl`（模型 / 能力 / 数量及其他真实字段）+ 输入素材 id
- 结果项网格（图片 `<img>` / 视频 `<video controls>`）
- 每个结果项三个动作：下载（`downloadResultItem`）、存入资产（`saveResultItemToAssets`）、
  发送到画布（`sendResultItemToCanvas`）——全部走应用既有模块，不新写路径
- 失败任务展示真实 `error.code` / `message`，不吞错
- 动作反馈条 `data-testid="tool-history-dock-feedback"`，`data-tone=success|error`

## 4. 验收方式（真实，不 mock）

脚本：`web/scripts/real-acceptance/run-b5-history-dock.mjs`
静态产物服务：`web/scripts/real-acceptance/serve-evidence.py`（只读暴露 evidence 目录，带 CORS）

每个工具：
1. 打开真实路由，等待 `[data-testid="tool-history-dock"]`；
2. 用应用自身的 `persistTask()`（Vite 下 `import("/src/stores/use-tool-task-store.ts")`）
   写入 3 条任务快照：2 条成功（结果 URL 指向**该工具上一轮真实 provider 调用的产物字节**）、
   1 条失败（带上游 502 真实错误文本）；
3. **刷新页面**，断言条目数 3、计数文本「3 条」、缩略图 `naturalWidth > 0` 真实解码；
4. 展开成功与失败条目，断言配置快照、结果项、错误原因都在；
5. 真实点击：下载（断言落盘字节数 = 源文件字节数）、存入资产（断言返回资产 id）、
   发送到画布（断言返回项目 id + 节点 id）、复制配置（读回剪贴板，断言含 `toolId`/`configSnapshot`）；
6. 另验 `PRODUCT_REFINE`（自带历史）页面上页面级 Dock 数量为 0。

产出：`evidence/real-acceptance/B5_HISTORY_DOCK/summary.json` + `CHECKLIST.md` + 截图。

## 5. 已知边界

- 复用是「看得见 + 拿得走」：配置 JSON 可复制、结果可下载/入资产/进画布；不做表单自动回填。
- 结果字节只在 localStorage 容量内保留（`sanitizeTaskForPersist` 剥离 dataUrl/blob），
  远程 `url` 保留；字节被剥离时面板如实提示。
- 视频结果的折叠行只给徽标，不做封面抽帧。
