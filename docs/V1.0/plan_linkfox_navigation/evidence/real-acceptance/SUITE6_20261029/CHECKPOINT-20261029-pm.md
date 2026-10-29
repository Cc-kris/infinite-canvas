# suite6 接管（2026-10-29 下午）执行记录

## 已提交
- `e352c97 feat(tools/suite6): 换色/裁剪/套装/试衣/放大/扩图/POD/修色对齐原站（优秀案例做同款 + 上传区样式）`
  - 12 文件：workspaces/{color,crop,dress,dressing,enhance,enhance.test,outpaint,pod,pod.test,repair}.tsx、
    components/tools/tool-asset-input.tsx（新增 dropLabel / thirdAction，仅 suite6 使用）、
    features/tools/case-apply.ts（新增，案例素材真实入库；被已提交的 color-v2/suite/dress-suite 引用）
  - 提交时未带任何 LinkFox 全局模块（无积分/个人中心/学习中心/促销条/顶栏改动）；help-dock、replace、scene-fission 等属其他 worker，未 stage。

## 验证
- `./node_modules/.bin/tsc --noEmit` → exit 0
- `bun test`（web/）→ 1374 tests，1371 pass；3 fail 全部是 `tests/*.spec.ts`（Playwright e2e 被 bun test 误收集），
  与 suite6 无关，改动前即如此；suite6 子集（color/enhance/outpaint/pod/suite）23 pass。
- 环境坑：本机 code_run 的 bash PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin，
  必须 `export PATH="$HOME/.bun/bin:/opt/homebrew/bin:$PATH"` 才能用 bun/node/tsc。

## 工作树归类（未提交、属他人，勿动）
- help-dock.tsx + tool-page.tsx（HelpDock）、replace.tsx、scene-fission.tsx、registry/product-scene.ts、registry/replace-goods.ts、
  adapters/product-scene.test.ts、docs 下其他 evidence 目录、项目根 *.json（原站 API dump）、.worker-* 目录。

## 真实批量复验（2026-10-29 14:49，本地 3000）
- PRODUCT_IMAGE_SUITE `/tools/ecommerce-suite/product-image-suite`：案例「做同款」已回填真实素材
  `linkfox-case-2026855585971982336-source.jpeg`（1000×1000 blob + `__cases/product-image-suite/*.jpg`）。
- 配置：高级A+×1 + 场景图×1 = 100 点（从默认 8 张/400 点下调，控成本）。
- 点「开始生成」→ 真实上游返回：`共 2 张 · 成功 2 · 失败 0 · 待定 0`；
  高级A+ 结果 1024×1024（data:image/png），场景图结果 2048×2048（`https://oss-us.dimenoss.com/images/2026/10/29/1793256583_21ae8d85fbf28ec7cdd9a9823acb1ece.png`）。
- **发现回归**：「历史记录」标签显示 `0 条`（空态「还没有套图任务记录」）。suite.tsx 的 onGenerate 只 setUnits/setSnapshot，
  从不写 `useToolTaskStore`，刷新后结果区与历史都会丢。→ 待修。
- 顺带：他人正在改 `web/src/components/layout/app-top-nav.tsx`（删 LinkFox 促销条/用户区），HMR 中间态曾抛
  `AppPromoBar is not defined`，硬刷新后正常；该文件不归 suite6，不提交。

## 修复：套图任务未落 store（历史 0 条 / 刷新丢结果）
- 根因：`workspaces/suite.tsx` 的 runSuite/retrySuiteUnit 用 `getToolGateway()`（默认内存 store port），
  任务不进 `useToolTaskStore`；HEAD 版本即如此（既有缺口，非 suite6 回归）。
- 修：`stores/use-tool-task-store.ts` 新增 `getPersistedToolGateway()`；suite.tsx 4 处改用；
  新增 `restoreSuiteUnitsFromTasks()` 用 prompt 对齐还原单元，刷新自动回填 + 历史点击回填。
- 验证：`tsc --noEmit` 0 错；`bun test src/components/tools/workspaces src/features/tools/adapters/product-image-suite.test.ts src/stores` 59 pass / 0 fail。
