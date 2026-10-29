# CHANGE_COLOR_V2 视觉/字段/交互对照报告

- 日期：2026-10-29（第二轮：左卡按原站规格重排后复测）
- 分支：`feat/linkfox-v1-real`
- 视口：1908×781（DPR 1），light
- 原站：`https://www.linkfox.com/draw/change-color-v2`
- 本地：`http://127.0.0.1:3000/tools/ecommerce-suite/change-color-v2`
- 采集：同段 JS 双端执行（`tools/probe_eval.py`）+ 同视口截图（`tools/capture_parity.py`、`tools/shot_ready.py`）
- 原始证据：
  - `probe-real-20261029/`、`probe-local-empty-20261029/`（首轮）
  - `probe-real-final-20261029/shot.jpg`（原站同视口截图，1908×781）
  - `probe-local-20261029/deep-blocks-local.json`（本地逐元素 box/字号/颜色）
  - `probe-local-20261029/final-check.json`（CTA/chip/品质/textarea 计算样式）
  - `probe-local-20261029/local-shot/shot-current.jpg`（本地同视口截图，1908×781）

## verdict: PARTIAL

左卡盒子、分区、控件尺寸/颜色/文案已逐项对齐到可测一致；剩余差异均为「全局框架层」或「本产品增强项」，非布局/字段错误（见 DIFF 表 D1–D4）。

## 已对齐（实测一致）

| 项 | 原站 | 本地 |
|---|---|---|
| 左卡盒子 | x190 w300 h651（主区 y110 起） | x190 w300 h651（主区 y120 起，见 D1） |
| 分区标题 | 12px / weight 600 / 条高 46 | 12px / 600 / 46 |
| 分区顺序 | 上传图片 → 颜色选择 → 换色部位 → 模型设置 | 一致 |
| 分区间距 | 10px | 10px |
| 上传约束文案 | `10M以内，分辨率：384*384 ~ 4096*4096，最大宽高比5` | 一致 |
| 上传副文案 | `上传多张图片，开始批量套图换色` | 一致 |
| 颜色选择 tabs | 商品图提色 / 历史使用颜色 | 一致 |
| 参考图拖拽区 | 虚线框 + 批量上传文案 + `本次换色方案 · N 张参考图` | 一致 |
| 换色部位输入 | textarea 264~266×54，radius 6，`0 / 50` 右上计数 | 266×54 / r6 / `0 / 50` |
| 部位 chip | 38×22 / 12px / padding 0 7px / 选中 `#f9f0ff` + `#723cf9` | 一致 |
| 品质按钮 | 75×32 / 14px / 选中 `#f9f0ff` + `#723cf9`，未选白底 `#5a5a66` | 一致 |
| 品质分组容器 | `#f7f7f7` / radius 4 / padding 8 | 一致 |
| CTA 按钮 | 全宽 300×32 / radius 6 / 渐变 `#3B7AF9→#723CF9` / 白字 12px | 一致 |
| CTA 贴底定位 | 内容区独立滚动，按钮固定卡底，距卡底 ~10–11px | 固定卡底，距底 11px（rel 608–640） |

## 交互实测（本地）

| 场景 | 结果 |
|---|---|
| 切换「历史使用颜色」 | 空态文案 `暂无历史使用颜色…` 正常渲染，tabs 高亮跟随 |
| 点击部位 chip | 追加到 textarea，计数 `0 / 50` → `2 / 50`，选中态变紫 |
| 切换品质 | 低/中/高互斥，选中项底色+文字色同步 |
| 未上传商品图 | CTA `disabled=true`，title 提示原因 |
| 参考图拖拽区 | 与颜色选择区联动，方案数随参考图更新 |

## 未对齐（DIFF）

| # | 项 | 原站 | 本地 | 类型 | 说明 |
|---|---|---|---|---|---|
| D1 | 主区起点 | y110（页面顶部有 50px 促销条） | y120（无促销条，框架不同） | 框架层 | 非本组件，左卡自身仍是 651 高 |
| D2 | 禁用原因提示 | 静默置灰，无文案 | CTA 上方一行 `请先上传整套商品图（至少 1 张）`（11px 红字） | 增强 | 可用于可访问性；不改变 CTA 位置（按钮仍贴底） |
| D3 | 右栏空态 | 大引导区（`第一步：上传…` 图文） | tab 条 + 居中空态文案 `拖拽图片到此处或点击上传，支持一次多张` | 结构 | 右栏内容为自研空态；高度已撑满（h-full 居中） |
| D4 | 卡内附加信息 | 无 | 预计输出张数 / 一致性报告入口（有结果时） | 增强 | 产品功能增强，不影响空态外观 |

## 验证命令

```bash
cd web && bun run typecheck                                        # 0 error
bun test src/features/tools/adapters/change-color-v2.test.ts       # 36 pass / 0 fail
```

## 关键实现提示（回归注意）

- 项目 `styles/globals.css` 存在按钮颜色覆盖，**选中态/CTA 文字色必须用内联 `style`**，仅用 Tailwind `text-[#723cf9]` 会被覆盖（本次已修）。
- CTA 必须放在 `shrink-0` 的外层容器（内容区 `flex-1 overflow-y-auto`），否则会随内容滚走。
- 提示行（blocked/notice）放在按钮**上方**，保证按钮始终贴底。
