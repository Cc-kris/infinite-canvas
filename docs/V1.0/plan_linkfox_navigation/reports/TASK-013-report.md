# TASK-013 智能扩图（AI_OUTPAINTING）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`7310442` feat(tools): AI_OUTPAINTING 智能扩图真实工作台（画布拖拽扩边+蒙版同步+变换历史）
- 规格来源：仓库根 `AI_OUTPAINTING.json`（页面 DOM 实测采集）+ `docs/V1.0/plan_linkfox_navigation/page-specs/06-ai-outpainting.md`
- 变更规模：7 文件 / +2909 行（5 源码 + 2 证据，均为新增，未改动他人文件）

## 1. 交付内容

| 文件 | 作用 | 行数 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-outpainting.ts` | 页面契约：比例/尺寸预设、几何模型（画布 + 原图偏移）、扩边与键盘微调、蒙版计划与几何 hash、草稿 schema、快照 fingerprint、有界撤销栈 | 910 |
| `web/src/features/tools/adapters/ai-outpainting.ts` | 真实 provider 适配：原图尺寸测量、蒙版 PNG 真实渲染并入库、请求组装、提交+轮询、结果归一、过期判定 | 391 |
| `web/src/features/tools/adapters/ai-outpainting.test.ts` | 51 条契约测试（几何数学、校验、蒙版几何一致性、快照/stale、撤销栈、任务映射） | 684 |
| `web/src/components/tools/workspaces/outpaint.tsx` | 扩图工作台 UI：上传原图、四边拖拽扩展画布、比例/尺寸联动、扩展像素汇总、撤销/重做、生成与结果 | 787 |
| `web/src/components/tools/workspaces/outpaint.test.tsx` | 5 条渲染测试（服务端真实渲染组件 HTML 并断言结构、可达性、禁用态） | 104 |

## 2. 关键实现点（对齐页面规格 §1–§7）

- **画布几何语义（本页核心）**：`width/height` 是画布尺寸，`offsetX/offsetY` 是原图在画布内的位置，`sourceWidth/sourceHeight` 是原图原始像素。拖拽任何一条边**只改画布尺寸与原图偏移，绝不缩放原图**——`keepRect(values).width/height` 在整个扩展过程中恒等于原图原始像素（测试断言覆盖）。
- **四边扩展**：`expandEdge(values, edge, delta)` 按方向扩/收画布并同步平移原图；最小扩展 `8px`、原图可见比例下限 `0.25`，越界即被夹紧，不会出现原图被挤出画布却仍可提交的状态。
- **键盘可达（规格 §6）**：四条边在 DOM 上是 `role="slider"` + `tabIndex` + `aria-valuenow`，方向键步进 `8px`、`Shift` 加速 `64px`（`edgeKeyboardDelta`），四边共用 40px 拖拽热区，符合 40×40px 最小点击区要求。
- **比例与尺寸联动**：`OUTPAINT_RATIOS` 提供比例选项，选比例按原图长边换算并 `alignSide` 对齐到 8 的倍数；自定义宽/高联动保持比例；边界 `256–4096`、单文件 `10MB`。比例切换会重置为居中（`centerOffset`），不保留一个已经跑偏的偏移。
- **蒙版真实渲染**：`renderMaskPng` 在浏览器 canvas 上按当前几何真实绘制——**白色 `#ffffff` = 需要补全的扩展区，黑色 `#000000` = 原图保留区**，`toBlob` 导出 PNG 后入库。蒙版默认对齐到画布 8 的倍数，`assertMaskGeometry` + `geometryHash` 保证「蒙版几何 == 画布几何 == 提交快照几何」，三者不一致直接抛错，不会偷偷把旧蒙版发上去。
- **变换历史**：`transformSignature` 只对几何/锁定字段取签名，所以**输入提示词不会污染撤销栈**；`pushOutpaintHistory` 有界（`OUTPAINT_HISTORY_LIMIT = 50`），新操作清空 redo 分支。撤销只回退几何，当前提示词、输出数量、蒙版 URL 保留。UI 同时提供按钮与 `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`、`Ctrl+Y` 快捷键，空栈时撤销/重做是幂等空操作。
- **原图锁定**：默认锁定（防止误拖），解锁后才可拖动原图位置；换原图会重置几何、清空旧蒙版并标记 `missing`，不沿用上一张图的蒙版。
- **防伪成功**：结果来自真实 TaskGateway；任务是 `succeeded` 但没有任何图片时映射为 **失败**，绝不补造占位图。输入一变，旧结果通过 `outpaintSnapshotHash` 比对立即标记 stale，并在结果区提示重新生成。
- **结果区**：沿用共享 `ToolResult`，下载 / 保存资产 / 发送画布（真实存储链路）与运行中的取消、失败后的重试均复用既有通道（`onCancel` / `onRetry` 已接 `AbortController`）；提交区的「提交快照 xxxxxxxx」显示本次几何+参数 hash 前缀，用于和结果对照。**注意：结果区目前没有独立的「输入快照查看器」**，只有 hash 前缀。
- **算力区**：按仓库既有约定（`scale-up.ts`、`product-image-suite.ts` 同款处理）**不复刻原站「N算力」文案**，主按钮文案为「开始扩图」，生成中为「生成中…」。

## 3. 如何验证（可复现）

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
export PATH=$HOME/.bun/bin:/usr/local/bin:$PATH

# 本任务全部用例（51 适配器 + 5 渲染 = 56）
bun test src/features/tools/adapters/ai-outpainting.test.ts \
         src/components/tools/workspaces/outpaint.test.tsx

# 同目录回归
bun test src/features/tools src/components/tools

# 类型检查
bunx tsc --noEmit -p tsconfig.json
```

实测结果（详见 `evidence/task-013-verification.txt`）：

- 本任务 **56 pass / 0 fail**，240 个断言；
- 回归 `features/tools + components/tools` 共 311 条，其中 3 条失败**全部落在另一位同事正在写的 `remove-pen`（未跟踪 WIP）**，与本任务无关；本任务文件 0 失败；
- `tsc` 项目级报错只出现在他人未完成的 `remove-pen.test.ts` / `mask.tsx`；本任务 5 个文件无 TS 错误。

渲染证据：`evidence/task-013-outpaint-render.html` 是**真实调用组件 `renderToStaticMarkup` 输出的 20,471 字节 DOM**，可直接在浏览器打开查看首屏结构（原图区 / 扩图画布 + 四边 slider / 比例与尺寸 / 生成区 / 结果区），不是手写示意图。

## 4. 未完成与风险（诚实说明）

1. **工作台尚未挂载到路由（跨任务共享缺口，非本任务文件）**：`web/src/features/tools/tool-page.tsx` 目前对未接工作台的布局仍渲染 `WorkspacePlaceholder`，且全仓库没有任何一处 `import` 过 `workspaces/*`（已 grep 验证：`workspaces/suite|enhance|color-v2|translate` 零命中）。因此 `/tools/ecommerce-suite/ai-outpainting` 打开的是占位页，**本组件已可独立渲染并通过测试，但要在浏览器里真操作需一行挂载改动**。建议由统一入口任务在 `tool-page.tsx` 加「layout → 工作台组件」映射（`mask` 布局 → `OutpaintWorkspace`），我自己不动共享文件以免与其他并行任务冲突。
2. **网关没有独立 mask 通道**：`ProviderInvocation` 只有 `{ prompt, references }`。当前把渲染好的蒙版 PNG 作为**第 2 张参考图**随请求提交，同时在 `fields.maskUrl` 里保留真实地址便于排查；UI 上有一行说明写清这个边界。等网关支持 mask 字段后，只需在 `buildOutpaintInput` 换字段，蒙版渲染与几何校验逻辑可复用。
3. **画布拖拽的端到端交互**：仓库未安装 `happy-dom` / `jsdom` / `@testing-library`（`package.json` 已验证），现有约定是 SSR 渲染断言。因此拖拽的**几何数学**由 51 条纯函数测试覆盖（含边界夹紧、比例换算、扩展不缩放），**DOM 事件链路**（pointerdown → pointermove → onChange）尚未有自动化用例，属真实缺口。
4. **真实出图未跑**：需要线上账号与算力，本地只验证了请求组装、快照、结果映射与失败路径，没有跑过一次真实扩图任务。

## 5. 使用入口

- 路由：`/tools/ecommerce-suite/ai-outpainting`（`AI_OUTPAINTING_ROUTE`）
- 组件：`import { OutpaintWorkspace } from "@/components/tools/workspaces/outpaint"`，可传 `{ className }`
- 契约/适配器：`@/features/tools/registry/ai-outpainting`、`@/features/tools/adapters/ai-outpainting`
- 让页面真正打开它：在 `tool-page.tsx` 的 layout 分支里把 `AI_OUTPAINTING` 映射到 `OutpaintWorkspace`（共享文件，交由统一入口任务处理）
