# R20 只读交叉核验：四份回执 taskId/终态/字节 sha/三动作/HEAD 归属

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`；分支 `feat/linkfox-v1-real`；核验 HEAD `f19a784`
- 基线矩阵：`reports/independent-audit-20261029-r15-matrix`（HEAD `3afe2c2`，F35/4 T39/0 R38/1 H31/8 K12/27 U39）
- 方式：`git ls-tree HEAD` 取已提交字节并**现场重算** sha256；核对回执内 taskId / 终态 / storageKey / 三动作回执 / 时序；未改任何业务源码、未新生成、未注入
- 判据：沿用 R15（F = 结果 + ≥2 条机器动作腿；H = task + 机器 reload 标记 + 刷新后观测 + 字节）。**未放宽任何判据**

## 1. 已提交字节实算（逐位比对）

| 工具 | 回执声明 | 提交产物 | 实算 sha256 | 结论 |
| --- | --- | --- | --- | --- |
| PRODUCT_SCENE | 2,398,828B / fa5ee380…（73b09be） | `PRODUCT_SCENE-result-1.png` | 2398828B / `fa5ee380ab79ae8b924e1481136cbcfe4f23473926246c79129fc0c59093f9e2` | ✅ 一致 |
| PRINT_EXTRACT | 2,783,996B / md5 ccdef37f…（8df2d8a） | `result.png` | 2783996B / `1577dafdcda3797856efcae1c662cdccbc2de0ab94b88acd2b94fe541e51d822` | ✅ 一致 |
| HAND_REPAIR | 2,153,466B / a34cea71…（560a46e） | `HAND_REPAIR-result-1024x1024.png` | 2153466B / `a34cea71ca7da6dec09ee6167367f6c60ba600e4ff44ec0c6441b6f5f3800e20` | ✅ 一致 |
| NEW_DESIGNER | 411,801B / 90e28e0f…（c125c62） | `new-designer-result-1.png` | 411801B / `90e28e0f93420bb42270708737760d810d9df1e986566aed60d61a79b4a09d88` | ✅ 一致 |

### 下载侧落盘文件（本机真实文件）

| 项 | 文件名 | 字节 | sha256 | mtime |
| --- | --- | --- | --- | --- |
| PIS-download | `product-image-suite-result-1 (3).png` | 2785837 | `6f9dec2af872e9e97f26830b63f3126fd462a71ff8106bfbc3f67c43ae22c6a4` | 2026-10-29 21:52:36 |
| NEW_DESIGNER-download | `new-designer-result-1 (2).png` | 411801 | `90e28e0f93420bb42270708737760d810d9df1e986566aed60d61a79b4a09d88` | 2026-10-29 21:53:35 |
| HAND_REPAIR-download(claimed) | `hand-repair-result-1.png` | 2153466 | `a34cea71ca7da6dec09ee6167367f6c60ba600e4ff44ec0c6441b6f5f3800e20` | 2026-10-29 17:49:16 |

## 2. taskId / 终态 / storageKey 一致性

| 工具 | taskId | 终态 | storageKey | 判定 |
| --- | --- | --- | --- | --- |
| PRODUCT_SCENE | `task-mvtly3vu-fdqgy7` | succeeded（UI 已完成） | `tool-result:task-mvtly3vu-fdqgy7:0:TTlb-VmksNFfPn_GhRyTk` | ✅ 内部一致；回执自述**刷新前**控制台证据 |
| PRINT_EXTRACT | `task-mvtlxua2-kh39uf` | succeeded（21:57:12→21:57:37，25.5s） | `tool-result:task-mvtlxua2-kh39uf:0:jf8VlMsU9spY5W5raRSnO` | ✅ 内部一致；task.json 与 localStorage 原文同源 |
| HAND_REPAIR | `task-mvtbe5rp-0maafh` | succeeded（notes 声明；JSON 无 status 字段） | `tool-result:MJlcLXl2-O1DnKd-NUgg2` | ⚠️ 终态仅散文声明，JSON 缺 status 字段 |
| NEW_DESIGNER | `task-mvtdl9v8-165q1n` | succeeded（R17） | `tool-result:vf21IxChoGYqJ9C8z8qMg`（无 taskId/index/nano 段） | ⚠️ storageKey 为旧格式，与 6ede584 新键不一致（历史任务，符合根因说明） |

## 3. 三动作归属：两处发现的**时间归属**缺陷（不改判据，故不改判决）

### 3.1 HAND_REPAIR（560a46e）：下载腿无本轮物理落盘

- 回执 claimed：`savedTo = ~/Downloads/hand-repair-result-1.png`，`bytesMatch=true`
- 实测：`hand-repair-result-1.png` mtime **17:49:16**；同目录 `hand-repair-result-1 (1).png` mtime **17:52:58**；二者均早于回执自身 `freshReload.at = 2026-10-29T13:43:20Z`（= 21:43:20 CST）与画布节点 `image-1793281461613`（= 21:44:21）约 **3h54m**
- 21:35–21:50 窗口内 `~/Downloads` **无任何新文件**；若本轮点击成功，Chrome 应生成 `(2)` 后缀文件，实际不存在
- ⇒ 该轮**下载腿的物理回执不可归属本轮**（属 17:49/17:52 旧一轮产物，字节恰为同一结果，故 sha 仍真）
- **判据应用**：F = 结果 + ≥2 条机器动作腿。本轮仍成立 2 条硬腿 —— 存资产 `assetId qVZbf4pJUvsoYXGe04jvD`（metadata.taskId 绑定）+ 发画布 `b35kvRaZb6zdwcOT_Yn2i / image-1793281461613-pl9uk` ⇒ **F PASS 维持**（不因勘误降级，也不因此放宽）
- 需更正表述：R15 报告「三动作齐备 / 三处字节互证」应读作「**2 条硬腿 + 下载腿字节同源但文件归属陈旧**」

### 3.2 NEW_DESIGNER（c125c62）：存资产腿时间早于本轮

- 回执 `saveToAssets` 两条：`nowDKQUvmRssATNlZ83VO` createdAt **2026-10-29T11:00:23.439Z（19:00:23 CST）**、`8J_BAwI8zxZ4ShWj0fxB7` createdAt **10:04:07.700Z（18:04:07 CST）**
- 本轮实测时序：下载 21:53:35、发画布 21:54:07 ⇒ 两条资产记录早于本轮 **1h53m / 2h49m**，**不是本轮点击的回执**，而是同任务早前「导出设计稿即入库」遗留
- **判据应用**：本轮仍有 2 条硬腿 —— 下载（411,801B / sha 90e28e0f，Downloads 实算一致）+ 发画布（`Z_1vTtbrlxiYoAUmDXh3t / image-1793282047892-95442`）⇒ **F PASS 维持**；R（411,801B 可由已提交产物复算）**PASS 维持**
- 需更正表述：「存资产 2 条同字节」应注明为**早前导出遗留**，非本轮三动作之一

## 4. 其余两回执：无归属缺陷，均维持原判

- **PRODUCT_SCENE（73b09be）**：字节/终态/三动作回执内部一致，但回执明确「未刷新前的控制台证据」，无机器 reload 标记与刷新后观测 ⇒ **H 维持 PARTIAL**（缺口：机器 reload 回执 2 条腿）
- **PRINT_EXTRACT（8df2d8a）**：succeeded/2,783,996B/1024×1024，落盘 md5 `ccdef37fe1cc90b5920d200ff9c2417e` 实算一致；README §3 为散文刷新观测，存资产自述 UNVERIFIED ⇒ **H 维持 PARTIAL**（缺口：一条机器 reload 回执 + 存资产腿）

## 5. 精确剩余非全绿清单（13 单元 / 10 工具；F35 T39 R38 H31，K12+N/A27，U39）

| # | 工具 | 维度 | 值 | 精确缺口 |
| --- | --- | --- | --- | --- |
| 1 | AI_VIDEO_EDITING | F | PARTIAL | 仅下载 1 条硬腿，存资产/发画布无结构化回执 |
| 2 | AI_VIDEO_EDITING | H | PARTIAL | task-mvtkgo4b-gaomk5 failed/submit-unconfirmed，无上游产物 |
| 3 | CHANGE_COLOR_V2 | H | PARTIAL | BLOCKED_NO_BYTES；字节属不可逆丢失窗口（a565e63） |
| 4 | HANDHELD_GOODS | H | PARTIAL | 唯一任务 task-mvs5p8g8-or3oim failed，无成功任务可绑 |
| 5 | IMAGE_TEXT_EDIT | H | PARTIAL | payloadDropped=true，无 storageKey/url/bytes |
| 6 | PRINT_EXTRACT | H | PARTIAL | 缺一条机器 reload 回执（README 散文不计）+ 存资产 UNVERIFIED |
| 7 | PRODUCT_SCENE | H | PARTIAL | 仅刷新前控制台证据，缺机器 reload 标记+刷新后观测 |
| 8 | REMOVE_PEN | H | PARTIAL | payloadDropped=true ×3，无字节 |
| 9 | VIDEO_CONCAT | F | PARTIAL | 仅下载硬腿；tool_assets 无同尺、media_files 无 storageKey、canvasVideoNodes=[] |
| 10 | VIDEO_REPLICATION | F | PARTIAL | HEAD 内无任何动作回执 |
| 11 | VIDEO_REPLICATION | H | PARTIAL | 仅散文抽样（1,963,716B），无机器 reload 与面板观测 |
| 12 | VIDEO_REPLICATION | R | PARTIAL | HEAD 内无 1,963,716B 产物可复算 |
| 13 | VIDEO_TRANSLATION | F | PARTIAL | 上游 /videos 拒上传字节（400），无成功样例可挂三动作 |

## 6. 判决变更汇总

- **改判：0 处**。四份回执的有效字节/终态/taskId 均通过现场实算；两处缺陷仅影响**叙述归属**，不影响 F/R 判决（≥2 硬腿判据仍满足）。
- **勘误：2 处**（HAND_REPAIR 下载腿文件归属、NEW_DESIGNER 存资产腿时间归属），已同步写入 r15-matrix 报告。
- **未改动**：`web/src/**` 业务源码 0 改动；矩阵判据 0 放宽。

## 7. 复核命令

```bash
shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/r16-scene-real-20261029/PRODUCT_SCENE-result-1.png \
  evidence/real-acceptance/PRINT_EXTRACT/result.png \
  docs/V1.0/plan_linkfox_navigation/evidence/edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png \
  docs/V1.0/plan_linkfox_navigation/evidence/suite-design-realgen-20261029/new-designer-result-1.png
ls -lT ~/Downloads/hand-repair-result-1*.png   # 17:49/17:52 => 早于 21:43 本轮
```
