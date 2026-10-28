# 真实验收增补：AI_DRESSING_XSY / AI_POSE_GENERATOR / PRINT_EXTRACT

本轮（2026-10-28 21:00–21:40）在真实 Chrome + 真实上游代理（canvas-proxy 127.0.0.1:23210）下逐个跑通工具体验，证据全部落在
`evidence/real-acceptance/<TOOL_ID>/`。不写「演示成功」，所有结论都能被 DOM 文本 / 网络记录 / 结果图字节复核。

## 结论一览

| 工具 | 结论 | 依据 | 缺口 |
| --- | --- | --- | --- |
| AI_DRESSING_XSY | **PASS** | 四步流程全通；`POST /v1/images/edits` 200；结果区「已完成 · 共 1 个结果」；结果图 720×960 / 1,069,621 B 落盘 | 三个动作按钮只验证存在，未逐一点击（共用组件已在 SCALE_UP 用例点过） |
| AI_POSE_GENERATOR | **PARTIAL** | `POST /v1/images/generations` 200；结果图 720×960 / 1,067,539 B 落盘；表单拦截正确 | 结果区**没有**下载 / 存入资产 / 发送画布（全页 `[data-testid^=tool-result]` = 0） |
| PRINT_EXTRACT | **PARTIAL** | 首轮上游 200 且 url 可下载（686,174 B，720×960）；本轮复跑 502 失败态文案正确 | 页面逐张状态机与任务库终态不同步；失败后刷新即丢失 |

## AI_DRESSING_XSY（AI试衣XSY）— PASS

四步全部实际点击/上传：

1. 模特图 `model.png` 720×960 → 计数 1/1。
2. 套装图 `suit.jpg` 1024×744 / 31 KB → 计数 1/1，出现「已达数量上限，先移除一个再上传」。
3. 套装蒙版：点「整件」→ **覆盖 100.0% · 1 笔**（0% 时禁止提交，100% 才放行）。
4. 生成设置：1 张 + 算法「标准试衣 v1」，gate 文案 **自检通过，可提交**。

提交体带步骤标记 `[AI_DRESSING_XSY/tab:suit/step:4]`，并明确「模特图 已提供；模特类型 棚拍模特；风格 干净通勤；姿势 正面站立。服装：套装（1024×744，蒙版 100.0%）」。

上游 `POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits` → 200，FormData 含 `model=gpt-image-2 / n=1 / output_format=png`。
结果区 DOM：`第 1 张 · 连体衣服 / 已完成 / 共 1 个结果 · 图片 1`，动作按钮 `tool-result-download-0 / -save-0 / -canvas-0` 均存在且可用。

## AI_POSE_GENERATOR（AI姿势生成）— PARTIAL

- 上游 200（`/v1/images/generations`，`model=gpt-image-2`），结果 720×960 PNG 已按 `img.src` 取出落盘。
- 表单侧：姿势提示词 / 每场景张数 / 场景数 / 请求数 / 预设保存齐备；空提示词正确拦截「请先填写姿势描述」。
- **缺口**：结果区无任何 `tool-result-*` 动作，产物无法下载 / 存入资产 / 发送画布，只能留在页面内。

## PRINT_EXTRACT（印花提取）— PARTIAL

首轮（18:44）上游 200，`data[0].url` 为 oss-us.dimenoss.com 真实图，下载校验 720×960 / 686,174 B。
本轮（21:2x）复跑命中另一条通道：

- `POST http://127.0.0.1:23210/https://api.openai.com/v1/images/edits` → **502**，
  `无法连接 api.openai.com：连接超时（UND_ERR_CONNECT_TIMEOUT）`，尝试地址 `103.252.114.101:443`；
- 5m19s 后失败态在任务面板正确落地：`结果未知 / 无法确认上游是否受理 / 任务失败 / 诊断码：timeout-or-network · 可按原参数重试 / 需要人工确认 / 结果未知时不会自动重试，避免上游已受理导致的重复扣费` —— 防重复扣费口径正确。

同时暴露三个缺陷（详见 `result.json` 的 `defects`）：

1. **页面逐张状态不随任务库终态更新**：任务面板已 failed，卡片仍 `data-status="running"`，汇总停留 `提取中 1/1`、`成功 0 · 失败 0`。
2. **失败后刷新即丢失**：刷新后卡片回落 `待提取 1 张`、任务面板消失，用户无法重试或核对上游任务号。
3. **代理通道 0 线路不通**（api.openai.com 直连超时），而通道 1（api.cc-ai.xyz）正常，建议加通道健康探测/失败切换。

代码侧已排除：`adapters/print-extract.ts` 对 `url` 结果是放行的；`task-machine.ts` 的 `TERMINAL_STATUSES` 含 `failed`。所以断点在「任务库终态 → 页面逐张状态」的回写，而非解析。

## 取证方法学（本轮踩到并已绕开）

- **截图不可信**：`Page.captureScreenshot` 对同一后台标签的不同状态返回完全相同字节（`01-form-filled.png` 与 `03-done.png` md5 均为 `617eb993…`）。状态判定一律用 DOM 文本 + 网络记录 + 结果图字节。
- **上传通道**：CDP `DOM.setFileInputFiles` 在该桥接环境下 `objectId` 跨调用失效；可行做法是本地 CORS 静态服务 + `fetch → File → DataTransfer → input.files + dispatchEvent(change)`。
- **桥接抖动**：浏览器扩展在本轮升级（5.4.1 → 5.5.1），旧标签会话全部失效；长任务轮询要用后台进程写日志，避免一次握手失败打断整轮验收。
