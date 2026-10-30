# R28 修复回执：视频结果入库 401（`API_KEY_REQUIRED`）

分支：`feat/linkfox-v1-real`
现象（bd71498f）：视频模型任务**已成功**，但结果项落到画布/资产库时报
`media download failed (401) {"error":"API_KEY_REQUIRED"}`，用户看不到已生成的视频。

## 1. 根因（已定位到代码，不是猜测）

渠道（sub2api 等 OpenAI 兼容中转）返回的视频地址是**渠道自身的 API 中转端点**：

```
https://<channel>/v1/videos/<video_id>/content
```

- 轮询查询状态用 `aiHeaders(config)` 带 `Authorization: Bearer <key>`，所以状态能查到；
- 结果落库走通用媒体下载 `fetchMediaBlob`（`web/src/services/file-storage.ts`），
  历史实现是**匿名 GET**，没有 `Authorization` → 上游 `401 API_KEY_REQUIRED`。

关键约束：任务快照按设计**不存凭据**（只有 `channelId` / `model`），
所以入库这一刻必须回到当前用户配置里，按**原任务渠道**重新解析 key。

## 2. 修复（最小面，凭据不落盘）

新增 `web/src/services/media-auth.ts`（唯一鉴权判定处）：

| 函数 | 职责 |
| --- | --- |
| `isLocalMediaUrl` | `blob:` / `data:` / `file-storage:` 一律不带头 |
| `isChannelMediaUrl` | 仅当「同源 + 落在渠道 API 前缀（`/v1/`、`/api/v3/`…）」才判定为渠道端点 |
| `channelMediaHeaders` | 按渠道 `apiFormat` 生成头：OpenAI 兼容 → `Authorization: Bearer`；gemini → query 鉴权不加 Bearer |
| `taskMediaHeaders` | 按任务快照 `channelId` 找渠道（老快照退化为按 model 名唯一匹配）；渠道已删除**不回退默认渠道** |
| `taskMediaHeadersById` | 结果面板只有 `taskId` 时的入口，懒加载任务 store，异常一律退化为不带头 |

接入点（三处，全部走同一判定）：

1. `file-storage.fetchMediaBlob` 新增 `headers` 选项并透传给 `fetch`（`StoreMediaOptions.headers`）。
2. `use-tool-task-store.ingestResultMedia`：任务成功入库时按任务快照解析头 → `uploadMediaFile(..., { headers })`。
3. `services/api/tools/result-assets.ts`：「保存到资产库」「发送到画布」两条 `storeMedia` 路径按 `ctx.taskId` 反查任务补头。

顺带收紧：`services/api/video.ts` 的 `videoResultFromUrl` 原先对**任何**结果 URL 都附带
`aiHeaders(config)`，公网/CDN 地址也会把 key 发出去；现改为只在渠道 API URL 上带。
**未改动** `video-translation` adapter/UI 及其未提交改动。

## 3. 验证（跑出来的，不是读代码推断）

- 新增 `web/src/services/media-auth.test.ts`（11 用例）：鉴权矩阵 + **真实 HTTP**
  本地 server：匿名 GET → `401 API_KEY_REQUIRED`；带任务渠道头 → `200` 且字节完整，
  server 侧实际收到的头序列为 `[null, "Bearer sub2-key"]`。
- 新增 `web/src/stores/use-tool-task-store.ingest-auth.test.ts`（3 用例）：
  `ingestResultMedia` 与 `ingestResultAsset` 实际传给 `storeMedia` 的 `headers`
  为 `{ Authorization: "Bearer sub2-key" }`，公网地址为 `undefined`。
- 全量：`bun test` → **1560 pass / 0 fail**（92 文件，8600 断言），
  含 `result-assets.test.ts` 30 例无回归。
- `tsc --noEmit` 通过；`bun run build` 通过。
- 代理链路确认：`canvas-proxy/server.js` 的 `SKIP_REQUEST_HEADERS` 不含
  `authorization`，因此开启本地代理（`withLocalProxy`）时该头仍会透传到上游。

## 4. 边界与已知风险

- **不复用 r27 旧任务**：旧媒体已 404 的结果无法恢复，本修复只对**新任务**生效；
  本次未宣称「旧产物已恢复」。
- 若上游把结果放在**另一域名**的签名 URL 上（CDN），一律不带头（防泄露），
  该 URL 过期仍会失败——属于上游行为，需要在渠道侧改配置。
- 渠道被删除 / key 被清空时仍会 401：这是真实错误，不伪装成功。
- `taskMediaHeadersById` 是动态 import（避免把任务 store 拉进 service 依赖图），
  首次调用有一次性模块加载开销。

## 5. 手工验收入口

1. `cd web && bun run dev`，选一个视频模型渠道（sub2api 等中转），生成一条视频。
2. 任务从「生成中」变成功后，点「保存到资产库」→ 不再报 401，视频可播放。
3. 右侧结果面板「发送到画布」→ 画布节点为可播放视频，追溯字段（taskId/resultId）保留。
4. 断网/改错 key 复测：应报可读的下载失败，而不是写入一个空视频。
