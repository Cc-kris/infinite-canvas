# TASK-031 素材贴合（SDS_DESIGN）报告

- 分支：`feat/linkfox-v1-real`
- 提交：`44dbd12` feat(tools): SDS_DESIGN 素材贴合工作区与提交契约（18 用例）
- 路由：`/tools/product-design/sds-design`（registry 已登记 id `SDS_DESIGN` / slug `sds-design` / makeType 22）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/24-sds-design.md`（TECH-T24）

## 改了什么

| 文件 | 内容 |
| --- | --- |
| `web/src/features/tools/registry/sds-design.ts`（723 行 / 75 导出） | 契约常量（toolId、草稿键 `tool-draft:v1:SDS_DESIGN`、路由、上传上限、素材 1~6 张、落位上限、历史深度 50）；目录（4 种平铺 `single/grid-2x2/half-drop-2x2/grid-3x3`、5 种颜色 原色/黑/白/藏青/米色）；几何（`sdsPrintableArea` 内缩 0.08、`clampSdsPlacement` 按商品宽高比换算可贴框、`normalizeSdsRotation` 归一到 ±180、`applySdsPlacementAction` 支持方向键 0.01/按住 Shift 0.1、缩放、旋转 `[` `]`）；`PATCH`/撤销栈（`createSdsPlacementHistory` / `commitSdsPlacement` 相同内容不写节点 / `undo` / `redo`）；校验（11 个原因码：缺素材/素材过多/素材未就绪/素材重复/素材名缺失/缺商品/商品未就绪/颜色未知/平铺未知/落位非法/模型未就绪）与 `sdsSubmitLabel`；提示词拼装 `buildSdsPrompt`（商品行 + 颜色行 + 每素材一行“位置/缩放/旋转/平铺 + 确定性描述” + 贴合约束 + 输出张数）；快照 `createSdsSnapshot` / `sdsFingerprint` / `isSdsSnapshotStale` / `describeSdsDrift`（逐项中文漂移：商品、颜色、素材增删改名、平铺、落位）；草稿 `serializeSdsValues`（zod 严格 schema，只存 id/name/几何，不存 base64）与 `parseSdsDraft`（非法枚举回落默认、**落位按可贴区域重新夹取**、结构损坏整体回落） |
| `web/src/features/tools/adapters/sds-design.ts`（418 行 / 32 导出） | `SDS_DESIGN_ALLOWED_FIELDS` = `imageList/imageName/imageUrl/materialList/productId`（与 `TOOL_ADAPTER_TABLE` 一致）；来源校验 `validateSdsSource`（MIME 白名单、体积、商品图/素材不同文案、短边下限）；`buildSdsDesignFields`（imageList 按序 order 0..n-1、materialList 带 scale/rotation/tilingPresetId、imageName/imageUrl 取首素材、productId）；`auditSdsDesignFields`（missing / unexpected / mismatched 三类，可点名字段）；`assertSdsDesignInput` + `buildSdsDesignInput`（references = 商品图 + 素材，count = 素材数，fields 5 个）；`runSdsDesign` / `retrySdsDesign`（提交前守卫、部分补生成只重跑缺失序号、重试复用 requestId）；结果 `sdsResultSlots` / `sdsMissingIndexes` / `sdsRepairIndexes` / `sdsDesignResultNotice` / `sdsDesignResultFromTask` |
| `web/src/components/tools/workspaces/pod.tsx`（+979 行） | 新增 `SdsDesignWorkspace`（默认导出仍是 `PodMaterialWorkspace`）+ 三个子组件：`PodMaterialForm`（商品图 + 多素材上传，插槽式排布，单素材可选中/删除）、`TilingPresetSelect`（4 种平铺预览按钮）、`ProductPlacementCanvas`（商品图上的归一化落位框，支持拖拽/键盘微调/缩放/旋转 + 撤销重做 + 实时可贴区提示）；草稿存取走 `SDS_DESIGN_DRAFT_KEY`，提交前跑 `validateSdsDesignState`，缺图时按 `sdsRepairIndexes` 提供“补生成”入口 |
| `web/src/features/tools/adapters/sds-design.test.ts`（312 行 / 18 用例 / 88 断言） | 覆盖：来源就绪与格式/体积/尺寸越界文案、素材数量夹取、越界落位夹回与旋转归一、键位映射、单素材位移/缩放、撤销重做与重复提交不写节点、提示词含每个素材几何与平铺、5 字段与顺序、审计三类问题、提交守卫与参考图顺序、提交即终态/revision/responseId、非法配置零提交、上游缺图只报序号且可只补缺、漂移文案与重试复用 requestId、草稿不含 base64 且回读一致、脏草稿回落与夹取 |

## 如何验证

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
npx tsc --noEmit -p tsconfig.json          # exit=0，全项目 0 错误
bun test src/features/tools/adapters/sds-design.test.ts   # 18 pass / 0 fail
bun test src/features/tools                              # 678 pass / 0 fail（27 文件，含其它工具回归）
```

## 未完成 / 风险

1. **路由未接线（阻塞验收）**：`web/src/pages/tool-page.tsx` 仍对所有工具渲染 `WorkspacePlaceholder`，`SdsDesignWorkspace` 已导出但没有任何路由指向它。该文件不在本任务允许改动范围内，需由负责路由的任务把 `SdsDesignWorkspace` 接进去后才能从 `/tools/product-design/sds-design` 打开页面。
2. **执行链路只做了网关层验证**：`runSdsDesign` / `retrySdsDesign` 用 mock gateway 覆盖（提交参数、终态、缺图、重试），未对真实上游跑一次端到端出图，上游字段映射是否被服务端接受仍需一次真机联调。
3. **落位画布未做浏览器实测**：几何、夹取、历史栈都有单测，但拖拽手感与商品图上的实际贴合效果没有做 DOM/视觉验收（本机无屏幕录制权限，只能跑逻辑验证）。
4. 静态资源与草稿兼容：草稿里只存 url/几何，若素材资产被清理，回读后仍是“未就绪”状态，需要用户重新上传（校验会给出素材未就绪提示，不会静默提交）。

## 使用入口

- 页面：`/tools/product-design/sds-design`（registry 已启用；当前需先完成上面第 1 条路由接线）
- 代码：`SdsDesignWorkspace`（`web/src/components/tools/workspaces/pod.tsx:1229`）
- 契约：`web/src/features/tools/registry/sds-design.ts`、`web/src/features/tools/adapters/sds-design.ts`
- 用例：`bun test src/features/tools/adapters/sds-design.test.ts`
