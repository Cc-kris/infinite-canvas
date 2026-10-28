# TASK-019 实施报告：FIX_COLOR「色差修复」真实工作台

- 分支：`feat/linkfox-v1-real`
- 代码提交：`d5fff8f` — `feat(tools): FIX_COLOR 色差修复真实工作台（涂抹区域蒙版+区域色/目标色ΔE+3版本指令+7字段防丢参+结果过期）`
- 规格：`../page-specs/12-fix-color.md`（路由 `/tools/smart-edit/fix-color`，页面类型 `repair`，makeType 26）
- 证据：`../evidence/task-019-verification.txt`（bun test + 全仓 tsc 原始输出）

## 1. 交付内容

| 文件 | 行数 | 作用 |
|---|---|---|
| `web/src/features/tools/registry/fix-color.ts` | 454 | 工具契约：常量/路由/提交字段、颜色规范化与 CIE76 色差、蒙版复用、提交校验、快照指纹、字段组装、草稿 parse/serialize |
| `web/src/features/tools/adapters/fix-color.ts` | 275 | 请求层：参考图转换、提示词、单结果单元、`runFixColor`（注入 ProviderPort）、任务→结果映射与结果视图 |
| `web/src/components/tools/workspaces/repair.tsx` | 865 | 工作区：`RepairWorkspace`（按 layout 分发）+ `FixColorWorkspace` 本页真实交互 |
| `web/src/features/tools/adapters/fix-color.test.ts` | 392 | 19 个测试 / 102 条断言 |

### 1.1 注册表层（registry）

- 字段落点与 `registry/index.ts` 的 `f("...")` 逐个同名：`fixColorSegUrl`、`fixColorUrl`、`imageName`、`imageResultUrl`、`imageSegUrl`、`imageUrl`、`version`（7 个，测试用 ToolSpec 反查比对，不是硬编码列表）。
- `normalizeColorHex` 接受 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA`（缺 `#` 亦可），非法值返回 `null`——调用方必须显示字段错误，**不允许**静默回退默认色再提交。
- `formatColorInput` 是宽松输入格式化（非法输入原样回显），合法性由 `validateFixColorInput` 把关，两者职责分离。
- `colorDeltaE` 用 sRGB→线性→XYZ→Lab→CIE76，`describeColorDelta` 输出「肉眼几乎无差别 / 轻微差异 / 明显差异 / 强色差，需要校正 / 颜色待填写」。
- 三个校正版本都带真实下发指令语义，不是空标签：
  - `match-region` 参考匹配：只把选定区域对齐目标色，保留明暗与材质；
  - `neutralize` 色偏中和：按区域平均偏色中和整片偏黄/偏蓝；
  - `local-patch` 局部补色：只修补反光/污渍等局部异色，边缘自然过渡。
- 提交校验拒绝「空蒙版」「区域色=目标色」「未知版本」「非位图/过小源图」，抛 `FixColorAdapterError` 且 `code` 可断言；`assertFixColorInput` 缺字段即拒（防丢参）。
- `buildFixColorSnapshot` 生成稳定指纹：同配置同 hash，改色/改版本/改蒙版即变。

### 1.2 请求层（adapters）

- `toFixColorReference` / `buildFixColorPrompt`：原图 + 蒙版 PNG 两张参考图，提示词带区域色 `#RRGGBB`、目标色、版本指令、只改区域不改背景。
- `buildFixColorUnit` 单结果单元（`batchCapable=false`）；`runFixColor` 通过注入的 `ProviderPort` 真实提交，透传任务状态。
- `fixColorRunFromTask`：`succeeded` 但没有图片 → 判 `failed`（`empty-result`），**不补造**；`failed/cancelled` 透传上游错误。
- `fixColorResultView`：`running` / `stale`（快照 hash 不一致 → 「来自旧版本」标记）/ `failed` 三态都不冒充成功。

### 1.3 工作区（repair.tsx，layout `repair`）

`RepairWorkspace` 按 `ToolSpec.layout === "repair"` 分发：只有 `FIX_COLOR` 走真实工作区，其他 repair 工具（如 `HAND_REPAIR`）显示「尚未接入」，**不**用通用占位卡冒充可用。

`FixColorWorkspace` 实际区域：

1. **色差源图**：`ToolAssetInput`（maxCount=1）+ 文件名/尺寸 + 「更换图片」（同时清空旧结果与任务）。
2. **涂抹区域**：画笔/橡皮切换、笔刷粗细（`FIX_COLOR_BRUSH_MIN..MAX`）、撤销/重做/清空、`已涂 N 笔`、覆盖率百分比；画布是真实 `<canvas>` 叠加在图上，指针事件绘制，笔画进共享蒙版历史。
3. **颜色**：区域色（被判定偏色）与目标色两个 ColorPicker + hex 文本，实时显示 ΔE 与可读描述；点色块设为目标色。
4. **修复版本**：3 个版本按钮，切换即持久化，旧结果标「来自旧版本」。
5. **结果对比**：推拉对比（分割线 range，`clampCompareSplit`）/ 并排 / 只看结果；stale 时黄条提示「参数已改动，下面这张图来自旧版本，请重新提交」。
6. **提交**：`开始修复`（disabled 条件 = 无图 / 空蒙版 / 同色 / busy）；失败/校验提示落在 `fix-color-notice`；下方明确写「提交会真实调用当前图像模型；未返回图片即判失败，不会用占位图代替」。
7. **结果区**：`ToolResult` 显示任务状态，单结果重试走同一快照。

草稿：`tool-draft:v1:FIX_COLOR`（`FIX_COLOR_DRAFT_KEY`），持久化 state + imageName + version + regionColor + targetColor + compareMode；刷新后 `hydrate` 恢复，脏标记与写回走共享 `use-tool-draft-store`。

## 2. 验证（均为实跑，不是读码）

```
bun test src/features/tools/adapters/fix-color.test.ts
 19 pass / 0 fail / 102 expect() calls
```

覆盖点：ToolSpec 契约与字段同名、默认值区间、草稿 key、颜色归一化/ΔE 文案、提交校验（空蒙版/同色/未知版本/源图限制/缺字段）、快照指纹稳定性、unit 组装、`runFixColor` 透传、结果三态、对比分割线与文件名纯函数、草稿 round-trip、SSR 渲染断言（首屏含色差源图/涂抹/区域色/目标色/版本，未上传时提交按钮 `disabled`，无假结果）。

```
tsc --noEmit（全仓）
 本次运行仅剩他人并行在写的文件报错（先 hand-repair.ts 2 处，后 printing-repair.tsx `clampCompareSplit` 2 处）；
 本任务 4 个文件 0 错误（`grep fix-color` 无输出）。
```

## 3. 已知缺口与风险

1. **路由接线未通（跨任务共性缺口）**：`tool-page.tsx` 仍渲染 `WorkspacePlaceholder`，没有任何 workspace 分发点，因此本页在浏览器里还进不到真实工作区。工作区组件已导出并在 SSR 测试中直接渲染验证；需要一条统一接线任务（把 `layout` → 工作区映射放进 `tool-page.tsx`）才能端到端点开。
2. **AC-027 未签收**：`acceptance.md` 中 AC-027 仍「待实施」，需要真实上游模型 `enabled=true` 跑一次得到 `evidence/AC-027-fix-color.json`；`enabled=false` 时应登记 BLOCKED，不能整体 PASS。
3. **点色块取色**：当前是「区域色/目标色点选 → 设为目标色」的颜色块交互，未接入画布吸管（EyeDropper）真实取像素；如需从原图吸色，是后续增强项。
4. **并行工作区噪声**：仓库根有他人未跟踪的 `*.json`（各工具 schema 导出）与并行新增的 `registry/*.ts`、`workspaces/printing-repair.tsx`，本任务未触碰、未 `git add`。

## 4. 使用入口

- 代码入口：`web/src/components/tools/workspaces/repair.tsx` 的 `RepairWorkspace`（路由用）/ `FixColorWorkspace`（本页直连，测试与本地 SSR 渲染用）。
- 契约入口：`FIX_COLOR_TOOL_ID` / `FIX_COLOR_ROUTE` / `FIX_COLOR_SLUG` / `FIX_COLOR_DRAFT_KEY`；请求入口：`runFixColor({ unit, port })`。
- 验证入口：`cd web && bun test src/features/tools/adapters/fix-color.test.ts`。
