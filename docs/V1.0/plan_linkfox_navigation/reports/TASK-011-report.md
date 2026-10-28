# TASK-011 批量翻译（IMAGE_TRANSLATION）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`011693a`（5 文件 / +2718）、`8f754c3`（3 文件：结果动作 + 任务载荷补全）
- 规格来源：`docs/V1.0/plan_linkfox_navigation/page-specs/04-image-translation.md`（`workspace_dom` 证据级）、`tool-matrix.md`
- 边界：只复刻信息架构与操作逻辑（批量上传 → 原文语言 → 目标语言分组多选 → 翻译结果），不搬 LinkFox 前端代码、不复制算力区、不保存任何上游 token。

## 1. 交付物

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/image-translation.ts` | 728 | 页面规格：值模型与 zod 解析、`SOURCE_LANGUAGES`（20 种）、`TARGET_LANGUAGE_GROUPS`（全球／欧美／亚洲分组）、`createTranslationValues`、`syncImages`、`applyRecognition`、文本框增删（`addManualBox`/`removeBox`）、`imageCharCount`（单图 500 字）、`blockingIssues`、`plannedCells`/`estimatedOutputCount`、快照与过期判定、`IMAGE_TRANSLATION_SPEC`（20M / 384–4096 / 500 字） |
| `web/src/features/tools/adapters/image-translation.ts` | 553 | 执行层：`toReference`、`buildTranslationImages`、`composeRecognitionPrompt`、`requestRecognition`（视觉模型 OCR+译）、`composeTranslationPrompt`、`buildTranslationUnits`/`prepareTranslationRun`、`buildUnitInput`、并发池 `runTranslationUnits`（单单元失败不影响其它单元、支持 abort）、`mergeOutcomes`/`outcomeOf`/`retryableUnits`、`summarizeTranslationRun`、`mapTaskToOutcome`（空图 → failed） |
| `web/src/components/tools/workspaces/translate.tsx` | 954 | 工作台：批量图片上传（20M / 384–4096 / JPG-PNG-WEBP）、原文语言（含自动识别）、目标语言分组多选 + 已选数、识别与逐框校对（可编辑译文、手动加框）、未确认不提交、预计输出数、逐单元结果矩阵（成功/失败/旧快照）、下载 / 存库 / 发画布 / 单结果重试 / 查看输入快照、草稿恢复 |
| `.../adapters/image-translation.test.ts` | 571 | 41 → 43 个用例：语言与分组一致性、值模型与合法化、文本框与字数上限、校验（未确认/无目标语言）、快照指纹与过期、Prompt 组装、批量执行与失败隔离、取消、结果映射、§7 任务载荷字段 |

合计 4 个代码文件 2806 行（registry 63 个导出、adapter 35 个导出），另有 `docs/V1.0/plan_linkfox_navigation/task-011-notes.md`。

## 2. 关键实现约定（可核对）

1. **不伪造**：识别框未确认时 `blockingIssues` 直接阻断提交；单图任务成功但无图 → `failed(empty-result)`，不算成功。
2. **状态区分**：结果矩阵逐单元给出 `成功 / 失败 / 未定 / 取消 / 来自旧版本`；快照哈希变化后旧结果保留但标注“来自旧版本/输入已变更”，不静默清空也不冒充新结果。
3. **文案与数量**：提交按钮旁显示 `预计 N 张`（图片数 × 目标语言数），与 `plannedCells` 同源，避免 UI 与载荷不一致。
4. **载荷完整性**（页面规范 §7）：`buildTranslationUnits` 的 `fields` 携带 `imageName / imageUrl / sourceLanguage / targetLanguage / draftRevision / clientOperationId / sourceAssetIds / configSnapshot{hash,sourceLanguage,targetLanguages}`；未传 meta 时 `sourceAssetIds` 回落到本次图片集合，`draftRevision`/`clientOperationId` 显式为 `null`。
5. **结果动作复用共享层**：下载用同款锚点下载；“存库”走 `saveResultItemToAssets`（file-storage 入库）；“发画布”走 `sendResultItemToCanvas` 并提示项目 id 前缀；三者都基于 `ToolTaskResultItem{id,kind,dataUrl,url,mimeType}` 组装，不新建并行实现。
6. **草稿与素材**：草稿键 `tool-draft:v1:IMAGE_TRANSLATION`；刷新后按 `assetIds` 用 `loadToolAssetRecords` 恢复，丢失图片时明确提示并禁止生成；切换目标语言不清空已上传图片（`syncImages` 保留并补新）。
7. **模型**：识别与翻译都走 `requestImageQuestion`，未写死模型名，落回用户配置。

## 3. 验证证据（跑过，不是读码）

```bash
cd web
PATH=/opt/homebrew/bin:$HOME/.bun/bin:$PATH ./node_modules/.bin/tsc --noEmit
# => 我负责的 4 个文件 0 error；仅剩 enhance.tsx（他人任务新增的未跟踪文件）2 条 TS2783

bun test src/features/tools/adapters/image-translation.test.ts
# => 43 pass, 0 fail, 154 expect() calls

bun test
# => 341 pass, 0 fail, 2852 expect() calls, 17 files
```

补充核对：先按 `page-specs/04-image-translation.md` 逐条比对，发现结果区缺“保存资产 / 发送到画布”、载荷缺 `configSnapshot / sourceAssetIds / clientOperationId`，已在允许范围内补齐并加断言（`8f754c3`），不是事后追认。

## 4. 未完成 / 风险

1. **路由接入不在本任务边界**：`web/src/components/tools/tool-page.tsx` 目前对所有工具渲染 `WorkspacePlaceholder`，`tools/workspaces/*`（含本任务 `translate.tsx`、既有 `suite.tsx`、`color-v2.tsx`）尚无 import 点。目标路由 `/tools/ecommerce-suite/image-translation` 需由接入任务统一挂载；本任务组件已按 `ToolShell` 契约写完，可直接被挂载。
2. **tcs 全仓非全绿**：`enhance.tsx`（他人未跟踪文件）有 2 条 TS2783 重复属性告警，不在我的改动范围，未触碰。
3. **真实上游未联调**：识别/翻译调用走共享 `requestImageQuestion` 端口，测试用假端口覆盖了成功/失败/取消/空图路径，但未对真实模型出图质量做人工验收。
4. **未做浏览器端 DOM 验收**：组件未挂路由，无法在真实页面取证；本轮 UI 证据限于代码契约与单测（`workspace_dom` 级证据待接入后补）。

## 5. 使用入口

- 页面组件：`web/src/components/tools/workspaces/translate.tsx`（默认导出 `TranslateWorkspace`），挂载目标路由 `/tools/ecommerce-suite/image-translation`。
- 规格与值模型：`web/src/features/tools/registry/image-translation.ts`（`IMAGE_TRANSLATION_SPEC`、`createTranslationValues`、`blockingIssues`）。
- 执行与结果：`web/src/features/tools/adapters/image-translation.ts`（`prepareTranslationRun` → `runTranslationUnits` → `summarizeTranslationRun`）。
- 回归命令：`cd web && bun test src/features/tools/adapters/image-translation.test.ts`。
