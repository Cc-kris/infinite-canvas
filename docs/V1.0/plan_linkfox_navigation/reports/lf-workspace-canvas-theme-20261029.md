# 工作台主题接管 + 去品牌/去计费收口（2026-10-29）

- 分支：`feat/linkfox-v1-real`
- 接手基线：`6fdd9a5`（工作区有 `lf_workspace_canvas_theme` 遗留未提交改动）
- 提交：`0ee77cd`（主题 token 化）、`6528c05`（去算力/品牌残留）、`930b477`（剩余工作台中性色补齐）
- 口径：39 工具功能与必要字段、效果不变；样式统一 Infinite Canvas token；不搬 LinkFox 品牌紫、算力/点数、促销文案

## 1. 变更文件

### 1.1 `0ee77cd` fix(tools/theme)：工作台统一 Infinite Canvas token

设计系统：`border-border` / `bg-card` / `text-foreground` / `text-muted-foreground` / `bg-primary` + `text-primary-foreground` / `accent-primary`。

- 共享组件：`design19-frame.tsx`、`edit8-frame.tsx`、`tool-asset-input.tsx`、`tool-cases.tsx`、`tool-result.tsx`
- 工作台：`workspaces/color.tsx`、`color-v2.tsx`、`crop.tsx`、`dress.tsx`、`enhance.tsx`、`extract.tsx`、`handheld-goods.tsx`、`mask.tsx`、`outpaint.tsx`、`repair.tsx`、`scene.tsx`

### 1.2 `6528c05` fix(tools/copy)：去掉算力计费与 LinkFox 品牌残留

计费话术（10 处，按钮文案只保留动作）：

| 文件 | 原文案 | 现文案 |
| --- | --- | --- |
| `workspaces/color.tsx` | 立即生成 (10算力) | 立即生成 |
| `workspaces/color-v2.tsx` | (50算力) 徽标 | 移除 |
| `workspaces/enhance.tsx` | (20算力)（`data-testid=scale-up-cost`） | 移除 |
| `workspaces/outpaint.tsx` | (40算力) | 移除 |
| `workspaces/mask.tsx` | 立即生成 (40算力) | 立即生成 |
| `workspaces/handheld-goods.tsx` | 立即生成 (40算力) | 立即生成 |
| `workspaces/extract.tsx` | 立即生成 (10算力) | 立即生成 |
| `workspaces/translate.tsx` | 开始翻译 (N算力) + 常量导入 | 开始翻译 |
| `workspaces/scene-fission.tsx` | 立即生成 (N算力) | 立即生成 |
| `workspaces/designer.tsx` | 文案里点名 LinkFox 字体接口 | 「字体只提供系统可渲染字族；未接入远端字体库，不伪造字体列表。」 |

品牌紫/硬编码（→ token）：

- `color-v2.tsx`：`#723cf9`、`linear-gradient(90deg,#3B7AF9,#723CF9)`、`text-[#000000e0]` → `text-primary` / `bg-primary` / `text-foreground`
- `translate.tsx`：`#723CF9` 系列（tab/选中态/上传区/主按钮）→ `primary` token
- `scene-fission.tsx`：15 处（含 `#723cf9`、`#ededf0`、`bg-white`、渐变主按钮）→ token
- `pod.tsx`：7 处（渐变主按钮补 `bg-primary`/`text-primary-foreground`，tab 与提示条去品牌色）

品牌痕迹：

- `outpaint.tsx`：案例回填文件名 `linkfox-case-*.jpg` → `case-*.jpg`；`data-layout="linkfox-outpaint"` → `"outpaint"`（同步测试）
- 可见文案「原站」中性化：`color.tsx`（优秀案例说明）、`dress.tsx`（案例 hint）、`dress-suite.tsx`（案例 hint）

### 1.3 `930b477` refactor(tools/theme)：剩余工作台中性色补齐

`extract / handheld-goods / scene-fission / scene / mask / color / enhance / translate`：

- `text-black/{88,80,70,60,55,45,40,35,30,25}`、`#999`、`#5a5a66`、`#b0b0bd`、`#1f1f2c` → `text-foreground` / `text-muted-foreground`（占位符用 `/70`）
- `#edeff5`、`#f7f7fa` → `bg-muted` / `bg-muted/60`
- 错误红 `#f5483b`、`#d4380d`、`#FA5151`、`#c0392b` → `text-destructive`
- 保留语义告警色（草稿冲突/旧图提示的橙黄条），非品牌色

## 2. 验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `cd web && npx tsc --noEmit` | 通过（exit 0） |
| 单测 | `cd web && bun test src/components/tools` | 104 pass / 0 fail / 487 expects（14 文件） |
| 构建 | `cd web && npx vite build` | ✓ built in 13.58s（仅 chunk >500kB 提示） |
| 范围审计 | `python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py` | errors 11 → 1，warnings 53 → 21 |

测试同步：`color.test.tsx`（去掉「10 算力」断言）、`outpaint.test.tsx`（去掉「40 算力」、`data-layout` 改名）。功能与字段断言未改动。

## 3. 剩余清单（未在本轮改动，均因边界限制）

1. `workspaces/suite.tsx:644`：`({expected * 50}算力)` 计费文案 —— suite 由他人负责
2. `workspaces/suite.tsx`：4 处品牌紫（`#723cf9` / `#f2eeff`）+ 17 处「案例模块未接入」占位文案 —— 同上
3. `video.tsx` / `video-translation.tsx` 的 `unfinished-copy:case-module` 占位文案 —— video 文件不动
4. `image-to-video.tsx`：工作区仍有一份未提交的历史记录改动（非本轮、非主题），已保留未提交，交由视频负责人处理
5. `layout` / `tool-shell` / `tool-sidebar` / `globals.css` 未触碰（`lf_shell_canvas_style` 归属）

## 4. 复现入口

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
npx tsc --noEmit && bun test src/components/tools && npx vite build
cd .. && python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py
```
