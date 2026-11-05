# agent-lf-productbg：商品图（NEW_REPLACE_BG_V2）按原站结构重做

任务空间：`agent-lf-productbg`（ego-browser space 2）。本地路由 `/tools/product-design/new-replace-bg-v2`，原站 `https://www.linkfox.com/draw/product-home` → 上传后 `/draw/ai-product`。

## 阶段 1：原站只读调研（已完成）

原站首屏（`/draw/product-home`，1920 宽实测）：

- 顶部白卡 `_header`（16px 20px 内边距、8px 圆角，高 240）：左侧 antd Upload.Dragger（1px dashed #d9d9d9、8px 圆角），居中「上传商品图」渐变主按钮（122×32）、「或拖拽/粘贴图片到此处」（12px 60% 黑）、「或试试这些」（12px 30% 黑）+ 6 张 60×60 示例图（`cdn.linkfox.com/ai-site/workbench/productExample1~6.png`）。
- 右侧不是「我的商品」列表，而是 370×208 的引导视频 `guide-ai-product.mp4`（视频里画着「我的商品 / 智能推荐场景 / 一键合成新图片」）。DOM 里确实有 `<h1>我的商品</h1> 更多→` 区块，但该账号没有商品时整块尺寸为 0（隐藏）。
- 「场景参考图」：h1 20px/700；右侧搜索框（placeholder「搜索标签关键词」）+「排序：」智能推荐（选中：#723cf9 字、#f9f0ff 底、1px 紫边）/ 按收藏时间 / **按素材热度**（原站文案，不是「按使用热度」）。
- 类目页签 16 个（无「全部」），默认选中「日用百货」，末尾「更多 →」；类目 14px 60% 黑。
- 卡片：200×200、12px 圆角，左下 55×55 白边 2px 商品示意小图，标题在卡片下方 14px 65% 黑；hover 紫色描边 + 左上「使用此场景」白底小标签。
- 搜索在当前类目内过滤；无结果时只显示「没有更多了」。
- 每个类目接口一次返回 48 张（儿童 & 母婴 30、医药保健/护理 36、其他 6）；场景列表接口 `image/material/recommendList` 请求体与返回体都加密，标题来自 DOM。
- 未上传商品时点「使用此场景」：弹出上传弹窗（上传新图 / 传过的图 / 素材库）。

上传一张测试图后的第二步（`/draw/ai-product`，未点生成）：

1. 先弹「自动抠图中…」→ 抠图编辑弹窗（手动选择 / 保留 / 去除 / 反选 / 重置 / 撤销 / 重做 / 局部消除 / 预览背景色 / 取消 / 确认使用；左原图、右「保留区域」棋盘格预览；「也可以 上传一张蒙版图 (已经抠好的商品的透明图)」）。
2. 确认后进入编辑器：左侧窄栏「返回 / 参考图 / 商品 / 元素」；左侧自动展开参考图抽屉（智能推荐 / 预设 / 我的 / 收藏 / 历史 / 采集；排序 + 搜索；商品：全部 + 16 类；场景：全部 / 室内 / 室外…；5 列卡片）。
3. 中间画布：顶部小贴士条「您可以调整商品主体到合适的画面位置…」，选中参考图后场景图铺满画布、商品浮在上面可拖动，底部「背景调节 小—大 / 重置 / 删除」。
4. 右侧配置栏 300px：画面尺寸（默认尺寸 1024 × 1024）→ 页签「商品合成 / 商品替换」（说明：「将您的商品合成至选中的场景图中。」/「以您的商品替换参考图中的商品。」）→ 已选参考图（选择参考图 / 重新选择）→ 背景相似度 slider（min 0.5、max 0.9、默认 0.7，刻度 弱相似 / 强相似 / 不变）→ 高级自定义（商品替换下有「保留遮挡物 开启/关闭」）→ 生成张数 1 / 2 / 3 / 4 → 立即生成。
5. 点「或试试这些」示例：不弹抠图，直接用原站已抠好的透明商品进入编辑器。

素材落盘（`web/public/__cases/new-replace-bg-v2/`）：

- `scenes/`：原站照片墙 57 张场景图（日用百货 12 张 + 其余 15 类各 3 张，类目内去重标题），每张配一张左下角商品示意图；512 宽 webp，最大单张 75KB，合计 2.0MB。
- `examples/product-1~6.webp`：「或试试这些」原图；`examples/cutout-1~6.webp`：原站编辑器里这 6 张示例的抠图结果（从原站 Konva 画布导出的透明 PNG 转 webp，带 alpha）。
- `guide-ai-product.mp4`：原站首屏右侧引导视频（562KB，原站同源）。

## 阶段 2：按原站结构重做代码（任务空间 `agent-lf-productbg2`）

### 改动文件

- 新建 `web/src/components/tools/workspaces/product-bg.tsx`：`SceneWorkspace` 本体搬到这里，两步结构。
  - 首屏（`data-step="home"`）：`#f4f6f8` 底 + 顶部白卡（虚线 Dragger、渐变「上传商品图」、「或拖拽/粘贴图片到此处」、「或试试这些」6 张示例、右侧 370×208 原站引导视频）；「场景参考图」h1 + 搜索框 + 排序（只有「智能推荐」可用，「按收藏时间 / 按素材热度」只读置灰，本地没有收藏/热度数据）+ 16 个类目页签（默认日用百货）+ 场景卡（12px 圆角、左下商品示意小图、卡下标题、hover 紫边 +「使用此场景」）+「没有更多了」。「我的商品」没有本地数据源，不渲染（原站账号无商品时也是隐藏）。
  - 第二步（`data-step="editor"`）：左窄栏「返回 / 参考图」→ 参考图抽屉（智能推荐；排序 + 搜索；商品：全部 + 16 类；建议条；5 列卡片）→ 中间画布（小贴士条、场景图铺满、商品可拖动、底部「商品大小 小—大 / 重置」）→ 右侧 300px 配置栏（画面尺寸「默认尺寸」+ 宽高框、「商品合成 / 商品替换」页签与原站说明、已选参考图（选择参考图 / hover 重新选择）、背景相似度 0.5–0.9 默认 0.7 刻度 弱相似/强相似/不变、生成张数 1/2/3/4、渐变「立即生成」）。
  - 示例点击：`uploadCaseFile` 把原站已抠好的 `cutout-*.webp` 真实入库，检测到 alpha 后直接确认抠图并进入第二步（与原站一致，不弹抠图）。
  - 自己上传：没有 alpha 时配置栏顶部出现「商品抠图」块（画主体蒙版 / 已是透明底 PNG、上传蒙版、确认使用），沿用 adapter 现有的蒙版 / 透明底门禁；蒙版模式下画布按蒙版亮度预览商品主体。
  - 首屏点场景卡（未上传商品）：记住所选场景并打开上传，上传完成后自动套用该场景（对应原站先要求上传商品）。
- `web/src/components/tools/workspaces/scene.tsx`：删除旧 `SceneWorkspace` 及专属常量/子组件（旧渐变色块、8 模板画廊、图层/撤销面板），改为 `export { SceneWorkspace, SceneWorkspace as default } from "./product-bg"`；顶部 import 只保留 `SceneTransferWorkspace` 用到的。`SceneTransferWorkspace` 和 `ProductSceneWorkspace` 的再导出没动。
- 新建 `web/src/features/tools/registry/new-replace-bg-v2-scenes.ts`：16 类目、3 个排序项、57 张场景（id / 类目 / 标题逐条取自阶段 1 采集的原站 DOM `scenes-raw.json` → `picked.json`，与 `scenes/` 文件名一一对应）、6 个示例、引导视频、合成/替换页签文案、`filterProductBgScenes` / `productBgScenePrompt` / `productBgModeOf`。
- `web/src/features/tools/registry/new-replace-bg-v2.ts`：`SCENE_OUTPUT_COUNTS` 改为原站 `[1,2,3,4]`；`SCENE_WEIGHT_LIMITS` 改为原站 `0.5–0.9`（step 沿用原有 0.05），新增 `SCENE_WEIGHT_MARKS`；`sceneWeightLabel` 改为 弱相似/强相似/不变；提示词与漂移原因里「融合强度」改称「背景相似度」；抠图门禁提示改为「上传主体蒙版… / 确认使用」。
- `web/src/features/tools/adapters/new-replace-bg-v2.ts`：只改两条错误文案（融合强度 → 背景相似度），请求字段与组装逻辑不变。
- `web/src/features/tools/adapters/new-replace-bg-v2.test.ts`：按新文案和新边界更新断言；渲染测试改为校验首屏结构；新增场景数据过滤、页签往返、选中场景后请求通过防丢参守卫的测试。

### 生成链路映射（adapter 字段不变）

- 选中场景 → 场景图通过 `uploadCaseFile` 真实入库，作为 `bg`（`sceneType: "custom"`、`bgAssetId`）进入 references；文件名带 `background`，所以 adapter 的 `describeSceneReferences` 会把它点名为「目标背景图」。
- 场景标题和「商品合成 / 商品替换」写进 `customPrompt`（adapter 原样写进提示词）；页签状态从 `customPrompt` 反推，不加新字段。
- 背景相似度 → `weight`；生成张数 → `outputNum`；画面尺寸 → `ratio`；拖动 / 大小 → `transform`（随 canvasData 提交）。
- 没有选参考图时，页面自己加一条拦截「请先选择参考图。」，并隐藏 registry 里与旧文字模板相关的 `templateId` / `custom-scene-missing` 两条提示。

### 前后对比

- `NEW_REPLACE_BG_V2/pair.jpg`（1600×1000 重采）：之前本地是三栏表单 + 渐变色块；现在首屏结构和原站一致，包括顶部上传白卡、示例、引导视频、场景参考图标题、搜索、排序、类目页签和每行 6 张实拍场景卡。
- 第二步自测截图（同目录）：`local-home-hover.png`（美妆个护类目 + hover「使用此场景」）、`local-step2-drawer.png`（示例 3 → 编辑器 + 参考图抽屉 + 透明商品）、`local-step2-config.png`（选「湖边-香水」→ 已选参考图、商品替换、2 张，立即生成可用，**未点击**）、`local-step2-upload-mask.png`（上传 product-watch.jpg → 抠图块 → 上传蒙版 → 确认使用 → 选「露台-火盆」）。
- 自测数据：日用百货搜「电子秤」得 2 张；美妆个护得 beauty-01~03；配置栏宽 300；slider `min=0.5 max=0.9 value=0.7`。

### 仍未收口的差异和原因

- 第二步原站隐藏站点左侧导航，进入全屏编辑器；本地外层 `WithRail` 和顶栏仍在，归 `tool-page.tsx`，我没动。
- 原站编辑器左栏的「商品 / 元素」、抽屉里的「预设 / 我的 / 收藏 / 历史 / 采集」页签和「场景：室内 / 室外…」筛选都没做：本地没有这些数据，也没有场景属性标注。
- 原站抠图编辑弹窗没有复刻（按 brief）；自己上传的图沿用 adapter 的蒙版 / 透明底门禁。
- 「高级自定义 / 保留遮挡物」没做：adapter 里没有对应字段。
- 原站画布底部的「背景调节」是缩放参考图，adapter 没有对应字段；本地改成「商品大小」（对应 `transform.scale`）。
- 原站每个类目 30~48 张场景，本地只有已落盘的 57 张；「更多 →」入口没做。
- 原站选中场景时顶部那个「下一步(2/5)」新手引导不复刻。
- 最后加的蒙版亮度预览（`maskImage`）在任务空间关闭后才加，没有重新截图。

### 测试

- `cd web && npx tsc --noEmit -p .`：无错误。
- `cd web && bun test src/features/tools/adapters/new-replace-bg-v2.test.ts src/features/tools/adapters/scene-transfer.test.ts src/features/tools/registry/registry.test.ts src/features/tools/adapters/product-scene.test.ts`：104 pass / 0 fail。
- 没有点「立即生成」，没有提交任何任务。ego-browser 空间 `agent-lf-productbg2` 已 `task.finish({ keep: [] })`。

### 给主代理的待办

1. `run-one.mjs` 的 NEW_REPLACE_BG_V2 配方已失效（我没改脚本）。新的步骤：
   - 如果草稿里有商品图，页面会直接打开第二步，需要先点 `[data-testid=scene-back]` 回到首屏；
   - 上传商品图：`[data-testid=scene-goods] input[type=file]`（不变）；
   - 抠图：`[data-testid=scene-cutout-mode-mask]`（不变）→ 直接对 `[data-testid=scene-cutout] input[type=file]` 用 setInputFiles（**不再有 `summary`，删掉那一步**）→ `[data-testid=scene-cutout-confirm]`（不变）；
   - **新增必选**：选参考图 `[data-testid=scene-drawer-<场景id>]`，例如 `scene-drawer-outdoor-02`。没有参考图时抽屉会自动打开；草稿里已有参考图时先点 `[data-testid=scene-drawer-toggle]`。然后等 `[data-testid=scene-reference-image]` 出现；
   - `scene-count-1`、`scene-generate`、`[data-testid=scene-result] img` 不变；`countSelector` 的 `scene-output-size` 现在显示的是宽高（1024 / 1024），不是张数，建议改成读 `[data-testid=scene-count-1][aria-pressed=true]`。
2. 第二步要做成原站那样的全屏编辑器（隐藏外层 rail），需要改 `tool-page.tsx`。
3. CHANGELOG / pending-test 由主代理统一补：商品图页按原站两步结构重做（首屏照片墙 + 示例 + 第二步配置栏）。
