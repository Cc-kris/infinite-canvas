# 并行子任务公共规则（LinkFox 视觉收口，2026-11-05）

仓库 `/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`。开工前先读根目录 `AGENTS.md` 和 `docs/V1.0/e2e-1to1/20261105/VISUAL-PARITY.md`。

## 环境

- 本地 dev server 已在 `http://127.0.0.1:3000` 运行（Vite HMR）。**不要重启、不要另起 dev server**。
- 多个子任务同时在改同一个仓库。别人改了的文件你会在 HMR 里看到，这是正常的。
- 浏览器只用 `ego-browser`（先运行 `ego-browser skill` 读用法）。**每个子任务用自己的任务空间名**（brief 里给了），不要碰别人的空间，不要关用户已有的标签页。结束时 `task.finish({ keep: [] })`。
- 原站 `https://www.linkfox.com` 在 ego-browser 里是登录态。对原站**只读**：可以打开页面、点开弹层、量 DOM、截图；**不要点「立即生成 / 开始生成」，不要提交任何任务，不要改账号设置**。

## 文件归属（最重要）

- 只改 brief 里列给你的文件，以及你自己新建的文件。其他文件一律不碰；如果确实需要改别人的文件，在报告里写明需要改什么，由主代理处理。
- 同一个文件可能被两个子任务各改一部分（brief 会写清楚你负责哪个导出组件）。**只用精确字符串替换做局部修改，不要整文件重写或格式化**，避免覆盖别人的并发改动。改之前重新读一次文件。
- 不要改：`tool-case-guide.tsx`、`tool-cases.tsx`、`tool-workspace-columns.tsx`、`tool-page.tsx`、`globals.css`、`orig-rail.tsx`、`CHANGELOG.md`、`docs/content/docs/progress/*`。
- **不要执行任何 git 写操作**（add / commit / stash / checkout / reset）。主代理统一审查和提交。

## 可复用的东西

- 结果区空态案例轮播：`web/src/components/tools/tool-case-guide.tsx` 的 `ToolCaseGuide`，数据是 `ToolCase`（`params` = 输入图，`result` = 结果图，`apply.files` = 做同款要入库的素材）。做同款回调沿用各工作区已有的 `applyCase`，没有就仿照 `color-v2.tsx` / `pod.tsx` 的写法（`uploadCaseFiles` 真实入库再回填）。
- 已有案例数据：`web/src/features/tools/tool-cases-data.ts`、`suite6-cases-data.ts`、`image-to-video-cases-data.ts`、`video-replication-cases-data.ts`，图片在 `web/public/__cases/<tool-slug>/`。
- 缺案例图时：在原站登录态下打开该工具页，从空态轮播 / 「或试试这些」/ 优秀案例里取真实图片 URL，下载到 `web/public/__cases/<tool-slug>/`，数据追加到 `tool-cases-data.ts` 末尾（新建自己的导出常量，不改别人的常量）。不要用占位图、渐变块、AI 生成图冒充案例。
- 截图对照：`web/scripts/real-acceptance/visual-parity-capture.mjs`。把脚本复制到 `/tmp/<你的空间名>-capture.mjs`，改顶部 `ONLY = [你的工具 ID]`、`SPACE = "<你的空间名>"`、`SIDES = ["local"]`（原站截图已有，只重采本地），然后 `ego-browser nodejs < /tmp/<你的空间名>-capture.mjs`；再 `python3 web/scripts/real-acceptance/visual-parity-pair.py <TOOL_ID>` 生成 `pair.jpg`，用 Read 看图对照。原站截图在 `docs/V1.0/e2e-1to1/20261105/<TOOL>/original.png`。

## 约定

- 遵循 AGENTS.md：中文文案；Tailwind className；lucide-react 图标；最少代码；不新增只做转发的组件；不新增超时/重试/大小限制等边界值。
- 原站的计费、算力、营销角标、客服浮窗、新手引导气泡不复刻。
- 不伪造能力：本地没有的账号能力（商品库、团队空间）保持诚实空态或禁用。

## 完成标准与报告

1. `cd web && npx tsc --noEmit -p .` 无错误（若错误来自别人正在改的文件，在报告里注明，不要去修）。
2. `cd web && bun test <你改动相关的测试文件>` 通过；改了文案导致既有断言失败时，更新断言以匹配原站真实文案。
3. 每个负责的工具重采本地截图并看 `pair.jpg`，确认差异已收口。
4. 把报告写到 `docs/V1.0/e2e-1to1/20261105/agents/<你的空间名>.md`：改了哪些文件、每个工具前后对比结论、仍未收口的差异和原因、测试命令与结果。
5. 最终回复给主代理：报告路径 + 3～8 行要点（改动文件清单、测试结果、未完成项）。
