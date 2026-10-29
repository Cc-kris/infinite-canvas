# 验证回执：快照 c8c8ce9e（VIDEO_CONCAT submit/poll 时间预算）

- 日期：2026-10-29
- 验证对象（固定快照，不追 HEAD）：`c8c8ce9e6f09785eb01b73657dc746e0abebb478`
  - `fix(video): give submit/poll a time budget so VIDEO_CONCAT cannot hang in submitting`，提交时间 2026-10-29 23:18:15 +0800，VERSION=v0.27.0
- 验证时仓库真实 HEAD：`43f61e8852ba8d94c7cc062dd4e4a6b00f502acc`（2026-10-29 23:26:35 +0800）——**HEAD 已领先快照，本次不验证 HEAD**
- 隔离方式：`git archive c8c8ce9e | tar -x -C /tmp/ic-verify-c8c8ce9e`（3565 个文件），依赖用 `cp -Rc` 从仓库 `web/node_modules` APFS 克隆（1.2G），不改动工作区
- 环境：bun 1.4.2（`~/.bun/bin/bun`）、node v26.11.0、macOS

## 一、三闸（web 目录）

| 闸 | 命令 | 退出码 | 耗时 | 结果 |
|---|---|---|---|---|
| typecheck | `./node_modules/.bin/tsc --noEmit` | **0** | 45s | 日志 0 行（无任何诊断） |
| test | `bun test` | **0** | 3.83s | **1485 pass / 0 fail**，8352 expect()，84 files |
| build | `bun run build`（vite 7.3.7） | **0** | 48s（vite 自身 44.70s） | dist 37M，`index-DvH676Eh.js` 5,954.76 kB → gzip 1,825.12 kB，仅 chunk>500kB 提示 |

原始日志：`/tmp/ic-logs-c8c8ce9e/{typecheck.log,buntest.log,build.log,build.exit,targeted.log,probe.log}`

## 二、VIDEO_CONCAT submit/poll 预算回归（重点）

### 2.1 定向单测（快照自带）
`bun test src/services/api/video.submit-plan.test.ts src/features/tools/adapters/video-concat.test.ts`
→ 退出码 **0**，**61 pass / 0 fail**（221ms），含本提交新增的「time budget 形状」用例。

### 2.2 真实行为探针（非单测，拦截真实模块的 axios）
在隔离目录内用 `bun:test mock.module("axios")` 真跑 `createVideoGenerationTask` / `pollVideoGenerationTask`，观察 axios 实际收到的 config 与重试次数（探针文件只在 /tmp，未入库）：

| 检查 | 期望 | 实测 | 结论 |
|---|---|---|---|
| A 提交 `POST /v1/videos` 的 `timeout` | `VIDEO_SUBMIT_TIMEOUT_MS` | `timeout=180000` | PASS |
| B 连接层超时（ECONNABORTED）重试次数 | 不重试 = 1 次 | `calls=1` | PASS |
| C 轮询 `GET /v1/videos/{id}` 的 `timeout` | `VIDEO_POLL_TIMEOUT_MS`；queued → pending | `timeout=60000`，`state={"status":"pending"}` | PASS |
| D 502 仍按瞬时故障重试 | 3 次 | `calls=3` | PASS |

→ **4 pass / 0 fail**（9 expect）。即「提交 180s / 轮询 60s 且超时不重试、502 仍重试 3 次」在快照里是真实成立的行为，不是仅注释/常量。

说明：`inline-image.ts` 的 10s 解码预算依赖 DOM `Image`，bun 环境无法覆盖，本次仅做代码确认（`setTimeout(...,10_000)` + `clearTimeout`），未列入实测结论。

## 三、是否需要修复

三闸全绿 + 定向回归全绿 + 行为探针 4/4，**未发现本提交引入的回归，本轮未改动任何源码**。HEAD（43f61e88）新增内容不在本次验证范围。

## 四、风险与备注

- 单测与探针均在 `git archive` 快照 + 克隆依赖上运行，与仓库工作区的未提交改动（project_memory.md、多个 `.worker-*` 未跟踪目录）完全隔离。
- vite 的 zod `@__PURE__` 注释告警与 chunk 体积告警为既有噪声，不阻断构建。
- 探针依赖 `mock.module` 替换 axios；真实网络超时路径（180s/60s 实际触发）未联网验证，只验证了配置下传与重试分支。
