# 固定 HEAD 独立四闸验证（r29 · install / typecheck / 全量单测 / build）

日期：2026-10-30 · 执行：**DeepSeek worker（单进程物理执行）**
约束遵守：未嵌套派工、未换模型、未读任何密钥、**未修改 `src`**、未触发任何真实生成（无上游调用）。
共享工作树中的他人未提交 UI（`video-translation.tsx` 等 dirty 文件）**未被读取用于判定**，全部结论来自 `git archive` 快照。

## 0. 结论

| 闸 | 结果 | 真实数字 |
|---|---|---|
| Gate A 快照与 blob 核对 | **PASS** | 3835 个 blob 全量 sha1 复算，**3835 ok / 0 diff / 0 missing**；`web/src` 411/411 |
| Gate 0 全新依赖安装 | **PASS** | `bun install --frozen-lockfile`，**931 packages / 4.97s / exit 0** |
| Gate 1 typecheck | **PASS** | `tsc --noEmit` **exit 0 / 0 个 `error TS`**，冷缓存 **278.94s**；编译程序 **3443** 文件，`web/src/**` **410** |
| Gate 2 全量单测 | **PASS** | **1535 pass / 0 fail / 8520 expect() calls**，89 文件，8.77s |
| Gate 3 build | **PASS** | `vite build` **exit 0**，**8831 modules / 443 产物 / dist 37M**，2m43s |
| 定向回归 | **PASS** | `video-translation.test.ts` 39 pass；资产 store 两文件 16 pass；均 0 fail |

失败数：**0**。唯一非零退出码是诊断脚本里 `grep -c "(fail)"` 匹配 0 行（grep 语义，非测试失败），已在日志旁注解。

## 1. 固定提交与隔离快照

```
pin          454fa580d8f57aee59340e73a672d78b953a42d4
             test(video-translation): r26 真实上游复验——语言契约压住「朗读提示词」，但 zh 未生效
tree         4e88dbf3b1d3a7e006a9d6a95714a3ccb6247d55
web tree     544e02cb1f4f7ea646fe39dd597261bf842c1a07
web/src tree 0d580a572138ccbec13ff76e019076b9058c0fa7
archive      git archive 454fa580 | tar -x -C /private/tmp/icw-r29-head   （428M）
tar sha256   de79d24078c7ede327a2ed4d6c49e67c74fb26f1f010f6fd400c72f9c8926c05
```

**运行期间 HEAD 前移**：并行 worker 在验收途中提交了 `bd71498f`（r27-aspect 真实验收证据）。处置：
- 快照改为**显式 pin `454fa580`**（不用 `HEAD`），保证与用户指定提交严格一致；
- 复核 `git diff --stat 454fa580..HEAD -- web web/package.json web/bun.lock` → **空**，该提交只新增 9 个 `docs/.../r27-aspect/*` 证据文件，`web/` 字节未变；
- 因此四闸结论对 `454fa580` 与当前 HEAD 的 `web` 代码同样成立。

快照**未使用** node_modules 软链（与 r28 不同），`web/node_modules` 在快照内全新生成，不存在复用他人依赖树。

### 1.1 blob 全量核对

`git ls-tree -r 454fa580` 共 **3835** 个条目（0 个 symlink），对快照逐文件按 git blob 口径（`sha1("blob <len>\0"+bytes)`）复算：

```
blob verify: total=3835 ok=3835 diff=0 missing=0
blob verify web/src: ok=411 total=411
```

即快照内容与提交树**逐字节一致**，不存在 archive 过滤/换行导致的偏差。

## 2. Gate 1 · typecheck（非空跑证明）

`tsc --noEmit` 一次冷启动：`real 278.94s`，`__EXIT__=0`，日志中 `error TS` 计数 **0**。
（r26 同机 369s，本轮更快，原因是本轮 tsc 版本 5.9.3 + 全新依赖树但机器负载不同；均为一次通过，无重试。）

另跑 `tsc --noEmit --listFiles` 取证（9.76s，命中首跑生成的 tsbuildinfo，属增量正常行为）：

```
program_files = 3443
web/src 参与编译 = 410   （263 .ts + 147 .tsx）
error TS = 0
磁盘 web/src 文件 = 411  （差 1 = styles/globals.css，CSS 不在 tsconfig include 的 src/**/*.ts|tsx 内，预期）
```

## 3. Gate 2 · 全量单测

```
1535 pass
0 fail
8520 expect() calls
Ran 1535 tests across 89 files. [8.77s]
real 8.79
__EXIT__=0
```

与 r26 基线（**1514 pass / 0 fail / 88 文件 / 8458 expect / 11.51s**）相比：**+21 用例**、**+1 测试文件**、**+62 expect**，耗时从 11.51s 降到 8.77s（依赖与磁盘缓存差异）。本轮**一次性通过，无 flaky 重跑**。

## 4. 定向回归（用户指定重点）

### 4.1 video-translation

`web/src/features/tools/adapters/video-translation.test.ts`（blob `68fd0c43`）：

```
39 pass / 0 fail / 131 expect() calls / 442ms
```

39 个用例的实际分组（日志逐条核对）：registry 字段与默认值（7 个 provider 字段顺序、默认值、源片规则 MP4/MOV·100MB·2–30s、输出数量夹取）· 语言联动 · 草稿读写 · 原视频校验 · 能力门禁（口型同步/输出数量）· 提示词覆盖与字段完整性审计 · 构建真实请求（关闭口型同步后携带 7 字段 + 1 条参考视频）· 输出画幅（r26 真实源片 1344×768 → 16:9 换 1280×720，不落全局 1:1；读不到尺寸不猜）· 提交与重试 dedupe · 结果视图（成功无视频按失败、改配置后 stale）· workspace 六区域与关键控件文案。
r26 同一文件为 30 pass / 85 expect，本轮 **39 pass / 131 expect（+9 用例 / +46 expect）**，新增集中在输出画幅与提示词审计。

### 4.2 资产 store（跨标签持久化回归）

```
bun test src/stores/asset-store-persist.test.ts src/stores/use-asset-store.key.test.ts
16 pass / 0 fail / 21 expect() calls   exit 0
```

命中的关键用例：`createMergedAssetStorage` 读到最新快照再合并写回（旧快照写入不丢已落库资产）、后写不覆盖先写、墓碑/removeItem 清空、`assetResultKey` 推导口径（resultAssetKey / resultId / 旧 resultItemId 缺省）、非工具结果资产不参与去重。

## 5. Gate 3 · build

```
vite v7.3.6
✓ 8831 modules transformed.
✓ built in 2m 43s
real 165.90  __EXIT__=0
dist: 443 files / 37M
index-hSeU2-No.js 5,622.69 kB │ gzip 1,736.64 kB
```

产物清单见 `logs/dist-files.txt`。告警均为**既有非阻塞**项：
- `zod` 注释位置导致 Rollup 无法解释 `@__PURE__` 注解（注释会被移除，不影响产物）；
- 多处「动态导入同时被静态导入 → dynamic import will not move module into another chunk」（chunk 策略提示，与 `use-asset-store`、`assets.ts` 相关）；
- 单 chunk >500kB 的体积提示（历史一致）。

`error` 计数 0。

## 6. 排除项与边界

`git status --porcelain -- web/src`（验收时）：

```
 M web/src/features/tools/adapters/video-translation.test.ts
 M web/src/features/tools/adapters/video-translation.ts
 M web/src/services/api/video.ts
 M web/src/services/file-storage.ts
 M web/src/stores/use-tool-task-store.ts
?? web/src/services/media-auth.ts
```

以上为**他人未提交 WIP**，未纳入本次判定，也未用于任何结论；快照版 `video-translation.ts/.test.ts`、`use-asset-store.ts` 的 blob 均为提交版（见 `logs/exclusion-uncommitted.txt`，其中 tsx/zh-CN 显示工作树 hash 与 HEAD 不同但 `git status` 为 clean，属 eol/clean 过滤器归一化，非脏改）。

**未验证**：真实上游生成、UI 真机交互、跨标签真浏览器并发（均被本轮约束禁止或无浏览器侧授权）；语言契约的**上游实际生效**仍以 454fa580 提交说明中的「zh 未生效」为已知结论，本轮不重测。

## 7. 复现命令

```bash
export PATH=$HOME/.bun/bin:$PATH
cd /Users/mac/Documents/Dev/infinite-canvas
git archive 454fa580 | tar -x -C /private/tmp/icw-r29-head
cd /private/tmp/icw-r29-head/web
bun install --frozen-lockfile
bun run typecheck
bun test
bun test src/features/tools/adapters/video-translation.test.ts \
        src/stores/asset-store-persist.test.ts src/stores/use-asset-store.key.test.ts
bun run build
```

工具版本：bun 1.4.2 / typescript 5.9.3 / vite 7.3.6 / @vitejs/plugin-react 5.2.0 / bun-types 1.4.4。

日志：`logs/`（install / typecheck / listFiles / bun-test / 定向两个 / build / blob 核对 / 排除项 / dist 清单）。
