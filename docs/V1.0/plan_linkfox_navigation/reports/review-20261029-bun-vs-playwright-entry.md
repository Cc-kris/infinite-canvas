# 测试入口独立复核：bun test 混入 Playwright E2E（2026-10-29）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，执行目录 `web/`
- 运行时：bun `1.4.2`（`/Users/mac/.bun/bin/bun`，非登录 shell 的 PATH 里没有，必须写绝对路径）；node `v24.14.0`（`/usr/local/bin/node`，Playwright CLI 依赖）
- 复核对象：`lf_full_regression` 报出的 `1432 pass / 5 fail / 5 error`
- 复核方式：干净 worktree（`git worktree add --detach /tmp/ic-head-<sha>`）+ `node_modules` 软链，排除他人未提交改动
- 结论一句话：**1432/5/5 里的 5 个 fail 全部来自测试入口混淆（3 个 Playwright spec 被 bun 收集）+ 2 个测试桩写法错误，没有一条是业务断言失败。修正入口后单测全绿，但 E2E 侧仍有 2 个真实失败，不能宣称全绿。**

## 1. 两条测试入口（必须分开跑）

| 入口 | 命令 | 收集范围 | 结果 |
| --- | --- | --- | --- |
| Bun 单测 | `cd web && /Users/mac/.bun/bin/bun test` | `*.test.ts(x)`（`bunfig.toml` 排除 `*.spec.ts`） | 干净 HEAD `2cd5393`：**1446 pass / 0 fail / 80 files / 6.09s** |
| Playwright E2E | `cd web && IC_E2E_PORT=4398 node ./node_modules/@playwright/test/cli.js test` | `tests/tools-*.spec.ts`（`playwright.config.ts`） | 干净 HEAD `2cd5393`：**14 passed / 2 failed** |

补充：`playwright test` 若直接调用会因 `#!/usr/bin/env node` 而报 `env: node: No such file or directory`（exit 127），需 `export PATH=/usr/local/bin:$PATH` 或显式用 `node .../cli.js`。已有 dev server 时用 `IC_E2E_NO_WEBSERVER=1 IC_E2E_BASE_URL=http://127.0.0.1:4317` 复用，避免重复起 vite。

## 2. 基线 1432 pass / 5 fail / 5 error 的构成（复现于 `/tmp/ictest/baseline_test.log`）

`Ran 1437 tests across 83 files` = 80 个单测文件 + 3 个 E2E spec。bun 对一个「加载期就崩掉」的文件同时记 1 fail + 1 error，所以 5 fail + 5 error 对应 **5 个文件**：

| # | 文件 | 原因 |
| --- | --- | --- |
| 1 | `tests/tools-navigation.spec.ts` | `error: Playwright Test did not expect test.describe() to be called here.` —— Playwright spec 被 bun 收集，`@playwright/test` 的全局钩子不在 |
| 2 | `tests/tools-responsive.spec.ts` | 同上 |
| 3 | `tests/tools-workflow.spec.ts` | 同上 |
| 4 | `src/stores/use-batch-task-store.reconcile.test.ts` | `TypeError: Attempted to assign to readonly property.` —— 测试里直接 `globalThis.localStorage = {...}`，而 bun 1.4 的 `globalThis.localStorage` 是只读 getter |
| 5 | `src/stores/use-tool-task-store.index-heal.test.ts` | 同上（两个文件后续已用 `Object.defineProperty` 改写，HEAD 上已通过） |

注意：**这 5 条里 0 条是业务断言失败**。原报告把 5 fail 当作「代码回归」是入口问题导致的误判。

## 3. 入口修复的必要性（反证）

同一干净 worktree `2cd5393`，把 `web/bunfig.toml` 临时改名后重跑 `bun test`：

```
1446 pass / 3 fail / 3 errors
Ran 1449 tests across 83 files
失败文件：tests/tools-navigation.spec.ts / tests/tools-responsive.spec.ts / tests/tools-workflow.spec.ts
```

即：`bunfig.toml` 的 `[test] pathIgnorePatterns` 是唯一阻止 E2E 被 bun 收集的开关，去掉它立刻复现原始症状。当前主分支 `bunfig.toml` 已入库（worktree 进一步收紧为 `**/*.spec.ts`，可覆盖 `temp/` 下的临时探针）。

## 4. Playwright E2E 真实失败清单（干净 HEAD `2cd5393`，14 passed / 2 failed）

### 4.1 `tests/tools-workflow.spec.ts:152` 「缺蒙版时禁止提交，并说明缺什么」— 稳定失败

```
Error: expect(locator).toContainText(expected) failed
Locator: locator('[data-testid=tool-workspace]')
Expected substring: "640×640"
```

- `uploadSource()` 上传 640×640 PNG 后断言工作区出现 `640×640`（素材卡上的尺寸 chip）。
- 实测 DOM：AREA_REPAIR 上传后进入画笔态（「尚未涂抹」），但素材卡**没有**尺寸文本；同 spec 在 `product-refine` 上传同一张图能显示 `e2e-source.png | 2.0 KB · 640×640 · image/png`。
- 定性：**页面级 UI 差异**（AREA_REPAIR 上传区不带尺寸 chip），或该用例的等待条件对 AREA_REPAIR 过强。二者需产品/用例 owner 决策，本次不改业务源码、也不擅自放宽断言。

### 4.2 `tests/tools-navigation.spec.ts:82` 「工作台刷新后仍停留在同一工具（路由与状态可恢复）」— 竞态

```
- Expected: 正在恢复上次的素材…
+ Received: 精修配置 / 输出 待上传原图
expect(after).toBe(before)   // tests/tools-navigation.spec.ts:92
```

- 用例取刷新前 `innerText` 快照再与刷新后逐字比较；刷新前恰好抓到 transient 的「正在恢复上次的素材…」占位，刷新后已 settle，字符串必然不等。
- 定性：**用例竞态**（比较前未等待恢复完成），非产品缺陷；主工作区同一 spec 两次全通过（15 passed / 1 failed，仅 4.1），干净 worktree 稳定复现，说明对恢复时序敏感。

### 4.3 偶发的基础设施抖动（不计入失败清单）

干净 worktree 单跑 `tools-navigation.spec.ts` 两次，报的是 `:28` `page.goto: Timeout 45000ms exceeded (waiting until "load")`——冷启动 vite 首次加载超时，与产品无关。

## 5. 结论与未完成项

- ✅ 单测入口问题已定性与修复（`web/bunfig.toml`），干净 HEAD 单测 1446/0。
- ❌ **E2E 未全绿**：4.1 稳定失败（1/1），4.2 竞态失败（干净 worktree 1/1，主工作区未复现）。
- ⚠️ 复核期间仓库被并发提交（HEAD 从 `c37381c` → `30e3cb1` → `2cd5393`，另有进程在改测试/业务文件），所有数字均标注当时的 HEAD；复跑请以 `git rev-parse --short HEAD` 为准。
- ⚠️ 未触碰：业务源码、POSE/batch/R8 审计报告。
