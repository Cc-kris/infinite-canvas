# Web 三闸 Gate 报告（typecheck / test / build）— 2026-10-29 r18

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- **被测固定快照 HEAD：`1ba727c11e2735ea90381951d4c1b2b153cce5bb`**（2026-10-29T21:25:11+08:00，`evidence(r17): lf_vr_ave_last 组真实回执入库 — VR running(task-mvtk9pu3-sfifnh)/AVE failed(task-mvtkgo4b-gaomk5)，未重生成未注入`）
- 快照目录：`/tmp/ic-gate-r18`（`web/node_modules` 软链到真实依赖目录 `/Users/mac/Documents/Dev/infinite-canvas/web/node_modules`，21:27 建立）
- 工具链（取自日志）：bun `1.4.2 (744846f84)`；vite `7.3.7`；typescript `^5`（`tsc --noEmit`）
- 样本时间：2026-10-29 21:27:0x – 21:30:47 CST（见 §4 日志时间戳）

## 0. 结论

| 闸 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 类型检查 | `bun run typecheck`（`tsc --noEmit`） | **PASS**（无任何输出） | **0**（日志 `EXIT=0`） | 49s |
| 单测 | `bun test` | **PASS**：1470 pass / 0 fail / 8298 expect()，83 个文件 | **未记录**（见 §2.2 缺口说明） | 3.06s（`real 0m3.074s`） |
| 构建 | `bun run build`（`vite build`） | **PASS**：✓ 11086 modules transformed，✓ built in 40.16s，dist 37 MB | **0**（日志 `EXIT=0`） | 41s |

**本轮无源码改动、无必要修复**：三闸在 `1ba727c` 干净快照上全绿（`test-output.txt` 中 `(fail)` 行数为 0，`build-output.txt` 中构建错误行数为 0，仅有 chunk 体积与动态/静态重复导入的既有 warning）。
因此本提交只包含**本报告 + 原始日志证据**，不含任何 `web/` 代码变更。

## 1. 固定 HEAD 与「快照身份」核对

`/tmp/ic-gate-r18` 不是 git 仓库（无 `.git`），故不能用 `git rev-parse` 自证。本次改用**逐 blob 哈希全量比对**确认快照内容 == `1ba727c` 的树：

```
git ls-tree -r 1ba727c          → 3158 个 blob（含全部子目录）
对快照内每个对应文件计算 git blob sha1（sha1("blob <size>\0" + bytes)）
结果：missing = 0，differs = 0
web/src 范围：tracked 402 个文件，快照内额外（untracked）文件 = 0
```

即：**快照内容与被测提交逐字节一致**，不存在「带脏改动跑闸」的情况（当时工作区里 `web/src` 的后续改动没有进入快照 —— 快照生成于 21:25 之后、他人改动落地之前，且比对结果为 0 差异可反证）。

### 1.1 HEAD 位移（如实记录，不追）

| 时间（CST） | 事件 |
|---|---|
| 21:25:11 | 被检提交 `1ba727c`（本轮固定样本） |
| 21:25–21:27 | 快照就位、`node_modules` 软链 |
| 21:27–21:30:47 | 三闸执行（样本只读，不受 HEAD 位移影响） |
| 21:31:37 | 他人提交 `094bad2`（r18 VR 证据） |
| 21:33:30 | 他人提交 `af0522f`（`fix(tool-result): 视频结果刷新后按 storageKey 还原字节…`） |

报告落盘时 live HEAD = `af0522fcf4ddebaf7a0df2ad5511fa5b051f04f0`，**本报告不覆盖它**（见 §3.2 覆盖缺口）。

## 2. 原始输出（全文见 `evidence/`）

### 2.1 typecheck — PASS，退出码 0

`evidence/typecheck-output.txt` 全文（35 字节，无截断、无省略）：

```
$ tsc --noEmit
EXIT=0
DURATION=49s
```

无 error / 无 warning 输出。

### 2.2 test — PASS，但**退出码未被日志捕获**（如实标注）

`evidence/test-output.txt`（161601 字节，1646 行，全文完整：首行 `bun test v1.4.2 (744846f84)`，末行 `real 0m3.074s`）：

```
 1470 pass
 0 fail
 8298 expect() calls
Ran 1470 tests across 83 files. [3.06s]

real	0m3.074s
user	0m1.860s
sys	0m0.714s
```

- **缺口**：该日志没有 `EXIT=` 行，也没有独立 `.exit` 文件（`/tmp` 下只有 r18 的 typecheck/build 带 EXIT 行；`gate13_*` 那批是更早轮次）。因此 test 闸的**退出码 0 属推断**，依据是：bun test 的汇总已跑到结束（`Ran 1470 tests across 83 files` + shell `time` 的 `real/user/sys` 三行都在，说明进程正常退出且外壳拿到了结束状态）、且 `(fail)` 行数为 0（`grep -c '^(fail)'` = 0）。
- 不影响结论：0 fail + 完整收尾行 ≡ PASS；但「退出码」这一项按实情标注为未捕获，不写成 `EXIT=0`。

### 2.3 build — PASS，退出码 0

`evidence/build-output.txt`（22048 字节，76 行）。关键行：

```
vite v7.3.7 building client environment for production...
✓ 11086 modules transformed.
dist/index.html                                        1.05 kB │ gzip:     0.57 kB
dist/assets/index-MCAOPxSD.css                       159.74 kB │ gzip:    26.20 kB
dist/assets/highlighted-body-OFNGDK62-B2pi9QgG.js      0.44 kB │ gzip:     0.31 kB
dist/assets/index-DqZZysSW.js                      5,949.65 kB │ gzip: 1,849.39 kB
✓ built in 40.16s
EXIT=0
DURATION=41s
```

- 产物：`/tmp/ic-gate-r18/web/dist` 共 37 MB。
- 仅有既有 warning：`Some chunks are larger than 500 kB`（`index-DqZZysSW.js` 5.95 MB）、以及若干 `dynamically imported … but also statically imported …`（`remove-pen.ts` / `canvas-node-factory.ts` / `use-canvas-store.ts` / `file-saver` / `localforage`）。**均非 error，构建退出码 0。**
- 备注：该日志内含 NUL 字节，`grep` 默认会判为二进制；用 `grep -a` 可正常匹配 `EXIT=0`（内容未被破坏）。

## 3. 与 r15 对比 & 覆盖缺口

### 3.1 与 r15（固定快照 `8761c4e`）对比

| 项 | r15 (`8761c4e`) | r18 (`1ba727c`) |
|---|---|---|
| typecheck | PASS，退出码 0，2m40.9s | PASS，退出码 0，49s |
| test | 1470 pass / 0 fail / 8298 expect / 83 文件 | 同：1470 / 0 / 8298 / 83 |
| build | 11086 modules，✓ 33.12s，dist 37 MB | 11086 modules，✓ 40.16s，dist 37 MB |

耗时差异属机器负载波动（r15 报告已记录同现象：1m8s↔33.1s）。

### 3.2 覆盖缺口（重要，如实说明）

- `git diff --stat 8761c4e..1ba727c -- web`：**4 个源文件变了**（`tool-result-actions.ts`、`workspaces/designer.tsx`、`workspaces/suite.tsx`、`features/tools/adapters/new-designer.ts`，合计 +91 / −39），但**用例总数与 expect 数完全没变**（仍 1470 / 8298）。→ 这段时间的行为改动**没有新增单测覆盖**，三闸绿灯只能证明「未破坏既有 1470 个用例 + 可编译可打包」。
- `1ba727c..af0522f` 又改了 `web/src/components/tools/tool-result-actions.ts`（+13 行）。**本报告不覆盖该提交**；按任务要求未追新 HEAD、未重跑。

## 4. 日志完整性与时间戳

| 文件 | 字节 | 行数 | mtime（CST） | EXIT 行 |
|---|---|---|---|---|
| `test-output.txt` | 161601 | 1646 | 21:27:18 | 无（见 §2.2） |
| `typecheck-output.txt` | 35 | 3 | 21:28:16 | `EXIT=0` |
| `build-output.txt` | 22048 | 76 | 21:30:47 | `EXIT=0` |

一致性旁证：三份日志的路径全部指向 `/private/tmp/ic-gate-r18/...`，与快照目录同名；`build-output.txt` 内 11086 modules 与 r15 的同提交代码规模一致。

## 5. 工作区状态（未纳入本轮，也未提交）

本轮**只提交本目录**。仓库工作区当时存在的未提交改动，均与本次 gate 无关、来源不是本轮 gate 执行，故未触碰：

| 路径 | 性质 |
|---|---|
| `web/src/components/tools/workspaces/suite.tsx`（mtime 21:33:16，`git diff --numstat` = **+68 / −14**） | 他人/并发在编辑的未验证 WIP（新增 `canvasKeys` 状态 + `onSendToCanvas` + 结果区「保存/发送画布/下载」三按钮，走 `saveResultItemToAssets`）。**未验证、未提交** |
| `docs/.../independent-audit-20261029-r9/matrix.json`（+72/−107）、`matrix.md`（+11/−13），均 mtime 19:24:59 | r9 独立审计矩阵改动，非本任务 |
| `project_memory.md`（mtime 21:26:46，+32/−0） | 他人文档改动 |

`web/src/components/tools/tool-result-actions.ts` 在工作区已无残留改动 —— 其 21:28 的编辑已随 `af0522f`（21:33:30）提交，与本次 gate 快照无关。

## 6. 结论

- `1ba727c` 干净快照上：typecheck PASS(0) / test PASS（0 fail，退出码未捕获）/ build PASS(0)。
- **无需修复项**：三闸全绿，本轮未修改任何源码。
- 遗留待办（交给后续轮次，不在本轮范围）：test 闸的退出码采集缺失（建议后续把 `echo EXIT=$?` 写进 test 包装脚本）；`8761c4e..1ba727c` 的 4 个 web 源文件改动无新增用例；`af0522f` 未纳入任何 gate。
