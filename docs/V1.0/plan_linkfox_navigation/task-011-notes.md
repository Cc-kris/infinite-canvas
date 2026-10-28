# TASK-011 notes (IMAGE_TRANSLATION, 图片翻译)

repo: /Users/mac/Documents/Dev/infinite-canvas (branch feat/linkfox-v1-real), web app in ./web
Allowed files (my scope): web/src/features/tools/registry/image-translation.ts, web/src/features/tools/adapters/image-translation.ts, web/src/components/tools/workspaces/translate.tsx, web/src/features/tools/adapters/image-translation.test.ts

## Status
- registry/image-translation.ts: DONE (728 行, 63 导出) — 页面契约、源语言目录(11 种)、目标语言分组(欧美/亚洲/南亚/中东/非洲)、values 解析与编辑、500 字上限、快照与 stale 判定
- adapters/image-translation.ts: DONE (531 行, 35 导出) — 真实 OCR/翻译端口、识别/翻译结果解析、图×语言单元、并发运行、结果映射、确认审计
- adapters/image-translation.test.ts: DONE (538 行) — 41 pass / 0 fail
- components/tools/workspaces/translate.tsx: DONE (884 行) — 上传 / 源语言 / 分组目标语言 / 逐框校对 / 矩阵结果

## 关键设计（无假数据）
- OCR 与逐框翻译都走真实视觉通道 `requestImageQuestion(config, messages, onDelta, {signal})`，图片以 `image_url` dataUrl 传入；没有本地 OCR 依赖，也没有任何 mock 文案。
- 识别结果必须由模型返回 `{"language","boxes":[{"text","box":[x,y,w,h],"confidence"}]}`；缺 `boxes` 或非 JSON 一律抛错（`parseRecognitionPayload`），不静默降级成空结果。
- 模型返回空 boxes 时如实返回空数组，页面提示“未识别到文字，可手工添加”，不编造文字。
- 翻译结果按 `id` 精确映射；缺条目直接抛错并提示单列重试（`parseBoxTranslationPayload`），空译文按缺失处理。
- 提交前必须逐框校对并点“确认本图译文”，`validateTranslationState` 会阻塞：无图片、无目标语言、未确认、缺译文、缺原文、单图超 500 字、源语言=唯一目标语言；源语言出现在多目标之一时只给 warning。
- 每张图 × 每个目标语言 = 一个任务单元（`asset-a::en`），提示词含已确认译文对，要求保持版式与字体位置、不新增文字；并发上限 6，单单元失败/抛错不影响其它单元，取消后剩余单元标记 cancelled 且不提交。
- 结果用快照哈希（FNV-1a）标记来源版本，配置/译文变更后旧结果可判 stale。

## 验证证据
- `cd web && ~/.bun/bin/bunx tsc --noEmit`：我这个四个文件 0 错误（仓库另有 pre-existing 错误在 src/features/tools/adapters/ai-outpainting.ts:321 的 `width`/`height`，不属于本任务范围，未改动）。
- `~/.bun/bin/bun test src/features/tools/adapters/image-translation.test.ts`：41 pass / 0 fail，145 expect()。
- `~/.bun/bin/bun test`（全仓）：271 pass / 0 fail，14 files，无回归。
- 单测覆盖：识别解析（标准 JSON / 代码块 / 缺 boxes 抛错 / 越界裁剪 / 空文本丢弃 / image_url 透传 / 空结果如实返回）、翻译解析（精确映射 / 缺条目抛错 / 多余 id 丢弃）、单元构建与提示词、结果映射（成功无图 → failed empty-result）、并发与失败隔离、取消、mergeOutcomes、校验与快照稳定性。

## 未完成 / 风险
- **接入缺口**：`web/src/features/tools/tool-page.tsx` 目前对所有工具渲染 `WorkspacePlaceholder`，`components/tools/workspaces/*` 全目录（含此前的 color-v2、dress-suite）无人 import。translate.tsx 与既有工作区同样处于“已实现、待路由接入”状态，接入需要改 tool-page.tsx（不在本任务允许文件内）。
- 因此本次 UI 只做到编译级验收（tsc），没有浏览器内点击验证；真实出图依赖用户已在设置里配好的视觉模型（未配置时 `requestImageQuestion` 会报错，页面显示错误文案而非假结果）。
- 逐框校对目前是文本列表 + 可选 bbox 比例展示，没有在图上画框的交互层（bbox 有则显示坐标，无则纯文本校对）。

## 环境坑
- `npx`/`bun` 不在 PATH：用 `export PATH=/opt/homebrew/bin:$PATH` + `~/.bun/bin/bun`。
- 本仓无 happy-dom/jsdom、无 test preload，工作区组件无法在 bun 里 SSR 冒烟渲染，UI 验收以 tsc + 浏览器（需接入路由后）为准。
- `ToolAssetRecord` 必填 `createdAt: string`（ISO）与 `origin: "local" | "library"`，写夹具时容易漏。
- registry 里 `sourceLanguage` 既是导入函数名又是 values 字段名，避免同名局部变量（曾触发 TS7022/TS2448）。
- validate 的 issue code 实际为：`no-images` / `image-limit` / `no-target` / `same-language` / `same-language-partial` / `no-text-box` / `source-language-mismatch` / `text-too-long` / `empty-source-text` / `missing-target-text` / `unconfirmed`。
