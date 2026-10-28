# TASK-002A / TASK-002B 导航层交付报告（五分类顶部菜单 + 移动 Drawer）

- 分支：`feat/linkfox-v1-real`
- 日期：2026-10-28
- 范围：导航常量与中英文 i18n（TASK-002A）+ 五类顶部菜单/移动 Drawer（TASK-002B 的导航部分）
- 事实来源：`docs/V1.0/plan_linkfox_navigation/tool_specs.json`、`tool-matrix.md`

---

## 1. 交付的 5 个源文件

| 文件 | 变更 |
| --- | --- |
| `web/src/constant/navigation-tools.ts` | 新增五分类 39 工具导航数据 + 查询工具函数；**原有 6 条 legacy 导出（`navigationTools`/`NavigationToolSlug` 等）逐字保留** |
| `web/src/i18n/locales/zh-CN.ts` | 新增 `toolsNav` 区块（51 个键） |
| `web/src/i18n/locales/en-US.ts` | 同上，键集与中文一一对应 |
| `web/src/components/layout/app-top-nav.tsx` | 顶部一级 5 分类 + 二级下拉菜单（hover/focus/click、键盘、外点关闭、激活态、a11y） |
| `web/src/components/layout/mobile-nav-drawer.tsx` | 移动端 Drawer：5 个可折叠分类 + 工作区入口 + 批量说明 |

未改动 `router`、`UserLayout`、其他 worker 的文件。

## 2. 数据事实（可复查）

- 工具总数 **39**：`original` 30 + `supplemental` 9
- 分类与菜单条数：`ecommerce-suite` 6 / `smart-edit` 8 / `batch-generate` 12（跨类批量工具）/ `product-design` 19 / `ai-video` 6
- `batchNavigationToolIds` 12 条，与 `tool_specs.json` 中 `batchCapable=true` 的 12 条完全一致
- 每个工具含：`id / category / categoryKey / slug / route(/tools/<category>/<slug>) / origin / batchCapable / icon / labelKey`

导出 API（供路由与工具页复用）：

```ts
toolNavigationCategories, toolNavigationItems, batchNavigationToolIds, TOOL_NAVIGATION_COUNT
getToolNavigationCategory, getToolNavigationItem, getToolNavigationItemBySlug,
getCategoryTools, getBatchNavigationTools, getBatchToolRoute,
getCategoryMenuTools, resolveToolNavigation, getActiveCategorySlug, isToolCategorySlug
```

## 3. UI 行为（已实测）

桌面（≥md）：

- 一级 5 个触发器，顺序固定：电商套图 → 智能修图 → 批量生图 → 商品图设计 → AI视频
- 二级菜单：`role=menu` / `role=menuitem`，末尾一条「进入分类工作台」入口（`tools-nav-category-entry-*`），批量类入口额外带 `?mode=batch`
- 交互：hover 打开（120ms 延迟关闭）、focus 打开、点击开合、点击空白处关闭、Esc 关闭并把焦点还给触发器
- 键盘：`ArrowDown` 打开并聚焦首项、`ArrowUp`/`Home`/`End` 在触发器行与菜单项间移动、`Enter` 跟随链接、`Tab` 收起
- 激活态：当前路由命中的分类触发器 `aria-current="page"` + 高亮；当前工具项 `aria-current="page"`
- a11y：`aria-expanded` / `aria-controls` / `aria-haspopup` / `aria-label`（中文「打开…菜单」随语言切换）

移动（<md）：

- 头部隐藏桌面导航，显示汉堡按钮（`data-testid="tools-nav-mobile-trigger"`，带 `aria-expanded`+`aria-controls="mobile-tools-navigation"`）
- Drawer 内 5 个折叠面板，展开后列出该分类全部工具，标题显示「N 个工具」；点击任意条目关闭 Drawer 并跳转
- 页脚 6 条工作区入口（我的画布/生图工作台/视频创作台/提示词库/我的资产/配置）

## 4. 验证（跑出来的，不是读代码）

环境说明：仓库 `web` 目录已有 vite dev server 在 `127.0.0.1:3000`（复用，未启动/未干扰他人实例）。因当前 Playwright 版本期望 chromium-1248 未安装，改用本机 chromium-1234 的 `executablePath` 拉起**独立无头浏览器**，不触碰任何用户标签。

复现：

```bash
# 1) 数据一致性（39/6-8-12-19-6/12 批量/中英键对齐/legacy 保留）
cd web && bun ../../docs/V1.0/plan_linkfox_navigation/evidence/TASK-002A/verify.ts
# → ALL CHECKS PASSED

# 2) DOM 证据（桌面 5 菜单 + 移动 Drawer + 键盘 + 激活态 + 控制台错误）
cd web && bun ../../docs/V1.0/plan_linkfox_navigation/evidence/TASK-002A/dom.ts
# → 见 evidence/TASK-002A/dom-evidence.json

# 3) 英文语言 + 键盘逐项复测
cd web && bun ../../docs/V1.0/plan_linkfox_navigation/evidence/TASK-002A/retest.ts
```

实测结果（`evidence/TASK-002A/dom-evidence.json`、`retest-output.json`）：

| 检查项 | 结果 |
| --- | --- |
| 一级标签（zh） | 电商套图 / 智能修图 / 批量生图 / 商品图设计 / AI视频 |
| 一级标签（en，`infinite-canvas:locale=en-US`） | E-commerce Sets / Smart Retouch / Batch Generation / Product Design / AI Video |
| 各菜单工具数（排除入口链接） | 6 / 8 / 12 / 19 / 6 |
| 移动 Drawer 各分类工具数 | 6 / 8 / 12 / 19 / 6 |
| 批量菜单英文条目 | 12 条，入口链接「Batch generation workspace」 |
| 键盘 ArrowDown | 打开并聚焦首项 `tools-nav-item-AREA_REPAIR` |
| 键盘 End / Esc | 聚焦末项入口；Esc 后 `aria-expanded=false`，焦点回到 `tools-nav-trigger-smart-edit` |
| Enter | 跳到 `/tools/smart-edit/area-repair` |
| 激活态 | `/tools/product-design/new-designer` → 触发器 `aria-current`，条目 `tools-nav-item-NEW_DESIGNER` 高亮 |
| 横向溢出 | 桌面 1440 / 移动 390 均无溢出 |
| 控制台错误 | 0 |

截图：`evidence/TASK-002A/{desktop-closed,desktop-open-menu,desktop-en-menu-batch,mobile-drawer-open}.png`

`tsc --noEmit`：**0 error**（全仓）。5 个源文件均符合 `web/.prettierrc.json`（4 空格、printWidth 255）；locale 文件只新增 `toolsNav` 块（每文件 +72 行），未对既有内容做整文件重排，避免与他人改动冲突。

## 5. 本轮发现并修复的真实缺陷

`ArrowDown` 在「菜单已被 hover 打开」时焦不掉进菜单：聚焦逻辑挂在 `[openSlug]` effect 上，slug 未变化 → effect 不重跑 → 焦点丢失。修复：新增 `focusTick` 计数并在键盘触发时自增，effect 依赖改为 `[openSlug, focusTick]`。修复后 `kb1` 实测焦点落在首项。

## 6. 集成需求（给路由/工具页 worker）

1. 路由需注册：`/tools/:categorySlug/:toolSlug`（39 条工具页）与 `/tools/:categorySlug`（分类工作台）；`batch-generate` 分类入口为 `/tools/batch-generate`，批量项跳转带 `?mode=batch`。
2. 工具页需按 `ToolId` 从 `toolNavigationItems` 或 registry 解析标题/图标，避免各自硬编码文案——文案统一走 `toolsNav.tools.<TOOL_ID>`。
3. 我的组件已挂在既有 `app-top-nav.tsx` 上、由 `UserLayout` 直接使用，无需额外接线；只要路由存在，激活态即自动生效。
4. 稳定测试选择器契约：`tools-nav-primary`、`tools-nav-trigger-<slug>`、`tools-nav-menu-<slug>`、`tools-nav-item-<ID>`、`tools-nav-category-entry-<slug>`、`workspace-link-<slug>`、`tools-nav-mobile-trigger`、`mobile-tools-nav-item-<ID>`、`mobile-nav-drawer`。

## 7. 风险 / 未做

- 桌面「一级触发器行」在 1280px 以下会横向滚动（`overflow-x-auto` + `hide-scrollbar`），因为 5 个分类名较长；已在 1440/390 两档实测无页面级溢出，但 1024 左右的中间档未单独取图。
- 分类工作台页（`/tools/<category>`）与工具页本体不在本次范围内，导航目前会指向尚未实现的路由（当前会渲染 NotFound，属预期集成缺口）。
- 未新增单测文件（任务限定文件清单，`tool-navigation.test.tsx` 由 TASK-002B 归属）；导航行为以 Playwright 真实 DOM 证据覆盖。
- 期间曾出现全站白屏，根因是 `src/features/tools/tool-page.tsx` 的 `import.meta.glob("./registry/*.ts", {eager:true})` 把 `registry.test.ts`（`bun:test`）打进浏览器包；该文件非本次范围，已由对应 worker 用负向 glob 修复，本报告验证均在其修复后完成。

## 8. 使用入口

- 数据：`web/src/constant/navigation-tools.ts` → `toolNavigationCategories` / `getCategoryMenuTools` / `resolveToolNavigation`
- 文案：`toolsNav.*`（zh-CN / en-US 同步）
- 组件：`app-top-nav.tsx`（内部 `ToolsPrimaryNavigation`）、`mobile-nav-drawer.tsx`（`ToolsMobileNavigation` 可单独复用）
- 证据：`docs/V1.0/plan_linkfox_navigation/evidence/TASK-002A/`
