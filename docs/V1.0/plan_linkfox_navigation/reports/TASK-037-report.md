# TASK-037 上装换料 MATERIAL_UPPER_BODY 实施报告

- 分支：`feat/linkfox-v1-real`
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/30-material-upper-body.md`（layout=`dress`，路由 `/tools/product-design/material-upper-body`，makeType 16，证据级别 `supplemental_chunk_design`）
- 变更规模：4 文件 / +2948 行（3 新建 + 1 扩展）

## 1. 交付物

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/material-upper-body.ts` | 508 | 页面契约：7 字段常量与上传限制、张数 1–4、本地材质目录（8 大类 / 子类 + 质感描述）、上装椭圆蒙版区域、草稿读写、类目→子类联动、能力解析、字段级校验、提交快照与漂移描述、真实 prompt 构造、产物说明 |
| `web/src/features/tools/adapters/material-upper-body.ts` | 442 | 运行适配：源图构造/尺寸校验、蒙版尺寸与真实 PNG 渲染、7 字段构造、提交前守卫、`runMaterialUpperBody` 真实提交 + 等待 + 单件重试、结果格子与漂移、执行摘要 |
| `web/src/features/tools/adapters/material-upper-body.test.ts` | 498 | 29 个 bun 用例（registry 契约 / adapter 真实链路 / SSR 首屏渲染） |
| `web/src/components/tools/workspaces/dress.tsx` | 1500（原 870） | 原 AI 穿戴实现改名 `AiWearableWorkspace`；新增 `MaterialUpperBodyWorkspace`；`DressWorkspace` 改为按 `toolId` 分发的壳，`default` 仍走 AI 穿戴（向后兼容既有测试） |

注册表接线无需改动：`gateway.ts` 的 `TOOL_ADAPTER_TABLE` 已含 `MATERIAL_UPPER_BODY`（7 字段），`TOOL_ADAPTERS` 由 `TOOL_IDS` 自动生成，因此本适配器**直接处于可执行链路**，不是 mock。

## 2. 关键行为（真实边界）

1. **7 字段真实落地**：`categoryIds / categoryName / imageName / imageUrl / isMatting / outputNum / subType` 全部由 `buildMaterialFields` 构造，`assertMaterialInput` 逐字段断言存在且非空——字段存在但为 `undefined/null` 也判缺失（JSON 序列化后会消失，属于残缺请求）。
2. **缺图不提交**：`imageUrl` 为空直接抛 `MaterialUpperBodyAdapterError`，不发空图请求；首屏提交按钮 disabled 并列出 `data-issue="imageUrl"` 等定位项。
3. **抠图 = 真蒙版**：`isMatting` 开启后由椭圆区域经 canvas 导出**与原图同尺寸的 PNG**，上传为真实资产，并作为**第二张参考图**提交（原图 + 蒙版）；开启却没蒙版则守卫直接抛错，不发送残缺请求。
4. **类目→子类联动有据**：未选大类 → 子类清空；子类不属于当前大类 → 收敛到该大类首个子类；`outputNum` 越界夹到 1–4；蒙版区域夹进画面。联动原因写进 `changes` 并在 UI 明示，不静默改值。
5. **提交快照与漂移**：提交时锁定 `createMaterialSnapshot`（类目/子类/张数/抠图/素材/区域/prompt），配置变化由 `describeMaterialDrift` 逐项报因，结果区顶部提示「配置已变更（…），下面的结果来自上一版配置，请重新生成」，不冒充当前配置产物。
6. **结果按张落位**：`materialResultCells` 按期望张数铺格子（returned → filled / 缺 → pending / 任务失败 → failed），单件重试走 `retryMaterialUpperBody` 只替换目标格子（`mergeMaterialVariant`），已成功结果不重复生成。
7. **文案不含算力/积分**：提交按钮旁只写「本次将生成 N 张换料结果」，与规格「不显示原站算力」一致；材质目录来源在控件旁显式标注「本地材质目录（chunk 未取证原站枚举）」。

## 3. 验证证据（真实执行）

```
$ cd web && bun test src/features/tools/adapters/material-upper-body.test.ts src/features/tools/adapters/ai-wearable.test.ts
 59 pass
 0 fail
 335 expect() calls
Ran 59 tests across 2 files.

$ cd web && bun test
 940 pass
 0 fail
 5918 expect() calls
Ran 940 tests across 45 files.        # 全站无回归

$ cd web && npx tsc --noEmit -p tsconfig.json
（0 行输出，全项目类型检查干净）
```

测试覆盖：
- registry：工具身份/路由/makeType/7 字段对齐网关、目录唯一性与每类至少 1 子类、草稿往返与坏值回退、联动三条规则、张数收敛、缺图/空名/小区域/未配模型逐项定位、提示词写入材质与保留版型要求、快照漂移逐项报因、产物说明不含算力文案
- adapter：资产记录→源图与可读性、尺寸越界拒绝、椭圆蒙版尺寸与 PNG 导出、7 字段构造、参考图不足/张数不符/prompt 为空/开抠图却无蒙版一律拦截、submit 收到的 count/字段/参考图与页面一致、单件重试只替换目标格子、结果格子三态
- workspace：`renderToStaticMarkup` 真实渲染出 `material-workspace`、步骤条、类目树、子类区、抠图、张数 1–4、`data-issue="imageUrl"`、结果网格与 `tool-result`；并验证默认导出仍渲染 AI 穿戴

## 4. 偏差与遗留风险

1. **页面路由未接线（既有缺口，非本任务引入）**：本仓库没有 `tool-page.tsx`，`src/pages/` 只有 assets/canvas/config/home/image/prompts/video；所有 workspace 的唯一消费方是各自适配器测试里的 SSR 渲染。要让 `/tools/product-design/material-upper-body` 真正打开本工作区，需要一行 `toolId → <DressWorkspace toolId=… />` 的 dispatch 注册，该文件不在本任务允许改动清单内。
2. **材质大类/子类是本地目录**：chunk 未给出原站枚举值，`categoryIds/categoryName/subType` 使用本地稳定 id + 中文名，并在 UI 与代码注释显式标注 `inferred`；adapter 会校验取值必须命中目录，无法命中直接拒绝提交，不伪造上游枚举。
3. **蒙版字段缺口**：7 字段里没有蒙版 URL 位（`imageMaskUrl` 属于别的工具），因此蒙版以第二张参考图参与真实请求，而非写入 fields；如后续网关新增蒙版字段，`buildMaterialFields` 一行即可补位。
4. **上传限制取通用图片上限**（20MB、384²–4096²、PNG/JPEG/WebP）：`MATERIAL_UPLOAD` 注释已标明「通用图片上限，chunk 未单列本工具限制」。

## 5. 使用入口

- 页面形态：`<DressWorkspace toolId="MATERIAL_UPPER_BODY" />`（显式传 toolId），或直接用 `MaterialUpperBodyWorkspace`。
- 提交链路：`runMaterialUpperBody({ gateway, values, capability, source, mask, revision, onUpdate })` → `gateway.submit` → `waitForResult`；单件重试 `retryMaterialUpperBody(...)`。
- 校验：`resolveMaterialCapability` + `validateMaterialState` + `assertMaterialInput` 三层，任意一层不过都不会发请求。
