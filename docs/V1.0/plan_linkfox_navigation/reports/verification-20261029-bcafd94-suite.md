# 最终验证报告（typecheck / bun test / build）· HEAD `bcafd94`

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 验证 HEAD：`bcafd940926d3aa72a070b92ee715d41b9a69cce`
- 运行时：`bun 1.4.2`（`/Users/mac/.bun/bin/bun`，**非登录 shell 的 PATH 上没有 bun**，需 `export PATH="$HOME/.bun/bin:$PATH"`）；`node v24.14.0`
- 执行目录：`web/`（仓库根目录**没有** package.json，脚本都在 `web/package.json`）
- 命令：`bun run typecheck`（= `tsc --noEmit`）、`bun test`、`bun run build`（= `vite build`）
- 本报告只做「跑 + 记录」：未修改 R10 审计器（matrix / auditor / 报告），未生成任何任务，未派子 worker

## 0. 结论

| 检查 | 结果 | 真实输出 |
| --- | --- | --- |
| `bun run typecheck` | **PASS** | EXIT 0，`tsc --noEmit` 无诊断输出（首次 13.8s） |
| `bun test` | **PASS** | **1457 pass / 0 fail / 0 error**，8268 expect() calls，82 files，3.84s |
| `bun run build` | **PASS** | EXIT 0，`✓ built in 59.77s`（首次同 HEAD 为 1m 9s） |

**无回归需要修**：三项全绿，本轮新增提交（`3f772a9..bcafd94`）未引入 typecheck / 测试 / 构建回归，因此**没有改动任何业务源码**。

## 1. 稳定门（为什么在这个 HEAD 上出结论）

开始验证时工作树业务源码仍在被并行写入（`web/src/components/tools/workspaces/image-text-edit.tsx` 的 mtime 距采样仅 6 秒）。

- 采样方式：`git status --porcelain -- web server canvas-agent` + `find web/src -newermt '-3 minutes'`，间隔 45s 连续 3 次取样，要求 A==B==C。
- 结果：90 秒窗口内三次快照完全一致 → 判定业务源码停笔。
- 随后在 `e8da2c7` 上先跑过一轮 typecheck(13.8s, EXIT 0) / test(1457 pass) / build(1m 9s, EXIT 0)；
- 期间并行提交把 HEAD 推进到 `bcafd94`（把 `scene.tsx` 的持久化网关改动提交），此时 `git status --porcelain -- web/src` **为空**（业务源码全 clean），随后**在同一 HEAD `bcafd94` 上完整重跑三项**，本报告数据均取自这一轮，保证「三条结论同源于一个 commit」。

## 2. 本轮提交范围（`3f772a9..bcafd94`）

| commit | 内容 |
| --- | --- |
| `e8da2c7` | fix(image-text-edit)：刷新后由落盘任务自然回填快照 |
| `c4af102` | test(designer)：NEW_DESIGNER 刷新后三腿真机取证 + IMAGE_TEXT_EDIT 自然恢复取证 |
| `e0608bd` | audit(r10)：strict 39-tool matrix on `d596c25`+`434bc44`，吸收已提交证据，H 19→22 |
| `bcafd94` | evidence(h4)：REPLACE_GOODS 真实生成 PASS + NEW_REPLACE_BG_V2 上游 502 真实失败；修 scene 持久化网关 |

业务源码改动仅 2 文件：

```
web/src/components/tools/workspaces/image-text-edit.tsx | 29 +++++++++++++++----
web/src/components/tools/workspaces/scene.tsx           |  7 +++---
```

- `image-text-edit.tsx`：草稿恢复完成后再按落盘任务回填 snapshot（`draftRestored` 门 + `snapshotRestoredRef` 去重），避免用默认值算出与任务不一致的指纹。
- `scene.tsx`：`getToolGateway()` → `getPersistedToolGateway()`（3 处调用），并把 import 改为 `@/stores/use-tool-task-store` 的 `getPersistedToolGateway`（第 14 行），本地已核对无悬空符号。

上述两文件均被本轮 typecheck 覆盖：`tsc --noEmit` EXIT 0 说明其类型契约自洽。

## 3. 复现命令

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
export PATH="$HOME/.bun/bin:$PATH"
bun run typecheck   # tsc --noEmit
bun test            # 1457 pass / 0 fail / 82 files
bun run build       # vite build
```

## 4. 观察到的非阻断项（如实记录，未处理）

1. **bun 不在默认 PATH**：任何脚本/子进程里裸调 `bun` 都会 `command not found`，必须先加 PATH。
2. **build 体积告警**（非错误）：`dist/assets/index-Dg32-PYU.js` 5,942.77 kB（gzip 1,846.85 kB），Vite 提示 chunk >500 kB；另有一条 `src/lib/zip.ts` 同时被静态与动态 import 的提示。两者在上一版验证报告中同样存在，属既存状态，不是本轮引入。
3. **工作树仍有大量并行产物**（未跟踪的 `.worker-*/`、`web/scripts/real-acceptance/*.mjs` 探针、`docs/**/evidence` 截图等）。本次验证**未清理、未提交**这些文件，避免影响其他在跑的工作。
4. **R10 审计器相关文件保持原样**：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r9/matrix.{json,md}` 的工作树改动非本次产生，本报告未触碰、未引用为结论依据。

## 5. 风险与后续

- 结论只对 `bcafd94` 成立。若后续有新的业务源码提交，需重跑三项（尤其 `tsc --noEmit`，本轮 typecheck 修复正是靠它暴露 fixture 契约不符）。
- `bun test` 全绿不代表真机验收：AI 类工具的真实链路（上游 200/字节/sha256）由各自的 real-acceptance 证据负责，本报告不替代。
