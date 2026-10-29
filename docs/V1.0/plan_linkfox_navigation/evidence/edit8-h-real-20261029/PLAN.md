# edit8 八工具 H 维真实历史取证（2026-10-29，本轮）

## 目标（R8-fix H 口径，见 tools/recompute_scope_matrix_r8_fix.py）
H=PASS 需要同一份已提交证据同时满足：
1. 绑定真实 taskId（`task-mv*`，非 task-real/seed/fake/b5）与 toolId；
2. 有**机器可读** reload 标记：`"phase":"reload"` / `"nav":"reload"` / `"afterReload":{...}` 等结构化字段；
3. `"bytes": N`（N≥50000）与已提交媒体文件尺寸对账，或 sha256 前缀命中；
4. 不能含负向标记：`"resultRestored": false` / `payloadDropped: true` + reload / `快照回填` / `upsertTask`。
路径禁含 recovery|inject|seed（会被判 synthetic）。

## 现场事实（真实 Chrome 配置，http://127.0.0.1:3000）
| 工具 | 可用真实 task | 结果字节 | 备注 |
|---|---|---|---|
| CHANGE_COLOR_V2 | 仅 task-mvsc4fyg-qobp8k（succeeded, 1 项） | 无（快照只剩 id/kind） | 其余 3 条 failed |
| AI_OUTPAINTING | task-mvtbhylv-bmyjus | 1329760B（tool-result:RvlSRdnpA2kyyj8OmnSRW） | |
| AREA_REPAIR | 无任何 task | — | 允许最小真实生成 1 次 |
| REMOVE_PEN | 3 条 succeeded 全无字节；其余 failed | 无 | 画布项目「REMOVE_PEN 结果」存有 850799B 同源副本 |
| IMAGE_CROP | task-mvtbmukl-quasjm | 205951B | |
| PRODUCT_REFINE | task-mvtb3nuj-3d0mnv | 2827346B | |
| PRINTING_REPAIR | task-mvtbawv4-zxcmpv | 1183770B | |
| HAND_REPAIR | task-mvtbe5rp-0maafh | 2153466B | |

IDB 无孤儿图片字节（3 个孤儿均为视频），localStorage 无 gateway 上游任务持久化 → CC_V2 / REMOVE_PEN 的历史字节**不可恢复**。

## 做法
每个工具：打开工具页 → 记录刷新前坞状态 → `location.reload()`（真实刷新）→ 读坞 + 展开 →
结果 blob 取字节/sha256/解码尺寸 → 下载 / 存资产 / 发画布 三条动作各自取字节与 sha →
`bytesMatch` 全等 → 落 `<TOOL>.json` + 结果 PNG 到本目录 → commit。

## 注意
- 不用 playwright 新 profile（历史在用户配置里）；用当前浏览器 tab 的 web_execute_js。
- 不做任何 store 注入/persist 造任务。

## 本轮结果（2026-10-29 收尾，已提交）

| 工具 | taskId | 判决 | 关键证据 |
|---|---|---|---|
| PRODUCT_REFINE | task-mvtb3nuj-3d0mnv | PASS | 2827346B / sha 454f64bb…；四路（缩略图/下载/存库/画布）全等 |
| AI_OUTPAINTING | task-mvtbhylv-bmyjus | PASS | 1329760B / sha 2df4c652…；四路全等 |
| IMAGE_CROP | task-mvtbmukl-quasjm | PASS | 205951B / sha c046374e…；四路全等 |
| PRINTING_REPAIR | task-mvtbawv4-zxcmpv | PASS | 1183770B / sha d5b52a36…；四路全等（共享历史坞 下载/存库/发画布） |
| HAND_REPAIR | task-mvtbe5rp-0maafh | PASS | 2153466B / sha a34cea71…；四路全等 + media_files(tool-result:MJlcLXl2-O1DnKd-NUgg2) 对账 |
| AREA_REPAIR | task-mvtfevy8-rrr2ye | PASS（授权内最小真实生成 1 次） | 2065981B / sha 8625a56f…；五路全等（落盘/缩略图/下载/存库/发画布），payloadDropped=false |
| CHANGE_COLOR_V2 | task-mvsc4fyg-qobp8k | PARTIAL_NOT_AVAILABLE_HISTORICAL_PAYLOAD_DROPPED | 历史仅 {id,kind,payloadDropped:true}；资产/画布按 taskId 精确匹配 0 命中 → 不可回溯 |
| REMOVE_PEN | 3 条 succeeded（最近 task-mvsba8fo-iplfjq） | PARTIAL_NOT_AVAILABLE_HISTORICAL_PAYLOAD_DROPPED | 同上；旁证：画布项目「REMOVE_PEN 结果」850799B sha 67d5d6a6…（+42s 时序，但无 taskId 绑定） |

每个工具的证据：`<TOOL>.json`（含 \`"phase":"reload"\`、\`taskId\`、\`bytes\`、\`sha256\`、四/五路对账明细）+ 结果 PNG（bytes 与 sha256 前缀双对账）。

## 持久化问题（用户要求「payloadDropped/结果不回流要修真实持久化」）
- 结论：修复**已在树内**（此前提交），本轮不新增源码改动：
  - `web/src/services/api/tools/task-machine.ts:393-401`：有 `storageKey` 即 `payloadDropped:false`
  - `web/src/stores/use-tool-task-store.ts` `ingestResultMediaIntoStore()`：upsert 前先把结果字节写入 media store(`tool-result:*`)，成功后再落盘
- 本轮实证：`npx --yes bun test`（gateway.result-items / result-assets / use-tool-task-store.index-heal / gateway.recovery）→ **4 文件 43 项全通过**；
  AREA_REPAIR 新任务落盘即带 `storageKey`、`payloadDropped:false`，刷新后仍可下载/存库/发画布。
- 详见 `PERSISTENCE_FIX.json`。
- 限制：修复只对**新任务**生效；2026-10-28 及更早的旧记录字节未入库、无上游 job id，无法事后补回。

## 复现要点（本机）
- 读取：IDB `infinite-canvas` → `app_state` 的 `canvas_store` / `asset_store` 值为 JSON 字符串，须 `JSON.parse` 后再取 `.state`；媒体字节在 `media_files`（画布图在 `image_files`）；任务在 `localStorage` key `tool-task:v1:<id>`。
- 导出：`web_execute_js` 用 `save_to_file` 落 base64，再本地解码核对 sha。
- 下载按钮走 file-saver（`a.dispatchEvent(click)`），抓取需 patch `EventTarget.prototype.dispatchEvent`。
