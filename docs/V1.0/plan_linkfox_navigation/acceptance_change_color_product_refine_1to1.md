# CHANGE_COLOR / PRODUCT_REFINE：同工具 LinkFox 1:1 对照（feat/linkfox-v1-real）

- 原站：`https://www.linkfox.com/draw/change-color`、`https://www.linkfox.com/draw/product-refine`
- 原站证据来源：`page-specs/09-change-color.md`、`page-specs/11-product-refine.md` §9「原站实测文案摘录」（`workspace_dom` 级证据）
- 本站路由：`/tools/smart-edit/change-color`、`/tools/smart-edit/product-refine`
- 机器可读结果：`evidence/real-acceptance/CHANGE_COLOR/result.json`、`evidence/real-acceptance/PRODUCT_REFINE/result.json`（verdict 均为 `PASS`）
- 浏览器实测脚本：`web/scripts/real-acceptance/run-reuse-actions.mjs`（真 Chrome + 真实产物流转，不重调上游、不 mock）

## 1. 一键换色 `CHANGE_COLOR`

| # | 原站文案/功能（DOM 实测） | 本站实现 | 实测证据 | 结论 |
|---|---|---|---|---|
| 1 | 从本地上传 | 上传区 `tool-asset-dropzone` + `tool-asset-file-input` | 截图 `step-1-loaded.png` | ✅ 1:1 |
| 2 | **从作品库选择** | 资产库入口「从资产库选择（N）」+ 点「使用」采用图片 | `run.json → libraryEntryAfterSave.summary = 从资产库选择（1）`；`libraryAdopt.draftItems = 1` | ✅ 等价（命名按本站资产域） |
| 3 | 从商品库选择 | 未实现独立商品库（本站无商品库域） | — | ⚠️ 记为偏差，见 §3 |
| 4 | **批量一键换色** | 入口链到批处理工具 | `run.json → batchLink.href = /tools/ecommerce-suite/change-color-v2` | ✅ 1:1（跳批量工具） |
| 5 | 选择颜色 / 拖拽或点击上传颜色参考图 / 10M以内 jpg/jpeg/png/webp | 颜色参考图上传 + 约束校验 | 截图 `step-1-loaded.png`；约束在 `tool-asset-input` 上 | ✅ 1:1 |
| 6 | 去除杂色（开启/关闭） | 去杂色开关 | 截图 `step-2-submitted.png` | ✅ 1:1 |
| 7 | 细调颜色效果：色调/饱和度/亮度/对比度 + 重置 | 四滑块 + 重置 | 同上 | ✅ 1:1 |
| 8 | 光影优化 / 边缘优化 / 颜色边缘修复（开启/关闭） | 光影与边缘三开关（强度可调） | 单测 `color.test.tsx`「光影优化默认开启但强度可调」 | ✅ 1:1 |
| 9 | 立即生成（10算力） | 提交按钮「立即生成（10 算力）」 | `empty-state.json → submitLabel` | ✅ 1:1 |
| 10 | **生成结果** | 结果 tab「生成结果」 | `run.json → tabs = [生成结果, 历史记录]` | ✅ 1:1 |
| 11 | **历史记录** | 历史 tab：本工具任务倒序、缩略图、查看结果 | `run.json → history.count = 1`，缩略图 `naturalWidth = 1024` | ✅ 1:1 |
| 12 | 暂无生成结果图 / 快在左侧操作物品换色吧~ | 结果区空态原站同款文案 | `empty-state.json → emptyText` | ✅ 1:1 |
| 13 | 优秀案例（展示位） | 未实现 | — | ⚠️ 偏差，见 §3 |
| 14 | （原站结果操作：下载/收藏） | 下载 / 存入资产 / 发送画布 | `saveFeedback=已保存到资产库（…）`、`canvasFeedback=已发送到画布（…）`、`canvas.after` 新增 1 节点 | ✅ 本站能力对齐（含原站未有动作） |

## 2. 商品精修 `PRODUCT_REFINE`

| # | 原站文案/功能（DOM 实测） | 本站实现 | 实测证据 | 结论 |
|---|---|---|---|---|
| 1 | 上传图片 / 从作品库选择 | 商品图上传 + 资产库入口「从资产库选择（N）」 | `run.json → libraryEntryAfterSave.summary`、`libraryAdopt.draftItems = 1` | ✅ 等价（命名按本站资产域） |
| 2 | 精修模式：整图精修 / 去背景精修 | `PRODUCT_REFINE_MODES`：整图精修、去背景精修（共 4 档，含质量/尺寸组合） | 单测 `enhance.test.tsx`「四种模式与三档质量按页面规格渲染」 | ✅ 1:1 |
| 3 | 拖拽 或 点击上传需要修复的图 / 20M以内 jpg/jpeg/png/webp | 上传区 + 约束校验 | 截图 `step-1-loaded.png` | ✅ 1:1 |
| 4 | 默认生图尺寸规则提示（≤512→×4，513~1024→×2，>1024→原尺寸） | 页面同款提示文案 | `enhance.tsx` 提示块（单测覆盖「4096 上限」） | ✅ 1:1 |
| 5 | 开始精修 | 提交按钮 | `run.json`（提交按钮文案取自页面） | ✅ 1:1 |
| 6 | 生成结果 | 结果 tab | `run.json → tabs = [生成结果, 历史记录]` | ✅ 1:1 |
| 7 | **历史记录** | 历史 tab：本工具任务倒序 + 缩略图 + 查看结果 | `history.count = 1`，缩略图 `naturalWidth = 2048` | ✅ 1:1 |
| 8 | 暂无生成结果图 | 结果区空态标题同款 | `empty-state.json → emptyText` 以「暂无生成结果图」开头 | ✅ 1:1 |
| 9 | （原站结果操作） | 下载 / 存入资产 / 发送画布 | `saveFeedback`、`canvasFeedback`、`canvas.after` 新增 1 节点 | ✅ 本站能力对齐 |

## 3. 偏差（明确记录，不当作 PASS 掩盖）

1. **优秀案例展示位（CC）**：原站有一个样例画廊；本站无授权样例图，且 `page-specs/09` §1 的信息架构未把它列入必须区域。**未实现占位画廊**，避免用假图充数。
2. **从商品库选择（CC）**：本站没有「商品库」域（全局仅在 sds-design / image-to-video / tool-asset-input 以字符串形式出现），因此该入口以「从资产库选择」覆盖，未新建商品库。
3. **算力文案**：原站 `10算力`，本站渲染为 `立即生成（10 算力）`（含空格，来自设计令牌排版）。

## 4. 复现方式

```bash
cd web
node scripts/real-acceptance/run-reuse-actions.mjs   # 复用真实 oss 产物，验证 历史/查看结果/存入资产/发送画布
```

脚本会刷新页面后从 localStorage 读回历史任务、点真实按钮、读取资产库与画布 store 的真实增量，并把 `run.json` + 截图写进 `evidence/real-acceptance/<TOOL>/`。
