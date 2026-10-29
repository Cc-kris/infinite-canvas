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
