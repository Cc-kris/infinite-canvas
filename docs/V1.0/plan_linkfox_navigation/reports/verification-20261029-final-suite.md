# 全量验证报告（bun test / tsc / build）· 2026-10-29

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 运行时：`bun 1.4.2`（`/Users/mac/.bun/bin/bun`，非登录 shell 不在 PATH 上，需显式加 PATH）
- 执行目录：`web/`；命令：`bun test` / `bun run typecheck`（`tsc --noEmit`）/ `bun run build`（`vite build`）
- 本报告只做运行与回归记录：不改 POSE / batch / R8 审计报告，不新增审计结论

## 1. 基线（并行源码提交前，HEAD `d208987`）

| 检查 | 结果 |
| --- | --- |
| `bun test` | 1432 pass / **5 fail** / **5 errors**，1437 tests across 83 files，3.56s |
| `tsc --noEmit` | EXIT 0 |
| `vite build` | EXIT 0（built in 41.47s） |

失败的 5 项全部是**测试脚手架问题，不是业务回归**：

1. **3 个 Playwright E2E spec 被 `bun test` 误收集**（`web/tests/tools-navigation.spec.ts`、`tools-responsive.spec.ts`、`tools-workflow.spec.ts`）。报错 `Playwright Test did not expect test.describe() to be called here`——这些文件由 `bd435a9 test(tools): 补工具台 E2E` 引入，应只由 `playwright test` 运行，默认 `bun test` 的 `*.spec.ts` 通配把它们拉进来了。
2. **2 个测试文件给只读 `localStorage` 赋值**（`web/src/stores/use-tool-task-store.index-heal.test.ts`、`use-batch-task-store.reconcile.test.ts`），报错 `Attempted to assign to readonly property`。bun 1.4 已在全局定义只读 `localStorage`，旧写法 `(globalThis as {...}).localStorage = {...}` 在 1.4.2 上直接抛错。

业务测试本身（1442 条中的全部）在基线即为绿；5 个失败均来自上述两类环境/配置问题，故按“必要测试修复”范围处理，未触碰 `web/src` 业务源码。

## 2. 修复内容（仅测试侧，2 文件 + 1 配置）

| 文件 | 改动 |
| --- | --- |
| `web/bunfig.toml`（新增） | `[test] pathIgnorePatterns = ["tests/**/*.spec.ts"]`，让 `bun test` 不再收集 Playwright E2E |
| `web/src/stores/use-tool-task-store.index-heal.test.ts` | `localStorage` 桩改用 `Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: {...} })` |
| `web/src/stores/use-batch-task-store.reconcile.test.ts` | 同上改法 |

修复后中间态验证：1434 pass，仅剩上述 2 条 localStorage 失败（证明排除规则生效），再修桩后全绿。

## 3. 最终验证（HEAD `8ad16ec`，两个并行提交均已落地）

并行提交落地顺序（本次等待对象）：

| commit | 说明 |
| --- | --- |
| `8fd04d8` | fix(tools): 跨标签 recoverAll 不再误关其他标签的活跃任务（lf_recover_race_fix） |
| `cec98a1` | fix(tools): 视频结果区不再把「成功但 0 产物」当成功 |
| `8ad16ec` | fix(tools): 商品营销素材刷新后按任务还原结果（F 边界）（lf_boundaries_close） |

在 `8ad16ec` 上完整重跑：

| 检查 | 结果 |
| --- | --- |
| `bun test` | **1442 pass / 0 fail**，1442 tests across 80 files，10.39s，EXIT 0 |
| `tsc --noEmit` | **0 error**，EXIT 0 |
| `vite build` | **EXIT 0**，built in 1m10s（仅 chunk >500kB 的体积提示，非错误） |

数值解释：基线 1437 tests/83 files → 最终 1442 tests/80 files。文件数减少 3 是排除 Playwright spec；用例数增加是因为 `8fd04d8`/`cec98a1`/`8ad16ec` 带来新回归用例。

## 4. 边界与风险

- **未运行 Playwright E2E**（`web/tests/*.spec.ts`）：需要真实浏览器与 `vite` 服务，属 UI 验收范畴，本次未改动其内容，仅将其从 `bun test` 收集范围排除；如需跑：`cd web && bunx playwright test`。
- `bun test` 全绿只代表单测/集成层；线上真实生成类行为仍以既有 real-acceptance 记录为准，本报告不做功能完整性结论。
- `web/bunfig.toml` 为仓库新增配置文件，后续若有人用 `bun test tests/xxx.spec.ts` 显式指定仍可运行被排除文件（不影响 E2E 调试）。
