# Web 三闸 Gate 报告（typecheck / test / build）— 2026-10-29 r15

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- **被测固定快照 HEAD：`8761c4e1f68caad4fc276c2f4c35ae4925458873`**（2026-10-29T21:13:11+08:00，`fix(IMAGE_TO_VIDEO): reload 后结果可播放判定与历史回填不再误报`）
- 执行方式：`git archive 8761c4e | tar -x -C /tmp/ic-gate-r15`，`web/node_modules` 软链到真实依赖目录；**不在他人正在编辑的工作区里跑闸**（工作区当时有其他 worker 的跟踪/未跟踪改动）
- 工具链：bun `1.4.2 (744846f84)`；vite `7.3.7`；typescript `5.9.3`；node `v24.14.0`
- 样本时间：2026-10-29 21:16:57 – 21:20:27 CST

## 0. 结论

| 闸 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 类型检查 | `bun run typecheck`（`tsc --noEmit`） | **PASS**（无输出） | 0 | 2m40.9s |
| 单测 | `bun test` | **PASS**：1470 pass / 0 fail / 8298 expect()，83 个文件 | 0 | 8.4s |
| 构建 | `bun run build`（`vite build`） | **PASS**：✓ 11086 modules transformed，✓ built in 33.12s，dist 37 MB | 0 | 33.8s |

**本轮未修改任何源码，也未发现本提交引入的回归**：三闸在快照上一次全绿，`web/src` 无需改动。提交内容仅为 IMAGE_TO_VIDEO 的两处行为修正 + 1 个新增回归用例（见 §3）。

与 r14（快照 `2e0bb42`）对比：test 由 1469 pass / 8295 expect / 83 文件 → **1470 pass / 8298 expect / 83 文件**，增量正是本提交新增的 `刷新后只剩 storageKey（url/blob 已剥离）仍算可播放，不误报上游为空`（+1 用例、+3 expect）。typecheck、build 结果与 r14 同档（build 模块数同为 11086，耗时 1m8s → 33.1s 属机器负载波动）。

## 1. HEAD 固定性说明（不追并发 HEAD）

跑闸期间仓库 HEAD 被其他 worker 连续推进，本报告样本**始终固定为 `8761c4e`**，未跟随：

| 时间（CST） | 事件 |
|---|---|
| 21:13:11 | 被检提交 `8761c4e`（本轮固定样本） |
| 21:15:0x | 观测：`git status -- web` 只有 untracked 临时脚本/探针文件，`--untracked-files=no -- web` 为空（web 无跟踪改动） |
| 21:16:0x | 他人提交 `7069b84`（R13 矩阵重算，docs 类） |
| 21:16:1x | 他人提交 `32ab56d`、`8fc9856`（r16 证据/文档） |
| 21:16:3x | `git archive 8761c4e` 出快照，校验 `web/src/features/tools/adapters/image-to-video.ts` sha1 = `8908de37…` 与提交内 blob 一致；文件清单与 `git ls-tree -r 8761c4e web/src` 一致（401 个 `.ts/.tsx` + `styles/globals.css`） |
| 21:16:57–21:20:27 | 三闸执行（样本只读，不受 HEAD 位移影响） |
| 21:21:05 | 他人提交 `90fa31d`（r16 I2V 回执证据），live HEAD = `90fa31d` |

### 1.1 位移后复核：结论对当前 HEAD 依然成立

```
$ git diff --stat 8761c4e..HEAD -- web
(空输出)
```

即 `8761c4e` 之后的所有并发提交（`7069b84` / `32ab56d` / `8fc9856` / `90fa31d`）**均未触碰 `web/`**，只有 `docs/` 与根目录证据文件变化。因此本报告的三闸结论同时覆盖上述提交之后的 `web` 代码。

## 2. 原始输出（全文见 `evidence/`）

### 2.1 typecheck

```
$ tsc --noEmit
real	2m40.920s
user	1m0.419s
sys	0m16.824s
TYPECHECK_EXIT=0
```

（无告警、无错误输出）

### 2.2 test

```
bun test v1.4.2 (744846f84)
...
 1470 pass
 0 fail
 8298 expect() calls
Ran 1470 tests across 83 files. [8.33s]
TEST_EXIT=0
```

本提交新增用例实跑通过（`src/features/tools/adapters/image-to-video.test.ts:451` 块内）：

```
(pass) 提交链路 > 刷新后只剩 storageKey（url/blob 已剥离）仍算可播放，不误报上游为空 [1.39ms]
```

同文件其余契约用例（字段契约 / 工作区真实渲染 / 页面配置→provider 参数 / 校验与联动 / 提交链路）全 pass。全量日志中无任何 `(fail)` 行。

### 2.3 build

```
$ vite build
vite v7.3.7 building client environment for production...
✓ 11086 modules transformed.
dist/index.html                                        1.05 kB │ gzip:     0.57 kB
dist/assets/index-MCAOPxSD.css                       159.74 kB │ gzip:    26.20 kB
dist/assets/highlighted-body-OFNGDK62-CF2BlQBi.js      0.44 kB │ gzip:     0.31 kB
dist/assets/index-B_sQ45Ro.js                      5,948.58 kB │ gzip: 1,848.98 kB
✓ built in 33.12s
BUILD_EXIT=0
```

仅有既有的 chunk 体积提示与 `zip.ts` 动静双导入提示（非错误，r14 同样存在），非本提交引入。

## 3. 本提交改动与回归判定

`git show --stat 8761c4e`：

| 文件 | 变更 | 内容 |
|---|---|---|
| `web/src/features/tools/adapters/image-to-video.ts` | +3/−1 | `imageToVideoResultCell` 可播放判定由 `url || blob` 扩为 `url \|\| blob \|\| (storageKey && !payloadDropped)` |
| `web/src/components/tools/workspaces/image-to-video.tsx` | +15/−4 | `restoreFromTask` 按 `configSnapshot.videoSeconds/quality` 回填 `duration/resolution`，提示文案改为「缺失才沿用当前值」 |
| `web/src/features/tools/adapters/image-to-video.test.ts` | +21 | 新增 storageKey-only 可播放 / payloadDropped 判失败的回归用例 |
| `docs/.../evidence/build-output.txt` | bin | 二进制产物记录 |

**回归判定：无。** 三闸无红；新增判定放宽了「可播放」条件，未发现由此引起的既有用例失败（1470/1470 全绿），也未出现类型不兼容（typecheck 0 错）。因此按「只修本提交明确引入的回归」的约束，**本轮不做任何源码改动**。

### 3.1 未覆盖（诚实声明）

- 本报告只验证静态闸（类型/单测/构建），**不重复**提交信息里的真实链路验收（真实出片、存资产、发画布、reload 后面板重建）；那部分以提交内与 r16 的 task `mvtjhbcg-e8lnin` 回执为准。
- `restoreFromTask` 的时长/清晰度回填没有独立单测（仅类型与构建保证），属已知测试空白，本轮按约束不新增。
- 工作区当时存在其他 worker 的未跟踪探针脚本（`web/.tmp-*`、`web/probe*.mjs`、`.worker-*` 等）。快照方式已将其全部排除，未读写、未删除。

## 4. 复现命令

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
rm -rf /tmp/ic-gate-r15 && mkdir -p /tmp/ic-gate-r15
git archive 8761c4e | tar -x -C /tmp/ic-gate-r15
ln -s /Users/mac/Documents/Dev/infinite-canvas/web/node_modules /tmp/ic-gate-r15/web/node_modules
cd /tmp/ic-gate-r15/web && export PATH=$HOME/.bun/bin:$PATH
bun run typecheck && bun test && bun run build
```

## 5. 证据清单

| 文件 | 说明 |
|---|---|
| `evidence/typecheck-output.txt` | tsc 全量输出 + real/user/sys + 退出码 |
| `evidence/test-output.txt` | 1649 行，全部 `(pass)`，含 1470 pass / 0 fail 汇总 |
| `evidence/build-output.txt` | vite 全量输出（含 11086 modules、chunk 体积、built in 33.12s） |
| `evidence/snapshot-head.txt` | 固定样本 hash、跑闸时 live HEAD、时间窗 |
