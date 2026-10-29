# Web 三闸 Gate 报告 — 固定快照 6ede584（git archive 独立导出跑）

- 时间：2026-10-29（UTC 13:59:53–14:01:04；本地 21:59–22:01）
- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`（分支 `feat/linkfox-v1-real`）
- 结论：**typecheck / bun test / bun run build 三闸全绿（exit 0），无回归需修**
- 源码改动：**0 处**（只新增本报告目录，未改 `web/src/**`，未触碰其他 worker 文件/未提交其改动）

## 1. 快照与真实 HEAD

| 项 | 值 |
|---|---|
| 目标 commit | `6ede58480422697718516fe1d3cf6bb69097278b` |
| tree | `fabffb7b1dba21e79b61fb545be9f3e5ae9e1915` |
| subject | `fix(tools): 结果字节持久化共同根因 —— mapper 保远程地址 + 入库留 provenance + 刷新按任务反查 + 防降级覆盖` |
| 作者时间 | Thu Oct 29 21:55:58 2026 +0800 |
| 父提交（基线） | `0005ef49a5cc84e21581456b92a1628776ab66ee`（tree `f1eb93db9f7c1521e4134fbe176976b2c3dfc960`） |
| 本提交改动 | 5 文件 / +206 −15，全部在 `web/`（`services/api/image.ts`、`services/api/tools/gateway.ts`、`services/file-storage.ts`、`stores/use-tool-task-store.ts`、新增 `stores/use-tool-task-store.provenance-heal.test.ts`） |

真实 HEAD 记录（重要）：

- 任务开始时仓库 HEAD = `c125c62e52565827b802213af01523ec64d33ad5`（6ede584 之后 2 个 docs 提交）
- 跑闸期间其他 worker 继续推进，跑完复查 HEAD = `8df2d8a86182331908dbc3c4911b136733e8dfac`
- **本次未追 HEAD**：所有数字均来自 `6ede584` 的独立导出树，与并发 HEAD 无关

## 2. 方法（git archive 独立导出，不共享工作区）

```
mkdir -p /Users/mac/Documents/Dev/ga-gate-6ede584
git archive --format=tar 6ede584 | tar -x -C /Users/mac/Documents/Dev/ga-gate-6ede584   # 无 .git
cd /Users/mac/Documents/Dev/ga-gate-6ede584/web
bun install --frozen-lockfile     # 931 packages，锁定 bun.lock
bun run typecheck                 # tsc --noEmit
bun test                          # bunfig 已 pathIgnorePatterns 排除 **/*.spec.ts
bun run build                     # vite build
```

- 运行时：`bun 1.4.2 (744846f84)`（`/Users/mac/.bun/bin/bun`，非登录 shell 的默认 PATH 无 bun，脚本内显式 export）、`vite 7.3.6 darwin-arm64`
- 闸前 `rm -f tsconfig*.tsbuildinfo`，产物只落在导出目录（`dist/`、`tsconfig.tsbuildinfo`），不回写源仓库
- 每闸命令、退出码、耗时逐条写入 `evidence/summary.txt`

## 3. 结果（真实退出码 + 日志）

| 闸 | 命令 | 退出码 | 耗时 | 关键输出 |
|---|---|---|---|---|
| typecheck | `bun run typecheck` (`tsc --noEmit`) | **0** | 42s | 无诊断（`evidence/typecheck-output.txt` 仅 15 字节：`$ tsc --noEmit`）；实际执行佐证：生成 `tsconfig.tsbuildinfo` 720,778 B |
| test | `bun test` | **0** | 2s | `1475 pass / 0 fail / 8308 expect() calls / Ran 1475 tests across 84 files`（2.75s） |
| build | `bun run build` (`vite build`) | **0** | 27s | `✓ built in 25.85s`；`index-aw6b5_1K.js` 5,605,532 B、`index-MCAOPxSD.css` 159,737 B、dist 合计 37M |

构建告警（与基线**数量完全相同**，属既有告警，非本提交引入）：`dynamically imported by ...` 15 处、`chunkSizeWarningLimit`(>500kB) 1 处。

## 4. 导出树完整性（证明跑的确实是 6ede584）

- 重新 `git archive 6ede584` 解到 `/tmp/ic-verify-6ede584`，与已跑闸目录 `diff -rq`（排除 `node_modules`、`dist`、`.gate-logs`、`tsconfig.tsbuildinfo`）：**输出 0 行，真实 diff 退出码 0**；tracked 文件 3,209 个（其中 `web/` 916 个）
- 产物 sha256：
  - `assets/index-aw6b5_1K.js` = `a58cbbd5cc35f63501225ef5778ab6b8054fecd5a38fc98c4daef230aad51c8a`
  - `assets/index-MCAOPxSD.css` = `f2f3f9d64c1b898a683a9d279170c9d3be9e63d5db67b6e6b9bc57db6a667561`（与上一 gate 快照 af0522f 的 CSS 完全一致，样式未变）

## 5. 回归判定：与父提交 0005ef4 同法对比

父提交用同法独立导出到 `ga-gate-0005ef4` + frozen install（931 packages）+ 三闸同跑：

| 闸 | 6ede584 | 基线 0005ef4 | 差异 |
|---|---|---|---|
| typecheck | exit 0 / 42s | exit 0 / 41s | 无 |
| test | exit 0 / **1475 pass** / 0 fail / **84 files** / 8308 expect | exit 0 / **1470 pass** / 0 fail / **83 files** / 8298 expect | **+5 pass、+1 file、+10 expect** |
| build | exit 0 / 25.85s / JS 5,605,532 B | exit 0 / 20.23s / JS 5,603,852 B | JS +1,680 B（+0.03%），CSS 同尺寸；告警 15+1 同数量 |

差异归因（逐项对上，非回归）：

- `+1 file / +5 pass` 正是本提交新增的 `web/src/stores/use-tool-task-store.provenance-heal.test.ts`（实测 `test(` 5 处），用例为：
  1. 上游同时给 b64 与 https 时两个来源都保留，快照剥离后仍有可再取的地址
  2. 快照被剥成 payloadDropped 后，按 taskId provenance 从 IndexedDB 找回真实字节
  3. IDB 里没有真实字节时不伪造，自愈保持空操作
  4. 同一结果里已有 storageKey 不会被无 storageKey 的副本降级覆盖
  5. 不同结果批次（receivedAt 不同）不做合并，保留新结果
- `+1,680 B` JS 增量与 4 个源码文件（**ins 113 / del 15**，不含测试文件）规模相符，且无新增构建告警

逐文件 numstat（`git show --numstat 6ede584`）：`image.ts` +15/−7、`tools/gateway.ts` +5/−1、`file-storage.ts` +22/−0、`use-tool-task-store.ts` +71/−7、新增测试 `provenance-heal.test.ts` +93/−0。

判定：**6ede584 未引入 typecheck 错误、测试失败或构建失败，无回归**，因此**未修改任何源码**（符合“只修本提交明确引入回归”的约束）。

## 6. 证据文件

`evidence/` 内为跑闸过程原始落盘（未改写，`build` 日志含 ANSI 色码故含二进制字节）：

| 文件 | 说明 | sha256 |
|---|---|---|
| `summary.txt` | 目标快照三闸退出码+耗时总表 | `fdfd609463f15278557fb94edda48036053ae3e31ddba8ed7a8ad1ed6e8d1ad1` |
| `typecheck-output.txt` | tsc 原始输出（15 B） | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| `test-output.txt` | bun test 全量输出（162,036 B） | `87370c8032e3caed4860a4f3ac8b01c85ac93f4d42ed666aaf23191102006061` |
| `build-output.txt` | vite build 全量输出（25,777 B） | `97265c55dbb911a181fbb2308f83e3933253cb34c88745e84e36d6b4f3206ceb` |
| `baseline-0005ef4-summary.txt` | 父提交基线三闸总表 | `47d9aaf2709e9ff4c96071fe25d0f285aae41c11e36191909bae7336ede456ea` |
| `baseline-0005ef4-test-output.txt` | 基线 bun test 输出 | `f627feb381c84bffb3752ac8a823edbbc32c05264e0f1bc4f8e35dd5039c5dc4` |
| `baseline-0005ef4-build-output.txt` | 基线 vite build 输出 | `6e49bfe4d512c1f52a650ea86b39cc09e37eac9bd63ecfcca6aeff5221f806ef` |
| `run_gates.sh` | 本次实际执行的三闸脚本（复现用，参数化 BASE/COMMIT） | — |

现场（保留，不在仓库内）：`/Users/mac/Documents/Dev/ga-gate-6ede584`、`/Users/mac/Documents/Dev/ga-gate-0005ef4`。

## 7. 风险与边界

- 只验证 6ede584 单提交的 web 三闸；**未**覆盖 Playwright E2E（`*.spec.ts` 被 bunfig 排除）、`canvas-agent`/`canvas-proxy` 后端、桌面端。
- 未追并发 HEAD（`c125c62` → `8df2d8a`）：这些后续提交不在本报告结论范围内。
- 跑闸全程不读写源仓库工作区其他文件；工作区原有的他人改动（`docs/.../independent-audit-20261029-r9/*`、`project_memory.md`、各 `.worker-*` 目录等）未被修改、未被加入提交。
- 三闸为静态/单测/打包层面证据，不代表真实上游字节持久化链路（IDB/远程地址/刷新反查）的端到端行为已验收。
