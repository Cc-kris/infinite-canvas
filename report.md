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


---

# TASK-036 图片文字编辑（IMAGE_TEXT_EDIT）实施报告

提交：`b043e4e`（feat/linkfox-v1-real）

## 改了什么

| 文件 | 作用 |
| --- | --- |
| `web/src/features/tools/registry/image-text-edit.ts` | 页面契约与纯逻辑：8 字段常量、格式/字号/画布夹紧、框增删改复制、**框历史 undo/redo（删除可撤销）**、排版估算（溢出/缺字）、校验（阻断项 vs 提示项）、快照与漂移判定、prompt 构建与 `parseImageTextEditPrompt` 回读 |
| `web/src/features/tools/adapters/image-text-edit.ts` | 真实提交：`buildImageTextEditInput`（源图作为**唯一参考图** + 8 字段 + requestId）、三段守卫（校验 → 字段审计 → prompt 逐框回读）、`runImageTextEdit`/`retryImageTextEdit` 走 `useToolTaskStore` 同形 port、结果判定（失败/未知/空图/stale）与文案 |
| `web/src/components/tools/workspaces/image-text-edit.tsx` | 工作区四区：**图片文字画布**（框选新建/拖拽移动/右下角缩放，选中与列表、属性面板三处同步）｜**文本框列表**（索引、内容、溢出/缺字标记、复制、删除、上下移动）｜**属性编辑**（文本、字号、字重、对齐、颜色、字体、几何）｜**导出**（格式 PNG/JPEG/WebP + 结果区）；草稿 `tool-draft:v1:IMAGE_TEXT_EDIT`（hydrate/patch/flush + revision），换图/改框后旧结果显式降级，`ToolResult` 收口重试与下载 |
| `web/src/components/tools/workspaces/text.tsx` | text 家族统一入口再导出 `ImageTextEditWorkspace`（保留 `OrnamentTextWorkspace` 命名与 default 导出不变） |
| `web/src/features/tools/adapters/image-text-edit.test.ts` | 23 用例：脏草稿收敛、越界夹紧、删除可撤销/同内容不刷历史、8 字段不丢参、prompt 逐框可回读、溢出与缺字、阻断码、换图/改格式漂移、真实提交与重试、守卫拒发、首屏 SSR 可操作 |

关键设计（为什么这样写）：

1. **不静默丢参**：网关只把 `prompt` + 参考图送给 provider，`fields` 只进指纹/审计。所以每个框的文本、几何、字体、字号都写进 prompt，并用 `parseImageTextEditPrompt` 在适配器里回读校验——漏一个框就抛错。
2. **原图永不被覆盖**：源图只作为 edit 模式参考图进入 `references`（`requiresReferences=true`，无图直接 `references-required`），结果落在独立结果区；`resultImageUrl` 作为输出字段提交时恒为空。
3. **归一化坐标**：框的 x/y/w/h 存 0~1，换分辨率不丢版；字号按源图像素存，画布按显示比例缩放预览。
4. **阻断与提示分开**：无图/超大/尺寸越界/格式非法/框数超限/空文本/模型未选是阻断；**溢出和缺字只提示不阻断**（本地字宽模型与上游排版必然有差，硬拦会误伤）。
5. **旧结果不冒充新结果**：源图、文字、几何、字号、颜色、字体、导出格式任一变化即产生漂移维度，结果区显示"来自旧版本"。

## 如何验证

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
PATH=$HOME/.bun/bin:$PATH bun test src/features/tools/adapters/image-text-edit.test.ts   # 23 pass / 0 fail
PATH=$HOME/.bun/bin:$PATH bun test src/features/tools/adapters/image-text-edit.test.ts \
    src/features/tools/adapters/ornament-text.test.ts                                     # 45 pass / 0 fail
PATH=$HOME/.bun/bin:$PATH npx tsc --noEmit                                               # 本次文件 0 报错
```

本次运行全量 `bun test` 为 911 pass / 1 fail；唯一失败与 `tsc` 报错都在他人文件 `web/src/features/tools/adapters/material-upper-body.test.ts`（语法错误，同分支并发改动），与本任务无关。

## 未完成 / 风险

1. **未挂载到工具页**（沿用分支现状）：`tool-page.tsx` 对未挂载工具渲染规格占位，路由打开仍是占位页，工作区目前只被测试引用。挂载属后续 TASK。
2. **未真实跑上游一次**：`runImageTextEdit` 走网关 `submit/waitForResult/retry`，测试用注入 port + 伪造 `ToolTask`；首次真跑需确认上游支持 edit 参考图 + 中文/英文排版，且"保持原图尺寸"是否被遵守。
3. **字体是本地预览字族**：`fontId` 原样透传，上游字体库未取证；缺字检测基于本地覆盖表，只能提示不能保证。
4. **文本识别未接入**：页面不生成示例文案，框只能手动框选/新增（规格里的"识别文字"需真实 OCR，未取证故未做）。
5. 本地布局模型为字宽估算（CJK 1.0em / 拉丁 0.55em），未用真实字体度量校准。

## 使用入口

- 契约：`web/src/features/tools/registry/image-text-edit.ts`
- 提交：`web/src/features/tools/adapters/image-text-edit.ts`
- 界面：`web/src/components/tools/workspaces/image-text-edit.tsx`（`ImageTextEditWorkspace`，经 `workspaces/text.tsx` 再导出）
- 测试：`web/src/features/tools/adapters/image-text-edit.test.ts`
