# TASK-023 商品替换（REPLACE_GOODS）施工笔记

## 交付文件

1. `web/src/features/tools/registry/replace-goods.ts` — 契约与纯逻辑：
   - 常量：工具 id/slug/route/layout、上传约束、落位工具（透视/扭曲）、场景变化程度、去噪强度、输出数量、蒙版笔刷、SKU 上限；
   - 几何：`deriveQuadFields`（四边形 → `point/scale/rotate`）、`dragQuadCorner`（透视模式保持对边平行，扭曲模式只动单角）、`moveQuad/scaleQuad/rotateQuad`、`quadArea/quadCoverage/quadBBox/quadIsConvex`；
   - 蒙版：`protectMaskGrid/stampStroke/protectMaskCoverage`（归一化笔画 → 保护网格，覆盖率可量化）；
   - 历史：`createTransformHistory/undoTransform/redoTransform/resetTransform`（每个 SKU 一份，切 SKU 不串配置）；
   - 校验：`validateWorkspace/validateUnit`，返回**具体原因码**（`scene-missing`/`scene-url`/`sku-missing`/`target-missing`/`quad-invalid`/`quad-outside`/`quad-too-small`/`quad-too-large`/`output-num`），不是一句「参数错误」；
   - 快照：`buildUnitSnapshot/unitSnapshotHash/isUnitSnapshotStale`、`composeReplaceGoodsFields`（22 字段）、`composeReplaceGoodsPrompt`；
   - 草稿：`serializeDraftValues/parseDraftValues`（只存可重建参数，不存图片二进制）。

2. `web/src/features/tools/adapters/replace-goods.ts` — 真实执行：
   - 本机真实渲染「落位导引图」PNG（`renderPlacementGuidePng`，按四边形做透视贴图，最大边 1600）与保护蒙版 PNG（`renderProtectMaskPng`，最大边 1280），像素即 provider 输入；
   - `buildReplaceGoodsUnit`（每 SKU 一份请求单元，含 4 张真实参考图：场景原图 / 场景导引图 / 商品原图 / 蒙版）、`buildReplaceGoodsInput`、`assertReplaceGoodsInput`（少图 / 少字段 / 落位非法在发请求前拦住）、`auditReplaceGoodsFields`（逐字段自检，防静默丢参）；
   - `runReplaceGoodsUnit/retryReplaceGoodsUnit/replaceGoodsOutcomeFromTask/replaceGoodsResultView`：结果只来自上游，空结果判失败，绝不补造图片。

3. `web/src/components/tools/workspaces/replace.tsx` — 工作区（layout = replace）：
   - 侧栏锚点 + 四步卡片：参考场景 → 商品与锁定区域（画布）→ 透视/扭曲与场景变化 → 结果；
   - `PerspectiveWarpCanvas`：四个角点可拖动（真实改坐标，pointer capture），角点即 32px 命中区；轮盘/方向键微移、`T/N` 切透视/扭曲、`Z` 撤销、`Shift+Z` 重做、`0` 重置；
   - 多 SKU：默认 1 个，可增删（上限来自 registry），每 SKU 独立四边形 + 蒙版 + 场景变化 + 目标商品图；左右键切画布；
   - 蒙版笔刷/擦除（笔刷大小可选）、保护区域覆盖率显示；
   - 提交按钮实时列出**真实拦截原因**（来自 `validateWorkspace`），不会在缺参时静默提交；
   - 结果区复用 `ToolResult`，并提供「本次输入快照」自检（字段数、蒙版覆盖率、导引面积、是否来自旧版本）；
   - 配置改动后旧结果标记「来自旧版本」，不冒充当前结果。

4. `web/src/features/tools/adapters/replace-goods.test.ts` — 14 例：空态拦截原因、四边形/覆盖率/过小拦截、透视 vs 扭曲几何、蒙版覆盖率、草稿往返（含四边形与笔画）、22 字段审计（删一个字段即被抓出）、提示词与快照失效、提交守卫、真实 `react-dom/server` 渲染断言（区域齐全、默认透视/4 张/定位工具、未上传场景时提交禁用并列出原因、SKU 增删的 disabled 态）。

## 验证

- `cd web && bunx tsc --noEmit` → 全库 0 报错；
- `cd web && bun test src/features/tools` → 462 pass / 0 fail（本任务 14 例）；
- 证据：`evidence/task-023-render.html`（工作区真实渲染 HTML，21KB）、`evidence/task-023-test.txt`、`evidence/task-023-tsc.txt`。

## 本次修正的一处真实缺口

`quadCoverage` 衡量的是「落在画布内的面积比例」，一个缩到几像素、但仍在画面内的四边形原本能通过校验并提交，属于退化落位。已新增 `REPLACE_GOODS_MIN_QUAD_AREA = 0.01` 与 `quad-too-small` 原因码，提交前拦住。

## 已知接线缺口（需共享文件负责人处理）

- `web/src/features/tools/tool-page.tsx` 目前对所有工具只渲染占位工作区，没有任何路由把 `workspaces/*.tsx` 挂上去；本页工作区因此只能通过测试与 `react-dom/server` 真实渲染验证，路由 `/tools/product-design/replace-goods` 打开仍是占位。
- 该文件不在本任务允许改动范围内（同批其他任务共用），未擅自修改。

## 外部能力状态

- 未接入真实替换模型时，提交会因上游未配置而失败并在结果区如实报错（不伪造成功）；本任务不声称 TC-031 已 PASS，验收需在模型接入后按 `evidence/TC-031.json` 复验。
