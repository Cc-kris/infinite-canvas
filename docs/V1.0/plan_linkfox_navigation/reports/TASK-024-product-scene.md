# TASK-024 场景裂变（PRODUCT_SCENE）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`98677c2` feat(tools): PRODUCT_SCENE 场景裂变工作区与提交契约（5 files, +2303）
- 页面 spec：`docs/V1.0/plan_linkfox_navigation/page-specs/17-product-scene.md`
- 日期：2026-10-28

## 1. 改了什么

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/product-scene.ts` | 664 | 页面值模型 `SceneValues`、provider 能力收敛 `resolveSceneCapability`、尺寸/比例计算 `computeSceneOutput`/`nearestScenePreset`、15 字段白名单 `buildSceneFields`、提示词 `buildScenePrompt`、校验 `validateSceneState`（8 个独立 issue code）、提交快照 `createSceneSnapshot`、结果网格 `sceneResultFromTask`/`missingSceneVariantIndexes`、执行摘要 `summarizeSceneExecution` |
| `web/src/features/tools/adapters/product-scene.ts` | 447 | `buildSceneInput`（提交请求组装）、`assertSceneInput`（防丢参守卫：页面上每一项都必须能在请求里找到，对不上直接抛错）、`runProductScene` / `retryProductScene`（同快照重建请求） |
| `web/src/components/tools/workspaces/scene-fission.tsx` | 694 | `ProductSceneWorkspace`：参考图上传、背景相似度、写实/简约/智能、场景描述（0–100 字）、尺寸（默认/自定义）、1–4 张、结果网格（按格重试）、空/生成中/成功/失败/旧版本提示 |
| `web/src/components/tools/workspaces/scene.tsx` | +3 | 仅追加 `export { ProductSceneWorkspace } from "./scene-fission";`（第 806 行）；`SceneWorkspace` 默认导出与既有内容零改动（该文件归 TASK-022 `NEW_REPLACE_BG_V2`） |
| `web/src/features/tools/adapters/product-scene.test.ts` | 495 | 28 个用例 |

注册表入口（`web/src/features/tools/registry/index.ts:275`）为既有条目：`index 17 / slug product-scene / route /tools/product-design/product-scene / makeType 13 / layout scene / fields 15 项`，本任务按该 15 字段契约实现，未改注册表。

## 2. 真实控件与状态（对应 spec §1–§3）

- 参考图：`ToolAssetInput`（本地/作品库/商品库），真实约束文案 `10M以内 · 分辨率 384×384 ~ 4096×4096 · 最大宽高比 5`，`validateSceneSource` 报 `source-missing / source-size / source-aspect`。
- 背景相似度：0–100；智能模式下自动置灰并提示「已选择智能模式，将根据模型自动生成场景」，提交值由 `effectiveSceneStrength` 决定，页面值不被篡改。
- 模型：写实（realistic）/ 简约（minimal）/ 智能（smart），切换时按能力表重置不兼容项，不串改无关状态。
- 尺寸：默认预设 + 自定义宽高（越界 `custom-size-range`、宽高比超限 `custom-size-aspect` 分别报错）。
- 张数：1–4，能力上限收敛到 `maxOutputNum`，越界给 `output-num-unsupported`。
- 结果：按 `outputNum` 生成 1–4 格；缺格标 `missing` 并说明（不复制充数）；运行中 `pending`、失败 `failed`、配置改动后标「配置已变更，结果为旧版本」（`scene-stale`）。

## 3. 如何验证

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
bun test src/features/tools/adapters/product-scene.test.ts   # 28 pass / 0 fail, 95 expect()
bun run typecheck                                            # tsc --noEmit 通过（全仓无本任务相关错误）
```

实测输出：

```
28 pass / 0 fail, 95 expect() calls, Ran 28 tests across 1 file.
$ tsc --noEmit   (无输出)
```

覆盖点（均断言真实行为，非快照）：
1. 源图还原：`http(s)` URL 优先，否则用 assetId；资产记录缺字段时降级不崩。
2. 提交守卫：故意漏掉一个页面值 → `assertSceneInput` 抛错并指名缺失字段（防「配置被静默丢弃仍然提交」）。
3. 15 字段映射：`mode/provider/sceneKeyword/prompt/strength/sizeType/imageOutputWidth/imageOutputHeight/ratio/outputNum/originImageUrl/cutoutProvider/segImageUrl/imageName` 与注册表白名单逐一对照。
4. 能力收敛：相似度被夹取、张数上限收敛、不支持自定义尺寸时回落默认并在 `notices` 说明、描述超 100 字被收敛。
5. 校验：缺源图 / 缺模型 / 张数不支持 / 自定义尺寸越界 / 宽高比超限 → 各自独立 issue code。
6. 结果网格：3 张请求返回 2 张 → 第 3 格标 `missing` 并附说明，不复制已有图。
7. 渲染（react-dom/server + MemoryRouter + localStorage 桩）：分区齐全（`scene-similarity / scene-modes / scene-size-type / scene-output-num / scene-issues / scene-expected / scene-result-empty`）、无源图时 `scene-generate` 带 `disabled` 且给出真实拦截文案、智能模式提示可见、草稿键 `tool-draft:v1:PRODUCT_SCENE` 与 technical_design §6 一致。

## 4. 未完成与风险

1. **工具页接线（系统性，非本任务引入）**：`web/src/features/tools/tool-page.tsx` 当前对所有 toolId 都渲染 `WorkspacePlaceholder`（第 395 行），没有任何 workspace 分发逻辑（全仓无 `import.meta.glob`/workspace 懒加载）。因此 `ProductSceneWorkspace` 已可渲染（测试直接 import 通过），但进入 `/tools/product-design/product-scene` 仍显示占位。需要一条统一的「toolId → workspace」注册（建议由编排任务一次性接线，避免各任务各自改 tool-page 造成冲突）。
2. **`segImageUrl` 契约偏差**：注册表把 `segImageUrl` 标为 REQUIRED，但本工具页没有手动抠图步骤，我在无分割图时不写该字段（`buildSceneFields` 只在有蒙版时提交 `segImageUrl` + `cutoutProvider`）。已确认全仓不存在运行期 REQUIRED 校验器（无 `validateToolInput`），故不会硬拦提交；若网关侧强制要求，需要在页面补「商品套图/抠图」入口。
3. **并发写冲突规避**：`scene.tsx` 归 TASK-022 所有（其默认导出是 `NEW_REPLACE_BG_V2` 的 `SceneWorkspace`），为避免覆盖其未提交内容，我把实现放在 `scene-fission.tsx`，只在 `scene.tsx` 追加 3 行 re-export（提交前已用 `git diff` 确认该文件仅我这 3 行变更）。
4. 未做真机/浏览器级 UI 验收（沙箱无截图权限）；UI 证据来自 `react-dom/server` 渲染的真实 DOM 字符串与 test id 断言。
5. 真实网关联调未跑（无可用 key/渠道）；提交链路用注入的 fake gateway 断言请求体与重试快照一致性。

## 5. 使用入口

- 组件：`ProductSceneWorkspace`（`web/src/components/tools/workspaces/scene-fission.tsx`，同时从 `scene.tsx` 具名导出）
- 契约：`buildSceneInput` / `assertSceneInput` / `runProductScene` / `retryProductScene`（`web/src/features/tools/adapters/product-scene.ts`）
- 值与校验：`web/src/features/tools/registry/product-scene.ts`
- 测试：`bun test src/features/tools/adapters/product-scene.test.ts`
