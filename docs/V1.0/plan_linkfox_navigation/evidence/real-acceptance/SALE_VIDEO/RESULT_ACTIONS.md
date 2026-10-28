# SALE_VIDEO 结果动作覆盖（下载 / 存资产 / 发画布）

## 1. 动作实现（代码级，已核对）

统一结果组件 `web/src/components/tools/tool-result.tsx`：

| 动作 | 实现 | testid |
|---|---|---|
| 播放 | `<video data-testid="tool-result-video" controls playsInline preload="metadata">` | `tool-result-video` |
| 下载 | `downloadResultItem(item, index, {toolId})`（走真实 file-storage） | `tool-result-download-{i}` |
| 存资产 | `saveResultItemToAssets(item, index, {toolId, taskId})` → 返回 `assetId` 并提示「已保存到资产库（…）」 | `tool-result-save-{i}` |
| 发画布 | `sendToCanvas`（画布 store，真实写节点） | `tool-result-canvas-{i}` |
| 单结果重试 | `onRetry`（同快照重试） | `tool-task-retry` |
| 输入快照 | 「本次输入快照」区 | `tool-task-panel` |

组件注释明确：三项动作走真实存储链路（image-storage / file-storage / 资产库 / 画布 store），不写假进度、不伪造 assetId。

## 2. 本次实测（SALE_VIDEO）

结果区状态：**失败**（`tool-result-failed`），DOM 文本：

```
失败
上游返回失败
8s
任务失败
404 page not found · api.cc-ai.xyz/videos · HTTP 404
诊断码：provider-rejected · 该错误不建议直接重试
重试
失败不会产生可用结果；诊断码可用于排查 Provider 侧问题。
```

DOM 实测结果区按钮集合：`["tool-result-failed"]`；**不存在** `tool-result-download-*` / `tool-result-save-*` / `tool-result-canvas-*` / `tool-result-video`。

## 3. 判定

| 动作 | 是否覆盖 | 结论 |
|---|---|---|
| 下载 | 已实现，失败态不渲染 | ✅ 行为正确：无产物即无下载入口，不存在"下载到空文件/假链接" |
| 存资产 | 已实现，失败态不渲染 | ✅ 行为正确：不会写入空资产记录（避免资产库被污染） |
| 发画布 | 已实现，失败态不渲染 | ✅ 行为正确：不产生空画布节点 |
| 重试 | 已实现，可用 | ⚠️ 部分实测：按钮存在且可点；「重试会按同快照重发」是在 AI_VIDEO_EDITING 上实测确认的（重试后再次抓到 `POST /v1/videos` 404），SALE_VIDEO 本轮未点重试，未单独实测 |

**限制（诚实声明）**：由于 ccai-tmp 通道无 `/v1/videos`（404），本工具在本次环境下**无法产出真实视频**，因此三个动作**只能在代码与结构层验证覆盖，无法做端到端实证**（无 mp4 可下载、无 assetId 可产生、无画布节点可落地）。
若要在本机取到真实动作证据，需要先为视频链路配置支持 `/v1/videos` 的通道（分支内 `sub2api.1006000.xyz` 已被 `IMAGE_TO_VIDEO` 验证可建任务），然后重跑本页面 → 产物出现后再逐个点「下载/存资产/发画布」并记录 assetId 与画布节点 id。

## 4. 未覆盖/风险

- `tool-result-save-*` 的 `saveToAssets` 对 video 产物是否写入正确 mime 与时长元数据，**本轮未实测**（无产物）。建议在通道恢复后补测：断言资产库中出现 `video/mp4` 记录且 `blob` 可回放。
- 发送画布的节点类型（视频节点 vs 图片节点）未实测。
