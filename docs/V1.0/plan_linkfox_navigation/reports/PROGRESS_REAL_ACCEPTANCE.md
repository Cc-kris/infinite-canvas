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

## 4. 待办

- [ ] 8 个工具逐个真实跑通（AREA_REPAIR / REMOVE_PEN / CHANGE_COLOR / IMAGE_CROP /
      PRODUCT_REFINE / FIX_COLOR / PRINTING_REPAIR / HAND_REPAIR），落证据到
      `evidence/real-acceptance/<TOOL_ID>/`（截图 + 网络记录 + 结果图）。
- [ ] 汇总报告 + 提交。
