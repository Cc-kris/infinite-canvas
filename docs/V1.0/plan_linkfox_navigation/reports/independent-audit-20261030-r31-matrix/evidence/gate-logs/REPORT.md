# 固定 HEAD 独立四闸验证（r28 · install / typecheck / 全量单测 / build）

日期：2026-10-30 · 执行：**DeepSeek worker（单进程物理执行，未嵌套派工）**
约束遵守：未换模型、未读任何密钥、**未修改 `src`**、未做真实生成、未动任何未提交的工作树文件。

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- 分支：`feat/linkfox-v1-real`
- **被测提交：`c17890c37e8241e5c9716fed5dd4c46ceacda1e0`**（"test(audit): R27 独立矩阵重算（e2529d42，39 工具六维，82/82 断言）"，2026-10-30 13:07:57 +0800）
- 裁定：**PASS（4/4）**

---

## 1. 被测对象与隔离方式

| 项 | 值 |
| --- | --- |
| commit | `c17890c37e8241e5c9716fed5dd4c46ceacda1e0` |
| tree | `cb5123df91fe9aadc6c156089961dea2eb75db4b` |
| `web/` tree | `717d8a4b1785db20ed7abce2b404972974e9d6fc` |
| `web/src` tree | `0d580a572138ccbec13ff76e019076b9058c0fa7` |
| 全树文件数 | **3825** |
| `web/src` 文件数 | **411** |
| 隔离方式 | `git archive c17890c3 > /tmp/icw-r28-head.tar && tar -x -C /tmp/icw-r28-head`（快照内无 `.git`，主工作树零改动） |
| 归档 sha256 | `2cb419668e08b132af10cba03dc5e154fe646670a047057a14920d42054ffdc9` |
| 归档大小 | 448,030,720 B（427.7 MiB） |

**逐 blob 一致性核对（证明快照 == 提交，而不是"看起来一样"）**

```
blob verify: total=3825 ok=3825 diff=0 missing=0
web/src blobs: ok=411 diff=0 missing=0
tree entries (all types): 3825 ; non-blob (submodule/symlink-mode) entries: 0
```

即：解包后 3825 个文件逐个计算 `sha1("blob <len>\0" + bytes)`，与 `git ls-tree -r c17890c3` 的 object id **全部命中**，无差异、无缺失，`web/src` 411/411 命中。证据：`logs/blob-verify-head.txt`、`logs/archive-sha256.txt`。

**必须包含的三个提交（均为 HEAD 祖先，逐一确认）**

| 提交 | 主题 | 祖先? | 触及 web/src |
| --- | --- | --- | --- |
| `d11e1cd4` | fix(assets): 跨标签持久化改为读最新-合并-写回，修掉资产 last-write-wins 覆盖 | **YES** | `stores/asset-store-persist.ts` +214、`stores/use-asset-store.ts` +72/-9 |
| `938de5d5` | test(assets): 覆盖跨标签合并、墓碑与双写竞争 | **YES** | `stores/asset-store-persist.test.ts` +171 |
| `2dd097bb` | fix(video-translation): 输出画幅默认跟随原视频，不再被全局 size=1:1 重构图 | **YES** | registry +134、adapter +20、adapter.test +129、workspace +54/-2 |

`git merge-base --is-ancestor <c> HEAD` 三者皆真；且这三个提交正是 `eacc18f7..c17890c3` 区间内**唯一**触及 `web/src` 的提交（其余 5 个提交只动 `docs/`、`tools/`）。区间内 `web/src` numstat 合计：新增 794 行 / 删除 11 行，全部来自这三个提交。

**HEAD 迁移观测（隔离为什么必要）**：pin 时 HEAD = `c17890c3`。跑到收尾（13:29:36）时并行 worker 已在其之上追加 3 个提交：`1ef24fba`（docs: r27 上游协议调查 BLOCKED）、`454fa580`（test: r26 真实上游复验脚本）、`bd71498f`（docs: r27-aspect 画幅真实验收报告）。核对：`git merge-base --is-ancestor c17890c3 HEAD` = YES，且 `git log --oneline c17890c3..HEAD -- web/src` **输出为空**——即迁移区间只动 `docs/` 与 `web/scripts/real-acceptance/`，**被测源码面与本轮快照完全一致**。本轮结论严格锁定 `c17890c3`。

## 2. 四闸结果（真实退出码，全部来自本次快照）

| 闸 | 命令 | exit | 关键数字 | 耗时 |
| --- | --- | --- | --- | --- |
| 0 install | `bun install --frozen-lockfile` | **0** | 931 packages，node_modules 701M | 5.25s |
| 1 typecheck | `bun run typecheck`（`tsc --noEmit`） | **0** | **0 error**；非空跑证明 3443 个文件入程序 | 260s（冷缓存） |
| 2 全量单测 | `bun test` | **0** | **1535 pass / 0 fail / 0 skip**，89 文件，8520 `expect()` | 13.85s |
| 3 build | `bun run build`（`vite build`） | **0** | **8831 modules**，443 产物 / 37M | 225s（3m39s） |

### 2.1 typecheck 的"非空跑"证明

```
$ node_modules/.bin/tsc --noEmit --listFiles --incremental false
exit=0  elapsed_s=171
program files: 3443      web/src 命中: 410       error TS: 0
```

`web/src` 树里是 411 个文件，缺的 1 个是 `src/styles/globals.css`（CSS 不被 tsconfig 的 `include: ["src/**/*.ts","src/**/*.tsx"]` 匹配），属正常口径差。若把 0 文件当成功，3443 行的程序清单即反证。

> 环境坑（记录以备复现）：`node_modules/.bin/tsc` 是 `#!/usr/bin/env node` 的 shim，本 runner 的非登录 shell PATH 里没有 node，直接跑会 `env: node: No such file or directory`（exit 127）。本次显式 `export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"`（node v24.14.0）后运行，bun 1.4.2 仍为测试/构建的执行者。

### 2.2 全量单测口径

```
1535 pass
0 fail
8520 expect() calls
Ran 1535 tests across 89 files. [13.85s]
```

89 = `web/src` 内 84 个 `*.test.ts(x)` + `web/tests/` 下 5 个。与 r26（`eacc18f7`，1514 pass / 88 文件）相比 **+21 条**，且这 21 条可完整对上：`asset-store-persist.test.ts` 新增 12 条（`938de5d5`）+ `video-translation.test.ts` 30→39 条（+9，`2dd097bb`）。新增测试文件带来的第 89 个文件同样是 `asset-store-persist.test.ts`。

### 2.3 build 产物与"代码真的进包"核对

```
✓ 8831 modules transformed.
✓ built in 3m 39s
dist files: 443 (+ dist 37M)
dist/assets/index-DTgGRCtK.js   5,622,697 B   (vite gzip 1,724.89 kB)
dist/assets/index-Bi0Yw3LF.css    159,773 B   (vite gzip   25.98 kB)
dist/index.html -> /assets/index-DTgGRCtK.js + /assets/index-Bi0Yw3LF.css，<title>无限画布</title>
```

唯一告警是既有的 `Some chunks are larger than 500 kB after minification`，非失败。

由于 terser 会压缩函数名，函数名不作为存在性证据；改用**源码字面量**在 bundle 内计数（`logs/bundle-symbols.txt`）：

| 特征串 | 次数 | 说明 |
| --- | --- | --- |
| `videoRatio` | 41 | `2dd097bb` 的请求字段（画幅随源） |
| `输出画幅` | 1 | `2dd097bb` 新增的 UI 下拉文案 |
| `planVideoTranslationOutput` | 1 | 画幅档位规划入口 |
| `21:9` | 30 | 画幅档位表（16:9/9:16/1:1/4:3/3:4/21:9） |
| `infinite-canvas:asset_store:sync` | 1 | `d11e1cd4` 的 BroadcastChannel 频道名 |
| `infinite-canvas:asset_store:write` | 1 | `d11e1cd4` 的 Web Locks 锁名 |
| `AI_VIDEO_EDITING` / `VIDEO_TRANSLATION` / `IMAGE_TRANSLATION` | 20 / 26 / 27 | 工具注册表存活 |
| `measureVideoMeta` / `reconcileVideoNodeMeta` | 10 / 4 | 既有视频元数据链路存活 |

## 3. 指定提交的独立证据（按要求覆盖 3 个提交）

| 提交 | 覆盖文件 | 用例 | 结果 | 断言 |
| --- | --- | --- | --- | --- |
| `d11e1cd4` + `938de5d5`（资产竞态：读最新-合并-写回 / 墓碑 / 双写竞争） | `web/src/stores/asset-store-persist.test.ts` | 12 | **12 pass / 0 fail** | 16 expect |
| `2dd097bb`（输出画幅默认跟随原视频） | `web/src/features/tools/adapters/video-translation.test.ts` | 39 | **39 pass / 0 fail** | 131 expect |

两文件在快照内独立重复运行两次，结果一致（确定性），见 `logs/gate2b-targeted-tests.log`。用例名直接暴露被修行为，例如：

```
(pass) 多标签冲突：落盘 revision 更新时不覆盖，返回 remote
(pass) decideRemoteDraft：无本地则采纳，旧版本忽略，本地脏则冲突
(pass) 刷新恢复：persist 后重新 load 得到同样的 values / assetIds / revision
(pass) adoptLibraryAsset 复用资产库 storageKey，缺少键时拒绝
(pass) VIDEO_TRANSLATION workspace：页面结构 > 渲染出六个区域与关键控件文案
```

同时 `2dd097bb` 的提交信息里记录的口径（16:9→1280x720、1:1→720x720 对照、`inferVideoRatio` 自洽）由这 39 条用例守护，且在 build 产物里能定位到 `videoRatio`/`输出画幅` 字面量（见 §2.3）。

> 边界说明：本轮**没有**在真实浏览器里复现跨标签竞态（那需要跑 live UI + 双标签，且属"真实生成/E2E"范畴，本轮明确排除）。竞态行为在这里的判定依据是 `938de5d5` 的单测覆盖粒度，不是浏览器实测。

## 4. 未提交改动确实没混入（语言组 adapter）

主工作树在快照后仍带着语言组 WIP：

```
 M project_memory.md
 M web/src/features/tools/adapters/video-translation.test.ts
 M web/src/features/tools/adapters/video-translation.ts
未提交 diff 规模：+105 / -7（adapter.ts +69/-7，adapter.test.ts +36）
```

blob 三方对比（关键证据）：

| 文件 | worktree | HEAD | snapshot |
| --- | --- | --- | --- |
| `adapters/video-translation.ts` | `4c3b71c7…` | `3cae58f8…` | **`3cae58f8…`（= HEAD）** |
| `adapters/video-translation.test.ts` | `49963643…` | `68fd0c43…` | **`68fd0c43…`（= HEAD）** |

即：快照取的是 `2dd097bb` 的已提交版本，WIP 的 `4c3b71c7` / `49963643` 从未进入任何一闸。全部证据见 `logs/exclusion-uncommitted-adapter.txt`、`logs/working-tree-status.txt`、`logs/snapshot-key-files.txt`。

## 5. 结论

| 闸 | 结果 |
| --- | --- |
| 0 `bun install --frozen-lockfile` | PASS（exit 0，931 packages，5.25s） |
| 1 typecheck | PASS（exit 0，0 error，3443 文件入程序 / 410 个 src） |
| 2 全量单测 | PASS（exit 0，1535/1535，89 文件，0 fail，8520 expect） |
| 3 build | PASS（exit 0，8831 模块，3m39s，443 产物 / 37M，关键特征串在 bundle 内） |

**VERDICT: PASS（4/4）· 范围 = commit `c17890c3` 的完整树（3825 blobs 全量核对一致，含 `d11e1cd4` / `938de5d5` / `2dd097bb`）**

未覆盖：真实浏览器/后端 E2E 与真实生成；未提交工作树改动（语言组 adapter WIP、`project_memory.md`）；跨标签竞态的 live 复现（仅有单测级证据）。

## 6. 复现步骤

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
git archive --format=tar c17890c37e8241e5c9716fed5dd4c46ceacda1e0 | tar -x -C /tmp/icw-r28-head
cd /tmp/icw-r28-head/web
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"   # tsc shim 需要 node
bun install --frozen-lockfile   # exit 0, 931 packages
bun run typecheck               # exit 0, 0 error（非空跑证明：tsc --noEmit --listFiles --incremental false）
bun test                        # exit 0, 1535 pass / 0 fail / 89 files / 8520 expect
bun run build                   # exit 0, 8831 modules, 443 dist files
```

## 7. 证据文件（`logs/`）

| 文件 | 内容 |
| --- | --- |
| `archive-sha256.txt` | 归档 sha256 |
| `blob-verify-head.txt` | 3825 全树 + 411 `web/src` 逐 blob 核对结果 |
| `snapshot-key-files.txt` | 快照内关键文件 blob 与 HEAD 对照 |
| `working-tree-status.txt` | 快照时刻的 `git status` 与 HEAD 信息 |
| `exclusion-uncommitted-adapter.txt` | 未提交 adapter 的差异规模与三方 blob 对照 |
| `gate0-install.log` | install 输出（931 packages） |
| `gate1-typecheck.log` / `.exit` | typecheck 输出与退出码 |
| `gate1b-tsc-listfiles.log` | 3443 行程序文件清单（非空跑证明） |
| `gate2-bun-test.log` / `.exit` | 全量单测输出（1535 pass / 89 files） |
| `gate2b-targeted-tests.log` | 两个指定模块定向重复运行 |
| `gate3-build.log` / `.exit` | vite 构建输出（8831 modules） |
| `dist-files.txt` | 443 个产物清单 |
| `bundle-symbols.txt` | bundle 内特征串计数 |
