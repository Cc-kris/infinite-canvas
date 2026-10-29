# Web 三闸 Gate 报告（typecheck / test / build）— 2026-10-29 r13

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- 分支：`feat/linkfox-v1-real`
- **被测快照 HEAD：`097f097e2e525a08924f9eb66f57341b52fad044`**（2026-10-29T20:19:04+08:00，`test(market-material): R11 真实UI最小生成尝试…`）
- 收尾时仓库 HEAD：`550b6c7eac8db3a58b577d4f399940e6dd654806`（见 §1，源码已位移，结果不覆盖它）
- 执行方式：`git archive HEAD | tar -x -C /tmp/ic-head-gate` 取出**只读快照**，`web/node_modules` 软链到真实依赖目录；**不在他人正在编辑的工作区里跑闸**，避免污染/误读
- 工具链：bun `1.4.2 (744846f84)`；vite `7.3.7`
- 样本时间：2026-10-29 20:32–20:44 CST

## 0. 结论

| 闸 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 类型检查 | `bun run typecheck`（`tsc --noEmit`） | **PASS**（无输出） | 0 | 198.9s（3m18.9s） |
| 单测 | `bun test` | **PASS**：1460 pass / 0 fail / 8277 expect()，82 个文件 | 0 | 33.5s |
| 构建 | `bun run build`（`vite build`） | **PASS**：✓ 11085 modules transformed，✓ built in 8m 34s，dist 37 MB | 0 | 517.9s |

**本轮未修改任何源码**：工作区里 `web/src` 的改动（`dressing.tsx`、`ai-dressing-v2.ts`、`ai-dressing-v2.test.ts`）均属其他 worker 的在途编辑，未被本报告触碰。

## 1. HEAD 位移说明（如实记录）

跑闸期间其他 worker 持续提交，HEAD 演变：

```
7ff08bf  (20:17 时) → 097f097  (20:19:04，被测快照) → 550b6c7 (evidence 提交)
```

`097f097 → 550b6c7` 之间 **`web/src` 有实质变更**：

```
$ git diff --stat 097f097..550b6c7 -- web/src web/package.json
 web/src/components/tools/workspaces/suite.tsx      | 52 +++++++++++++----
 web/src/services/api/tools/task-machine.ts         | 37 +++++++++++++--
 web/src/stores/use-tool-task-store.ts              | 42 ++++++++-------
 3 files changed, 109 insertions(+), 22 deletions(-)
```

因此：**上述三闸结论只对 `097f097` 成立，不能外推到 `550b6c7`。** 按本轮指令（当前 build 结束即以固定快照出报告并退出），未对 `550b6c7` 重跑；最终源码提交后需再跑一轮。

### 1.1 过程中的一次真实失败（已由原作者修复，非本报告结论）

20:23 在**带未提交改动的工作区**里先跑过一次 typecheck，得到：

```
src/stores/use-tool-task-store.ts(310,25): error TS18048: 'ingested.result' is possibly 'undefined'.
TC_EXIT=2
```

该文件当时正被其他 worker 编辑（mtime 20:18:01，随后 20:21–20:29 连续修改并提交）。该错误在他们提交前已被修掉，`097f097` 上 typecheck 为 PASS。我**没有**修改该文件。

## 2. 原始输出（摘录，全文见 `evidence/`）

### 2.1 typecheck

```
$ tsc --noEmit
real  3m18.898s
TYPECHECK_EXIT=0
```

### 2.2 test

```
 1460 pass
 0 fail
 8277 expect() calls
Ran 1460 tests across 82 files. [33.52s]
real 33.62
TEST_EXIT=0
```

### 2.3 build

```
$ vite build
vite v7.3.7 building client environment for production...
✓ 11085 modules transformed.
dist/index.html                            1.05 kB │ gzip:     0.57 kB
✓ built in 8m 34s
real 517.85
BUILD_EXIT=0
```

产物指纹（快照 `/tmp/ic-head-gate/web/dist`）：

```
92a57bcf283da4f068668676164f3dc9e2f83898cb5bd7e90ba911f3e8df9aa2  dist/index.html
5,943,259 B  dist/assets/index-BVP2Wb92.js
  159,737 B  dist/assets/index-MCAOPxSD.css
      439 B  dist/assets/highlighted-body-OFNGDK62-DF3KqUfI.js
```

> 构建耗时 8m34s 明显高于 r12（1m7s）：本次在 `/tmp` 快照内跑，`node_modules` 为跨卷软链、且同机有 3 个 agent 进程 + vite dev server 争抢 CPU。耗时差异是环境因素，退出码与产物完整性（11085 modules、37 MB dist）正常。

## 3. 非阻塞告警（历史既有，非本轮新增）

1. `node_modules/zod/v4/core/{regexes,util}.js` 的 `@__PURE__` 注释位置导致 Rollup 无法识别 → 注释被丢弃，功能无影响。
2. 主 chunk 偏大：`index-BVP2Wb92.js` 5.94 MB / gzip ≈ 1.85 MB（> 500 kB 告警），体积优化项，非正确性问题。
3. 多个模块被静态 + 动态同时 import（Vite 提示 dynamic import 不拆 chunk），同上为历史既有。

以上均不影响三闸通过；为避免触碰其他 worker 文件，本轮不修。

## 4. 复现命令

```bash
export PATH="$HOME/.bun/bin:$PATH"          # 本机非交互 shell 默认 PATH 无 bun
cd /Users/mac/Documents/Dev/infinite-canvas
rm -rf /tmp/ic-head-gate && mkdir -p /tmp/ic-head-gate
git archive 097f097e2e525a08924f9eb66f57341b52fad044 | tar -x -C /tmp/ic-head-gate
ln -s /Users/mac/Documents/Dev/infinite-canvas/web/node_modules /tmp/ic-head-gate/web/node_modules
cd /tmp/ic-head-gate/web
bun run typecheck; echo "EXIT=$?"
bun test;          echo "EXIT=$?"
bun run build;     echo "EXIT=$?"
```

## 5. 证据文件

| 文件 | 说明 | sha256 |
|---|---|---|
| `evidence/typecheck-output.txt` | `tsc --noEmit`（静默成功 + 计时 + EXIT=0） | `ead43af1d3d452d594a8743b2f00c670f7f8224ebf2bb71f6fe84d552e379ece` |
| `evidence/test-output.txt` | `bun test` 完整输出（1551 行） | `02f044d68836aa540b93234ccc0d3832c4ac2228f0929aa5e38e411c1b329fe8` |
| `evidence/build-output.txt` | `vite build` 完整输出（去 ANSI / 去控制字符） | `c61a8d4314fa2749fe246d2527f3e0546537b0c5a6c7a782643cdd0203373e62` |

> 仓库 `.gitignore` 含 `*.log`，故日志以 `.txt` 入库；内容为原始输出去掉 ANSI 颜色码，sha256 可校验。

## 6. 边界声明

- 未派发子 worker、未读调度 SOP。
- 未修改任何 `web/src`、`web/tests` 或其他 worker 的文档/证据；仅新增本报告目录。
- 结论严格限定在被测快照 `097f097`；`550b6c7` 及其后的 `web/src` 变更（`suite.tsx` / `task-machine.ts` / `use-tool-task-store.ts`）不在本轮覆盖范围内。
- 工作区里 `web/src` 的三处改动（`dressing.tsx`、`ai-dressing-v2.ts`、`ai-dressing-v2.test.ts`）属其他 worker 在途编辑，未纳入本次样本、也未修改。
- 本报告提交仅含 `reports/gate-20261029-web-bun-r13/` 下的 4 个文件。

## 7. 附录：执行时间线（供后续复跑参考）

| 时间（CST） | 事件 |
|---|---|
| 20:17 | 探明仓库根无 `package.json`，业务在 `web/`；工作区 `task-machine.ts`、`use-tool-task-store.ts` 有他人未提交改动，且 20:18 仍在写入 |
| 20:19:04 | 其他 worker 提交出 `097f097`，源码趋于可测 |
| 20:23 | 在**脏工作区**跑 typecheck → FAIL `use-tool-task-store.ts(310,25) TS18048`（他人 inflight 代码，非我可改） |
| 20:23–20:30 | 持续监控：该文件被原作者反复修改（20:21/20:24/20:28/20:29），报错被修掉；master 指示停止等待静默 |
| 20:32 | `git archive 097f097` → `/tmp/ic-head-gate`，软链 `node_modules`，开跑 typecheck → **PASS** |
| 20:34 | `bun test` → **PASS** 1460/0（33.5s） |
| 20:35–20:44 | `vite build` → **PASS** 11085 modules，built in 8m34s（`/tmp` 快照 + CPU 争抢导致慢于 r12 的 1m7s） |
| 20:44+ | 发现 HEAD 已到 `550b6c7` 且含 3 个 `web/src` 变更 → 在报告 §1 如实声明覆盖范围；按指示不再重跑，落报告并提交 |

**后续动作建议**：等 `suite.tsx` / `task-machine.ts` / `use-tool-task-store.ts` 再稳定并提交后，按 §4 复现命令对**新 HEAD** 重跑一轮，结果写入 r14 报告。

