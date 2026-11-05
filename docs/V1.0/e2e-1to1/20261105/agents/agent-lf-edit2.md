# agent-lf-edit2：智能修图画布类（第二组）视觉收口

任务空间：`agent-lf-edit2`（ego-browser space 3）。原站只读：只打开页面、量 DOM、截图，未点任何生成。

## 原站实测（1600×1000，DPR 1）

| 工具 | 画布列 | 配置列 | 结果列 | 空态示例 |
|---|---|---|---|---|
| 色差修复 | 825 宽，`#edeff5`，无工具条 | 255 宽白卡 820 高 + 10 间距 + 32 高「立即生成」 | 300，`#edeff5`，42 高白色页签条 | `guide-color-diff-repair.mp4` 382×249 |
| 手部修复 | 840 宽，顶部 40 高白色画笔条 | 240 宽白卡（性别与年龄 / 生成张数）+ 立即生成 | 同上 | `guide-hand-repair.mp4` |
| 印花修复 | 840 宽，顶部 32 高白色小贴士条 | 240 宽白卡（Step 1/2/3）+ 立即生成 | 同上 | `guide-printing-repair.mp4` |
| 图片裁剪 | 1100 宽，顶部 44 高操作条 | 右侧 270 宽参数面板 | 无 | `image-crop-upload-tour.jpg` 437×300 |
| 商品替换 | 886 宽，底部 48 高单行参数条 | 无 | 504 宽 | `guide-changegoods.mp4` 649×423 |

空态白卡：542 宽、圆角 12、内边距 24/40，视频 382×249 圆角 12，标题 20px，说明 16px。

示例素材从原站 CDN 原样下载（非自造）：

- `web/public/__cases/color-diff-repair/guide.mp4`
- `web/public/__cases/hand-repair/guide.mp4`
- `web/public/__cases/printing-repair/guide.mp4`
- `web/public/__cases/product-replacement/guide.mp4`
- `web/public/__cases/image-crop/upload-tour.jpg`

## 进度

### FIX_COLOR 色差修复：已收口（高度除外）

- 列顺序改为原站「画布 | 配置 255 | 结果 300」，不再用 `ToolWorkspaceColumns`（它只支持两列），改为与 `mask.tsx` 同样的三列 grid，保留 `tool-main-column` / `tool-config-column` 测试 ID。
- 画布空态换成新组件 `RepairGuideCard`（`workspaces/repair-guide.tsx`），里面放原站示例视频、标题和两行说明。画笔工具条与覆盖率只在已上传后出现（原站空态没有工具条）。
- 配置列：Step 1（紫色标题）→ Step 2（未上传原图时置灰、禁用）→ Step 3「进行AI修复」（原来误写成 Step 4）；「立即生成」移出白卡，放在卡片下方 10px；删除原站没有的「1 张」角标。
- 结果列：灰底 `#edeff5`，白色页签条，「生成结果」紫色下划线，「历史记录」右对齐带图标；删除原站没有的「预计产出 1 张校正结果图」；空态为图标加「暂无生成结果图」居中。
- **未收口：页面高度只有 554px（原站撑满 870px）。** 原因在 `web/src/features/tools/tool-page.tsx` 的 `WithRail`：它的外层 `div` 是 `flex-1`，但父级 `tool-workspace` 是 block 布局，所以按内容定高，工作区里的 `h-full` 撑不开。需要主代理把 `WithRail` 外层改成 `h-full`（或 `tool-workspace` 改成 flex column）。没有 `WithRail` 的手部修复已撑满，可以印证这一点。

### HAND_REPAIR 手部修复：已收口

- 去掉内层 `ToolShell`。它只按内容定高，所以页面没撑满，还多出一行「立即生成 + 限免」和提示文案。根节点改为 `h-full` 三列 grid：画布 840 | 配置 240 | 结果 300，现已撑满 924px。
- 画布顶部是 40 高白色工具条：画笔 / 大小 / 重置 / 撤销 / 重做；有图后右侧显示覆盖率和「重新上传」。
- 空态白卡：原站示例视频 + 标题 + 说明 +「上传图片」（实心）/「从作品库选择」（描边，打开本地资产库选择面板，没有素材时禁用）。
- 配置列只保留「性别与年龄」「生成张数」，去掉多出来的「上传图片」卡；「立即生成」在白卡下方。拦截原因、错误提示放在白卡底部小字。
- 结果列样式与色差修复一致；结果网格在 300 宽列里改为 2 列。
- 上传改为一个隐藏的 `input[data-testid=tool-asset-file-input]`，直接调用 `uploadToolAsset`，所以真实验收配方 `run-one.mjs HAND_REPAIR` 的选择器仍然有效。

### PRINTING_REPAIR 印花修复：已收口

- 去掉内层 `ToolShell`（原因同手部修复），页面撑满。三列：画布 840 | 配置 240 | 结果 300。
- 画布顶部是原站小贴士条：「💡 小贴士：您可以调整印花的大小并将其置于合适的位置！看看怎么操作？」，蓝色 14px，「看看怎么操作？」链接到原站同一个飞书文档。空态白卡放原站示例视频（T 恤对照）。
- Step 1 / 2 / 3 从画布区的大卡移回配置列：12px 标题，当前步紫色、未到的步灰色；Step 2 在 Step 1 完成前置灰并禁用。Step 3 用原站文案。
- 删掉右侧黄色校验提示卡。拦截原因只在上传过素材后，以橙色小字显示在配置白卡底部；空态不再列出原因。
- 上传两张图后，定位画布和缩放 / 旋转 / 撤销控件放在画布区的白卡里。只上传了 Step 1 时显示底图。
- 结果列样式与色差修复一致。原来挂在三列 grid 外的「上游返回」`ToolResult` 移进了结果列；页面里隐藏的 inline `OrigRail` 已删除。
- 适配器测试要求的 `printing-repair-stage-empty` 和文案「上传印花有误的商品图」「先完成 Step 1 与 Step 2…」保留在空态卡里的读屏文本中，视觉上不出现。

### IMAGE_CROP 图片裁剪：已收口

- 页面底色 `#f6f7fa`、内边距 10、列间距 10；右侧参数面板 250 → **270**（原站实测），白卡撑满列高。
- 顶部操作条改为 44 高白色圆角卡。
- 空态改为原站上传面板：灰底，内层 1px 描边框，内边距 50；示例图换成原站 `image-crop-upload-tour.jpg`（四角裁剪框是图片自带的），删掉本地叠加的四角框；「从作品库选择 / 从商品库选择」改为紫色描边按钮；「拖拽/粘贴」改为紫色文字。
- 参数面板：Tab 改为原站的 22 高分段胶囊（选中项用 `primary/15` 底色）；去掉原站没有的「平台预设」可见标题，保留为列表的 `aria-label`（适配器测试需要）；平台列表放在灰底圆角容器里，行高 40、12px 字；「目标尺寸」改为浅灰小标题，右侧「1024×1024」摘要只保留给读屏；旋转 / 翻转改为 46 高灰色方块，上方加分隔线。
- 差异：原站平台图标是各平台 logo，本地仍是彩色色块。原站 logo 是第三方商标图，没有复刻。

### REPLACE_GOODS 商品替换：已收口（结果列宽度除外）

- 画布区：白卡里是 `#edeff5` 内容区，顶部是「💡 温馨提示：支持上传多张商品图进行批量替换」胶囊（`primary/15`），下方是居中的 700×700 白色画布卡。空态里有原站示例视频 `guide-changegoods.mp4`、20px 标题、16px 说明和「上传参考图」。
- 「商品 1 + 参考图 / 替换商品图」工具行，以及抠图引擎 / 去噪 / 定位模式 / 蒙版控件，改为上传参考图后才显示（`hidden={!scene}`）。原站空态没有这些控件；DOM 仍然保留，测试和真实验收配方的选择器不受影响。
- 底部参数条改为单行 48 高：生成尺寸 / 参考图场景变化程度（不变 —— 滑块 —— 高）/ 生成：1–4 张 / 187 宽「立即生成」。
- 结果列：灰底，白色页签条，选中项紫色加下划线；「历史记录」右对齐带图标；空态是图标加两行原站文案。
- **未收口：结果列原站 504 宽，本地 300。** 结果列走 `ToolWorkspaceColumns` 的配置列槽位，`tools-layout-check.mjs` 要求 ≤ 360。要 1:1 需要主代理放宽该检查，或允许商品替换绕过 `ToolWorkspaceColumns`。

## 改动文件

- `web/src/components/tools/workspaces/repair.tsx`（`FixColorWorkspace`、`HandRepairWorkspace`；`handRepairInputFingerprint` 未动）
- `web/src/components/tools/workspaces/repair-guide.tsx`（新建：`RepairGuideCard` 空态白卡）
- `web/src/components/tools/workspaces/printing-repair.tsx`
- `web/src/components/tools/workspaces/crop.tsx`
- `web/src/components/tools/workspaces/crop.test.tsx`（断言随原站实测更新：示例图路径、559 面板、270 参数列、不再叠加四角框）
- `web/src/components/tools/workspaces/replace.tsx`
- `web/public/__cases/{color-diff-repair,hand-repair,printing-repair}/guide.mp4`、`web/public/__cases/product-replacement/guide.mp4`、`web/public/__cases/image-crop/upload-tour.jpg`（原站 CDN 原样下载）

未改 `edit8-frame.tsx`、`tool-page.tsx`、`globals.css`、`tool-cases-data.ts`。请求字段未改。

## 需要主代理处理

1. `web/src/features/tools/tool-page.tsx` 的 `WithRail`：外层 `div` 加 `h-full`（或让 `tool-workspace` 成为 flex column）。否则色差修复只有 554px 高。用 `WithRail` 的其他工具可能也有同样问题。
2. 商品替换结果列 504 宽：需要放宽 `tools-layout-check.mjs` 的 360 上限，或允许该页不走 `ToolWorkspaceColumns`。
3. `globals.css` 把灰底 `#edeff5` 只挂在 `[data-testid=tool-main-column]` 上，`bg-surface` 在工具页里是白色。本轮在结果列直接写了 `bg-[#edeff5]`；如果要统一，可以在 `globals.css` 里给 `[data-region=results]` 也挂上这个颜色。

## 测试

- `cd web && npx tsc --noEmit -p .`：本人文件无错误。仅剩 `handheld-goods.tsx(390)` 一处类型错误，不是本人文件。中途一度出现 `image-text-edit.tsx` 未闭合 JSX，那是别人改到一半的状态，后来已恢复。
- `cd web && bun test src/features/tools/adapters/{fix-color,hand-repair,printing-repair,image-crop,replace-goods}.test.ts src/components/tools/workspaces/{repair-stale,crop,replace,printing-repair-result-actions}.test.tsx`：**136 pass / 0 fail**。
- 截图：5 个工具都已重采本地截图并重新生成 `pair.jpg`（`/tmp/agent-lf-edit2-capture.mjs`，`SIDES=["local"]`）。
- 上传冒烟（本地 ego-browser，未提交任何任务）：手部修复上传后出现涂抹画布和「重新上传」，拦截原因正确；印花修复两步上传后出现定位画布，Step 2 状态为 done；色差修复上传后出现画笔工具条，Step 2 解禁。冒烟产生的 4 个本地草稿键已删除，任务空间已 `finish({ keep: [] })`。
