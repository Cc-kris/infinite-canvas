# 原站基线可信度核验

由 `web/scripts/real-acceptance/original-baseline-audit.mjs` 生成。路由表在登录态下逐页点击侧栏并读取页面正文确认；未登录访问会被重定向首页，不能用 `/draw/<本地slug>` 自动探测。

## 结论：31/39 页可做 1:1 对照

| 工具 | 名称 | 原站路由 | 原站页面 | 有 original.png |
|---|---|---|---|---|
| PRODUCT_IMAGE_SUITE | 商品套图 | `/draw/product-image-suite` | 商品套图 | 有 |
| DRESS_WEAR_SET | 服装套图 | `/draw/clothing-image-suite` | 服装套图 | 有 |
| CHANGE_COLOR_V2 | 套图换色 | `/draw/change-color-v2` | 套图换色 | 有 |
| IMAGE_TRANSLATION | 批量翻译 | `/draw/image-translation` | 图片翻译 | 有 |
| SCALE_UP | 高清放大 | `/draw/quality-increase` | 高清放大 | 有 |
| AI_OUTPAINTING | 智能扩图 | `/draw/ai-outpainting` | 智能扩图 | 有 |
| AREA_REPAIR | 局部重绘 | `/draw/area-repair` | 局部重绘 | 有 |
| REMOVE_PEN | 局部消除 | `/draw/remove-pen` | 局部消除 | 有 |
| CHANGE_COLOR | 一键换色 | `/draw/change-color` | 一键换色 | 有 |
| IMAGE_CROP | 图片裁剪 | `/draw/image-crop` | 图片裁剪 | 有 |
| PRODUCT_REFINE | 商品精修 | `/draw/product-refine` | 商品精修 | 有 |
| FIX_COLOR | 色差修复 | `/draw/color-diff-repair` | 色差修复 | 有 |
| PRINTING_REPAIR | 印花修复 | `/draw/printing-repair` | 印花修复 | 有 |
| HAND_REPAIR | 手部修复 | `/draw/hand-repair` | 手部修复（原站标即将下架） | 有 |
| NEW_REPLACE_BG_V2 | 商品图 | `/draw/product-home` | 商品图合成（侧栏「商品图」） | 有 |
| REPLACE_GOODS | 商品替换 | `/draw/product-replacement` | 商品替换 | 有 |
| PRODUCT_SCENE | 场景裂变 | `/draw/product-scene` | 场景裂变 | 有 |
| HANDHELD_GOODS | 手持商品 | `/draw/handheld-goods` | 手持商品（标题为站点通用标题，正文为工具页） | 有 |
| AI_DRESSING_V2 | AI穿衣 | `/draw/ai-dressing` | AI穿衣 | 有 |
| AI_POSTURE | 姿势裂变 | `/draw/ai-posture` | 姿势裂变 | 有 |
| AI_WEARABLE | AI穿戴 | `/draw/ai-wearable` | AI穿戴 | 有 |
| SDS_DESIGN | 素材贴合 | `/draw/sds-design` | 素材贴合 | 有 |
| PRINT_EXTRACT | 印花提取 | `/draw/print-extract` | 印花提取 | 有 |
| IMAGE_TEXT_EDIT | 图片文字编辑 | `/designer?type=78` | 商品图设计编辑器（文字/素材/背景/图层） | 有 |
| NEW_DESIGNER | 商品图设计器 | `/draw/designer-home` | 创建设计 | 有 |
| IMAGE_TO_VIDEO | 图转视频 | `/draw/video` | 商品视频（参考素材/首尾帧/商品链接） | 有 |
| SALE_VIDEO | 带货口播 | `/draw/sale-video` | 带货视频 | 有 |
| VIDEO_REPLICATION | 视频复刻 | `/draw/video-replication` | 视频复刻 | 有 |
| AI_VIDEO_EDITING | 视频编辑 | `/draw/ai-video-edit` | 视频编辑 | 有 |
| VIDEO_TRANSLATION | 视频翻译 | `/draw/video-translation` | 视频翻译 | 有 |
| VIDEO_CONCAT | 视频拼接 | `/draw/video-edit` | 视频剪辑（待字段级确认） | 有 |

## 原站存在但本账号不可见（3）

- AI_TEXT POD素材：POD素材：本账号访问重定向（/draw/ai-text → /home，侧栏点击回到场景素材）
- ORNAMENT_TEXT 饰品文字：饰品文字：本账号访问 /draw/ornament-text 重定向首页
- PRODUCT_MARKET_MATERIAL 商品营销素材：仅批量生图 create-task 入口，需团队版账号，个人账号重定向批量首页

## 原站无独立页面（5）

- AI_POSE_GENERATOR AI姿势生成：只在 AIDressingV2 chunk 内出现，AI穿衣页无对应入口
- AI_DRESSING_XSY AI试衣XSY：只在 AIDressingV2 chunk 内出现，AI穿衣页无对应入口
- FISSION_LINK 场景裂变链接：只在 LinkCard 分享卡片中出现，无工具页
- MATERIAL_UPPER_BODY 上装换料：只在 PreviewModal 中出现，/draw/material-upper-body 404
- SCENE_TRANSFER 场景迁移：只有 SceneTransfer 组件，/draw/scene-transfer 404

## 说明

- 上一版用本地 slug 探测，把服装套图、高清放大、色差修复、商品图、商品替换、AI穿衣、图转视频、视频编辑、商品图设计器、视频拼接、图片文字编辑共 11 页误判为不可对照。
- `_INVALID-BASELINE/` 中这些页面的旧截图是按错误 URL 截的（首页/404），不能直接恢复，需按上表路由重新采集。
