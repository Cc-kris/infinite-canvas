# 前端 1:1 对齐 — 方法与现状（2026-10-30）

## 结论
39 个工具页确实**不是** 1:1：内容区文本级比对（去掉 LinkFox 外壳词后）
**缺失合计 1215 条 / 多余合计 594 条**。

根因不是"没做"，而是**两套不同源**：
- 原站页面 = Ant Design + `_content_*` 布局，DOM 里 40–77 条内容文本/页
- 本地页面 = `web/src/components/tools/workspaces/*.tsx`（约 3.2 万行）按
  `docs/V1.0/plan_linkfox_navigation/page-specs/` 的**自建规格**写出来，不是按原站 DOM 抄

所以之前"验收通过"验的是自建规格，不是原站。

## 证据链
| 环节 | 位置 |
|---|---|
| 原站 DOM 证据（2026-10-28 抓） | `docs/V1.0/plan_linkfox_navigation/evidence/page-dom-20261028/*.json` |
| 原站证据转标准 JSON | `.verify-tools/frontend-diff/orig-json/`（41 份） |
| 本地 39 页抓取 | `.verify-tools/frontend-diff/local-dom2/`（同一段 `capture_page.js`，视口 1920×839） |
| 抓取脚本 | `.verify-tools/frontend-diff/capture2.mjs`（复用仓库根 `capture_page.js`） |
| 工单生成 | `.verify-tools/frontend-diff/spec3.py` |
| 工单产出 | `docs/V1.0/replica/frontend-1to1/<TOOL>.md` + `00-INDEX.md` |

## 已知坑
1. 原站证据文件是 **Python repr 混 JS 字面量**（`True/False/None` 与 `true/false/null` 并存）
   → 用引号状态机只替换字符串外的裸词再 `ast.literal_eval`（`convert-orig.mjs` 会失败）。
2. 多数原站证据是**旧脚本**抓的：无 `viewport`、无 `textEls`、`regions` 无坐标
   → 只有 ~9 个工具能算几何对齐，其余只能做**文本级**比对。
3. 本地内容区判定：优先 `cls` 含 content/workspace/panel 且面积 ≥20 万 px，其次 `MAIN`
   （早期按 `MAIN` 优先会误选 14×14 视口外元素 → 元素数全 0）。
4. 派 worker：任务目录必须在 `temp/<task>/`；`ga_worker.py` 在 `managed-ga-state/memory/`，
   不是 `temp/memory/`。

## 派工（2026-10-30）
5 个 worker（claude-opus-5-5）按 workspace 文件切批，避免同文件冲突：
- fx_b1: suite / dress-suite / color-v2 / translate
- fx_b2: enhance / outpaint / mask / color / crop
- fx_b3: repair / printing-repair / scene / scene-fission / replace / handheld-goods
- fx_b4: dressing / dressing-xsy / model / dress / pod / text / extract / image-text-edit / designer
- fx_b5: video / video-translation / image-to-video / new-replace-bg-v2

验收：`npx tsc --noEmit` + `npm run build` 通过；各工具工单 B 全落地、C 全移除。
