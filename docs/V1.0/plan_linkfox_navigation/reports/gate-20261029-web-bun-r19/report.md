# Web 三闸 Gate 报告（typecheck / test / build）— 2026-10-29 r19

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- **被测固定快照 HEAD：`e78f6349b3f2c958e1d120b6b1bc242472589f5f`**（2026-10-29T21:37:02+08:00，`fix(product-image-suite): 结果保存真实写入作品库并留 assetId 回执`）
- 快照目录：`/Users/mac/Library/Application Support/app.galley/managed-ga-state/temp/gate-e78f634`（由 `git archive e78f634 | tar -x` 生成，无 `.git`）
- 依赖：`bun install --frozen-lockfile` → 931 packages installed（1.79s），`EXIT=0`
- 工具链（取自日志 / node_modules）：bun `1.4.2`；typescript `5.9.3`（`tsc --noEmit`）；vite `7.3.6`
- 运行时间窗：2026-10-29 21:39 – 21:43 CST

## 0. 结论

| 闸 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 类型检查 | `bun run typecheck`（`tsc --noEmit`） | **PASS**（无 error/warning 输出） | **0** | 3s |
| 单测 | `bun test` | **PASS**：1470 pass / 0 fail / 8298 expect()，83 文件 | **0** | 3s（日志 `[2.56s]`） |
| 构建 | `bun run build`（`vite build`） | **PASS**：✓ 8827 modules transformed，✓ built in 19.30s，dist 37 MB | **0** | 20s |

**本轮无源码改动、无必要修复**：三闸在 `e78f634` 干净快照上全绿，未发现该提交引入的明确回归（该提交只改 `web/src/components/tools/workspaces/suite.tsx` + 一份文档，改动面小且被既有用例覆盖，见 §3）。
本提交只包含**本报告 + 原始日志证据**，不含任何 `web/` 代码变更。

## 1. 快照身份核对（逐 blob 哈希）

`gate-e78f634` 不是 git 仓库，故无法自证；本次用**逐 blob 哈希全量比对**：

```
git -C <repo> ls-tree -r e78f634     → 3175 个 blob
对快照内每个对应文件计算 sha1("blob <size>\0" + bytes)
结果：missing = 0，differs = 0
web/ 范围（排除 node_modules、dist）额外文件：1 个 → web/tsconfig.tsbuildinfo（tsc 运行产物，非源码）
```

即**快照内容与被测提交逐字节一致**，不存在“带脏改动跑闸”。

## 2. 原始输出（全文见 `evidence/`）

| 证据文件 | 字节 | 关键行 |
|---|---|---|
| `evidence/typecheck-output.txt` | 69 | `$ tsc --noEmit` / `EXIT=0` / `DURATION=3s`，无其它输出 |
| `evidence/test-output.txt` | 161398 | `1470 pass` / `0 fail` / `8298 expect() calls` / `Ran 1470 tests across 83 files. [2.56s]` / `EXIT=0` |
| `evidence/build-output.txt` | 37048 | `vite v7.3.6 building client environment for production...` / `✓ 8827 modules transformed.` / `✓ built in 19.30s` / `EXIT=0` |
| `evidence/scoped-test-output.txt` | — | 定向 `bun test src/features/tools src/services/api/tools src/components/tools`：`1376 pass / 0 fail`，70 文件，`EXIT=0` |

构建产物（可复现锚点）：`dist/assets/index-DN5OrFc0.js` 5,603,852 B，sha256 `38a081674f54c5769067838faddd5a188002accd2189c65ee69e22da76447344`；`dist/assets/index-MCAOPxSD.css` 159,737 B。

构建器 warning 均为既有项、非本次回归：chunk > 500 kB（`index-DN5OrFc0.js` 5.6 MB）、`use-canvas-store.ts` / `file-saver` / `zip.ts` 动态+静态重复导入导致 dynamic import 不拆 chunk。

## 3. 该提交（e78f634）改动面与回归判定

```
git show --stat e78f634
 web/src/components/tools/workspaces/suite.tsx              | 82 ++++++++++++++++++----
 .../2026-10-29-r13-save-to-assets.md                       | 56 +++++++++++++++
 2 files changed, 124 insertions(+), 14 deletions(-)
```

改动内容：`saveSuiteResultItem` → `saveResultItemToAssets(asset_store)`，保留真实 `assetId` 回执；新增 `canvasKeys` 状态与 `onSendToCanvas`。

回归判定依据（不是读码，是跑出来的）：
1. `tsc --noEmit` 零输出（该文件类型干净，含新增 `index` 形参与 `toolId` 依赖数组）；
2. 全量 1470 用例 0 fail，其中 `src/features/tools/adapters/product-image-suite.test.ts` 及 suite runner / 一致性报告相关用例全 pass；
3. `suite` 保存链路所依赖的 `src/services/api/tools/assets.test.ts`（`uploadToolAsset` / `adoptLibraryAsset` / 回滚 / 取消 / 字节嗅探等）全 pass；
4. 构建成功，8827 modules，无 error。
→ **未发现需修复项，本轮 0 行源码改动。**

## 4. HEAD 位移（如实记录，不追）

| 时间（CST） | 事件 |
|---|---|
| 21:37:02 | 被检提交 `e78f634`（本轮固定样本） |
| 21:38:46 | 并发提交 `6ca29da`（evidence r14 矩阵重算）—— **不在本轮范围** |
| 21:39 – 21:43 | 在 `gate-e78f634` 存档目录执行三闸（目录只读样本，不受 HEAD 位移影响） |

报告落盘时 live HEAD = `6ca29dab82f7b358b1df7b1efbcfc3291153091f`。**本报告不覆盖它。**
（本任务开始时 live HEAD 恰为 `e78f634`，归档取 `git rev-parse e78f634` 的 commit，二者一致。）

## 5. 工作区状态（未纳入本轮，也未提交）

仓库工作区存在他人/并发未提交改动（`docs/.../independent-audit-20261029-r9/matrix.json|md`、`project_memory.md`、以及若干 `.tmp_*`/`.worker-*` 未跟踪目录）。与本轮 gate 无关，**未触碰、未提交**；本轮 `git add` 只包含本报告目录。

## 6. 与 r18 的对照

| 项 | r18（`1ba727c`） | r19（`e78f634`） |
|---|---|---|
| typecheck | PASS / EXIT=0 | PASS / EXIT=0（输出仍为 0 行） |
| test | 1470 pass / 0 fail，**退出码未捕获** | 1470 pass / 0 fail，**EXIT=0 已捕获** |
| build | PASS / EXIT=0，40.16s | PASS / EXIT=0，19.30s |
| 用例总数变化 | — | 1470 → 1470（该提交未新增用例） |

## 7. 结论与遗留

- `e78f634` 固定快照：typecheck PASS(0) / test PASS(0, 1470 pass) / build PASS(0)。**无回归、无修复。**
- 唯一残留：`web/tsconfig.tsbuildinfo` 由 `tsc --noEmit` 生成（未提交，属构建缓存）。
- 覆盖缺口：`6ca29da` 及其后的并发提交未被任何 gate 覆盖（不在本轮范围）。
