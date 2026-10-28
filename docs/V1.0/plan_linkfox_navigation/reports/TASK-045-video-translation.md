# TASK-045 视频翻译 `VIDEO_TRANSLATION` 实施报告

- 分支：`feat/linkfox-v1-real`
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/38-video-translation.md`
- 目标路由：`/tools/ai-video/video-translation`；`makeType` 96；layout `video`
- 证据级别：`workspace_dom`（原站 `https://www.linkfox.com/draw/video-translation`）

## 1. 改了什么

新增 4 个文件，未改动任何既有文件：

| 文件 | 作用 |
|---|---|
| `web/src/features/tools/registry/video-translation.ts` | 页面事实来源：7 个 provider 字段、语言目录、上传/时长规则、模式、草稿键、提交快照与指纹 |
| `web/src/features/tools/adapters/video-translation.ts` | 真实边界：原视频校验（block / notice 分级）、能力检查、提示词合成与逐项审计、请求构建、任务运行/重试端口、结果视图 |
| `web/src/components/tools/workspaces/video-translation.tsx` | 工作区 UI（6 个区域），独立文件，不与其它视频类任务共处一文件 |
| `web/src/features/tools/adapters/video-translation.test.ts` | 30 项测试（含 SSR 渲染断言） |

### 1.1 契约（registry）

- provider 字段 7 个，与 `ToolSpec` 声明顺序一致：`lipSync, outputNum, sourceLanguage, sourceVideoName, sourceVideoUrl, targetLanguage, videoType`。
- 默认值来自页面证据：`sourceLanguage=auto`（智能识别）、`targetLanguage=en`、`lipSync=true`（spec §2「口型同步默认开启」）、`outputNum=1`。
- 上传规则：`video/mp4`、`video/quicktime`，≤100MB；`2–30 秒` 在 spec 里写作「**建议**」，因此实现为 **notice（提示）而非硬拦截**；只有「读不到时长」才阻断。
- 语言目录 16 项（en/zh/ja/ko/es/pt/fr/de/it/ru/ar/th/vi/id/tr/hi），选项来自本目录，不从名称猜范围。
- 输出数量可选项 1–4；实际渠道一次只返回 1 条（见 1.2）。
- 草稿键 `tool-draft:v1:VIDEO_TRANSLATION`。
- 提交快照：`createVideoTranslationSnapshot` 记录**本次取值 + 三处展示文案 + draftRevision**；用 FNV-1a 指纹比对，配置改动即把旧结果标记为「来自旧版本」。

### 1.2 真实边界（adapter）

- **原视频校验分级**：格式错、超 100MB、读不到时长 → `severity: "block"`；时长不在建议区间 → `severity: "notice"`（页面琥珀色提示，仍可提交）。UI 与提交前的判断都只看 block。
- **能力检查**（`checkVideoTranslationCapability`）：按「需要这一项 且 拿不到 supported 证据」生成阻断原因：
  - 口型同步：`web/src/services/api/video.ts` 的请求体里没有口型同步参数 → 证据为 `unsupported`，开启时阻断并提示关闭，**不静默丢参**。
  - 多输出：渠道一次返回 1 条 → `outputNum>1` 阻断并给出改回 1 的明确指引。
  - 参考视频：`supported`。
- **提示词即参数**：视频服务只吃 `prompt`，因此每个页面选项都写进提示词分段（task/source/target/lipSync/output/type/mode/text）；`auditVideoTranslationPrompt` 逐段核对，缺一项即报「选项没生效」；`auditVideoTranslationFields` 保证 7 个字段都有值。
- **任务链路**：`runVideoTranslationTask`（dedupe=false，避免同配置重复建任务）/ `submit`（dedupe=true）/ `retryVideoTranslationTask` 走真实 `useToolTaskStore`，不伪造任务。
- **结果视图**：idle / running / succeeded / failed / cancelled / unknown 六态；成功但无视频按失败处理；`stale`（配置已变）与 `outputMatched`（产物数量与请求不符）都会显式提示。

### 1.3 页面（workspace）

六个区域，均带真实控件而非空壳：

1. **原视频**：本地上传，回显文件名/体积/时长，阻断项红色、提示项琥珀色；
2. **源语言 → 需要翻译的语言**：源语言改变时联动目标语言（冲突自动回退到英语）；
3. **口型同步**：开关 + 关闭时的语义说明（保留配音翻译、不做唇形重绘）；
4. **模式与输出**：标准/高级 + 输出数量 1–4；
5. **视频模型**：`ModelPicker` 绑定真实 `config.videoModel`；
6. **生成结果**：原视频与翻译结果对照播放、本次输入快照（`<details>`）、旧版本提示。

其它：草稿自动保存/恢复（坏草稿降级为默认值不崩页）、提交按钮显示本次真实产物数量并在不能提交时给出具体原因、失败保留配置与源文件可重试、`unknown` 状态提示先查历史再重试而非盲目重提。

## 2. 如何验证

```bash
cd web
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:$PATH"
bun test src/features/tools/adapters/video-translation.test.ts   # 30 pass / 0 fail
npx tsc --noEmit                                                 # 本任务 4 个文件 0 error
```

测试覆盖：字段与默认值契约、语言联动与回退、草稿往返与脏数据降级、上传校验分级（含 severity）、能力阻断（口型同步/多输出）、提示词逐项覆盖、请求构建（7 字段 + 1 条参考视频 + 完整提示词）、提交/重试 dedupe 差异、结果六态与 stale、工作区 SSR 渲染出六个区域与真实约束文案。

## 3. 未完成 / 风险

1. **未接路由**：`SaleVideoWorkspace` 等同类工作区目前都没有被任何页面 import（仓库里没有 workspace→route 的映射），本页同样只提供命名导出 `VideoTranslationWorkspace`。接入属于路由装配任务，不在本任务范围。
2. **口型同步的固定冲突**：页面默认开启（spec），但当前渠道没有该参数 → 默认状态下提交会被明确阻断，用户需先关闭。这是「不静默丢参」的代价；渠道支持后把 adapter 里的 evidence 改为 `supported` 即可，页面无需改动。
3. **共享文件被并行任务污染**：`web/src/components/tools/workspaces/video.tsx` 在本任务期间被其它任务追加了未完成的 `VideoReplicationWorkspace`（截断、不可编译），我一度在其上追加，已**完整回退并改为独立文件**，未提交该文件任何改动；被截断的原始内容另存于 `.worker-scratch-task045/video.tsx.task043-partial.bak` 供对应任务复用。
4. **未做真机跑通**：本轮验证到「测试 + 类型检查 + SSR 渲染」，未在浏览器里真实上传 30 秒视频跑一次端到端（缺可用的渠道凭证与测试视频）。

## 4. 使用入口

- 组件：`import { VideoTranslationWorkspace } from "@/components/tools/workspaces/video-translation"`（props: `{ className?: string }`）
- 契约：`@/features/tools/registry/video-translation`（`getVideoTranslationSpec()`、`VIDEO_TRANSLATION_SOURCE_RULE`、语言/模式目录）
- 边界：`@/features/tools/adapters/video-translation`（`checkVideoTranslationSource`、`checkVideoTranslationCapability`、`buildVideoTranslationBrowserInput`、`runVideoTranslationTask`）
