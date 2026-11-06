# agent-lf-color-design：商品图设计 / 模特族配色收口

范围：PRODUCT_SCENE、HANDHELD_GOODS、AI_DRESSING_V2、AI_POSTURE、AI_WEARABLE、PRINT_EXTRACT、SDS_DESIGN、SCENE_TRANSFER。布局、尺寸、文案、testid、请求字段均未改动。

## 背景

机械替换后这些文件里已经没有 `723cf9 / 3a7df9 / 8d34f9 / 722ed1`，但还有大量用 `primary` 表达选中态的写法（`border-primary bg-primary/10 text-primary`）。全局 token 调整后 `primary` 变成深石色，深色主题下是近白色，所以这些选中态只显示黑白，没有橙色；页签也会出现白字、白下划线，还有个别 `bg-primary` 配 `text-white`，深色下白底白字。本轮把这些写法按 COLOR-GUIDE 拆成三类：参数选中、导航选中、主按钮。

## 改动文件（全部是精确字符串替换）

- `web/src/components/tools/design19-frame.tsx`：`Design19Chip` 选中态改为 `border-selected bg-selected-soft text-selected`（手持商品的张数、手部页签共用这个组件）。
- `web/src/components/tools/material-source-panel.tsx`：页签选中改为 `text-foreground`，下划线改 `bg-foreground`；拖拽态和 hover 改 `border-selected`；`text-red-500` 改 `text-destructive`。
- `web/src/components/tools/image-rules-popover.tsx`：已全部使用 token，无需修改。
- `workspaces/design-demo.tsx`：`DESIGN_OUTLINE_BUTTON` 从紫边紫字改为次按钮（`border-border bg-background text-foreground hover:bg-accent`）；上传卡图标改 `text-muted-foreground`；`DesignRowCard` 加 `hover:border-selected`。
- `workspaces/scene-fission.tsx`：模型、尺寸、张数选中改橙色；模型选中对勾遮罩从 `bg-primary/50` 改 `bg-black/40`（深色下原来是白底白勾）；主按钮 `text-white` 改 `text-primary-foreground`；结果页签改 `foreground` 下划线；`#c47a1a`、`#f0d9b0/#fdf6e8/#8a5d10` 提示条改 amber；`red-600` 改 `destructive`；滑块改 `accent-[var(--selected)]`。
- `workspaces/handheld-goods.tsx`：姿势缩略图选中改 `border-selected`；`#d46b08` 改 amber；三个「点击这里…」链接改 `text-muted-foreground hover:text-foreground`；顶部 notice 统一为 amber token。
- `workspaces/dressing.tsx`：上下装、连体页签改 `foreground` 下划线；姿势、张数选中改橙色；补上 amber 的深色变体。蒙版笔触 `rgba(56,189,248,0.45)` 保留未改。
- `workspaces/model.tsx`：`AiPostureWorkspace` 中，SegmentedButton、姿势卡、对勾、「已填写」改为橙色选中；姿势库/自定义页签改 `foreground` 下划线；「图片规则」改为链接色。同文件中未接入路由的 `AiPoseGeneratorWorkspace`（实际路由用 `ai-pose-generator.tsx`）也做了同样的替换。
- `workspaces/dress.tsx`：步骤条当前步改为灰色 `bg-accent`（导航语义）；品类、部位 chip、张数、品类网格、picker 触发器改橙色；「从作品库/商品库选择」改次按钮；Tips 里的强调词改 `text-foreground`；四处 amber 提示统一；`red-600` 改 `destructive`。
- `workspaces/extract.tsx`：拖拽态、格式按钮、结果卡选中、批量按钮激活态改橙色；「从作品库选择」改次按钮；透明图开关开启为 `bg-selected text-white`，关闭为 `bg-muted-foreground text-background`（原来是 `bg-black/25 text-white`，浅色下看不清）；结果、历史页签和计数角标改 `foreground`；「下载」改链接色；running 状态 chip 改 `bg-foreground/[0.06]`。
- `workspaces/pod.tsx`：`TilingGlyph`、`TilingPresetSelect`、素材行、贴合区虚线框、素材选中 ring、颜色按钮从 `var(--primary)` 改 `selected`；结果页签改 `foreground`；`#FFE0B2/#FFF8E1/#8A6D3B` 和 `amber-50` 提示改 amber token；「只补生成缺失」改次按钮；`red-*` 改 `destructive`；去掉多余的 `dark:hover:bg-white/10`。
- `workspaces/scene.tsx`（只改了 `SceneTransferWorkspace`）：结果页签下划线从 `border-selected` 改 `border-foreground`；丢图、过期提示从 `bg-accent` 改 amber。

测试断言不需要改。

## 每页浅/深结论

截图在 `docs/V1.0/e2e-1to1/20261106/color/`，均为 1600×1000。每张截图前都确认了 `<html class="dark">` 与目标主题一致。另外打开过以下行卡弹层：`HANDHELD_GOODS-pose-*`、`AI_POSTURE-pose-*`、`AI_WEARABLE-category-*`、`AI_WEARABLE-model-*`。

| 工具 | 浅色 | 深色 |
|---|---|---|
| PRODUCT_SCENE | 通过：主按钮深底白字，选中为橙色 | 通过：无白块、无紫色 |
| HANDHELD_GOODS（含姿势弹层） | 通过 | 通过 |
| AI_DRESSING_V2 | 通过（绿色方块是草稿里残留的用户图片） | 通过 |
| AI_POSTURE（含姿势库） | 通过 | 通过 |
| AI_WEARABLE（含品类、模特弹层） | 通过 | 通过 |
| PRINT_EXTRACT | 修复开关后通过 | 通过（结果区白块是原站引导视频的底色，按规范不改） |
| SDS_DESIGN | 通过 | 通过 |
| SCENE_TRANSFER | 通过 | 通过 |

结束时主题已切回 light，并执行了 `task.finish({ keep: [] })`。

## 仍有问题的地方（需主代理或其他子任务处理）

- 共享组件 `tool-case-guide.tsx`：深色下案例卡顶部的标签（「上传商品场景参考图」「生成结果」等）是浅灰底配白字，对比度低。这几页都能看到。
- `dress.tsx` 的蒙版椭圆预览仍是 `border-primary bg-primary/20`，深色下显示为白色圈。它属于蒙版示意，按规范没有改；如果希望改成橙色，需要另行确认。
- 首次批量截图时，有几张深色截图被重置回浅色。原因应该是其他子任务在同一浏览器 profile 里写同一个主题 localStorage key。改为每页先写主题、再校验 `dark` 类后重截，问题消失。其他子任务做截图时也可能遇到。

## 测试

- `cd web && npx tsc --noEmit -p .`：无错误。
- `bun test` 运行 adapters 下的 ai-dressing-v2、ai-posture、ai-wearable、handheld-goods、print-extract、product-scene、scene-transfer、sds-design，以及 workspaces 下的 pod、dressing-layout：214 个通过，0 个失败。
- 自查：负责的文件里 `723cf9|3a7df9|8d34f9|722ed1` 的命中数为 0。剩余的 `text-white` 和 `bg-black/*` 只出现在图片遮罩、弹窗遮罩和橙色开关上。
