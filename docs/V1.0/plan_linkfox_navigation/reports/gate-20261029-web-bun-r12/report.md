# Web 三闸 Gate 报告（typecheck / test / build）— 2026-10-29 r12

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- 分支：`feat/linkfox-v1-real`
- 开跑时 HEAD：`06f6f5353ad54c9024f730ec56d4d6ba58132276`（2026-10-29T19:59:20+08:00）
- 收尾时 HEAD：`3c9d81aba1f2cb843157baa917477ad85a038b9a`
- 执行完成时间（UTC）：2026-10-29T12:05Z 前后
- 工具链：bun `1.4.2 (744846f84)`；vite `7.3.7`；命令在 `web/` 目录执行

## 0. 结论

| 闸 | 命令 | 结果 | 退出码 | 耗时 |
|---|---|---|---|---|
| 类型检查 | `bun run typecheck` (= `tsc --noEmit`) | **PASS** | 0 | < 60s（无输出即无错） |
| 单测 | `bun test` | **PASS**：1457 pass / 0 fail / 8268 expect()，82 个文件 | 0 | 4.62s（进程含加载 ~数秒） |
| 构建 | `bun run build` (= `vite build`) | **PASS**：✓ built in 1m 7s | 0 | 67s |

**本轮无新增回归，因此未修改任何源码文件**（`git status --short -- web` 中除历史未跟踪的临时脚本外无源码改动；构建产物 `web/dist` 为 gitignore 目录）。

## 1. HEAD 位移说明（重要，如实记录）

跑闸期间其他 worker 在提交证据文档，HEAD 从 `06f6f53` 前进到 `3c9d81a`（两次 evidence commit：`7664498`、`3c9d81a`）。
已验证被测源码完全一致：

```
$ git diff --stat 06f6f53..HEAD -- web/src web/package.json web/tests
（输出为空）
```

即：`06f6f53 → 3c9d81a` 之间没有任何 `web/src`、`web/tests`、`web/package.json` 变更，故上述三闸结果对当前 HEAD `3c9d81a` 同样成立。

## 2. 原始输出（摘录，全文见 `evidence/`）

### 2.1 typecheck

```
$ tsc --noEmit
TYPECHECK_EXIT=0
```

### 2.2 test

```
bun test v1.4.2 (744846f84)

 1457 pass
 0 fail
 8268 expect() calls
Ran 1457 tests across 82 files. [4.62s]
EXIT=0
```

### 2.3 build

```
$ vite build
vite v7.3.7 building client environment for production...
computing gzip size...
dist/plugins/index.json                    0.00 kB │ gzip:   0.02 kB
dist/index.html                            1.05 kB │ gzip:   0.57 kB
dist/assets/index-MCAOPxSD.css            159.74 kB │ gzip:  26.20 kB
dist/assets/highlighted-body-OFNGDK62-wx9j7mZs.js  0.44 kB │ gzip: 0.31 kB
dist/assets/index-Dg32-PYU.js           5,942.77 kB │ gzip: 1,846.85 kB
✓ built in 1m 7s
EXIT=0
```

产物指纹（sha256）：

```
ef1fe367c369eba420ac4e32b0beda5e7c26f020acb2674eb3ed7d1b2d14d78b  web/dist/assets/index-Dg32-PYU.js
f2f3f9d64c1b898a683a9d279170c9d3be9e63d5db67b6e6b9bc57db6a667561  web/dist/assets/index-MCAOPxSD.css
```

## 3. 非阻塞告警（历史既有，非本轮新增）

1. `node_modules/zod/v4/core/{regexes,util}.js` 中 `@__PURE__` 注释位置导致 Rollup 无法识别 → 注释被丢弃，功能无影响。
2. 多个模块同时被静态与动态 import，Vite 提示“dynamic import 不会拆分 chunk”：`src/lib/canvas/canvas-node-factory.ts`、`src/stores/canvas/use-canvas-store.ts`、`file-saver`、`src/lib/zip.ts`（源自 `tool-result-actions.ts`）。
3. 主 chunk > 500 kB（`index-Dg32-PYU.js` 5.94 MB / gzip 1.85 MB）——体积优化项，非正确性问题。

以上均不影响三闸通过，也不需在本轮修复（避免触碰其他 worker 的文件）。

## 4. 复现命令

```bash
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"   # 本机默认 PATH 被裁剪，bun 在 ~/.bun/bin
cd /Users/mac/Documents/Dev/infinite-canvas/web
bun run typecheck; echo "EXIT=$?"
bun test;           echo "EXIT=$?"
bun run build;      echo "EXIT=$?"
```

## 5. 证据文件

| 文件 | 说明 | sha256 |
|---|---|---|
| `evidence/test-output.txt` | `bun test` 完整输出（160 KB） | `28574e11ad5afb7af99ba4a403de57e2d40f46a89b178f08ae4386b8b7508060` |
| `evidence/build-output.txt` | `vite build` 完整输出（25 KB） | `d9271e0be7b464348a8244dcea25b560f7076ab8f3b944cb52e10240524c878d` |

> 注：仓库 `.gitignore` 含 `*.log`，故原始日志以 `.txt` 后缀入库（内容逐字节一致，sha256 可校验）。

typecheck 无输出（`tsc --noEmit` 静默成功），退出码 0 已在本报告 2.1 记录。

## 6. 边界声明

- 未派发子 worker、未读调度 SOP。
- 仅新增本报告目录（`reports/gate-20261029-web-bun-r12/`），未改动任何 `web/src`、`web/tests` 或其他 worker 的文档/证据。
