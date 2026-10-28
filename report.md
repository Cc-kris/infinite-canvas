# TASK-023 商品替换（REPLACE_GOODS）报告

- 分支：`feat/linkfox-v1-real`
- 提交：`c51dc98` feat(tools): TASK-023 商品替换 REPLACE_GOODS 工作区与执行链路
- 路由：`/tools/product-design/replace-goods`（layout = `replace`）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/16-replace-goods.md`

## 改了什么

| 文件 | 内容 |
| --- | --- |
| `web/src/features/tools/registry/replace-goods.ts` | 契约常量；四边形几何（`deriveQuadFields`、`dragQuadCorner` 透视保持对边平行 / 扭曲只动单角、`moveQuad/scaleQuad/rotateQuad`、面积/覆盖率/凸性）；蒙版保护网格与覆盖率；每 SKU 独立变换历史（撤销/重做/重置）；`validateWorkspace` 返回具体原因码；22 字段快照 + hash + 失效判定 + 提示词；草稿序列化/反序列化 |
| `web/src/features/tools/adapters/replace-goods.ts` | 本机真实渲染落位导引图 PNG（透视贴图）与保护蒙版 PNG；按 SKU 组装请求单元（4 张真实参考图）；`assertReplaceGoodsInput` 提交守卫、`auditReplaceGoodsFields` 逐字段审计（防静默丢参）；执行/重试/结果映射（空结果判失败，不补造图） |
| `web/src/components/tools/workspaces/replace.tsx` | 工作区：场景上传 → 商品与锁定区域（可拖角点画布、重绘区笔刷/擦除）→ 透视/扭曲、场景变化程度、去噪、输出数量 → 结果；多 SKU 增删与独立配置；提交按钮实时列出被拦截原因；结果区标注「来自旧版本」 |
| `web/src/features/tools/adapters/replace-goods.test.ts` | 14 例：校验原因码、几何、蒙版覆盖率、草稿往返、22 字段审计、提交守卫、真实 SSR 渲染断言 |
| `docs/.../evidence/task-023-*` | 渲染 HTML、测试输出、类型检查证据 |
| `docs/.../task-023-notes.md` | 施工笔记 |

顺带修掉的真实缺陷：`quadCoverage` 衡量的是「落在画布内的比例」，缩到几像素仍在画面内的退化四边形原本能通过校验 → 新增 `REPLACE_GOODS_MIN_QUAD_AREA = 0.01` 与 `quad-too-small` 原因码，提交前拦住。

## 如何验证

```bash
cd web
bunx tsc --noEmit                 # 全库 0 报错
bun test src/features/tools       # 462 pass / 0 fail（本任务 14 例）
bun test src/features/tools/adapters/replace-goods.test.ts
```

- 渲染证据：`docs/V1.0/plan_linkfox_navigation/evidence/task-023-render.html`（`react-dom/server` 渲染工作区首屏，21KB）
- 测试输出：`docs/V1.0/plan_linkfox_navigation/evidence/task-023-test.txt`
- 类型检查：`docs/V1.0/plan_linkfox_navigation/evidence/task-023-tsc.txt`

## 未完成 / 风险

1. **路由接线缺口（共享文件，未擅改）**：`web/src/features/tools/tool-page.tsx` 目前对所有工具只渲染占位工作区，没有任何路由挂载 `workspaces/*.tsx`。因此 `/tools/product-design/replace-goods` 打开仍是占位页；本任务工作区通过单测 + `react-dom/server` 真实渲染验证，与同批其他工具一致。
2. **外部能力**：真实替换模型未接入时，提交会因上游未配置而失败并在结果区如实报错（不伪造成功）。因此 TC-031 / AC-031 不是 PASS，需模型接入后按 `evidence/TC-031.json` 复验。
3. **未做浏览器交互验收**：因上述接线缺口，浏览器内无法进入本工作区；拖拽/键盘交互目前只有纯函数级与渲染级证据，接线路由后需补一次真实点击验收。

## 使用入口

- 代码：`web/src/components/tools/workspaces/replace.tsx`（工作区）、`web/src/features/tools/registry/replace-goods.ts`（契约）、`web/src/features/tools/adapters/replace-goods.ts`（执行）
- 文档：`docs/V1.0/plan_linkfox_navigation/task-023-notes.md`
