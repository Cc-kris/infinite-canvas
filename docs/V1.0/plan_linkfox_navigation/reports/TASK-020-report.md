# TASK-020 PRINTING_REPAIR 印花修复 · 实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`010d473` feat(tools): PRINTING_REPAIR 印花修复工作台（三步上传+画布定位+强度/版本+三种对比+13字段防丢参+真实分割+快照锁定）
- 变更规模：4 文件 / +2502 行（纯新增，未改动他人文件）
- 结论：**工作台 + 适配器 + 测试全量落地并通过验证；与路由的挂载接线尚未做（属共享文件，见「未完成/风险」）**

## 1. 交付物

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/components/tools/workspaces/printing-repair.tsx` | 877 | 三步 UI、可拖拽/缩放/旋转画布、撤销重做、强度与版本、三种对比、结果区 |
| `web/src/features/tools/registry/printing-repair.ts` | 687 | 工具定义（步骤/常量/变换模型/几何/校验/快照/草稿/对比区域/下载名） |
| `web/src/features/tools/adapters/printing-repair.ts` | 457 | 浏览器侧适配：印花分割（真实像素分析）、字段组装、提交守卫、任务映射与结果视图 |
| `web/src/features/tools/adapters/printing-repair.test.ts` | 481 | 28 个用例，覆盖规格/几何/校验/快照/草稿/分割/守卫/渲染 |

## 2. 需求落地（规格 §3：三步）

1. **Step 1 消除错误印花**：上传「印花有误的商品图」，作为修复底图（形状/褶皱/光影保留）。
2. **Step 2 导入正确印花**：上传印花参考，浏览器内做像素级前景分析（`background-diff` 白底抠图 / 若存在 alpha 通道则用 alpha），产出分割图与覆盖率，纯色图没有前景时直接报错，不提交空蒙版。
3. **Step 3 调整印花位置**：画布内拖拽 + 缩放（0.05–4，含 25/50/75/100% 预设）+ 旋转（-180–180，含 ±15/±90 预设）+ 键盘微调（方向键 4px / Shift 20px，`[` `]` 旋转，`+` `-` 缩放），仅 Step 2 的印花图层可变换。

重传语义按规格实现：**重传 Step 1 清空全部**（含印花、分割、变换、历史）；**重传 Step 2 保留底图，但重置变换**。

## 3. 关键实现点

- **变换模型可逆、可逐字节还原**：`point`(0–1 归一化)、`scale`(3 位小数)、`rotate`(归一到 (-180,180])，撤销/重做走 `present/past/future` 三栈，上限 50 步，仅印花图层入栈。
- **几何自洽**：`printFitScale` 保证 scale=1 时印花等比完整放入底图；`point` 被钳在 0–1（拖到画外自动贴边，不会整块飘走）；`printCoverage` 给出交叠比例，用于「覆盖率过低」提示与提交拦截。
- **13 字段零丢参**：`PRINTING_REPAIR_FIELD_BINDINGS` 声明每个字段的来源（12 个 input + 1 个输出回填），`missingPrintingRepairFieldBindings` 与 registry 实际字段双向比对，测试断言 `unbound=[] extra=[]`，杜绝「字段在规格里、请求里没有」。
- **提交前守卫**：三张图缺一不可、尺寸/强度/变换自洽，缺什么报哪个字段，不发一次缺参请求。
- **快照锁定**：提交瞬间冻结参数（含 `snapshotHash`），后续继续调参不会污染已出图结果；`isPrintingRepairSnapshotStale` 用指纹判定「结果来自旧版本」。
- **强度/版本**：强度 0–100（step 5，默认 70）、版本 v1 标准（结构优先）/ v2 精细（纹理优先）。
- **三种对比**：局部对比（按缩放倍率把印花中心放大，裁剪区不越界）、并排对比、滑块对比（百分数域）。
- **刷新恢复**：草稿存 localStorage（`tool-draft:v1:PRINTING_REPAIR`），脏值回落默认，不因半截脏数据炸页面。

## 4. 验证证据（可复核）

命令在 `web/` 下执行，`PATH=$HOME/.bun/bin:/usr/local/bin:$PATH`：

| 项 | 命令 | 结果 | 证据文件 |
| --- | --- | --- | --- |
| 单测 | `bun test src/features/tools/adapters/printing-repair.test.ts` | **28 pass / 0 fail / 153 expect()** | `evidence/TASK-020/test-output.txt` |
| 类型 | `bunx tsc --noEmit` | 我的 4 文件 **0 error**；仓库其余 11 行报错全在 `adapters/hand-repair.test.ts`（他人进行中文件，与本次无关） | `evidence/TASK-020/tsc-output.txt` |
| 渲染 | `renderToStaticMarkup(<PrintingRepairWorkspace/>)` | 空状态 HTML 12668 字节，三步分区/强度/版本/三种对比均在 | `evidence/TASK-020/render-empty.html` |

### 测试覆盖点（28 例）

1. **规格**：registry 中存在、slug/layout/draftKey 正确；13 字段与页面落点双向对齐（无丢参）。
2. **几何**：fit/层尺寸/矩形/覆盖率；拖到画外被钳在边界（贴边后仍保留 1/4 交叠，故 placement 校验不会被误触发）；移动/键盘微调步长；缩放与旋转钳位。
3. **历史**：撤销/重做/重置状态往返一致，栈上限生效。
4. **校验**：三步素材缺失逐项给字段名；上传格式/体积/长边逐项给原因。
5. **快照**：输出尺寸缺省等于底图；指纹只随影响产出的输入变化（换分割图即变），强度不同即判为「旧版本」。
6. **载荷**：`composePrintingRepairFields` 带齐底图/印花/分割图与定位结构；指令文字写明参考图分工、中心点百分比、缩放、旋转、强度。
7. **对比/草稿**：局部对比裁剪区不越界；滑块百分数域；草稿往返恢复定位/强度/模式/输出尺寸，脏值回落默认。
8. **分割（真实像素）**：白底黑印花 → 前景被正确切出、覆盖率与蒙版长度对得上；纯色图 → 报错不降级；像素长度不符 → 抛错；分析边长上限 1024 等比缩小不裁剪。
9. **守卫与任务**：只有一张参考图就拒发；成功但无图＝失败、取消就是取消（不冒充成功）；结果视图的 running/stale 不覆盖真实状态。
10. **渲染**：三步分区齐全；空状态只有强度/版本/对比，定位控件（缩放/旋转/撤销/重做/重置/画布）等素材到位才出现；无素材时提交按钮阻塞、无结果图。

## 5. 测试过程中修掉的两个真实缺陷

1. **`printingRepairResultView` 丢掉 stale 标记**：无 `run` 时返回 `stale: false`，导致「参数已改、结果过期」的提示在首次出图前失效。已改为透传 `stale`。
2. **`compareRegion` 浮点外溢**：`size` 未做定点收敛，`region.y + region.height` 会得到 `1.0000333…`（>1 的裁剪框）。已把 `size` 收敛到 4 位小数，边界严格 ≤ 1。

## 6. 未完成 / 风险

1. **路由挂载缺口（需共享文件协作）**：本工作台是独立组件 + 自带 `ToolShell`，`src/pages`、`src/routes` 中**没有**任何 workspace 挂载点（`RemovePenWorkspace` 同样未挂）。因此工具虽在 registry 中 `enabled: true`，但通过 `/tools/smart-edit/printing-repair` 访问仍不会渲染本组件。接线需要改路由/页面（共享文件），建议由 TASK 负责人统一做一次「workspace 注册表 → 路由」的接线，避免多任务互相踩。
2. **后端字段契约**：请求侧按 13 字段（`url / stampingFlowerUrl / stampingFlowerSegUrl / width / height / point{...} / scale / rotate / version / strength / config / targetConfig`）发，若服务端字段名或结构不一致，需要一次联调对齐。
3. **分割在浏览器内完成**：依赖 canvas 解码印花图（跨域图需 CORS），大图按 1024 长边降采样分析，非服务端分割。
4. **真实模型出图未验证**：本次未接真实后端跑端到端，出图质量/耗时需联调验证。
5. **测试文件放置**：按模板惯例与本次允许范围，测试放在 `adapters/` 下（同时覆盖 registry 与渲染）。

## 7. 使用入口

- 代码入口：`PrintingRepairWorkspace`（`web/src/components/tools/workspaces/printing-repair.tsx`），工具 ID `PRINTING_REPAIR`，路由常量 `PRINTING_REPAIR_ROUTE = /tools/smart-edit/printing-repair`。
- 验证入口：`cd web && bun test src/features/tools/adapters/printing-repair.test.ts`
- 证据：`docs/V1.0/plan_linkfox_navigation/evidence/TASK-020/{test-output.txt, tsc-output.txt, render-empty.html}`
