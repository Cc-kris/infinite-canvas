# 工具页配色规范（遵循无限画布风格）

用户要求：39 个工具页**布局继续按 LinkFox 原站**，**配色一律遵循无限画布原有风格**（画布页 `canvasThemes`、生图/视频工作台），并且浅色 / 深色主题都要正确。

## 已由主代理完成

- `web/src/styles/globals.css`：
  - `--brand` 改为深石色（浅 `#1c1917` / 深 `#fafaf9`），`--canvas` `#f4f2ed` / `#181715`，`--surface` `#fbfaf7` / `#1f1d1a`，`--hairline` `#e7e5df` / `#44403c`。
  - 新增选中态 token：`--selected`（浅 `#f97316` / 深 `#fb923c`）、`--selected-soft`，Tailwind 类 `border-selected`、`bg-selected-soft`、`text-selected`。与工作台的 `SELECTED_ACCENT` 同一套橙色。
  - `.tool-linkfox-surface` 的 shadcn 变量改为 canvasThemes 色板，并新增 `.dark .tool-linkfox-surface` 深色版本（之前被强制成浅色）。
  - 工具主列底色 = `var(--canvas)`。
- 左侧族导航选中项已改为 `bg-accent`；`ai-pose-generator` / `listing-fission` / `text` 的静态页签下划线已改为 `border-foreground`。
- 已对 `src/components/tools/**/*.tsx`、`src/features/tools/**/*.tsx` 跑过一次机械替换（脚本 `/tmp/tool-color-codemod.py`，只改 className 字符串里的类名）：
  - 渐变主按钮 `bg-[linear-gradient(90deg,#3a7df9,#723cf9)] text-white` → `bg-primary text-primary-foreground`
  - 紫边 / 紫浅底 → `border-selected` / `bg-selected-soft`；紫字 → `text-foreground`；紫实心 → `bg-primary`
  - `#edeff5 / #f4f6f8 / #f5f7fa` → `bg-canvas`；`#f7f7f7` 等浅灰底 → `bg-muted`；`bg-white` → `bg-background`
  - 灰边 → `border-border`；`text-black/85` → `text-foreground`；`text-black/60~80` → `text-foreground/70`；`text-black/25~50` → `text-muted-foreground`；`#ff4d4f` → `text-destructive`

## 映射规则（剩余项手工处理时照此执行）

| 原站用法 | 改为 |
|---|---|
| 主操作按钮（立即生成 / 开始生成 / 上传商品图…） | `bg-primary text-primary-foreground hover:opacity-90`，不要渐变 |
| 次按钮（紫边紫字） | `border border-border bg-background text-foreground hover:bg-accent` |
| 选中态（卡片 / 选项 / 张数 / 比例 / 缩略图被选中） | `border-selected bg-selected-soft text-selected`（或只边框），对勾角标 `bg-selected text-white` |
| 选中页签 | `text-foreground` + 下划线 `border-foreground`（不要紫色、不要橙色） |
| 导航选中（左侧族导航、页签、步骤） | 灰色 `bg-accent text-foreground font-medium`（同画布工具栏 activeBg），**不用橙色**。橙色只用于「参数被选中」 |
| 链接 / 「历史记录」类入口 | `text-muted-foreground hover:text-foreground` |
| 卡片 / 面板 | `bg-background` 或 `bg-card` + `border-border` |
| 主区 / 结果区底 | `bg-canvas` |
| 上传卡 / 行卡灰底 | `bg-muted`，hover `hover:border-selected` |
| 正文 / 次要 / 弱提示文字 | `text-foreground` / `text-foreground/70` / `text-muted-foreground` |
| 错误 / 警告 | `text-destructive`；警告用 `text-amber-600 dark:text-amber-400` + `bg-amber-500/10` |
| 半透明黑底（`bg-black/[0.04]`、`bg-black/10` 等装饰底） | `bg-foreground/[0.04]`、`bg-foreground/10`（深色下自动变浅） |
| 图片上的遮罩、角标、悬浮标签（`bg-black/60 text-white`） | **保留**：叠在图片上，两种主题都要深底白字 |
| 棋盘格、canvas 绘制、蒙版颜色、SVG 插画、原站素材图 | **不改** |
| 内联 `style={{ color: "#723cf9" }}` 等 | 改成 className 或 `var(--selected)` / `var(--foreground)` |

- 不要用 `dark ? ... : ...` 分支写颜色（AGENTS.md），全部走 token 或 Tailwind `dark:`。
- 不要硬编码 stone / slate / white / black 颜色导致主题不一致。
- 紫色 `#723cf9`、蓝 `#3a7df9`、`#8d34f9` 在工具页里不应再出现（原站素材图片里的除外）。

## 自查

```bash
cd web
# 你负责的文件里不应再有原站紫/蓝
grep -n "723cf9\|3a7df9\|8d34f9\|722ed1" <你的文件>
# 剩余硬编码颜色逐条判断
grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(bg|text|border)-(white|black)" <你的文件>
```

浏览器自查（ego-browser 自己的任务空间，1600×1000）：每页分别在浅色和深色下截图看一遍。切换主题：

```js
await page.evaluate(() => { localStorage.setItem("infinite-canvas:theme_store", JSON.stringify({ state: { theme: "dark" }, version: 0 })); });
await page.reload();
```

（看完切回 `"light"`。）深色下不应出现白底块、看不见的黑字、紫色残留。

## 已知需要手工改的模式（机械替换没覆盖）

- 条件页签：`cn("h-10 border-b-2 ...", active ? "border-selected text-foreground" : "...")` → 激活态改 `border-foreground`。
- `hover:text-[#8d34f9]/60`、`border-selected/15 bg-primary/15` 这类拼出来的类。
- `text-white` 留在原本是渐变/紫底的按钮上但没被识别（例如按钮类名跨多个字符串拼接）：在浅色下会看不见，必须改 `text-primary-foreground`。
- `bg-black/[0.04]`、`bg-black/10`、`text-black/25`、`border-black/30`、`text-black` 等残留。
- 原站 `#d46b08 / #fff7e6 / #ad6800 / #faad14`（橙色提示条）→ `text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30`。
- 内联 `style` 里的颜色、SVG `fill`/`stroke`（UI 图标类改 `currentColor`；插画/素材不改）。
