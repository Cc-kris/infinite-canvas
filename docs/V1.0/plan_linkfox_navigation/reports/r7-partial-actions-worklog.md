# R7 仍 PARTIAL 的真实功能动作修复 · 工作日志（2026-10-29）

范围：IMAGE_TRANSLATION / CHANGE_COLOR / PRODUCT_REFINE / HAND_REPAIR / REPLACE_GOODS / PRODUCT_SCENE / PRINT_EXTRACT / PRODUCT_MARKET_MATERIAL
边界：不重新生成结果、不注入历史任务、不做 designer/batch/视频；复用已有真实结果与共享 `ToolResult` 三动作。

## 事实基线

- 本地栈：Vite dev `http://127.0.0.1:3000`（node 已监听，200）；canvas-proxy `http://127.0.0.1:23210`（200）。
- 审计口径：`docs/V1.0/plan_linkfox_navigation/tools/independent_evidence_audit.py` 里 `E` 表为人工登记，F=PASS 需已提交的三动作机器回执（JSON：下载字节/sha256、资产 id、画布 projectId）。
- 共享动作层：`web/src/components/tools/tool-result.tsx` + `tool-result-actions.ts`
  （`downloadResultItem(s)` / `saveResultItemToAssets` / `sendResultItemToCanvas`），`resultItems()` 已按 mimeType 兜底推导 `kind`。

## 根因（真缺陷，非仅缺证据）

1. `REPLACE_GOODS`：`features/tools/adapters/replace-goods.ts:423` 结果过滤 `item.kind === "image"`，
   上游返回的项若只带 url/mimeType（历史恢复、url 形态），会被判 `empty-result` → 结果区静默清空。
   共享 `resultItems()` 已有 mime 兜底，但适配器没用它。
2. `PRINT_EXTRACT`：`printExtractResultView` 把 `task.status === "unknown"` 映射成 `running`，
   卡片永远显示「提取中」；而 `TaskStatusPanel` 对 unknown 有正确的「结果未知/需人工确认」口径。
   两处口径不一致 → 卡片停在 running。

## 修复

- 新增 `web/src/lib/result-item-kind.ts`：`withDerivedKind` / `deriveResultKind`（按 mimeType / blob.type / dataUrl 前缀）。
- `tool-result-actions.ts` 内部改用共享实现（行为不变）。
- `replace-goods.ts`：结果提取改用 mime 兜底后的 kind，并保留 `payloadDropped` 语义。
- `print-extract`：视图状态新增 `unknown`；注册表 `PrintExtractItemStatus` 新增 `unknown`；
  工作台卡片显示「结果未知」并给出「请先人工确认上游，勿重复提交」，不渲染重试按钮（避免重复扣费）。

## 状态

（随进度更新）
