# 真实 UI 验收进度（智能修图 8 工具）

分支：`feat/linkfox-v1-real`；仓库：`/Users/mac/Documents/Dev/infinite-canvas`

## 1. 已完成：重复外壳缺陷修复

事实（Playwright 实测，1440px 打开 `/tools/smart-edit/image-crop`）：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 可见 `[data-testid=tool-sidebar]` | 2（x=0 与 x=200） | 1 |
| 可见 `打开工具列表` 按钮（<lg） | 2 | 1 |
| 页头 | 双层（外壳 + 工作台） | 单层 |

修法：`src/components/tools/tool-shell.tsx` 引入 `NestedToolShellContext`。
工作台内部再渲染 `ToolShell` 时只输出紧凑标题栏（`data-testid=tool-workspace-chrome`，
含标题/徽标/操作按钮/提示/children），不再挂第二个 `aside` 与第二个抽屉；
同时给窄屏抽屉入口补了 `data-testid="tool-shell-nav-trigger"`。
覆盖全部 13 个复用 `ToolShell` 的工作台，不需要逐文件改。

## 2. 已完成：768–1023px 导航可达性（结论与旧 spec 前提不同）

实测：`app-top-nav` 的 `[data-testid=tools-nav-primary]` 在 768/900/1023px **可见**，
5 个分类（电商套图/智能修图/批量生图/商品图设计/AI视频）全部落在视口内（x 139–724，vw 768）。
所以"md 档没有全局导航入口"的前提不成立；真正缺的是**可定位、可点开工具列表的入口**。
现在 `tool-shell-nav-trigger` 在 lg 以下常驻，点开即工具侧栏抽屉。

`tests/tools-responsive.spec.ts`：
- 删掉 `SIDEBAR.first()` 规避注释与用法，改为断言"可见侧栏恰好 1 个"；
- 删除 `test.fail(true, "md 档缺少导航入口")`，改为真实交互用例（点开抽屉 → 跳转 image-crop → 抽屉收起）；
- 新增回归用例：1440px 只见 1 个侧栏、0 个窄屏入口；900px 恰好 1 个入口。

测试结果：`tools-responsive` 7/7、`tools-workflow` 9/9 通过；`tsc --noEmit` 通过。

## 3. 真实 UI 验收方法（不使用 mock）

- 浏览器：真 Chrome（Playwright `channel: "chrome"`），真点击、真 `setInputFiles` 上传真实 JPG。
- 上游：请求经本机 canvas-proxy `http://127.0.0.1:23210`，模型 `gpt-image-2`。
  上下文只写入非密钥字段（`proxyEnabled=true`、`proxyUrl`、`channelMode="local"`、`imageModel`），
  渠道与密钥取应用自身 `defaultConfig`，脚本内不出现任何密钥。
- 采集：`web/scripts/real-acceptance/`（`lib.mjs` 公共库、`probe*.mjs` 探针）。

## 3.5 环境实测障碍（2026-10-28 20:0x）

- 本机同时跑 5 个 REAL ACCEPTANCE worker，`uptime` 负载 111–155，
  Vite dev `/tools` 首字节耗时 21.8s → 67s，多个探针因此被判超时。
  结论：验收脚本必须 `setDefaultTimeout(180000)`，且一次只开一个浏览器。
- 建议后续用生产构建 + `vite preview` 跑验收（更快、更贴近真实），
  dev 服务器在 5 worker 并发下不可用于计时类断言。

## 3.6 AREA_REPAIR 蒙版涂抹：已排除项 + 待定项

已用真实 Chrome（channel=chrome）逐项排除：

| 假设 | 实验结果 | 结论 |
| --- | --- | --- |
| 画布未渲染 | 上传后 `[data-testid=mask-canvas]` 1024×744，box 830×603 | 已渲染 |
| 事件未到达画布 | 捕获阶段监听收到 pointerdown/move，共 33 条 | 到达 |
| `setPointerCapture` 抛错 | 监听内 `capture-ok id=1` | 正常 |
| `busy=true` 拦截 | canvas class 为 `cursor-crosshair`（busy 时为 `cursor-wait`）；`setBusy(true)` 只在提交处出现 | 未 busy |
| `imageRef` 未赋值 | 上传与草稿恢复都走 `adoptImage`，其中 `imageRef.current = next` 在 `setImage` 之前 | 代码上应已赋值 |

实测现象：涂抹后 `mask-coverage` 仍为「0 笔 · 覆盖 尚未涂抹」，
`area-repair-submit` / `mask-undo` / `mask-invert` 全部 disabled，且无 pageerror。

下一步（决定性实验，脚本已就绪）：`web/scripts/real-acceptance/probe-mask4.mjs`
- A. 在 canvas 冒泡阶段 + document 各装监听，判断事件是否被中间层 `stopPropagation` 吞掉
  （React 19 把事件委托在根容器，若被祖先吞掉则处理器根本不会执行）。
- B. 直接调用 `__reactProps.onPointerDown/Move/Up`，若直接调用能画出笔画，
  则确证「事件没到 React 根」，属于真实产品缺陷。

## 4. 待办

- [ ] 8 个工具逐个真实跑通（AREA_REPAIR / REMOVE_PEN / CHANGE_COLOR / IMAGE_CROP /
      PRODUCT_REFINE / FIX_COLOR / PRINTING_REPAIR / HAND_REPAIR），落证据到
      `evidence/real-acceptance/<TOOL_ID>/`（截图 + 网络记录 + 结果图）。
- [ ] 汇总报告 + 提交。
