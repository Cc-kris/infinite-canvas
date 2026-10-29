# 39 工具独立证据矩阵 · 第 6 轮刷新（2026-10-29）

- 分支 `feat/linkfox-v1-real` ｜ 脚本执行时 HEAD `f5c580e`（开工时 3d66ba2，期间被并行提交推进到 f5c580e）
- 生成时间 2026-10-29T16:06:39；判定来源：`tools/independent_evidence_audit.py`（严格）+ `tools/scope_audit.py`（T/U）
- 口径：只认**已提交**的机器回执（JSON/字节/哈希）；注入快照、单测、截图不单独支撑 PASS；R 由脚本重读产物字节与哈希
- 工作区披露：未提交 web/src 改动 6 个（并行改动，未纳入任何证据）；scope_audit 在含这些改动的树上运行

## 1. 本轮严格口径统计

| F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计系统 |
| --- | --- | --- | --- | --- | --- |
| PASS 22 / PARTIAL 16 / BLOCKED 1 | PASS 32 / PARTIAL 7 | PASS 35 / BLOCKED 4 | PASS 8 / PARTIAL 31 | PASS 10 / N/A 29 | PASS 39 |

与上一轮 r5（c9df094）逐格 diff：**只有 AI_VIDEO_EDITING 的两格变化**（F BLOCKED→PARTIAL、R BLOCKED→PASS），其余 38 个工具与其余维度全部不变。

## 2. 本轮逐提交证据重核

| 提交 | 声称 | 复核到的机器证据 | 判定后果 |
| --- | --- | --- | --- |
| 32a7919 | AI_VIDEO 真实 done | `receipt-20261029/receipt.json`：upstream task_QFvq6WMc / status=done / video 6s；落盘 mp4 2268656B，实测 sha256 `47573c147325…`、h264 1344x768 6.58s，与回执内 IDB 哈希一致 | R BLOCKED→PASS；F 仍 PARTIAL（原始 prompt/2 张输入图未恢复，存资产/发画布无回执）；H 仍 PARTIAL（记录按 upstreamTaskId **重建**+轮询，无 reload 面板回执） |
| 3d66ba2 | 视频历史恢复 2/2 | `VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json`：真浏览器 reload 后查看结果/下载/存资产/二次刷新/上游链接过期，sha256 全部 `b5e80fde…`（2277978B）；VIDEO_TRANSLATION reload 后 failed + 真实 400 原文、0 个查看结果、0 次重提 | F/H 仍 PARTIAL（任务记录由 `upsertTask` 注入 `task-real-*`，非真实提交落库）；VIDEO_TRANSLATION R 仍 BLOCKED |
| 9850714 | i2v 10 条真实案例 | 案例数据 + 本地页签/做同款回执在册，K 已 PASS | K 不变 |
| 069a455 | 提交中/结果未知收敛 | 注入 submitting/unknown 探针 reload 后收敛 failed 且历史显示失败原因（round3 回执） | CHANGE_COLOR_V2 H 已 PASS（不变） |
| 9d55ba5 | 四工具历史 | recovery4 全部为 **persistTask 注入**合成任务，按本口径不算 | AREA_REPAIR/REMOVE_PEN/CHANGE_COLOR/IMAGE_CROP H 仍 PARTIAL |
| e990e85 | 场景迁移落盘 | SCENE_TRANSFER 快照恢复（IDB 839268B sha256 = 上游），历史坞 Tab 点击回填未取证 | H 已 PASS（不变），K=N/A |

## 3. 本轮实测字节复核（直接跑命令，不看文档叙述）

| 文件 | 字节 | sha256 |
| --- | --- | --- |
| `AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4` | 2268656 | `47573c147325d451f41ffd89ae21b82c895623c682832546c24181b18f92a505` |
| `VIDEO_REPLICATION/link-mode/out.mp4` | 2277978 | `b5e80fdea6526e362703ba3e18033691fbed673416b024e4e53570a1510e4163` |
| `VIDEO_HISTORY_RECOVERY_2TOOLS/downloads/VIDEO_REPLICATION-reload2-task_Ma7egazZrnGPt5BtVr5vW2hfApVxvCIS.mp4` | 2277978 | `b5e80fdea6526e362703ba3e18033691fbed673416b024e4e53570a1510e4163` |
| `VIDEO_HISTORY_RECOVERY_2TOOLS/downloads/VIDEO_REPLICATION-expired-link.mp4` | 2277978 | `b5e80fdea6526e362703ba3e18033691fbed673416b024e4e53570a1510e4163` |

结论：AI_VIDEO 的 2268656B 与 VIDEO_REPLICATION 的 2277978B **不同源**（尺寸/哈希均不同），不存在互相借用；link 模式产物、reload 下载、过期链接三份同源一致。

## 4. 明确「不计入 PASS」的证据

- **注入快照**：B4/B5/B7、recovery4（AREA_REPAIR/REMOVE_PEN/CHANGE_COLOR/IMAGE_CROP）、`task-real-*`（视频双工具）、`task-mvt42rpv-kfl1ov` 重建记录 —— 一律 H=PARTIAL。
- **单测**：`AI_VIDEO_EDITING/receipt-20261029/test-report.txt` 的 bun 80 pass/0 fail 只证明代码行为；本轮未重跑 typecheck/单测，也不作为生成证据。
- **借用 payload**：AI_VIDEO 的 `b4-actions.json` 1297168B 来自 IMAGE_TO_VIDEO，只算借用，不给 F PASS。
- **`tools/recompute_scope_matrix.py` 输出**（`recompute.json`）：其 H 把 B5 注入当实测（H PASS 20），且与提交证据冲突（SCENE_TRANSFER R=BLOCKED、VIDEO_TRANSLATION R=PASS）。**仅留档，不采信**。

## 5. 剩余 PARTIAL / BLOCKED（真实缺口）

### 5.1 H 历史：31 个 PARTIAL，按恢复路径分组

- **未取证**（23）：`IMAGE_TRANSLATION`、`SCALE_UP`、`AI_OUTPAINTING`、`PRODUCT_REFINE`、`FIX_COLOR`、`PRINTING_REPAIR`、`HAND_REPAIR`、`NEW_REPLACE_BG_V2`、`REPLACE_GOODS`、`PRODUCT_SCENE`、`HANDHELD_GOODS`、`AI_DRESSING_V2`、`AI_POSTURE`、`AI_WEARABLE`、`PRINT_EXTRACT`、`AI_POSE_GENERATOR`、`AI_DRESSING_XSY`、`IMAGE_TEXT_EDIT`、`MATERIAL_UPPER_BODY`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`、`SALE_VIDEO`、`VIDEO_CONCAT`
- **注入验证**（4）：`AREA_REPAIR`、`REMOVE_PEN`、`CHANGE_COLOR`、`IMAGE_CROP`
- **历史回填（部分）**（1）：`IMAGE_TO_VIDEO`
- **注入验证（真实产物）**（1）：`VIDEO_REPLICATION`
- **重建记录（未取 reload 面板）**（1）：`AI_VIDEO_EDITING`
- **注入验证（真实失败任务）**（1）：`VIDEO_TRANSLATION`

关闭 H 的唯一路径：真实提交（真上游）→ 落库 → 整页 reload 或历史坞回填的机器回执。注入/重建记录必须替换为真实提交任务。

### 5.2 F 功能：16 PARTIAL + 1 BLOCKED

| 工具 | 状态 | 缺口 |
| --- | --- | --- |
| `CHANGE_COLOR_V2` | PARTIAL | b4 动作在 unit1 产物上通过，但任务仅 1/2 unit 有产物（unit2 失败） |
| `IMAGE_TRANSLATION` | PARTIAL | b4 三动作通过，但工作台存在控件/校验缺陷（旧矩阵已记录） |
| `CHANGE_COLOR` | PARTIAL | 仅有 download 截图 + 资产校验断言，无存资产/发画布回执 |
| `PRODUCT_REFINE` | PARTIAL | 有 step-3/4/5/6 存资产与画布截图，无机器回执 JSON |
| `FIX_COLOR` | PARTIAL | 提交后无结果区（仅有空态），三动作未执行 |
| `HAND_REPAIR` | PARTIAL | 仅 download 字节；存资产/发画布未取得回执 |
| `REPLACE_GOODS` | PARTIAL | 上游已出图但结果区静默清空（渲染缺陷），动作未验收 |
| `PRODUCT_SCENE` | PARTIAL | 有真实产物，无三动作回执 |
| `PRINT_EXTRACT` | PARTIAL | 结果落地状态机缺陷（卡片停在 running）；动作未全验收 |
| `NEW_DESIGNER` | PARTIAL | 本地导出 + 画布截图，无资产/画布机器回执 |
| `PRODUCT_MARKET_MATERIAL` | PARTIAL | 有 step-2 资产库/step-3 画布截图，无机器回执 |
| `IMAGE_TO_VIDEO` | PARTIAL | 生成+存资产已验收（06-result-video.mp4 1.30MB）；发画布未执行；ddba2e6 只补落库/历史区代码，上游 503 无新结果 |
| `SALE_VIDEO` | BLOCKED | 上游端点 404，无自有产物；b4 动作使用 IMAGE_TO_VIDEO 借用 mp4（source=borrowed） |
| `VIDEO_REPLICATION` | PARTIAL | 真实产物 2277978B；真浏览器 UI 下载×2 / 存资产 / 画布按钮全部可用且字节 sha256 一致；但工作台提交通道仍 404（产物来自 link 模式真实任务），记录由脚本 upsertTask 注入 |
| `AI_VIDEO_EDITING` | PARTIAL | 真实上游任务 task_QFvq6WMc 已 done，产物 2268656B 可下载/可入库；但原始 prompt/两张输入图未恢复，无存资产/发画布回执（b4 的 1297168B 为借用 IMAGE_TO_VIDEO，不计） |
| `VIDEO_TRANSLATION` | PARTIAL | 真实提交被上游 400 拒绝（/videos 只收 JSON，收不了上传字节），无成功样例；三动作无对象可验 |
| `VIDEO_CONCAT` | PARTIAL | 只验证工作台/校验，未发起真实拼接 |

### 5.3 R 真实生成：4 个 BLOCKED

| 工具 | 缺口 |
| --- | --- |
| `FIX_COLOR` | 目录内只有 1440x900 UI 截图，无任何产物字节（旧矩阵 R=PASS 为截图充数） |
| `SALE_VIDEO` | 无自有产物；b4 视频字节来自 IMAGE_TO_VIDEO |
| `VIDEO_TRANSLATION` | 无任何视频产物，上游 400（旧矩阵 R=PASS 为口误） |
| `VIDEO_CONCAT` | 未发起真实生成调用，无产物 |

### 5.4 T 文案：7 个 PARTIAL

scope_audit：errors=0，warnings=17，全部命中 `unfinished-copy:case-module`（案例模块占位文案）。

| 工具 | 命中位置（节选） |
| --- | --- |
| `PRODUCT_IMAGE_SUITE` | case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite |
| `PRODUCT_MARKET_MATERIAL` | case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite |
| `SALE_VIDEO` | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video |
| `VIDEO_REPLICATION` | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video |
| `AI_VIDEO_EDITING` | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video |
| `VIDEO_TRANSLATION` | case-module 占位文案： web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/work |
| `VIDEO_CONCAT` | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video |

## 6. 复现

```bash
R=docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r6
python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py --json $R/scope-audit.json
python3 docs/V1.0/plan_linkfox_navigation/tools/independent_evidence_audit.py --scope-audit $R/scope-audit.json --out-dir $R
```

## 7. 未完成 / 风险

- 本轮零新增真实生成调用（纯证据审计），因此 **没有任何工具靠本轮变成 H=PASS**；H 仍是最大缺口（31/39 PARTIAL）。
- 工作区仍有 6 个未提交 web/src 改动（tool-task-history.tsx、image-translation.ts、sale-video.ts、sale-video.test.ts、gateway.ts、task-machine.ts）；若继续改动，相关工具结论需重跑。
- AI_VIDEO 的任务归属仅有本地既有记录 + 上游 taskId，原始提交回执（prompt/输入图）无存档；要升 F=PASS 需补一次真实 UI 提交的三动作回执。
- VIDEO_TRANSLATION / VIDEO_CONCAT / FIX_COLOR / SALE_VIDEO 的 R 仍 BLOCKED：分别卡上游 400、未发起真实拼接、无成功产物、无自有产物。
