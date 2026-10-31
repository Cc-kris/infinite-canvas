# WORKER TASKS｜39 个工具页按 PRD 复刻（5 路并行）

> 主控已完成的公共部分（worker 不要动）：列布局组件、外壳文案清理、裁剪页打样。
> 分派给 worker 的是**逐页对齐**：换列布局、删禁用内容、补区域顺序、核对字段。

## 1. 确定的事实（不是推测，全部已实测）

| 项 | 事实 | 证据 |
|---|---|---|
| 工具总数 | 39 个工具 = 39 条路由，全部 `ToolShell` 包裹 | `web/src/features/tools/tool-page.tsx` `TOOL_WORKSPACES` |
| UI 文件 | 28 个 workspace 文件，共 32099 行 | `web/src/components/tools/workspaces/*.tsx` |
| 复刻基线的真实成绩 | **39 页只有 1 页合格（裁剪页，本次打样修的）** | `docs/analysis/tools-layout-baseline.json` |
| 失败主因 1 | 每页各自写 grid，列宽各页不同（`minmax(0,420px)`、`340px`、`998px`…），无统一列宽 | 基线 cfgW 分布 250–998 |
| 失败主因 2 | 25/39 页正文残留原站商业化文案「算力」「点/张」「积分」 | 基线 `failures` |
| 失败主因 3 | 正文出现「水印分组」（原站字段，PRD 未要求） | 基线 `failures` |
| PRD 布局数值 | 侧栏 184 / 内容头 56 / 配置栏 minmax(320,360)（画布类上限 420）/ 结果区 minmax(0,1fr) ≥55% / gap 16 / padding 20 | `ui_brief.md §4` |

## 2. 主控已交付的公共件

| 文件 | 作用 |
|---|---|
| `web/src/components/tools/tool-workspace-columns.tsx` | **唯一**列布局组件，输出 `data-testid=tool-workspace-columns / tool-config-column / tool-main-column`，支持 `canvas`（上限 420）与 `configSide="left"|"right"` |
| `web/src/components/tools/workspaces/crop.tsx` | 参考实现，已 PASS（cfg=420 main=866 67%） |
| `web/scripts/real-acceptance/tools-layout-check.mjs` | 唯一验收脚本，39 页逐条断言 |
| `docs/V1.0/plan_linkfox_navigation/REPLICA_SPEC_SHEET.md` | 逐页区域顺序/控件/组件/提交字段 |
| `docs/analysis/tools-layout-baseline.json` | 每页基线实测数字与失败项 |

外壳层已改：侧栏「免责声明」页脚删除、rail 算力徽标（250）删除。

## 3. 分工（按文件切分，零重叠）

| 组 | 文件数 | 工具页 | 任务书 |
|---|---|---|---|
| W1 | 5 | 8（video / replace / printing-repair / dressing / video-translation） | [W1.md](worker-briefs/W1.md) |
| W2 | 6 | 7（suite / color-v2 / dress-suite / extract / image-text-edit / ai-text-static） | [W2.md](worker-briefs/W2.md) |
| W3 | 5 | 6（pod / model / scene-fission / translate / designer） | [W3.md](worker-briefs/W3.md) |
| W4 | 6 | 9（mask / outpaint / scene / color / handheld-goods / text） | [W4.md](worker-briefs/W4.md) |
| W5 | 5 | 8（dress / dressing-xsy / enhance / image-to-video / repair） | [W5.md](worker-briefs/W5.md) |

## 4. 每页统一改法（三件事）

1. **换列布局**：页面根部自写 grid → `ToolWorkspaceColumns`（`config` 放配置栏，children 放结果/画布）。不写 `order-*`，不拼动态类名。
2. **删禁用内容**：`<WatermarkGroupPanel />` 连 import 删掉；「算力/点·张/积分/会员/免责声明/促销/折/余额」连同包裹 DOM 一起删，不许改写成同义词。
3. **对齐区域顺序**：按各自任务书里每页的「区域顺序」逐条核对补齐；禁止退化成「上传 + 提示词 + 生成按钮」。

## 5. 验收口径（唯一标准）

```bash
cd web && export PATH=/opt/homebrew/bin:$PATH
npx tsc --noEmit -p tsconfig.json
node scripts/real-acceptance/tools-layout-check.mjs --only=<本组 ID 列表> --json=/tmp/wN.json
```

- 配置栏 320–360（canvas 320–420）
- 结果区 ≥55%
- 无禁用文案
- 无水平溢出
- 全组 PASS 才算完成；做不到必须写清阻塞原因。

## 6. 禁止

- 改外壳文件（`tool-workspace-columns.tsx` / `tool-sidebar.tsx` / `orig-rail.tsx` / `tool-page.tsx` / `tool-shell.tsx`）
- 改别的组的文件
- 改路由、加依赖、改提交字段名
- 不跑脚本就说完成
