# 电商套图四工具 · 真实生成验收报告

- 时间：2026-10-29 17:47 ~ 18:04（Asia/Shanghai）
- 环境：`http://127.0.0.1:3000`（Vite dev），Chrome 155.0.8059.85，页面作用域 CDP
- 纪律：未注入历史、未派子 worker、未修改任何工具源码；失败保持原始错误

## 1. 结论

四个工具全部走「真实输入 → 真实任务 → 真实结果字节」链路，均 `succeeded`，产出可解码 PNG，尺寸/字节/sha256 与任务记录一致，且 4 张图均已「存入资产」。

| 工具 | taskId | 尺寸 | 字节 | sha256(前 8) | 下载 | 资产 |
|---|---|---|---|---|---|---|
| AI_POSTURE | task-mvtczxwo-e1d1w0 | 1024×1024 | 1,557,308 | 03ec4754 | ✅ 落盘 | ✅ JBUR9FikfKJ9MKa4mqGNt |
| MATERIAL_UPPER_BODY | task-mvtd45nv-y7cum6 | 1024×1024 | 1,525,374 | 79bddf28 | ✅ 落盘 | ✅ HF5bgHaqdS4Lo33cIxWIB |
| AI_POSE_GENERATOR | task-mvtd89f3-9qpix6 | 1024×1024 | 1,151,209 | 19028125 | ⚠️ BLOCKED（见 §4） | ✅ ScqDTYWu9xr2BohjvgVTK |
| NEW_DESIGNER（AMAZON_PD） | task-mvtdl9v8-165q1n | 1200×1200 RGBA | 411,801 | 90e28e0f | ✅ 落盘（sha 一致） | ✅ 8J_BAwI8zxZ4ShWj0fxB7 |

逐条权威数据见同目录 `RESULTS.json`（由脚本对落盘文件重新计算 sha/尺寸生成，非手抄）。

## 2. 各工具真实输入（可复现）

- **AI_POSTURE**：姿势/机位通过工具的姿势库+描述输入，生成全身姿势参考图（真实模型调用）。
- **MATERIAL_UPPER_BODY**：输入真实上装商品图，目标材质「棉质/平纹棉」，提示词硬约束「只换面料、保版型/领型/袖型/衣长/门襟/印花位置，不改款」。提示词原文保存在任务记录中。
- **AI_POSE_GENERATOR**：姿势描述 + 姿势库结构化约束（无描述不能生成，实测被拦截过一次，属正常校验）。
- **NEW_DESIGNER**：真实两步操作，无任何注入：
  1. 添加文字图层 → 文案「亚马逊商品主图 · 上装实例」，64px，#1f2937，位置 80,80；
  2. 通过 `DataTransfer` 构造 `File` 注入本地真实商品图 `amazon-product.png`（1,699,450B，经本地静态源 `127.0.0.1:23311` 取字节）→ 图片图层，位置 120,120，尺寸 480×480；
  3. 点击「导出设计稿」→ 前端 Canvas 真实合成 1200×1200（#ffffff 底）→ 结果入库。
  - 合成提示词完整记录 2 个图层及其坐标/尺寸/文案，可直接作为「输入差异」证据。

## 3. fresh reload 复验

- AI_POSE_GENERATOR：整页 reload 后历史区 6 条，任务卡 `task-mvtd89f3-9qpix6` 仍为「已完成」，从存储重新取字节 = 1,151,209B，sha256 `19028125…84300d` 与 reload 前一致（非内存态）。
- NEW_DESIGNER：reload 后历史区显示「1 条 · 2026-10-29 18:03 · 已完成」，缩略图与「回放画布」可点。

## 4. 已知阻塞（如实记录，未绕过成"假成功"）

**AI_POSE_GENERATOR「下载」按钮 UI 报「已下载」但文件不落盘。**

- 复现：JS 点击 / CDP 可信鼠标点击 / `Page.bringToFront` 前台 + `document.hasFocus()=true` / 整页 reload 后重试，共 4 次，`~/Downloads` 无新文件（mtime 未变）。
- 对照：同一浏览器同一时刻，NEW_DESIGNER 标签的下载在 18:04 正常落盘 411,801B 且 sha 与任务记录一致 → 排除全局下载拦截，指向**该标签创建上下文**的下载被抑制。
- 处置：停止重试；改用页面内 `fetch(结果 URL)` 直取 IndexedDB 字节并落盘，得到 `ai-pose-generator-result-1.png` 1,151,209B，sha256 与任务记录完全一致——**产物真实性已证**，仅"浏览器下载通路"这一项为 BLOCKED。

## 5. 未覆盖

- 本轮仅验收 AI_POSTURE / MATERIAL_UPPER_BODY(AI_FLITE 上装换料) / AI_POSE_GENERATOR / NEW_DESIGNER 四个；POSE_SUITE、其他 FLITE/AMAZON_PD 变体按指令未纳入（确认 2642787 处无真实任务）。
- 资产入库落地为 `localforage → IndexedDB`（`tool-asset:*` / `app_state.assets`），本阶段无服务端上传端点（gateway 属 TASK-005），非"假上传"。
