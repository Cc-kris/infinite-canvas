# TASK-038 商品图设计器（NEW_DESIGNER）实现报告

- 分支：`feat/linkfox-v1-real`
- 工具：`NEW_DESIGNER` slug `new-designer`，分类 `product-design`，路由 `/tools/product-design/new-designer`，`layout: designer`、`adapter: designer-host`、`index: 31`
- 提交：`4149e3d`（4 文件，1981 行新增）
- 范围：仅本任务 4 个文件，未触碰他人文件、未 reset/clean、未 `git add -A`

## 1. 最关键的一个事实（决定了实现形态）

`NEW_DESIGNER` 是 `designer-host` 工具，**本仓库的 image/video 网关对它一律拒绝执行**，代码里有三处显式守卫：

- `web/src/services/api/tools/gateway.ts:92` 注释：`designer 宿主由 LinkFox 设计器接管，本仓库只登记能力，执行会抛 adapter-not-executable`
- `gateway.ts:231` / `gateway.ts:517`：`throw new ToolGatewayError("adapter-not-executable", ...)`
- `web/src/services/api/tools/batch-runner.ts:215`：批量执行同样判 `adapter-not-executable`

所以本任务**没有**、也不该有“提交给 provider 生成图”的链路。设计器真正做的事是：

```
画布文档（图层 / 几何 / 文案） → Canvas 像素级合成 → 真实资产入库（uploadToolAsset） → onDone 回传资产给来源工具
```

三步都是真实动作；任何一步失败就显式失败并带错误码，**不返回占位图、不伪造 assetId**。

## 2. 交付内容

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `web/src/features/tools/registry/new-designer.ts`（新增） | 619 | 页面契约层：6 字段定义与 `registry/index.ts` 逐项自检（`designerSpecDrift`）、几何/文档模型、图层增删改与层级、方向键微调、缩放/旋转/透明度裁剪、撤销重做栈、画布校验、草稿序列化（`tool-draft:v1:NEW_DESIGNER`）、关闭决策、done 载荷 |
| `web/src/features/tools/adapters/new-designer.ts`（新增） | 303 | 真实执行层：`runDesigner`（校验 → 合成 → 入库 → 回传，分阶段上报）、`createCanvasDesignerCompositor`（真实 2D 合成，支持底图/图片/文字、层级、旋转、透明度、尺寸兜底）、`retryDesigner`、结果文案与快照；合成与入库均为可注入端口 |
| `web/src/components/tools/workspaces/designer.tsx`（新增） | 538 | 三栏工作台：左图层列表（显隐/锁定/层级/删除）、中画布（选中、拖拽、方向键微调、缩放旋转控件）、右属性面板（画布预设、几何、文案样式）+ 顶部撤销重做/导出/完成回传；未保存关闭二次确认、草稿自动落盘 |
| `web/src/features/tools/adapters/new-designer.test.ts`（新增） | 521 | 28 个用例 / 146 expect() |

## 3. 关键语义（对着 page-specs/31 与 test_cases TC-046 一条条落）

1. **6 个字段一个不多一个不少**：`designerId / imageUrl / isDesignerUse / onClose / onDone / open`，且 `designerSpecDrift()` 会把“缺字段 / 多字段 / 控件类型 / required / 默认值”四类漂移全部点名——注册表被人改动时测试会直接失败，而不是悄悄跑偏。
2. **回调字段不塞进 payload**：`onClose`/`onDone` 是宿主回调，`auditDesignerFields()` 只做存在性与可序列化检查，`assertDesignerFieldsSerializable()` 拦截函数/循环引用，`buildDesignerFields()` 产出的字段对象里只有宿主需要的数据。
3. **`open` 控制宿主开关**：`open=false` 时禁止导出/回传（`host-closed`），不是靠 UI 隐藏，而是执行层直接拒绝。
4. **`designerId` 是草稿主键**：同 id 重开按 `tool-draft:v1:NEW_DESIGNER` 恢复；指纹（`designerDocumentFingerprint`）与已导出快照不一致时判“参数已变”，提示重新导出后再回传。
5. **`imageUrl` 是底图图层，不是只读预览**：进画布后可移动/缩放/旋转/调透明度，也可再叠加图片与文字图层，图层数受 `DESIGNER_LAYER_LIMITS` 约束。
6. **撤销重做是文档级**：`commitDesignerDocument` 对无实质变化（指纹相同）不产生新历史；新增编辑会清掉 redo 分支；栈深有上限，超限丢最旧。
7. **未保存关闭必须拦**：`decideDesignerClose()` 返回 `confirm`，文案点到“未导出的改动会丢失”，不静默丢弃。
8. **尺寸与像素有上限**：`DESIGNER_CANVAS_LIMITS` 限制宽高与总像素，避免 12000×12000 把浏览器画布打爆。

## 4. 验证（都是跑出来的，不是读代码）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 本任务单测 | `cd web && bun test src/features/tools/adapters/new-designer.test.ts` | **28 pass / 0 fail，146 expect()** |
| 类型检查 | `cd web && npx tsc --noEmit` | **本任务 4 文件 0 报错**；全仓库仅剩 `material-upper-body.test.ts` 的 7 行 `TS2769`（并行任务文件，`git status` 未列出，未修改） |
| 全量单测 | `cd web && bun test` | **910 pass / 1 fail**；唯一失败为 `image-text-edit.test.ts > 校验：阻断项点名且可执行`，该文件我不曾修改（`git status` 未列出），属并行任务的既有失败 |
| 生产构建 | `cd web && bun run build` | `✓ built in 8.21s`，仅历史 chunk 体积提示 |

测试覆盖的关键路径（均为真实断言，无 mock 网关照）：规格漂移自检、字段审计（缺/多/类型/required/默认值）、空画布与越界图层校验、文档几何编辑、撤销重做语义、草稿往返与损坏草稿、关闭决策三态、done 载荷、适配器成功链路（合成→入库→回传）、合成失败/入库失败/host 关闭/空画布四类显式失败、重试沿用同一文档、首屏渲染（空画布禁用导出、带 imageUrl 时底图入列且导出可点）。

## 5. 未完成 / 风险（如实列出）

1. **路由未接线**：`web/src/components/tools/tool-page.tsx` 目前对 `layout: designer` 仍是占位渲染，本任务的 `designer.tsx` 尚未被任何路由 import。这是仓库层面的统一缺口（`pod.tsx`、`scene.tsx` 同样处境），按任务边界未改他人文件；接线时应渲染 `<DesignerWorkspace designerId imageUrl onClose onDone />` 并透传宿主回调。
2. **`open` 与宿主回调的实际来源**：目前契约层校验字段、执行层尊重 `open`，但“谁提供 `onClose`/`onDone`”取决于 LinkFox 宿主注入；缺少宿主联调时会走 `host-closed` 显式失败，属于预期行为而非静默降级。
3. **文字排版为单行**：合成器用 `fillText` 单行居中绘制，宽度超出图层时按 `maxWidth` 等比压缩（不换行、不省略号），字体固定为 `PingFang SC / Microsoft YaHei / system-ui`；多行、字间距、自定义字体族未做（page-spec 未要求，若要支持需扩展 `fontFamily`/`lineHeight`）。
4. **合成在浏览器主线程**：大画布（接近像素上限）导出会有一次明显卡顿，未引入 OffscreenCanvas/Worker；如后续要求性能，可切 `OffscreenCanvas` 而不改调用方（端口已抽象）。

## 6. 使用入口

1. 单测：`cd /Users/mac/Documents/Dev/infinite-canvas/web && PATH=$HOME/.bun/bin:/usr/local/bin:$PATH bun test src/features/tools/adapters/new-designer.test.ts`
2. 全量：`cd web && bun test`；类型：`npx tsc --noEmit`；构建：`bun run build`
3. 页面（接线后）：`/tools/product-design/new-designer`；未接线前可直接渲染 `DesignerWorkspace`（见第 5 节第 1 条）
