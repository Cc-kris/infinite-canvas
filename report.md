# TASK-034 AI_DRESSING_XSY（AI试衣XSY）报告

- 分支：`feat/linkfox-v1-real`
- 提交：`e325ca7` feat(tools): AI_DRESSING_XSY 试衣工作区与提交契约（17 字段/4 步/蒙版真实导出，17 用例）
- 路由：`/tools/product-design/ai-dressing-xsy`（registry `index.ts:425` 已登记 id `AI_DRESSING_XSY` / index 27 / makeType 39 / layout `dress`）
- 网关：`services/api/tools/gateway.ts:88` 已声明 17 字段、`kind: image`、`requiresReferences: true`
- 详版：`docs/V1.0/plan_linkfox_navigation/reports/TASK-034-ai-dressing-xsy.md`

## 改了什么

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-dressing-xsy.ts` | 871 | 17 字段键与表单值、双 Tab（上下装/连体）+ 三槽位、4 步状态机（`active/stale/pending/done` + 前序 locked）、10 个校验码（error/warning 分级）、快照指纹与漂移、能力解析（provider/version/张数）、`composeXsyFields` 17 字段合成、prompt 合成、预计输出与参考图数 |
| `web/src/features/tools/adapters/ai-dressing-xsy.ts` | 358 | `renderXsyMasks` 逐槽位真实栅格化导出（与源图同尺寸，空蒙版抛 `mask-empty`）、`buildXsyUnit` 三段守卫、`buildXsyInput`、`runXsyUnit`、`mapXsyTaskToOutcome`（成功无图 = 失败）、`xsyResultView` 过期视图 |
| `web/src/components/tools/workspaces/dressing-xsy.tsx` | 936 | 新增 `AiDressingXsyWorkspace`：左「模特 + 类型/风格/姿势 + 版本」· 中「服装上传 + 可涂抹蒙版画布（画笔/橡皮/整件/撤销/清空/覆盖率）」· 右「17 字段自检 + 结果」；条件不足提交禁用并给原因，无假结果 |
| `web/src/features/tools/adapters/ai-dressing-xsy.test.ts` | 355 | 17 用例 / 97 断言：字段契约与网关逐字一致、默认值、步骤拦截、stale 传染、17 字段合成、快照漂移、能力解析、蒙版栅格化与空蒙版、装配抛错、请求装配、结果判定、SSR 首屏 |

## 关键设计

1. **契约钉死在网关**：17 键与 `gateway.ts:88` 集合相等且无重复，两侧任一漂移即红。
2. **蒙版是真实像素**：复用 area-repair 的 `renderMaskPng`，尺寸严格等于源图，导出的 `coverage` 就是提交时那份像素；空蒙版按失败处理，不补白图。
3. **步骤状态语义**：当前步恒为 `active`（哪怕有错要修）；其他步有错 `pending`；上游改过 `stale`；`locked` 只看前序错误 → 不能跳过没填的模特。
4. **上游改动只降级下游**：改模特只把 3/4 步标 stale；切 Tab 只清空另一侧槽位并标 3/4 stale，草稿不删。
5. **三段守卫**：工作区禁用 → `buildXsyUnit` 抛错 → `buildXsyInput` 校验 references（模特 + 每件服装 + 同尺寸蒙版），绕过 UI 直接调适配器也发不出去。

## 如何验证

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
PATH=$HOME/.bun/bin:$PATH bun test src/features/tools/adapters/ai-dressing-xsy.test.ts   # 17 pass / 0 fail
PATH=$HOME/.bun/bin:$PATH bun test                                                      # 860 pass / 0 fail（42 files）
PATH=$HOME/.bun/bin:$PATH bun run typecheck                                             # 本次改动 0 新增错误
```

`typecheck` 剩余 5 条报错在未改动的 `workspaces/designer.tsx`、`adapters/fission-link(.test).ts`，属分支既有问题。

## 未完成 / 风险

1. **未挂载到工具页**：`tool-page.tsx` 仍渲染规格占位（其注释写明挂载属后续 TASK），因此路由打开是占位页，工作区目前只被测试引用。这是本次最大缺口。
2. **未做真实网关联调**：`runXsyUnit` 走 `useToolTaskStore.runTool`，测试用注入 port + 伪造 `ToolTask` 验证判定，没真跑上游一次；首次真跑需确认 `provider`/`version` 取值被上游接受。
3. **蒙版引用形式**：当前把蒙版 dataUrl 直接并入 `references`；若上游要求已入库 URL（v2 是先 upload 再引用），需在 `buildXsyInput` 前接 `uploadToolAsset`，本轮未做。
4. 覆盖率阈值 0.2% 沿用 v2 经验值，未用真实样本校准。

## 使用入口

- 契约：`web/src/features/tools/registry/ai-dressing-xsy.ts`
- 提交：`web/src/features/tools/adapters/ai-dressing-xsy.ts`
- 界面：`web/src/components/tools/workspaces/dressing-xsy.tsx`（`AiDressingXsyWorkspace`）
- 测试：`web/src/features/tools/adapters/ai-dressing-xsy.test.ts`
