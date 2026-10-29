# 三闸独立验证 · 固定快照 3f7a5fc

> 验证对象：**commit `3f7a5fc9e368d0da01ca1933b6570ef1efad471a`**（tree `32ad5561ad8863740680982b8abdbe9582418cbe`）
> 跑时仓库真实 HEAD：`3f7a5fc9e368d0da01ca1933b6570ef1efad471a`（与目标快照一致，无漂移）
> 执行时间：2026-10-29 22:33–22:40（本地 macOS）
> 结论：**typecheck / bun test / build 三闸全绿；本提交无回归，未改任何产品代码。**

## 0. 提交语义（被验证的改动范围）

`fix(result-recovery): 视频结果恢复后真可下载/存资产/发画布 + 机器回执(task-mvtk9pu3-sfifnh)`，5 个文件：

| 文件 | 变化 |
|---|---|
| `web/src/lib/task-snapshot.ts` | 新增 `pickRicherTaskSnapshot`（按 updatedAt，其次按载荷完整度选快照） |
| `web/src/components/tools/tool-result.tsx` | 新增 `useStoredResultUrl`（按 storageKey 从 IndexedDB 复原地址）；`dropped` 判据改为 `hasUsablePayload` |
| `web/src/components/tools/tool-result-actions.ts` | `summarizeResultItems.dropped`、`assertResultPayload` 统一走 `hasUsablePayload`（认 storageKey） |
| `web/src/components/tools/tool-result.test.tsx` | 新增 2 条用例（见 §3） |
| `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json` | 机器回执 |

## 1. 净树构造（排除他人脏工作区与 untracked 探针）

```bash
git archive 3f7a5fc9 | tar -x -C /tmp/ic-gate-3f7a5fc9
ln -s <repo>/web/node_modules /tmp/ic-gate-3f7a5fc9/web/node_modules
cp <repo>/web/bunfig.toml       /tmp/ic-gate-3f7a5fc9/web/bunfig.toml
```

工作区当时存在他人未提交改动（`docs/.../independent-audit-20261029-r9/matrix.{json,md}`、`project_memory.md`）与大量 untracked 探针目录，均未进入判定树。

工具链：`bun 1.4.2`、`vite 7.3.7`、`typescript ^5`（`web/node_modules/.bin/tsc`）。bun 用绝对路径 `/Users/mac/.bun/bin/bun`（登录 shell 之外 PATH 无 bun）。

## 2. 三闸结果（真实退出码）

| 闸 | 命令（均在 `web/` 下） | 退出码 | 耗时 | 关键输出 |
|---|---|---|---|---|
| typecheck | `bun run typecheck`（`tsc --noEmit`） | **0** | 52.6s | 无任何诊断输出 |
| test | `bun test` | **0** | 4.67s | **1479 pass / 0 fail / 8326 expect() / 84 files** |
| build | `bun run build`（`vite build`） | **0** | 39.9s | `✓ built in 39.09s`，`11087 modules transformed`，`dist` 37M |

证据：`logs/{typecheck,test,build}.log` + 同名 `.exit`（原始 stdout/stderr 未删改）。

构建关键产物 sha256：
- `dist/index.html` `b64c9949ba7b622bdba06209d5ccfdb2fc09a5b15216112d9ffc373b162ac447`
- `dist/assets/index-nVxHEnda.js` `0a8ca11fa65b0303521e31dd98d4ddca4ed2f4d0d462e8e8532b0b8ee5511c78`
- `dist/assets/index-MCAOPxSD.css` `f2f3f9d64c1b898a683a9d279170c9d3be9e63d5db67b6e6b9bc57db6a667561`

构建期只有既有告警（大 chunk >500kB、`use-canvas-store` / `file-saver` / `zip` 动态+静态双导入），不阻塞，与本次改动无关。

## 3. 重点核验：视频恢复 + 三动作（下载 / 存资产 / 发画布）

### 3.1 新用例确实被执行且通过

`src/components/tools/tool-result.test.tsx`（全量日志中该文件 32 pass）：

- `(pass) ToolResult states > 刷新后只剩 storageKey 的视频结果仍然可下载/存资产/发画布`
  断言：`data-dropped="false"`、不含「上游未返回该结果的文件」、页面无 `disabled=""`、`summarizeResultItems([storageKey 项])` 的 `dropped === 0`；同时用「既无字节也无地址」的反例证明 `dropped === 1`、`assertResultPayload` 仍抛 `payload-missing`（不把「真缺失」放行）。
- `(pass) ToolResult states > 共享结果区优先采用任务库里更完整的快照（heal 后的 storageKey/对象 URL）`
- `(pass) real result actions > saves an image into the asset library with real storage keys` / `stores video bytes before creating a video asset` / `appends a real node to the chosen canvas project`（三动作链路既有覆盖仍绿）

### 3.2 负向对照：用例是真守卫，不是空跑

构造 **父提交源码 + 本提交测试** 的树：`git archive c99a3f98` → 覆盖 `tool-result.test.tsx` 与 `task-snapshot.ts` → 只跑该文件：

```
EXIT=1    31 pass / 1 fail
(fail) ToolResult states > 刷新后只剩 storageKey 的视频结果仍然可下载/存资产/发画布
```

失败时的真实渲染（`logs/negative-control-test.log`）证明回归形态就是用户报告的现象：

- `data-dropped="true"`
- 占位文案「上游未返回该结果的文件」
- `download` / `save` / `canvas` 三个按钮全部 `disabled=""`

即：本提交确实修掉了「刷新后只剩 storageKey → 三动作全灰」的缺陷，且该用例在有缺陷的代码上会红。证据：`logs/negative-control-test.{log,exit}`。

### 3.3 实现侧核对（读码，非断言）

`useStoredResultUrl(storageKey, fallback)`：仅当「有 storageKey 且无可用 fallback」时才 `resolveMediaUrl(storageKey)` 异步复原件地址，带 `cancelled` 防竞态、失败静默不伪造；`dropped = !hasUsablePayload(item)` 与 `assertResultPayload` 判据同源（`payloadDropped` 优先拒绝，其次 dataUrl/url/blob/**storageKey** 任一可用即放行）。判据统一后不存在「界面可点但动作层判 payload-missing」的分裂。

## 4. 未闭环 / 风险（只记录，未改）

1. **组件接线无测试锁定**：`pickRicherTaskSnapshot` 那条用例是对新工具函数本身的单测，在父提交源码上同样 pass（负向对照里它是 `(pass)`）。因此「`ToolResult` 用 `pickRicherTaskSnapshot` 合并 prop 与 store、修掉本地 state shadow」这条改动**没有组件级回归保护**——将来把合并逻辑删掉不会红。若要补，需要在 `ToolResult` 渲染层断言「prop 里是旧快照（无 storageKey）、store 里是新快照（有 storageKey）时渲染的是新快照」。本轮按「只修本提交明确回归」的边界未扩测。
2. **E2E 回执未复跑**：提交里 `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json` 的下载 sha256 / assetId / canvasNodeId 属上一轮真机证据，本轮按任务范围只跑三闸+单测，未启动浏览器/上游复验。
3. 全量 `bun test` 的 0 fail 依赖 `web/bunfig.toml` 的 `pathIgnorePatterns=["**/*.spec.ts"]`（Playwright spec 隔离闸门）；Playwright E2E 不在本次三闸内。
4. **HEAD 漂移（未追）**：三闸全部跑完时 HEAD 仍为 `3f7a5fc`；提交本报告时分支已被他人推进（执行期间新增 `0069428b`、`eab7ddf5` 等），故本报告提交的父是 `0069428b`。验证对象**仍固定为 `3f7a5fc`**，未对更新的 HEAD 复跑——结论只对该快照成立。
5. **证据入库注意**：仓库 `.gitignore` 第 7 行 `*.log`，`logs/*.log` 必须 `git add -f` 才会进库（首次提交漏了 4 个日志，已用带 `-f` 的补提交修正）。

## 5. 复现

```bash
REPO=/Users/mac/Documents/Dev/infinite-canvas
D=/tmp/ic-gate-3f7a5fc9 && rm -rf "$D" && mkdir -p "$D"
git -C "$REPO" archive 3f7a5fc9 | tar -x -C "$D"
ln -s "$REPO/web/node_modules" "$D/web/node_modules"; cp "$REPO/web/bunfig.toml" "$D/web/"
cd "$D/web"
/Users/mac/.bun/bin/bun run typecheck      # exit 0
/Users/mac/.bun/bin/bun test               # exit 0, 1479 pass
/Users/mac/.bun/bin/bun run build          # exit 0, ✓ built
# 负向对照
N=/tmp/ic-neg-3f7a5fc9 && rm -rf "$N" && mkdir -p "$N"
git -C "$REPO" archive c99a3f98 | tar -x -C "$N"
cp "$REPO/web/src/components/tools/tool-result.test.tsx" "$N/web/src/components/tools/"
cp "$REPO/web/src/lib/task-snapshot.ts"                  "$N/web/src/lib/"
ln -s "$REPO/web/node_modules" "$N/web/node_modules"; cp "$REPO/web/bunfig.toml" "$N/web/"
cd "$N/web" && /Users/mac/.bun/bin/bun test src/components/tools/tool-result.test.tsx   # exit 1, 31 pass / 1 fail
```
