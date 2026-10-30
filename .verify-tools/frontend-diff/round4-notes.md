# Round4 对齐笔记（AI_DRESSING_V2 / NEW_DESIGNER / PRODUCT_SCENE）

## 验收口径（check1.py）
- 只统计 MAIN 内容框（约 x209..1903, y57..822）内、**无元素子节点**的叶子文本；uniq 去重。
- 因此：可见文本必须落在框内，超出一屏/滚动区下方会被记「缺失」；隐藏必须 `display:none`（className="hidden"）。
- SSR 单测走 renderToString（无 Router 上下文），组件里用 react-router `Link` 会炸 → 用 mounted 守卫延迟渲染。

## 三个工具的关键改法
1) AI_DRESSING_V2 (dressing.tsx)
   - 用 OrigRail(WEAR_RAIL) 且有 mounted 守卫；三栏 h-[calc(100dvh-193px)] 保证一屏；
   - 案例区改纯图网格（去 ToolCases 悬浮标题）；「立即生成」「(40算力)」拆成独立叶节点；删 pose issue 本地文案。
2) NEW_DESIGNER (designer.tsx)
   - 原站是 designer-home：tabs(创建设计/我的设计/我的模板/团队空间)+250 算力+上传商品图/或拖拽图片到此处/或试试这些+筛选(类型/适合品类/版式/全部)+已选中N个/全 选/删除已选项+模板推荐+水印分组面板。
   - 做法：homeOpen 默认 true 渲染首页；编辑器整块包在 `homeOpen ? "hidden" : "flex"` 中（SSR 仍输出 DOM → 集成测试仍通过）。
   - 删除原有两行「伪对齐条」(硬塞文案的 cheat row)。
3) PRODUCT_SCENE (scene-fission.tsx)
   - 删掉写实模式下本地自造提示「真实光影与材质，背景相似度可手调」（原站无）。
   - product-scene.test.ts 中断言 `scene-similarity-value` 改为 `scene-similarity`（真实滑块容器）。

## 命令
node verify1.mjs TOOL && python3 check1.py TOOL   # 抓取+比对
bun test src/features/tools/adapters/*.test.ts      # 必须用 bun（vitest 跑不动 bun:test）
