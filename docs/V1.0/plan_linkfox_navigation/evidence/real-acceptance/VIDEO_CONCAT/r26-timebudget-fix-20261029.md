# R26 — VIDEO_CONCAT 提交链路「无时间预算」定位与修复（2026-10-29）

## 1. 现场（沿用 R25 的真实 UI 任务，未重复提交）
- 任务：`task-mvtof8um-7034v0`，toolId=VIDEO_CONCAT，draftRevision=45
- **已到上游**：`upstreamTaskId = task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt`（R25 抓取瞬间还没拿到，之后才推进）
- 时序：createdAt/submittedAt = 23:06:43 → 23:16 pollCount 65 → 23:18 pollCount 76，status=running
- 轮询期上游间歇返回 Cloudflare 源站错误（`retryable: true`），任务继续等待，未判失败
- 结论修正：R25 的「没有 POST」是**窗口内假象**；真相是提交请求被长时间悬挂后才拿到响应，
  任务记录在 `submitting` 上一直没有 `updatedAt`（`updatedAt === createdAt`），界面零错误。

## 2. 定位到的真实缺陷（3 处，全部无时间预算）
1. `web/src/services/api/video.ts` `post()`：提交 `/videos` 的 axios **没有 timeout**；
2. 同文件 `withGatewayRetry()`：把「没拿到响应」的 axios 错误一律当瞬时故障重试 → 一次卡死连接可无限重试；
3. `web/src/lib/inline-image.ts` `loadImageElement()`：`onload/onerror` 都不触发时永久 pending，
   提交前置的参考图行内化（base64 瘦身）随之永久悬挂；
   另 `pollOpenAIVideoTask` 的 GET `/videos/{id}` 同样没有 timeout。

## 3. 修复
- 新增 `VIDEO_SUBMIT_TIMEOUT_MS=180_000` / `VIDEO_POLL_TIMEOUT_MS=60_000`，分别加到提交 POST 与轮询 GET；
- 新增 `isRequestTimeoutError()`（ECONNABORTED/ETIMEDOUT/TimeoutError/timeout message），
  在 `withGatewayRetry` 里**超时直接抛出不重试**——上游可能已受理并计费，重发等于重复刷量；
- `loadImageElement` 加 10s 解码预算，超时按解码失败处理，走既有兜底（原样返回 data URL），不再悬挂。

## 4. 验证
- `bun test src/services/api/video.submit-plan.test.ts src/features/tools/adapters/video-concat.test.ts` → 61 pass / 0 fail
  （新增 2 条「时间预算」用例：超时形态识别 + 预算常量关系）
- `npx tsc --noEmit` → 0 error

## 5. 未完成
- 本任务尚未到终态（仍在 running，上游 Cloudflare 抖动），因此 **下载真实字节 / 存资产 / 发画布 / fresh reload 复验** 尚未执行；
  待上游出结果后按 `taskId=task-mvtof8um-7034v0` 继续（不得重新提交）。
