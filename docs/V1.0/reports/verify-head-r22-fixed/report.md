# 固定 HEAD 独立三闸验证（r22 · typecheck / 全量单测 / build）

日期：2026-10-30 · 执行：Physical-Level Executor（无子 worker、未真实生成、未改 `src`）

机器可读摘要：[summary.json](./summary.json) · 原始日志：[logs/](./logs/)

## 1. 被测对象（git 事实，非工作树快照）

| 项 | 值 |
| --- | --- |
| 仓库 | `/Users/mac/Documents/Dev/infinite-canvas` |
| 分支 | `feat/linkfox-v1-real` |
| **固定 HEAD（被测 commit）** | `382cebf6485d063284f285e8e9f5b566b5b48088` |
| commit 时间 / 标题 | 2026-10-30 12:00:02 +0800 · `verify(r22-h): IMAGE_TEXT_EDIT 真实任务五路字节对账 PASS（结果/面板下载/存资产/发画布/资产卡下载同一 sha256）` |
| **commit tree hash** | `a5671a03fcc02416ade3a4b7f08edc6e2fc084f0` |
| **`web/src` tree hash** | `79208e3cd1746af049efae4129f66a4dfcf3a5bc`（405 个文件） |
| `web` tree hash | `729b29e0743f893f6512e11ce2e310558aeeb655` |

三闸全部在该 commit 的**固定内容**上执行，与运行时的并发工作树无关。

## 2. 隔离方式（不触碰当前工作树）

```
cd /Users/mac/Documents/Dev/infinite-canvas
git archive 382cebf6 | tee /private/tmp/ic-r22-head.tar | tar -x -C /private/tmp/icw-r22-head
```

- 快照文件数 **3638**，与 `git ls-tree -r 382cebf6 | wc -l` = **3638** 完全对齐；无 `.git`。
- archive：sha256 `78ae6b78ec533a3dac0b63e7436dd124c1e9698e1fddbd0596d095329e76cb03`，436,879,360 B。
- **逐 blob 校验**：把 HEAD 的 `web/src` 全部 405 个 blob 的 git SHA-1 与快照文件实算 SHA-1 对比 —— **405 检查 / 0 缺失 / 0 不一致**，即跑测的源码与固定 HEAD 字节级一致。
- 依赖独立安装：`web/` 内 `bun install --frozen-lockfile` → **931 packages installed [2.76s]**，`node_modules` 701M（[install.log](./logs/install.log)）。
- 运行环境：`bun 1.4.2`、`node v24.14.0`、`typescript 5.9.3`、`vite 7.3.x`（非登录 shell 无 node/pnpm/bun，需显式 `export PATH=$HOME/.bun/bin:…`）。

### 并发工作树（显式排除，未混入结论）

运行前三闸记录到主工作树存在其他 worker 的未提交修改，全部**不参与**本次判定（原样存档：[logs/working-tree-status.txt](./logs/working-tree-status.txt)）：

```
 M web/src/components/tools/workspaces/video.tsx
 M web/src/features/tools/adapters/ai-video-editing.test.ts
 M web/src/features/tools/registry/ai-video-editing.ts
```

## 3. 测试入口选择（避免错误入口）

- 项目入口即 `web/package.json` → `"test": "bun test"`；`web/bunfig.toml` 已配置 `pathIgnorePatterns = ["**/*.spec.ts"]`，**Playwright（`web/tests/tools-*.spec.ts`，testDir `./tests`）不会被 bun 内置收集**。
- 实测日志中 `Playwright Test did not expect...` 出现次数 = **0**，无 E2E 文件被误当单测执行。
- E2E（Playwright）不属于本次三闸范围，未执行。
- `pnpm`（10.33.1）可用，但本项目脚本为 bun/vite 驱动；`tsc --noEmit` 与 `vite build` 本身与包管理器无关，故沿用项目入口。

## 4. 三闸结果（退出码取自进程真实 `$?`）

| 闸门 | 命令（cwd = `web`） | 退出码 | 耗时 | 关键数字 | 日志 |
| --- | --- | --- | --- | --- | --- |
| typecheck | `bun run typecheck`（`tsc --noEmit`） | **0** | 36.2s | `error TS` = **0**，无诊断输出 | [typecheck.log](./logs/typecheck.log) |
| — 非空跑证明 | `./node_modules/.bin/tsc --noEmit --listFiles` | **0** | ~5s | 入编译 **3437** 文件，其中 **404** 来自 `web/src/`，`error TS` = **0** | [tsc-listfiles.log](./logs/tsc-listfiles.log) |
| 全量单测 | `bun test` | **0** | 3.40s | **1493 pass / 0 fail / 8374 expect() / 85 个测试文件** | [buntest.log](./logs/buntest.log) |
| build | `bun run build`（`vite build`） | **0** | 27.13s | `✓ built in 27.13s`；`dist` 42M / **443 文件** | [build.log](./logs/build.log) |

build 产物明细：

| 产物 | 字节 |
| --- | --- |
| `dist/assets/index-BT-ryNDQ.js` | 5,609,588 |
| `dist/assets/index-Bi0Yw3LF.css` | 159,773 |
| `dist/assets/highlighted-body-OFNGDK62-m_kyN6jP.js` | 439 |
| `dist/index.html` | 1,050 |

## 5. 结论

**PASS — 固定 HEAD `382cebf6` 三闸全绿（3/3 exit 0）**，源码侧零改动、零真实生成、零 worker 派发。

- 单测总数 **1493**（85 文件），失败 0；相比上一轮记录 `03b8f47e` 的 1483 pass / 84 文件，本轮 +10 tests / +1 文件，属 HEAD 前移的正常增量。
- 编译覆盖 404 个 `web/src` 文件（上一轮 403，+1），typecheck 仍 0 诊断。

## 6. 残留记录（如实登记，未展开）

1. build 出现既有告警：`src/lib/zip.ts`、`use-canvas-store.ts`、`file-saver` 的「动态导入 + 静态导入同模块」与主 chunk > 500 kB 提示。均为既有现象（上一轮同现），非本 commit 引入，退出码 0。
2. 主 chunk 文件名与上一轮不同（`index-BT-ryNDQ.js`），因 HEAD 前移（含 IMAGE_TEXT_EDIT 相关改动），未做 bundle 级差异分析。
3. 依赖安装复用本机 bun 全局缓存，未联网重新解析；`--frozen-lockfile` 保证版本与 lock 一致。
4. 本次未执行 Playwright E2E、未做 UI 验收、未调用任何真实生成接口（按任务约束）。

## 7. 复现命令

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
rm -rf /private/tmp/icw-r22-head && mkdir -p /private/tmp/icw-r22-head
git archive 382cebf6485d063284f285e8e9f5b566b5b48088 | tar -x -C /private/tmp/icw-r22-head
cd /private/tmp/icw-r22-head/web
export PATH=$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH
bun install --frozen-lockfile                    # 931 packages
bun run typecheck;  echo "TYPECHECK=$?"          # 0
bun test;           echo "TEST=$?"               # 1493 pass / 0 fail / 85 files
bun run build;      echo "BUILD=$?"              # built in 27.13s
```
