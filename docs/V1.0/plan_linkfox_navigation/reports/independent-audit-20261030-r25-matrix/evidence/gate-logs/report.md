# 固定 HEAD 独立三闸验证（r24 · typecheck / 全量单测 / build）

日期：2026-10-30 · 执行：DeepSeek worker（物理执行，无嵌套派工、未换模型、未读密钥、未改 `src`、未做任何真实生成）

机器可读摘要：[summary.json](./summary.json) · 原始日志与退出码：[logs/](./logs/)

## 1. 被测对象（git 事实）

| 项 | 值 |
| --- | --- |
| 仓库 | `/Users/mac/Documents/Dev/infinite-canvas` |
| 分支 | `feat/linkfox-v1-real` |
| **固定 HEAD（被测 commit）** | `c4b3611aeb708a5236e4a7feefbedded63cd7c7e` |
| commit 时间 / 标题 | 2026-10-30 12:21:28 +0800 · `audit(r23): 独立六维矩阵 R23（PIN a9d66329）——H 37→39，F 38，残留 VT.F` |
| **commit tree hash** | `18a9ad0935ef5ad53e256fb2cc5049aaf42bf496`（3676 文件） |
| **`web/src` tree hash** | `b8d30ac09946fe4ea9891348e7dadde2d2631d01`（408 文件） |
| web tree hash | `ede2d0e243d7ec46095108ede4ff7190947af2dd` |
| 重点覆盖 commit | `a9d66329`（草稿分槽恢复）、`0ac1e48f`（视频结果发画布真实比例）——两者均为 HEAD 祖先，`git merge-base --is-ancestor` 双绿 |

三闸全部在该 commit 的**固定内容**上执行，与运行期间的并发工作树无关。

## 2. HEAD 变动与"源码稳定性"（明确范围）

本次运行观测到源码区在变动，已按"固定当前 HEAD 验收"处理：

| 时刻 (+0800) | 事件 |
| --- | --- |
| 12:19 左右 | 首次读数 HEAD = `31023507`（`audit(r23)...`） |
| 12:21:28 | 并发 worker 对该 commit 执行 **amend** → HEAD = `c4b3611a`（reflog: `commit (amend)`）；新增 16 个 audit 产物文件，**`web/src` 字节零变化**（`git diff --stat 31023507 c4b3611a -- web/src` 输出为空） |
| 12:22 | **PIN** `c4b3611a`，`git archive` 出隔离快照并逐 blob 校验 |
| 12:22–12:23 | 三闸在快照上全部跑完（见 §4） |
| **12:24:37** | 另一 worker 开始改主工作树 `web/src/components/tools/tool-result-actions.ts`（`M`，+126/−10）——**在快照之外，不参与判定** |

结论范围：**本报告只对 `c4b3611a` 的提交内容负责**；12:24 之后主工作树的未提交修改（以及此后任何 commit）不在本报告结论内。原样存档见 [logs/working-tree-status.txt](./logs/working-tree-status.txt)。

## 3. 隔离方式（git archive，不混入其他 worker）

```
cd /Users/mac/Documents/Dev/infinite-canvas
git archive --format=tar HEAD | tee /private/tmp/ic-r24-head.tar | tar -x -C /private/tmp/icw-r24-head
```

- 快照文件数 **3676**，与 `git ls-tree -r c4b3611a | wc -l` = **3676** 完全一致；无 `.git`、无 `node_modules`。
- archive sha256 `48c97cfb29931249354111918abf2ff85b6e95b61e550afe6e2495992bf94431`，439,418,880 B。
- **逐 blob 字节校验**（git blob SHA-1 = `sha1("blob <len>\0"+content)` 与文件实算对比）：
  - `web/src`：**408 检查 / 408 一致 / 0 缺失 / 0 不一致**
  - 全树：**3676 检查 / 3676 一致 / 0 缺失 / 0 不一致**
  → 跑测源码与 PIN commit 字节级相同。
- 依赖独立安装：快照内 `web/` 执行 `bun install --frozen-lockfile` → **931 packages installed [2.38s]**，`node_modules` 701M。
- 工具链：`bun 1.4.2`、`typescript 5.9.3`（`node_modules/.bin/tsc --version`）、`vite 7.3.6`；机器 PATH 无 node（不影响 bun/vite）。

## 4. 三闸结果（exit code 取自进程真实 `$?`）

| 闸门 | 命令（cwd = 快照 `web`） | 退出码 | 耗时 | 关键数字 | 日志 |
| --- | --- | --- | --- | --- | --- |
| typecheck | `bun run typecheck`（`tsc --noEmit`） | **0** | 22.26s | `error TS` = **0**，无诊断输出 | [typecheck.log](./logs/typecheck.log) / [.exit](./logs/typecheck.exit) |
| — 非空跑证明 | `./node_modules/.bin/tsc --noEmit --listFiles` | **0** | 3.64s | 入编译 **3440** 文件，其中 **407** 来自 `web/src/`，`error TS` = **0** | [tsc-listfiles.log](./logs/tsc-listfiles.log) |
| 全量单测 | `bun test` | **0** | 2.55s | **1509 pass / 0 fail / 0 skip / 0 todo**，**8431 expect()**，**87 个测试文件** | [buntest.log](./logs/buntest.log) |
| build | `bun run build`（`vite build`） | **0** | 23.99s（vite 自报；进程 real 25.97s） | `✓ 8830 modules transformed` · `✓ built in 23.99s` | [build.log](./logs/build.log) |

单测口径校验（防"空跑/漏跑"）：

- 从日志逐行解析出 **87 个不同的测试文件头**（清单 [logs/testfiles.txt](./logs/testfiles.txt)），无 0 用例文件；逐文件 pass 合计 = **1509**，与汇总行一致。
- `bunfig.toml` 的 `pathIgnorePatterns = ["**/*.spec.ts"]` 生效：日志中 `Playwright Test did not expect...` 出现 **0** 次（E2E 未被误收，E2E 不属本次范围）。

build 产物：`dist` **42M / 443 文件**（清单 [logs/dist-files.txt](./logs/dist-files.txt)）

| 产物 | 文件 | 字节 |
| --- | --- | --- |
| 主 JS | `assets/index-BNvVASBg.js` | 5,614,227（日志 5,614.23 kB，gzip 1,708.50 kB） |
| 主 CSS | `assets/index-Bi0Yw3LF.css` | 159,773（gzip 25.90 kB） |
| 入口 | `index.html` | 1050 |

非空壳抽查：`index.html` 正确引用 `/assets/index-BNvVASBg.js` 与 CSS、`<title>无限画布</title>`；bundle 内 `AI_VIDEO_EDITING` 命中 8 行、`IMAGE_TRANSLATION` 命中，即工具路由真实打包进去。

## 5. 重点覆盖的两笔提交（独立运行证据）

| commit | 内容 | 独立证据 |
| --- | --- | --- |
| `a9d66329` | 草稿分槽恢复：两上传区各占槽位、参考图 id 落盘、旧草稿按 mime 归位 | `src/features/tools/adapters/ai-video-editing.test.ts` **42 pass / 0 fail**；`src/lib/canvas/video-meta-reconcile.test.ts`（同批视频链路）**10 pass** |
| `0ac1e48f` | 视频结果发画布不再写 1280×720 兜底，按真实比例建框并可后台校正 | `src/components/tools/tool-result-actions.video-frame.test.ts` **5 pass / 0 fail**；源码复核 `tool-result-actions.ts:485` 注释与实现一致（"拿到就按真实比例建框…绝不写 1280×720"），`video-meta-reconcile.ts` 导出 `videoNodeFrame / fitVideoNodeToNatural / reconcileVideoNodeMeta` |

**幂等/复现性对抗探测**：上述 3 个文件连跑两次 → 两次均 **57 pass / 0 fail / 204 expect()**，结果确定，无 flaky。

## 6. 范围约束核查（只做 39 工具必要功能）

| 检查 | 命令/方式 | 结果 |
| --- | --- | --- |
| 工具数恰为 39 | 运行时 import `src/features/tools/registry/index.ts` 统计 | `TOOLS`=**39**、`toolSpecs`=**39**、`toolsById`=**39**、`toolsByRoute`=**39**、`BATCH_TOOL_IDS`=12、分类=5 |
| 注册完整性 | `bun test src/features/tools/registry/registry.test.ts` | **18 pass / 0 fail / 1622 expect**（含"39 个工具的适配器全部注册，没有重复 id"） |
| 不新增积分/个人中心/学习中心 | `grep -rn "积分\|个人中心\|学习中心" src`（7 命中，全为"断言不出现"或"不显示"注释） | 无新增入口；`app-top-nav.test.tsx` 断言 html 不含三者 |
| UI 对齐无限画布 | `bun test src/components/layout/app-top-nav.test.tsx` | **3 pass / 0 fail**（含"uses the canvas shell chrome instead of pixel-copied metrics"） |

## 7. 未做 / 明确不覆盖

- 未做任何真实模型调用与本地产物生成（按要求"不生成"）；三闸均为编译/单测/打包。
- 未做 Playwright E2E、真实浏览器 UI 截图验收（不在本次三闸范围）。
- 未触碰主工作树 `src`，未提交除本报告目录以外的任何文件。
- `c4b3611a` 之后主工作树的并发修改（12:24:37 起 `tool-result-actions.ts`）**不在结论内**，需要下一轮基于新 commit 复验。

## 8. 裁定

| 闸门 | 结果 |
| --- | --- |
| typecheck | PASS（exit 0，0 error，407 个 src 文件真实入编译） |
| 全量单测 | PASS（exit 0，1509/1509，87 文件，0 fail） |
| build | PASS（exit 0，built in 23.99s，443 文件产物，非空壳） |

**VERDICT: PASS（3/3）· 范围 = commit `c4b3611a` 的提交内容**
