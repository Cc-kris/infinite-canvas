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
| `web/bunfig.toml`（新增） | `[test] pathIgnorePatterns = ["**/*.spec.ts"]`，让 `bun test` 不再收集 Playwright E2E（初版只排除 `tests/`，后因 `web/temp/regression/probe/zz-probe.spec.ts` 这类临时探针也被收集，收紧为全局；`507729e` 落库内容一致） |
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

## 5. 并发收敛后的最终复跑（HEAD `fd1cb20`，含 `507729e` 的 bunfig 收紧）

并行会话在此期间持续提交，工作区同时存在**他人未提交的 batch 相关 WIP**（`web/src/features/tools/batch-page.tsx`、`web/src/services/api/tools/batch-runner.ts`、`web/src/stores/use-batch-task-store.ts` + 未跟踪的 `use-batch-task-store.restore.test.ts`）。因此分两次取证：

### 5.1 工作区（含他人 WIP）实跑：发现真实失败，非本报告修复范围

在 `fd1cb20` 的工作区直接跑（18:32 前后）：

| 检查 | 结果 |
| --- | --- |
| `bun test` | 1449 pass / **2 fail**，1451 tests across 81 files，EXIT 1 |
| `tsc --noEmit` | **EXIT 2**，1 条错误 |
| `vite build` | EXIT 0 |

失败明细（均指向同一处未提交改动）：

1. `src/stores/use-batch-task-store.ts(318,27): error TS2339: Property 'startsWith' does not exist on type 'never'`
   - 根因：`isDurableResultUrl(url): url is string` 作为类型守卫，入参已是 `string` 时，false 分支被收窄成 `never`，随后 `item.url?.startsWith("blob:")` 报错。
   - 建议改法（未实施，避免与并行会话冲突）：把守卫降级为普通布尔函数 `function isDurableResultUrl(url: string | null | undefined): boolean`，该文件仅 306 行一处调用。
2. `(fail) DESIGN_BATCH 刷新后行结果恢复 > 任务有结果项但字节取不回来：不伪造地址、不退回死 blob，原样返回`
3. `(fail) DESIGN_BATCH 刷新后行结果恢复 > fresh reload：hydrate 按任务快照回填并写回本地，索引有历史列表消费`
   - 这两条属于同一批未提交 WIP 新增的 `use-batch-task-store.restore.test.ts` 与 store 改动，随该 WIP 一起演化，不作跨会话修复。

判断依据（非猜测）：该工作区文件连续 8 分钟未变化、未提交，且 `fd1cb20` **已提交树**上同样三项全绿（见 5.2）；因此上述失败是「未提交 WIP 的中间态」，不是已落库代码的回归。

### 5.2 已提交树（`git archive fd1cb20` 纯净快照）：全绿

为避免工作区 WIP 污染，用 `git archive fd1cb20 | tar -x` 导出只含已提交文件的快照（2815 文件），软链 `web/node_modules` 后运行：

| 检查 | 结果 |
| --- | --- |
| `bun test` | **1446 pass / 0 fail**，1446 tests across 80 files，EXIT 0 |
| `tsc --noEmit` | **0 error**，EXIT 0 |
| `vite build` | **EXIT 0**，built in 2m47s |

`fd1cb20 → 507729e` 的差异只有 `web/bunfig.toml`（排除规则收紧为 `**/*.spec.ts`）与一份入口复核文档，无 `web/src` 变化，故测试结论对 `507729e` 同样成立。

### 5.3 结论

- 已提交状态（`507729e` / `fd1cb20` 树）：`bun test` 0 fail、`tsc` 0 error、`vite build` 成功。
- 唯一未收口项是并行会话尚未提交的 batch WIP（1 条 tsc 错误 + 2 条新增用例失败），本报告只记录、不代改，待其自行提交后应重跑一次确认。
