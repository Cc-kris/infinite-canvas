# design19 视觉对齐 — 关键发现（2026-10-29）

## 1. 样式穿透根因（决定性）
antd `dist/reset.css` 是**无 @layer** 的 CSS，其中 `button { margin: 0; font-size: inherit; color: inherit; ... }`
在层叠中对**任意** `@layer utilities` 里的 Tailwind 规则胜出（无 layer 的声明优先于有 layer 的声明）。
→ 按钮上的 `ml-auto` / `text-[12px]` / `text-white` / `leading-*` 全部失效。

**修法**：Tailwind v4 用尾部 `!`（`text-[12px]!`、`ml-auto!`）。
已验证：修复前 handheld 页签 `ml=0px, fs=14px`；修复后 `ml=auto → 右端 1886`、`fs=12px`。

排查踩坑：
- `getComputedStyle` + `document.styleSheets` 遍历（`!!s.cssRules` 遇跨域/大表会抛错，需 try/catch 并只拼 rule.cssText）才定位到「规则存在但不生效」。
- 3000 端口的 vite dev 曾返回不含新工具类的旧 CSS；`curl /src/styles/globals.css?direct` 可强制重建。

## 2. tool-cases-data.ts 曾被整体重写
前轮把该文件换成 4 个工具案例数组，删掉了 `AI_OUTPAINTING_CASES`，而 `workspaces/outpaint.tsx`（禁区）仍 import 它
→ dev 端 `does not provide an export named 'AI_OUTPAINTING_CASES'`，整页白屏（body.innerText 长度 0）。
**已从 `git show HEAD:` 原样补回**（当前在 150 行起）。改此类共享数据文件后**必须**跑一次全量 import 检查。

## 3. 实测手段（无屏幕录制权限下的 UI 验收）
`web/measure19.mjs` / `probe*.mjs`：Playwright `chromium.launch({channel:'chrome'})`，viewport 1908x781。
- node 需 `PATH=/opt/homebrew/bin:$PATH`
- 脚本要放在 `web/` 目录内才能解析 `playwright` 依赖
- 用 `getBoundingClientRect` + `getComputedStyle` 逐元素对照基线坐标，替代截图比对

## 4. 工具迁移现状（2026-10-29）
| 工具 | 组件 | 状态 |
|---|---|---|
| handheld-goods | design19-frame | 部分对齐（上传卡走禁区 ToolAssetInput → PARTIAL） |
| scene | design19-frame | 已接入 |
| scene-fission / replace / dressing / model / dress / pod / text / sds | 自建布局 | 未迁移 |

## 5. 禁区文件（不得修改）
tool-shell / tool-asset-input / tool-page / outpaint / color-v2 / video*
