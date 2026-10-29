# R26 · REMOVE_PEN 真实链路回执（未通过 / 明确根因）

日期：2026-10-29
仓库：`/Users/mac/Documents/Dev/infinite-canvas`
目标：在同一文档内用真实 UI 跑一次 REMOVE_PEN，并在 **fresh reload** 后验证「下载 / 存资产 / 发画布」，留存 request、taskId、终态、真实字节 sha、assetId、canvasNodeId。禁止任何结果注入。

## 结论（先看这里）

**本次未能取得真实成功回执。** 无成功 taskId、无终态 `succeeded`、无真实结果字节、无 assetId / canvasNodeId。
真实发出的唯一一次上游请求被上游 **401 拒绝**，根因已定位（配置未生效），详见下文。

按验收口径，本项应记为 **FAIL / 不可上报成功**，不得用任何历史条目或注入数据替代。

## 1) 真实发出的请求（第 1 轮，原样日志）

```
[request] POST http://127.0.0.1:23210/https://api.openai.com/v1/images/edits 0 B imgs= 0
[console] Failed to load resource: the server responded with a status of 401 (Unauthorized)
[response] 401 231 B {"jsonKeys":["error"],"b64Len":0,"url":"","error":"{\"message\":\"Incorrect API key provided: ''. You can find your API key at https://platform.openai.com/account/api-keys.\",...}"}
```

- 请求确实离开浏览器（经内置代理 23210 打向 `api.openai.com`），**不是未发请求**。
- 上游终态：HTTP **401**，错误信息明确为「API key 为空」。
- 请求体字节数显示 0 B / imgs=0，是因为 Playwright 的 `request.postData()` 读不到 `multipart/form-data` 流式请求体，**不代表没有上传图片**；本次未改用 CDP 抓包复验（见第 3 节）。

## 2) 根因：配置写入了错误的持久化层

- 应用配置键：`infinite-canvas:ai_config_store`
- 该键由 zustand persist 的 `localForageStorage`（`src/lib/localforage-storage.ts`）承载：
  IndexedDB → db `infinite-canvas` → store **`app_state`** → key `infinite-canvas:ai_config_store`，**不是** `window.localStorage`。
- 第 1 轮脚本只写了 `localStorage`，应用读不到 → 回落到默认配置：
  - 渠道：默认 OpenAI 端点 `https://api.openai.com`
  - 代理：内置代理开启（`http://127.0.0.1:23210/https://api.openai.com/...`）
  - API key：空
- ⇒ 默认端点 + 空 key ⇒ 401。这就是「有真实请求但拿不到真实结果」的**唯一根因**。

修正已落到脚本：改为 `IDB put(app_state, key "infinite-canvas:ai_config_store")`，目标渠道为 `api.cc-ai.xyz` + `gpt-image-2`（key 仅在运行时从 keychain 读取，不落盘、不打印）。

## 3) 第 2 轮：在更早的位置失败，未发出请求

```
page.setInputFiles: Timeout 30000ms exceeded.
  waiting for locator('input[data-testid=tool-asset-file-input]')
```

- 即：复用同一持久化 profile 复跑时，REMOVE_PEN 工具工作区未渲染出上传输入框（30s 超时），脚本终止。
- 因此**第 2 轮没有发出任何上游请求**，无请求体可抓、无 taskId 可报。
- 据此按要求停止继续探测，不以第 2 轮冒充证据。

## 4) 已具备、可复现的资产（供下一轮直接复用）

| 项目 | 位置 / 值 |
| --- | --- |
| 回归脚本 | `web/scripts/real-acceptance/_r26_remove_pen.mjs`（真实 UI + 真实上游，含 IDB 取真实字节、fresh reload 后三动作、sha 比对回执） |
| 配置生成器 | `/tmp/r26/make_cfg.py`（从 keychain 取 key，只落 `/tmp/r26/cfg.json`） |
| 输入素材 | `/tmp/r26/apple_1024.jpg`（Wikimedia `Red_Apple.jpg` 缩放 1024×928；苹果本体 bbox ≈ x 11%–87%，y 12%–97%） |
| 日志 | `/tmp/r26/run1.log`（真实 401 请求）、`/tmp/r26/run2.log`（选择器超时） |
| 已知存储坐标 | 结果字节 `media_files`、资产 `app_state`+`use-asset-store`、画布 `app_state` + key `infinite-canvas:canvas_store` |

## 5) 下一轮的最小修复动作（不含探测性试错）

1. 工具页导航后**先等工作区根节点就绪**（等待 `[data-testid=remove-pen-canvas]` 或文件输入出现，超时 60s），再 `setInputFiles`；避免同 profile 复跑时的空白工作区。
2. 用 CDP `Network.getRequestPostData` 抓真实 `multipart/form-data` 请求体（用于 prompt/model/size 字段与请求字节 sha），替代 Playwright `postData()`。
3. 跑通后按同一文档 fresh reload，再依次点「下载 / 存资产 / 发画布」，把 assetId、canvasNodeId、三处字节 sha 与结果 sha 对齐后写入回执。

## 6) 源码改动

无。`src/` 未修改（仅新增验收脚本与本回执），故未触发 tsc / 单测回归。
