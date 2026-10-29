# R26b · REMOVE_PEN 真实配置（IDB app_state）+ 真实 UI 链路回执

日期：2026-10-29
仓库：`/Users/mac/Documents/Dev/infinite-canvas`
前序：`docs/r26-remove-pen-real-receipt.md`（r26 首次真实跑，配置写在 localStorage → 上游 401）
本轮目标：沿用已落盘脚本 `web/scripts/real-acceptance/_r26_remove_pen.mjs`（脚本自身把 config 写入 **IndexedDB app_state**），用真实图片 + 真实涂蒙版跑一次 UI 全链路，抓 taskId / 终态 / 真实字节 sha，并在 fresh reload 后验「下载 / 存资产 / 发画布」。禁止任何结果注入。

## 1) 真实素材与配置（已落盘，未改动源码）

| 项 | 值 |
| --- | --- |
| 输入图 | `/tmp/r26/apple_1024.jpg`（156958 B；源 `apple_src.jpg` 576216 B） |
| 蒙版 | 脚本内用真实鼠标在 `remove-pen-canvas` 上连续拖拽涂抹（`rec.mask.coverageText` 由 UI 读取），无伪造 PNG |
| 配置 | `/tmp/r26/cfg.json` → IDB `app_state`，`channelMode=local`、`baseUrl=https://api.cc-ai.xyz`、`apiFormat=openai`、`model=ccai::gpt-image-2`、keyLen=67（值不落盘、不打印） |
| 浏览器 profile | `.acceptance-profile/r26b`（Playwright 持久化上下文 + 系统 Chrome） |
| 启动 | `/tmp/r26/launch3.sh`（headless，`IC_OUT=/tmp/r26/out2`） |

## 2) 本轮实际发生的事（原始回执，未加工）

物理阻塞与修复：`.acceptance-profile/r26b/SingletonLock` 是**残留符号链接**（指向已死 PID 58148），导致 `launchPersistentContext` 报 `Failed to create a ProcessSingleton`，也是 r26b 两次 `setInputFiles` 30s 超时前的现场状态。确认无存活进程后删除该残留锁（仅限本仓库 scratch profile，未触碰用户浏览器），随后同一 profile 下工作区与 `input[data-testid=tool-asset-file-input]` 均正常渲染（DOM 探针 errs 为空）。

随后 `launch3.sh` 完整跑通到真实上游请求，run4 原始日志全文：

```
[cdp-request] POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits 248508 B parts= 0 imgs= 0
[cdp-request] OPTIONS http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits undefined B parts= undefined imgs= undefined
[response] 200 2442902 B {"jsonKeys":["created","data","usage"],"b64Len":2442044,"url":"","error":""}
```

即：真实 UI 上传真实图片 + 真实涂抹蒙版 → 真实 `POST /v1/images/edits`（multipart，请求体 248508 B）→ 上游 **HTTP 200**，响应 2442902 B，`data[0].b64_json` 长度 2442044（约 1.79 MiB 图像）。

## 3) 结论：**未取得终态与三动作回执**（BLOCKED_TASK_NOT_SETTLED）

- `taskId`：无。脚本从提交起对 `localStorage["tool-task:v1:task-*"]` 轮询 10 分钟，期间该工具的条目**始终未进入 `succeeded/failed/cancelled`**，故 `rec.task` 为空，`receipt.json` 未在本次窗口内产生（`/tmp/r26/out2` 为空）。
- 终态：未定。上游已 200 且带回完整 b64，说明**链路本身通**（配置从 localStorage 迁到 IDB 的根因修复有效），卡点在响应回填到本地任务状态机这一段。
- 真实字节 sha：无。字节只存在于浏览器进程内存中的响应体，脚本在「终态 = succeeded 且 item 带 storageKey」后才从 IDB `media_files` 取字节并算 sha256；未终态即不落盘。
- 三动作（下载 / 存资产 / 发画布）：未执行。脚本事先判定终态，终态不成立即退出，因此没有 `downloaded` / `asset` / `canvasNode` 任何字段。
- **未做任何注入**：没有伪造 taskId、没有往 IDB/localStorage 写结果、没有复用旧结果地址补字节。

## 4) 下一步（唯一缺的一环，非配置问题）

1. 定位 `POST /v1/images/edits` 返回 200 后未落终态的代码路径：`src/services/api/image.ts`（`aiApiUrl` + `/images/edits`，`response_format=b64_json`）与 `src/services/api/tools/gateway.ts`（`transitionTask(..., "succeeded")` 只出现在视频轮询分支 745/1064 行附近）。图片工具若无「同步响应即终态」的收尾分支，任务会停在 `submitting/running`，与本次现场完全一致。
2. 同一 profile 复跑前先清 `SingletonLock/Cookie/Socket`，并复用 `/tmp/r26/apple_1024.jpg` 与脚本内涂抹逻辑。
3. 终态成立后按同一文档 fresh reload，再依次点「下载 / 存资产 / 发画布」，把 assetId、canvasNodeId、三处字节 sha 与结果 sha 对齐后补进本回执。

## 5) 源码改动

无。`src/` 未修改（本轮只做真实运行与证据留存），故未触发 tsc / 单测回归。
