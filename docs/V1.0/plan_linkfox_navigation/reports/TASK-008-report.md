# TASK-008 商品套图（PRODUCT_IMAGE_SUITE）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`5056869`（5 文件 / +1990）、`267fc15`（测试桩修复）
- 规格来源：`docs/V1.0/plan_linkfox_navigation/page-specs/01-product-image-suite.md`、`tool-matrix.md`、`tool_specs.json`
- 边界：只复刻信息架构与操作逻辑；不搬 LinkFox 前端代码、不植入算力区、不保存任何上游 token。

## 1. 交付物

| 文件 | 内容 |
| --- | --- |
| `web/src/features/tools/registry/product-image-suite.ts` | 页面规格：`SuiteConfig` zod schema 与默认值、模块目录（A+ 4 种 / 主副图 5 种）、`buildSuiteModulePlan`、`buildSuiteUnits`、`buildUnitPrompt`、`validateSuiteConfig`、`validateSuiteSourceLimits`、配置指纹与快照（`createSuiteSnapshot` / `isSuiteSnapshotStale`）、`PRODUCT_IMAGE_SUITE_SPEC` |
| `web/src/features/tools/adapters/product-image-suite.ts` | 真实执行层：`buildSuiteUnitInput`、`runSuite`（并发池、逐单元回调、部分失败不回滚不伪造）、`retrySuiteUnit`（只重提失败单元）、`groupSuiteUnits`、`summarizeSuiteRun`、`saveSuiteResultItem`（入库走 file-storage）、`toSuiteReference` |
| `web/src/components/tools/workspaces/suite.tsx` | 工作台：商品图上传（10M / 384–4096px / JPG-PNG-WEBP）、商品信息（0/2500）、品牌基因（主色 + 字体风格，关闭时不注入）、合规区、生成参数（模型/分辨率/品质/比例，模型留空用用户配置）、A+（单选 + 张数或排版二选一）、主副图（多选 + 各自张数）、预计张数、逐单元结果卡片（单张重试 / 入库 / 过期提示） |
| `…/adapters/product-image-suite.test.ts` | 23 个用例：注册表一致性、默认值与非法回落、计划与数量、Prompt 组装、校验、指纹与快照过期、真实网关集成（requestEdit 路径 / provider 报错不伪造）、保存动作 |
| `…/workspaces/suite.test.tsx` | 3 个静态渲染用例：分区齐全、枚举与限制按规格渲染（10M、384–4096px、5 比例、4 档分辨率）、未上传/未选类型时只给真实校验提示 |

## 2. 关键实现约定（可核对）

1. **页面固有顺序**：主副图计划按 卖点 → 白底 → 场景 → 特写 → 特写白底 展开，与勾选先后无关（spec 第 14 行）。
2. **张数语义**：A+ 为“张数 或 排版二选一”，选排版时每种排版出 1 张；主副图每模块独立张数，单模块上限 10、整单 40。
3. **不伪造**：`runSuite` 先整体校验，校验不通过不发任何请求；单元失败保留已完成结果，只有 `succeeded` 才算成功；上游 unknown 不算成功。
4. **模型**：`config.model` 为空 → 不写死模型，落回用户配置（测试已断言 `input.model === undefined`）。
5. **草稿/素材**：草稿键 `tool-draft:v1:PRODUCT_IMAGE_SUITE`；刷新后按 `sourceAssetId` 用 `loadToolAssetRecords` 恢复，丢失时明确提示且禁止生成。

## 3. 验证证据（跑过，不是读码）

```bash
# 类型检查（仓库范围）
cd web && PATH=/opt/homebrew/bin:$HOME/.bun/bin:$PATH ./node_modules/.bin/tsc --noEmit
# => 0 行输出（0 error）

# 全量测试
bun test
# => 230 pass, 0 fail, 2413 expect() calls, 13 files

# 本任务两个测试文件
bun test src/components/tools/workspaces/suite.test.tsx src/features/tools/adapters/product-image-suite.test.ts
# => 26 pass, 0 fail, 122 expect() calls
```

补充：用 `react-dom/server` 实际渲染工作台（9006 字符）核对文案与限制，发现并修复了两处真实缺陷——上传器未传 `constraints`（显示 20MB）已改为 10M/384–4096；`group.moduleLabel` 实为 `group.label`。

环境坑（记下来）：`npx` 不在 PATH，`node` 在 `/opt/homebrew/bin`，必须 `PATH=/opt/homebrew/bin:$HOME/.bun/bin:$PATH` 才能跑 `./node_modules/.bin/tsc`。

## 4. 未完成 / 风险（需下游任务接手）

1. **路由未接线（阻塞可用性）**：`web/src/features/tools/tool-page.tsx` 对所有工具路由仍渲染 `WorkspacePlaceholder`，且没有工作台注册表。本任务按要求不改他人文件，故 `suite.tsx` 目前只能由测试渲染，页面里点不到。建议接法：在 `tool-page.tsx` 按 `spec.id === "PRODUCT_IMAGE_SUITE"`（或建 `workspaces/index.ts` 映射表）渲染本组件，其余工具继续占位。
2. **AI 分析 / 向导未实现**：仓库没有文本模型调用模块（`services/api/` 下无 text 接口），规格里的“AI 分析商品图、向导提问”未接，UI 不放假按钮。
3. **作品库/商品库未接入上传区**：`ToolAssetInput` 支持 `library`，但 `toolAssetLibraryItemsFromAssets` 需要资产库适配结果，本任务未做映射，目前只支持本地上传。
4. **合规词库未接入**：词库服务未就绪，UI 明确写“未接入时不伪造选项”，只有选择位。
5. **测试桩教训**：组件测试用 `Object.defineProperty` 造 `localStorage` 必须带 `writable: true`，否则会污染同进程其它测试文件（`batch-runner.test.ts` 曾因此抛 readonly）。

## 5. 使用入口

- 组件：`web/src/components/tools/workspaces/suite.tsx`（default export `ProductImageSuiteWorkspace`）
- 配置/口径：`registry/product-image-suite.ts`（UI 不得另写一套计数或校验逻辑）
- 执行：`adapters/product-image-suite.ts` 的 `runSuite` / `retrySuiteUnit` / `saveSuiteResultItem`
- 本地跑：`cd web && bun run dev`（页面接线完成后访问 `/tools/ecommerce-suite/product-image-suite`）
