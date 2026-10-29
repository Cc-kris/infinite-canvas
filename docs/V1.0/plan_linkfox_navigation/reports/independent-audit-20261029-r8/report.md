# 第 8 轮 39 工具严格矩阵审计报告（R8）

- 审计时刻 HEAD：`db02f3770b0830cbe510bbaa384b678b40e6b5bc`（分支 `feat/linkfox-v1-real`）
- 生成时间：2026-10-29T17:47:15+08:00
- 对照上一轮：`reports/independent-audit-20261029-r7/matrix.json`
- 机器可读矩阵：[matrix.json](matrix.json)｜可读矩阵：[matrix.md](matrix.md)
- 复现：`python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r8.py`

## 1. 本轮口径（比 R7 / 旧 recompute 更严）

| 维度 | R8 判据 |
| --- | --- |
| 证据来源 | 只认运行时刻 HEAD 已跟踪文件（`git ls-tree HEAD`）。未提交/未跟踪回执不算"已交付"。 |
| F | 结果区回执 + ≥2 类动作实据（下载=字节或 sha256；存资产=assetId 或「存入资产」；发画布=projectId/canvasNodeId 或「发送到画布」）。 |
| R | 产物须是已提交的真实结果文件（文件名命中产物白名单；UI 截图/表单/DOM 快照不算）；回执声明字节需有同尺寸已提交产物或 sha16 前缀对账。 |
| H | 必须同时具备：**该工具绑定的真实 task id（`task-mv*` 且与 `toolId` 同一 JSON 子树）** + **fresh reload 标记**（英文 reload / 中文「刷新」）。`b5-<TOOL>-succeeded-*` 注入种子、`store.persistTask` 合成任务、单测一律不计。 |
| K | 只认 `/b6-cases/` 下已提交的原站案例文件。 |
| U | 复用 scope_audit（禁词/品牌/计费文案）结果。 |

> 本轮执行期间 HEAD 被并行任务推进（`0a6d2c8 → 9873bb4 → 5fc2e69 → e33c56f → 2642787 → db02f37`）。报告与矩阵均以生成时刻 HEAD `db02f3770b0830cbe510bbaa384b678b40e6b5bc` 为准，未提交的并行改动没有被当成已交付。

## 2. 统计

| 维度 | 分布 |
| --- | --- |
| F 工具功能 | PASS 28 / PARTIAL 11 |
| T 字段文案 | PASS 32 / PARTIAL 7 |
| R 真实生成 | PASS 35 / PARTIAL 2 / BLOCKED 2 |
| H 历史记录 | PASS 11 / PARTIAL 28 |
| K 案例数据 | PASS 12 / N/A 27 |
| U 范围边界 | PASS 39 |

H=PASS（11）：PRODUCT_IMAGE_SUITE, DRESS_WEAR_SET, IMAGE_TRANSLATION, SCALE_UP, CHANGE_COLOR, FIX_COLOR, AI_TEXT, ORNAMENT_TEXT, SDS_DESIGN, SCENE_TRANSFER, VIDEO_CONCAT

## 3. 相对 R7 的 14 处改判

| 工具 | 变化 | R8 依据 |
| --- | --- | --- |
| PRODUCT_IMAGE_SUITE | F: PASS→PARTIAL | 回执未在 HEAD 提交：PRODUCT_IMAGE_SUITE/b4-actions.json（R7 判 PASS 引用的是工作区/未跟踪文件） |
| DRESS_WEAR_SET | F: PASS→PARTIAL | 回执未在 HEAD 提交：DRESS_WEAR_SET/b4-actions.json（R7 判 PASS 引用的是工作区/未跟踪文件） |
| CHANGE_COLOR_V2 | F: PARTIAL→PASS / H: PASS→PARTIAL | b4 动作在 unit1 产物上通过，但任务仅 1/2 unit 有产物（unit2 失败） |
| IMAGE_TRANSLATION | F: PARTIAL→PASS | b4 三动作通过；9e8b6cc 修 OCR/逐框翻译模型路由（textModel），但文本上游当前 503，识别文字仍无成功回执；控件缺陷未复验 |
| SCALE_UP | K: N/A→PASS | 原站案例数据已提交：SCALE_UP-probe.json |
| CHANGE_COLOR | F: PARTIAL→PASS | 仅有 download 截图 + 资产校验断言；0134fb6 真实运行取得下载 919689B，但存资产/发画布无回执 |
| PRODUCT_REFINE | F: PARTIAL→PASS | 有 step-3/4/5/6 存资产与画布截图，无机器回执 JSON |
| NEW_REPLACE_BG_V2 | K: N/A→PASS | 原站案例数据已提交：NEW_REPLACE_BG_V2-probe.json |
| REPLACE_GOODS | F: PARTIAL→PASS | 上游已出图但结果区静默清空（渲染缺陷），动作未验收 |
| PRODUCT_SCENE | F: PARTIAL→PASS | 有真实产物，无三动作回执 |
| PRINT_EXTRACT | F: PARTIAL→PASS | 结果落地状态机缺陷（卡片停在 running）；动作未全验收 |
| FISSION_LINK | H: PASS→PARTIAL | 证据无该工具绑定的真实 task id（task-mv* + toolId 同现） |
| NEW_DESIGNER | R: PASS→PARTIAL | 仅 32854B 产物 |
| VIDEO_REPLICATION | R: PASS→PARTIAL | 回执声明 1297168B 无同尺寸已提交产物可复核，落盘产物无法复核（证据链断裂） |

要点：
- **R7 的 F=PASS 引用了未提交回执**：`PRODUCT_IMAGE_SUITE/b4-actions.json`、`DRESS_WEAR_SET/b4-actions.json`、`HAND_REPAIR/download-action.png` 在 HEAD 中不存在（`git status` 为 `??`），F 降 PARTIAL。
- **H 不再凭"坞里有几条"判过**：`CHANGE_COLOR_V2`（坞内 4 条）、`FISSION_LINK`（坞内 5 条）回执只有时间/状态/缩略图尺寸文本，**无可回溯 task id** → PARTIAL（渲染可用，任务不可审计）。
- **R 修正**：`VIDEO_TRANSLATION`/`VIDEO_CONCAT` 旧矩阵 R=PASS 属口误，实际上游 400、无产物 → BLOCKED；`NEW_DESIGNER`、`VIDEO_REPLICATION` 落盘字节与回执声明无法互证 → PARTIAL。

## 4. 真实剩余 BLOCKED（2）

| 工具 | R_note |
| --- | --- |
| VIDEO_TRANSLATION | 无任何视频产物，上游 400（旧矩阵 R=PASS 为口误） |
| VIDEO_CONCAT | 仍无拼接产物：上游 multipart 400（网关侧编码缺陷），JSON 回退需公网可访问资产 URL，本轮未取得 |

## 5. 真实剩余 PARTIAL

### 5.1 R 真实生成（2）

| 工具 | R_note |
| --- | --- |
| NEW_DESIGNER | 仅 32854B 产物 |
| VIDEO_REPLICATION | 回执声明 1297168B 无同尺寸已提交产物可复核，落盘产物无法复核（证据链断裂） |

### 5.2 F 功能闭环（11）

| 工具 | F | F_note |
| --- | --- | --- |
| PRODUCT_IMAGE_SUITE | PARTIAL | 回执未在 HEAD 提交：PRODUCT_IMAGE_SUITE/b4-actions.json（R7 判 PASS 引用的是工作区/未跟踪文件） |
| DRESS_WEAR_SET | PARTIAL | 回执未在 HEAD 提交：DRESS_WEAR_SET/b4-actions.json（R7 判 PASS 引用的是工作区/未跟踪文件） |
| HAND_REPAIR | PARTIAL | 回执未在 HEAD 提交：HAND_REPAIR/download-action.png（R7 判 PARTIAL 引用的是工作区/未跟踪文件） |
| NEW_DESIGNER | PARTIAL | 本地导出 + 画布截图，无资产/画布机器回执 |
| PRODUCT_MARKET_MATERIAL | PARTIAL | 有 step-2 资产库/step-3 画布截图，无机器回执 |
| IMAGE_TO_VIDEO | PARTIAL | 仅 asset 一项动作回执（下载/存资产/发画布未全覆盖） |
| SALE_VIDEO | PARTIAL | 真实任务 task-mvt76u6p-7cfnff（succeeded，上游 task_hhe2Fmdx…）产物 1366190B；下载 sha256 39193f0a… 实测一致；存入资产 CSjc856F5YIETwEX435Cr /  |
| VIDEO_REPLICATION | PARTIAL | 仅 download 一项动作回执（下载/存资产/发画布未全覆盖） |
| AI_VIDEO_EDITING | PARTIAL | 仅 download 一项动作回执（下载/存资产/发画布未全覆盖） |
| VIDEO_TRANSLATION | PARTIAL | 真实提交被上游 400 拒绝（/videos 只收 JSON，收不了上传字节），无成功样例；三动作无对象可验 |
| VIDEO_CONCAT | PARTIAL | 39bf486：真实 UI 提交带页内字段（seconds=10&size=720x1280&ratio=9:16&resolution_name=720p），但上游 400（multipart 被当 utf-8 解码）+ HMR 重载中断 |

### 5.3 H 有回执但不达严格口径（10）

| 工具 | H_note |
| --- | --- |
| CHANGE_COLOR_V2 | 证据无该工具绑定的真实 task id（task-mv* + toolId 同现） |
| AREA_REPAIR | recovery4 以 store.persistTask 注入 2 条合成任务 → reload 后历史坞 2 条 succeeded + 4 缩略图解码 + 下载字节匹配（恢复链路可用，但非真实提交） |
| REMOVE_PEN | recovery4 注入合成任务 → reload 后历史坞 / 详情结果 / 下载 850799B sha256 一致（恢复链路可用，非真实提交） |
| IMAGE_CROP | recovery4 注入合成任务 → reload 后历史坞还原 1 条 + 下载 205951B sha256 一致（恢复链路可用，非真实提交） |
| FISSION_LINK | 证据无该工具绑定的真实 task id（task-mv* + toolId 同现） |
| IMAGE_TO_VIDEO | 真实失败任务 task-mvt71akq-bu2hxh 可从历史「回填表单」（提示词 83 字 + 2 参考图，DOM 回执）；但无结果可回填（上游 503）、无 reload 时间线证据 |
| SALE_VIDEO | 真实任务 succeeded → reload 后 blob 由 IDB 复原（新 blob id 且字节一致）、历史 2 条；但该 reload 仅有人工文字记录，未落机器回执 |
| VIDEO_REPLICATION | 真浏览器 reload 后历史坞 1 条 succeeded → 查看结果 readyState=4/1344px → 下载/存资产/二次刷新/上游链接过期全部 sha256=b5e80fde… 一致；但任务记录为 upsertTask 注 |
| AI_VIDEO_EDITING | 既有真实任务记录被清空后，用 store 以真实 upstreamTaskId 重建 → recoverAll 只轮询不重提 → succeeded，IDB 2268656B sha256=文件；但未取 reload 面板 DOM，prom |
| VIDEO_TRANSLATION | 真浏览器刷新后历史坞 1 条 failed + 完整 400 原文、查看结果按钮 0 个、POST /v1/videos 0 次；但记录由 upsertTask 注入（task-real-*），且无成功任务可验 |

其余 18 个工具**完全没有** reload / 全新加载回执：AI_OUTPAINTING, PRODUCT_REFINE, PRINTING_REPAIR, HAND_REPAIR, NEW_REPLACE_BG_V2, REPLACE_GOODS, PRODUCT_SCENE, HANDHELD_GOODS, AI_DRESSING_V2, AI_POSTURE, AI_WEARABLE, PRINT_EXTRACT, AI_POSE_GENERATOR, AI_DRESSING_XSY, IMAGE_TEXT_EDIT, MATERIAL_UPPER_BODY, NEW_DESIGNER, PRODUCT_MARKET_MATERIAL

### 5.4 T 文案（7）

| 工具 | T_note |
| --- | --- |
| PRODUCT_IMAGE_SUITE | case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439 |
| PRODUCT_MARKET_MATERIAL | case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439 |
| SALE_VIDEO | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:650,  |
| VIDEO_REPLICATION | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:650,  |
| AI_VIDEO_EDITING | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:650,  |
| VIDEO_TRANSLATION | case-module 占位文案： web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/vid |
| VIDEO_CONCAT | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:650,  |

## 6. 证据链实测结论

1. **注入种子不能当历史**：`evidence/real-acceptance/B5_HISTORY_DOCK/summary.json` 的 taskId 形如 `b5-<TOOL>-succeeded-N-<ts>`，产物走 `127.0.0.1:23298` 静态挂载；旧 `tools/recompute_scope_matrix.py` 仅据此判 H，其 H 统计不可用。
2. **回执字节与落盘产物断裂**：PRODUCT_REFINE 2827346 vs 2044177、PRINTING_REPAIR 1183770 vs 1153165、HAND_REPAIR 2153466 vs 1353583、PRODUCT_IMAGE_SUITE 2840825 vs 2151517、DRESS_WEAR_SET 1883817 vs 1239248 —— 回执对账的是当次内存结果，提交的是另一次运行。
3. **浏览器内自洽 ≠ 可复核**：在 HEAD `db02f37` 上对账证据里的 48 条 sha16 声明与 459 个已提交媒体文件，仅 9 条能对上前缀；其余多为当次浏览器内存/IndexedDB 内的字节，未随产物落盘（含 `history-restore-20261029/summary.json` 内 PIS/DWS 的 4 条）。
4. **注入恢复链路可用但非真实历史**：AREA_REPAIR / REMOVE_PEN / IMAGE_CROP 用 `store.persistTask` 造任务再 reload，字节能对上，但不是真实提交 → H PARTIAL（仅证明恢复链路工作）。
5. **单测不计入**：`use-tool-task-store.index-heal.test.ts` 只覆盖 store。

## 7. 未做 / 风险

- 未对 39 个工具重新发起真实生成（不改功能源码；上游有配额与 400/503 限制）。R 以 HEAD 已提交产物 + 回执字节对账为准。
- H 的严口径会低估"实际可恢复但没留 task id 的回执"（CHANGE_COLOR_V2 / FISSION_LINK）。若认为"坞内条目可见"即够，可回调 PASS —— 但那与"不能把注入快照当真实历史"的要求冲突，本轮按严口径出。
- SALE_VIDEO 的 reload 仅有人工文字记录、无机器回执；VIDEO_REPLICATION 有 DOM 回执但下载字节与回执 sha 不一致 → 二者均留 PARTIAL。
