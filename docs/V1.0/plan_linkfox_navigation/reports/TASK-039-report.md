# TASK-039 商品营销素材（PRODUCT_MARKET_MATERIAL）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`38978f3` feat(tools): 商品营销素材 PRODUCT_MARKET_MATERIAL 工作区与运行适配器（TASK-039）
- 页面规格：[`page-specs/32-product-market-material.md`](../page-specs/32-product-market-material.md)
- 契约来源：`docs/analysis/assets/linkfox/schema_final.json#PRODUCT_MARKET_MATERIAL`（makeType 64，15 字段）
- 模型目录：`docs/analysis/assets/linkfox/models_catalog.json` → `image.69`

## 1. 改了什么（4 个文件，2057 行）

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/product-market-material.ts` | 717 | 页面事实来源：平台/地区/语言、A+ 模板与画幅、provider 能力、配置校验、单元计划、字段映射、快照指纹 |
| `web/src/features/tools/adapters/product-market-material.ts` | 407 | 运行链路：多图源校验 → 逐屏真实提交 → 失败屏重试 → 按模块分组 → 结果落文件存储 |
| `web/src/features/tools/adapters/product-market-material.test.ts` | 350 | 18 例测试（含首屏真实渲染） |
| `web/src/components/tools/workspaces/suite.tsx` | +583 | 新增 `ProductMarketMaterialWorkspace`（原 `ProductImageSuiteWorkspace` 默认导出不变） |

### 1.1 registry：能力来自目录，不来自想象

- **平台**：`amazon / shopify / walmart / etsy / temu`，每个平台带 `brandKeyValue`（写入 `brandKey.platform`），A+ 能力只有亚马逊（`platformSupportsAplus("amazon") === true`，其余 false）。
- **A+ 画幅按平台过滤**：`aplusRatiosForPlatform()` 亚马逊返回 `970x600 / 1464x600 / 600x450 / custom`，Shopify 返回空数组——`normalizeConfig()` 在平台切走时清空 `aplusTemplateIds` 与 `aplusAspectRatio`，避免把亚马逊像素塞给独立站。
- **provider 能力表**：只落地 `models_catalog.json#image.69` 里真实存在的 3 个模型（`GPT_2_5_IMAGE` 默认、`GEMINI_NANO_BANANA_2_1`、`GPT_2_5_F_IMAGE`）。`availableQualities()` / `availableResolutions()` / `availableMarketingRatios()` 全部按目录返回：`GEMINI_NANO_BANANA_2_1` 的 `supportedQualities` 为空 → UI 不出现品质档位；参考图上限统一 `maxReferences = 5`。
- **校验**：`validateMarketConfig()` 逐条给具体字段——`images-required`、`provider-unknown`、`quality-unsupported`、`resolution-unsupported`、`ratio-unsupported`、`aplus-unsupported`、`aplus-template-required`、`references-unsupported`、`cover-dangling`、`product-info-required`。
- **单元计划**：`buildMarketPlan()` 把「A+ 模板 × aplusCount」与「营销画幅 × 主副图张数」展开为模块，`buildMarketUnits()` 再展开为逐屏单元（每屏一条 prompt，含商品信息、品牌基因、平台/地区/语言、像素与比例、合规约束）。
- **字段映射**：`buildMarketToolFields()` 输出契约 15 字段（`imageUrl`/`outputNum`/`platform`/`brandKey`/`provider`/`quality`/`resolution`/`productInfo`…），并附 3 个画布侧字段（`aplusTemplates`/`aplusPixel`/`aplusCount`）用于按模块重放——与套图 adapter 传 `suiteUnitId` 等附加字段的既有做法一致。
- **快照**：`createMarketSnapshot()` + `fingerprintOf()`（稳定序列化）→ 输入变了就 `isMarketSnapshotStale()` 判过期，不拿旧图糊新文案。

### 1.2 adapter：真实提交，逐屏可重试

- `runMarketMaterial({ gateway, config, sources, provider, revision, signal, onUnit })`：先 `validateMarketSourceLimits()`（张数、像素、比例、可访问性、参考图上限），再按单元 `gateway.submit(input, { signal, draftRevision })`。**每屏 count=1**，套图张数由单元数表达，单屏失败不影响其他屏。
- 单屏提交异常只把该单元标 `submit-failed` 并继续（`MarketAdapterError` 只在**提交前**校验失败时抛），不会因为一屏 502 丢掉整批。
- `retryMarketUnit()` 三道守卫：`pending`（还在跑）拒绝、已成功拒绝、无 `taskId` 拒绝——避免重复扣费式重试；重试用 `gateway.retry(previous.taskId, input)` 沿用同一任务链路。
- `groupMarketUnits()` 按 `moduleId` 分组（A+ 头图/宽屏/手机、营销主图…），`summarizeMarketRun()` 给 `total/succeeded/failed/pending`。
- `saveMarketResultItem(item, result, deps)`：只保存 `task.result.items` 里真实存在的条目；没有可保存二进制时直接抛错，不生成占位图；上传走 `@/services/file-storage#uploadMediaFile`（动态 import，测试可注入）。

### 1.3 workspace：四块区域 + 真实阻断态

`ProductMarketMaterialWorkspace`（挂在 `workspaces/suite.tsx`，命名导出，默认导出保持 `ProductImageSuiteWorkspace` 不变）：

1. **商品多图与信息**：`ToolAssetInput` 多图上传（1–6 张、首张为主图、≤10MB、PNG/JPG/WebP），商品信息 textarea 2500 字计数。
2. **品牌与投放**：项目名/品牌名/主色/字体风格/风格描述；平台按钮行（亚马逊/Shopify…）、销售地区、语言，切换平台即时过滤 A+ 能力并清残留。
3. **A+ 与营销画幅**：A+ 模板多选（高级A+/A+/手机A+/自定）、画幅单选（平台不支持时整块禁用并说明）、每模块张数、模型/分辨率/品质下拉（选项来自 provider 目录）、营销画幅比例与自定义宽高。
4. **生成与结果**：`预计生成 N 屏` + 「开始生成」（未上传/未填信息/未设数量时 `disabled` 且 `title` 说明原因），生成中逐屏回填，结果按模块分组，单屏可重试/保存，错误原文展示。

状态链路与套图一致：`useToolDraftStore` 草稿恢复（值 + assetIds，超 500ms 防抖落盘）、`resolveConflict` 多标签冲突提示、`runError` 展示校验原文。

## 2. 如何验证（都跑过，不是读代码）

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
export PATH="$HOME/.bun/bin:/usr/local/bin:$PATH"
bun test src/features/tools/adapters/product-market-material.test.ts   # 18 pass / 0 fail
bun test                                                              # 987 pass / 0 fail（47 文件）
npx tsc --noEmit -p tsconfig.json                                     # 本任务 4 个文件无报错
```

18 例覆盖：A+ 平台过滤（亚马逊四档 vs Shopify 空）、provider 能力（GEMINI 无品质档位）、`normalizeConfig` 残留纠正、校验码逐条、单元/模块展开、字段映射与像素、提交成功与单屏失败隔离、重试三守卫与重试成功、分组与过期判定、保存（无内容拒绝 + 注入上传）、首屏渲染（四块标题 + 禁用态按钮，`renderToStaticMarkup` 真实渲染 HTML 断言）。

## 3. 未完成 / 风险

1. **路由未接线（与 TASK-036/038 同一缺口）**：`ProductMarketMaterialWorkspace` 目前**没有任何地方挂载**——`tool-page`/工作区注册表还没有 39 工具的 workspace 映射，`ProductImageSuiteWorkspace` 同样无人引用。页面能渲染、能力能测，但用户在 UI 里点不到。需要一次统一的「工具 → 工作区」路由接线任务（改 `tool-page.tsx`，不在本任务授权文件内）。
2. **构建期存在他人未跟踪文件的类型错误**：`web/src/features/tools/adapters/scene-transfer.ts`、`workspaces/scene.tsx`、`workspaces/video.tsx` 有 TS 报错（未跟踪/非本任务文件，属其他 worker 在写），`tsc` 全量退出码非 0 由它们造成；本任务 4 个文件零报错。合并前需由对应任务收口。
3. **模型目录只有 3 个 provider 落地**：`models_catalog.json#image.69` 实际有 8 个模型，本任务只落了默认 + 2 个（其余 `SEEDREAM5_PRO`/`WAN2_7` 等无品质档位、比例集不同）。目录全量落地建议单独任务做，避免这里塞未验证能力。
4. **真实出图未做端到端联调**：测试用注入 gateway 验证协议与状态机；真实上游（LinkFox makeType 64）需要有效凭据才能跑通，本任务未消耗额度。
5. **A+ 模块像素只覆盖三档**：`970x600 / 1464x600 / 600x450` + 自定义，来源是页面规格与亚马逊 A+ 常见规格；若后续拿到更权威的 A+ 尺寸表应替换 registry 常量。
