# 39 工具独立证据矩阵 · 第 5 轮刷新报告（2026-10-29）

- 仓库分支 `feat/linkfox-v1-real` ｜ HEAD `c9df094` ｜ 生成时间 2026-10-29T15:52:06
- 口径：只认**已提交**的机器回执（JSON/字节/哈希），截图与文档叙述一律不单独作数；注入快照不计入 H
- 本报告与 `matrix.json` / `matrix.md` / `scope-audit.json` 同目录，脚本可一键复现（见 §6）

## 1. 最终统计

| 维度 | 本轮（c9df094） | 上一轮（874e99f/e0fbfd9） |
| --- | --- | --- |
| F 功能（提交→结果→下载/存资产/发画布） | PASS 22 / PARTIAL 15 / BLOCKED 2 | PASS 18 / PARTIAL 19 / BLOCKED 2 |
| T 文案（占位/未完成文案扫描） | PARTIAL 7 / PASS 32 | PASS 32 / PARTIAL 7 |
| R 真实生成（产物字节+尺寸+哈希） | PASS 34 / BLOCKED 5 | PASS 33 / PARTIAL 1 / BLOCKED 5 |
| H 历史与恢复 | PASS 8 / PARTIAL 31 | PASS 4 / PARTIAL 35 |
| K 原站案例 | PASS 10 / N/A 29 | PASS 9 / N/A 29 / MISSING 1 |
| U 设计系统 | PASS 39 | PASS 39 |

`problems` 为空：每个 PASS 都有可解析的真实证据文件，每个非 PASS 都有原因，H=PASS 与恢复路径互相自洽。

## 2. 本轮改动（相对上一轮）

| 工具 | 变化 | 依据（均为已提交） |
| --- | --- | --- |
| `AI_TEXT` | F PARTIAL→PASS、R PARTIAL→PASS、H PARTIAL→PASS | `B2G1/AI_TEXT/run-b2g1.json`（commit e680e76）：download 1825663B sha256 = 上游 = reload 后 IndexedDB，存资产 `uStjodx0Uad4IPDsTVqoG`、画布 `sNQeliaC-Z_BkqoJVdTaw` |
| `ORNAMENT_TEXT` | F PARTIAL→PASS、H PARTIAL→PASS | `B2G1/ORNAMENT_TEXT/run-b2g1.json`（3657b31）：2439783B 三处 sha256 一致 + 三动作 |
| `SDS_DESIGN` | F PARTIAL→PASS、H PARTIAL→PASS | `B2G1/SDS_DESIGN/run-b2g1.json`（5dfe082）：2081539B 三处 sha256 一致 + 三动作 |
| `SCENE_TRANSFER` | F PARTIAL→PASS、H PARTIAL→PASS | `B2G1/SCENE_TRANSFER/run-b2g1.json`（e990e85）：839268B 由 IDB `tool-result` 取回（非 dataURL 直塞），reload 后字节一致、面板 succeeded |
| `IMAGE_TO_VIDEO` | K MISSING→PASS | `IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json` + `cases-source.json`（9850714）：10 条原站案例、cover/ref 均 HTTP 200 真图、做同款回填 534 字脚本 |

这四个 B2G1 回执的提交时间（01:14–01:18）早于上一轮审计（15:41），上一轮漏用了它们——**这是上一轮矩阵的主要盲区**，本轮已扫全 `B2G1/` 与 `*actions*.json` 回执补齐。

同时补了三条**口径加固**（不改变其他工具分数，防止虚高）：

1. **B5「历史坞」注入不算 H**：`web/scripts/real-acceptance/run-b5-recovery-4tools.mjs` 用 `store.persistTask()` 直接写 2 条合成任务（id 形如 `task-real-AREA_REPAIR-1-<ts>`），再 reload 读取。这验证的是**恢复链路可用**，不是真实提交，故 `AREA_REPAIR`/`REMOVE_PEN`/`CHANGE_COLOR`/`IMAGE_CROP` 仍 H=PARTIAL，恢复路径标注为「注入验证」。
2. **H 恢复路径必须可解释**：脚本新增 `H_RESTORE` 表 + 一致性断言——H=PASS 必须来自「快照恢复」或（完整）「历史回填」，「注入验证」「未取证」不得对应 PASS，反之亦然；冲突直接进 `problems`。
3. **收敛修复有回执才算数**：`CHANGE_COLOR_V2` 的 H=PASS 依据仍是全新加载后 4 条真实任务，另外 `round3-recovery-20261029/recovery-history-tab-evidence.json`（c9df094）证明「提交中/结果未知」在 reload 后收敛为 failed 并在历史里显示失败原因（探针注入，故只作补强不作主证）。

## 3.1 功能（F）非 PASS：17 个

> 只考察「提交→结果→下载/存资产/发画布」的机器回执；截图、UI 描述、借用其他工具产物都不算

| 工具 | 判定 | 原因 |
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
| `VIDEO_REPLICATION` | PARTIAL | 工作台通道 404；仅直连 link 模式成功，三动作未走 UI |
| `AI_VIDEO_EDITING` | BLOCKED | 上游 404，无自有产物；b4 借用 IMAGE_TO_VIDEO mp4 |
| `VIDEO_TRANSLATION` | PARTIAL | 未取得成功样例；三动作未验收 |
| `VIDEO_CONCAT` | PARTIAL | 只验证工作台/校验，未发起真实拼接 |

## 3.2 文案（T）非 PASS：7 个

> `case-module` 未完成文案由 `scope_audit.py` 扫描源码得出

| 工具 | 判定 | 原因 |
| --- | --- | --- |
| `PRODUCT_IMAGE_SUITE` | PARTIAL | case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439 |
| `PRODUCT_MARKET_MATERIAL` | PARTIAL | case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439 |
| `SALE_VIDEO` | PARTIAL | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357 |
| `VIDEO_REPLICATION` | PARTIAL | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357 |
| `AI_VIDEO_EDITING` | PARTIAL | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357 |
| `VIDEO_TRANSLATION` | PARTIAL | case-module 占位文案： web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:500 |
| `VIDEO_CONCAT` | PARTIAL | case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357 |

## 3.3 真实生成（R）非 PASS：5 个

> 须有本地落盘产物，且校验字节数/尺寸/sha256；`url:` 证据会做 HEAD 复核

| 工具 | 判定 | 原因 |
| --- | --- | --- |
| `FIX_COLOR` | BLOCKED | 目录内只有 1440x900 UI 截图，无任何产物字节（旧矩阵 R=PASS 为截图充数） |
| `SALE_VIDEO` | BLOCKED | 无自有产物；b4 视频字节来自 IMAGE_TO_VIDEO |
| `AI_VIDEO_EDITING` | BLOCKED | 无自有产物（旧矩阵 R=PASS 不成立） |
| `VIDEO_TRANSLATION` | BLOCKED | 无任何视频产物，上游失败（旧矩阵 R=PASS 为口误） |
| `VIDEO_CONCAT` | BLOCKED | 未发起真实生成调用，无产物 |

## 3.4 历史与恢复（H）非 PASS：31 个

> 见 §4；注入快照不计

| 工具 | 判定 | 原因 |
| --- | --- | --- |
| `IMAGE_TRANSLATION` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `SCALE_UP` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AI_OUTPAINTING` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AREA_REPAIR` | PARTIAL（注入验证） | recovery4 以 store.persistTask 注入 2 条合成任务 → reload 后历史坞 2 条 succeeded + 4 缩略图解码 + 下载字节匹配（恢复链路可用，但非真实提交） |
| `REMOVE_PEN` | PARTIAL（注入验证） | recovery4 注入合成任务 → reload 后历史坞 / 详情结果 / 下载 850799B sha256 一致（恢复链路可用，非真实提交） |
| `CHANGE_COLOR` | PARTIAL（注入验证） | recovery4 注入合成任务 → 本工具自有 history 面板 reload 后还原 1 条 + 下载 1231207B sha256 一致（恢复链路可用，非真实提交） |
| `IMAGE_CROP` | PARTIAL（注入验证） | recovery4 注入合成任务 → reload 后历史坞还原 1 条 + 下载 205951B sha256 一致（恢复链路可用，非真实提交） |
| `PRODUCT_REFINE` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `FIX_COLOR` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `PRINTING_REPAIR` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `HAND_REPAIR` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `NEW_REPLACE_BG_V2` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `REPLACE_GOODS` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `PRODUCT_SCENE` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `HANDHELD_GOODS` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AI_DRESSING_V2` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AI_POSTURE` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AI_WEARABLE` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `PRINT_EXTRACT` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AI_POSE_GENERATOR` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AI_DRESSING_XSY` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `IMAGE_TEXT_EDIT` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `MATERIAL_UPPER_BODY` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `NEW_DESIGNER` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `PRODUCT_MARKET_MATERIAL` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `IMAGE_TO_VIDEO` | PARTIAL（历史回填（部分）） | 真实失败任务 task-mvt71akq-bu2hxh 可从历史「回填表单」（提示词 83 字 + 2 参考图，DOM 回执）；但无结果可回填（上游 503）、无 reload 时间线证据 |
| `SALE_VIDEO` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `VIDEO_REPLICATION` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `AI_VIDEO_EDITING` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `VIDEO_TRANSLATION` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| `VIDEO_CONCAT` | PARTIAL（未取证） | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |

## 3.5 原站案例（K）非 PASS：0 个

> `N/A` = 原站本身无案例模块，不算缺陷；`MISSING` 才是缺陷

无。

## 4. H 专项：恢复路径分类

| 恢复路径 | 数量 | 工具 | 能否支撑 H=PASS |
| --- | --- | --- | --- |
| 未取证 | 26 | `IMAGE_TRANSLATION`、`SCALE_UP`、`AI_OUTPAINTING`、`PRODUCT_REFINE`、`FIX_COLOR`、`PRINTING_REPAIR`、`HAND_REPAIR`、`NEW_REPLACE_BG_V2`、`REPLACE_GOODS`、`PRODUCT_SCENE`、`HANDHELD_GOODS`、`AI_DRESSING_V2`、`AI_POSTURE`、`AI_WEARABLE`、`PRINT_EXTRACT`、`AI_POSE_GENERATOR`、`AI_DRESSING_XSY`、`IMAGE_TEXT_EDIT`、`MATERIAL_UPPER_BODY`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`、`SALE_VIDEO`、`VIDEO_REPLICATION`、`AI_VIDEO_EDITING`、`VIDEO_TRANSLATION`、`VIDEO_CONCAT` | 不能（无 reload 也无全新加载历史坞） |
| 注入验证 | 4 | `AREA_REPAIR`、`REMOVE_PEN`、`CHANGE_COLOR`、`IMAGE_CROP` | 不能（链路可用，但任务非真实提交） |
| 快照恢复 | 4 | `AI_TEXT`、`ORNAMENT_TEXT`、`SDS_DESIGN`、`SCENE_TRANSFER` | 能 |
| 历史回填 | 3 | `PRODUCT_IMAGE_SUITE`、`DRESS_WEAR_SET`、`FISSION_LINK` | 能 |
| 历史回填（含收敛验证） | 1 | `CHANGE_COLOR_V2` | 能 |
| 历史回填（部分） | 1 | `IMAGE_TO_VIDEO` | 不能（无结果/无 reload 时间线） |

## 5. 遗留风险

- **H 是最大空洞**：31 个工具 H=PARTIAL，其中 26 个是「未取证」。要补只需对每个工具做一次 `真实提交 → 刷新 → 历史坞/结果还原` 的 CDP 采集（脚本可复用 `run-b5-recovery-4tools.mjs` 的采集段，但必须走真实提交而非 `persistTask` 注入）。
- **视频系 5 个工具 R=BLOCKED**（`SALE_VIDEO`、`AI_VIDEO_EDITING` 上游 404；`VIDEO_TRANSLATION`、`VIDEO_CONCAT`、部分借用 IMAGE_TO_VIDEO 产物）：旧矩阵把借用 mp4 记成 PASS，本轮已纠正，需等上游端点恢复后重跑。
- **`FIX_COLOR` R 从 PASS 降为 BLOCKED**：目录内只有 1440×900 UI 截图，无任何产物字节，属旧矩阵充数，本轮按证据重判。
- **`IMAGE_TO_VIDEO` F 仍 PARTIAL**：发画布动作未执行，且上游 503 无新结果；历史只能回填表单（失败任务），不能回填结果。
- **`scope_audit` 仍有 17 条 warning**（`video.tsx` 12、`video-translation.tsx` 3、`suite.tsx` 2 的 `case-module` 占位文案），对应 T=PARTIAL 的 7 个工具。

## 6. 复现

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py \
  --json docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r5/scope-audit.json
python3 docs/V1.0/plan_linkfox_navigation/tools/independent_evidence_audit.py \
  --scope-audit docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r5/scope-audit.json \
  --out-dir docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r5
```

`matrix.json` 里每行都带 `*_note` 与 `*_evidence`（相对 `evidence/real-acceptance/`），可直接点到文件核对。
