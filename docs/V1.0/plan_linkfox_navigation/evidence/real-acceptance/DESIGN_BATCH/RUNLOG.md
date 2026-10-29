# DESIGN_BATCH 真实批次回执（2026-10-29）

## 结论

- 批次 `batch_XoWY1VJqvX`（工具 `SCALE_UP` 高清放大，2 行，并发 1）在 UI 真实提交，状态 `completed`，**成功 2 / 失败 0 / 跳过 0**。
- 两行结果都是真实字节 PNG 1024×1024，已落盘为本目录两张 PNG，并记录 sha256。
- 之前 `b5-blocked-no-real-batch.json`（BLOCKED：本机 0 条 `batch-task:v1:*`）已由 `b6-real-batch-receipt.json` 取代，原文件保留但标记 `supersededBy`。

## 证据清单

| 文件 | 说明 |
| --- | --- |
| `b6-real-batch-receipt.json` | 真实回执：批次/行/task id、字节数、sha256、UI 渲染快照 |
| `batch_XoWY1VJqvX-row_D3BqXT8q.png` | 行1 结果，1638630B，1024×1024，sha256 `cc6cf58b…` |
| `batch_XoWY1VJqvX-row_KWQoUzW9.png` | 行2 结果，1237615B，1024×1024，sha256 `e4bd821f…` |

## 取真实字节的两条路径（重要经验）

1. **OSS 直链行**：结果 `url` 为 `https://oss-us.dimenoss.com/...`，直接 `curl` 下载即得原始 PNG（存在 `Content-Type: image/png`，PNG magic `89504e47` 校验通过）。
2. **blob 行**：结果 `url` 是 `blob:`，刷新后该 URL 必然失效（`img onerror`、`fetch` 报 Failed to fetch，且页面**无 CSP**，不是 CSP 拦截）。
   真正的字节在 localforage：`indexedDB.open('infinite-canvas')` → store **`media_files`** → key = `item.storageKey`（本次 `tool-result:MOMNo1DkYuHlii4tVlc0Z`），取到 Blob 后 `blob.size` / `blob.type` 即为真实字节与类型。
   落盘办法：页面内 `localforage` 取 Blob → POST 到本机临时 HTTP 接收器（本次 `127.0.0.1:8811`，带 CORS 头）→ Python 写盘。`web_execute_js` 的 `save_to_file` 对超长 base64 会写 0 字节，不要依赖。
   注意端口易被占用（本次 8799 已被其它 Python 进程占用），起服务后先 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 确认是自己的 PID。

## 刷新历史的表现（实测，非伪造）

- 刷新 `/tools/batch-generate/batch_XoWY1VJqvX` 后仍是「已结束」，两行都显示「成功 · 第 1 次」，顶部「成功 2 失败 0」。
- 行2 有可点结果缩略图（`<a href=OSS …><img alt="结果">`）。
- **行1 刷新后没有结果缩略图**：`batch-runner.ts` 的 `collectResultUrls()` 只保留 `^https?://`，blob 结果被过滤掉（`web/src/services/api/tools/batch-runner.ts:392-396`）。属于既有设计取舍，本次未改代码。
- 两行都出现提示「刷新后有 1 张参考图未恢复，请重新上传」——参考图（行内 source）刷新后未从持久层恢复，属既有已知现象，本次未改。

## 校验

- `npx tsc --noEmit`：无错误。
- `bun test src/features/tools/batch src/services/api/tools/batch-runner`：16 pass / 0 fail。
- 本次只新增证据文件，未改动产品代码。
