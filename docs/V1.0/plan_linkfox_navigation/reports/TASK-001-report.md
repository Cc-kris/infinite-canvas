# TASK-001 实施报告：依赖 / ToolSpec 契约 / 39 工具映射 / Feature Flag

- 分支：`feat/linkfox-v1-real`
- 提交：`26649fa` — `feat(tools): TASK-001 ToolSpec 契约 + 39 工具注册表 + feature flag`
- 状态：**DONE**（代码 + 测试 + 验收证据）

## 1. 交付文件

| 文件 | 变更 |
|---|---|
| `web/src/features/tools/types.ts` | 新增。分类/布局/适配器/来源/控件枚举，`FieldSpec`/`ToolSpec` 契约，zod 校验器，`canonicalToolRoute` |
| `web/src/features/tools/registry/index.ts` | 新增。39 个工具全量注册 + 派生查询 + feature flag |
| `web/src/features/tools/registry/registry.test.ts` | 新增。18 个用例，与 docs 证据 JSON 逐项比对 |
| `web/package.json` | 新增 `zod`、`@types/bun`、`@playwright/test` |
| `web/bun.lock` | 同步依赖 |

未改动他人文件（`tool-page.tsx`、`router.tsx`、i18n 等为并发工作线所有）。

## 2. 证据链（不凭记忆，全部来自仓库文档）

| 数据 | 来源 |
|---|---|
| 39 个工具 / slug / route / title / layout / origin | `docs/V1.0/plan_linkfox_navigation/tool_specs.json` |
| `makeType`（wire 层） | `docs/analysis/assets/linkfox/schema_final.json` → `type_final` |
| adapter 归属 | `technical_design.md` 每节 `adapter=\`x\`` |
| 字段 required | `tool_specs.json` → `field_schema[key]` 含 `required=是` |
| 字段默认值 | `field_schema` 中显式 `默认…` 字面量（只取数字/布尔） |
| 批量编排引用 | `tool_specs.json` → `batchReferences`（12 条，顺序保留） |

## 3. 注册表口径（实测数字）

- 工具数：**39**，index 1–39 连续，id/route/makeType 三者唯一。
- 字段总数：**384**；required：**171**；带字面默认值：**33**；`enumSource`（chunk/model-catalog）：**33**。
- 批量引用：**12**（`BATCH_TOOL_IDS`，`getBatchTools()` 解析顺序与证据一致）。
- adapter：`image` 32 / `video` 6 / `designer-host` 1（唯一 `NEW_DESIGNER`）。
- 分类计数：ecommerce-suite 6 / smart-edit 8 / product-design 19 / ai-video 6 / batch-generate 0（编排入口不拥有 ToolSpec）。
- 控件分布：upload 149、number 27、select 21、boolean 16、mask 15、textarea 15、ratio 12、asset-list 12、color 4、json 1、**unspecified 112**。
- `NEW_REPLACE_BG_V2`：证据层无独立 make 字段（页面画布状态序列化提交），注册为 `fields: []` + `notes` 说明，未伪造上传/提示词壳子。

## 4. 对外 API

- 数组/别名：`toolSpecs`（同时导出 `TOOLS`）、`TOOL_COUNT`、`BATCH_TOOL_IDS`、`TOOL_CATEGORY_META`。
- 查询：`getToolById` / `getToolBySlug` / `getToolByRoute`（兼容尾随 `/`）/ `listToolsByCategory` / `getCategoryDefaultTool` / `parseToolRoute` / `getBatchTools`。
- 校验：`registryIssues()`（结构 + 跨条目 + 批量引用一致性）、`assertToolRegistry()`。
- 开关：`VITE_FEATURE_LINKFOX_TOOLS`，未设置视为开启；`0/false/off/disabled/no` 为关闭；`getEnabledTools(env)` 再叠加每工具 `enabled`。

## 5. 验证证据（实跑，非读码）

```
$ bun test src/features/tools/registry/registry.test.ts
 18 pass / 0 fail / 1622 expect() calls   (23.00ms)

$ bun test                # 全仓
 103 pass / 0 fail / 1907 expect() calls  (125.00ms)  — 7 files

$ bun run typecheck       # tsc --noEmit
 0 error

$ bun run build           # vite build
 ✓ 10947 modules transformed  ✓ built in 8.53s
```

测试与 docs 直接比对（不是复制常量自证）：读 `tool_specs.json` / `schema_final.json` 后逐条断言 id、index、title、category、slug、route、layout、origin、`makeType`、字段序列、required、默认值、批量引用。另有 zod 反例（未知分类/布局/adapter/origin、route 与 category+slug 不一致、重复字段键、非法标识符、非法控件、makeType≤0、index 越界）。

## 6. 遗留与风险

1. **112 个 `unspecified` 控件**：证据未指定控件，注册表按契约留空，须由各 layout adapter 在渲染前解析；不得硬编码成上传框。
2. **`NEW_REPLACE_BG_V2` 零 make 字段**：提交依赖画布状态快照，字段级校验由页面层（page-specs/15）承担，注册表只提供 route/adapter/notes。
3. **`tool-page.tsx` 的 glob**：`./registry/*.ts` 会把 `registry.test.ts` 一并匹配。实测 `vite build` 通过且产物中无测试字符串（`grep "required drift" dist/assets/*.js` = 0），但建议 TASK-003 改为 `./registry/index.ts` 或排除 `*.test.ts`，避免后续加测试时回归。
4. **zod 版本**：并发工作线已把 `zod` 升到 `^4.6.7`，本任务按 v4 校验；`types.ts` 中 issue code 使用字符串 `"custom"`，v3/v4 双兼容。
5. **本地 node_modules**：并发 `bun install` 与既有 pnpm 目录混用，导致顶层 `vite` 7.3.6 与 `.pnpm` 7.3.7 类型冲突；已用符号链接归一化（仅本地环境，未提交），`tsc` 因此恢复 0 error。
6. **未做浏览器 UI 验证**：TASK-001 无 UI 产物，路由/渲染一致性由 TASK-003 验收。

## 7. 复现命令

```bash
cd web
bun test src/features/tools/registry/registry.test.ts
bun run typecheck
bun run build
```
