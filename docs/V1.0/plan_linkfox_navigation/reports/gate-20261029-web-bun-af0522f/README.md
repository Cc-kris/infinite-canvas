# Web 三闸 Gate 报告 — 固定快照 af0522f（独立导出跑）

- 时间：2026-10-29（UTC 13:37–13:41；本地 21:37–21:41）
- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`（分支 `feat/linkfox-v1-real`）
- 结论：**typecheck / bun test / bun run build 三闸全绿（exit 0），无回归需修**
- 源码改动：**0 处**（本报告只新增 docs 目录，未改 `web/src/**` 及任何他人文件）

## 1. 快照与真实 HEAD

| 项 | 值 |
|---|---|
| commit | `af0522fcf4ddebaf7a0df2ad5511fa5b051f04f0` |
| tree | `640582300afc24a109a9abcd0dbb4b457bac60c4` |
| subject | `fix(tool-result): 视频结果刷新后按 storageKey 还原字节再存资产/发画布；补 R13 VIDEO_CONCAT 真实字段与三动作回执` |
| commit 触及文件数 | 3（`web/src/components/tools/tool-result-actions.ts` +13 行、2 个 docs 证据文件） |

说明：跑闸期间仓库 HEAD 已被其他 worker 推进（探测到 `6ca29da` → 后续 `74aba4b`），**未追 HEAD**；本次所有数字均来自 af0522f 的独立导出树。

## 2. 方法（git archive 独立导出，不共享工作区）

```
mkdir -p /Users/mac/Documents/Dev/ga-gate-af0522f
git archive --format=tar af0522f | tar -x -C /Users/mac/Documents/Dev/ga-gate-af0522f   # 无 .git，与源工作区完全隔离
cd /Users/mac/Documents/Dev/ga-gate-af0522f/web
bun install --frozen-lockfile     # 931 packages，bun 1.4.2，锁文件锁定版本
bun run typecheck                 # tsc --noEmit
bun test                          # bunfig 已 pathIgnorePatterns 排除 **/*.spec.ts
bun run build                     # vite build
```

- 运行时：`bun 1.4.2 (744846f84)`（路径 `/Users/mac/.bun/bin/bun`，非登录 shell 默认 PATH 无 bun）、`node v24.14.0`、`vite v7.3.6`
- 执行方式：后台脚本顺序执行三闸并逐步落盘（单次工具调用上限 600s），`summary.txt` 记录每闸退出码+耗时
- git status 说明：af0522f 的 `web/bun.lock`、`web/package.json` 在工作区无改动，故 frozen 安装与快照一致

## 3. 结果（真实退出码 + 日志）

| 闸 | 命令 | 退出码 | 耗时 | 关键输出 |
|---|---|---|---|---|
| typecheck | `bun run typecheck` (`tsc --noEmit`) | **0** | 48s | 无诊断输出（`evidence/typecheck-output.txt` 仅 15 字节：`$ tsc --noEmit`）；并生成 `tsconfig.tsbuildinfo` 720,529 B 佐证 tsc 实跑 |
| test | `bun test` | **0** | 4s | `1470 pass / 0 fail / 8298 expect() calls / Ran 1470 tests across 83 files`（3.72s） |
| build | `bun run build` (`vite build`) | **0** | 30s | `✓ built in 28.30s`；`index-B8U_zLm6.js` 5,603,305 B、`index-MCAOPxSD.css` 159,737 B、dist 合计 37M |

构建告警（与基线数量完全相同，属既有问题，非本提交引入）：
`dynamically imported by ...` 15 处、`chunkSizeWarningLimit`(>500kB) 1 处、zod `contains an annotation` 2 处。

## 4. 导出树完整性校验（证明跑的确实是 af0522f）

- 重新 `git archive af0522f` 解到独立临时目录，与已跑闸目录**逐文件 `cmp`**：3,169 个 tracked 文件，**mismatch = 0**（排除 node_modules/dist/.gate-logs 等非 tracked 产物）
- dist 产物 sha256：
  - `assets/index-B8U_zLm6.js` = `f22a105f920a7094586353a1e8c7eb1f1498bfaec25173e507640f77da70eda1`
  - `assets/index-MCAOPxSD.css` = `f2f3f9d64c1b898a683a9d279170c9d3be9e63d5db67b6e6b9bc57db6a667561`

## 5. 回归判定：与父提交基线对比

父提交 `094bad2e9e73c8637418c94d3f212ec4f68bfa41` 用同法独立导出（`/Users/mac/Documents/Dev/ga-gate-094bad2`）+ frozen install，三闸同跑：

| 闸 | af0522f | 基线 094bad2 | 差异 |
|---|---|---|---|
| typecheck | exit 0 / 48s | exit 0 / 48s | 无 |
| test | exit 0 / 1470 pass / 0 fail | exit 0 / 1470 pass / 0 fail | 无（用例数与文件数相同：83 files） |
| build | exit 0 / 28.30s | exit 0 / 32s | 仅 bundle 体积 +218 B（`index-CGOK_h7R.js` 5,603,087 → `index-B8U_zLm6.js` 5,603,305），同数量告警 |

结论：af0522f 相对父提交**未引入 typecheck 错误、测试失败或构建失败**，因此**未修改任何源码**（符合“只修本提交明确引入回归”的约束）。

## 6. 证据文件

`evidence/` 内为原始落盘文件（未改写）：

| 文件 | 说明 | sha256 |
|---|---|---|
| `summary.txt` | 三闸退出码+耗时总表 | `d0efcfbe84dbeeaaf1c4e572498c4a77640660806048a0ac7a5f5105b2db3044` |
| `typecheck-output.txt` | tsc 原始输出 | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| `test-output.txt` | bun test 全量输出 | `7b7358b9e34f49a35fb61258ab21ddfb3b6a8bc751e3c5659e625bf840410cc5` |
| `build-output.txt` | vite build 全量输出（含 ANSI 色码） | `6211b4f0efdac9094cd09f132e89ae62d3ba10608e751fe38a31fd0bc3bc3712` |
| `baseline-094bad2-summary.txt` | 父提交基线三闸总表 | `d2741009e3e679d62e9d1c08a45ce3ca82acb4fc48e44aa6bcb6f5cdab34eb1f` |
| `run_gates.sh` | 实际执行的跑闸脚本 | — |

复现路径（保留现场，不在仓库内）：`/Users/mac/Documents/Dev/ga-gate-af0522f`、`/Users/mac/Documents/Dev/ga-gate-094bad2`。

## 7. 风险与边界

- 本次只验证 af0522f 单提交的 web 三闸；**未**覆盖 Playwright E2E（`*.spec.ts` 被 bunfig 排除）、后端 `canvas-agent`/`canvas-proxy`。
- 跑闸不接触源仓库工作区：其他 worker 的未提交改动（如 `web/src/components/tools/workspaces/suite.tsx`、`project_memory.md`）未被读取修改或提交。
- `bun build` 会写入 `dist/` 与 `tsconfig.tsbuildinfo`，均落在独立导出目录内，不回写源仓库。
