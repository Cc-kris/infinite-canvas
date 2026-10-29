# R21 独立审计矩阵（39 工具 · 严格重算）

- 审计对象 HEAD：`b77cbb7dc6e31f1016bd6b7afc35a26d1317da9a`（branch `feat/linkfox-v1-real`）
- 基线：R20 = 43f61e88（matrix：F37/2 T39/0 R39/0 H36/3 K12/27 U39；非全绿 5 单元 / 5 工具）
- 审计器：`tools/recompute_scope_matrix_r21.py`（本目录 `auditor.py` 为同一快照）
- 复现：`python3 tools/recompute_scope_matrix_r21.py --check`

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

总计：**39** 个工具；非全绿 **5** 单元 / **5** 个工具（AI_VIDEO_EDITING, IMAGE_TEXT_EDIT, REMOVE_PEN, VIDEO_CONCAT, VIDEO_TRANSLATION）；相对 R20 改判 **0** 处；相对 R19 累计 1 处；复验通过 **6** 项（R19 升级）+ 1 项（R20 升级）。

## 1. 相对 R20 的改判（R19 累计）

- 无改判（0 处）


## 2. 剩余非全绿项（全部）

| # | 工具 | 维度 | 判定 | 缺口 |
|---|---|---|---|---|
| 1 | REMOVE_PEN | H | PARTIAL | R21 复核（bf57c28d 机检 + ec33cf99）：ec33cf99 轮因任务键前缀 bug 轮询空转，322dee35 修正前缀后同一真实任务收敛 succeeded（task-mvtp33dv-57nmbx，storageKey 带 taskId 前缀），归档回执机检通过：fresh reload navType=reload + 刷新后 resultImg 1024×1024 complete；任务结果/下载落盘/入库资产三处字节均 1,831,533B 且 sha 2f8f7f11… 全等（审计侧对归档字节重算，采信回执字段）；画布腿亦有只读探针（节点 metadata.bytes=1,831,533、storageKey=image:…，对应 IDB image_files sha 相同）。但回执自判 verdict=PARTIAL：checks.canvasSent=false（脚本读不到 canvas_store），三动作未在**同一回执**内闭合，rubric 要求「下载/入库/发画布字节须由该工具已提交产物按同尺寸同 sha 复核」未一次性满足 → 不升 H。最小硬证据缺口：一次真实跑内连续完成下载落盘 + 存资产 + 发画布，并在同一机读回执里给出三者字节/sha 与任务结果一致（不得用跨文件拼合替代）。 |
| 2 | IMAGE_TEXT_EDIT | H | PARTIAL | R21 复核（f664bc43 现算）：reload 机读标记 + 下载落盘 844,613B（sha e7b260e7…）+ 结果源字节均成立；但 asset_leg 为 MISSING（63 条 tool_assets 中 matchesForTaskOrSha=0，task-mvs8bhu1-hhue24 零命中）、canvas_leg 为 REFERENCED_ONLY_NO_BYTES（app_state 98,533B 里只引用 assetId，节点无字节字段）。最小硬证据缺口：一条真实「存资产」后 tool_assets 中带该 taskId 或该 sha 的记录（含 assetId 与字节 sha），及一条真实「发画布」后 app_state 节点自带 assetId + 字节 sha 的可核字段；须由新真实跑产生，不可注入。 |
| 3 | AI_VIDEO_EDITING | H | PARTIAL | R21 复核（f664bc43 只读机检）：字节腿硬（2,268,656B / sha 47573c14… 三路相同且与本仓已提交 mp4 一致）；但 (a) resultItem.storageKey 仍为 legacy-nanoid（tool-result:6x-…，无 taskId 绑定）、(b) freshReload 走 same-origin iframe，无 navType/timeOrigin/Page.reload 机读标记、(c) 下载仅 payload 级、fileOnDisk=false。最小硬证据缺口：一次同文档真实 Page.reload（带 navType=reload + timeOrigin + 同 tab 的 CDP 机读标记）＋ ~/Downloads 真实落盘文件的字节/sha＋ 带 taskId 前缀的 storageKey 取自 IDB media_files；三者缺一即不得升 H。 |
| 4 | VIDEO_TRANSLATION | F | PARTIAL | R21 复核（无新提交）：/videos 形态只读复核仍只有 09d711b2 的 4 项 UNVERIFIED（Content-Type/字段名/公网 URL 形态一致结论未升级为回执），无新成功三动作。最小硬证据缺口：一次真实上游 2xx 的 /videos 提交回执（taskId + 终态 succeeded + 结果字节 sha），以及该次提交的请求体字段快照；外部协议若仍不可用则须写明阻塞面（域名/鉴权/配额）并给出可复现命令。 |
| 5 | VIDEO_CONCAT | F | PARTIAL | R21 复核（b583adb9 R27 + d75bb906 只读追加）：R27 两次真实 POST 均 400（utf-8 解码错 / references exceed limits: images 9, videos 3, audio 3, total 12）；d75bb906 在预算修复后再提交则**成功拿到上游受理**（HTTP 200 · task_5EgVjiQ…），但上游 pending 26min 未终态，final 非 succeeded、items 为空、三动作未验。故 F 仍不成立：提交链路可达 ≠ 产出可用。最小硬证据缺口：该 upstreamTaskId 推进到 completed → 结果字节落 IDB → 下载/存资产/发画布三动作同一回执（含 sha 对账，并需 archiveUrl 可公网取回，R27 已证 upload 侧可受理由此不构成阻塞）。 |

## 3. 门禁（新源码落地必跑）

- 来源：tools/recompute_scope_matrix_r21.py（自跑）+ docs/V1.0/reports/verify-03b8f47e-20261029-logs（历史）+ docs/V1.0/reports/verify-head-20261029-r21-logs（HEAD 自跑）
- R20 自跑（HEAD `322dee35`）：typecheck bun run typecheck → tsc --noEmit, exit 0；test bun test → 1485 pass / 0 fail / 8352 expect() / 84 files；build bun run build → vite, exit 0（built in 42.45s，仅 chunk>500kB 提示）
- 自跑原始日志：`docs/V1.0/reports/verify-head-20261029-r21-logs`
- 历史：03b8f47e（tree 52e83c1e） → typecheck exit 0（38s）；test 1483 pass / 0 fail / 8342 expects / 84 files；build exit 0（30.34s，index-DPpMYq6s.js）；tsc --listFiles 3436 行（含 web/src/）
- 说明：R20 门禁快照 dd8192a8 之后 web 树再变（新增 2 个 real-acceptance 脚本 + 2 处验收脚本修正，零 src 改动）→ 门禁不再覆盖 HEAD，R21 自跑三闸并以 gate.webTree==HEAD:web 机检；bun 用 ~/.bun/bin/bun（非交互 PATH 无 bun）

## 4. 判据与严格性

- **upgrade**：每条升级必须过硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持原判
- **noRelax**：H 判据未放宽：AI_VIDEO_EDITING 的 iframe reload、legacy-nanoid storageKey、未落盘下载仍阻断 H；IMAGE_TEXT_EDIT 的 asset/canvas 空腿仍阻断 H
- **baseline**：以 R20（43f61e88）已提交 matrix 为基线，不用工作区未提交内容
- **liveRepo**：仓库有并行提交，HEAD 在审计期间前移（b583adb9→322dee35），门禁与矩阵均对 322dee35 机检；head 字段记录当次 HEAD

## 5. 复现方式

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r21.py --check
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

- 断言总数 387，失败 0
- 负证机检：AI_VIDEO_EDITING.H 阻断=5条OK；IMAGE_TEXT_EDIT.H 阻断=9条OK；REMOVE_PEN.H 负证=5条OK；VIDEO_CONCAT.F 负证=9条OK；VIDEO_TRANSLATION.F 负证=4条OK；c8c8ce9e 新源码落地=5条OK；GATE 03b8f47e 历史三闸=12条OK；GATE R20 自跑三闸=12条OK；GATE R21 自跑三闸=13条OK；REMOVE_PEN.H@r26b=11条OK；REMOVE_PEN.H@r26b-succeeded=20条OK；VIDEO_CONCAT.F@r27=14条OK；RECHECK f664bc43 复验=11条OK；VIDEO 预算探针 2248098e=6条OK；REMOVE_PEN.H@r25=20条OK；REMOVE_PEN.H@r24=13条OK；VIDEO_CONCAT.F@r18=4条OK；IMAGE_TEXT_EDIT.H@r18=14条OK；PRINT_EXTRACT.H 补强=6条OK；GATE d5aa048a 差异收敛=3条OK；GATE R21 web 树差异=3条OK
- 反证：无
