# 资产 10｜makeType 权威枚举

> **资产来源**：[`enum_maketype.json`](../../analysis/assets/linkfox/enum_maketype.json)
> **应用位置**：原始数据阅读、type 对照、防止 `biz/type` 混用
> **数据范围**：79 个枚举，其中 39 个属于复刻范围
> **使用边界**：仅用于复刻开发与内部 A/B 基准；原站图片、模板及文案不直接进入商用资产库。

---

## 怎么用

- 这是原站 79 个 `makeType` 的权威对照，用于阅读案例、样式与抓包数据。
- 只有 39 个属于本次图片/视频复刻范围；其余枚举保留用于识别数据，不扩展需求范围。

| makeType | type | 本次复刻 |
|---|---:|---|
| `AI_DRAW` | 1 | 否 |
| `REPLACE_BG` | 2 | 否 |
| `MATTING` | 3 | 否 |
| `MJ_DRAW` | 4 | 否 |
| `SIMILAR` | 5 | 否 |
| `CUTOUT` | 6 | 否 |
| `SCALE_UP` | 7 | 是 |
| `IMG2HD` | 8 | 否 |
| `CHANGEMODEL` | 9 | 否 |
| `CHANGEBG` | 10 | 否 |
| `NEW_REPLACE_BG` | 11 | 否 |
| `REPLACE_GOODS` | 12 | 是 |
| `PRODUCT_SCENE` | 13 | 是 |
| `AI_TEXT` | 14 | 是 |
| `CHANGEMANNEQUIN` | 15 | 否 |
| `MATERIAL_UPPER_BODY` | 16 | 是 |
| `ORNAMENT_TEXT` | 17 | 是 |
| `AI_DRESSING` | 18 | 否 |
| `CHANGE_COLOR` | 19 | 是 |
| `SHADOW_MERGE` | 20 | 否 |
| `ORIGINAL_RESOLUTION` | 21 | 否 |
| `SDS_DESIGN` | 22 | 是 |
| `REMOVE_PEN` | 23 | 是 |
| `AI_DRESSING_V2` | 24 | 是 |
| `AI_OUTPAINTING` | 25 | 是 |
| `FIX_COLOR` | 26 | 是 |
| `NEW_REPLACE_BG_V2` | 28 | 是 |
| `PRINTING_REPAIR` | 29 | 是 |
| `IMAGE_TO_VIDEO` | 30 | 是 |
| `HAND_REPAIR` | 31 | 是 |
| `AREA_REPAIR` | 32 | 是 |
| `AI_WEARABLE` | 34 | 是 |
| `AI_CHANGEMODEL` | 35 | 否 |
| `AI_DRESSING_XSY` | 39 | 是 |
| `IMAGE_TRANSLATION` | 45 | 是 |
| `HANDHELD_GOODS` | 49 | 是 |
| `VIDEO_CONCAT` | 52 | 是 |
| `BM_SIMILAR` | 53 | 否 |
| `IMPROVED_IMAGE_QUALITY` | 54 | 否 |
| `IMAGE_FISSION` | 55 | 否 |
| `PRODUCT_REFINE` | 56 | 是 |
| `AI_POSE_GENERATOR` | 57 | 是 |
| `AI_POSTURE` | 58 | 是 |
| `REMOVE_LOGO` | 59 | 否 |
| `PRINT_EXTRACT` | 60 | 是 |
| `SMART_REPAIR` | 61 | 否 |
| `MULTI_IMAGE_FUSION` | 62 | 否 |
| `SCENE_TRANSFER` | 63 | 是 |
| `PRODUCT_MARKET_MATERIAL` | 64 | 是 |
| `AUTO_DRESSING` | 65 | 否 |
| `BM_PRINT_EXTRACT` | 66 | 否 |
| `IMAGE_CROP` | 67 | 是 |
| `IMAGE_TEXT_EXTRACT` | 68 | 否 |
| `DRESS_WEAR_SET` | 69 | 是 |
| `NEW_CHANGEBG` | 70 | 否 |
| `PRODUCT_IMAGE_SUITE` | 71 | 是 |
| `BATCH_IMAGE_EDIT` | 97 | 否 |
| `SALE_VIDEO` | 73 | 是 |
| `IMAGE_LAYER_EDIT` | 74 | 否 |
| `MOLI_VIDEO_EDIT` | 76 | 否 |
| `AI_VIDEO_EDITING` | 95 | 是 |
| `VIDEO_TRANSLATION` | 96 | 是 |
| `IMAGE_TEXT_EDIT` | 78 | 是 |
| `FISSION_LINK` | 83 | 是 |
| `REPLICATE_LINK` | 85 | 否 |
| `AGENTOS_IMAGE_GEN` | 86 | 否 |
| `AGENTOS_VIDEO_GEN` | 87 | 否 |
| `VIDEO_REPLICATION` | 89 | 是 |
| `PRODUCT_LIBRARY_MATERIAL` | 91 | 否 |
| `PRODUCT_LIBRARY_WEAR` | 92 | 否 |
| `NEW_DESIGNER` | 99 | 是 |
| `AGENT_DESIGN` | 100 | 否 |
| `AGENT_DESIGN_MULTI` | 101 | 否 |
| `AGENT_CLOTH_COLLECTION` | 102 | 否 |
| `AGENT_PRODUCT_COLLECTION` | 103 | 否 |
| `IMAGE_REPLICATION` | 88 | 否 |
| `CHANGE_COLOR_V2` | 93 | 是 |
| `BATCH_GENERATE_VIDEOS` | 106 | 否 |
| `VIDEO_PUBLISH` | 201 | 否 |
