# design19 后 9 工具 · 优秀案例 1:1 核对（工作笔记）

日期：2026-10-29　范围：registry index 25–33

| idx | id | 原站 | 本地路由 |
|---|---|---|---|
|25|PRINT_EXTRACT|/draw/print-extract|/tools/product-design/print-extract|
|26|AI_POSE_GENERATOR|/draw/ai-posture|/tools/product-design/ai-pose-generator|
|27|AI_DRESSING_XSY|/draw/ai-dressing|/tools/product-design/ai-dressing-xsy|
|28|FISSION_LINK|/draw/product-scene?type=2|/tools/product-design/fission-link|
|29|IMAGE_TEXT_EDIT|/draw/designer-home|/tools/product-design/image-text-edit|
|30|MATERIAL_UPPER_BODY|/draw/clothing-image-suite|/tools/product-design/material-upper-body|
|31|NEW_DESIGNER|/draw/designer-home|/tools/product-design/new-designer|
|32|PRODUCT_MARKET_MATERIAL|/draw/product-image-suite?batchType=PRODUCT_MATERIAL|/tools/product-design/product-market-material|
|33|SCENE_TRANSFER|/draw/product-scene?type=2（私有 B2B，最近参照）|/tools/product-design/scene-transfer|

## 真实 DOM 事实（2026-10-29 实拍）

### FISSION_LINK（/draw/product-scene?type=2）
- 右栏 tab 三枚：`生成结果` / `优秀案例` / `历史记录`（ant-tabs，优秀案例 tab x≈573,y≈130，56×22）。
- `生成结果`（空态）为 slick 轮播：每 slide = 左「上传商品场景参考图」+ 右「生成结果」两图 + 紫色主按钮「一键做同款」；类名 `_caseItem_`/`_itemWrap_`/`_label_`/`_caseBtn_`；轮播底部分页 1/2。
- `优秀案例` 为**瀑布流画廊**：`_content_`（padding 16px 32px）→ `_wrapper_`（绝对定位）→ 20 个 `_imageBox_` 卡片。
  - 每卡：结果图 `img`（oss 512，`alt=优秀案例-<caseId>`，`data-image-id`）+ 悬停 `_mask_`（眼睛图标+「预览」）+ 底部 `_opera_`：`_paramInfo_`（「原图」+64×64 源图缩略）+ 按钮「做同款」（ant-btn-default）。
  - 无标题文案、无分页（滚动加载 20 条）。
- 数据源：`https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/<id>/main_result_*.webp`（结果）、`.../image.*`（原图）。

## 待办
- [ ] 其余 8 个工具逐页确认是否存在「优秀案例」tab（text.txt 只含默认 tab，不能据此判定）
- [ ] 记录每工具案例数量/封面/标题/按钮/位置
- [ ] 本地实现 + 真实点击 + 截图 + 测试 + typecheck + 提交
