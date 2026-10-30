# R33 · VIDEO_TRANSLATION → SEED_V25 真路由（doubao-seedance-2-5）

日期：2026-10-30 · 分支 `feat/linkfox-v1-real` · 范围：协议层 + 网关闸门 + 上游调用 + 单测 + 真实链路取证

## 1. 结论先说

| 项 | 结果 |
| --- | --- |
| 协议层（type=96 / extendFields / 顶层 sourceVideoUrl） | 已实现，单测逐字段比对实测契约 |
| 默认模型 | 钉死 `doubao-seedance-2-5`（SEED_V25），**不沿用全局 videoModel**（避免借 MiniMax 代跑） |
| 渠道未开通该模型 | 提交前阻断，`code=seed-v25-model-unavailable`，**provider 零调用**（真实页面验证） |
| 渠道声明可用但上游拒绝 | 真实打到上游，404 归一为同一 code，`retryable=false`、`definitive=true`、无 upstreamTaskId |
| 真实生成 | **未产生**。当前 sub2 渠道只声明 `MiniMax-H3`，上游明确 `Model "doubao-seedance-2-5" is not available for this group`。按约定不换模型、不嵌套、不重复扣费 |
| 定向 + 相关单测 | 16/16 pass；与相关 i18n 用例同跑 22/22 pass |
| tsc | 我的文件无错；唯一报错来自他组在改的 `video-translation-i18n.test.tsx(60,31)` |
| build | 成功（vite，2m22s） |

## 2. 改动清单

### 新增 `web/src/services/api/video-translation-seed-v25.ts`（协议层，纯函数）
- `buildSeedV25TranslationRoute({selectedModel, prompt, fields, availableModels, channelDeclaresModel})`
  - 字段齐全 → `{status:"ready", payload}`
  - 缺 `sourceVideoUrl`/`sourceVideoName`/语言等 → `{status:"blocked", code, message}`
  - 显式选了非 SEED_V25 模型 → 阻断（不静默替换）
  - 渠道声明清单存在但不含 SEED_V25 → 阻断并列出可用模型
  - 渠道清单为空（sub2api `/v1/models` 返回空 data，不可枚举）→ 放行，由上游 404 收敛（两条路径同一 code）
- 产出 payload：`type:96`、`outputNum`、`sourceVideoUrl/sourceVideoName`、`sourceLanguage/targetLanguage`、`lipSync`、
  `extendFields:{accountTypes:"DOUBAO_API", videoType:"SEED_V25", duration:-1, videoTime:-1, ...}`
- `mapUpstreamModelRejection(status, message)`：404 / `model_not_found` / `not available for this group` → 统一文案
- `mapSeedV25TaskStatus` / `extractSeedV25TaskId` / `extractSeedV25VideoUrl` / `isPublicVideoUrl`（拒内网与 blob）
- `SEED_V25_RESULT_BADGE`：`SEED_V25 译制草稿 · 未验证翻译`（禁止写「翻译完成」）

### `web/src/services/api/tools/gateway.ts`
- 新增 `VideoInvocation.translation?`，并**贯通到 provider 调用**（`VideoCallOptions` → `createOpenAIVideoTask`，L510/541/1176）
- 新增导出 `resolveSeedV25Translation(input, config)`：默认模型 = SEED_V25；源视频公网 URL/文件名以素材层为准兜底；渠道声明校验；不满足即抛 `ToolGatewayError`
- adapter `VIDEO_TRANSLATION` 分支改走该解析（不再用全局 `videoModel`）
- `executeVideoCreate` catch：`SeedV25ModelRejected` → 终态 `failed`，`code=seed-v25-model-unavailable`，`retryable=false`，`definitive=true`

### `web/src/services/api/video.ts`
- `VideoMediaOptions.translation?`；有值时把翻译字段写入 JSON 请求体
- 提交计划强制 `order:["json"]`；`translation` 时**禁用 multipart 及「发布源视频后重发」补救**
  （multipart 承载不了 extendFields，且重发会改 sourceVideoUrl 语义）
- catch 内 `mapUpstreamModelRejection` → 抛 `Error{name:"SeedV25ModelRejected"}`，供网关判定

## 3. 验证证据

### 3.1 单测
```
~/.bun/bin/bun test src/services/api/video-translation-seed-v25.test.ts \
  src/services/api/tools/gateway.video-translation-seed-v25.test.ts
→ 16 pass / 0 fail（70 expect）

# 与相关 i18n 用例同跑
→ 22 pass / 0 fail
```
覆盖点：payload 逐字段、默认模型、显式换模型阻断、渠道无模型阻断并列清单、不可枚举时放行、
404 归一、内网/blob 拒收、结果/任务 id 解析不编造、徽标不得出现「翻译完成」、
网关层「渠道只有 MiniMax-H3 → provider 零调用」、翻译 payload 原样透传。

### 3.2 真实页面（localhost:3000，真实用户配置，未打印密钥）
- 真实配置：渠道 `sub2` 仅 `MiniMax-H3`
  → `submit` 前抛 `seed-v25-model-unavailable`：
  `当前渠道没有 doubao-seedance-2-5（SEED_V25）。渠道可用模型：MiniMax-H3。…本工具不会退回其它视频模型。`
  → **零网络请求**（provider 未被调用）
- 注入「声明 doubao-seedance-2-5」的配置（仅内存，未落盘）
  → 881ms 真实请求到上游，回执：`Model "doubao-seedance-2-5" is not available for this group`
  → 任务终态 `failed`，`code=seed-v25-model-unavailable`，`retryable=false`，`upstreamTaskId=null`
  → 未产生生成任务，未扣费，未发生模型替换

### 3.3 回归
- `bun test` 全量：1581 pass / 1 fail，唯一失败 `video-translation i18n > EN 渲染态不出现中文`；
  该用例单跑 6/6 pass，与本次两个测试同跑 22/22 pass → 属他组未提交 UI/i18n 改动的跨文件状态污染，与本次改动无关
- `tsc --noEmit`：我的文件 0 错；唯一报错在他组文件 `video-translation-i18n.test.tsx(60,31) channels`
- `bun run build`：成功

## 4. 未完成 / 风险（不掩饰）

1. **真实生成未打通**：sub2 渠道未开通 `doubao-seedance-2-5`。要出真片需在渠道侧开通该模型（或换到已开通渠道）；
   之后本链路无需改码即可跑通，届时应记录 taskId / 请求体 / 回执并核对成片语言。
2. **成片语义边界**：SEED_V25 只有 `sourceLanguage/targetLanguage/lipSync` 引导，没有逐句翻译与字幕烧录。
   结果徽标固定「译制草稿 · 未验证翻译」，页面不出现「翻译完成」类表述。
3. **poll 侧映射**：`mapSeedV25TaskStatus` / `extractSeedV25VideoUrl` 按契约实现并有单测，但**未经真实成片回执校验**
   （无可用生成）。首次成功生成后需比对真实 status/URL 字段，必要时调整候选键。
4. `gateway.ts` 与 `video.ts` 与他组改动同处一个工作树；本次只提交自己的文件，冲突由集成分支处理。

## 5. 使用入口

- 协议层：`web/src/services/api/video-translation-seed-v25.ts`
- 路由/闸门：`resolveSeedV25Translation`（`web/src/services/api/tools/gateway.ts`）
- 上游调用：`createOpenAIVideoTask(..., { translation })`（`web/src/services/api/video.ts`）
- 单测：`~/.bun/bin/bun test src/services/api/video-translation-seed-v25.test.ts src/services/api/tools/gateway.video-translation-seed-v25.test.ts`
