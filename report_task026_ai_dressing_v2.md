# TASK-026 AI 穿衣（AI_DRESSING_V2）报告

- 分支：`feat/linkfox-v1-real`
- 提交：`5e97969` feat(tools): AI穿衣 v2 工作区（双 Tab/逐槽位蒙版/真实提交流水线）
- 路由：`/tools/product-design/ai-dressing-v2`（layout = `dress`，`AI_DRESSING_V2_ROUTE`）
- 页面规格来源：`AI_DRESSING_V2.json`（https://www.linkfox.com/draw/ai-dressing 控件证据）+ page-spec

## 改了什么（4 文件 / 1948 行新增）

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-dressing-v2.ts` | 756（70 导出） | 契约常量：工具 id/slug/路由/layout、20 个提交字段（`AI_DRESSING_V2_FIELD_KEYS`）、上传上限 10M + 384~4096、张数 1~4、模特参考上限 4、蒙版最小覆盖率 0.005、版本/provider/model 选项；Tab 与槽位归一化（`normalizeTab`/`normalizeSlot`/`tabSlots`），**切 Tab 不清空另一侧草稿**（`switchTab`）；草稿构造与反序列化（`createDressingValues`/`normalizeDressingValues`/`serializeDressingValues`）；校验（`validateDressing` → 缺模特 / 缺服装图 / 服装尺寸未知 / 蒙版为空或覆盖率过低，`firstDressingError`、`dressingIssuesByField`）；蒙版工具（`garmentMaskCoverage`/`garmentMaskEmpty`/`fullCoverStroke`「整件」）；快照与哈希（`buildDressingSnapshot`/`dressingSnapshotHash`/`isDressingSnapshotStale`）；字段合成与必填（`composeDressingFields`/`requiredDressingFields`）；结果标签 `dressingTag` |
| `web/src/features/tools/adapters/ai-dressing-v2.ts` | 345（15 导出） | 逐槽位蒙版真实栅格化导出 PNG（`renderDressingMasks`，与源图同尺寸；**空蒙版直接抛错，不补白图**）；单元构建（`buildDressingUnit`：字段 + 参考图[模特/服装/蒙版] + 缺字段自检）；输入组装（`buildDressingInput`，缺字段即抛「缺少字段」）；共享任务网关（`createDressingRunPort`/`runDressingUnit`）；结果映射（`mapDressingTaskToOutcome` —— **上游 succeeded 但无图判为 failed/empty-result**）；`dressingResultView`（旧快照 stale + `[AI_DRESSING v2/pose:<id>/tab:<tab>]` 标签）、`describeDressingOutcome` |
| `web/src/components/tools/workspaces/dressing.tsx` | 625（新建） | 工作区：①双 Tab「上下装衣服 / 连体衣服」，切 Tab 保留另一侧已上传图与蒙版 ②模特参考真实上传入库（最多 4 张，10M/384~4096 约束由 `ToolAssetInput` 真实校验）③每个槽位服装图独立上传 + **SVG 覆盖层手绘蒙版**（指针按下起笔、移动续点、抬笔入历史；撤销/重做/清空/「整件」一键全覆盖；扩边开关）④参数区：生成张数 1~4、原图分辨率、二次操作、模特类型、版本、provider、名称 ⑤提交按钮实时列出被拦原因（`firstDressingError`），生成中禁用 ⑥结果卡片逐单元展示状态/说明/旧快照提示/图片 ⑦草稿 500ms 防抖落盘 + 刷新恢复（`useToolDraftStore` 的 hydrate/patch/flush） |
| `web/src/features/tools/adapters/ai-dressing-v2.test.ts` | 222（14 例 / 49 断言） | 契约（20 字段）、切 Tab 不丢草稿、校验三道拦截、蒙版覆盖率真实栅格化、草稿往返、快照标签、空蒙版导出失败、蒙版同尺寸导出、单元 20 字段 + 参考图、缺字段拦截、空结果判失败、带图成功、结果视图 stale 与标签、工作区 SSR 首屏 |

实现期修掉的真实缺陷（编译/运行阶段各一处）：

1. 注释里出现字面 `*/`（蒙版坐标说明）导致 TS 解析中断 —— 重写为不含闭合序列的措辞。
2. 测试用例把 `"prompt"` 当字段键传入 `missingFields`，而 prompt 不在 20 个 `DressingFieldKey` 内 —— 改为真实字段 `upperMaskUrl`，否则用例是假通过。

## 如何验证

```bash
cd web
# 1) 全库 typecheck：本任务 4 文件 0 报错
./node_modules/.bin/tsc --noEmit 2>&1 | grep -E "dressing"      # 无输出
# （全库仍有 11 行报错，全部来自并行 worker 的在建文件 handheld-goods.tsx / handheld-goods.test.ts）

# 2) 本任务用例
bun test src/features/tools/adapters/ai-dressing-v2.test.ts
# → 14 pass / 0 fail / 49 expect()，Ran 14 tests across 1 file
```

- 蒙版绘图路径不是打桩跳过：测试注入 `MaskRenderDeps.createCanvas` 假画布（记录 `stroke`/`moveTo`/`lineTo`/`fillRect` 调用），真实跑完 `renderMaskPng` 的描边→导出链路，并断言导出尺寸与源图一致（600×800）与 `data:image/png` 前缀。
- SSR 证据：`renderToStaticMarkup(<DressingWorkspace/>)` 断言页面含「上下装衣服」「连体衣服」两个 Tab、`data-testid="dressing-tabs"`、`data-testid="dressing-submit"` 且首屏为 `disabled`（未满足条件时确实拦得住）。

## 未完成 / 风险

1. **路由接线缺口（共享文件，未擅改）**：`web/src/features/tools/tool-page.tsx` 尚未把 `layout: "dress"` 映射到 `workspaces/dressing.tsx`（同批 `ai-wearable` 亦然），因此浏览器直接打开路由只有占位区。本任务以单测 + SSR 真实渲染取证；接线后需补一次真机点击验收（上传服装 → 涂抹蒙版 → 生成）。
2. **文件名避让**：`workspaces/dress.tsx` 已被并行 worker（TASK-028 AI 穿戴）占用，本任务工作区落在 `workspaces/dressing.tsx`；接线时注意不要混指。
3. **外部能力**：真实穿衣模型/provider 未配置时提交会在结果区如实报错（不伪造成功），端到端出图验收需模型接入后重跑。
4. **蒙版资产**：蒙版 PNG 经适配器以 dataUrl 进入提交字段与参考图；若后端要求先落资产库（`uploadToolAsset`）再传 id，需要在接线时统一（当前与 `ai-wearable` 的「HTTPS 优先否则资产 id」约定存在差异，需后端确认）。
5. **`/tmp/tsc.log`** 等临时件未入库；报告写在本文件而非共享 `report.md`（后者含并行 worker 未提交内容，避免互相覆盖）。

## 使用入口

- 代码：`web/src/features/tools/registry/ai-dressing-v2.ts`、`web/src/features/tools/adapters/ai-dressing-v2.ts`、`web/src/components/tools/workspaces/dressing.tsx`
- 测试：`cd web && bun test src/features/tools/adapters/ai-dressing-v2.test.ts`
- 页面（接线后）：`/tools/product-design/ai-dressing-v2`
