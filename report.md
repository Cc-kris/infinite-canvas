# 工具台 E2E 补齐报告（TASK-049）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- 分支：`feat/linkfox-v1-real`
- 提交：`bd435a993c8fa65cd487e5a426bc0ea4e3c1490d` — `test(tools): 补工具台 E2E（导航/响应式/真实工作流）`
- 结果：`15 passed (33.8s)`（其中 1 条为 `test.fail` 的已知缺陷守卫，见 §4）

---

## 1. 改了什么

| 文件 | 内容 |
| --- | --- |
| `web/playwright.config.ts`（新增） | 默认 `channel: "chrome"`（本机 playwright 自带 chromium 下载被网络阻断）；`baseURL` 走 4317，`reuseExistingServer: true`；`workers: 1`（共享同一个 dev server 与 IndexedDB，避免互相污染）；支持 `IC_E2E_NO_WEBSERVER=1` / `IC_E2E_PORT` / `IC_E2E_CHANNEL` 覆盖 |
| `web/tests/tools-navigation.spec.ts`（新增） | 4 条：首页渲染侧边栏+分类+工作台且无 console error；分类展开列出工具、逐个深度链接都能挂载工作台；刷新后仍停在同一工具；未注册路由有兜底不白屏 |
| `web/tests/tools-responsive.spec.ts`（新增） | 6 条：1440 / 1024 / 768 / 390 四档各跑 3 个页面，断言 `scrollWidth ≤ 视口 +1px` 且工作台可见；手机抽屉能开能关并跳转；中间档（768–1023）导航可达性守卫（`test.fail`） |
| `web/tests/tools-workflow.spec.ts`（新增） | 5 条真实链路：上传真 PNG → 提交 → 上游 500 如实失败且不自动重发；上游 200 按 b64 渲染结果图、改参数后标记过期；缺蒙版禁止提交并说明缺什么；图片裁剪本地算完出结果、不打上游；草稿刷新后可恢复 |
| `web/package.json` | 加 `e2e`（`playwright test`）、`e2e:report` 两个脚本 |
| `.gitignore` | 忽略 `web/test-results/`、`web/playwright-report/`、`web/.playwright/` |

未改动任何业务源码（`src/**` 零改动），符合任务的 allowlist。

## 2. 如何验证

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
bun x vite --host 127.0.0.1 --port 4317        # 或已有 dev server
IC_E2E_NO_WEBSERVER=1 ./node_modules/.bin/playwright test --reporter=list
# 等价：bun run e2e（会自动按需要起 4317）
```

类型检查同样通过：

```bash
cd web && ./node_modules/.bin/tsc --noEmit   # 退出码 0
```

## 3. 证据（真实执行输出）

```
Running 15 tests using 1 worker

  ✓   1 tests/tools-navigation.spec.ts:28:5 › 首页渲染侧边栏、分类入口与工作台，且无控制台错误 (1.8s)
  ✓   2 tests/tools-navigation.spec.ts:49:5 › 分类折叠展开后能列出工具，逐个深度链接都能挂载工作台 (8.6s)
  ✓   3 tests/tools-navigation.spec.ts:82:5 › 工作台刷新后仍停留在同一工具（路由与状态可恢复） (1.2s)
  ✓   4 tests/tools-navigation.spec.ts:95:5 › 未注册的工具路由有兜底，不出现白屏 (1.4s)
  ✓   5 tests/tools-responsive.spec.ts:43:9 › desktop (1440px)：三页无横向溢出且工作台可见 (1.7s)
  ✓   6 tests/tools-responsive.spec.ts:43:9 › laptop (1024px)：三页无横向溢出且工作台可见 (1.7s)
  ✓   7 tests/tools-responsive.spec.ts:43:9 › tablet (768px)：三页无横向溢出且工作台可见 (1.7s)
  ✓   8 tests/tools-responsive.spec.ts:43:9 › phone (390px)：三页无横向溢出且工作台可见 (1.6s)
  ✓   9 tests/tools-responsive.spec.ts:63:5 › phone：导航抽屉能开能关，打开后能跳到其它工具 (2.1s)
  ✘  10 tests/tools-responsive.spec.ts:84:5 › tablet/laptop 中间档（768–1023px）能进入工具列表 (789ms)   ← test.fail，见 §4-A
  ✓  11 tests/tools-workflow.spec.ts:82:5 › 上游 500：任务如实失败、有诊断码，且不自动重复提交（不重复扣费） (4.9s)
  ✓  12 tests/tools-workflow.spec.ts:124:5 › 上游成功：结果图按上游返回的 b64 渲染，改参数后标记过期 (981ms)
  ✓  13 tests/tools-workflow.spec.ts:152:5 › 缺蒙版时禁止提交，并说明缺什么 (1.1s)
  ✓  14 tests/tools-workflow.spec.ts:162:5 › 图片裁剪在本地算完就地出结果，不打上游 (998ms)
  ✓  15 tests/tools-workflow.spec.ts:179:5 › 草稿持久化：改参数后刷新，参数与结果标记都还在 (2.2s)

  15 passed (33.8s)
```

第 10 条的 `✘` 是被 `test.fail` 标记的**预期失败**：它守卫一个真实缺陷，跑起来应该是红的；一旦有人修好，它会变绿并让整套测试失败，提醒把 `test.fail` 去掉。所以整体计数仍是 `15 passed`。

## 4. 测试过程中实测出来的真实缺陷

### A. 768–1023px 没有任何导航入口（已用 `test.fail` 守卫）

逐档量测（`getBoundingClientRect` + `getComputedStyle`）结果：

| 视口宽 | 常驻侧边栏 `tool-sidebar` | 抽屉入口 `tools-nav-mobile-trigger` |
| --- | --- | --- |
| 1440 | 可见（180×844） | 无 |
| 1024 | 可见（断点 `lg`） | 无 |
| 900 | 不可见 | 不可见 |
| 768 | 不可见 | 不可见 |
| 390 | 不可见 | 可见 |

`hidden lg:block` 与 `sm:hidden` 之间留了 `640–1023px` 的空档：这一段宽度下用户**既看不到侧边栏也点不到抽屉**，只能靠手输 URL。iPad 竖屏（768）、窄窗口桌面（900）都在这个区间。

### B. 图片裁剪页重复渲染两个可见 `tool-sidebar`

`/tools/smart-edit/image-crop` 在 1024px 下同时存在 **2 个都可见** 的侧栏（180×844 与 180×1226），同一个 `data-testid` 被挂了两次。写测试时触发 Playwright strict mode 报错才暴露。当前测试用 `.first()` 规避选择器歧义，但根因（工作台内又嵌了一套外壳导航）没修，会造成重复滚动区与潜在的双份 a11y 节点。

## 5. 过程中修正的自身错误（避免后续误读测试）

1. 一开始用 `toHaveAttribute(/正则/, ...)`——Playwright 的属性名必须给字符串，不能给正则，改成精确断言 `aria-checked === "true"`。
2. 一开始用 `locator.count() > 0` 判断"导航可达"——那只判断**存在**，DOM 里挂着但被 `hidden` 遮住也会算真，改为统计 `:visible` 节点。
3. 草稿持久化用例最初刷新太早：草稿写入是 `TOOL_DRAFT_DEBOUNCE_MS = 500ms` 防抖 + IndexedDB 异步落盘，立刻 reload 会丢掉未 flush 的改动。现在改成轮询 IndexedDB（库 `infinite-canvas` / store `app_state`）真实落盘，而不是 `sleep`。

## 6. 未完成 / 风险

- **缺陷 A、B 只是被测试记录下来，没有动源码修**（任务 allowlist 限定为测试文件与 package.json，业务改动需要另行授权）。修 A 的做法：把侧栏断点从 `lg` 下调到 `md`，或让抽屉入口在 `<lg` 就出现；修 B 的做法：工作台内不要复用外壳导航。
- 上游 500 / 200 两条用例都是用 `page.route()` 拦 `**/images/edits` 造的确定性上游，**不消耗真实额度**；真实付费链路的连通性仍需人工冒烟一次。
- 草稿用例断言的是"刷新后参数与结果标记还在"，未覆盖多标签并发写冲突（store 里有 `conflicts` 分支，需要专门的跨页面用例）。
- 蒙版笔画的自动化仍不稳（`pointer` 事件注入在 canvas 上偶尔记 0 笔），所以"缺蒙版禁止提交"验的是拦截逻辑，不是绘制手感；绘制链路的 E2E 建议后续用 CDP `Input.dispatchMouseEvent` 补。

## 7. 使用入口

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
bun run e2e                 # 中文用例名，list reporter
bun run e2e:report          # 打开 HTML 报告（需先有 report）
IC_E2E_PORT=4400 bun run e2e
```
