> 状态：文档基线，**本轮未修改代码**。日期：2026-10-27。  
> 事实来源：`schema_final.json`、真实 `workbench-0vHvVyx6.js`、五类页面 DOM；推断与补充关系均单独标注。

# 五类导航与 39 工具唯一规格矩阵

**证据语义**：original 仅表示 type 出现在原站 draw 侧栏数组；一级分类归属是本项目 canonical 决策。supplemental 表示不在五类 draw 菜单；推荐/历史筛选/类型集合中的 JS 引用不等于菜单证据。VIDEO_CONCAT 不得与 MOLI_VIDEO_EDIT 混同。

本文件是 PRD/UI/技术/测试/任务的共享事实源。39 个工具有唯一主分类；批量生图是编排入口，引用已有工具，不新增第 40 个工具。

| # | 一级分类 | 工具 | type | 路由 | 关系 | 批量引用 |
|---:|---|---|---|---|---|---|
| 1 | 电商套图 | 商品套图 | `PRODUCT_IMAGE_SUITE` | `/tools/ecommerce-suite/product-image-suite` | 原站 | 是 |
| 2 | 电商套图 | 服装套图 | `DRESS_WEAR_SET` | `/tools/ecommerce-suite/dress-wear-set` | 原站 | 是 |
| 3 | 电商套图 | 套图换色 | `CHANGE_COLOR_V2` | `/tools/ecommerce-suite/change-color-v2` | 原站 | 否 |
| 4 | 电商套图 | 批量翻译 | `IMAGE_TRANSLATION` | `/tools/ecommerce-suite/image-translation` | 原站 | 是 |
| 5 | 电商套图 | 高清放大 | `SCALE_UP` | `/tools/ecommerce-suite/scale-up` | 原站 | 是 |
| 6 | 电商套图 | 智能扩图 | `AI_OUTPAINTING` | `/tools/ecommerce-suite/ai-outpainting` | 原站 | 是 |
| 7 | 智能修图 | 局部重绘 | `AREA_REPAIR` | `/tools/smart-edit/area-repair` | 原站 | 是 |
| 8 | 智能修图 | 局部消除 | `REMOVE_PEN` | `/tools/smart-edit/remove-pen` | 原站 | 否 |
| 9 | 智能修图 | 一键换色 | `CHANGE_COLOR` | `/tools/smart-edit/change-color` | 原站 | 是 |
| 10 | 智能修图 | 图片裁剪 | `IMAGE_CROP` | `/tools/smart-edit/image-crop` | 原站 | 是 |
| 11 | 智能修图 | 商品精修 | `PRODUCT_REFINE` | `/tools/smart-edit/product-refine` | 原站 | 是 |
| 12 | 智能修图 | 色差修复 | `FIX_COLOR` | `/tools/smart-edit/fix-color` | 原站 | 否 |
| 13 | 智能修图 | 印花修复 | `PRINTING_REPAIR` | `/tools/smart-edit/printing-repair` | 原站 | 否 |
| 14 | 智能修图 | 手部修复 | `HAND_REPAIR` | `/tools/smart-edit/hand-repair` | 原站 | 否 |
| 15 | 商品图设计 | 商品图 | `NEW_REPLACE_BG_V2` | `/tools/product-design/new-replace-bg-v2` | 原站 | 否 |
| 16 | 商品图设计 | 商品替换 | `REPLACE_GOODS` | `/tools/product-design/replace-goods` | 原站 | 否 |
| 17 | 商品图设计 | 场景裂变 | `PRODUCT_SCENE` | `/tools/product-design/product-scene` | 原站 | 是 |
| 18 | 商品图设计 | 手持商品 | `HANDHELD_GOODS` | `/tools/product-design/handheld-goods` | 原站 | 否 |
| 19 | 商品图设计 | AI穿衣 | `AI_DRESSING_V2` | `/tools/product-design/ai-dressing-v2` | 原站 | 否 |
| 20 | 商品图设计 | 姿势裂变 | `AI_POSTURE` | `/tools/product-design/ai-posture` | 原站 | 否 |
| 21 | 商品图设计 | AI穿戴 | `AI_WEARABLE` | `/tools/product-design/ai-wearable` | 原站 | 否 |
| 22 | 商品图设计 | POD素材 | `AI_TEXT` | `/tools/product-design/ai-text` | 原站 | 是 |
| 23 | 商品图设计 | 饰品文字 | `ORNAMENT_TEXT` | `/tools/product-design/ornament-text` | 原站 | 否 |
| 24 | 商品图设计 | 素材贴合 | `SDS_DESIGN` | `/tools/product-design/sds-design` | 原站 | 否 |
| 25 | 商品图设计 | 印花提取 | `PRINT_EXTRACT` | `/tools/product-design/print-extract` | 原站 | 否 |
| 26 | 商品图设计 | AI姿势生成 | `AI_POSE_GENERATOR` | `/tools/product-design/ai-pose-generator` | 补充 | 否 |
| 27 | 商品图设计 | AI试衣XSY | `AI_DRESSING_XSY` | `/tools/product-design/ai-dressing-xsy` | 补充 | 否 |
| 28 | 商品图设计 | 场景裂变链接 | `FISSION_LINK` | `/tools/product-design/fission-link` | 补充 | 否 |
| 29 | 商品图设计 | 图片文字编辑 | `IMAGE_TEXT_EDIT` | `/tools/product-design/image-text-edit` | 补充 | 否 |
| 30 | 商品图设计 | 上装换料 | `MATERIAL_UPPER_BODY` | `/tools/product-design/material-upper-body` | 补充 | 否 |
| 31 | 商品图设计 | 商品图设计器 | `NEW_DESIGNER` | `/tools/product-design/new-designer` | 补充 | 否 |
| 32 | 商品图设计 | 商品营销素材 | `PRODUCT_MARKET_MATERIAL` | `/tools/product-design/product-market-material` | 补充 | 否 |
| 33 | 商品图设计 | 场景迁移 | `SCENE_TRANSFER` | `/tools/product-design/scene-transfer` | 补充 | 否 |
| 34 | AI视频 | 图转视频 | `IMAGE_TO_VIDEO` | `/tools/ai-video/image-to-video` | 原站 | 是 |
| 35 | AI视频 | 带货口播 | `SALE_VIDEO` | `/tools/ai-video/sale-video` | 原站 | 否 |
| 36 | AI视频 | 视频复刻 | `VIDEO_REPLICATION` | `/tools/ai-video/video-replication` | 原站 | 否 |
| 37 | AI视频 | 视频编辑 | `AI_VIDEO_EDITING` | `/tools/ai-video/ai-video-editing` | 原站 | 否 |
| 38 | AI视频 | 视频翻译 | `VIDEO_TRANSLATION` | `/tools/ai-video/video-translation` | 原站 | 否 |
| 39 | AI视频 | 视频拼接 | `VIDEO_CONCAT` | `/tools/ai-video/video-concat` | 补充 | 否 |

## 原站非 39 类型入口

`SMART_REPAIR`、`MATTING`、`IMAGE_REPLICATION`、`BATCH_GENERATE_VIDEOS`、`MOLI_VIDEO_EDIT` 等不得混入 39 工具注册表。若后续复刻，作为独立页面契约，不占用本矩阵编号。

## 批量生图引用

批量入口展示：商品套图、服装套图、批量翻译、高清放大、智能扩图、局部重绘、一键换色、图片裁剪、商品精修、场景裂变、POD素材、图转视频。跳转到工具 canonical route 并带 `mode=batch`，共享工具定义但独立保存批量任务。