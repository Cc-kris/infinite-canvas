# AREA_REPAIR · 与 LinkFox 原站 1:1 对照

- 本地路由：`/tools/smart-edit/area-repair`（`MaskWorkspace`）
- 原站：`https://www.linkfox.com/draw/area-repair`，证据级别 `workspace_dom`
- 规格来源：`docs/V1.0/plan_linkfox_navigation/page-specs/07-area-repair.md`
- 对照时间：2026-10-29（分支 `feat/linkfox-v1-real`）
- 对照方式：原站文案（page-specs §9 摘录）+ 本地真实 DOM `data-testid` + 真实出图证据，三方交叉，不靠推测。

## 1. 控件级对照

| 原站控件（page-specs §2/§9） | 本地实现 | 本地锚点 | 实测结论 |
| --- | --- | --- | --- |
| 画笔 / 大小：像素 | 画笔尺寸滑杆 | `mask-tool-brush` + `mask-brush-size` | 有 |
| 橡皮 | 橡皮工具 | `mask-tool-eraser` | 有（原站文案未列，属本地增强，不影响 1:1） |
| 自动扩大选择区域 | 自动扩边开关 | `mask-auto-expand` | 有 |
| 反选 | 反选按钮 | `mask-invert` | 有 |
| 撤销 / 重做 / 重置 | 三个按钮 | `mask-undo` / `mask-redo` / `mask-reset` | 有 |
| 涂抹画布 | 1024×744 画布（box 830×603） | `mask-canvas` | 有，pointer 事件实测 33 条 |
| 覆盖度提示 | 「N 笔 · 覆盖 x%」 | `mask-coverage` | 有 |
| 重绘描述* 0/600 | 文本域 + 上限 | `area-repair-prompt` | 有 |
| 生成张数 1/2/3/4 | 张数选择 | `area-repair-output-num` | 有 |
| 立即生成（40算力） | 生成按钮，**不显示算力** | `area-repair-submit` | 有；算力属实现边界排除项 |
| 生成结果 / 历史记录 | 结果区 + 历史 | `area-repair-results` / `area-repair-result-feedback` | 有 |
| 暂无生成结果图（空态） | 同文案空态 | — | 有（`ui.png`） |
| 结果卡动作 | 存库 / 发画布 / 下载 | `area-repair-save-{n}` / `area-repair-send-{n}` / `area-repair-download-{n}` | 有，**三个动作本次均真实点通** |

## 2. 比原站多做的两件事（不是缺口）

1. **结果逐张回流**：原站是整批返回；本地改为每张完成即进结果区（`mask.tsx` 用 `onOutcome`），避免 2 张时用户长时间看不到图。
2. **提交串行化**：同一通道并发 2 会让两个单元都卡在 `submitting`（实测），改为 `concurrency: 1` 串行提交，总耗时 ≈ 2×36s，但每张都能落地。

## 3. 真实证据（非 mock）

| 证据 | 文件 | 关键值 |
| --- | --- | --- |
| 上游真实调用 | `result.json.upstream` | `POST /v1/images/edits` 200 / 36270ms、200 / 36342ms |
| 结果图 1 | `result.png` | 1024×1024，943932B，sha `3cf14369ab4539a9` |
| 结果图 2 | `result-2.png` | 1024×1024，907235B，sha `c1731841bb091051` |
| 下载 | `result.json.download` | href=OSS 地址，filename=`product-watch-repainted.png` |
| 存库 | `result.json.asset` | assetId `U_TaBRV2fBhWCEm-hu6Ug`，source `area-repair` |
| 发画布 | `result.json.projectId` | `bzQ2ePN7UDxTFI1nbkfWy` |
| 资产库回验 | `assets.png` | 该结果标题「product-watch.jpg 第 1 张」可见 |
| 画布回验 | `canvas.png` | `/canvas/bzQ2ePN7UDxTFI1nbkfWy` 出现新节点 |

## 4. 未覆盖 / 风险

- 响应式（1920/1440/1024/768/390px）与深色模式未在本轮取证。
- 「单结果重试 / 查看输入快照」未逐项取证（按钮存在于结果卡，本轮未点击）。
- 算力文案按实现边界不展示，与 page-specs §4「不显示原站算力」一致，非缺口。
