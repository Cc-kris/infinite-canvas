# AI_VIDEO_EDITING 结果动作覆盖（下载 / 存资产 / 发画布）

## 1. 动作实现（代码级，已核对）

结果区由统一组件 `web/src/components/tools/tool-result.tsx` 渲染（注释明确：三项动作走真实存储链路，不写假进度、不伪造 assetId）：

| 动作 | 实现 | testid |
|---|---|---|
| 播放 | `<video data-testid="tool-result-video" controls playsInline preload="metadata">` | `tool-result-video` |
| 下载 | `downloadResultItem(item, index, {toolId})` → 真实文件落盘 | `tool-result-download-{i}` |
| 存资产 | `saveResultItemToAssets(...)` → 返回 `assetId`，提示「已保存到资产库（…）」 | `tool-result-save-{i}` |
| 发画布 | `sendToCanvas` → 真实写画布节点 | `tool-result-canvas-{i}` |
| 单结果重试 | `onRetry`（同快照重试） | `tool-task-retry` |
| 输入快照 | 「本次输入快照」 | `tool-task-panel` |

## 2. 本次实测（干净重跑，2026-10-29）

结果区状态：**失败**，DOM 文本：

```
视频编辑结果 失败 失败 上游返回失败 1s 任务失败
404 page not found · api.cc-ai.xyz/videos · HTTP 404
诊断码：provider-rejected · 该错误不建议直接重试 重试
失败不会产生可用结果；诊断码可用于排查 Provider 侧问题。
```

- 截图：`07-clean-ready.png`（素材就绪：原视频 1344×768·5.2s、参考图 1 张、需求 38/2500、按钮「1 条 · 5.2 秒」）、`08-clean-result.png`（失败态）。
- 结果区渲染的 testid 集合：`tool-result-failed`；**不存在** `tool-result-video / -download-* / -save-* / -canvas-*`。
- 「重试」实测：点击后再次发出 `POST /v1/videos`（`net.json` 记录 404），确认**同快照重试链路可用**。

## 3. 判定

| 动作 | 覆盖 | 结论 |
|---|---|---|
| 下载 | 已实现，失败态不渲染 | ✅ 无空文件/假链接 |
| 存资产 | 已实现，失败态不渲染 | ✅ 不写空资产记录 |
| 发画布 | 已实现，失败态不渲染 | ✅ 不建空节点 |
| 重试 | 已实现且实测可用 | ✅ |

**限制（诚实声明）**：ccai-tmp 无 `/v1/videos`，本次**无法产出真实视频**，因此三个动作只能在代码与结构层确认覆盖，**没有端到端实证**（无 mp4、无 assetId、无 canvas nodeId 可记录）。
补证前提：为视频链路配置支持 `/v1/videos` 的通道（分支内 `sub2api.1006000.xyz` 已被 IMAGE_TO_VIDEO 验证可建任务）→ 重跑本页 → 产物出现后逐个点「下载 / 存资产 / 发画布」，记录下载文件名、返回的 assetId、画布节点 id。

## 4. 未覆盖/风险

- 视频产物的 `saveResultItemToAssets` 是否写入正确 `mime=video/mp4` 与时长短元数据：**未实测**。
- 发送画布时节点类型（video node vs image node）与是否自动带封面帧：**未实测**。
- 失败态「重试」不区分可重试/不可重试错误（页面文案已提示「该错误不建议直接重试」），但按钮仍可点 —— 属可接受的 UX 取舍，记录备查。
