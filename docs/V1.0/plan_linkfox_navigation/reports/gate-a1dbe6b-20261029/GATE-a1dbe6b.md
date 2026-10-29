# Gate 报告 — 固定快照 `a1dbe6b`（web 三闸：typecheck / test / build）

执行时间：2026-10-29（当日）
执行者：独立 gate 执行器（不派子 worker、不读调度 SOP、不追并发 HEAD、未改动其他 worker 的文件）

## 1. 快照与真实 HEAD

| 项 | 值 |
| --- | --- |
| 目标快照 | `a1dbe6b15e43b50de49391f1f13cb23d0d98d395` |
| 被验证代码的判决依据 | `git archive a1dbe6b` 解出的独立目录（**唯一运行对象**） |
| 运行时仓库 HEAD | `a1dbe6b15e43b50de49391f1f13cb23d0d98d395`（与目标一致，验证开始时实测 `git rev-parse HEAD`） |
| 提交信息 | `fix(gateway): submit 定性区分 dispatched/未发出 + recover 尊重宽限期；历史坞用 storageKey 定位结果` |
| 提交时间 | 2026-10-29 22:18:10 +0800 |
| 分支 | `feat/linkfox-v1-real` |

工作区说明：仓库工作区当时存在其他 worker 未提交改动（`web/src/components/tools/workspaces/mask.tsx`、`web/src/features/tools/adapters/remove-pen.ts`、`project_memory.md`、`docs/.../matrix.*` 等）以及大量未跟踪目录。这些内容**未参与**本次验证，也**未进入**本次提交。验证对象完全来自 git 对象库中的 `a1dbe6b` 树。

## 2. 环境与隔离方式

| 项 | 值 |
| --- | --- |
| 隔离目录 | `/tmp/ic-gate-a1dbe6b`（`git archive a1dbe6b \| tar -x -C`，无 `.git`） |
| 依赖 | `web/node_modules` 由工作区 `rsync -a --link-dest` 硬链克隆（快照 `web/package.json`、`web/bun.lock` 与工作区逐字节一致，已 `diff` 核对，故依赖版本等价）；克隆后删除 `node_modules/.vite` 缓存以免污染 |
| 运行时 | bun `1.4.2`（`$HOME/.bun/bin/bun`）、node `v24.14.0`、TypeScript `5.9.3` |
| 平台 | macOS（Apple Silicon） |

隔离目的：并发 worker 随时会改工作区与 HEAD；本次三闸只在固定快照的独立目录内运行，结论不受并发提交影响。

## 3. 三闸结果（全部以真实退出码为准）

| 闸 | 命令（在 `/tmp/ic-gate-a1dbe6b/web`） | 退出码 | 关键数字 | 日志 |
| --- | --- | --- | --- | --- |
| Web typecheck | `bun run typecheck` → `tsc --noEmit` | **0** | 覆盖 408 个非 `node_modules` 源文件（`tsc --noEmit --listFiles` 实测），无任何诊断输出 | `logs/typecheck.log` / `logs/typecheck.exit` |
| 单测 | `bun test` | **0** | **1477 pass / 0 fail**，8316 次 `expect()`，84 个测试文件，4.42s | `logs/test.log` / `logs/test.exit` |
| 生产构建 | `bun run build` → `vite build` | **0** | `✓ built in 42.51s`，`dist` 42 MB；`index-*.js` 5,952.56 kB（gzip 1,838.74 kB）、`index-*.css` 159.74 kB | `logs/build.log` / `logs/build.exit` |

日志完整性（sha256 前 16 位，均为仓库内脱敏副本）：

- `typecheck.log` `8366207267355d3e`（原始与副本相同）
- `test.log` `17a3d920093eaaf6`（原始与副本相同）
- `build.log` `1a2d32e969afe803`（**副本**；原始日志 sha256 `2011b33d939402ae…`，仅做了 `\0` 与 ANSI 转义剥离：vite 输出里含 pnpm 真实路径 `\0/…/node_modules/.pnpm/…`，导致 grep 判定为二进制；内容语义未改动）

## 4. 本提交回归面审计（只查本提交引入的回归）

`a1dbe6b` 改动面（`git show --name-status`）：

```
A  docs/V1.0/plan_linkfox_navigation/evidence/ccv2-submit-confirm-20261029/RECEIPT.md
M  web/src/components/tools/tool-task-history.tsx
M  web/src/services/api/tools/gateway.cross-tab-recovery.test.ts
M  web/src/services/api/tools/gateway.recovery.test.ts
M  web/src/services/api/tools/gateway.ts
M  web/src/services/api/tools/task-machine.ts
```

对应断言在三闸中实测通过（`logs/test.log` 第 1544 行起）：

- `gateway.result-items.test.ts` 4 pass —— storageKey/url 双通道持久化不丢结果
- `gateway.recovery.test.ts` 7 pass —— 未发出 → `submit-not-dispatched`（`reconcileRequired=false`）；有 `dispatchedAt` → `submit-unconfirmed`（`reconcileRequired=true`）；宽限期内只等待不抢先结案；`recoverAll` 不留非终态
- `gateway.cross-tab-recovery.test.ts` 9 pass —— 租约/跨标签不误关、不重提交、落盘快照优先

结论：**本提交在其改动面上无回归，三闸全绿，未做任何源码修改**（无需修，也避免与并发 worker 的改动混写）。

## 5. 非阻塞告警（非本提交引入，未处理）

1. `vite:reporter` 多条「既被动态 `import()` 又被静态 import」告警（`use-asset-store.ts`、`canvas-node-factory.ts`、`use-canvas-store.ts`、`file-saver`、`zip.ts`，以及 `features/tools/adapters/remove-pen.ts` 被 `mask.tsx` 动态+静态导入）——只影响分包，不影响构建成功；其中 `remove-pen.ts`/`mask.tsx` 正是其他 worker 在工作区修改的文件，且 `a1dbe6b` 本身未触碰。
2. 单 chunk > 500 kB 的 `chunkSizeWarningLimit` 提示（`index-*.js` 5.95 MB）——历史遗留结构问题。
3. `typecheck` 日志只有一行 `$ tsc --noEmit`：tsc 无诊断即静默，已用 `--noEmit --listFiles` 实跑 408 个源文件反证其为**真检查**而非空跑。

## 6. 复现步骤

```bash
export PATH=$HOME/.bun/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
rm -rf /tmp/ic-gate-a1dbe6b && mkdir -p /tmp/ic-gate-a1dbe6b
git -C /Users/mac/Documents/Dev/infinite-canvas archive a1dbe6b | tar -x -C /tmp/ic-gate-a1dbe6b
cd /tmp/ic-gate-a1dbe6b/web
rsync -a --link-dest=/Users/mac/Documents/Dev/infinite-canvas/web/node_modules \
  /Users/mac/Documents/Dev/infinite-canvas/web/node_modules/ ./node_modules/
rm -rf node_modules/.vite
bun run typecheck ; echo "typecheck exit=$?"
bun test          ; echo "test exit=$?"
bun run build     ; echo "build exit=$?"
```

## 7. 未覆盖与风险

- 未跑 `playwright test`（e2e 需要浏览器与后端/上游凭据），未做真实上游提交与刷新恢复的端到端复演；本闸只覆盖 typecheck / 单测 / 生产构建三项，符合本次委托范围。
- 依赖来自工作区 `node_modules` 的硬链克隆（因快照 `package.json`/`bun.lock` 与工作区完全一致，等价性已核对）；若后续依赖树变化，需重新 `bun install --frozen-lockfile`。
- 结论仅对 `a1dbe6b` 有效；并发 HEAD 已前进时不得套用到新提交。
