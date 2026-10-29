# R20 独立审计矩阵（39 工具 · 严格重算）

- 审计对象 HEAD：`a8428106a2a0bce9721f3c2e5bc204bd0a1b9072`（branch `feat/linkfox-v1-real`）
- 基线：R19 = d77ea745（matrix：F36/3 T39/0 R39/0 H36/3 K12/27 U39；非全绿 6 单元 / 5 工具）
- 审计器：`tools/recompute_scope_matrix_r20.py`（本目录 `auditor.py` 为同一快照）
- 复现：`python3 tools/recompute_scope_matrix_r20.py --check`

## 0. 统计（精确计数）

| 维度 | 口径 | PASS | PARTIAL | N/A | 合计 |
|---|---|---|---|---|---|
| F | F 功能面 | 37 | 2 | 0 | 39 |
| T | T 测试闸 | 39 | 0 | 0 | 39 |
| R | R 取回/重启 | 39 | 0 | 0 | 39 |
| H | H 硬证据（真任务/真字节/真动作） | 36 | 3 | 0 | 39 |
| K | K 知识库 | 12 | 0 | 27 | 39 |
| U | U 用户链路 | 39 | 0 | 0 | 39 |

简式：**F 37/2/0 · T 39/0/0 · R 39/0/0 · H 36/3/0 · K 12/0/27 · U 39/0/0**

总计：**39** 个工具；非全绿 **5** 单元 / **5** 个工具（AI_VIDEO_EDITING, IMAGE_TEXT_EDIT, REMOVE_PEN, VIDEO_CONCAT, VIDEO_TRANSLATION）；相对 R19 改判 **1** 处；复验通过 **7** 项。

## 1. 相对 R19 的改判

- **AI_VIDEO_EDITING** `F` PARTIAL → PASS（dd8192a8；回执 `evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-20261029.json`；产物 `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`）

## 2. 剩余非全绿项（全部）

| # | 工具 | 维度 | 判定 | 缺口 |
|---|---|---|---|---|
| 1 | REMOVE_PEN | H | PARTIAL | R20 复核（12f1aa8b）：真实 UI 回归脚本已提交，但配置写在 localStorage 而非 IDB app_state → 上游 401，无真实 taskId / 字节 → 维持 PARTIAL |
| 2 | IMAGE_TEXT_EDIT | H | PARTIAL | R20 复核（72bd1271）：reload 机读标记（navType=reload / timeOrigin / 同 sid）+ 下载落盘 844,613B sha e7b260… + 结果源字节均已硬；但 asset/canvas 的 assetId / canvasNodeId / 字节仍为 null（localforage 事务读不到）→ 三动作字节腿缺一，维持 PARTIAL |
| 3 | AI_VIDEO_EDITING | H | PARTIAL | R20 复核：字节腿已硬（2,268,656B / sha 47573c14… 三路相同、与已提交 mp4 一致），但 (a) storageKey 为 legacy-nanoid 无 taskId 绑定、(b) freshReload 走 same-origin iframe 无 navType/timeOrigin/Page.reload 机读标记、(c) 下载 payload 未落盘 → 缺两条 rubric 硬腿，维持 PARTIAL |
| 4 | VIDEO_TRANSLATION | F | PARTIAL | R20 复核（09d711b2）：/videos 形态只读复核确认 Content-Type/字段名/公网 URL 与已抓真实协议一致，但 4 项 UNVERIFIED 属外部阻塞且无新成功三动作回执 → 维持 PARTIAL |
| 5 | VIDEO_CONCAT | F | PARTIAL | R20 复核（e0bcc5d6 + c8c8ce9e）：R25 真实 UI 两个真实素材提交后卡在 submitting（网关无 POST /v1/videos）、无结果字节；c8c8ce9e 只加时间预算使失败可收敛，未产出成功回执 → 维持 PARTIAL |

## 3. 门禁（新源码落地必跑）

- 来源：tools/recompute_scope_matrix_r20.py（自跑）+ docs/V1.0/reports/verify-03b8f47e-20261029-logs（历史）
- R20 自跑（HEAD `dd8192a8`）：typecheck bun run typecheck → tsc --noEmit, exit 0；test bun test → 1485 pass / 0 fail / 8352 expects / 84 files；build bun run build → vite 7.3.6, exit 0
- 自跑原始日志：`docs/V1.0/reports/verify-head-20261029-r20-logs`
- 历史：03b8f47e（tree 52e83c1e） → typecheck exit 0（38s）；test 1483 pass / 0 fail / 8342 expects / 84 files；build exit 0（30.34s，index-DPpMYq6s.js）；tsc --listFiles 3436 行（含 web/src/）
- 说明：c8c8ce9e 落地新源码（video.ts / inline-image.ts / 新测试），03b8f47e 的门禁不再覆盖 HEAD web 树 → R20 自跑三闸并以 gate.webTree==HEAD 机检

## 4. 判据与严格性

- **upgrade**：每条升级必须过硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持原判
- **noRelax**：H 判据未放宽：AI_VIDEO_EDITING 的 iframe reload、legacy-nanoid storageKey、未落盘下载仍阻断 H；IMAGE_TEXT_EDIT 的 asset/canvas 空腿仍阻断 H
- **baseline**：以 R19 已提交 matrix 为基线，不用工作区未提交内容
- **liveRepo**：仓库有并行提交，HEAD 在审计期间多次前移（abdb825e→72bd1271→c8c8ce9e→dd8192a8），本产物对 head 字段记录当次机检 HEAD

## 5. 复现方式

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r20.py --check
```

## 6. 逐工具明细（39 工具 · 六维）

| # | 工具 | F | T | R | H | K | U |
|---|---|---|---|---|---|---|---|
| 1 | PRODUCT_IMAGE_SUITE | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 | DRESS_WEAR_SET | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | CHANGE_COLOR_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
| 4 | IMAGE_TRANSLATION | PASS | PASS | PASS | PASS | N/A | PASS |
| 5 | SCALE_UP | PASS | PASS | PASS | PASS | PASS | PASS |
| 6 | AI_OUTPAINTING | PASS | PASS | PASS | PASS | PASS | PASS |
| 7 | AREA_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 8 | REMOVE_PEN | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 9 | CHANGE_COLOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 10 | IMAGE_CROP | PASS | PASS | PASS | PASS | N/A | PASS |
| 11 | PRODUCT_REFINE | PASS | PASS | PASS | PASS | N/A | PASS |
| 12 | FIX_COLOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 13 | PRINTING_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 14 | HAND_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 15 | NEW_REPLACE_BG_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
| 16 | REPLACE_GOODS | PASS | PASS | PASS | PASS | PASS | PASS |
| 17 | PRODUCT_SCENE | PASS | PASS | PASS | PASS | PASS | PASS |
| 18 | HANDHELD_GOODS | PASS | PASS | PASS | PASS | N/A | PASS |
| 19 | AI_DRESSING_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
| 20 | AI_POSTURE | PASS | PASS | PASS | PASS | N/A | PASS |
| 21 | AI_WEARABLE | PASS | PASS | PASS | PASS | PASS | PASS |
| 22 | AI_TEXT | PASS | PASS | PASS | PASS | N/A | PASS |
| 23 | ORNAMENT_TEXT | PASS | PASS | PASS | PASS | N/A | PASS |
| 24 | SDS_DESIGN | PASS | PASS | PASS | PASS | PASS | PASS |
| 25 | PRINT_EXTRACT | PASS | PASS | PASS | PASS | N/A | PASS |
| 26 | AI_POSE_GENERATOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 27 | AI_DRESSING_XSY | PASS | PASS | PASS | PASS | N/A | PASS |
| 28 | FISSION_LINK | PASS | PASS | PASS | PASS | N/A | PASS |
| 29 | IMAGE_TEXT_EDIT | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 30 | MATERIAL_UPPER_BODY | PASS | PASS | PASS | PASS | N/A | PASS |
| 31 | NEW_DESIGNER | PASS | PASS | PASS | PASS | N/A | PASS |
| 32 | PRODUCT_MARKET_MATERIAL | PASS | PASS | PASS | PASS | N/A | PASS |
| 33 | SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS |
| 34 | IMAGE_TO_VIDEO | PASS | PASS | PASS | PASS | PASS | PASS |
| 35 | SALE_VIDEO | PASS | PASS | PASS | PASS | N/A | PASS |
| 36 | VIDEO_REPLICATION | PASS | PASS | PASS | PASS | N/A | PASS |
| 37 | AI_VIDEO_EDITING | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 38 | VIDEO_TRANSLATION | PARTIAL | PASS | PASS | PASS | N/A | PASS |
| 39 | VIDEO_CONCAT | PARTIAL | PASS | PASS | PASS | N/A | PASS |

## 7. 断言与矛盾

- 断言总数 308，失败 0
- 负证机检：AI_VIDEO_EDITING.H 阻断=5条OK；IMAGE_TEXT_EDIT.H 阻断=9条OK；REMOVE_PEN.H 负证=5条OK；VIDEO_CONCAT.F 负证=9条OK；VIDEO_TRANSLATION.F 负证=4条OK；c8c8ce9e 新源码落地=5条OK；GATE 03b8f47e 历史三闸=12条OK；GATE R20 自跑三闸=11条OK；REMOVE_PEN.H@r25=20条OK；REMOVE_PEN.H@r24=13条OK；VIDEO_CONCAT.F@r18=4条OK；IMAGE_TEXT_EDIT.H@r18=14条OK；PRINT_EXTRACT.H 补强=6条OK；GATE d5aa048a 差异收敛=3条OK
- 反证：无
