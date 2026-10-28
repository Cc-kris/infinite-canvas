# TASK-025 手持商品 HANDHELD_GOODS 实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`ba538e4` feat(tools): 手持商品 HANDHELD_GOODS 工作区与运行适配器（TASK-025）
- 变更规模：4 文件 / +2111 行（全部新建）

## 1. 交付物

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/handheld-goods.ts` | 667 | 页面契约：状态模型、3 组手持页签 + 12 个确定性姿势示意 SVG、场景页签、检测类型、张数 1–4、快照指纹、草稿序列化、字段绑定与审计 |
| `web/src/features/tools/adapters/handheld-goods.ts` | 475 | 运行适配：单元构造（每张 = 一次真实上游请求）、输入断言、并发执行、失败隔离、结果视图 |
| `web/src/components/tools/workspaces/handheld-goods.tsx` | 641 | 工作区 UI：商品图上传、姿势卡片库、场景/检测/张数控件、逐张结果 + 单独重试、旧版本标记、同类工具侧栏 |
| `web/src/features/tools/adapters/handheld-goods.test.ts` | 328 | 18 个 bun 用例 |

注册表接线（`registry/index.ts` 的 `HANDHELD_GOODS` 条目）已在 HEAD 中，无需改动。

## 2. 关键行为（真实边界，不造数据）

1. **参考图 = 商品图 + 姿势示意图**：每个生成单元带两张参考图，姿势示意图由 registry 用确定性 SVG 生成（不是外链占位图）。
2. **缺图即拒**：`dataUrl` 与 `url` 皆空时抛 `product-missing`，不发空图请求。
3. **上游无图判失败**：任务 `succeeded` 但 `result.items` 里没有 image → 该张标记 `empty-result` 失败，绝不用原图冒充满意图。
4. **一次一张**：张数 N → N 个单元、N 次上游请求，并发上限可配；单张失败不影响其他张（`Promise.all` 内逐单元 try/catch）。
5. **失败可单独重试**：`retryHandheldGoodsUnit` 按同一快照重发真实请求，不复制上次结果。
6. **旧结果可见降级**：配置变更 → 快照指纹变化 → 已有结果打「来自旧版本」标记，不 silently 冒充当前配置的产物。
7. **字段全落点**：11 个 ToolSpec 字段在 `HANDHELD_GOODS_FIELD_BINDINGS` 中逐一绑定（输入 6 / 输出 2 / 本页不适用 2 显式排除），`imageMaskUrl` 明确标注「本页无 MaskEditor，接入后启用，不伪造 URL」。

## 3. 验证证据

```
$ cd web && bun test src/features/tools/adapters/handheld-goods.test.ts
 18 pass
 0 fail
 119 expect() calls
Ran 18 tests across 1 file.

$ cd web && npx tsc --noEmit
（0 行输出，全项目类型检查干净）
```

测试覆盖：
- registry：工具身份/路由/布局、上传约束（10MB、384²–4096²、png·jpeg·webp）、张数越界收敛、三页签姿势候选均可渲染、草稿往返与坏值回落、快照指纹随配置变化、字段级校验（缺图/缺姿势/张数非法）
- adapter：缺地址拒绝、N 张 → N 单元且每单元两张参考图、上游有图 → succeeded 并回填结果字段、上游无图 → `empty-result` 失败、提交抛错隔离、结果视图 `partial`
- workspace：`renderToStaticMarkup` 首屏渲染出姿势库、张数控制与禁用的提交按钮

## 4. 偏差与遗留风险

1. **未改 `workspaces/model.tsx`**：该文件已被 TASK-027（AI_POSTURE）占用（untracked），为避免跨任务冲突，本页工作区落在独立文件 `workspaces/handheld-goods.tsx`。
2. **页面路由尚未把组件接上**：`tool-page.tsx` 目前仍渲染 `WorkspacePlaceholder`，没有 `toolId → 组件` 的 dispatch 表；该文件不在本任务允许改动清单内。**集成需要一行 dispatch 注册**，否则用户从 `/tools/product-design/handheld-goods` 进来看到的仍是占位符。
3. **商品图落 dataUrl 的时机**：提交/重试时通过 `imageToDataUrl` 从 storageKey 读取（与 printing-repair 同路径），读到空则提示「商品图本地数据已不可用，请重新上传」——即刷新页面后若本地 Blob 仍在，可重试；若已被清理，需重传。
4. **`imageMaskUrl` 未启用**：规格 §2 的四组控件不含蒙版编辑，绑定表已标注 not-applicable，未伪造 URL。

## 5. 集成入口

```ts
// tool-page.tsx（或对应 dispatch 处）
HANDHELD_GOODS: lazy(() => import("@/components/tools/workspaces/handheld-goods")),
```

路由：`/tools/product-design/handheld-goods`（`HANDHELD_GOODS_ROUTE`）
