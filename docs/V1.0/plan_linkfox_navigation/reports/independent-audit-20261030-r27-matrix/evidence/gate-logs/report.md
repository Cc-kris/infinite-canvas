# 固定 HEAD 独立四闸验证（r26 · install / typecheck / 全量单测 / build）

日期：2026-10-30 · 执行：**DeepSeek worker（单进程物理执行）**
约束遵守：未嵌套派工、未换模型、未读任何密钥、**未修改 `src`**、未抢 asset race / R25 / content 文件。

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- 分支：`feat/linkfox-v1-real`
- **被测提交：`eacc18f7cb16d15ed40afaed6beeff13da1c39a9`**（"fix(tools): 存入资产不再写 1280x720 视频兜底尺寸，改严格测量+后台校正"，2026-10-30 12:33:09 +0800）
- 裁定：**PASS（4/4）**

---

## 1. 被测对象与隔离方式

| 项 | 值 |
| --- | --- |
| commit | `eacc18f7cb16d15ed40afaed6beeff13da1c39a9` |
| tree | `3fbda4bac69ca39f92f94f25e6bf74b6a5ef43eb` |
| `web/` tree | `3722e3cfa871ba792c2f21d0f3d54f677b385655` |
| `web/src` tree | `b099d5c664a2dadb12b1012dc2686319964d0992` |
| 全树文件数 | **3707** |
| `web/src` 文件数 | **409** |
| 隔离方式 | `git archive HEAD \| tee ic-r26-head.tar \| tar -x -C /private/tmp/icw-r26-head`（无 `.git`，不碰主工作树） |
| 归档 sha256 | `68c4c32023a54ec9b8acfd865ed6be0407978559bc3ab1659da143708de22e94` |
| 归档大小 | 443,822,080 B |

**HEAD 迁移观测（隔离为什么必要）**：快照 pin 时 HEAD = `eacc18f7`；到 12:44:55，并行 worker 在其之上提交了 `7f656bd5 audit(r25): 独立六维矩阵 R25（PIN 2ecd958d）`（父提交正是 `eacc18f7`，仅新增 `docs/` 与 `tools/recompute_scope_matrix_r25.py`）。本轮结论**严格锁定 `eacc18f7`**，`7f656bd5` 不在范围内。

**逐 blob 一致性核对（证明快照 == 提交，不是"差不多"）**

```
blob verify: total=3707 ok=3707 diff=0 missing=0
blob verify web/src: ok=409 diff=0
```

即：解包后 3707 个文件逐个算 `sha1("blob <len>\0"+bytes)`，与 `git ls-tree -r eacc18f7` 的 object id **全部命中**，`web/src` 409/409 命中。见 `logs/blob-verify-head.txt`。

**明确排除项**：主工作树里 `web/src/stores/use-asset-store.ts` 存在未提交改动（工作树 blob `e7b8ee6b…`），**未纳入本轮**。快照内该文件实测为提交版本 `5ea8d741a39421c4fe8b52efea5207fbc35b58e3`，与 `git show eacc18f7:web/src/stores/use-asset-store.ts` 一致（证据：`logs/working-tree-status.txt`）。运行期间其他 worker 还在改 `video-translation*.ts`、`project_memory.md` 等，同样不影响归档快照。

## 2. 四闸结果（真实退出码，全部来自本次快照）

| 闸 | 命令 | exit | 关键数字 | 耗时 |
| --- | --- | --- | --- | --- |
| 0 依赖 | `bun install --frozen-lockfile` | **0** | 931 packages installed | 5.40s |
| 1 类型 | `bun run typecheck`（`tsc --noEmit`） | **0** | **0 error TS** | real 369.03s |
| 2 单测 | `bun test` | **0** | **1514 pass / 0 fail**，88 文件，8458 `expect()` | 11.51s |
| 3 构建 | `bun run build`（vite build） | **0** | 8830 modules transformed，443 个产物文件 | built in 1m 28s（real 90.58s） |

工具链：`/Users/mac/.bun/bin/bun` = **bun 1.4.2**（未使用 npm/pnpm/node）。

### 2.1 typecheck 非空跑证明

`tsc --listFiles` 独立跑一遍：exit **0**，编译程序 **3441** 个文件，其中 `web/src/**` **408** 个，`error TS` 计数 **0**。
（树里 409 个，差的 1 个是 `web/src/styles/globals.css`——CSS 不在 `tsconfig.include` 的 `src/**/*.ts|tsx` 里，属预期。）
注：r24（同一台机）实测 22s，本轮 369s，差异原因是**全新 node_modules 冷缓存 + 无 tsbuildinfo**（`incremental: true`），非报错重试。

### 2.2 单测明细

```
1514 pass
   0 fail
8458 expect() calls
Ran 1514 tests across 88 files. [11.51s]
```

`grep '^\(fail\)'` = 0 行；无 `Playwright Test did not expect` 之类的环境串味告警；本轮比 r24 的 1509 多 **5** 条，正好等于新增的 `tool-result-actions.asset-meta.test.ts`（见 §3）。

### 2.3 build 非空壳证明

- 入口 `dist/index.html` 真实引用 `assets/index-BM1Z8JG7.js`（5,616.02 kB / gzip 1,733.77 kB）与 `assets/index-Bi0Yw3LF.css`（159.77 kB），`<title>`、`#root`、`/config.js` 齐备。
- 产物 **443** 个文件、**37M**，清单存档 `logs/dist-files.txt`。
- 关键符号确实被打进 bundle（`grep -a -o | wc -l` 计数，`dist/assets/index-BM1Z8JG7.js`）：`AI_VIDEO_EDITING` = 20 次、`VIDEO_TRANSLATION` = 23 次、`IMAGE_TRANSLATION` = 27 次、`measureVideoMeta` = 10 次、`reconcileVideoNodeMeta` = 4 次 —— 即本轮的视频元数据/比例链路**在产物里存在**，不是被 tree-shake 掉的空壳。
- 唯一告警是常规 chunk > 500 kB 提示（既有现象，非失败）。

## 3. 重点覆盖：三个指定模块（独立运行证据）

| 文件 | 用例 | 结果 |
| --- | --- | --- |
| `web/src/components/tools/tool-result-actions.asset-meta.test.ts` | 5 | **5 pass / 0 fail / 27 expect** |
| `web/src/lib/canvas/video-meta-reconcile.test.ts` | 10 | **10 pass / 0 fail / 27 expect** |
| `web/src/features/tools/adapters/ai-video-editing.test.ts` | 42 | **42 pass / 0 fail / 152 expect** |

三文件合并连跑 **两次**，均为 **57 pass / 0 fail / 206 expect**（确定性，无 flaky）：

- `asset-meta` 覆盖的核心契约（逐条实测通过）：
  1. 兜底尺寸 + 严格测量成功 → 写真实 `768×768` 与时长，**不标 pending**；
  2. 兜底尺寸 + 测不到 → **不写兜底**（`0×0` + pending），后台校正回填真实值并保留溯源；
  3. 真实入库元数据（未超时）→ 不重复测量，直接用真实值；
  4. `resolveStoredVideoMeta`：兜底值永不当事实，测量失败返回 `null`；
  5. `reconcileAssetVideoMeta`：始终测不到 → pending，**不 patch 假值**。
- `video-meta-reconcile` 覆盖 16:9 / 9:16 真实比例建框、`VIDEO_NODE_FRAME_MAX=420` 内等比收框、两轮校正（第一轮测不到 → `pending` 保持原样；第二轮拿到真实值 → 尺寸/元数据/中心同时改对）、`frame-matched` 只清 pending 不动框、已校正节点幂等跳过、节点被删则不写补丁。
- `ai-video-editing` 42 条分组：adapter 10 / registry 7 / prompt & snapshot 6 / result view 4 / capability 4 / D4 视频请求参数 4 / D3 素材本地字节校验 3 / **D2 时长未知 3** / workspace 页面结构 1。

补充旁证（同批视频链路，快照内独立运行）：

| 文件 | 结果 |
| --- | --- |
| `src/features/tools/adapters/video-translation.test.ts`（VT 元数据/参数） | 30 pass / 0 fail / 85 expect |
| `src/components/tools/tool-result-actions.video-frame.test.ts`（发画布建框比例） | 5 pass / 0 fail / 25 expect |
| `src/services/media-metadata.test.ts`（严格测量 vs 兜底读取） | 5 pass / 0 fail / 18 expect |
| `src/features/tools/registry/registry.test.ts`（工具注册表） | 18 pass / 0 fail / 1622 expect |
| `src/services/api/tools/result-assets.test.ts`（资产入库 API） | 30 pass / 0 fail / 95 expect |

## 4. 被测改动范围（`eacc18f7` 相对 `c4b3611a`）

`git diff --numstat c4b3611a eacc18f7 -- web/src`：

```
136	0	web/src/components/tools/tool-result-actions.asset-meta.test.ts
126	10	web/src/components/tools/tool-result-actions.ts
```

源码侧只改 `tool-result-actions.ts`（新增 `resolveStoredVideoMeta` / `reconcileAssetVideoMeta`，存资产路径改为「先严格测量，拿不到写 `0×0`+pending，再由后台校正」），并把 `1280×720` 降级为**只用于不让入库卡死的占位**（`tool-result-actions.ts:270/299/419/601` 注释与 `media-metadata.ts:20-21,56-57` 的 `FALLBACK_VIDEO_WIDTH/HEIGHT` 仍保留，但不再写进 `asset.data`）。该结论由 §3 的 5 条用例逐条物理验证，不是读码推测。

`c4b3611a..eacc18f7` 之间触碰 `web/src` 的提交只有 `eacc18f7` 一个；VT 元数据 / AVE / 比例相关代码此前已提交，全部包含在本次 409 个 `web/src` 文件里跑过。

## 5. 本轮未覆盖（风险边界）

- 未做真实浏览器/后端 E2E（本轮口径 = install + 类型 + 单测 + 构建四闸）；真实任务链路可参考 `2ecd958d` 的 r22-h 结论。
- 结论**仅对提交 `eacc18f7` 的归档内容**成立。pin 之后主工作树的未提交改动（`use-asset-store.ts`、`video-translation*.ts` 等）与 `7f656bd5` 之上的内容**均未验证**。
- `bun install` 走 `--frozen-lockfile` + 锁文件命中；若后续 `bun.lock` 变动需重跑闸 0。

## 6. 裁定

| 闸 | 结果 |
| --- | --- |
| 0 `bun install --frozen-lockfile` | PASS（exit 0，931 packages） |
| 1 typecheck | PASS（exit 0，0 error，3441 文件入程序 / 408 个 src） |
| 2 全量单测 | PASS（exit 0，1514/1514，88 文件，0 fail，8458 expect） |
| 3 build | PASS（exit 0，8830 模块，1m28s，443 产物 / 37M，关键符号在 bundle 内） |

**VERDICT: PASS（4/4）· 范围 = commit `eacc18f7` 的完整树（3707 blobs 全量核对一致）**

## 7. 复现步骤

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
git archive --format=tar eacc18f7 | tar -x -C /private/tmp/icw-r26-head
cd /private/tmp/icw-r26-head/web
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile      # exit 0, 931 packages
bun run typecheck                  # exit 0, 0 error
bun test                           # exit 0, 1514 pass / 0 fail / 88 files
bun run build                      # exit 0, 8830 modules, 443 dist files
```

## 8. 证据文件（`logs/`）

`install.log` `install.exit` · `typecheck.log` `typecheck.exit` · `tsc-listfiles.log` `tsc-listfiles.exit` · `buntest.log` `buntest.exit` · `build.log` `build.exit` · `testfiles.txt`（88 个测试文件）· `dist-files.txt`（443 个产物）· `blob-verify-head.txt` · `working-tree-status.txt`
