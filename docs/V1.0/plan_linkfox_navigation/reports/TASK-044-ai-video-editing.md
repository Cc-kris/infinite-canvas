# TASK-044 视频编辑 AI_VIDEO_EDITING 实施报告

- 分支：`feat/linkfox-v1-real`
- 证据级别：`page_spec`（`page-specs/37-ai-video-editing.md`）+ 实测 DOM（`evidence/page-dom-20261028/AI_VIDEO_EDITING.json`）+ 网关契约（`gateway.ts` 的 `TOOL_ADAPTER_TABLE.AI_VIDEO_EDITING`）
- 落地方式：`layout = video`，组件挂在共享文件 `web/src/components/tools/workspaces/video.tsx` 尾部（该文件同时承载 SALE_VIDEO / VIDEO_TRANSLATION / VIDEO_CONCAT，属并行任务共用文件）

## 1. 交付物

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-video-editing.ts` | 538 | 页面契约：视频/参考图硬规则（MP4·MOV、100M、≥4s、截取≤30s；参考图≤30 张、10M、384²–4096²、宽高比 0.4–2.5）、1 种视频类型、ms→秒截取窗口（起点/时长联动、越界前移不静默丢秒）、需求 2500 字计数、确定性隐藏提示词、提交快照与陈旧判定、能力判定、草稿序列化 |
| `web/src/features/tools/adapters/ai-video-editing.ts` | 347 | 运行适配：输入断言（模型/源视频/参考图/需求分码报错）、资产时长解析、7 字段落齐、`browseInput` 组装（源视频走 `videos`、参考图走 `references`）、真实 `runTool` 调用、结果视图与元信息 |
| `web/src/components/tools/workspaces/video.tsx` | +1165 | 工作区 UI：上传原视频 / 上传参考图 / 编辑需求（含「模板优化」）/ 视频类型 / 结果区，16 个稳定 `data-testid` |
| `web/src/features/tools/adapters/ai-video-editing.test.ts` | 532 | 31 个 bun 用例：截取窗口 6 / 需求与快照 6 / 能力判定 3 / adapter 7 / 结果视图 4 / 字段契约 1 / SSR 渲染 1 等 |

## 2. 契约事实（不是猜的）

1. **7 个提交字段**，与 `gateway.ts:99` 逐字一致：`duration / outputNum / prompt / refImageUrls / sourceVideoDuration / sourceVideoUrl / videoType`。测试用「实际字段 key 集合」与网关表比对，任一侧漂移即红。
2. **`duration` 单位是秒**（页面口径）。本任务修复了一处真实缺陷：`roundSeconds(startMs | endMs | durationMs)` 之前把毫秒直接传进「保留 1 位小数的秒」函数，导致 `durationSec = 30000` → 提交给网关的 `duration` 变成 30000（原站是「30 秒」）。已改为 `ms / 1000`，并连带修正 `resetAiVideoEditingClipForSource` 返回的 `clipDuration`（8000 → 8）。
3. **视频类型只有 1 个可选项**：「商品人物精准编辑」（原站实测），不凭空造第二项；`requiresReference: true`。
4. **参考图在原站标注选填，本链路强制**：`aiVideoEditingGatewayRequires()` 运行时读 `describeToolExecution()`，若网关要求参考图则在页面上显式说明「原站标注选填，当前链路必须 1 张以上」，不偷偷降级也不假装可选。
5. **需求计数文案是 `0 / 2500`**（带空格），与实测 DOM 文本一致。

## 3. 页面结构（对齐 page-spec 37）

| 区域 | 实现 |
| --- | --- |
| 1 原视频 | `ToolAssetInput` 上传单条视频；无时长元数据时明确提示重新上传，不猜时长 |
| 2 截取 | 起点/时长双控件 + 实时窗口标签（`0–30 秒` 式），越界给出琥珀色说明并前移/夹紧 |
| 3 参考图 | ≤30 张，逐张按上传顺序进 `references`，参与主体一致性约束 |
| 4 编辑需求 | 2500 字计数 + 「模板优化」按钮（只补模板骨架，不覆盖用户原文） |
| 5 视频类型 | 单选组，切换时按类型上限重算截取窗口 |
| 6 结果 | `ToolResult` 原生渲染 video；空 / 生成中 / 成功 / 失败 / 取消 / 未知；快照陈旧时打「来自旧版本配置」标记 |

## 4. 边界与不造数据

1. 提交前 `assertAiVideoEditingInput` 逐项校验：`no-model` / `source-video-missing` / `no-reference` / `prompt-empty`，并拒绝格式、体积、时长不达标的源视频（错误码可区分）。
2. 源视频必须真有 `url`（`toAiVideoEditingVideoRef` 无地址直接抛 `source-video-missing-file`），绝不用文件名冒充文件。
3. 结果视图只读 `task.result.items`：成功但无视频 → `failed`，不补造产物。
4. 隐藏提示词由模板确定性生成、只读展示，不把用户自由文本拼进不可见指令（可审计「模型被要求了什么」）。

## 5. 验证方式（可复跑）

```bash
cd web
export PATH=$HOME/.bun/bin:/usr/local/bin:$PATH
bun test src/features/tools/adapters/ai-video-editing.test.ts   # 31 pass / 0 fail
bun test src/features/tools/registry                          # 18 pass / 0 fail（无 schema 漂移）
bunx tsc --noEmit -p tsconfig.json                            # 我的 4 个文件 0 错
```

SSR 用例真实渲染了 `AiVideoEditingWorkspace` 并断言 `上传需要编辑的视频` / `上传参考图` / `视频类型` / `视频编辑结果` / `0 / 2500` / 6 个 testid / 提交按钮带 `disabled=""` / 阻塞文案 `先上传需要编辑的视频`，即页面结构与禁用逻辑已在无浏览器环境下取证。

## 6. 遗留与风险

1. **路由接线状态**：本任务交付时 `src` 内没有任何 `workspaces/*` 挂载点；并行任务 TASK-INTEGRATE 已在 `web/src/features/tools/tool-page.tsx` 建立 `TOOL_WORKSPACES` 映射，其中 `AI_VIDEO_EDITING: () => <AiVideoEditingWorkspace />` 已就位（该文件属对方的改动，本任务未修改、未纳入本次提交）。因此路由可用性以 TASK-INTEGRATE 的提交为准。
2. **并发协作风险（已发生并修好）**：多个 agent 同时追加 `workspaces/video.tsx`，一度出现「我的组件被夹在 `VideoConcatWorkspace` 函数体中间」与重复 `export default`。已用精确行段搬移修复，并在提交信息中说明该文件被多任务共享，后续改动需先 `git diff` 核对顺序。
3. 类型检查全库仍有 1 处他人文件错误（`video-replication.test.ts`），与 TASK-044 无关，未触碰。
