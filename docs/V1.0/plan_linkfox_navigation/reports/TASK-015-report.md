# TASK-015 实施报告：REMOVE_PEN「局部消除」真实工作台

- 分支：`feat/linkfox-v1-real`
- 提交：`d03e803` — feat(tools): REMOVE_PEN 局部消除真实工作台（蒙版导出+单张真实消除请求+前后对比/接力）
- 规格：`page-specs/08-remove-pen.md`、`tool_specs.json#REMOVE_PEN`（makeType 23，layout `mask`，batchCapable false）

## 1. 改了什么

| 文件 | 变更 |
| --- | --- |
| `web/src/features/tools/registry/remove-pen.ts`（新增） | 页面契约与纯逻辑：工具常量/路由/草稿键、画笔上下限与预设档、源图限制、`RemovePenState`（笔画/画笔大小/对比模式/滑块）、笔画历史（begin/extend/commit/undo/redo/reset）、蒙版判空与覆盖率、提交校验（缺图/缺蒙版/尺寸不一致）、快照 + 指纹（不含幂等键）、草稿序列化/反序列化容错、`composeRemovePenFields`、三个接力路由、下载文件名 |
| `web/src/features/tools/adapters/remove-pen.ts`（新增） | 真实链路：`toRemovePenReference`（原图/蒙版 → 两张参考图）、`buildRemovePenUnit`、请求守卫（缺蒙版/缺字段/缺幂等键在本地就拒绝，不发出去等上游报错）、`runRemovePen` 走共享 `TaskGateway`、`removePenRunFromTask` / `removePenResultView`（上游成功但无图 → 判 `failed`，不补造占位图）、对比滑块夹取、接力构建、下载地址 |
| `web/src/components/tools/workspaces/mask.tsx`（追加 `RemovePenWorkspace`） | 工作台 UI：上传/重新上传、红色半透明涂抹预览（与导出蒙版语义解耦：白=消除、黑=保留）、画笔大小滑杆 + 4 档预设、撤销/重做/重置、覆盖率与校验提示、并排/滑动/只看结果三种对比、下载、高清放大/商品图/手部修复接力、草稿落库与恢复。**AREA_REPAIR 的 `MaskWorkspace` 与底层绘制逻辑未改动** |
| `web/src/features/tools/adapters/remove-pen.test.ts`（新增） | 16 条测试：契约常量、笔画历史、蒙版判空、校验分支、指纹稳定性/变更、字段落点、参考图顺序、守卫拒绝、结果归一、滑块夹取、接力路由，以及 `react-dom/server` 渲染证据 |

## 2. 怎么验证

```bash
cd web
PATH=/opt/homebrew/bin:/usr/bin:/bin:/Users/mac/.bun/bin bun test src/features/tools/adapters/remove-pen.test.ts
PATH=/opt/homebrew/bin:/usr/bin:/bin ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

- 测试：**16 pass / 0 fail / 82 expect() calls**（日志见 `evidence/task-015-verification.txt`）
- 类型：`tsc --noEmit` 对本次 4 个文件 **0 错误**；全仓仍有 1 处与本次无关的错误，来自并行 worker 尚未提交的 `src/features/tools/adapters/change-color.test.ts:81`（`Cannot find name 'lightSummary'`），不在本任务 allowlist 内，未改动

### 渲染证据
`evidence/task-015-remove-pen-render.html`（10,462 字节真实 SSR 输出），可核对的点：

- `data-testid="remove-pen-workspace"` 存在，标题「局部消除」、副标题「上传需要消除的图片，使用画笔涂抹即可一键消除；结果与原图可前后对比」
- 控件只有：画笔大小（滑杆 + 15/35/60/100 预设）、撤销、重做、重置、上传图片（之后可重新上传）、开始消除
- **不含**重绘描述、自动扩边、张数等 AREA_REPAIR 字段（断言 `not.toContain`）
- 未上传时提交按钮 `disabled`，且不渲染 `remove-pen-compare`
- 校验提示为具体原因：「请先上传需要消除的图片」「请先在图片上涂抹要消除的区域」

## 3. 真实边界（不造假的部分）

- 蒙版是画布真实笔画按原图尺寸导出的 PNG（复用 AREA_REPAIR 已验证的 `renderMaskPng`，本页固定 `feather=0 / inverted=false / autoExpand=false`），空蒙版直接抛错而不是提交空图
- 提交 = 一次真实图像编辑请求，参考图 2 张：`[待消除图, 蒙版PNG]`，顺序有测试守卫
- 上游返回成功但无图 → 结果判 `failed` 并提示重试，**不会**生成占位图或伪造成功
- 结果带 `snapshotHash`，输入变化后标记为旧版本结果
- 未做：真实网络端到端提交（需要用户当前配置的图像模型通道 + 真实资产上传），本次只验证到「守卫 + 端口 + 结果归一」这一层

## 4. 未完成与风险

1. **接线缺口（沿用前序任务同款问题）**：仓库中没有任何 `tool-page` 按 toolId 挂载 workspace 的分派（`rg "MaskWorkspace|workspaces/" src/components/tools/*.tsx` 无命中），因此本组件与 AREA_REPAIR/SCALE_UP 等一样，只能通过直接 import 渲染；路由页仍是共享占位。需要一次独立任务加 workspace 注册表。
2. **Provider 语义**：真实链路把「原图 + 蒙版」作为两张参考图走共享图像编辑接口；LinkFox 原生 `REMOVE_PEN` 接口的 `eraseImageUrl / maskImageUrl` 字段已按 registry 契约落进 `fields` 参与指纹，但未接原生协议适配器（与其余工具一致）。
3. **触屏涂抹**：`pointerdown/move/up` 走 Pointer Events，触控笔可用；未在真机触屏上验证。
4. 覆盖率来自共享逐像素栅格化，大图（8192 边长）时格子数固定，仅供提示，不参与 provider 请求。
