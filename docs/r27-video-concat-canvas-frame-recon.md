# r27 · VIDEO_CONCAT 发画布视频节点比例错误 —— 修复与真实 UI 证据

- 分支：`feat/linkfox-v1-real`
- 结论：**REAL-UI-PASS（前台可见标签路径）**；后台标签自动校正路径为**单测覆盖 + 代码路径就绪，真实后台标签复现未做（UNVERIFIED）**，故不整项报 PASS。
- 涉及工具：VIDEO_CONCAT（同链路影响 VIDEO_REPLICATION / SALE_VIDEO 等所有「发画布」视频结果，修复对它们同样生效）

## 1. 缺陷链（逐层核对代码）

```
ToolResult 发送画布按钮
 → sendResultItemToCanvas()            web/src/components/tools/tool-result-actions.ts
 → deps.storeVideo()                   web/src/services/api/video.ts storeGeneratedVideo
 → uploadMediaFile()                   web/src/services/file-storage.ts:53
 → readVideoMeta()                     web/src/services/media-metadata.ts（超时 10s → 1280×720 兜底）
 → videoMetadata()                     web/src/lib/canvas/canvas-node-factory.ts
 → node.metadata.naturalWidth/Height = 1280×720（假值），node.width/height = 规格 420×236
```

后台标签时 `<video>` 的 `loadedmetadata` 被浏览器挂起 → 超时兜底 1280×720 被**当作真实尺寸写进节点**。
修复前预存证据（同一台机器 IDB `infinite-canvas:app_state → infinite-canvas:canvas_store`）：

```json
{ "id": "BQaQ6fu-w5wv8NRshhLvQ", "title": "VIDEO_CONCAT 结果",
  "nodes": [{ "id": "video-1793332164186-6guwp", "type": "video",
              "w": 420, "h": 236, "nat": [1280, 720] }] }
```

真实素材是 768×1344（9:16），节点却是 16:9。

## 2. 修复内容

| 文件 | 改动 |
| --- | --- |
| `web/src/services/media-metadata.ts` | 新增 `measureVideoMeta()`：**严格测量**，超时/出错返回 `null`，绝不返回 16:9 兜底；`readVideoMeta()` 保留兜底但额外返回 `timedOut: true` 标记 |
| `web/src/services/file-storage.ts` | `UploadedFile` 增加 `timedOut?`，随元数据透传 |
| `web/src/types/canvas.ts` | `CanvasNodeMetadata` 增加 `mediaMetaPending?`（宽高未测到的显式标记） |
| `web/src/lib/canvas/canvas-node-factory.ts` | `videoMetadata()`：`timedOut` 时**不写** `naturalWidth/Height`，只标 `mediaMetaPending: true` |
| `web/src/lib/canvas/video-meta-reconcile.ts`（新增） | `videoNodeFrame` / `fitVideoNodeToNatural` / `reconcileVideoNodeMeta`：拿到真实宽高按最长边 420 保持中心点校正；不可见时在 `visibilitychange`/轮询里重试；幂等；依赖可注入 |
| `web/src/components/tools/tool-result-actions.ts` | 发画布视频分支：先用 `measureVideo` 严格测一次（成功→按真实比例建框并清 pending）；仍失败→建 pending 节点并 fire-and-forget 触发 `reconcileVideoMeta`（不阻塞「已发送」反馈） |

测试：`video-meta-reconcile.test.ts`（10 例）+ `tool-result-actions.video-frame.test.ts`（5 例）；
`bun test src/services src/lib/canvas src/components/tools` → **261 pass / 0 fail**；`tsc --noEmit` 干净。

## 3. 真实 UI 证据（前台可见标签，真实点击「发送画布」）

1. 打开 `http://127.0.0.1:3000/tools/ai-video/video-concat` → 历史任务 `task-mvtof8um-7034v0`（VIDEO_CONCAT / succeeded，上游 `task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt`，4,633,118 B / video/mp4 / 720×1280 输出）。
2. 点「查看结果」→ 结果卡渲染 `<video>`，点 `data-testid="tool-result-canvas-0"`（发送画布）。
3. 页面反馈：`已发送到画布（1jVV-4upR2_Z1cIvClvpQ）`。
4. 读 IDB `infinite-canvas:canvas_store`：

```json
{ "id": "1jVV-4upR2_Z1cIvClvpQ", "title": "VIDEO_CONCAT 结果",
  "nodes": [{ "id": "video-1793333743712-dy0mg", "type": "video",
              "w": 240, "h": 420, "ratio": 0.5714,
              "meta": { "nat": [768, 1344], "bytes": 4633118,
                        "mime": "video/mp4", "dur": 13667,
                        "key": "video:whbUhZU35p9mMYYeJxB34" } }] }
```

- `naturalWidth/Height = 768×1344`（真实），**不再是 1280×720**；`mediaMetaPending` 未出现（已测到）。
- 节点框 240×420，比例 0.5714 = 9:16 竖版（旧行为固定 420×236）。

5. 媒体字节核对（`infinite-canvas:media_files` key `video:whbUhZU35p9mMYYeJxB34`，Blob）：

```
bytes   = 4,633,118   （与任务上报 4,633,118 完全一致）
sha256  = 928c4113c960de0c5ffd1c31bc84d047b3e38e5978813f4bf278d9f93fe98471
```

6. 画布页渲染（`/canvas/1jVV-4upR2_Z1cIvClvpQ`）：

```
<video> rect 236×416（节点 240×420 内边距内），videoWidth×videoHeight = 768×1344，
readyState = 4，src = blob:... ：真实 9:16 竖版渲染
```

## 4. 未验证项（诚实声明）

- **后台标签的真实复现未做**：要触发「媒体被挂起」必须把标签切到后台，而当时浏览器里都是用户自己的常驻标签，按标签收尾规则不动用户标签。该路径由 10 条单测覆盖（含「一直测不到 → 保持 pending、绝不写 1280×720」「可见后第二次测量成功 → 校正且保中心」「幂等跳过」），但**未在真实后台标签下点过按钮**，故整体状态不报 PASS，此项标 UNVERIFIED。
- 已在可见标签下证明的关键性质：兜底值不再进入节点元数据、真实宽高按 9:16 建框、媒体字节完整入库。

## 5. 复现命令

```bash
cd web
./node_modules/.bin/tsc --noEmit
~/.bun/bin/bun test src/services src/lib/canvas src/components/tools
```
