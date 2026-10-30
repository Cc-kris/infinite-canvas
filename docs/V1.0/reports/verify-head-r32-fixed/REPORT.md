# 固定 HEAD 独立四闸验证（r32 · VT i18n 收口 + SEED_V25 接线）

日期：2026-10-30
验证者：独立验证 worker（lf_r32_gate_recovery，DeepSeek；未参与任何被测代码编写）
分支：`feat/linkfox-v1-real`
结论：**PASS**（四闸全绿 + 定向闸门全绿）；**VT 真实生成能力仍为 FAIL/BLOCKED（上游渠道未开通模型），本报告不做任何「已打通」的表述**

## 1. 精确 PIN

| 项 | 值 |
| --- | --- |
| **PIN commit** | `f53da52afc2279701e816e9ae43a19ae66f22e63` |
| tree | `e3cfa171f2d6341f4ef855f93adb08ea8117210e` |
| `HEAD:web` tree | `61392c0ef360d2a650e950f4d7cf34695926000a` |
| 归档 tar sha256 | `e5798a4d75d82922f68a31679053341fcaa5c4b56e7c39dfdd8a92224ba177a7` |
| 归档文件数 / 大小 | 3950 个文件 / 436 MB |
| 提交时间 | 2026-10-30 14:37:05 +0800 |

PIN 的祖先链（本次要求必须包含的三项全部在链上，已用 `git merge-base --is-ancestor` 逐个取证）：

```
f53da52a fix(video-translation,i18n): EN 态中文残留清零（状态/结果/历史/侧边栏/面包屑）  ← r30 最终提交
45fe59a6 feat(video-translation): SEED_V25 真路由协议层 + 网关闸门 + JSON 提交          ← r31 最终提交
2b52ba02 docs(audit): R31 独立矩阵重算（39 工具×六维）
c9a33341 docs(verify-r30): 补记 P2 已由 9b208e07 修复并在当前 HEAD 复核 14/0
9b208e07 test(media-auth): 修 ingest-auth 替身泄漏致定向跑 media-auth 假红 + 复现报告      ← auth 修复（必须包含）
```

取证：`git merge-base --is-ancestor 9b208e07 HEAD` / `45fe59a6` / `f53da52a` → 三次均 YES（见 `logs/git-log-pin.txt`、`logs/pin-commit.txt`）。

### 1.1 PIN 时间点主工作区仍有未提交改动（PIN **不含**，必须知情）

```
 M project_memory.md
 M web/src/features/tools/adapters/video-translation.test.ts   (+36 行，+4 个 test 块)
 M web/src/features/tools/adapters/video-translation.ts        (+69/-7 行)
```

这三处是**第三方 WIP**，不是我方（r30/r31）产物，也未进入 PIN。r30 的交付说明明确写「adapter 及其测试属他人 WIP，本次未改也未提交」。
因此：**PIN 快照里 adapter 是旧版，r30/r31 的自测数字是在带 WIP 的工作树上得到的**。本报告第 5 节量化了这一差异，结论是差异可解释、且不影响闸门有效性。

## 2. 隔离方式（不复用主工作区任何产物）

```bash
git archive --format=tar f53da52a... > pin.tar     # 只取 commit 树，不带工作区/WIP/未跟踪文件
shasum -a 256 pin.tar                              # e5798a4d…（见上表）
tar -xf pin.tar -C /tmp/icw-r32f/snap              # 全新空目录
```

- 快照目录 `/tmp/icw-r32f/snap` 内**没有** `node_modules`、`dist`、`.vite`、`node_modules/.cache` 等任何主工作区产物。
- 依赖为全新安装（`web/node_modules` 由 `bun install` 新建，582 个顶层目录 / 701 MB；命中 bun 全局包缓存所以仅 5.90s）。

### 2.1 src blob 逐文件核对（源码同一性）

脚本按 `git ls-tree -r --full-tree <PIN>` 逐个 blob 计算 `sha1("blob <len>\0"+content)` 与快照磁盘文件比对：

```
commit=f53da52afc2279701e816e9ae43a19ae66f22e63
tree entries: 3950  blobs ok=3950 diff=0 missing=0
web/src blobs: ok=420  diff=0 missing=0
non-blob entries: 0
RESULT: PASS
```

即：快照 3950 个文件与 PIN 树**逐字节一致**，其中 `web/src` 420 个 blob 全一致（较 r30 的 416 个 +4：seed-v25 协议层 1 + seed 单测 2 + VT i18n 组件测试 1）。
日志：`logs/blob-verify-head.txt`、`logs/pin.txt`、`logs/pin-tree.txt`、`logs/pin-web-tree.txt`、`logs/pin-commit.txt`、`logs/archive-sha256.txt`。

## 3. 四道闸门（全部在 /tmp/icw-r32f/snap/web 内执行）

| 闸门 | 命令 | 结果 | 耗时 | 日志 |
| --- | --- | --- | --- | --- |
| Gate0 依赖 | `bun install`（空目录，bun 1.4.2） | **931 packages installed**，exit 0 | 5.90s | `logs/gate0-install.log` |
| Gate1 类型 | `bun run typecheck`（`tsc --noEmit`，TS 5.9.3） | **exit 0，0 error** | 2m34s | `logs/gate1-typecheck.log` |
| Gate2 单测 | `bun test` | **1578 pass / 0 fail / 8667 expect / 95 files** | 5.99s | `logs/gate2-bun-test.log` |
| Gate3 构建 | `bun run build`（vite 7.3.6） | **exit 0，8834 modules transformed，built in 1m8s** | 1m11s | `logs/gate3-build.log` |

产物：`dist/` **443 个文件 / 37 MB**（清单 `logs/dist-files.txt`、计数 `logs/dist-files-count.txt`、体积 `logs/dist-size.txt`、`logs/build-summary.txt`）。
环境：bun 1.4.2、node v24.14.0（仅 vite 需要）、macOS (darwin arm64)。

对比 r30 gate（PIN e7826acf）：模块 8833 → 8834（+1，seed-v25 协议层），dist 443 文件同量级；测试 1556 → 1578（+22：seed 16 + i18n 组件 6）。

## 4. 定向闸门

### 4.1 media-auth × ingest-auth：两种文件顺序各跑一遍（本次专项要求）

r30 报告的 P2 是「同进程 `mock.module` 泄漏 → 挑文件跑时 media-auth 假红」。按两种顺序复核 9b208e07 的修法：

| 顺序 | 命令 | 结果 |
| --- | --- | --- |
| A：media-auth 先 | `bun test src/services/media-auth.test.ts src/stores/use-tool-task-store.ingest-auth.test.ts` | **14 pass / 0 fail**，exit 0 |
| B：ingest-auth 先 | `bun test src/stores/use-tool-task-store.ingest-auth.test.ts src/services/media-auth.test.ts` | **14 pass / 0 fail**，exit 0 |
| 单跑 media-auth | `bun test src/services/media-auth.test.ts` | 11 pass / 0 fail |
| 单跑 ingest-auth | `bun test src/stores/use-tool-task-store.ingest-auth.test.ts` | 3 pass / 0 fail |

11 + 3 = 14，两种顺序结果一致 → **顺序敏感问题在 PIN 上已消失**，r30 时代的「顺序侥幸」结论已被修复取代。
修法在位取证：`use-tool-task-store.ingest-auth.test.ts:38` `const realFileStorage = await import("@/services/file-storage")`，`:41` `...realFileStorage`（展开真实导出，不再桩掉整模块）。
日志：`logs/gate2b-orderA-media-first.log`、`logs/gate2b-orderB-ingest-first.log`、`logs/gate2b-single-media-auth.log`、`logs/gate2b-single-ingest-auth.log`。

### 4.2 VT 相关测试（本次专项要求）

| 范围 | 结果 |
| --- | --- |
| 5 个 VT 测试文件同跑 | **68 pass / 0 fail**（5 files） |
| `src/services/api/video-translation-seed-v25.test.ts` | 12 pass / 0 fail |
| `src/services/api/tools/gateway.video-translation-seed-v25.test.ts` | 4 pass / 0 fail |
| `src/components/tools/workspaces/video-translation-honesty.test.tsx` | 7 pass / 0 fail |
| `src/components/tools/workspaces/video-translation-i18n.test.tsx` | 6 pass / 0 fail |
| `src/features/tools/adapters/video-translation.test.ts` | 39 pass / 0 fail |
| seed 两文件逆序 | 16 pass / 0 fail |

12+4+7+6+39 = 68，逐文件单独跑与同跑一致 → 无跨文件状态耦合。
日志：`logs/gate2c-vt-group.log`、`logs/gate2c-vt-perfile-summary.txt`、各单文件日志。

## 5. 与两位 owner 自报数字的交叉核对（差异全部量化解释）

| 自报 | 自报值 | 本闸门（PIN） | 差异归因 |
| --- | --- | --- | --- |
| r30 单测 | 1582 pass / 0 fail | **1578 pass / 0 fail** | 差 4 = 未提交 WIP `adapters/video-translation.test.ts` 新增的 4 个 test 块（`git diff` 实测 `+4` 个 `test(`/`it(` 行）。PIN 不含 WIP → 1578 是 PIN 真实值。**r30 的 1582 数字本身没错，只是含他人 WIP**。 |
| r31 回归 | 1581 pass / **1 fail**（VT i18n EN 中文用例）；tsc 报错 `video-translation-i18n.test.tsx(60,31)` | **1578 pass / 0 fail**；tsc 0 error | r31 跑测时 r30 的 UI/i18n 改动还在工作区未提交，造成跨文件污染；r30 于 14:37 提交后污染消失。**PIN 上两处问题均不复存在**，这是本次闸门最重要的正向结论。 |
| r31 定向 | 16 pass / 0 fail | 16 pass / 0 fail（正序与逆序） | 一致 |
| r30 构建 | 成功 | exit 0 / 8834 模块 / 443 dist 文件 | 一致 |
| r30 类型 | PASS | tsc exit 0 | 一致（r31 报的 tsc 错已消解） |

## 6. 能力结论（不夸大）

1. **VT i18n 收口**：PIN 上 `video-translation-i18n.test.tsx` 6/6 绿，全量 0 fail；组件级断言（EN 态不出现中文）在隔离环境通过。r30 附真实浏览器取证 `docs/r32-video-translation-i18n-evidence.json`：1280×EN 中文可见行 **17 → 2**（剩余为语言下拉的原生语名与历史任务固化的中文提示词），1280/390 三次运行 `horizontalOverflow` 均为 false；其中两次 390 宽的运行只记录溢出、未记 CJK 行数。
   ⚠️ **本闸门未复跑浏览器视觉验收**（仅跑测试与构建）；该 JSON 是 r30 在提交前于主工作区采集的，本报告仅记录其存在与结论，不作为我的独立取证。
2. **SEED_V25 真路由**：协议层/网关闸门/JSON-only 提交/404 归一在 PIN 上有 16 个单测覆盖并通过。
3. **真实生成仍 BLOCKED**：按 r31 报告与代码闸门，当前 sub2 渠道只声明 `MiniMax-H3`，提交前即抛 `seed-v25-model-unavailable`（provider 零调用）；注入声明后真实请求被上游拒 `Model "doubao-seedance-2-5" is not available for this group`，终态 `failed`、`retryable=false`、`upstreamTaskId=null`，未产生任务、未扣费、未换模型。
   → 因此 **VIDEO_TRANSLATION 的「真出片」能力维持 FAIL/BLOCKED**，本次 PIN 只是把接线与诚实降级做实。按任务约束，我未做任何真实生成、未换模型、未读密钥，故**不能**独立复证上游回执，只复证「客户端闸门 + 终态语义」这一层。
4. **poll 侧映射未验证**：`mapSeedV25TaskStatus` / `extractSeedV25VideoUrl` 有单测但无真实成片回执对照，首次成功生成后必须复核（沿用 r31 的风险声明）。

## 7. 风险与建议

| 级别 | 项 | 说明 / 建议 |
| --- | --- | --- |
| P0 | 真实生成不可用 | 渠道侧开通 `doubao-seedance-2-5`（SEED_V25）后，跑一次真实生成，核对 taskId / status / videoUrl 字段并记录回执；在此之前对外不得称「视频翻译已可用」。 |
| P1 | 工作区仍有他人 WIP | `adapters/video-translation.ts`(+76/-7) 与测试(+36) 未提交，PIN 不含。若它最终入库，需以新 PIN 重跑本闸门（尤其 adapter 39 例会变成 43 例、全量 1578→1582）。 |
| P1 | 组件测试运行时长极短 | 全量 1578 例 5.99s（bun 快），已核对日志行数与 expect 数（8667）确认真实执行，非空跑。 |
| P2 | dist 主 chunk >500 kB | vite 已告警，长期建议 manualChunks 拆分（不影响本次验收）。 |
| P2 | i18n 文案键膨胀 | 本次新增 `toolChrome.*` 等约 200 键/语言，建议后续加 key 一致性校验测试（en/zh key 集合对齐）。 |

## 8. 复现命令（任何人可原样重跑）

```bash
PIN=f53da52afc2279701e816e9ae43a19ae66f22e63
mkdir -p /tmp/repro && cd /tmp/repro && rm -rf snap && mkdir snap
git -C <repo> archive --format=tar $PIN | tar -x -C snap
cd snap/web
~/.bun/bin/bun install
~/.bun/bin/bun run typecheck
~/.bun/bin/bun test
~/.bun/bin/bun run build
# 定向
~/.bun/bin/bun test src/services/media-auth.test.ts src/stores/use-tool-task-store.ingest-auth.test.ts
~/.bun/bin/bun test src/stores/use-tool-task-store.ingest-auth.test.ts src/services/media-auth.test.ts
~/.bun/bin/bun test src/services/api/video-translation-seed-v25.test.ts \
  src/services/api/tools/gateway.video-translation-seed-v25.test.ts \
  src/components/tools/workspaces/video-translation-honesty.test.tsx \
  src/components/tools/workspaces/video-translation-i18n.test.tsx \
  src/features/tools/adapters/video-translation.test.ts
```

## 9. 未完成 / UNVERIFIED 声明

- 真实生成链路：**UNVERIFIED**（渠道未开通，按约束不换模型、不嵌套、不扣费）。
- 真实浏览器 UI 视觉：**本闸门未复跑**（列为 r30 取证，见 §6.1）。
- 上游 poll 字段映射：**UNVERIFIED**（无真实成片）。
- 除上述三项，本报告所有数字均来自本次隔离快照的实跑日志，日志原样存放于 `logs/`。

## 10. 使用入口

- 报告：[docs/V1.0/reports/verify-head-r32-fixed/REPORT.md](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/reports/verify-head-r32-fixed/REPORT.md)
- 日志：`docs/V1.0/reports/verify-head-r32-fixed/logs/`
- 机读摘要：[summary.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/reports/verify-head-r32-fixed/summary.json)
- VT 协议层：`web/src/services/api/video-translation-seed-v25.ts`；闸门：`resolveSeedV25Translation`（`web/src/services/api/tools/gateway.ts`）
- VT i18n 文案键：`web/src/i18n/locales/{en-US,zh-CN}.ts` 的 `toolChrome.*` / `videoTranslation.*`
