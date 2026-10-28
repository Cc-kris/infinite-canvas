# B2 / G1 真实结果字节留存：落地与验收报告

> 承接 `final-gap-audit.md` §4 G1「原始结果字节未留存 → 资产/画布永久不可复用」与 §5 B2 批次。
> 本文只记录**物理执行过的证据**：真 Chrome、真上传、真上游生成（canvas-proxy → 真实渠道）、真点击结果卡三动作、真刷新。

## 1. 结论

| 工具 | 判定 | 结果字节 | sha256(前16) | 下载=上游 | 存入资产 | 发送画布 | 刷新后字节可复原 |
|---|---|---|---|---|---|---|---|
| `AI_TEXT` | **PASS** | 1825663 B · 1024×1024 | `9019ffaf22487707` | ✅ | `uStjodx0Uad4IPDsTVqoG` | `sNQeliaC-Z_BkqoJVdTaw` | ✅ IDB 字节 sha 一致，面板恢复、三按钮可用 |
| `ORNAMENT_TEXT` | **PASS** | 2439783 B · 1024×1024 | `d7a57b9b72c29334` | ✅ | `_JGRrrDhs1xgmgeGmmnZ0` | `xpWrYbEDQlCJH8It8ID_Q` | ✅ 同上 |
| `SDS_DESIGN` | **PASS** | 2081539 B · 1024×1024 | `a119eb6cf4889e2d` | ✅ | `tr2qRM39e-G66t6X1l3dr` | `S0iOeaR__wU4YSctOdBUR` | ✅ 同上 |
| `SCENE_TRANSFER` | **PARTIAL** | 1749328 B · 1024×1024 | `8cbd69fa9e888d99` | ✅ | `uyr51AXkHKOlrW1yYyKn1` | `HKaKyYMgARtvy7PT38Ef8` | ❌ **缺口保留**：该 workspace 不落盘，刷新即丢 |

- **B2（结果字节留存）**：3/4 工具闭合。上游响应全量落盘（2.4–3.3 MB 原始 body，零截断），解码字节 sha256 与「下载」拿到的文件、与刷新后从 IndexedDB 取回的字节三者完全一致。
- **G1（不可复用）**：这 4 个工具在修复前是「结果卡看着成功、字节用完即弃、刷新后点不动」；修复后 `AI_TEXT/ORNAMENT_TEXT/SDS_DESIGN` 的刷新→下载/存资产/发画布 全部真实通过。
- **保留缺口**：`SCENE_TRANSFER` 走组件本地 `useState`，未接入持久化层，属产品缺陷而非验收缺陷（详见 §4）。

## 2. 根因与修复

### 2.1 根因（G1）
结果项的二进制只活在内存（`dataUrl` / `blob` / 上游 `url`）；落盘时被 `sanitizeTaskForPersist` 一律剥离并置 `payloadDropped=true`，localStorage 快照里没有稳定句柄 → 刷新后结果面板只剩「成功」文案，下载/存资产/发画布全部拿不到字节。

### 2.2 修复（3 个提交）

**`e680e76` — 主修复：字节落 IDB + 持久化 storageKey**
- `web/src/services/api/tools/task-machine.ts`
  - `ToolTaskResultItem` 新增 `storageKey`（第 65 行）；
  - `sanitizeTaskForPersist`（第 377–386 行）：**有 `storageKey` 时不算丢字节**，保留 `storageKey/bytes/mimeType/url` 且 `payloadDropped=false`；只有既无 `storageKey` 又无字节时才置 `payloadDropped=true`。
- `web/src/stores/use-tool-task-store.ts`
  - `ingestResultMedia`：成功结果把真实字节写入 `media_files`(IndexedDB)，记住 `storageKey` 与 `bytes`，内存态仍保留原 `dataUrl/blob`（共享结果动作优先用它们）；
  - `restoreResultMediaUrls`：hydrate 后按 `storageKey` 重建对象 URL（对象 URL 不过夜）；
  - upsert 时异步补做入库，同一 `task:receivedAt` 只入库一次，避免轮询重复写。

**`5dfe082` — 渠道形态兼容**
- `SDS_DESIGN` 首次实跑暴露：上游可能返回 `data[0].url`（oss 直链）而非 `b64_json`。验收脚本据此增加 url 形态分支（经本地代理取字节做基准），并把「上游给 url 时需二次下载」记为渠道风险。

**`88441d1` — G1 残留补齐：url-only 结果项也入库**
- 旧 `ingestResultMedia` 的 `source = blob ?? dataUrl`，对「只有远程 url」的结果项直接跳过 → 不入库、刷新后仍会丢。渠道（sds-design）确实会返回 oss 直链，这不是理论风险。
- 现在 `needsIngest` / `source` 兼容 `http(s)` 结果地址，经 `fetchMediaBlob`（本地代理 + 超时 + 非 2xx 判失败，绝不把错误页当结果）取真实字节后入库。
- 运行时验证 `_check-url-ingest.mjs`：`GET http://127.0.0.1:23210/https://oss-us.dimenoss.com/...png → 200`，`storageKey=tool-result:XrjlUtSLOZ5tSFTyjjhEI`，`bytes=1232851`，`IDB exists=true`，`payloadDropped=false`。
- `tsc --noEmit` 通过。

## 3. 验收方式（可复现）

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
# 单工具全链路：真实上传 → 真实上游 → 结果卡三动作 → 刷新 → IDB 字节比对
nohup /opt/homebrew/bin/node scripts/real-acceptance/run-b2g1.mjs AI_TEXT > /tmp/b2g1-ai.log 2>&1 &
# 可选值：AI_TEXT | ORNAMENT_TEXT | SDS_DESIGN | SCENE_TRANSFER
# 产物：../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/B2G1/<TOOL>/
```

每个工具目录包含：`raw-upstream-0.json`（上游全量响应）、`result-0.png`（解码字节）、`downloaded-*`（下载动作的真实文件）、`restored-after-reload.png`（刷新后面板）、`task-snapshot.json`（localStorage 快照）、`run-b2g1.json`（结构化回执：字节/sha256/尺寸/assetId/canvasId/storageKey/verdict）。

断言口径（三条同时成立才算 PASS）：
1. `sha256(解码字节) === sha256(下载文件)`；
2. 刷新后按 `storageKey` 从 IndexedDB 取回的字节 `sha256` 与第 1 条一致，且结果面板恢复到 `succeeded`、下载/存资产/发画布三个按钮均可用；
3. 落盘快照里有 `storageKey`、无 `dataUrl`、`payloadDropped=false`。

## 4. 保留缺口（未修，需主会话决策）

### 4.1 `SCENE_TRANSFER` 结果不落盘（PARTIAL 的唯一原因）
- 证据：`web/src/components/tools/workspaces/scene.tsx` 用 `useState<ToolTask>`（第 1329 行）+ `runSceneTransfer({ onUpdate: setTask })`（第 1430–1442 行），**完全绕过 `useToolTaskStore`**；结果面板 `<ToolResult task={task} .../>`（第 1611 行）只读内存态。
- 物理表现：跑完后 `localStorage` 无任何 `tool-task:v1:*` 键（`task-snapshot.json` = `[]`），刷新后结果面板回到「还没有生成结果」空态（`run-b2g1.json` → `g1.afterReloadPanel.view = "empty"`）。
- 影响：该 workspace 的结果本身仍可当次下载/存资产/发画布（B2 通过），但刷新或切页后不可复用，等价于未修复 G1。
- 建议改法（属共享/他人文件，未动）：让 `scene.tsx` 的提交走 `useToolTaskStore` 的 gateway（与 `image.ts` 同路径），把 `setTask` 换成 store 的 upsert；或至少把最终 `ToolTask` 写进 store 一次。**此改动会碰 `scene.tsx`（并行 worker 可能也在动），需主会话统一排期。**

### 4.2 上游「url 形态」的二次下载风险（已缓解，未消除）
`SDS_DESIGN` 实测出现过 `data[0].url` 形态（`output_format=png`，oss 直链，无 `b64_json`）。现在入库会主动抓取该链接，字节即时落 IDB，因此刷新不受影响；但若某次抓取失败（链接 4xx/超时），该结果只能留在内存，落盘时标记 `payloadDropped=true` —— 这是**可追溯的降级**，不是静默失败。

### 4.3 验收覆盖边界
- 本轮只覆盖 final-gap-audit B2 列出的 4 个工具；`G4` 的其余 14 个工具三动作统一回归不在本轮范围。
- 上游渠道存在形态随机性（b64 vs url），单次 PASS 不等于渠道恒定；脚本已两种形态都兼容，但重复跑仍可能出现形态差异，属上游行为不代表回归。
- 所有会话用的都是真实渠道与真实账号额度（4 次生成 + 1 次 url 抓取）。

## 5. 证据索引

- 验收脚本：[run-b2g1.mjs](file:///Users/mac/Documents/Dev/infinite-canvas/web/scripts/real-acceptance/run-b2g1.mjs)
- url-only 入库探针：[_check-url-ingest.mjs](file:///Users/mac/Documents/Dev/infinite-canvas/web/scripts/real-acceptance/_check-url-ingest.mjs)
- 四个工具证据目录：[evidence/real-acceptance/B2G1](file:///Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/B2G1)
- 逐条结构化回执：各工具目录下 `run-b2g1.json`
- 提交：`e680e76`（主修复 + AI_TEXT）、`3657b31`（ORNAMENT_TEXT）、`5dfe082`（SDS_DESIGN + 渠道兼容）、`1b5b6a3`（SCENE_TRANSFER PARTIAL）、`88441d1`（url-only 入库）
