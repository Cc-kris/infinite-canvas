# agent-lf-design：商品图设计 / 模特族视觉收口

负责：PRODUCT_SCENE、HANDHELD_GOODS、AI_DRESSING_V2、AI_POSTURE、AI_WEARABLE、PRINT_EXTRACT、SDS_DESIGN。7 页代码已改完，本地截图已重采，`pair.jpg` 已更新。

## 原站实测（1600×1000，ego-browser 只读，未点生成）

- 上传卡 `_uploadPanel`：268 宽，#f7f7f7 灰底，8px 圆角，10px 内边距。虚线框 `_uploadBox` 248×196，内边距 16，顶部是 40px 紫色图片图标，下面依次是标题、从本地上传 / 作品库 / 商品库按钮组、限制提示。
- 「或试试这些」：分隔线 174 宽，文字 12px、30% 黑；下面 4 张 40×40 示例图，间距 20，居中。
- 行卡（选择手持姿势 / 穿衣模特 / 姿势 / 商品品类 / 穿戴模特）：灰底，1px #e8e8e8 边，6px 圆角，10px 内边距；左侧缩略图（88×100 / 59×79 / 60×60 / 58×58 等）；标题 14px，说明 12px #9e9e9e；右侧箭头。
- 结果区案例轮播 `_caseItemWrap`：每张图 235×352；参数图之间 2px，末张参数图与结果图之间 40px；图片顶边距卡片顶边 54px，卡片内边距 16；标题 20px；「一键做同款」110×40，渐变底。
- 印花提取 / 素材贴合的空态是引导视频（`guide-print-extract.mp4` 460×300、`guide-sdsdesign.mp4` 500×282），不是静态图。

## 改动文件

- 新建 `web/src/components/tools/workspaces/design-demo.tsx`，放 7 页共用的原站结构：
  - `TryDemoStrip`（「或试试这些」，点击后真实入库）
  - `DesignRowCard`（行卡）
  - `UploadPanelIcon`（上传卡图标）
  - 样式常量：`DESIGN_UPLOAD_PANEL` / `DESIGN_UPLOAD_DROPZONE`（196 高虚线框；已上传的图铺在框内预览，不在卡下另列文件列表）、`DESIGN_OUTLINE_BUTTON`、`DESIGN_GUIDE_PORTRAIT`（把 ToolCaseGuide 改成原站 235×352 竖图几何）
- `tool-cases-data.ts` 末尾追加：`PRODUCT_SCENE_GUIDE_CASES`、`AI_DRESSING_GUIDE_CASES`、`AI_WEARABLE_GUIDE_CASES`、`HANDHELD_GOODS_GUIDE_CASES`、`AI_POSTURE_GUIDE_CASES`、`DESIGN_TRY_DEMOS`、`PRINT_EXTRACT_GUIDE_VIDEO`、`SDS_DESIGN_GUIDE_VIDEO`。
- 新增素材，全部从原站同源下载，没有占位图：
  - `web/public/__cases/handheld-goods/`（4 张示例 + 1 组案例）
  - `ai-posture/`（4 张示例 + 1 组案例）
  - `print-extract/`（4 张示例 + guide.mp4）
  - `sds-design/guide.mp4`
  - `design-common/`（icon-feature、style_* 三张生图模型缩略图、image_general）
  - `ai-dressing/try-*`、`ai-wearable/try-*`
- 工作区：
  - `scene-fission.tsx`
  - `handheld-goods.tsx`
  - `dressing.tsx`
  - `model.tsx`：只改了 `AiPostureWorkspace` 和只有它在用的 `SegmentedButton`
  - `dress.tsx`：只改了 `AiWearableWorkspace` 和只有它在用的 `PickerCard`；共用的 `Section` 没动
  - `extract.tsx`
  - `pod.tsx`：只改了 `SdsDesignWorkspace`
- 测试断言按原站真实文案和结构更新：`handheld-goods.test.ts`、`ai-posture.test.ts`、`dressing-layout.test.tsx`、`pod.test.tsx`。

生成逻辑和请求字段都没改。原站首屏没有、但会参与提交的字段都收进了默认折叠的「更多设置」，一个都没删：
- 手持商品：场景类型 / 检测类型
- 姿势裂变：图片标签 / 裂变计划 / 补充描述 / 快照
- AI 穿戴：商品蒙版 / 模特蒙版
- 素材贴合：素材名

## 每个工具前后对比

| 工具 | 改前 | 改后（看 pair.jpg） |
|---|---|---|
| PRODUCT_SCENE | 结果空态是小白卡；生图模型缩略图是渐变块；页签栏多一个「一键做同款」 | 两行标题 + 竖图案例轮播（2 组，分页点）；生图模型换成原站缩略图，选中时打勾；智能模式显示黄色提示框，隐藏滑块；描述链接移到标题行右侧，字数计数放进输入框；「上传多图」改成描述按钮；去掉页签栏的「一键做同款」；修复无草稿时默认模型被改回「写实」的问题（原站默认「智能」） |
| HANDHELD_GOODS | 平铺手部页签和姿势条；场景类型 / 检测类型常驻 | 上传卡内有「或试试这些」4 图；「选择手持姿势」行卡点开才出现部位和姿势；场景 / 检测收进折叠；结果区是三图案例轮播，「一键做同款」真实入库商品图 |
| AI_DRESSING_V2 | 每个槽位一张描边卡；结果区是 4 张小缩略图 | 上下装虚线框在同一张灰底卡里；「或试试这些」用原站上装 / 下装平铺图，按图的类型落到对应槽位；「上传多件衣服」是描边按钮（本地不支持，置灰并给出原因）；模特改为行卡；结果区是三图轮播（2 组） |
| AI_POSTURE | 上传卡挤着标签、示例 chip、撤销按钮；姿势库 / 自定义藏在行卡里面 | 上传卡结构与原站一致，含 4 张示例；「姿势库 \| 自定义」页签放在行卡上方；标签、计划、描述、快照收进「更多设置」；结果区是三图轮播 |
| AI_WEARABLE | 上传卡下面平铺文件列表；新手引导以内联条形式出现；两段蒙版微调平铺 | 上传卡是单一入口（已上传的图在框内预览）；「或试试这些」用原站示例图；品类 / 模特改为原站灰底行卡；Tips 关键词高亮；蒙版收进「更多设置」；去掉内联引导条；结果区是三图轮播 |
| PRINT_EXTRACT | 结果空态是小白卡；示例位是 4 个空图标 | 空态是原站引导视频（卫衣 → 印花）+ 标题 + 说明；示例换成原站 4 张真实图，点击入库；上传按钮和透明图开关按原站样式 |
| SDS_DESIGN | 舞台空态是占位图标；生成按钮挤在素材操作行里 | 舞台空态是原站引导视频 + 渐变「上传素材」按钮；产品 / 选择颜色 / 素材操作三张卡按原站样式；立即生成是整宽 277×32 渐变按钮；素材名收进折叠；结果列铺满整列高度，空态居中 |

## 仍未收口的差异

1. **ToolCaseGuide 的几何。** 共享组件默认是 352 方图 + 结果占余宽，三图案例会被挤扁。我在 `design-demo.tsx` 的 `DESIGN_GUIDE_PORTRAIT` 里用选择器覆盖了几何，部分规则加了 `!` 才生效，`tool-case-guide.tsx` 本身没改。建议主代理把竖图几何做成 ToolCaseGuide 的正式变体，再删掉这个覆盖常量。
2. **AI_DRESSING_V2 截图里残留旧草稿。** 本地截图配置列有绿色 probe 图和「上装还没标记穿衣区域」提示，来自浏览器里以前的测试草稿，不是代码差异（VISUAL-PARITY.md 已说明这类情况）。我没有清用户的本地数据。
3. **AI_WEARABLE 案例换了一组。** 原站轮播首张商品图 403，原站自己也显示「图片加载失败」，所以改用本地已落盘的同工具案例 `1955579942177386496`，案例内容和原站不同。
4. **手持商品 / 姿势裂变的「一键做同款」只回填部分内容。** 只入库商品图 / 模特图并套用张数。原站的「选择参考图」是原站姿势库里的图，本地姿势是 registry 示意图，对不上，因此手持商品用首个本地姿势，姿势裂变走自动裂变。
5. **PRINT_EXTRACT 顶部多一行「撤销 / 重做」。** 这一行来自 `ToolShell` 的 actions，原站没有。这是功能入口，我保留了，是否去掉请主代理决定。
6. **原站的营销 / 壳层元素没有复刻。** 包括「第一步…」引导气泡、上传卡与结果区之间的紫色小圆点连接符、算力文案。
7. **品类行卡缩略图是通用图。** 原站按所选品类换缩略图（如帽子图），本地没有各品类的图，固定用原站通用图 `image_general`。

## 测试

- `cd web && npx tsc --noEmit -p .`：我的文件没有错误。运行期间出现过别的子任务文件的错误：`outpaint.tsx`（后来已恢复）、`ai-pose-generator.tsx` 的 `taskId`、`mask.tsx(954)` 的 JSX 闭合，我没有去修。
- `cd web && bun test src/components/tools/workspaces/dressing-layout.test.tsx src/components/tools/workspaces/pod.test.tsx src/features/tools/adapters/{ai-posture,handheld-goods,product-scene,ai-wearable,material-upper-body,print-extract}.test.ts`：176 pass / 0 fail。
- 截图：用 `/tmp/agent-lf-design-capture.mjs`（SIDES=["local"]，SPACE=agent-lf-design）重采 7 页，再用 `visual-parity-pair.py` 生成 pair.jpg 并逐张看过。期间 dev server 曾因别的子任务改坏 `image-text-edit.tsx` / `outpaint.tsx` 返回 500，等恢复后才完成采集。任务空间已 `finish({ keep: [] })`。
