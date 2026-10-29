# R12 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：生成时 HEAD `32ebf95`（`feat/linkfox-v1-real`；起始点 `7ff08bf`，期间有并发提交推进）
- 基线：R11 `3c9d81a`（审计 HEAD `6636e1f`，H PASS 26）+ R11 crosscheck `9fae2d6`（5 处映射/归属修正，统计零变更）
- 生成：2026-10-29T20:32:16+08:00；审计器：`tools/recompute_scope_matrix_r12.py`（继承 R11，只加 R12 硬断言与改判归因，**不放宽任何判据**）
- 证据源：`git ls-tree HEAD` 内已提交文件；**未提交/未跟踪内容一律不计**
- 本报告**未生成任何新证据、未改业务源码、未派 worker、未生成任何任务**
- 吸收提交：`0e8f9f1`（两视频续查到终态 + 两工具 b4 三动作回执）、`61e86fc`（DWS 结果区挂共享 ToolResult）、`6cb0afc`（FISSION_LINK 重载/字节 round-trip）、`7ff08bf`（DWS r12 面板重建）、`7664498`（DWS 三动作回执）、`5c25200`（web/bun 闸）、`097f097`/`4f7d4af`/`ff621c3`（MARKET_MATERIAL 真实 UI 尝试与结果卡修复：未达三腿，判定未变）

## 1. 统计（精确计数，39 工具 × 6 维）

| 维度 | 分布 | 合计 |
| --- | --- | --- |
| F（动作回执 ≥2） | **PASS 30 / PARTIAL 9** | 39 |
| T（画幅/时长透传） | **PASS 32 / PARTIAL 7** | 39 |
| R（结果可复核） | **PASS 37 / PARTIAL 2**（BLOCKED 0） | 39 |
| H（历史可恢复，三腿） | **PASS 29 / PARTIAL 10** | 39 |
| K（无密钥/接口合规） | **PASS 12 / N/A 27** | 39 |
| U（UI 可用） | **PASS 39** | 39 |

相对 R11（F 28/11、T 32/7、R 35/2+2 BLOCKED、H 26/13、K 12/27、U 39）：**共 7 处改判**（在 `7ff08bf`、`ff621c3`、`550b6c7` 三次运行统计完全一致，仅 head 字段随并发提交推进），全部由新提交证据本身落进 HEAD 引起，无口径调整。

## 2. 7 处改判（逐条归因）

| 工具 | 维度 | 变更 | 提交 | 事实依据 |
| --- | --- | --- | --- | --- |
| PRODUCT_IMAGE_SUITE | F | PARTIAL → PASS | `0e8f9f1` | `b4-actions.json` 下载/存资产/发画布三动作字节同为 **2,151,517B**，与提交产物 `02-result.png` **同尺寸**（实测 2151517）；`consoleErrors` 空。R11 时该回执不在 HEAD，属证据缺口。 |
| DRESS_WEAR_SET | F | PARTIAL → PASS | `0e8f9f1` | `b4-actions.json` 三动作字节同为 **1,239,248B**，与提交产物 `DRESS_WEAR_SET/result.png` 同尺寸（实测 1239248）。 |
| FISSION_LINK | H | PARTIAL → PASS | `6cb0afc` | CDP 真实 `Page.reload`（`navType=reload`，marker `1793275695.89`）后 dock 内同一 `task-mvt18lrt-rsnifn` 仍 `succeeded`；回执字节 **1,988,694B / sha `bbc0ca08…`** 与 `FISSION_LINK/r10/result.png` **逐位相同**（实测 1988694 / bbc0ca08…）。 |
| VIDEO_TRANSLATION | R | BLOCKED → PASS | `0e8f9f1` | `downloaded.mp4` 实存 **1,080,637B**，魔数 `ftyp`（`000000206674797069736f6d`），与回执声明一致。 |
| VIDEO_TRANSLATION | H | PARTIAL → PASS | `0e8f9f1` | 真实任务 `task-mvth8drs-dk86it` 终态 `succeeded`（上游 `task_ye7NHl8fwVr1Roh5ysCKB1C7Nr2lMwZd`）；整页新文档加载后 dock 命中同一 taskId 且 `succeeded`；结果 1,080,637B MP4、`readyState=4`、768×768；`payloadDropped=false`；下载字节与结果相等。 |
| VIDEO_CONCAT | R | BLOCKED → PASS | `0e8f9f1` | `downloaded.mp4` 实存 **2,133,234B**，`ftyp`。 |
| VIDEO_CONCAT | H | PARTIAL → PASS | `0e8f9f1` | 真实任务 `task-mvthgaa4-pdg1eq` 终态 `succeeded`（上游 `task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF`）；刷新后 dock 命中同一 taskId；结果 2,133,234B / 7.292s / 768×1344；下载字节相等。 |

## 3. 严格性边界（未放宽，且明确排除伪 PASS）

1. **pending/running/下载未命中一律不算 PASS**：每个改判工具都跑硬断言，`no_pending_status` 要求时间线末态为终态成功（`running` 只作历史中间态）；VIDEO_CONCAT 的 `running → succeeded` 序列按末态判定，未把中间态当结果。
2. **下载未命中保留为 UNVERIFIED**：FISSION_LINK 本轮下载按钮未点到（`verdict=UNVERIFIED`、`clicked=false`），断言 `download_not_claimed_pass` 明确禁止其参与判定；其 F=PASS 仍由存资产/发画布两腿成立。
3. **字节必须同尺寸**（声明 sha 时逐位相同）：所有翻 PASS 的 H 行都用仓库内提交产物实测尺寸/哈希复核，非仅读回执字段。
4. **不含未提交内容**：审计在 `7ff08bf` 的干净 worktree 中执行（工作区另有大量未提交 WIP 与 197 个未跟踪证据文件，均未参与）。
5. **VIDEO_CONCAT 的 failed 记录不混用**：`README-20261029-continuation.md` 里那笔 `failed / submit-unconfirmed` 仍是 failed；本次 PASS 依据的是另一笔真实成功任务。

## 4. 风险 / 未做

- **视频 reload 腿的实现方式**：两笔视频回执的“刷新后观测”由 `page.goto(<route>?fresh=…)`（整页新文档加载）后读 `[data-testid=tool-task-history-item]` 得到，而非 `Page.reload()`。语义上仍是“整页重载 + 状态只能来自 IndexedDB”，故判据成立；但若后续口径要求必须是同 URL reload，需重跑一次确认。
- **DWS r12 第 0 项字节未入库**：面板声明 2,516,552B 与 1,883,817B，仅后者与提交产物 `r10/result.png` 一致；前者只落在 `~/Downloads`（未提交），故 DWS 的 H 仍由 r10 那对（同 taskId + 同尺寸产物）成立，r12 作为补充证据记录，未据此改判。
- **DWS b4 与 r10/r12 属不同轮次**：字节 1,239,248 / 1,883,817 / 2,516,552 分属三份回执，矩阵按维度各自引用，未跨回执拼接。
- 未新增任何生成类证据、未修任何业务源码；`IMAGE_TEXT_EDIT` 仍 PARTIAL（`payloadDropped=true`，无字节腿）。
- 两阶段落库：本提交先固定 matrix/report/审计器（基线 `3c9d81a`+`9fae2d6` 的可复现结论），后续新证据按同一审计器增量重跑。

## 5. 复现

```bash
cd docs/V1.0/plan_linkfox_navigation
python3 tools/recompute_scope_matrix_r12.py                     # 生成 matrix.json / matrix.md
python3 tools/recompute_scope_matrix_r12.py --json /tmp/x.json --md /tmp/x.md
# 基线复核（R11 审计 HEAD，应得 H PASS 26）
git worktree add --detach /tmp/icw-r11base 6636e1f
cp tools/recompute_scope_matrix_r1*.py /tmp/icw-r11base/docs/V1.0/plan_linkfox_navigation/tools/
cd /tmp/icw-r11base && python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r12.py --json /tmp/b.json --md /tmp/b.md
```
