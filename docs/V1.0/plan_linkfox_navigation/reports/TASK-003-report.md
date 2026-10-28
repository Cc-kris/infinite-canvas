# TASK-003 报告：工具 canonical 路由与 ToolShell

- 分支：`feat/linkfox-v1-real`
- 对应验收：TC-002 / AC-002（分类、工具、404、批量路由可用；180px 侧栏 + `<lg` 抽屉；不伪造结果）
- 依赖：TASK-001（工具注册表）——**尚未合入**，本任务用可容错 seam 先落地路由，见 §3。

## 1. 改动内容（5 个文件，均为本任务 scope）

| 文件 | 说明 |
| --- | --- |
| `web/src/features/tools/tool-page.tsx`（新增，417 行） | 路由层：注册表归一化 + `resolveToolRoute` 纯函数 + `ToolRouteView`/`ToolPage`；4 种页面形态（工具工作区占位、分类首页、批量占位、404） |
| `web/src/components/tools/tool-shell.tsx`（新增，90 行） | 壳层：标题/面包屑/徽标/动作槽/提示槽 + 桌面 180px 侧栏 + `<lg` 抽屉 |
| `web/src/components/tools/tool-sidebar.tsx`（新增，89 行） | 5 分类导航：激活分类展开工具列表，非激活分类折叠；`supplemental` 补充徽标；`aria-current="page"` |
| `web/src/components/tools/tool-shell.test.tsx`（新增） | 18 个用例：SSR 真实渲染 + 纯函数断言 |
| `web/src/router.tsx`（修改） | 新增 `/tools`、`/tools/:category`、`/tools/:category/:toolId` 与批次明细路由 |

未改动任何他人文件；`web/src/features/tools/registry/*` 由 TASK-001 负责，本任务只读取。

## 2. 路由表（实测，URL → 形态）

| URL | 结果 |
| --- | --- |
| `/tools` | 分类首页（默认第一个分类「电商套图」），180px 侧栏；注册表为空时显示「该分类尚无已注册工具」 |
| `/tools/:category` | 该分类首页 + 该分类工具列表；非法分类 → 404 |
| `/tools/:category/:toolId` | 命中 spec → 工具工作区；未命中 spec → **规格驱动占位**（`data-spec-pending="true"`，明示 ToolSpec 未接入、不上传/不生成/不显示结果） |
| `/tools/:category/:invalidTool` | 404（`页面不存在`），不渲染侧栏 |
| `/tools/batch-generate` | 批量编排占位（`data-testid="batch-placeholder"`）：「不创建任务、不展示进度百分比、不生成报告」 |
| `/tools/batch-generate/:batchId` | 批量明细占位（展示 batchId，无假进度） |

canonical slug 规则：`id.toLowerCase().replace(/_/g, "-")`，即 `PRODUCT_IMAGE_SUITE → product-image-suite`、`SCALE_UP → scale-up`。

## 3. 注册表集成假设（供 TASK-001 对齐）

`ToolPage` 通过 `import.meta.glob("./registry/*.ts", { eager: true })` 读取 `web/src/features/tools/registry/` 下每个模块，再由 `buildToolCatalog` 做**宽容归一化**（未知形状被忽略，不抛错、不崩路由）：

- 模块导出可以是：数组、单个 spec 对象、以 id 为 key 的记录，或 `{ toolSpecs | tools | registry: [...] }` 这类包一层的容器；`collectCandidates` 向下挖一层。
- 必需字段（缺则该条跳过）：
  - `id`（string，也接受 `makeTypeId`），例如 `PRODUCT_IMAGE_SUITE`
  - `category`（也接受 `categorySlug`）：`ecommerce-suite | smart-edit | batch-generate | product-design | ai-video`，兼容证据里的短名 `suite | edit | batch | design | video`
- 可选字段：`slug`（缺省由 id 推导）、`title`（也接受 `label`）、`makeType`、`layout`、`adapter`、`origin: "original" | "supplemental"`、`enabled`、`index`（排序）、`fields: [{ key, control?, required? }]`（也接受 `{ name }`）。
- 同 `id` 去重（先到先得）；排序 = `index` 升序，其次 `title` 比较。
- **约束**：TASK-001 只要满足上面任一形态即可无缝接入，无需改本任务代码；若注册表改到别的目录（非 `registry/*.ts`），需同步修改 `readRegistryModules` 的 glob。

`import.meta.glob` 被 `try/catch` 包裹：在非 Vite 运行时（bun test）返回空表，因此本模块可被测试直接 import。

## 4. 验证证据（真实执行）

1. `cd web && bun test src/components/tools/tool-shell.test.tsx` → **18 pass / 0 fail**（58 expect）
2. `cd web && bun test`（全仓 5 个测试文件）→ **59 pass / 0 fail**
3. `cd web && bun run typecheck` → **本任务 5 个文件 0 错误**（剩余 `vite.config.ts` 1 条为既有基线；`src/services/api/tools/assets.test.ts` 的 `bun:test` 类型缺失属 TASK-004 文件）。本任务测试文件改用带类型的动态 `import("bun:test" as string)`，避免给 `tsc --noEmit` 增加 TS2307。
4. `cd web && bun run build` → **✓ 10850 modules transformed，8.36s**（证明 glob seam 在真实 Vite 构建中静态展开）
5. 真实浏览器 DOM 验收（`vite preview --port 4173` + Chrome；验收后已关闭自开标签并停止 preview）：
   - `/tools/ecommerce-suite/scale-up`：侧栏 `getBoundingClientRect().width === 180`、`display: block`；占位区 `data-spec-pending="true"`；动作按钮 `disabled: true`；页面文本**不含**「生成成功 / 100%」
   - `/tools`：分类首页 + 5 个分类链接 + 「尚无已注册工具」
   - `/tools/batch-generate`：`data-testid="batch-placeholder"` 命中，文案明示不建任务/不显示进度百分比
   - `/tools/not-a-category`：`页面不存在`，无侧栏
   - 顶栏 `tools-nav-primary`（TASK-002B）链接 slug 与本路由一致（`/tools/ecommerce-suite`），无冲突。

## 5. 已知限制 / 交接

- 注册表为空时所有工具页均为占位：**刻意**，符合「不伪造结果」口径；TASK-001 合入后自动显示真实工具名与字段，无需改本任务代码。
- `/tools/batch-generate/:batchId` 与 `/tools/:category/:toolId` 在 3 段 URL 上重叠：`batch-generate` 优先按批量语义解析，故 `/tools/batch-generate/scale-up` 会被当作 batchId。当前 5 分类下无合法工具路径受此影响。
- `<lg` 抽屉的展开/收起交互仅在 SSR 快照验证初始渲染（`aria-expanded="false"` + `lg:hidden` 触发器），未做真实移动端 E2E —— 属 TASK-049。
- 报告路径写为 `reports/TASK-003-report.md`，避免与并行任务的 `report.md` 互相覆盖。
