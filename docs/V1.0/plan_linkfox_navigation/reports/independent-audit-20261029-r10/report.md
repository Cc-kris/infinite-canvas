# R10 独立只读复验：R18 / R16 / R20 三份机器回执

- 日期：2026-10-29
- 复验对象：HEAD `92d1b3c` 内的三份回执
  - `09f7279` — `docs/V1.0/plan_linkfox_navigation/evidence/r18-h-reload-actions-20261029/`（PRODUCT_SCENE / HANDHELD_GOODS）
  - `a94e382` — `evidence/real-acceptance/PRINT_EXTRACT/reload-verify-r16.json`（PRINT_EXTRACT）
  - `92d1b3c` — `docs/V1.0/plan_linkfox_navigation/evidence/r20-remove-pen-reload-20261029/`（REMOVE_PEN）
- 方式：**只读**。未改业务源码、未重跑生成、未注入字节、未改写任何 localStorage / IndexedDB。
- 判据：沿用 R9 收紧后的 H 三腿，未放宽——
  1. **taskId** 须 primary 绑定（本地任务记录/结果项 storageKey）且与观测同指；
  2. **fresh reload** 须机器可读标记 + 刷新后观测（字节来自刷新后的面板/存储，不是内存）；
  3. **字节** 须同尺寸 + 同 sha256，且能被第三方用仓库内已提交产物复算。

## 0. 结论（可计入 H 的精确清单）

| 工具 | 回执 | 本判 | 依据 |
| --- | --- | --- | --- |
| PRODUCT_SCENE | 09f7279 | **H PASS（新增 +1）** | 三腿全绿，sha 由仓库产物与 `~/Downloads` 双向复算一致 |
| HANDHELD_GOODS | 09f7279 | **H PASS（新增 +1）** | 三腿全绿，同上 |
| PRINT_EXTRACT | a94e382 | **仍 PARTIAL** | 字节腿 PASS；reload 腿为 `navType=navigate`+cache-buster（非 `nav=reload`），且本轮下载被浏览器策略拦下无新落盘 |
| REMOVE_PEN | 92d1b3c(r20) | **仍 PARTIAL（不可计入 H）** | 无 sha、无提交产物、无第三方可读任务记录；回执中的 taskId/assetId/projectId 在任何浏览器 profile 与磁盘均无第二处佐证 |

→ 本轮净增 H：**2**（PRODUCT_SCENE、HANDHELD_GOODS）。按 R9 口径 H 由 `PARTIAL 20 / PASS 19` → **`PARTIAL 18 / PASS 21`**。
（未改动 `reports/independent-audit-20261029-r9/matrix.*`：该文件工作区有他人未提交改动，本轮不动。）

## 1. PRODUCT_SCENE（task-mvtly3vu-fdqgy7）→ PASS

回执字段核对（`receipt-product-scene.json`）：

| 腿 | 回执字段 | 复核结果 |
| --- | --- | --- |
| taskId | `task.taskId=task-mvtly3vu-fdqgy7`，`resultItemId=task-mvtly3vu-fdqgy7-0`，`storageKey=tool-result:task-mvtly3vu-fdqgy7:0:TTlb-VmksNFfPn_GhRyTk` | 该 taskId 在 ego lite Profile 1 的 `Local Storage/leveldb`（origin `http://127.0.0.1:3000`，key `tool-task:v1:index`）索引中存在，绑定成立 |
| fresh reload | `navigationType=reload`，`performanceNavigationStart=1793283612760`，`postReloadPanel.imageSha256/imageBytes` | 机器可读；刷新后面板图片字节实算，非内存 |
| 下载 | `savedPath=~/Downloads/product-scene-result-1 (1).png`，`bytes=2398828`，`sha256=fa5ee380…9f9e2` | 实存、mtime 22:20，实算一致 |
| 存资产 | `assetId=KY0av0CXhd3-OFulLII_O`，`db=image_files/image:Ax9oXqNqedcNZ40XGdh19`，同字节同 sha | 回执内有 storageKey + 字节复核；本轮只读未触库 |
| 发画布 | `canvasProjectId=OCk3x2ThYr5Fom6sRbdg8`，`canvasNodeId=image-1793283628325-tasuh`，`nodeStorageKey=image:7x6DyXlCjNnZozGl69wmV`，同字节同 sha | 同上 |
| 无新生成 | `generationCalled=false`，`taskUpdatedAtBeforeAfter` 前后同为 1793282295219 | 与"复用既有任务"一致 |

第三方可复算（本机实跑）：

```
$ shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/r16-scene-real-20261029/PRODUCT_SCENE-result-1.png
fa5ee380ab79ae8b924e1481136cbcfe4f23473926246c79129fc0c59093f9e2   (2398828 B)
$ shasum -a 256 "$HOME/Downloads/product-scene-result-1 (1).png"
fa5ee380ab79ae8b924e1481136cbcfe4f23473926246c79129fc0c59093f9e2   (2398828 B)
```

三处（回执声明 / 提交产物 / 下载落盘）同尺寸同 sha → 字节腿成立，H PASS。

## 2. HANDHELD_GOODS（task-mvtm8p59-8qkp5s）→ PASS

| 腿 | 回执字段 | 复核结果 |
| --- | --- | --- |
| taskId | `task-mvtm8p59-8qkp5s` / `...-0` / `storageKey=tool-result:task-mvtm8p59-8qkp5s:0:c3Xf2R0z4RYt31DCxRmmX` | ego lite Profile 1 的 `tool-task:v1:index` 索引命中 |
| fresh reload | `navigationType=reload`，`domContentLoadedEventStart=1793283685252`，面板 `imageBytes=1455193 / imageSha256=29c1afcd…ae84` | 机器可读 |
| 下载 | `~/Downloads/handheld-goods-result-1 (1).png`，1455193 B | 实存、mtime 22:21，实算一致（同目录 `handheld-goods-result-1.png` 亦同 sha） |
| 存资产 | `assetId=92UtEzWXt3YLL1uf-aSej`，`image:IHMMoRrRSkxKIgwF0YCxu` | 回执内字节复核 |
| 发画布 | `canvasProjectId=dRgYk58nWI5L7qH36F9Q7`，`canvasNodeId=image-1793283697520-vnm7b`，`nodeStorageKey=image:6NZmO8kbL4vnm0VmyZ1US` | 同上 |
| 无新生成 | `taskUpdatedAtBeforeAfter` 同为 1793282780051；工具任务数 2（另一条 failed 历史项未参与） | 一致 |

```
$ shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/r17-handheld-real-20261029/HANDHELD_GOODS-result-1.png
29c1afcd7bdad71b369664a756b2825395aea9c7e6634a6e23360ba9682cae84   (1455193 B)
$ shasum -a 256 "$HOME/Downloads/handheld-goods-result-1 (1).png"
29c1afcd7bdad71b369664a756b2825395aea9c7e6634a6e23360ba9682cae84   (1455193 B)
```

→ H PASS。

## 3. PRINT_EXTRACT（task-mvtlxua2-kh39uf）→ 仍 PARTIAL

已核实（PASS 的部分）：

- taskId 绑定：`taskId=task-mvtlxua2-kh39uf`，`storageKey=tool-result:task-mvtlxua2-kh39uf:0:jf8VlMsU9spY5W5raRSnO`；ego lite Profile 1 `tool-task:v1:index` 命中。
- 字节：2783996 B / `1577dafd…d822`，四处一致（回执声明、`evidence/real-acceptance/PRINT_EXTRACT/result.png`、`~/Downloads/print-extract-result-1.png` 实算、回执内 media_files/image_files 副本）。
- 存资产：`assetId=fjzr1NhaALbnYz5LOAv9r`，`countBefore/After=50/51`，metadata.taskId 命中。
- 发画布：`projectId=DD6JsYYuaqJz5Eh7Ot-Oa`，`canvasNodeId=image-1793283578986-px8bw`，DOM 命中 `data-node-id`。

仍未满足（不放宽）：

1. **reload 腿不是 `nav=reload`**：回执自述 `navType="navigate"`、mechanism 为「加 cache-buster 的全文档导航」，虽有 `timeOrigin 1793283410632 → 1793283495679`、`documentRecreated=true`，但 R9 收紧判据要求机器可读的 fresh reload 标记（`navigationType=reload` / `location.reload()` 回执）；r18 已证明该环境 `location.reload()` 可用（两份回执 `navigationType=reload`），故本项属**可补**而非不可补。
2. **本轮下载未落新文件**：回执如实记录自动化点击被 Chrome 多自动下载策略拦下，`~/Downloads` 无 22:16/22:20 新条目；payload 级捕获 + 旧落盘产物同 sha 只够字节腿，不构成"下载动作在本轮真实成功"。

→ H 记 PARTIAL。补齐方式（下一轮，需真实点击）：在 3000 环境用 `location.reload()` 真刷新后点下载，产出 `(1)` 副本并回填 sha。

## 4. REMOVE_PEN（task-mvtmnhk5-nr2g0z）→ 仍 PARTIAL，且回执不可第三方复核

回执声明（`receipt-remove-pen.json` / `report.md`）：task `succeeded` 34s、2440825 B、`storageKey=tool-result:task-mvtmnhk5-nr2g0z:0:komJnSXgwkxdOFeQHXTGI`、下载 2440825 B、存资产 `1xIHbpny`、发画布 `ojUWiNT5 · image-17`。

本轮只读核查结果：

| 检查 | 结果 |
| --- | --- |
| 该 taskId 是否在浏览器持久存储 | **否**。ego lite Profile 1/2、Chrome Profile 1、Chromium/Brave/Edge/Vivaldi/Grok Bot/Infinite Canvas 等全部 profile 字节级扫描：`task-mvtmnhk5-nr2g0z` **0 命中**；ego lite Profile 1 的 `tool-task:v1:index` 列表里也**没有**该 id（索引最新到 r18/r16 两轮的任务为止） |
| 回执声称的 storageKey / assetId / projectId 是否有别处佐证 | **否**。`komJnSXgwkxdOFeQHXTGI`、`1xIHbpny`、`ojUWiNT5` 仅出现在 Galley 会话临时文件（`temp/lf_remove_pen_final/output.txt`、`workbench.db-wal`、模型响应转写）中，属**同一来源的自述**，不构成独立证据 |
| 是否有 2440825 B 的真实字节文件 | **否**。`find` 全盘（含 `~/Downloads`、`/tmp`、`/var/folders`、playwright 缓存、IDB blob 目录）无该尺寸文件；`~/Downloads` 无任何 `*erased*` / `public_input*` 文件 |
| 仓库内是否有该工具已提交产物可复算 sha | **无**（r20 目录只有 json + report，没有 PNG） |
| 回执内的 reload 标记 | 只有文本 `method="冷启动同一浏览器 profile，直接打开…"`，**无** navType / timeOrigin / performance 字段 → 不满足"机器可读 fresh reload 标记" |
| 回执内字节 sha256 | **未声明**（只声明 bytes） |

结论：**REMOVE_PEN H 不可计入**。`92d1b3c` 的代码修复（`mask.tsx` 判据补 storageKey、`remove-pen.ts` 增 `removePenResultItem/removePenTaskHasResult`）本身在 HEAD 内可读、方向正确，但 r20 回执缺少可复核锚点：任务记录不落盘（r20 用 playwright 独立临时 profile，关闭即丢弃）、无产物入库、无 sha。按现有证据只能记 PARTIAL/UNVERIFIED。

补齐所需（下一轮，真实执行）：
1. 用 **ego lite（默认控制浏览器，Profile 1，origin http://127.0.0.1:3000）** 真实生成一次 REMOVE_PEN，确认 `tool-task:v1:index` 出现新 taskId；
2. 用 `location.reload()` 真刷新（机器读取 `performance.getEntriesByType('navigation')[0].type === 'reload'`），记录 timeOrigin 前后值；
3. 三动作各留机器字段：下载 `savedPath/bytes/sha256`（落盘后 `shasum` 实算）、存资产 `assetId + image_files storageKey + bytes/sha`、发画布 `projectId + canvasNodeId + app_state 节点 metadata.storageKey/bytes`；
4. 把结果 PNG 提交进 `evidence/` 目录，供第三方用 `shasum -a 256` 复算。

## 5. 复验所用命令（可重放）

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/r16-scene-real-20261029/PRODUCT_SCENE-result-1.png
shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/r17-handheld-real-20261029/HANDHELD_GOODS-result-1.png
shasum -a 256 evidence/real-acceptance/PRINT_EXTRACT/result.png
shasum -a 256 "$HOME/Downloads/product-scene-result-1 (1).png" \
                "$HOME/Downloads/handheld-goods-result-1 (1).png" \
                "$HOME/Downloads/print-extract-result-1.png"
# 任务持久化核查（origin 前缀 http://127.0.0.1:3000）
grep -a 'tool-task:v1:index' "$HOME/Library/Application Support/Citro Labs/ego lite/Profile 1/Local Storage/leveldb/000661.log" | head -c 400
# REMOVE_PEN 任务全 profile 搜（0 命中）
grep -rl 'task-mvtmnhk5-nr2g0z' "$HOME/Library/Application Support"/{Google/Chrome,Citro\ Labs,Chromium,BraveSoftware} 2>/dev/null
# 2440825B 文件全盘搜（0 命中）
find "$HOME" /private/var/folders /private/tmp -type f -size 2440825c 2>/dev/null
```

## 6. 未做 / 边界

- 未重跑 `tsc` / `bun test`（r20 声明的 28 pass 未独立复跑；本轮目标是回执证据链，不是闸门）。
- 未修改 `matrix.json/md`、`project_memory.md`（工作区有他人未提交改动），也未触碰暂存区里他人的 `tool-result-*.ts(x)` / `task-snapshot.ts`。
- 未在浏览器里做任何写入型操作，未新开/关闭任何用户标签。
