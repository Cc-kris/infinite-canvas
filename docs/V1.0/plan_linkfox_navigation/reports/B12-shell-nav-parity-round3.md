# Shell 导航 1:1 对齐报告（B12 第三轮 · 2026-10-29）

> 范围：共享框架顶栏（`app-top-nav.tsx` + `constant/navigation-tools.ts` + i18n），未改任何工具页内部。
> 证据：`evidence/shell-nav-20261029/nav-parity.json`（原站与本地同口径 DOM 实测值）。

## 一、本轮修复项

| # | 项目 | 修复前 | 修复后（实测） | 原站实测 |
|---|------|--------|----------------|----------|
| 1 | 导航起点 x | 138.6（logo 仅 90.6 宽、间距 24） | **234**（logo `min-w-160`、`ml-[50px]`） | 234 |
| 2 | 主项顺序 | 首页→电商套图→智能修图→批量生图→商品图设计→AI视频 | **首页→电商套图→智能修图→AI视频→批量生图→商品图设计** | 同左 |
| 3 | 导航字号 | 14px（`text-base` 因 `--text-base` 未定义失效，退化 14px） | **16px / line-height 25.1429px** | 16px |
| 4 | 导航文字色 | rgb(23,23,23) | **rgba(0,0,0,0.85)**（实测 oklab(0 0 0 / 0.85)） | rgba(0,0,0,0.85) |
| 5 | 徽标「新模型」/「HOT」 | 无 | 9px/700/白字/135deg `#FF4D6D→#FF7A45`/r5/h16，实测 37×16、HOT 30.4×16 | 同左 |
| 6 | 「更多」触发器 | 无 | 宽 **47**（文本 32 + 箭头 5 间距 + 10px ChevronDown） | 47 |
| 7 | Skills / Agent | 缺失 | 补齐为 37.4 / 42.8 宽占位（原站为外链，本地无路由） | 37.4 / 42.8 |
| 8 | 「更多」面板 | 168×170、radius 10px、1px 边框、行内 pl-8、单层阴影 | **168 宽 / radius 8px / 无边框 / 3 层阴影 / 行 160×32 / 文字距面板 4px / 顶距导航 4px** | 168 宽 / radius 8px / 无边框 / 3 层阴影 / 行 160×32 / 文字距面板 4px / 顶距导航 4.5px |

### 关键根因（重要经验）

项目里 Tailwind v4 的 utilities 全部位于 `@layer utilities`，而 antd v5 注入的样式**未分层（unlayered）**。
按 CSS 级联规则，**未分层样式优先于任何 `@layer` 内的样式**，与选择器优先级无关。因此：

```
antd:  a { color: var(--ant-color-link) }          /* 未分层 → 覆盖 .text-black/85 */
antd:  button, input, ... { font-size: inherit }    /* 未分层 → 覆盖 .text-base / .text-[16px] */
```

表现：`<a>` 文本色恒为 `#171717`（antd colorLink token），`<button>` 字号恒为继承来的 14px——即使对应 Tailwind 类已正确生成在 DOM 上。

**修复方式**：这些落在 `a`/`button` 上的排版类一律加 `!`（`text-[16px]!`、`text-black/85!`、`text-[var(--brand)]!`、`hover:text-[var(--brand)]!`）。
`div`/`span` 不受影响，无需处理。

## 二、验证方式（可复现）

1. 原站与本地各开一页，用同一段 `web_execute_js` 探针读取 `getBoundingClientRect()` / `getComputedStyle()`：
   - 导航项坐标：`nav[aria-label] > *`
   - 徽标样式：`[data-testid^="tools-nav-badge-"]`
   - 「更多」面板：先 `dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))` 触发 React 合成 hover，再读 `[data-testid="tools-nav-more-menu"]`
2. 本地结果与原站逐项比对，落盘 `nav-parity.json`。
3. `tsc --noEmit` 通过（web 目录）。

## 三、未完成 / PARTIAL（保留，不伪造）

| 项目 | 现状 | 说明 |
|------|------|------|
| 「更多」面板高度 | 本地 168 vs 原站 200 | 原站第 6 项为 **LinkFox Claw**（品牌专有入口），按「仅去 LinkFox 品牌」要求不落地，故少一行 32px |
| 主项文字宽度 ±0.5px | 智能修图 101 vs 101.5、AI视频 76.8 vs 77.3 | 原站与本地同为 16px 字体，差异为子像素舍入，视觉不可辨 |
| 主项命中区高度 | 本地 60px（满栏）vs 原站 25.1px（仅行高） | 视觉一致，hover 命中面积更大；未改，避免影响分类下拉的 hover 衔接 |
| Skills / Agent 可点击性 | 本地只读占位（`aria-disabled`、`title=原站入口，本地暂未实现`） | 原站指向 `skill.linkfox.com` / `os.linkfox.com`，按去品牌要求不外链、本地无对应路由 |
| 促销条 / 用户区 / 主题切换 / 窄屏重测 / 像素回归 | **未在本轮验证** | 本轮仅完成导航区（最高影响项）；原站顶部在滚动/广告轮播下 `header` 高度变化（实测 y=120 h=240），需滚动归一化后另起一轮 |

## 四、改动文件

- `web/src/constant/navigation-tools.ts`：新增 `ToolNavigationBadge`、分类 `badge` 字段、`shellMoreMenuItems`、分类顺序调整（AI视频前移）
- `web/src/components/layout/app-top-nav.tsx`：首页链接、9 项导航（含 Skills/Agent 占位）、徽标渲染、「更多」下拉（含点击外部 / Esc / 路由切换收起）、logo 宽度与导航间距、antd 级联冲突处的 `!` 提升
- `web/src/i18n/locales/zh-CN.ts` / `en-US.ts`：`toolsNav.home` / `more` / `moreUnavailable` / `moreMenu.*` / `badges.newModel` / `badges.hot`
