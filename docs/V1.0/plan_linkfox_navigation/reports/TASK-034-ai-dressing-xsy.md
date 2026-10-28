# TASK-034 AI_DRESSING_XSY「AI试衣XSY」实施报告

- 分支：`feat/linkfox-v1-real`
- 代码提交：`e325ca7` feat(tools): AI_DRESSING_XSY 试衣工作区与提交契约（17 字段/4 步/蒙版真实导出，17 用例）
- 注册表：`registry/index.ts:425` 已有 `id: AI_DRESSING_XSY`、`index: 27`、`makeType: 39`、`layout: "dress"`、`category: product-design`、`slug: ai-dressing-xsy`、`route: /tools/product-design/ai-dressing-xsy`
- 网关：`services/api/tools/gateway.ts:88` 已声明 `kind: "image"`、`requiresReferences: true`、`promptRequired: true`、17 个字段

## 1. 改了什么

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-dressing-xsy.ts` | 871 | 页面契约：17 字段键与真实表单值、两个 Tab（上下装 / 连体）与三槽位（上装/下装/连体）、4 步状态机（模特→服装→蒙版/姿势→生成，含 stale 标记与跳步拦截）、字段级校验（10 个错误码，区分 error/warning）、快照 + 指纹 + 漂移判定、provider/版本/张数能力解析、17 字段合成 `composeXsyFields`、prompt 合成、预计输出与参考图数量 |
| `web/src/features/tools/adapters/ai-dressing-xsy.ts` | 358 | 蒙版逐槽位真实导出（`renderMaskPng`，与源图同尺寸，空蒙版直接抛 `mask-empty`）、单元装配 `buildXsyUnit`（缺图/缺模型/缺字段一律抛错）、请求装配 `buildXsyInput`、`runXsyUnit` 串行提交、`mapXsyTaskToOutcome` 结果判定（成功无图 = 失败）、`xsyResultView` 过期视图 |
| `web/src/components/tools/workspaces/dressing-xsy.tsx` | 936 | 新增 `AiDressingXsyWorkspace`：左「模特 + 风格/姿势/类型 + 版本」· 中「服装上传 + 可涂抹蒙版画布（画笔/橡皮/整件/撤销/清空/覆盖率）」· 右「17 字段自检表 + 结果」。无假结果，条件不足提交禁用并给出原因 |
| `web/src/features/tools/adapters/ai-dressing-xsy.test.ts` | 355 | 17 个用例：字段契约（与网关逐字一致）、默认值、步骤推进拦截、stale 传染、17 字段合成、快照/漂移、能力解析、蒙版栅格化与空蒙版、单元装配抛错、请求装配、结果判定、SSR 首屏 |

## 2. 关键设计决定（都有代码依据）

### 2.1 字段契约以网关为准，逐字对齐

`AI_DRESSING_XSY_FIELD_KEYS` 的 17 个键与 `gateway.ts:88` 的 `fields` **完全一致且无重复**，测试用两处比对（集合相等 + 无重复）钉死。任何一侧漂移都会红。

### 2.2 蒙版不是「标记一下」，而是真实像素

`renderXsyMasks` 用与 area-repair 同一套 `renderMaskPng` 逐槽位栅格化：尺寸严格等于源图 `width × height`，导出 `dataUrl + coverage`。空蒙版按**失败**处理（`mask-empty`），不补白图、不跳过该槽位——没有蒙版就没有穿衣部位。

### 2.3 覆盖率来自真实栅格化，不是估算

`xsyMaskCoverage` 复用 `computeMaskHash`/栅格化路径的同一实现，工作区里显示的百分比就是发请求时的那份像素。低于 0.2% 给 warning（可能只改局部），为 0 给 error。

### 2.4 步骤状态：当前步永远是 active

`xsyStepStates` 的四态语义：`active` = 你正在这一步（哪怕它有错要修）；`pending` = 其他步还有阻断错误；`stale` = 上游改过、需重确认；`done` = 无错且非当前步。`locked` 只看**前序**步骤是否有错，所以不能跳过没填的模特直接去生成。

### 2.5 上游改动只降级下游，不删草稿

`applyXsyEdit(values, patch, changedStep)` → `markXsyStepsStale`：改模特只把 3/4 步标 stale，服装、蒙版、已填字段全部保留。切 Tab 只清空**另一侧**槽位并把 3/4 标 stale（第 2 步是你正要去补的步，不标 stale）。

### 2.6 提交三段守卫，绕过 UI 也发不出去

工作区（提交按钮禁用 + 原因文案）→ `buildXsyUnit`（缺模特图/缺服装图/缺字段直接抛 `XsyAdapterError`）→ `buildXsyInput`（references 必须含模特 + 每件服装图 + 同尺寸蒙版）。适配器测试专门覆盖「直接调适配器」的绕过路径。

### 2.7 失败不伪装

`mapXsyTaskToOutcome`：`succeeded` 但 items 里没有可用图 → `failed` + `empty-result`；`failed` 保留上游 message 与 retryable；`unknown` 明确提示"只能查询或人工确认，禁止盲目重提"；`pending/running` 不算成功。

## 3. 验证方式（实际跑过）

```
cd web && bun run typecheck        # 本次改动 0 新增类型错误
cd web && bun test                 # 860 pass / 0 fail（42 files）
cd web && bun test src/features/tools/adapters/ai-dressing-xsy.test.ts   # 17 pass / 0 fail
```

- 单文件 17 用例全绿，全量 860 用例无回归。
- `typecheck` 剩余 5 条报错全部在**未改动**的 `workspaces/designer.tsx`、`adapters/fission-link.ts`、`fission-link.test.ts`，属分支既有问题（`git status` 中这些文件未被修改），不在本任务范围。

## 4. 未完成与风险

1. **未挂载到工具页**：`DressingWorkspace` 与 `AiDressingXsyWorkspace` 目前只被测试引用，`features/tools/tool-page.tsx` 仍渲染规格占位（该文件注释写明"Until an adapter is wired..."，挂载属于后续 TASK）。因此本任务的可点入口尚不存在，`/tools/product-design/ai-dressing-xsy` 打开看到的是占位页。这是本次最大的未完成项。
2. **未做真实网关联调**：`runXsyUnit` 走 `useToolTaskStore.runTool`，测试用注入的 `port` 与伪造 `ToolTask` 验证判定逻辑，**没有**真实调用上游一次（需要可用 key 与真实模特/服装图）。首次真跑时需确认 `provider` 与 `version` 的取值是否被上游接受。
3. **蒙版上传链路**：当前把蒙版作为 dataUrl 参考图直接带进 `references`。若上游要求蒙版必须是**已入库 URL**（v2 走的是 upload 后再引用），需要在 `buildXsyInput` 前接 `uploadToolAsset`——本轮未做，属已知差异，避免臆造成功。
4. **覆盖率阈值 0.2%** 是经验值（与 v2 同源），未用真实样本校准。

## 5. 使用入口

- 代码：`web/src/features/tools/registry/ai-dressing-xsy.ts`（契约）、`adapters/ai-dressing-xsy.ts`（提交）、`components/tools/workspaces/dressing-xsy.tsx`（界面）
- 测试：`web/src/features/tools/adapters/ai-dressing-xsy.test.ts`
- 路由（挂载后可访问）：`/tools/product-design/ai-dressing-xsy`
