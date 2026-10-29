# B11 共享工具页框架 1:1 视觉对照报告（real vs local-after）

- 日期：2026-10-29
- 分支：`feat/linkfox-v1-real`
- 视口：1908×781（DPR 1），主题：light
- 原站：`https://www.linkfox.com/draw/ai-outpainting`（`/draw/change-color-v2`）
- 本地：`http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting`（`.../change-color-v2`）
- 采集工具：`docs/V1.0/plan_linkfox_navigation/tools/probe_frame.py`（骨架+computed CSS+截图）、`probe_eval.py`（定点度量）
- 证据目录：
  - `real/AI_OUTPAINTING|CHANGE_COLOR_V2/{frame.json,shot.jpg,text.txt}`
  - `local-baseline/...`（改动前）
  - `local-after/...`（改动后，本次）
  - `deep/{real,local}-AI_OUTPAINTING.json`（全量节点快照）

范围：**共享框架**（顶部导航 / 左侧工具栏 / 内容画布 / 外壳容器）。
不含具体工具工作区（outpaint、color-v2 的卡片内部与参数面板由另一组负责）。

## 1. 框架度量对照

| 部位 | 原站实测 | 改动前（local-baseline） | 改动后（local-after） | 结论 |
|---|---|---|---|---|
| 顶部导航高度 | 60px（另有 50px 促销条） | 56px（h-14） | **60px** | ✅ 一致（促销条见 §3） |
| 顶部导航底色/分隔 | `#FFFFFF` + 1px `#E6E6E7` | 半透明 `bg-background/90` + backdrop-blur | **`rgb(255,255,255)` + 1px `rgb(230,230,231)`，无模糊** | ✅ |
| 导航左右内边距 | 左 24px / 右 35px，内容满宽 | 居中容器 `max-w-7xl px-6` | **`pl-6 pr-[35px]`，满宽** | ✅ |
| 左侧工具栏宽 | 180px | 180px | **180px** | ✅ 保持 |
| 工具栏底色/右边线 | `#FFFFFF` / 1px `#E6E6E7` | `bg-card` / `border-border`（深色主题下为灰黑） | **`bg-surface` / `border-hairline` = `rgb(255,255,255)` / `rgb(230,230,231)`** | ✅ |
| 工具项行高 / 字号 | 40px / 16px | 36px / 14px | **40px / 16px** | ✅ |
| 工具项内边距 | `0 12px 0 18px` + 16px 图标 | `0 8px` 左右、左侧 3px 竖条 | **`0 12px 0 18px` + 16px 图标，无竖条** | ✅ |
| 工具项文字色 | 未选中 `rgba(0,0,0,.6)`；选中 `rgb(114,60,249)` | 选中 `bg-accent` 底色 + primary 竖条 | **未选中 `rgba(0,0,0,0.6)`；选中 `rgb(114,60,249)`，无底色** | ✅ |
| 工具项分组 | 全量平铺，组间 1px `#E6E6E7`，**无分类标题** | 仅当前分类展开 + 分类标题（12px 大写） | **全量平铺 + 1px 组间分隔线，无标题** | ✅ |
| 内容画布底色 | `#F4F6F8` | `bg-background`（深色 `oklch(0.145 0 0)`） | **`rgb(244,246,248)`** | ✅ |
| 内容区宽度/内边距 | x=180 / w=1728 / padding `0 10px` + 上下 10px | 无内边距，卡片贴边 | **x=180 w=1728，`padding:10px`，内容起点 x=190** | ✅ |
| 工作区可用宽 | 1708 | 1728（贴边） | **1708** | ✅ |
| body 主题 | light，`color-scheme: normal` | **dark**（默认 `theme:"dark"`） | **light**（`theme:"light"`） | ✅ |

## 2. 代码改动

| 文件 | 改动 |
|---|---|
| `web/src/styles/globals.css` | 新增框架色板 token：`--canvas:#f4f6f8`、`--hairline:#e6e6e7`、`--brand:#723cf9`、`--brand-soft`、`--surface:#fff`，并在 `@theme inline` 暴露 `bg-canvas / border-hairline / text-brand / bg-surface`；`.dark` 同步对应值 |
| `web/src/stores/use-theme-store.ts` | 默认主题 `dark` → `light`（对齐原站） |
| `web/src/components/layout/app-top-nav.tsx` | `h-14` → `h-[60px]`；去掉 `bg-background/90 backdrop-blur-xl` 与居中 `max-w-7xl`，改 `bg-surface` + `border-hairline` + `pl-6 pr-[35px]` |
| `web/src/components/tools/tool-shell.tsx` | 外壳 `bg-canvas`；侧栏 `bg-surface border-hairline`；immersive 主区 `bg-canvas p-2.5`（=原站 10px 内边距）；移动抽屉同步色板 |
| `web/src/components/tools/tool-sidebar.tsx` | 按原站重写：全量分类平铺 + 组间 1px 分隔线 + 隐藏分类标题（保留 `sr-only` 无障碍）；行高 40 / 字号 16 / 内边距 `0 12px 0 18px` / 16px lucide 图标；选中态 `color: var(--brand)`，未选中 `rgba(0,0,0,.6)`；保留 `data-tool-id / data-active / aria-current` 与"补充"角标 |
| `web/src/components/tools/tool-shell.test.tsx` | 断言同步到新框架：`border-hairline bg-surface` 侧栏、`color:var(--brand)` 选中态、全量平铺（非当前分类工具链接也存在）、无 `bg-accent` |

## 3. 未完成 / PARTIAL

1. **顶部 50px 促销条**：原站导航上方有 50px 运营横幅（"学习中心 / 免费得算力"等，随活动变化），本地未复刻。影响：本地内容区起点 y=70，原站 y=120；其余 x/宽度/内边距完全一致。属运营内容，不建议硬编码，待产品确认是否要通用槽位。
2. **内容区内部卡片**：原站左卡 1083×651 白底 r8、右侧 615 面板 `#EDEFF5` r8、两栏间距 10px —— 属 workspace 业务布局（由另一组负责），本组未改。
3. **工作区自带标题行**：outpaint / color-v2 在 nested `ToolShell` 里传了 `title/subtitle/badges/actions`，导致内容区出现一行标题（原站无）。属 workspace 传参，非共享外壳；建议后续由业务组分批摘除。
4. **右侧 AgentPanel**：本地为 439px 抽屉，关闭时移出视口（x=1957），不影响布局；原站无此元素。

## 4. 验证

```bash
cd web && export PATH="$HOME/.bun/bin:$PATH"
bun run typecheck          # tsc --noEmit 通过
bun test src/components/tools/tool-shell.test.tsx src/features/tools
# 1109 pass / 0 fail（含框架与路由断言）
```

复采命令：

```bash
python3 docs/V1.0/plan_linkfox_navigation/tools/probe_frame.py \
  --side local-after --url "http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting" --id AI_OUTPAINTING
```

改动后实测（local-after）：导航 `60px / rgb(255,255,255) / 1px rgb(230,230,231)`；侧栏 `180px / rgb(255,255,255) / 1px rgb(230,230,231)`；工具项 `40px / 16px / 0 12px 0 18px`，未选中 `rgba(0,0,0,0.6)`、选中 `rgb(114,60,249)`；主区 `x=180 w=1728 bg rgb(244,246,248) padding 10px`，工作区宽 `1708`。
