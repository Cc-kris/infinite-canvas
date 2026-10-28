# TASK-INTEGRATE｜工具工作区接入 tool-page.tsx

- 分支：`feat/linkfox-v1-real`
- 范围：`web/src/features/tools/tool-page.tsx`、新增 `web/src/features/tools/tool-page.integration.test.tsx`、本报告
- 未改动：任何 workspace / adapter / 其他 worker 的在制文件

## 1. 结论

注册表里的 **39 个工具 id 全部绑定到真实导出的 workspace**，`/tools/:category/:toolId` 不再渲染"规格驱动占位工作区"。
占位分支只保留给两种真实缺失场景：**注册表里不存在的未来 id**（`specPending`）、**与注册表 spec 不一致的注入目录条目**（§3.2）。
`NEW_DESIGNER` 渲染真实 `DesignerWorkspace`（画布合成/导出/草稿恢复），不是 gateway 占位。
**缺失 workspace 的 id：无（0 个）。**

## 2. id → workspace 映射（39/39）

| # | tool id | category / slug | workspace 文件 | 导出 |
|---|---|---|---|---|
| 1 | PRODUCT_IMAGE_SUITE | ecommerce-suite / product-image-suite | suite.tsx | `ProductImageSuiteWorkspace` |
| 2 | DRESS_WEAR_SET | ecommerce-suite / dress-wear-set | dress-suite.tsx | `DressSuiteWorkspace` |
| 3 | CHANGE_COLOR_V2 | ecommerce-suite / change-color-v2 | color-v2.tsx | `ColorV2Workspace` |
| 4 | IMAGE_TRANSLATION | ecommerce-suite / image-translation | translate.tsx | `TranslateWorkspace` |
| 5 | SCALE_UP | ecommerce-suite / scale-up | enhance.tsx | `ScaleUpWorkspace` |
| 6 | AI_OUTPAINTING | ecommerce-suite / ai-outpainting | outpaint.tsx | `OutpaintWorkspace` |
| 7 | AREA_REPAIR | smart-edit / area-repair | mask.tsx | `MaskWorkspace` |
| 8 | REMOVE_PEN | smart-edit / remove-pen | mask.tsx | `RemovePenWorkspace` |
| 9 | CHANGE_COLOR | smart-edit / change-color | color.tsx | `ChangeColorWorkspace` |
| 10 | IMAGE_CROP | smart-edit / image-crop | crop.tsx | `CropWorkspace` |
| 11 | PRODUCT_REFINE | smart-edit / product-refine | enhance.tsx | `ProductRefineWorkspace` |
| 12 | FIX_COLOR | smart-edit / fix-color | repair.tsx | `FixColorWorkspace` |
| 13 | PRINTING_REPAIR | smart-edit / printing-repair | printing-repair.tsx | `PrintingRepairWorkspace` |
| 14 | HAND_REPAIR | smart-edit / hand-repair | repair.tsx | `HandRepairWorkspace` |
| 15 | NEW_REPLACE_BG_V2 | product-design / new-replace-bg-v2 | scene.tsx | `SceneWorkspace` |
| 16 | REPLACE_GOODS | product-design / replace-goods | replace.tsx | `ReplaceGoodsWorkspace` |
| 17 | PRODUCT_SCENE | product-design / product-scene | scene-fission.tsx | `ProductSceneWorkspace` |
| 18 | HANDHELD_GOODS | product-design / handheld-goods | handheld-goods.tsx | `HandheldGoodsWorkspace` |
| 19 | AI_DRESSING_V2 | product-design / ai-dressing-v2 | dressing.tsx | `DressingWorkspace` |
| 20 | AI_POSTURE | product-design / ai-posture | model.tsx | `AiPostureWorkspace` |
| 21 | AI_WEARABLE | product-design / ai-wearable | dress.tsx | `AiWearableWorkspace` |
| 22 | AI_TEXT | product-design / ai-text | pod.tsx | `PodMaterialWorkspace` |
| 23 | ORNAMENT_TEXT | product-design / ornament-text | text.tsx | `OrnamentTextWorkspace` |
| 24 | SDS_DESIGN | product-design / sds-design | pod.tsx | `SdsDesignWorkspace` |
| 25 | PRINT_EXTRACT | product-design / print-extract | extract.tsx | `PrintExtractWorkspace` |
| 26 | AI_POSE_GENERATOR | product-design / ai-pose-generator | model.tsx | `AiPoseGeneratorWorkspace` |
| 27 | AI_DRESSING_XSY | product-design / ai-dressing-xsy | dressing-xsy.tsx | `AiDressingXsyWorkspace` |
| 28 | FISSION_LINK | product-design / fission-link | scene.tsx | `FissionLinkWorkspace` |
| 29 | IMAGE_TEXT_EDIT | product-design / image-text-edit | image-text-edit.tsx | `ImageTextEditWorkspace` |
| 30 | MATERIAL_UPPER_BODY | product-design / material-upper-body | dress.tsx | `MaterialUpperBodyWorkspace` |
| 31 | NEW_DESIGNER | product-design / new-designer | designer.tsx | `DesignerWorkspace`（宿主包装 §3.3） |
| 32 | PRODUCT_MARKET_MATERIAL | product-design / product-market-material | suite.tsx | `ProductMarketMaterialWorkspace` |
| 33 | SCENE_TRANSFER | product-design / scene-transfer | scene.tsx | `SceneTransferWorkspace` |
| 34 | IMAGE_TO_VIDEO | ai-video / image-to-video | image-to-video.tsx | `ImageToVideoWorkspace` |
| 35 | SALE_VIDEO | ai-video / sale-video | video.tsx | `SaleVideoWorkspace` |
| 36 | VIDEO_REPLICATION | ai-video / video-replication | video.tsx | `VideoReplicationWorkspace` |
| 37 | AI_VIDEO_EDITING | ai-video / ai-video-editing | video.tsx | `AiVideoEditingWorkspace` |
| 38 | VIDEO_TRANSLATION | ai-video / video-translation | video-translation.tsx | `VideoTranslationWorkspace` |
| 39 | VIDEO_CONCAT | ai-video / video-concat | video.tsx | `VideoConcatWorkspace` |

一个文件承载多个工具（`video.tsx` 5 个、`scene.tsx` 3 个、`suite/mask/enhance/repair/pod/model/dress` 各 2 个）是各 worker 自己的组织方式；本次只做绑定，未拆分、未改内部实现。

## 3. 实现要点

### 3.1 静态导入 + 穷举类型映射

```ts
export const TOOL_WORKSPACE_IDS = [...] as const;
export type ToolWorkspaceId = (typeof TOOL_WORKSPACE_IDS)[number];
export type ToolWorkspaceRenderer = (ctx: { toolId: ToolWorkspaceId }) => ReactNode;
export const TOOL_WORKSPACES: Record<ToolWorkspaceId, ToolWorkspaceRenderer> = { ... };
```

- 用 `Record<>` 而不是 `Partial<>`：漏一个 id 直接编译失败，杜绝"某工具静默退回占位"。
- 全部静态 `import`：workspace 导出改名/删除时构建失败，而不是运行时降级成占位。
- 值是**工厂函数**（返回元素），路由层可按 id 运行时选取；`useCallback` 只出现在 `NewDesignerHostWorkspace` 组件内部。

### 3.2 只有"注册表支撑"的条目才挂真实 workspace

`isRegistryBackedEntry(entry)` 校验条目的 `id / slug / category / makeType` 与注册表 canonical spec 一致，`resolveToolWorkspace()` 才返回渲染器。

原因（实测证据）：`tool-shell.test.tsx` 用的是**手写注入目录**（`buildToolCatalog({ "./registry/index.ts": { toolSpecs: [...] } })`），其中 `SCALE_UP` 的 `makeType` 与注册表不同、也缺 `route/fields`。这类条目是"路由壳层夹具"，不是真实 spec：
- 若只按 id 挂载，TASK-003 的 18 项壳层断言会被真实 workspace 打破（那些用例不属于本次范围，也无权改）；
- 语义上更准确：workspace 绑定的是注册表里那条 spec，而不是 URL 里碰巧同名的字符串。

结果：真实目录（`getToolCatalog()`，来自 `import.meta.glob`）→ 39/39 命中真实 workspace；注入夹具/漂移条目 → 保持占位。该行为由测试固定。

### 3.3 NEW_DESIGNER 宿主

`DesignerWorkspace` 的宿主契约要求 `open=true` 且必须注入 `onClose/onDone`（`validateDesignerHostState` 中 `host-closed` / `host-callback-missing` 是阻断项；`imageUrl` 为空不阻断）。
tool-page 不持有设计器持久化语义，故包装组件传 `open` 与两个稳定的惰性回调；设计器内部的画布合成（`createCanvasDesignerCompositor`，懒加载）、导出、草稿恢复仍是真实链路。已知限制见 §6.3。

### 3.4 其余路由契约不变

`ToolShell` 外壳、`ToolSidebar`、分类首页/默认跳转、`batch-generate` 批量路由与 `batch-detail`、legacy slug 重定向、404（`NotFound`）、i18n 切换、`enabled !== false` 特性开关全部走原代码路径，只在 `case "tool"` 内部替换主体内容。

## 4. 验证证据

工作目录 `web/`，`bun = $HOME/.bun/bin/bun`。

| 项目 | 命令 | 结果 |
|---|---|---|
| 新集成测试 | `bun test src/features/tools/tool-page.integration.test.tsx` | **12 pass / 0 fail**（93 expect） |
| 既有壳层测试（未改一行） | `bun test src/components/tools/tool-shell.test.tsx` | **18 pass / 0 fail** |
| 两者合并 | 两条一起跑 | **30 pass / 0 fail** |
| 类型检查 | `bun run typecheck` | tool-page 与集成测试 **0 错误**；仅 1 个他人在制文件错误（`adapters/video-replication.test.ts(131,49)`，该文件为 `??` 未跟踪，与 tool-page 无引用关系） |
| 生产构建 | `bun run build` | **exit 0**，`✓ built in 7.66s`（体积告警为既有情况） |
| 全量测试 | `bun test` | 1186 pass / 3 fail；3 个 fail 全在他人未跟踪文件 `adapters/video-replication.test.ts`（`registry：提交前校验` 3 例），与本次改动无调用关系 |

集成测试覆盖点：

1. `TOOL_WORKSPACE_IDS` 与 `toolSpecs` 的 id 集合**完全相等**（无重复/无缺失/无多余），`TOOL_WORKSPACES` 键集合亦一致；
2. 39 个 id 逐个 canonical 路由解析 → 均 `type:"tool"` + registry-backed + 有渲染器；
3. 39 个 id 逐个 SSR 渲染 → 均出现 `data-testid="tool-workspace"` 与 `data-tool-id="<ID>"`，且**不含** `tool-workspace-placeholder`、不含"适配器未接入"占位文案；
4. `NEW_DESIGNER` → 出现 `data-testid="designer-export"`，不含"设计器宿主未打开"；
5. slug 与 id 两种寻址（`video-concat` / `VIDEO_CONCAT`）落到同一 workspace；
6. 分类首页默认跳"第一个 enabled 工具"（`batch-generate` 属批量工作台，单独断言）；
7. 批量路由 `batch-home` / `batch-detail` 不进工具详情；
8. 未知分类 / 未知工具仍 404；
9. 侧栏：5 个分类链接恒在，活动分类展开其工具链接（未激活分类只显示计数，是 TASK-003 既有交互）；
10. 特性开关：首条 `enabled:false` 时默认指向下一个工具；
11. 漂移条目 / 未来 id → 保持占位（`spec-pending` 语义不变）。

说明：本仓库无 DOM 测试环境（无 jsdom/happy-dom），因此用 `react-dom/server` 渲染真实 markup 断言，与 `tool-shell.test.tsx` 既有做法一致；**未**做真实浏览器视觉验收（§6.1）。

## 5. 共享检出纪律

- 未执行 `git reset` / `git clean` / `git add -A`；
- 只 `git add` 本次三个文件：`web/src/features/tools/tool-page.tsx`、`web/src/features/tools/tool-page.integration.test.tsx`、`docs/V1.0/reports/TASK-INTEGRATE.md`；
- 未提交他人改动：`web/src/services/api/{image,video}.ts`、`web/src/components/tools/workspaces/video.tsx`、`project_memory.md`、`*.worker-scratch-*` 与仓库根下 `*.json` 采集产物保持原状。

## 6. 未完成 / 风险 / 后续

1. **浏览器视觉验收未做**：仅有 build + SSR markup 证据。建议在预览环境点检 3 条代表路由：`/tools/product-design/new-designer`、`/tools/ai-video/video-concat`、`/tools/ecommerce-suite/product-image-suite`。
2. **打包体积**：静态导入 39 个 workspace 后主 chunk 约 5.67 MB（gzip ≈1.77 MB）。这是"静态导入 + 穷举类型"的直接代价。若后续需拆包，可把映射值改为 `React.lazy` 工厂（映射仍保持穷举，测试改为断言工厂存在 + 懒加载可解析）。
3. **NEW_DESIGNER 回传无下游**：`onDone` 是惰性回调，设计稿不会回写来源工具（需来源工具侧提供 host 状态与接收端口，属 workspace/adapter 范围，本次不可动）。
4. **漂移目录保护是刻意的**：若把"手写 spec 夹具"当真实目录塞进路由测试，会看到占位而非 workspace——这是设计约束，不是缺陷；真实目录 `getToolCatalog()` 下 39/39 命中。
