# TASK-029 AI_TEXT「POD素材」实施报告

- 分支：`feat/linkfox-v1-real`
- 代码提交：`7de4b40` feat(tools): AI_TEXT POD素材工作区与提交契约（31 用例）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/22-ai-text.md`
- 路由：`/tools/product-design/ai-text`（registry `id: AI_TEXT`, `layout: "pod"`, `slug: ai-text`, `makeType: 14`）

## 1. 改了什么

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-text.ts` | 680 | 页面目录（模式 / 比例 / 风格 / 中文风格）+ 证据标记、`validateAiTextState` 字段级校验、提示词与自动扩写、平铺预设与落位、快照指纹与漂移、草稿 schema 与回落、案例变体继承 |
| `web/src/features/tools/adapters/ai-text.ts` | 373 | 请求字段装配（14 个上游字段全覆盖）+ 逐字段回读审计、提交前守卫（缺图/丢平铺/丢数量/丢文案直接抛错）、`runAiText` / `retryAiText`、结果提示与 stale 判定 |
| `web/src/components/tools/workspaces/pod.tsx` | 690 | 工作区三区布局：左「素材与风格」/ 中「平铺预览」/ 右「结果」；拖拽 + 键盘落位（方向键移动、+/- 缩放、⌘Z/⇧⌘Z）；移动端分区页签；无假结果 |
| `web/src/features/tools/adapters/ai-text.test.ts` | 461 | 31 个用例 |

### 1.1 字段与页面规格对齐

页面规格列出的 14 个字段全部落位：`aiSimpleTextPrompt`、`imageUrl`、`isCase`、`mode`、`outputNum`、`prompt`、`ratio`、`requestId`、`responseId`、`styles`、`stylesCn`、`tilingPreset`、`useAutopromptOption`、`variationStrength`。

- `prompt` 由 `buildAiTextPrompt` 统一合成（含平铺规则句），`aiSimpleTextPrompt` 独立保留，二者不互相覆盖；`aiSimpleTextPrompt` 上限 200 字（`AI_TEXT_SIMPLE_PROMPT_LIMIT`），超长在草稿读取时截断。
- `useAutopromptOption` 与 `autopromptUnlocked` 联动：自动扩写在未解锁时禁用，提交时只下发布尔态，不把本地 UI 态透传成业务值。
- `isCase`（案例变体）通过 `inheritAiTextCase` 继承配置但不继承文案，且强制新建任务（新 `requestId`）。
- `stylesCn` 与 `styles` 同源联动：`aiTextStyleLabelCn` 由英文 id 反查中文标签。

### 1.2 枚举取值来源（重要）

上游 chunk / 模型目录在本仓库没有实现（`rg "catalog"` 在 `src/stores`、`src/services/api/tools` 无命中），因此按仓库既有做法（`registry/ai-wearable.ts` 的 page catalog）实现：

- `AI_TEXT_MODE_CATALOG` / `AI_TEXT_RATIO_CATALOG` / `AI_TEXT_STYLE_CATALOG` 为页面目录，带证据标记：
  - `page-catalog`：本页维护，chunk 未确认；
  - `provider`：由调用方（模型目录）下发。
- `resolveAiTextCatalog(source)` 优先用 provider 下发值，缺失维度回落页面目录；`aiTextPageCatalogDimensions(source)` 指出仍在用页面目录的维度，UI 以 `AI_TEXT_CATALOG_NOTICE` 明示。
- 校验只接受目录内取值，越界报 `mode-unknown` / `style-unknown` / `styles-cn-unknown` / `tiling-unknown`，不做自由拼接。

修复的真实缺陷：`stylesCn` 的页面目录兜底原先用英文 id 作枚举 id，而 `stylesCn` 字段承载中文风格名，导致「复古」被判为不在目录（阻断提交）。已改为以中文标签作 id，并在代码中写明原因。

### 1.3 防丢参与快照

- `auditAiTextFields`（`assertAiTextFields`）：对 14 个字段做「期望值 vs 实际下发值」逐字段比对，输出 `missing` / `unexpected` / `mismatched`，测试覆盖「compose → audit 无未绑定字段」。
- `validateAiTextState` 在发请求前返回阻断项（缺参考图、缺模型、枚举越界、平铺越界、数量越界、简单提示词超长等），adapter 在 `submit` 前抛 `AiTextAdapterError("invalid-config")`，**不发请求**。
- `createAiTextSnapshot` 记录 `fingerprint`（所有真实参数参与）、`requestId`、`revision`、`sourceAssetIds`；`describeAiTextDrift` 产出可读漂移原因，参数变化即判定旧结果 stale。

### 1.4 平铺预览交互

- `AI_TEXT_TILING_PRESETS`（单张 / 2×2 / 错位 2×2 / 3×3 等）驱动预览网格与提示词里的平铺规则句（错位预设会追加「隔行错半格，接缝处必须连续」）。
- 落位坐标与缩放做夹取（`clampAiTextPlacement`），历史栈支持 `commit / undo / redo`，键盘 `placementKeyboardDelta` 与拖拽共用同一提交入口，避免两条路径状态不一致。
- 无障碍：预览区 `tabIndex=0`、`aria-label` 说明方向键/±/⌘Z 用法，按钮最小 40×40。

## 2. 如何验证

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
export PATH="$HOME/.bun/bin:$PATH"

# 1) 本任务单测（31 例全绿）
bun test src/features/tools/adapters/ai-text.test.ts
# => 31 pass / 0 fail / 130 expect() calls

# 2) 本任务三个源文件的类型检查（独立 tsconfig，避免被他人未提交文件干扰）
bunx tsc --noEmit -p /tmp/tsconfig.ai-text.json
# => 无输出，exit 0
```

用例覆盖明细：

| 分组 | 用例要点 |
| --- | --- |
| 目录与证据标记 | provider 缺失回落页面目录、provider 下发即覆盖、英文风格与中文风格同源联动 |
| 校验 | 完整配置无阻断；缺图 / 缺模型 / 枚举越界 / 平铺越界 / 数量越界 / 简单提示词超长逐项报码；空目录不误报 |
| 提示词 | 平铺规则句、风格行、自动扩写开关、简单/完整两种编辑器 |
| 请求组装与防丢参 | 14 字段齐备、`fields` 与 `prompt` 一致、源图格式/体积/边长约束、`requestId` 稳定可复现 |
| 快照 | 指纹随每个真实参数变化、漂移原因逐项可读、草稿非法值夹回且序列化不含二进制、案例变体继承规则 |
| 平铺预览 | 越界坐标与缩放夹取、提交/撤销/重做历史一致、键盘步进 |
| 真实执行 | 守卫在发请求前拦截、提交即终态、仍在跑则等待、失败透出上游错误、retry 复用 `requestId` 且网关不支持时明确报错、0 张图按失败处理并标 stale |
| 渲染 | 首屏三块区域齐备、阻断态提交按钮 disabled、无假结果 |

## 3. 未完成 / 风险

1. **路由接线缺口（仓库级，非本任务引入）**：`src/features/tools/tool-page.tsx` 目前对所有工具渲染 `WorkspacePlaceholder`，仓库中不存在「toolId → 工作区组件」的映射表；`workspaces/dress-suite.tsx`、`handheld-goods.tsx` 等同样未被任何路由引用（近期 TASK-022/023/024/027 提交亦如此）。因此 `pod.tsx` 已实现并通过渲染测试，但**从路由进入页面仍显示占位**，需在统一的接线任务里登记映射（本任务按文件范围限制未改 `tool-page.tsx`）。
2. **枚举真值未确认**：模式 / 比例 / 风格取值为页面目录 + 证据标记，一旦上游模型目录接入，须用真实 chunk 值替换并移除「仍在用页面目录」的提示文案。上游 `/draw/ai-text` 当前对本站账号重定向首页，无法抓取真实枚举。
3. **上游 `responseId` 未回填**：`aiTextResponseId(task)` 在结果为空时返回空串，UI 显式显示「——（上游未回填）」，未做本地伪造。
4. **全量测试有其它的失败项**：`bun test src/features/tools src/services/api/tools` 当前 619 pass / 5 fail，5 项全部落在他 agent 未提交的在制品（`registry/handheld-goods.ts`、`adapters/handheld-goods.ts`、`adapters/ai-dressing-v2.ts` 为 `??` 未跟踪），与本任务文件无交叉。全量 `tsc --noEmit` 亦被 `workspaces/dressing.tsx`、`workspaces/handheld-goods.tsx`（未提交在制品）语法错误阻断。
5. **真实上游联调未做**：本任务只验证到「请求组装 + 守卫 + 结果语义 + 渲染」，未对真实上游接口发请求（无可用账号与枚举），执行链路的真实返回需在接线后联调。

## 4. 使用入口

- 代码：`web/src/features/tools/registry/ai-text.ts`、`web/src/features/tools/adapters/ai-text.ts`、`web/src/components/tools/workspaces/pod.tsx`
- 单测：`bun test web/src/features/tools/adapters/ai-text.test.ts`
- 页面：`/tools/product-design/ai-text`（registry 已登记 `AI_TEXT`，网关适配表已含 14 字段；接线后即可进入工作区）
