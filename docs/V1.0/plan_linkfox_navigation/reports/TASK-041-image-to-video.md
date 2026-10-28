# TASK-041 图转视频 IMAGE_TO_VIDEO 实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`95e6f97` feat(tools): IMAGE_TO_VIDEO 图转视频工作区（registry + adapter + 27 字段契约 + 工作区 + 19 项测试）
- 变更规模：4 文件 / +2035 行（全部新建）
- 证据级别：`page_spec`（`page-specs/34-image-to-video.md` + `tool_specs.json#IMAGE_TO_VIDEO`）

## 1. 交付物

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/image-to-video.ts` | 692 | 页面契约：27 字段、3 种素材模式、4 种视频类型、7 比例、2 分辨率、3 档时长、7 国→6 语言联动、4000 字提示词 / 1600 字商品信息上限、确定性提示词骨架、提交快照与漂移判定、能力/结果口径 |
| `web/src/features/tools/adapters/image-to-video.ts` | 404 | 运行适配：素材角色解析（reference / first-frame / last-frame）、尺寸校验、27 字段落齐、AiConfig 合并、真实 `runTool` 调用、结果单元与文案 |
| `web/src/components/tools/workspaces/image-to-video.tsx` | 660 | 工作区 UI：素材区（三模式 + ToolAssetInput）、视频类型区、参数区（比例/分辨率/时长/国家/语言）、提示词区、结果区，23 个稳定 `data-testid` |
| `web/src/features/tools/adapters/image-to-video.test.ts` | 279 | 19 个 bun 用例（契约 4 / 页面配置 3 / 校验联动 7 / 提交链路 4 / SSR 渲染 1） |

注册表接线（`features/tools/registry/index.ts` 的 `IMAGE_TO_VIDEO` 条目、路由 `/tools/ai-video/image-to-video`）已在 HEAD 中，本任务未改动任何共享文件。

## 2. 关键事实校正（交给后续任务）

1. **规格是 27 个字段，不是 28**。`tool_specs.json`、`page-specs/34-image-to-video.md`、网关 `TOOL_ADAPTER_TABLE.IMAGE_TO_VIDEO.fields` 三处一致为 27；测试直接用 `getToolAdapter(IMAGE_TO_VIDEO_TOOL_ID).fields` 做逐字比对，任一侧改动都会红。
2. **字段在 `adapter.fields`，不在 `adapter.capability.fields`**（capability 只有 kind/requires*/promptRequired）。
3. **网关错误分级是保守的**：只有命中 `DEFINITIVE_PATTERNS`（鉴权失败/接口地址不存在/未返回图片等）才判 `failed`，其余一律 `unknown`（可能已被上游受理）。本任务不修改该行为，测试用「鉴权失败」验证 failed 分支。

## 3. 页面结构（对齐 page-spec）

| 区域 | 实现 |
| --- | --- |
| 1 素材来源 | 三选一 tab：`参考素材`(≤9 图) / `首尾帧`(首帧必填、尾帧可选) / `商品链接`(URL + AI 分析)；素材统一走 `ToolAssetInput`（PNG/JPG/WebP、≤10MB、384²–4096²、宽高比 0.4–2.5） |
| 2 视频类型 | 4 种：产品展示 / UGC 种草 / 痛点解决 / 家居场景；切换联动默认时长与模板骨架文本 |
| 3 参数 | 比例 7 种（自适应 + 9:16/16:9/1:1/4:3/3:4/21:9）、分辨率 768P/1080P、时长 5/10/15 秒、销售国家 7 个、语言 6 种（切国家自动带出默认语言，仍可手改） |
| 4 提示词 | 4000 字上限、实时计数、可展开「本次提交内容预览」看最终拼装文本 |
| 5 结果区 | `ToolResult` 原生渲染 video；空 / 生成中 / 成功 / 失败 / 取消 / 未知（unknown）；失败也占 1 个结果单元，不补造产物 |

页面顶部显式声明 `makeType 30` 与「27 字段真实提交」，避免把原站算力口径当成本仓库能力。

## 4. 真实边界（不造数据）

1. **提交前先校验，再发请求**：`validateImageToVideoState` 返回 `blockers`，有阻塞项时 `runImageToVideo` 直接抛 `ImageToVideoAdapterError`，不进入 provider。
2. **参考图必须真有字节**：`assertImageToVideoSources` 检查每条素材的 `url/storageKey`；只有名字没有内容时拒绝，绝不用文件名冒充图片。
3. **首尾帧语义独立**：`resolveImageToVideoReferences` 在 frames 模式下把首帧放首位、尾帧放末位，`lastFrameImageUrl` 只在该模式写入；reference 模式下该字段为空串（测试覆盖）。
4. **模型/user 配置不发明**：`buildImageToVideoConfig` 以用户 `config`（`videoModel`/`model`）为基，工具级 `model` 可覆盖；无可用模型时能力解析直接给「去配置模型」并禁用按钮。
5. **失败/未知不装成功**：`imageToVideoResultCell` 只读 `task.result.items`；上游空数组或任务 `unknown` 都如实呈现，测试用 fake `ProviderPort` 验证「鉴权失败 → failed」与「不伪造结果」。
6. **快照漂移可见**：`createImageToVideoSnapshot` + `describeImageToVideoDrift` 在参数变化后标记「来自旧版本」，改时长能被识别（测试覆盖）。

## 5. 验证证据

```bash
cd web && bun test src/features/tools/adapters/image-to-video.test.ts
# 19 pass / 0 fail / 61 expect()

cd web && bun test
# 1024 pass / 0 fail / 6288 expect()（49 文件）

cd web && npx tsc --noEmit -p tsconfig.json
# 本任务 4 文件 0 error；仅剩并行任务的 src/features/tools/adapters/video-replication.ts(564,48) 'video-unavailable' 报错
```

SSR 渲染用例真实挂载 `ImageToVideoWorkspace`（`react-dom/server` + `MemoryRouter`），断言 13 个关键 `data-testid` 存在且未配置模型时提交按钮为 `disabled`——证明页面不是占位符。

## 6. 冲突与遗留

1. **`components/tools/workspaces/video.tsx` 归属冲突**：该文件由并行 TASK-042（SALE_VIDEO）持有，我的首次写入被覆盖。为避免互相破坏，本任务把工作区落在新文件 `workspaces/image-to-video.tsx`，只导出 `ImageToVideoWorkspace`，不占用可执行名，避免与 TASK-042 的 `video.tsx` 语义混淆。后续如需单文件承载多视频工具，应由路由层做显式映射而非共用单文件。
2. **工具页尚未挂载真实工作区**：`features/tools/tool-page.tsx` 的 `tool` 分支目前只渲染 `WorkspacePlaceholder`（显示字段契约 + 空结果区）。工作区挂载层属于别的任务；接线点应在此处按 `entry.id` 映射到 `ImageToVideoWorkspace`。本任务未改该共享文件，避免与并行 worker 冲突。
3. **商品链接解析未接入**：页面「AI 分析」按钮显式禁用并标注「未接入解析服务，需手动填写」，不伪造分析结果；`productUrl` 字段照常进入提交契约，待解析服务到位后替换该按钮实现。
