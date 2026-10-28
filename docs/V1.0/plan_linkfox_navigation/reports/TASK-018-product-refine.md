# TASK-018 实施报告：PRODUCT_REFINE「商品精修」

- 分支：`feat/linkfox-v1-real`
- 提交：`5d86b01`（feat(tools): PRODUCT_REFINE 商品精修真实工作台）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/11-product-refine.md`（原站 `https://www.linkfox.com/draw/product-refine`，证据级别 workspace_dom）
- 结论：**信息架构与操作逻辑已按规格落地，配置项真实进入 provider 请求并被守卫；页面尚未接线到路由**（见 §5，属项目既有状态）。

## 1. 改了什么

| 文件 | 内容 |
| --- | --- |
| `web/src/features/tools/registry/product-refine.ts`（新增 422 行） | 页面契约层：精修模式（整图 `full` / 去背景 `cutout` → provider 字段 `isRmBg`）、精修强度三档、自动放大规则（≤512px→×4、513–1024px→×2、>1024px→原尺寸）、色彩校正（`#RRGGBB`/`#RRGGBBAA`）、比例与输出尺寸、校验、提示词、快照/指纹/过期差异、草稿读取 |
| `web/src/features/tools/adapters/product-refine.ts`（新增 304 行） | 执行层：`buildProductRefineInput` / `assertProductRefineInput`（提交前逐项反查「页面配置 → 请求」）、`runProductRefine`（submit → waitForResult）、`retryProductRefine`、`productRefineResultFromTask` |
| `web/src/components/tools/workspaces/enhance.tsx`（+443/−8） | 新增 `ProductRefineWorkspace`：商品图（上传/作品库）、精修模式、精修强度、自动尺寸规则说明与实时输出尺寸、色彩校正开关、生成/取消/重试、结果过期提示、前后对比；`CompareSlider` 抽出 `testIdPrefix` 以复用（`ScaleUpWorkspace` 行为不变，其 3 条渲染测试仍全绿） |
| `web/src/features/tools/adapters/product-refine.test.ts`（新增 389 行） | 21 条测试：尺寸规则边界、字段映射与防丢参、执行/重试链路、快照过期与结果映射 |

真实边界（不是「演示成功」）：

- **去背景**：`isRmBg` 为显式 boolean 进 `fields`，UI 模式切换直接决定该值，不是只改文案。
- **自动尺寸**：按规格规则算出真实像素，写入请求 `size`（`WxH`），并在提交前用 `assertProductRefineInput` 反查 `input.size === expectedSize`，不一致直接抛错不发请求。
- **色彩校正**：色值经 `normalizeHexColor` 规范化为大写 `#RRGGBB(AA)` 后进 `fields.color`；非法色值在提交前被 `assert` 拦下（`色彩校正色值不合法`），并在提示词里写明「仅调整偏色与白平衡」。
- **精修强度**：`ToolAdapterInput.fields` 按网关注释只参与指纹与展示、不发给 provider，因此强度以**真实提示词指令**落地（`buildProductRefinePrompt` 输出对应强度的操作描述），不是空壳选项。
- **结果**：只取 `task.result.items` 中 `kind === "image"` 的真实项；失败原因用 `task.error.message` 原样透出，不伪造"进行中/已完成"。

## 2. 如何验证（全部实际执行，非读码）

命令均在 `web/` 下执行（`bash` 工具 PATH 缺 node，故经 `zsh -lc` 与 `~/.bun/bin/bun`）：

1. 类型检查：`zsh -lc './node_modules/.bin/tsc --noEmit'` → **退出码 0，零报错**。
2. 单元测试：`~/.bun/bin/bun test src/features/tools/adapters/product-refine.test.ts` →
   ```
   21 pass / 0 fail，104 expect() calls
   ```
3. 无回归：`~/.bun/bin/bun test src/components/tools/workspaces/enhance.test.tsx` → `3 pass / 0 fail`（ScaleUpWorkspace 分区、四模式三档、未上传不编造尺寸仍通过）。
4. 真实渲染证据：临时脚本（跑完已删除）用 `react-dom/server` 渲染 `ProductRefineWorkspace`，断言 14 项：
   ```
   PASS  data-tool="product-refine"      PASS  商品图分区
   PASS  精修配置分区                     PASS  整图精修模式
   PASS  去背景精修模式                   PASS  精修模式 radiogroup
   PASS  精修强度 radiogroup              PASS  尺寸规则文案（≤512px → 放大 4 倍）
   PASS  未上传时输出待定                 PASS  开始精修按钮
   PASS  生成按钮禁用(无商品图)           PASS  无源图不渲染前后对比
   PASS  色彩校正开关                     PASS  结果区标题
   14/14 checks passed, html 6640 chars
   ```

调试过程中两次修正都是真实偏差，已按真实边界收敛：① 非法色值的守卫点在 `assertProductRefineInput`（提交前）而非 `build*`，测试改断言真实守卫点；② `ToolTaskResult` 字段是 `receivedAt`，不是 `savedAt`。

## 3. 未完成 / 风险

1. **页面未接线（项目既有缺口，非本任务引入）**：`web/src/features/tools/tool-page.tsx:395` 目前无条件渲染 `WorkspacePlaceholder`；`ScaleUpWorkspace`、`ProductRefineWorkspace` 等所有已实现工作台都没有被路由引用（`grep` 全仓无 `workspaces/enhance` 的导入）。因此 `/tools/smart-edit/product-refine` 打开仍是占位页。该文件不在本任务允许修改范围内，需由接线任务统一处理。
2. **提交串入他人文件（共享工作树并发所致，已如实记录）**：`5d86b01` 除本任务 4 个文件外，还包含 `docs/V1.0/plan_linkfox_navigation/reports/TASK-016-report.md` 与 `evidence/task-016-render.html`——这两个文件在我提交前已被并行的另一个 worker 预置于共享 index（同一工作树并发），按 `git add` 具名路径提交时被一并带入。

   更正过程（`git reflog` 实证，不臆造）：我随后执行 `git reset --soft HEAD~1` 试图重提，但那一刻并行 worker 已在我之上提交了 `0bb16ed`（TASK-016 报告），该 reset 实际把**它的提交**从分支上弹掉（内容仍在 index/工作树）；我的第二次 `git commit -- <4 个路径>` 因内容已全部在 `5d86b01` 中而报「no changes added to commit」，HEAD 停留在 `5d86b01`。随后该 worker 重新提交为 `66e2888`，其工作最终无丢失。
   最终分支：`441c7a4` → `5d86b01`（本任务）→ `66e2888`（TASK-016 报告，他人）。教训：共享工作树里不要用 `reset --soft` 改写历史，提交前应核对 `git diff --cached`。
3. **精修强度未进 provider 参数**：网关 `ToolAdapterInput.fields` 明确「只参与指纹与 UI 展示，不发送给 provider」，因此强度只能通过提示词传达；若上游模型支持强度参数，需要在网关层新增透传字段（超出本任务范围）。
4. **未做真实计费/出图验证**：本任务无 provider 凭据调用，端到端出图（真实 `isRmBg` 透明底效果）未验证；测试用假网关断言的是「请求内容正确」而非「上游效果」。

## 4. 使用入口

- 页面组件：`web/src/components/tools/workspaces/enhance.tsx` → `ProductRefineWorkspace`（命名导出，`ScaleUpWorkspace` 仍为默认导出）。
- 契约层：`web/src/features/tools/registry/product-refine.ts`（`DEFAULT_PRODUCT_REFINE_VALUES`、`computeProductRefineOutput`、`buildProductRefinePrompt`、`createProductRefineSnapshot`）。
- 执行层：`web/src/features/tools/adapters/product-refine.ts`（`runProductRefine` / `retryProductRefine` / `productRefineResultFromTask`）。
- 目标路由（接线后生效）：`/tools/smart-edit/product-refine`。
