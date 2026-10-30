# VIDEO_TRANSLATION 资产尺寸修复验收（r22-g）

- 修复对象：r22-f「发现 F1」——存入资产时把 1280×720 兜底尺寸写成事实（真实解码 768×768 / 6583ms）。
- 环境：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`，本地栈 `http://localhost:3000`（vite dev，加载到新代码 `moduleHasNewFn=true`）。
- 方式：复用 r22-f 已成功的真实任务 `task-mvuflf9e-djxprc`（不重新生成）；真实 Chrome 页面恢复历史任务 → 存入资产 → 发送画布 → 整页 reload 后从 IndexedDB 复核；字节 sha256 在页面内用 `crypto.subtle` 计算。
- 源视频：`../r22-f/06-result-video.mp4`，1249837 B，sha256 `7c15bdb23f0c95630c81a3ed3fb8d244772c17a532394722f41681cad169274c`。

## 根因

`web/src/components/tools/tool-result-actions.ts` 的 `saveResultItemToAssets` 视频分支先前直接把 `storeGeneratedVideo` 的返回（`file-storage.uploadMediaFile` → `readVideoMeta`）写入 `asset.data.width/height`。`readVideoMeta` 超时时返回 `1280×720 + timedOut=true` 兜底，于是兜底值被当作事实入库；同一份字节在画布路径（`fitVideoNodeToNatural` + `measureVideoMeta` 严格测量）却是 768×768，导致资产与画布不一致。

## 修复

`tool-result-actions.ts`：

1. 新增 `resolveStoredVideoMeta(stored, measure, timeoutMs)`：**只信未超时且宽高>0 的入库元数据**；否则调用严格测量 `measureVideoMeta`；仍拿不到返回 `null`，绝不返回兜底值。
2. `saveResultItemToAssets` 视频分支：测到真实值 → 写真实 `width/height/durationMs`；测不到 → 写 `0×0` 并置 `metadata.mediaMetaPending=true`（不写 1280×720），随后调用 `reconcileAssetVideoMeta` 在标签可见时（含定时/可见性触发）重试，成功后 `updateAsset` 回填并清除 pending，且**保留 toolId/taskId/resultItemId 等溯源字段**。
3. `ResultAssetDeps` 增加可注入的 `measureVideo` / `updateAsset`，便于回归测试，生产路径由 `media-metadata` 与 `use-asset-store.updateAsset` 提供。

回归测试：`web/src/components/tools/tool-result-actions.asset-meta.test.ts`（5 例）——兜底+测量成功写真实值、兜底+测量失败不写假值且后台校正、真实元数据不重复测量、`resolveStoredVideoMeta` 拒绝兜底、`reconcileAssetVideoMeta` 始终失败保持 pending。

## 真实 UI 验收（reload 后机读）

| 项 | 修复前（r22-f） | 修复后（本次，reload 后） |
|---|---|---|
| 资产 `M9g-UrvgLtZIYEjMIqrVk` revision | 1 | 3 |
| data.width × height | 1280 × 720（兜底，错） | **768 × 768** |
| data.durationMs | 缺失 | **6583** |
| data.bytes | 1249837 | 1249837 |
| metadata 溯源 | toolId/taskId/resultItemId | 保留（taskId=`task-mvuflf9e-djxprc`） |
| 资产字节 sha256 | — | `7c15bdb2…274c`（与源文件一致） |
| 画布节点 | `video-…-aoazu` 768×768（旧） | 新增 `video-1793334631959-d3gam`，`naturalWidth/Height=768`、`durationMs=6583`、无 `mediaMetaPending` |
| 节点字节 sha256 | — | `7c15bdb2…274c`（与源文件一致） |

- `verify.json` 的 12 条断言全部为 true（含 `asset_no_fallback_1280x720`、三份字节 sha 一致）。
- 机读原始快照：`probe-before.json`（修复前 IndexedDB）、`after-reload-verify.json`（reload 后）、`node-meta.json`（节点 metadata 全量）、`stores2.json`（IndexedDB 库/仓库与 key 清单）。

## 残余风险 / 说明

- 存资产在真实页面耗时较长（本次约 2 分钟：严格测量 + 上传 + 缩略图），刷新前需等入库完成；页面在等待期间无进度文案（属既有交互，本次未改）。
- 后台标签页若测不到尺寸会先落 `0×0 + mediaMetaPending`，需标签可见/下次交互触发重试才会回填；这是「不写假值」的有意取舍，`verify.json` 覆盖了成功路径，pending 路径由单测覆盖。
- 上游编码差异（r22-f 记录的音轨/容器差异）不在本次范围，保持原 PARTIAL 记录。
