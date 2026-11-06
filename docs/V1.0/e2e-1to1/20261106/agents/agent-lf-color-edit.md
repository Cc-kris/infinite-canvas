# agent-lf-color-edit：智能修图族配色收口（无限画布风格）

范围：SCALE_UP、AI_OUTPAINTING、AREA_REPAIR、REMOVE_PEN、CHANGE_COLOR、IMAGE_CROP、PRODUCT_REFINE、FIX_COLOR、PRINTING_REPAIR、HAND_REPAIR、REPLACE_GOODS。布局、尺寸、文案、testid、请求字段都没改。

## 改动文件

全部用精确字符串替换，每条替换都校验了命中次数。

- `web/src/components/tools/edit8-frame.tsx`（共用框架，影响全部 11 页）
  - `Edit8Chip` 选中态：`border-primary/40 bg-primary/10` 改为 `border-selected bg-selected-soft`
  - `edit8OutlineButtonClass`（从作品库选择 / 批量入口等）：紫边紫字改为 `border-border text-foreground hover:bg-accent`
  - `edit8GradientButtonClass`：去掉紫色阴影 `rgba(122,5,255,…)`，改为 `shadow-sm`
  - `Edit8ResultTabs`：选中页签从 `text-primary` + 主色下划线改为 `text-foreground` + `bg-foreground` 下划线，未选中用 `text-muted-foreground`；「历史记录」改为 `text-muted-foreground hover:text-foreground`
  - `Edit8Dropzone`：`bg-black/[0.02]` 改为 `bg-foreground/[0.02]`，hover 和拖拽态改 `border-selected`，图标和「点击上传」不再用主色
  - `Edit8Switch` 关闭态轨道：`bg-black/25` 改为 `bg-foreground/25`；上传卡拖拽描边改 `ring-selected`
  - 注释里残留的 `#3a7df9 / #723cf9` 描述已删除
- `workspaces/enhance.tsx`（高清放大 + 商品精修）
  - 模式按钮、精修模式选中态改 `border-selected bg-selected-soft`
  - 工具条禁用态 `#d9d9d9 / bg-black/[0.04] / text-black/25` 改 token
  - 两栏顶部标签 `bg-black/30 text-white`（叠在画布底上，不在图片上）改为 `bg-foreground/10 text-foreground/70`
  - 主列 `shadow-[0_0_4px_#ccc]`（深色下发白）改为 `ring-1 ring-border`；分隔线 `#ececec / #e1e1e8` 改 `bg-border / border-border`
  - stone 系输入框和对比滑块边框改 token，去掉 `dark:` 分支
  - 「精修后」角标原为 `bg-primary text-white`，深色下变成白底白字，改为 `bg-black/60`（叠在图片上）；轮播点 `#d1d1ff` 改为 `bg-white / bg-white/50`
  - `#d46b08 / #fff7e6 / #ad6800` 提示改为 amber
- `workspaces/outpaint.tsx`：比例、尺寸预设、张数下拉选中态从实心主色改 `border-selected bg-selected-soft`；工具按钮 hover 改 `bg-accent`；`#d97706` 改 amber；结果卡阴影改 `shadow-sm`
- `workspaces/mask.tsx`（局部重绘 + 局部消除）
  - 生成张数选中态改为橙色；未选中描边 `#ccc` 改 `border-border`
  - 「反选」激活态和对比模式切换属于工具状态，按规范用灰色 `bg-accent`（不用橙色）
  - `disabled:text-black/25`（11 处）改 `disabled:text-foreground/30`
  - 结果动作按钮 hover 改 `bg-accent`；「历史记录」改弱字
  - `#fff7e6 / #ad6800 / #b26b00 / #d46b08` 改 amber，`#fdecea` 改 `bg-destructive/10`
  - 分隔线 `bg-black/[0.06]` 改 `bg-border`；示例缩略图 hover 改 `ring-selected`
- `workspaces/color.tsx`（一键换色）
  - 折叠分区 `bg-[#f9f9f9]`（深色下是白块）改 `bg-muted`；箭头 `#444` 改 `text-foreground/70`
  - 带文字的开关原为 `text-white!` + `bg-black/25`，深色下开启态白底白字；现在开启用 `bg-primary text-primary-foreground`，关闭用 `bg-foreground/25 text-background`
  - 色板和预设色点选中态改 `border-selected`
  - 「涂抹中…」是叠在图片上的遮罩：机械替换误改成了 `text-primary-foreground`，已改回 `text-white`
  - 胶囊重置按钮、幽灵按钮 hover 改 `bg-accent`；案例提示 `bg-primary/5 text-primary` 改中性弱底
- `workspaces/crop.tsx`（图片裁剪）
  - 平台和比例列表选中项、锁定比例按钮改为橙色选中态；列表底 `bg-black/[0.04]` 改 `bg-foreground/[0.04]`
  - 「尺寸调整 / 比例调整」分段页签选中项改 `bg-background text-foreground shadow-sm`（灰色导航态）
  - 次按钮紫边改 `border-border`；免费角标 `#ff4d4f` 改 `bg-destructive`
  - 「自由裁剪」图标 `#7c3aed` 改 `var(--muted-foreground)`；amber 提示补 `dark:`
  - **顺手修复的布局缺陷**：裁剪框的 `shadow-[0_0_0_9999px_…]` 没有被任何父级裁掉，上传图片后整页都会盖上一层灰。现在给棋盘格容器加了 `overflow-hidden`，手柄在 `p-3` 内边距范围内，不会被裁掉
- `workspaces/repair.tsx`（色差修复 + 手部修复）
  - 结果页签下划线改 `border-foreground`；「历史记录」改弱字
  - 人物类型、生成张数选中态改橙色
  - 画笔 / 橡皮切换改 `text-foreground shadow-sm`；对比模式改灰色 `bg-accent`
  - 「从作品库选择」紫边改中性次按钮；`#d97706` 改 amber；`red-*` 改 `text-destructive`
- `workspaces/replace.tsx`（商品替换）
  - 结果页签和历史记录同上；温馨提示胶囊 `bg-primary/15` 改 `bg-foreground/[0.06]`
  - 定位模式和生成张数是参数，用橙色；SKU 页签和蒙版工具用灰色 `bg-accent`；场景变化程度选中项用 `text-selected`
  - `border-black/15` 改 `border-border`
- `workspaces/printing-repair.tsx`（印花修复）：步骤标题、下载链接、结果页签改 foreground 系；`#d46b08` 和 `bg-amber-100 text-amber-900` 改 amber；印花图层的虚线选框原为 `border-primary/70`，深色下会变白、在白底棋盘格上看不见，改为 `border-selected/70`（橙色）
- `crop-original-dialog.tsx`：比例选中态改橙色，`text-red-500` 改 `text-destructive`
- `product-image-edit-dialog.tsx`：画笔 / 橡皮激活态从 `border-primary text-primary` 改为灰色 `bg-accent`
- `workspaces/repair-guide.tsx`：没有硬编码颜色，无需修改

自查结果：上述文件里已经没有 `723cf9 / 3a7df9 / 8d34f9 / 722ed1`，也没有 `#d46b08 / #fff7e6 / #ad6800 / #d97706 / #7c3aed`、stone / slate、`bg-black/[0.0x]`、`text-black` 或 `border-black`。

## 保留未改（功能语义或素材）

- canvas 绘制色：局部重绘 / 手部修复 / 商品精修的红色蒙版 `rgba(239,68,68,.45)` 和 `rgba(255,60,60,.45)`；一键换色的蓝色选区 `rgba(37,99,235,.35)`；局部消除的白色蒙版；商品替换 SVG 里的蓝色笔触、红色四角定位框和红点。这些都不是紫色，所以没有换成橙色。
- 棋盘格、扩图保留区 `emerald` 框、扩图边缘手柄（`bg-primary/50`）、裁剪框白边和灰色遮罩、裁剪手柄。
- 叠在图片上的遮罩和角标：`bg-black/60~80 text-white`（「原图 / 高清放大后」「精修前」等）。
- 平台品牌色块（亚马逊、沃尔玛等）和 `PRESET_DOTS` 预设色。
- 原站引导视频和海报图本身是白底（智能扩图、局部重绘、色差修复、印花修复、手部修复、商品替换的空态卡上方）。深色下它们是一块白色画面，但属于原站素材，按规范不改。
- `accent-primary` 原生滑杆：深色下显示为浅色滑块，和主按钮一致，没有改。

## 每页浅色 / 深色结论

截图在 `docs/V1.0/e2e-1to1/20261106/color/`：`<TOOL>-{light,dark}.png` 是空态，`<TOOL>-uploaded-{light,dark}.png` 是上传 `product-watch.jpg` 后的状态，都没有点生成。

| 工具 | 浅色 | 深色 |
|---|---|---|
| SCALE_UP | 通过；模式选中是橙色，工具条无紫色 | 通过；原来主列发白的外描边已消失，工具条融入深色背景 |
| AI_OUTPAINTING | 通过；比例选中是橙色 | 通过；参数条和画布都是深色（空态卡里的视频是白底素材） |
| AREA_REPAIR | 通过；张数选中是橙色 | 通过 |
| REMOVE_PEN | 通过 | 通过；工具条上禁用的动作按钮清楚可辨 |
| CHANGE_COLOR | 通过 | 通过；原来配置分区的白块已经变深，开关文字可读 |
| IMAGE_CROP | 通过；修复后裁剪遮罩不再盖住整页 | 通过；平台选中项是橙色弱底 |
| PRODUCT_REFINE | 通过；精修模式选中是橙色 | 通过；「精修后」角标可见 |
| FIX_COLOR | 通过 | 通过 |
| PRINTING_REPAIR | 通过；amber 提示 | 通过 |
| HAND_REPAIR | 通过；人物类型和张数选中是橙色 | 通过 |
| REPLACE_GOODS | 通过；定位模式选中是橙色，「不变」是橙字 | 通过；这个页面刷新后不保留场景图，深色上传态是在深色下重新上传后截的 |

## 共享组件和其他文件的问题（未改，交给主代理）

- `ToolAssetInput`（`tool-asset-input.tsx`，linkfox 变体，色差修复和印花修复的配置列在用）：禁用态的「从本地上传」在两种主题下都是一条灰块，和启用态的主按钮对比偏弱。没有看到配色错误，只做记录。
- 截图时发现主题会被同一浏览器 profile 里其他任务改回去（`localStorage` 共享）。我的脚本已经改成每页截图前校验 `html.dark`。其他子任务如果截出来的「深色」图其实是浅色，也是这个原因。

## 清理

- 上传测试一共新增了 14 条 `tool_assets` 和 14 条 `media_files`（分 3 次，每次结束都清理了），已全部删除，库存回到 57 / 57。
- 我负责的 11 个工具草稿（`app_state` 里的 `tool-draft:v1:*`）上传前做了备份，上传后已原样写回。`asset_store` 长度前后一致。
- 主题已切回 light，已执行 `task.finish({ keep: [] })`，没有关闭其他标签页。

## 测试

- `cd web && npx tsc --noEmit -p .`：0 错误
- `cd web && bun test src/components/tools/workspaces/{color,crop,enhance,mask,outpaint,printing-repair-result-actions,repair-stale,replace}.test.tsx`：48 pass / 0 fail，没有需要更新的类名断言
- 按 brief 规则没有改 CHANGELOG 和 `docs/content/docs/progress/*`。本次是纯配色收口，没有新增或完成 todo 项。
