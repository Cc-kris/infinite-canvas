# R9 独立 crosscheck：严格三腿（H）判定复核报告

- 复核对象：`reports/independent-audit-20261029-r9/matrix.md`（审计 HEAD `a8d4767`，生成 2026-10-29T19:16:50）
- 复核方式：独立运行审计器（`tools/recompute_scope_matrix_r9.py --debug`）+ 逐个回执/产物落盘核对（sha256 实算比对）
- 边界：**未生成任何新证据、未派 worker、未改业务源码、未改 R9 matrix**；仅修审计器的证据映射并输出本报告
- 复核结论：R9 的 H 判定方向正确（严格三腿），但**映射层漏读 6 项已提交的真实 reload+字节证据**，H PASS 应由 13 → **19**；另有 4 项「原因文字错误」（结论 PARTIAL 正确，缺口原因写错）。R9 的 13 项 PASS 经复核全部成立（无假 PASS），修复后新增的 6 项亦逐项做了 sha 实算校验。

---

## 1. 结论差异一览

| 工具 | R9 H | 复核 H | 性质 | 依据 |
| --- | --- | --- | --- | --- |
| IMAGE_TRANSLATION / SCALE_UP / AI_OUTPAINTING / AREA_REPAIR / CHANGE_COLOR_V2 / IMAGE_CROP / PRODUCT_REFINE / FIX_COLOR / PRINTING_REPAIR / HAND_REPAIR / AI_POSTURE / MATERIAL_UPPER_BODY / AI_DRESSING_XSY | PASS | PASS | 一致 | task+reload+bytes 三腿成立，sha 对账通过 |
| AI_TEXT | PARTIAL | **PASS** | 漏读（观测腿） | `real-acceptance/B2G1/AI_TEXT/run-b2g1.json` 的 `g1.afterReload.restoredPanel.view=succeeded`；1825663B == `downloaded-ai-text-result-1.png`（sha 9019ffaf… 实算 MATCH） |
| ORNAMENT_TEXT | PARTIAL | **PASS** | 漏读（观测腿） | 同结构；2439783B == `downloaded-ornament-text-result-1.png`（d7a57b9b… MATCH） |
| SDS_DESIGN | PARTIAL | **PASS** | 漏读（观测腿） | 2081539B == `downloaded-sds-design-result-1.png`（a119eb6c… MATCH） |
| SCENE_TRANSFER | PARTIAL | **PASS** | 漏读（观测腿） | 839268B == `downloaded-scene-transfer-result-1.png`（dfb33c53… MATCH） |
| AI_POSE_GENERATOR | PARTIAL | **PASS** | 漏读（观测腿+字节键+产物名） | `real-acceptance/H4-real-20261029/AI_POSE_GENERATOR.json`：`"navType":"reload"` + `dockItems[]` 含 task-mvtd89f3-9qpix6（succeeded）+ 1151209B == `suite-design-realgen-20261029/ai-pose-generator-result-1.png`（19028125… MATCH） |
| NEW_DESIGNER | PARTIAL | **PASS** | 漏读（观测腿+字节键+产物名） | 同上：`"navType":"reload"` + `dockItems[]` 含 task-mvtdl9v8-165q1n + 411801B == `new-designer-result-1.png`（90e28e0f… MATCH） |
| IMAGE_TEXT_EDIT | PARTIAL | PARTIAL | 结论正确，**原因错误** | 真因是 `verdict=BLOCKED(payload)`、`payloadDropped=true`、`storageKey/bytes=null`（结果持久化修复前的任务），不是「任务 failed」 |
| PRODUCT_MARKET_MATERIAL | PARTIAL | PARTIAL | 结论正确，**原因错误** | 真因是 `BLOCKED(no-real-task)`：`taskIndex.countForTool=0`（64 条快照里无该工具），不是「task 仅出现在自由文本」 |
| AI_WEARABLE | PARTIAL | PARTIAL | 结论正确，**原因错误** | `evidence/r8h-4tools-20261029/AI_WEARABLE.json`：常驻 profile `countForTool=0`、`dockRows=[]`；虽有真实产物 1641506B/`result1.png`，但**无该工具任务快照 → 无 reload 后恢复链** |
| AI_DRESSING_V2 | PARTIAL | PARTIAL | 结论正确，**原因错误** | 同上（用 `dockToolId` 绑定 + `countForTool=0`），产物 819224B 存在但无任务/reload 绑定 |
| FISSION_LINK | PARTIAL | PARTIAL | 一致（不升级） | `H2-fission-xsy-20261029/evidence.json` 只有散文式「真实全量刷新(location.reload)」，无机器可读 reload 标记（无 `navType/phase=reload`、无 reload 对象节点）→ **不得据此升 PASS** |
| PRODUCT_IMAGE_SUITE / DRESS_WEAR_SET / PRODUCT_SCENE | PARTIAL | PARTIAL | 一致（字节真缺） | `history-restore-20261029/summary.json` 声明 2840825B/2785837B/2516552B 并带 sha256_16，但仓库内**无同尺寸同 sha 的结果产物**（该任务字节未提交） |

统计：R9 `H PASS 13 / PARTIAL 26` → 复核 `H PASS 19 / PARTIAL 20`（F/T/R/K/U 维度未改）。

## 2. 漏读根因（全部为审计器映射缺陷，与证据质量无关）

1. **刷新后观测只认「数字型」坞计数**：`OBS_RES` 的 `dockCount` 只匹配 `"dockItems": <数字>`；H4 回执写的是 `"dockItems": [ {taskId,status,…} ]` 数组 → `post_reload=None`，reload 腿判假。
   修复：新增 `dockArray`（`dockItems|restoredItems|historyItems|dockItemList` + `[ {`）与 `restoredPanel`（`restoredPanel|resultCardAfterReload|panelAfterReload`）。
2. **字节字段名不全**：`BYTE_KEYS` 缺 H4 回执使用的 `declaredBytes` / `renderedBytes`（补：`resultBytes/outputBytes/actualBytes`）→ 字节腿无 claim。
3. **产物作用域过度严格**：`_artifact()` 只认 `toolId 字面量 in 路径` 或 `basename.startswith(toolId)`；实际产物按路由 slug 命名（`ai-pose-generator-result-1.png` vs `AI_POSE_GENERATOR`，仅下划线/连字符之差）→ 判为非本工具产物。
   修复：slug 归一（`_`→`-`、再去分隔符）比对；**sha 仍是硬门槛**（有 sha 时必须 `sha_of(artifact).startswith(sha)`）。
4. **工具级 BLOCKED 回执整份被丢弃**：`_scan()` 前置过滤 `"task-mv" not in raw → skip`，导致 `AI_WEARABLE/AI_DRESSING_V2`（用 `dockToolId`、无 task id）与 `PRODUCT_MARKET_MATERIAL`（`countForTool=0`）的定性回执从未进入判定，原因退化为「task 仅在自由文本」。已在 §1 用回执原文给出精确原因；代码级原因映射未落地（见 §4）。

> 修复 1–3 只让「本来就三腿成立」的证据被正确读出；缺 reload 机器标记或缺同 sha 产物的条目仍判 PARTIAL。

## 3. 复核用例（可重跑）

```bash
cd docs/V1.0/plan_linkfox_navigation
python3 tools/recompute_scope_matrix_r9.py --debug | grep -E "strong=1"     # 19 行
shasum -a 256 evidence/suite-design-realgen-20261029/ai-pose-generator-result-1.png   # 19028125… 1151209B
shasum -a 256 evidence/suite-design-realgen-20261029/new-designer-result-1.png        # 90e28e0f…  411801B
shasum -a 256 evidence/real-acceptance/B2G1/AI_TEXT/downloaded-ai-text-result-1.png   # 9019ffaf… 1825663B
```

机器明细：同目录 `crosscheck.json`（19 项 strong 的 task/reload/obs/bytes/sha/artifact 全字段）。

## 4. 未完成 / 风险

- §2.4 的 BLOCKED 原因映射未写成代码：原因修正只落在本报告；`matrix.md` 归 R9 worker 所有，按约定未改。
- AI_WEARABLE / AI_DRESSING_V2 的「有产物但无任务快照」未补证：需在该常驻 profile 内真实提交一次（本轮禁止新证据），故 H 保持 PARTIAL。
- PRODUCT_IMAGE_SUITE / DRESS_WEAR_SET / PRODUCT_SCENE 的字节缺口是**真缺口**（未提交对应结果图），需补提交或重跑取证，不接受以 sha256_16 自述替代。
- **残余精度风险（未修，如实标注）**：AI_POSE_GENERATOR / NEW_DESIGNER 的字节腿当前落在 `task.declaredBytes`（该节点无 sha），`byte_proof.sha=None`，
  即这两项是「同 slug 产物 + 尺寸完全一致」的匹配；回执 `imageBytes.sha256`（19028125… / 90e28e0f…）经独立实算与产物 sha 一致，
  因此判定成立但审计器尚未把该 sha 绑到 claim 节点（`crosscheck.json` 中 `sha_match=false` 属此原因，非证据缺失）。修正方式：
  在 claim 采集后遍历同 scope 的 `imageBytes`/`result.sha256` 节点做 (bytes → sha) 补绑；未做以避免与 R9 worker 并行改动冲突。
