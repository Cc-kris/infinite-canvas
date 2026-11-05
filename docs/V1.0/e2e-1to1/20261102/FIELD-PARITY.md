# 规格字段契约一致性核验

由 `web/scripts/real-acceptance/spec-field-parity.mjs` 生成，不依赖原站登录，可随时复跑。

## 方法

规格侧：从 `page-specs/<num>-<slug>.md` 的字段表抽取（精确匹配 `<num>-<slug>.md`，避免 `change-color` 命中 `change-color-v2`）。

实现侧按优先级取两种来源：
1. **运行时调用** `build*Fields(values)` 纯函数，直接拿到真实请求字段（最可靠，当前覆盖 3 页）；
2. **静态常量** `*_FIELD_KEYS` / `*_FIELDS` / `*_FIELD_ORDER`（覆盖其余可解析页面）。

条件字段（`if (...) fields.x = ...`，只有用户填了值才提交）单独识别，不判为缺失。

## 结果：18 页字段契约一致，0 页存在差异

| 工具 |
|---|
| CHANGE_COLOR |
| REPLACE_GOODS |
| AI_DRESSING_V2 |
| AI_POSTURE |
| AI_WEARABLE |
| AI_TEXT |
| ORNAMENT_TEXT |
| SDS_DESIGN |
| AI_POSE_GENERATOR |
| AI_DRESSING_XSY |
| FISSION_LINK |
| IMAGE_TEXT_EDIT |
| NEW_DESIGNER |
| SCENE_TRANSFER |
| IMAGE_TO_VIDEO |
| SALE_VIDEO |
| VIDEO_TRANSLATION |
| VIDEO_CONCAT |

## 无法自动比对（21 页）

实现未声明字段常量、也没有可无副作用调用的 `build*Fields`，脚本给不出结论。
**这不等于通过，也不等于有问题。**

| 工具 |
|---|
| PRODUCT_IMAGE_SUITE |
| DRESS_WEAR_SET |
| CHANGE_COLOR_V2 |
| IMAGE_TRANSLATION |
| SCALE_UP |
| AI_OUTPAINTING |
| AREA_REPAIR |
| REMOVE_PEN |
| IMAGE_CROP |
| PRODUCT_REFINE |
| FIX_COLOR |
| PRINTING_REPAIR |
| HAND_REPAIR |
| NEW_REPLACE_BG_V2 |
| PRODUCT_SCENE |
| HANDHELD_GOODS |
| PRINT_EXTRACT |
| MATERIAL_UPPER_BODY |
| PRODUCT_MARKET_MATERIAL |
| VIDEO_REPLICATION |
| AI_VIDEO_EDITING |

## 已知的判据陷阱（都已修）

1. 用 `includes` 匹配规格文件名 → `change-color` 命中 `change-color-v2`，误报 14 个多余字段；
2. 只认 `_FIELD_KEYS` → 漏掉 `_FIELDS`/`_FIELD_ORDER`，31 页被误判「无字段」；
3. 条件字段正则 `[^)]*` 在 `values.styles.trim()` 处提前结束 → 3 个按需提交字段被误报缺失。

这三次都是检测工具自身的问题，不是产品缺陷。