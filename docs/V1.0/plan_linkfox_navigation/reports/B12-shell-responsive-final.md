# B12 共享框架响应式终验（接续 3311195）

日期：2026-10-29 · 分支：feat/linkfox-v1-real · 本地：http://127.0.0.1:3000 · 原站：https://www.linkfox.com/draw/ai-outpainting

## 结论：**PARTIAL**

- 本地共享框架在 6 个视口（1908/1440/1280/1024/768/390）× 浅色/深色共 12 组实测：**全部无横向溢出**，顶栏/导航/用户区/侧栏结构均可达（数字见下表）。
- 但**原站窄屏策略与本地不同**：原站 <1024 仍按 1200px 内容最小宽整页横向滚动、不收起侧栏（无汉堡），本地改为「导航收汉堡 + 用户区降级 + 侧栏转抽屉」。这是**有意的本地适配**，非像素对齐；因此**不能判 PASS**。
- 3311195 的提交名不能作为通过依据（沿用要求），本报告独立采集。

## 一、本地实测（含深色）

证据目录：`docs/V1.0/plan_linkfox_navigation/evidence/b12-shell-responsive-20261029/`
每档含 `measure.json`（rect + 计算样式）与 `shot.jpg`；`summary-local.json` 为汇总。

| 视口 | 溢出 | 促销条 | 顶栏 | 导航 | 用户区(x,w) | 学习中心 | 免费/积分 | 侧栏 |
|---|---|---|---|---|---|---|---|---|
| 1908 | 无 | 1908×50 | 1908×60 | 234,50 785×59 | 1427,446 | ✓ 1427,64 | ✓ | 常驻 180 |
| 1440 | 无 | 1440×50 | 1440×60 | 234,50 709×59 | 959,446 | ✓ | ✓ | 常驻 180 |
| 1280 | 无 | 1280×50 | 1280×60 | 176,50 622×59 | 814,446 | ✓ | ✓ | 常驻 180 |
| 1024 | 无 | 1024×50 | 1024×60 | 176,50 366×59 | 558,446 | ✓ | ✓ | 常驻 180 |
| 768 | 无 | 768×50 | 768×60 | 176,50 217×59 | 409,339 | 隐藏 | ✓ 免费/积分 | 收起（`tool-shell-nav-trigger` 12,114 36×36） |
| 390 | 无 | 390×50 | 390×60 | 隐藏 | 253,117 | 隐藏 | 隐藏 | 收起（同上） |

深色（12 组全部 `overflowX=false`）：`body` = `oklch(0.145 0 0)`、顶栏 `--surface`、侧栏行色 `--tool-row = rgba(255,255,255,.62)`；浅色为 `rgba(0,0,0,.6)`（沿用原站实测值）。

## 二、本次改动（仅 layout / tool-shell / theme）

1. `web/src/components/layout/app-top-nav.tsx`
   - 左块改 `flex-1 min-w-0`、右区改 `shrink-0`，消除 768px 下左右块重叠（原 472+446 > 732）。
   - 导航容器加 `min-w-0`，允许 More 之前的项目按容器收缩。
   - More 菜单由硬编码 `bg-white` 改 `bg-popover`，菜单项补 `dark:` 文字/悬停色（暗色下原为白底黑字）。
2. `web/src/components/layout/app-user-area.tsx`
   - 「学习中心」`<1024` 隐藏（`hidden lg:inline-flex`）；「免费得算力」「积分」`<768` 隐藏（`md:*`）。
   - 因 390px 时原左块溢出为负 x（学习中心 x=-76），修复后用户区 x=253、宽 117，全部落在视口内。
3. `web/src/components/tools/tool-sidebar.tsx`
   - 行文字色 `rgba(0,0,0,.6)` → `var(--tool-row, rgba(0,0,0,.6))`，暗色下不再「黑字压深底」。
4. `web/src/styles/globals.css`
   - 新增 `--tool-row`（`:root` = rgba(0,0,0,.6)；`.dark` = rgba(255,255,255,.62)）。

新增采集器：`docs/V1.0/plan_linkfox_navigation/tools/probe_shell_responsive.py`
（`--side local|real --widths ... --dark`，按 CDP `Emulation.setDeviceMetricsOverride` 逐档切换，落 `measure.json` + `shot.jpg`；主题经 `localStorage['infinite-canvas:theme_store']` 注入后重载）。

## 三、验证

- `npx tsc --noEmit`（web/，实际用 `node_modules/.bin/tsc`）：**exit 0**。
- `~/.bun/bin/bun test`（web/）：**1351 pass / 6 fail / 3 errors（1357 tests, 73 files）**。
  - 同一组 6 个失败在 **HEAD（把 4 个源文件 git stash 后）** 复跑也是 **1351 pass / 6 fail**，逐条比对一致 → **本次零回归**。
  - 失败分布：`product-scene.test.ts`「场景裂变工作区渲染」等 5 条（与共享框架无关）；`tool-page.integration.test.tsx > sidebar keeps every category…` 1 条，属**实现与测试既有分歧**（侧栏按实现只渲染激活分类，测试要求渲染全部分类），非本次引入。
  - 3 errors 为 `bun test` 误扫 `web/tests/*.spec.ts`（Playwright 用例）导致的 `test.describe()` 报错，属既有噪声。
- 响应式 e2e（`web/tests/tools-responsive.spec.ts`）未执行：Playwright 需独立起服/配置，本轮以 CDP 实测 + DOM 证据替代（见 UNVERIFIED）。

## 四、未完成 / 风险（PARTIAL 依据）

1. **原站 6 视口未同步落盘**：原站在 768/1024 自身 1200 最小宽横向溢出、390 无 `<header>`（仅 83px 紧凑条）、不提供汉堡入口；本报告的原站结论来自本轮探针（已在会话中测得），但未逐档存 `measure.json`，故不能声称「双端 6 档全量证据齐备」。
2. **窄屏策略差异不是缺陷**：本地采用「汉堡 + 抽屉」而非原站「整页横滚」，属体验改良；若要求 1:1 复制原站横向滚动，需要产品确认（不建议）。
3. **Playwright 响应式 e2e 未跑**（`tools-responsive.spec.ts`：1440/1024/768/390 × 3 路由，断言 `scrollWidth - innerWidth <= 1` 与侧栏/抽屉入口）。建议在有 bun/playwright 起的 CI 环境补跑，作为本档的自动化回归。
4. 暗色仅对照主题变量与关键容器底色（body/header/sidebar row），未做逐像素截图比对（原站无暗色主题可对照）。
5. `web/src/services/media-publish.ts` 为历史未跟踪文件，未纳入本次提交。

## 五、如何复跑

```bash
cd docs/V1.0/plan_linkfox_navigation/tools
python3 probe_shell_responsive.py --side local \
  --url http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting --dark
cd ../../../web && node_modules/.bin/tsc --noEmit
cd ../web && ~/.bun/bin/bun test
```
