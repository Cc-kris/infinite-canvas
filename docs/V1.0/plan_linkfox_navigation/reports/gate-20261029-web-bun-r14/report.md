# Web 三闸 Gate 报告（typecheck / test / build）— 2026-10-29 r14

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- 分支：`feat/linkfox-v1-real`
- **被测快照 HEAD：`2e0bb42064a17a3d226e315cb83bfb8e02d36881`**（2026-10-29T21:05:31+08:00，`fix(IMAGE_TO_VIDEO): update() 去掉 setValues updater 内副作用(渲染期 setState)`）
- 执行方式：`git archive 2e0bb42 | tar -x -C /tmp/ic-gate-r14` 取出只读快照，`web/node_modules` 软链到真实依赖目录；**不在他人正在编辑的工作区里跑闸**
- 工具链：bun `1.4.2 (744846f84)`；vite `7.3.7`；node `v24.14.0`
- 样本时间：2026-10-29 21:08:26 – 21:11:37 CST

## 0. 结论

| 闸 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 类型检查 | `bun run typecheck`（`tsc --noEmit`） | **PASS**（无输出） | 0 | 99.7s |
| 单测 | `bun test` | **PASS**：1469 pass / 0 fail / 8295 expect()，83 个文件 | 0 | 3.5s |
| 构建 | `bun run build`（`vite build`） | **PASS**：✓ 11086 modules transformed，✓ built in 1m 8s，dist 37 MB | 0 | 68.2s |

**本轮未修改任何源码**：`web/src` 在工作区里的未提交改动（`image-to-video.tsx`、`image-to-video.ts`、`image-to-video.test.ts`，mtime 21:10:10–21:10:49）属其他 worker 的在途编辑，不在快照内、也未被本报告触碰。

与 r13 对比（同分支上一轮，快照 `097f097`）：test 由 1460 pass / 82 文件 → **1469 pass / 83 文件**（+9 用例，新增 `result-panel.test.ts` 等）；三闸仍全绿。

## 1. HEAD 固定性说明

| 时间（CST） | 事件 |
|---|---|
| 21:05:31 | 其他 worker 提交 `2e0bb42`（`web/src` 最后一次提交） |
| 21:06–21:08 | 观测静默：`web/src` 无新写入（最后 mtime 21:01:43），tracked 文件无 dirty，HEAD 未变 |
| 21:08:09 | 判定稳定，固定 `2e0bb42` 并 `git archive` 出快照 |
| 21:08:26–21:11:37 | 三闸执行 |
| 21:11:55 | 复核：**HEAD 仍为 `2e0bb42`，跑闸全程无位移** |

跑闸期间 `git diff --stat 2e0bb42 HEAD -- web/src web/package.json` 输出为空，即**本报告结论覆盖的就是当前分支 HEAD**。

### 1.1 跑闸后出现的新在途改动（不属本轮样本）

21:10:10 之后其他 worker 又开始编辑 IMAGE_TO_VIDEO：

```
 M web/src/components/tools/workspaces/image-to-video.tsx   (21:10:17)
 M web/src/features/tools/adapters/image-to-video.ts        (21:10:10)
 M web/src/features/tools/adapters/image-to-video.test.ts   (21:10:49)
```

这些改动**未进入快照**、未参与本次判定；若其提交，需对届时新 HEAD 再跑一轮（见 §5）。

## 2. 原始输出（摘录，全文见 `evidence/`）

### 2.1 typecheck

```
$ tsc --noEmit
real 99.71
user 59.22
sys 12.44
```

（无告警无错误输出，`TYPECHECK_EXIT=0`）

### 2.2 test

```
 1469 pass
 0 fail
 8295 expect() calls
Ran 1469 tests across 83 files. [3.51s]
real 3.53
TEST_EXIT=0
```

### 2.3 build

```
$ vite build
vite v7.3.7 building client environment for production...
✓ 11086 modules transformed.
dist/index.html                            1.05 kB │ gzip:     0.57 kB
dist/assets/index-MCAOPxSD.css           159.74 kB │ gzip:    26.20 kB
dist/assets/index-cnyqzc7Z.js          5,948.31 kB │ gzip: 1,848.97 kB
✓ built in 1m 8s
real 68.22
BUILD_EXIT=0
```

产物指纹（快照 `/tmp/ic-gate-r14/web/dist`，37 MB）：

```
aa82b21f4d6afa6a2d19a237c6f770e2aa7282268e3dab37475c0ca14b013d71  dist/index.html
5,948,307 B  dist/assets/index-cnyqzc7Z.js
  159,737 B  dist/assets/index-MCAOPxSD.css
      439 B  dist/assets/highlighted-body-OFNGDK62-BO4AkcRH.js
```

> r13 在 `/tmp` 快照里 build 用了 8m34s，本轮同环境仅 1m08s（主 chunk 由 `index-BVP2Wb92.js` → `index-cnyqzc7Z.js`）。差异来自当时同机 CPU 争抢，非代码因素；模块数 11085 → 11086，产物结构一致。

## 3. 非阻塞告警（历史既有，非本轮新增）

1. 主 chunk 偏大：`index-cnyqzc7Z.js` 5.95 MB / gzip ≈ 1.85 MB（> 500 kB 告警）——体积优化项，不影响正确性。
2. 多处模块被「静态 + 动态」同时 import（Vite 提示 dynamic import 不拆 chunk），共 14 条，与 r13 同类，历史既有。
3. `zod` / `localforage` / `file-saver` 等 CommonJS 依赖的 `@__PURE__` 注释位置告警（Rollup 丢弃注释），无功能影响。

以上均不阻断三闸，本轮不修（避免触碰他人文件）。

## 4. 本轮是否修了回归

**无。** 三闸在固定快照上全 PASS，没有出现本轮新增的明确回归，因此未做任何源码改动。

仅在一次脏工作区观测中记录到（供后续排查参考，非本轮结论）：21:10 后其他 worker 正在改 `image-to-video*`，未纳入判定。

## 5. 复现命令

```bash
export PATH="$HOME/.bun/bin:$PATH"          # 本机非交互 shell 默认 PATH 无 bun
cd /Users/mac/Documents/Dev/infinite-canvas
rm -rf /tmp/ic-gate-r14 && mkdir -p /tmp/ic-gate-r14
git archive 2e0bb42064a17a3d226e315cb83bfb8e02d36881 | tar -x -C /tmp/ic-gate-r14
ln -s /Users/mac/Documents/Dev/infinite-canvas/web/node_modules /tmp/ic-gate-r14/web/node_modules
cd /tmp/ic-gate-r14/web
bun run typecheck; echo "EXIT=$?"
bun test;          echo "EXIT=$?"
bun run build;     echo "EXIT=$?"
```

## 6. 证据文件

| 文件 | 说明 | sha256 |
|---|---|---|
| `evidence/typecheck-output.txt` | `tsc --noEmit`（静默成功 + 计时） | `2f6a514ccba80f4c41ed23fbf7188b41e8f76b1d7a9d3fa4c6ae43ff1f20431f` |
| `evidence/test-output.txt` | `bun test` 完整输出（1644 行，去 ANSI） | `89dd29253a5122b393cccb889491483385c5f9e571f93d98dc2c01d51685429a` |
| `evidence/build-output.txt` | `vite build` 完整输出（79 行，去 ANSI） | `c2281d66bfb831b7c0824e9f1a74aaeec2c519282dd9bb59e024dd0e26cbce8e` |

> 仓库 `.gitignore` 含 `*.log`，故日志以 `.txt` 入库；内容为原始输出去掉 ANSI 颜色码，sha256 可校验。

## 7. 边界声明

- 未派发子 worker、未读调度 SOP。
- 未修改任何 `web/src`、`web/tests` 或其他 worker 的文档/证据；本提交仅含 `reports/gate-20261029-web-bun-r14/` 下的 4 个文件。
- 结论严格限定在快照 `2e0bb42`；跑闸期间 HEAD 未位移，故此结论**同时适用于当时的分支 HEAD**。
- 跑闸后（21:10 起）出现的 `image-to-video*` 三处未提交改动不在覆盖范围内。
- 工作区中 `docs/.../independent-audit-20261029-r9/matrix.{json,md}` 与 `project_memory.md` 的改动属他人，未纳入本提交。

**后续动作建议**：IMAGE_TO_VIDEO 那批改动提交后，按 §5 对新 HEAD 再跑一轮，写入 r15。
