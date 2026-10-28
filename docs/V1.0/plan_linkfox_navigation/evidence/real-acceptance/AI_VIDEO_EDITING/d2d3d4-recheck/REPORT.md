# AI_VIDEO_EDITING · D2 / D3 / D4 复测报告（真实页面，2026-10-28）

- 路由：`http://127.0.0.1:3000/tools/ai-video/ai-video-editing`（本地 dev server，真实 Chrome via Playwright）
- 脚本：[recheck.mjs](recheck.mjs)（可复跑）；原始数据：[recheck.json](recheck.json)
- 上游 `/v1/videos` 用 route 拦截回 200「已受理」，**只用于抓取真实 multipart 参数**，不产出假结果；
  页面凭据通过 localStorage 注入（`infinite-canvas:ai_config_store`，baseUrl=`https://mock-upstream.invalid/v1`），
  故任何真实上游都不会被调用。
- 结论：**D2 / D3 / D4 三项缺陷在真实 UI 上复现-修复闭环通过**；本工具「有无真实出片」不变，仍为 blocked_by_provider（不走 PASS）。

## D2 · 视频元数据探测无超时 → 上传永久卡在「入库」

复现手法：注入脚本把 `HTMLVideoElement.prototype.src` 改为空操作（模拟浏览器不解码/元数据永不回调），再上传真实 1.2MB / 5.2s MP4。

| 项 | 修复前 | 修复后（实测） |
| --- | --- | --- |
| 上传是否返回 | 永不返回（进度停在写入库存） | **15.5s** 到点返回（`elapsedMs: 15484`），资产入库成功（`1 / 1 个`） |
| 页面文案 | 「待上传源视频」+「先上传源视频，才能确定截取区间」（与已上传状态矛盾） | 「06-result-video.mp4 · **时长未知**」，截取区标签「**时长未知**」，提示「已上传源视频，但读不到时长（浏览器无法解码该文件），请重新上传可播放的 MP4/MOV」 |
| 是否允许提交 | 可提交（会拿 0 秒截取区间 + prompt 写「时间范围：待上传源视频」发请求） | **拒绝提交**，`issues` 含「源视频时长读取失败…」，`missingFields: sourceVideoDuration` |

时间线（recheck.json `steps.D2.timeline`）：t=27ms 未选中 → t=15484ms 已入库且文案为「时长未知」。
根因：`readVideoMeta`/`readAudioMeta` 只挂 `loadedmetadata/error`，无超时；且资产层与库存层各探一次，最坏叠加。
修复：新增 `web/src/services/media-metadata.ts`（统一 10s 超时 + 释放 video/audio 元素），资产层探测结果通过
`uploadMediaFile(..., { knownMeta })` 直接复用，同一 Blob 不再二次探测；时长未知单独建模为
`unknown-duration`（标签/日志/prompt/门禁一致），不再冒充「没上传」。

## D3 · 本地素材 Blob 被清（IndexedDB 回收/换设备）仍可提交

实测：正常态 `submit disabled=false`、无 issue → 在页面内删掉 localforage（`infinite-canvas` / `media_files`）中该素材的 2 个 key
→ 触发重渲染后 `disabled=true`，内联原因「06-result-video.mp4（源视频）本地数据已失效，请重新上传」；
再强制 `form.requestSubmit()`，**上游请求数 = 0**（`upstreamRequestsAfterForcedClick: 0`），即不会带失效素材发请求。
证据：`d3-asset-invalid.png`。

## D4 · seconds / size 未跟随截取区间与源视频画幅（实际下发 6 秒 · 1:1）

实测源片 1344×768（横屏，5.2s），截取 0–5 秒，点击提交后抓到的真实 multipart 字段：

| 字段 | 修复前（result.json 记录） | 修复后（本轮实测） |
| --- | --- | --- |
| seconds | `6` | **`5`**（= 截取区间 5.2s → 夹紧到源片剩余 5s，UI 亦显示「共 5 秒」） |
| size | `720x720` | **`1280x720`** |
| ratio | `1:1` | **`16:9`** |
| resolution_name | `720p` | `720p`（不变） |
| video[] | 有 | 有（`hasVideoPart: true`，multipart 不再退化成纯文本） |

prompt 与字段自洽：「源视频取自 0–5 秒（共 5 秒，源片 5.2 秒）」「输出：1 条视频，时长约 5 秒」。
证据：`d4-before-submit.png`、`d4-after-submit.png`。
说明：`seconds` 由 adapter 按截取时长向上取整并夹紧到 4–30s；`ratio` 由源视频真实宽高推导，`size` 由 gateway 按
`ratio + 当前档位(720p)` 换算，避免继续沿用全局 6 秒 · 1:1。

## 单测（同批）

- `web/src/features/tools/adapters/ai-video-editing.test.ts`：41 pass（新增 D3 字节校验 3 条、D4 参数 4 条、D2 时长未知 3 条）
- `web/tests/gateway.test.ts`：27 pass（新增 `buildToolConfig 视频覆盖` 1 条）
- `web/src/services/media-metadata.test.ts`：5 pass（超时兜底 / 错误码 / 清理）
- `tsc --noEmit`：exit 0

## 未覆盖 / 风险

- 本轮未调用真实视频上游，**没有真实出片**，故不把工具标 PASS（仍 blocked_by_provider）。
- 「时长未知」时产品行为是「拒绝提交并要求重新上传」；没有做「允许用户手动填时长强行提交」，因为那会让 seconds 与真实片长不一致。
- 元数据探测超时取值 10s（库存层）；资产层仍是其原有的 15s 上限，最坏 15s 出结果（实测 15.5s 含上传/校验开销）。
