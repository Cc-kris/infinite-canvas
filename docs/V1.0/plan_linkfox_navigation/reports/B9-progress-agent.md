# B9 视觉对齐报告：CHANGE_COLOR / FIX_COLOR(COLOR_DIFF)

分支：`feat/linkfox-v1-real`
证据：`evidence/b9-visual-parity-20261029/real/{CHANGE_COLOR,FIX_COLOR}/form.json`（原站 1908×781，CDP getBoundingClientRect）

## CHANGE_COLOR（提交 f60e774）
`web/src/components/tools/workspaces/color.tsx` 重写为 edit8 三列骨架：

| 元素 | 原站 | 本地实测 |
| --- | --- | --- |
| 配置列 | 307px（x1258） | 307px ✓ |
| 结果列 | 332px | 332px ✓ |
| 列间距 | 10px | 10px ✓ |
| 立即生成 | 287×32 | 287×32 ✓ |

配置列内容顺序对齐原站：收藏色卡 → 选择颜色 → 颜色参考图上传卡 → 去除杂色开关 → 细调四项（48×22 数值框） → 光影优化 → 边缘优化 → 立即生成（10 算力）。
结果列：`生成结果 / 优秀案例 / 历史记录` 标签，空态「暂无生成结果图」；优秀案例空态明示「本地未接入社区数据」，不伪造案例。
删除了原站不存在的「区域预设」与旧合并分区，保留真实涂选蒙版与生成链路。
测试：`color.test.tsx` 4/4；`tsc --noEmit` 干净。

## FIX_COLOR（提交 58095cc，上游链路 COLOR_DIFF_REPAIR）
`web/src/components/tools/workspaces/repair.tsx` 的 `FixColorWorkspace` 由 grid 两列改为 edit8 三列：

| 元素 | 原站 | 本地实测 |
| --- | --- | --- |
| 画布列 | flex-1（1131） | 1108（全局侧栏 200 vs 180 的 20px 差） |
| 配置列 | 240（内容 221） | 240 ✓ |
| 结果列 | 300 | 300 ✓ |

- 画布列：画笔/橡皮/笔刷/羽化/预设/撤销/重做/清空工具条 + 涂抹蒙版画布 + 覆盖率（`尚未涂抹 · 覆盖率 0%`）+ 空态「色差修复 / 上传偏色服装图片 / AI将以服装原图为依据修复偏色」。
- 配置列：Step 1 上传待修复图 → Step 2 区域色/目标色/交换/色块与修复版本（参考匹配、色偏中和、局部补色）→ Step 3 涂抹提示 + 立即生成（未上传禁用）。
- 结果列：`生成结果 / 历史记录` 标签，空态「暂无生成结果图 / 上传偏色图并涂抹区域后，点立即生成。」
- 保留真实提交链路（`buildFixColorSnapshot` → `runFixColor`）与上游失败 BLOCKED 语义，未伪造成功结果。

### 已知偏差（未伪造）
1. 原站 Step 2 是「上传颜色矫正参考图」独立上传位；本地 `fix-color` adapter 的 `references` 固定为「源图 + 区域蒙版」两张（`references-missing` 校验），不存在第三张参考图字段，因此 Step 2 落为区域色/目标色控件，不新增无法接线的假上传卡。
2. 画布宽 1108 vs 1131，源于本地全局侧栏 200px（原站 180px），非本页样式问题。

### 验证
- `~/.bun/bin/bun test src/features/tools/adapters/fix-color.test.ts src/components/tools/workspaces/mask.test.tsx` → 29/29
- 全量 `bun test`：1332 pass / 6 fail，均为分支既有失败（sidebar `/tools/smart-edit` 路由契约、场景裂变文案断言）
- `tsc --noEmit -p tsconfig.json`：0 错误
- 浏览器 DOM 实测（`/tools/smart-edit/fix-color`）：`data-layout="linkfox-edit8"`、mask-panel/color-panel 存在、列宽 1108/240/300、立即生成禁用（未上传）
