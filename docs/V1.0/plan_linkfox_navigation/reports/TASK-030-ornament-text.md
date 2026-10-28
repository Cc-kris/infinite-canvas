# TASK-030 ORNAMENT_TEXT「饰品文字」实施报告

- 分支：`feat/linkfox-v1-real`
- 代码提交：`5452593` feat(tools): ORNAMENT_TEXT 饰品文字工作区与提交契约（22 用例）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/23-ornament-text.md`
- 注册表：`web/src/features/tools/registry/index.ts` 已有 `id: ORNAMENT_TEXT`、`makeType: 17`、`layout: "text"`、`adapter: "image"`，字段 `fontSize / fontname / left / prompt / right`
- 网关：`web/src/services/api/tools/gateway.ts` 已声明这 5 个字段进指纹、`promptRequired: true`、`requiresReferences: false`（无需参考图）

## 1. 改了什么

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/ornament-text.ts` | 325 | 页面契约：取值类型与归一化、字体目录与 CSS 字体栈、字段级校验（8 个错误码）、单一 prompt 合成、快照指纹与漂移、草稿容错读取、布局撤销/重做与方向键平移 |
| `web/src/features/tools/adapters/ornament-text.ts` | 254 | 请求装配（5 字段全覆盖）+ 逐字段回读审计 + 提交前守卫、`runOrnamentText` / `retryOrnamentText`、结果出口（漂移/空结果/未知状态）与可读提示 |
| `web/src/components/tools/workspaces/text.tsx` | 508 | 工作区：左「文字与参数（内容/字体字号/左右定位）」· 中「效果预览（可拖拽文字层 + 文字框列表）」· 右「结果」；工具栏撤销/重做/左中右对齐/复位；移动端分区页签；无假结果 |
| `web/src/features/tools/adapters/ornament-text.test.ts` | 365 | 22 个用例（契约、校验、请求体、运行、结果、历史、首屏渲染） |

## 2. 关键设计决定（都有代码依据）

### 2.1 五个参数必须写进 prompt，否则等于静默丢参

`gateway.ts` 的 `ToolAdapterInput.fields` 注释写明：字段只用于指纹与 UI 回读，**真正发给 provider 的只有 `prompt`（+ 参考图）**。因此 `buildOrnamentTextPrompt` 把五件事逐条落到文本里：

1. 文字内容（逐字照排，不得增字漏字改字）
2. 字体 `fontname` + 中文标签
3. `fontSize`
4. `left`–`right` 百分比范围 + 位置文案（偏左/居中/偏右）
5. 效果描述（缺省时给出「保持原材质与真实光影」的明确默认）

`buildOrnamentTextFields` 同时产出 `{ fontname, fontSize, left, prompt: 文字内容, right }`——`prompt` 字段按注册表语义承载**文字内容**，完整提示词走 `BrowserToolInput.prompt`，两者不互相覆盖。

### 2.2 审计要读真实下发信号（此处发现并修掉一个真 bug）

初版 `auditOrnamentTextFields` 用 `fields.prompt` 做「参数是否进 prompt」的判定，测试直接失败：`fields.prompt` 是文字内容（几个字），不可能是完整提示词，于是 `fontname/fontSize/left/right` 一律被误报「未进 prompt」。
修正为显式接收 `providerPrompt` 参数（由 `input.prompt` 传入），审计才有意义：现在「参数没进提示词」和「字段被改写」能被真实区分，测试里两条断言分别覆盖（`fontname` 缺失 → 点名 `fontname`；`left: 19` → 点名 `字段 left 期望 20`）。

### 2.3 结果出口统一，不手搓

工作区初版自己拼 `OrnamentTextResult`，导致 `drift` 恒为空串、`stale` 与提示文案各写一套。已改为调用 `ornamentTextResultFromTask(latest, snapshot, currentSnapshot)` + `ornamentTextResultNotice(result)`：漂移维度、空结果降级、未知状态都由适配器单点判定。

### 2.4 字体目录是「本地预览字族」，不是上游字体库

原站该页为 `permission_redirect_home`，没有字体清单可抓。`ORNAMENT_TEXT_FONTS`（6 项：serif / sans-serif / script / display / rounded / mono）是**当前浏览器能真实渲染的 CSS 字体栈**，`fontname` 原样透传；`ORNAMENT_TEXT_CATALOG_NOTICE` 与 `ornamentTextPreviewNotice` 在界面上明示「预览字族 vs 上游实际字族」的差异，不承诺字体库一致。

### 2.5 校验与守卫：不合法就不发请求

`validateOrnamentTextState` 产出 8 类错误码：`text-required` / `text-too-long`（>4000）/ `effect-too-long`（>600）/ `font-required` / `font-too-long`（>64）/ `font-size-range`（8–400）/ `position-range`（0 ≤ left < right ≤ 100 且宽度 ≥ 3%）/ `model-missing`。
`assertOrnamentTextInput` 在 `submit` 前额外硬校验：工具 id 必须是 `ORNAMENT_TEXT`、`count === 1`、不得带参考图、`fields` 与 `values` 逐字段一致、`prompt` 必须携带五项参数——任一条不满足直接抛错，**请求不发出**（测试覆盖）。

### 2.6 位置与历史

`left/right` 是相对百分比，拖动与方向键都经 `nudgeOrnamentTextLayout` 保宽平移并夹在 0–100；数字统一 1 位小数（`ornamentTextNumber`），避免浮点抖动污染指纹。历史栈 `past/future` 只记录布局三元组（left/right/fontSize），同值操作不入栈（测试断言「提交同值不产生历史噪声」）。

## 3. 验证（实际执行，非推断）

| 检查 | 结果 |
| --- | --- |
| `bun test src/features/tools/adapters/ornament-text.test.ts` | **22 pass / 0 fail**，114 expect |
| `bun test`（全量） | **747 pass / 0 fail**，37 文件 |
| `npx tsc --noEmit`（只看本任务 4 个文件） | 无错误 |
| `bun run build` | 通过，7.54s |

首屏渲染用例（`renderToStaticMarkup`）断言：五区文案齐备（饰品文字内容 / 字体与字号 / 左右定位 / 效果预览 / 文字框列表 / 生成饰品文字）、空文字时提交按钮带 `disabled`、显示「预览字族」提示 —— 无网络、无假结果。

已知非本任务问题：`tsc --noEmit` 在 `src/components/tools/workspaces/handheld-goods.tsx` 有 4 条既有报错（`listToolsByCategory` 未导出、`.label` 不存在等），与本次改动无关，未触碰。

## 4. 未完成与风险

1. **未接路由**：`features/tools/tool-page.tsx` 目前对所有工具渲染 `WorkspacePlaceholder`，仓库内 40+ 个工作区组件（含 `pod.tsx`）都未被路由挂载。本任务按现有惯例只交付工作区组件，接线属共享文件改动，未做。
2. **未跑真实 provider**：无网络/凭据条件下的单测与构建已绿，但「真实上游是否按 prompt 里的位置/字号出图」未取证，字体字族、`fontname` 类型仍为未知；适配器选择显式校验 + 明确抛错，而不是乐观提交。
3. **图片任务无查询接口**：网关 `poll` 只对视频有效，图片在 `submit` 内一次推进到终态；因此「刷新后恢复未完结图片任务」只能报 `unknown + reconcileRequired`，工作区以「未知状态不掩盖」的文案呈现，不伪造成功。
4. 草稿走 `useToolDraftStore`（键 `tool-draft:v1:ORNAMENT_TEXT`），多标签冲突沿用既有 `decideRemoteDraft` 策略，未新增机制。
