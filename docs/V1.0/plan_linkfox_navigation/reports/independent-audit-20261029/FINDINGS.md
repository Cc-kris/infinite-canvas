# 独立证据审计 · 工作草稿（审计中，最终以 matrix.md / report.md 为准）

- 审计对象：`docs/V1.0/plan_linkfox_navigation/reports/scope-reaudit-20261029.md`（HEAD fcb1b69 生成，最新 HEAD 9edebbe）
- 代码：`docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py`、`tools/recompute_scope_matrix.py`
- 当前 HEAD：`9edebbe`（审计期间由其他 worker 推进，功能源码未由本审计改动）

## 已确认的口径问题（旧矩阵 → 独立结论）

1. **H 历史 20 个 PASS 不成立**：`web/scripts/real-acceptance/run-b5-history-dock.mjs:96-106,180` 用 `store.persistTask(task)` 注入任务快照，再刷新验证面板。
   - HEAD 版 `evidence/real-acceptance/B5_HISTORY_DOCK/summary.json`：17 工具、passed=17。
   - 工作树未提交版：20 工具、passed=4、results 仅 4 条。
   - `recompute_scope_matrix.py:131-134` 把两版 toolId 取并集 → 20 个 H=PASS。
   - 结论：B5 只证明「共享历史面板能渲染注入快照」，不能证明「工具真实提交→自动入库→刷新可回溯」。H 应为 PARTIAL。
2. **R 真实生成含截图充数**：
   - `FIX_COLOR`：目录只有 1440×900 UI 截图（step-1/2/ui.png/ui-error.png），无产物；旧矩阵 R=PASS。
   - `AI_TEXT`：只有 1920×839 面板截图；`result.json` 自述 `0X-result.png` 是「结果面板截图（非结果图本体）」，b64 响应被截断；无可复核产物字节/URL。
   - `SDS_DESIGN`：real-acceptance 目录只有 1920×839 截图；但 `design19-cases-20261029/sds/result-1780443735213010944.png`（1024×1024，1.44MB）+ run.json network 200 可作 R 证据。
   - `VIDEO_TRANSLATION`：无任何视频产物，旧矩阵 R=PASS；result.json 记录未取得成功样例。
   - 旧脚本 `media_bytes()` 取目录最大媒体文件，1440/1920 宽截图 >100KB 即判 PASS。
3. **K 案例口径**：
   - `b6-cases/visual-parity.json` 明确 `SCALE_UP` 原站页面**没有**「优秀案例」页签（origin/SCALE_UP-cases.json 为空），旧矩阵却写「原站有案例模块→MISSING」；应为 N/A（本地同样不新增，一致性正确）。
   - `IMAGE_TO_VIDEO` 原站有 10 张视频卡+做同款，本地未接线 → MISSING（成立）。
   - `NEW_REPLACE_BG_V2` 原站页面未取得（只有 supplemental 片段）→ 案例维度 N/A/未取证，不能称“原站无案例”。
   - 9 个 K=PASS 均有实测文件：design19-cases 5 个（run.json + 01-applied.png + result-<caseId>.png 1024×1024 + summary）、SUITE6 cases-apply-evidence.json 3 个、AI_OUTPAINTING（b6 visual-parity + run-outpaint-cases.json + 4 张截图）。
4. **F 功能闭环的动作证据**：
   - 逐工具 `b4-actions.json` / `*actions*.json` 含下载字节、存入资产、发送画布回执的可作为独立动作证据（例：`NEW_REPLACE_BG_V2/b4-actions.json` 下载 1109268B、存资产 id、项目 id）。
   - `AI_DRESSING_V2`/`AI_POSTURE`/`AI_WEARABLE` 的 result.json 自述「下载/存资产/发画布未执行」，但目录有 b4-actions.json 且字节与 result1.png 一致 → 动作证据成立，但需注明来自 b4 独立动作轮次，而非同一提交链路。
   - 无 b4/动作回执的：SDS_DESIGN、AI_TEXT、PRODUCT_SCENE、ORNAMENT_TEXT、PRINT_EXTRACT、NEW_DESIGNER、PRODUCT_MARKET_MATERIAL、REPLACE_GOODS、SCENE_TRANSFER、IMAGE_TO_VIDEO（仅生成+入资产）→ F 至少 PARTIAL。
5. **scope_audit 现状（HEAD 9edebbe 工作树）**：errors=1、warnings=21。
   - error：`web/src/components/tools/workspaces/suite.tsx:644` `(N算力)` 计费文案（PIS/PMM 共用 → T PARTIAL）。
   - warning：`video.tsx` 12 处 case-module 占位、`video-translation.tsx` 3 处、`suite.tsx` 2 处 + 4 处原站像素色 `#723cf9`（U PARTIAL 仅 PIS/PMM）。
   - 旧报告称「designer 页面一句提及原站」不在本次 findings，需以新审计为准。
6. **其他 worker 提交**（审计窗口，旧报告基线 fcb1b69 → 当前 HEAD）：见 report.md 的提交清单；本审计只新增 reports/independent-audit-20261029/ 与 tools/independent_evidence_audit.py，不改功能源码/旧证据。

## 验证命令与结果
- `python3 tools/scope_audit.py --json reports/independent-audit-20261029/scope-audit.json` → errors=1 warnings=21
- `bun run typecheck`（web）→ exit 0
- `bun test src/components/tools/workspaces ...` → 57 pass / 0 fail
- `python3 tools/recompute_scope_matrix.py --json /tmp/... --md /tmp/...` → 旧口径复算（用于对照）

## 待办
- 解析 b4 三动作完整性 → 生成独立 matrix（F/T/R/H/K/U + 每格证据路径）
- 写 report.md（含缺口/阻塞/证据索引），提交
