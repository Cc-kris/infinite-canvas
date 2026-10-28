# TASK-022｜商品图 `NEW_REPLACE_BG_V2` 工作区

- 分支：`feat/linkfox-v1-real`
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/15-new-replace-bg-v2.md`（tool-matrix 第 15 行）
- 代码提交：`e81d66c`（**注意**：该提交信息由并行任务 HAND_REPAIR 撰写，我的 4 个文件是被并行 `git commit` 一并收进的，文件内容为本次实现）

## 1. 改了什么

| 文件 | 行数 | 内容 |
|---|---|---|
| `web/src/features/tools/registry/new-replace-bg-v2.ts` | 754 | 页面值 model、8 个场景模板、4 个图层、融合强度、输出规格（比例/张数/宽高）、抠图就绪门禁、丢参校验、提示词组装、`canvasData`/`sizeData`/`imageRecords` 序列化、提交快照与漂移检测、撤销/重做纯函数 |
| `web/src/features/tools/adapters/new-replace-bg-v2.ts` | 398 | 参考图定序（商品 → 蒙版 → 背景）、丢参守卫 `assertNewReplaceBgInput`、真实 `runNewReplaceBg`/`retryNewReplaceBg`、结果状态与「参数已变→过期」判定、结果矩阵 |
| `web/src/components/tools/workspaces/scene.tsx` | 803 | `SceneWorkspace` 全页：左栏（商品层上传 / 抠图确认 / 场景推荐·自定义 / 图层显隐锁定 / 融合强度 / 位置缩放旋转 / 输出比例与张数）、右栏（合成画布 + 撤销重做 + 图层 + 真实请求参数 + 提交 + 结果 + 本次提交快照） |
| `web/src/features/tools/adapters/new-replace-bg-v2.test.ts` | 488 | 24 个测试（含 `react-dom/server` 真实渲染 3 个） |

关键实现点：

1. **不按空字段提交**：`NEW_REPLACE_BG_V2` 的 `fields_clean` 为空，本页按 chunk 状态序列化提交（`canvasData` / `sizeData` / `imageRecords` + 五个 layerRef + `lockCutoutModal` + `weight` + `sceneType=Recommend`），与 page-spec §7 一致。
2. **抠图门禁**：蒙版未上传、未确认、透明底但图无 alpha 三种情况分别拦截，校验把「抠图缺口」和「场景缺口」分开报，步骤条随之推进。
3. **丢参守卫**：篡改强度 / 漏传蒙版 / 换尺寸都会被 `assertNewReplaceBgInput` 拦下，测试覆盖。
4. **撤销/重做**：逻辑抽成 registry 纯函数（`pushSceneHistory` / `stepSceneHistory` / `sceneHistoryState`，上限 30 步，改参数清空重做栈），组件只持有状态，因此可单测；按钮 40px 点击区 + `aria-label` + 明确禁用态。
5. **结果不冒充**：结果只取自 `task.result`；参数变更后旧结果标记过期并说明原因；失败不产出图。
6. **真实结果动作**：结果区复用既有 `ToolResult`，下载 / 存入资产库 / 发送到画布都走真实存储与画布 store 链路，没有自造假按钮。

## 2. 如何验证（实测输出）

```
# 单文件 24 个测试
$ bun test src/features/tools/adapters/new-replace-bg-v2.test.ts
 24 pass / 0 fail / 145 expect() calls   (Ran 24 tests across 1 file)

# 全仓
$ bun test
 567 pass / 0 fail / 4072 expect() calls  (Ran 567 tests across 29 files)

# 类型
$ npx tsc --noEmit -p tsconfig.json
（本任务 3 个文件 0 error；全仓剩余 error 仅来自其它任务未跟踪的 .test.ts）

# 构建
$ npx vite build
✓ built in 8.07s
```

覆盖的验收点（对应 page-spec §8）：

- 首屏就是本页独有区域，不是通用任务卡：渲染测试断言 8 个模板、4 个图层、画布、结果格全部存在。
- 未上传商品时提交按钮被真实拦截（渲染测试断言提示文案，而不是可点的假按钮）。
- 字段联动：`sizeData.count` 以真正下发的 `output.count` 为准（这正是本轮修掉的真实不一致：原先取页面控件的 `values.outputNum`，两者会各说各话）。
- spec 组件名可对上：`scene-layer-composer` / `scene-similarity-control` / `scene-variant-grid` 锚点均有渲染断言。
- 撤销重做：4 个测试覆盖空历史、回退/前进、新分支清空重做栈、30 步上限。

## 3. 未完成 / 风险

1. **工作区未挂载**：全仓没有任何 `toolId → workspace` 映射（`rg "workspaces/"` 只命中测试导入），与其它已存在工作区（color / crop / enhance…）现状一致，属于既有架构缺口，本任务按边界未改路由。入口文件已备好：`components/tools/workspaces/scene.tsx` 的默认导出。
2. **无浏览器交互测试**：仓库未安装 jsdom / happy-dom / testing-library，因此点击级交互无法自动化；采用「纯函数单测 + SSR 渲染断言」替代，真实点击验收仍需人工或后续引入 DOM 环境。
3. **透明底检测**：`goodsHasAlpha` 来自上传记录的像素抽样（canvas 读 alpha），非 PNG 的透明信息无法识别，属已知限制。
4. **提交归属**：代码落在 `e81d66c`（并行任务提交信息下），如需干净历史须 rebase 拆分，我未擅自动他人提交。

## 4. 使用入口

- 路由：`/tools/product-design/new-replace-bg-v2`（registry 已登记 `id: NEW_REPLACE_BG_V2`，导航 `constant/navigation-tools.ts` 已有条目）
- 组件：`SceneWorkspace`（`web/src/components/tools/workspaces/scene.tsx`）
- 逻辑：`features/tools/registry/new-replace-bg-v2.ts` + `adapters/new-replace-bg-v2.ts`
