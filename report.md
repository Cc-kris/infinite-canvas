# TASK-028 AI 穿戴（AI_WEARABLE）报告

- 分支：`feat/linkfox-v1-real`
- 提交：`97f93d1` feat(tools): AI_WEARABLE 穿戴工作区与提交契约（30 用例）
- 路由：`/tools/product-design/ai-wearable`（layout = `dress`，makeType = 34，`enabled: true`）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/21-ai-wearable.md`

## 改了什么

| 文件 | 内容 |
| --- | --- |
| `web/src/features/tools/registry/ai-wearable.ts`（700 行 / 62 导出） | 契约常量（工具 id、slug、路由、makeType 34、13 个提交字段、上传上限 10M + 384~4096、张数 1~4）；品类 × 部位 × 模特页签目录与联动收敛（`linkWearableValues`，换模特不清空商品）；蒙版椭圆归一化几何（`wearableRegionToMaskRect`、面积/退化判定、`defaultTargetRegion`）；校验（10 个原因码：缺商品/商品尺寸/商品蒙版退化/缺模特/模特尺寸/目标蒙版退化/部位不兼容/张数不支持/模型未就绪/提供方不可执行）；快照 + hash + 失效判定（`describeWearableDrift`）；提示词拼装（部位/品类/取景/场景/一致性约束/二次操作）；`readWearableValues` 草稿反序列化（只认目录内取值，张数夹到 1~4） |
| `web/src/features/tools/adapters/ai-wearable.ts`（524 行 / 37 导出） | 两张蒙版真实渲染为 PNG（`renderWearableMaskBlob` / `renderWearableMaskDataUrl`，椭圆填充 + 真实画布尺寸）；11 个提交字段组装（`buildWearableFields`，蒙版走真实引用，HTTPS 优先否则资产 id；2 个结果字段由 `bindWearableResultFields` 在拿到真实结果后回填）；提交守卫 `assertWearableInput`（张数未进请求 / 蒙版为空 / 参考图错位 / 提示词缺部位一律拦下）；`runAiWearable` 联动收敛→校验→守卫→真实提交→等结果；失败格重试按位置合并（`mergeWearableVariant`，已成功格不丢）；结果映射（空结果判失败，不补造图）；`bindWearableResultFields` 空引用抛错 |
| `web/src/components/tools/workspaces/dress.tsx`（870 行，新建） | 工作区：①上传穿戴商品（真实 `<input type=file>` + 字节进度 + 10M/384~4096 限制）②商品品类页签（目录页签随模特取景收敛）③商品蒙版椭圆编辑器（拖拽中心/拉半径 + 数值微调 + 撤销/重做/重置）④模特：模特类型页签、模特参考图、穿戴部位（不可用部位禁用并给出原因）、目标蒙版椭圆 ⑤场景页签 + 质检类型 + 二次操作开关 ⑥数量 1/2/3/4 ⑦生成（按 `values.outputNum` 一次多张，按钮实时列出被拦截原因，生成中可取消）⑧结果：逐格状态、单格重试、部分失败只标失败格、配置变更标「来自旧版本」；草稿即时写入 + 刷新恢复（资产索引缺失时提示重新上传） |
| `web/src/features/tools/adapters/ai-wearable.test.ts`（536 行 / 30 例） | 契约与目录、品类×部位×模特联动、蒙版几何与 PNG 真实尺寸、11 提交字段落位、提交守卫、真实提交链路（配置快照复用、重试、失败重试带快照）、结果与快照（部分失败、单格合并、空引用、stale）、工作台 SSR 首屏渲染断言 |

实现期修掉的真实缺陷：`RunAiWearableOptions` 里 `model` 被同名定义两次（一次是模特资产 `WearableSourceAsset`、一次是模型字符串），TS 直接报重复标识符 —— 改名 `modelOverride`，提交与重试两处同步下发（用例「modelOverride 命中时随提交下发」覆盖）。

## 如何验证

```bash
cd web
# 全库 typecheck 被并行 worker 未完成的 WIP 文件（handheld-goods.tsx / dressing.tsx 语法错误、未跟踪）挡住，
# 故用等价的等价入口只编译本任务四个文件（导入链自动展开依赖）：
cat > tsconfig.task028.json <<'EOF'
{ "extends": "./tsconfig.json", "include": [], "files": [
  "src/features/tools/registry/ai-wearable.ts",
  "src/features/tools/adapters/ai-wearable.ts",
  "src/components/tools/workspaces/dress.tsx",
  "src/features/tools/adapters/ai-wearable.test.ts" ] }
EOF
bun x tsc --noEmit -p tsconfig.task028.json    # 0 报错（已删除该临时配置，未入库）

bun test src/features/tools/adapters/ai-wearable.test.ts   # 30 pass / 0 fail, 116 expect()
```

- 30 例分组：契约/目录 3 例（工具 id/路由/makeType 34/13 字段清单、上传与张数上限、每个品类默认部位合法）、能力判定 3 例（未配置模型、渠道最多 2 张、网关字段表缺字段逐项报）、品类×部位×模特联动 4 例、校验 4 例（缺商品/缺模特/蒙版退化、尺寸超限/部位不兼容、张数超能力、尺寸判断基于真实字段）、蒙版几何与 PNG 3 例、字段与守卫 2 例、真实提交链路 5 例（submit→waitForResult→快照、modelOverride 下发、无模型不触网、网关不支持重试报错、重试复用同一配置快照）、结果与快照 4 例（部分失败、单格合并、结果字段回填、stale）、草稿读取 1 例、工作台 SSR 渲染 1 例。
- SSR 渲染证据：`renderToStaticMarkup(<DressWorkspace/>)` 产出 20842 字节，含 `dress-workspace`、商品品类、穿戴部位、模特参考、场景、`1 张`/`4 张`、生成、结果资产 —— 已固化为最后一个用例。
- 类型检查入口里删掉的 `tsconfig.task028.json` 与探针文件均为临时件，未提交。

## 未完成 / 风险

1. **路由接线缺口（共享文件，未擅改）**：`web/src/features/tools/tool-page.tsx` 仍未把 `layout: "dress"` 映射到 `workspaces/dress.tsx`，浏览器打开 `/tools/product-design/ai-wearable` 只有占位区。本任务与同批工具一致，用单测 + SSR 真实渲染取证；接线路由后需补一次真实点击验收（上传→蒙版→生成）。
2. **品类/页签枚举缺权威定义**：`AI_WEARABLE.json` 与 page-spec 只给出中文标签，未给 `productCategory`/`modelTabType`/`sceneTabType`/`checkType` 的枚举值。本实现用页面目录（`WEARABLE_CATEGORIES`/`WEARABLE_PARTS`/`WEARABLE_MODEL_TABS`/`WEARABLE_SCENE_TABS`/`WEARABLE_CHECK_TYPES`）承载，未知值一律禁用并给出原因，不做猜测点击；若后端给出正式枚举需按同一映射补齐取值。
3. **外部能力**：真实穿戴模型未接入时提交会因上游未配置失败并在结果区如实报错（不伪造成功），因此端到端出图验收需模型接入后重跑。
4. **蒙版上传**：蒙版 PNG 经 `uploadToolAsset` 真实落库，HTTPS 优先否则用本地资产 id；线上存储未返回 HTTPS 时，后端需支持资产 id 解析（与其它工具同一约定）。

## 使用入口

- 代码：`web/src/features/tools/registry/ai-wearable.ts`、`web/src/features/tools/adapters/ai-wearable.ts`、`web/src/components/tools/workspaces/dress.tsx`
- 测试：`bun test src/features/tools/adapters/ai-wearable.test.ts`（30 例）
- 页面（接线后）：`/tools/product-design/ai-wearable`
