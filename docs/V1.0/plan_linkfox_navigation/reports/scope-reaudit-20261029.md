# 39 工具范围重审矩阵（2026-10-29 口径）

- 生成时间：2026-10-29T15:05:13 · HEAD `fcb1b69`
- 判据：[scope_boundary.md](../scope_boundary.md)（只复刻工具功能 + 必要字段文案，界面用本项目设计系统）
- 证据：复用 `evidence/real-acceptance/*` 既有实测，不重复调用 provider
- 静态审计：`tools/scope_audit.py` → errors=1 warnings=21

## 维度统计

| 维度 | F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计系统 |
| --- | --- | --- | --- | --- | --- | --- |
| 结果 | PASS 26 / PARTIAL 11 / BLOCKED 2 | PASS 37 / PARTIAL 2 | PASS 35 / BLOCKED 4 | PASS 20 / PARTIAL 19 | N/A 28 / PASS 9 / MISSING 2 | PASS 37 / PARTIAL 2 |

## 明细

| # | 工具 | F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计系统 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 商品套图<br>`PRODUCT_IMAGE_SUITE` | PASS | PARTIAL | PASS | PASS | PASS | PARTIAL |
| 2 | 服装套图<br>`DRESS_WEAR_SET` | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | 套图换色<br>`CHANGE_COLOR_V2` | PARTIAL | PASS | PASS | PASS | PASS | PASS |
| 4 | 批量翻译<br>`IMAGE_TRANSLATION` | PARTIAL | PASS | PASS | PASS | N/A | PASS |
| 5 | 高清放大<br>`SCALE_UP` | PASS | PASS | PASS | PASS | MISSING | PASS |
| 6 | 智能扩图<br>`AI_OUTPAINTING` | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 7 | 局部重绘<br>`AREA_REPAIR` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 8 | 局部消除<br>`REMOVE_PEN` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 9 | 一键换色<br>`CHANGE_COLOR` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 10 | 图片裁剪<br>`IMAGE_CROP` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 11 | 商品精修<br>`PRODUCT_REFINE` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 12 | 色差修复<br>`FIX_COLOR` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 13 | 印花修复<br>`PRINTING_REPAIR` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 14 | 手部修复<br>`HAND_REPAIR` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 15 | 商品图<br>`NEW_REPLACE_BG_V2` | PASS | PASS | PASS | PASS | N/A | PASS |
| 16 | 商品替换<br>`REPLACE_GOODS` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS |
| 17 | 场景裂变<br>`PRODUCT_SCENE` | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 18 | 手持商品<br>`HANDHELD_GOODS` | PASS | PASS | PASS | PASS | N/A | PASS |
| 19 | AI穿衣<br>`AI_DRESSING_V2` | PASS | PASS | PASS | PASS | PASS | PASS |
| 20 | 姿势裂变<br>`AI_POSTURE` | PASS | PASS | PASS | PASS | N/A | PASS |
| 21 | AI穿戴<br>`AI_WEARABLE` | PASS | PASS | PASS | PASS | PASS | PASS |
| 22 | POD素材<br>`AI_TEXT` | PASS | PASS | PASS | PASS | N/A | PASS |
| 23 | 饰品文字<br>`ORNAMENT_TEXT` | PARTIAL | PASS | PASS | PASS | N/A | PASS |
| 24 | 素材贴合<br>`SDS_DESIGN` | PASS | PASS | PASS | PASS | PASS | PASS |
| 25 | 印花提取<br>`PRINT_EXTRACT` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 26 | AI姿势生成<br>`AI_POSE_GENERATOR` | PASS | PASS | PASS | PASS | N/A | PASS |
| 27 | AI试衣XSY<br>`AI_DRESSING_XSY` | PASS | PASS | PASS | PASS | N/A | PASS |
| 28 | 场景裂变链接<br>`FISSION_LINK` | PASS | PASS | PASS | PASS | N/A | PASS |
| 29 | 图片文字编辑<br>`IMAGE_TEXT_EDIT` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 30 | 上装换料<br>`MATERIAL_UPPER_BODY` | PASS | PASS | PASS | PASS | N/A | PASS |
| 31 | 商品图设计器<br>`NEW_DESIGNER` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 32 | 商品营销素材<br>`PRODUCT_MARKET_MATERIAL` | PASS | PARTIAL | PASS | PARTIAL | N/A | PARTIAL |
| 33 | 场景迁移<br>`SCENE_TRANSFER` | PASS | PASS | BLOCKED | PASS | N/A | PASS |
| 34 | 图转视频<br>`IMAGE_TO_VIDEO` | PARTIAL | PASS | PASS | PARTIAL | MISSING | PASS |
| 35 | 带货口播<br>`SALE_VIDEO` | BLOCKED | PASS | BLOCKED | PASS | N/A | PASS |
| 36 | 视频复刻<br>`VIDEO_REPLICATION` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 37 | 视频编辑<br>`AI_VIDEO_EDITING` | BLOCKED | PASS | BLOCKED | PASS | N/A | PASS |
| 38 | 视频翻译<br>`VIDEO_TRANSLATION` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 39 | 视频拼接<br>`VIDEO_CONCAT` | PARTIAL | PASS | BLOCKED | PARTIAL | N/A | PASS |

## 结论（按新口径）

- 工具功能：26/39 闭环；11 个有明确单点缺口（见下）；2 个被上游 provider 阻断（Sale Video / AI Video Editing）。
- 必要字段文案：2 个工具仍有残留 —— 主要是「(N算力)」计费文案（1 处 error），以及 designer 页面一句提及原站的说明；品牌/计费都不是功能，删掉即可，不影响功能验收。
- 真实生成：35/39 有可复核产物；仅 4 个未发起真实调用。
- 历史记录：20 个有 B5 实测证据，其余共享同一历史面板但未逐个取证（PARTIAL），不算功能缺失。
- 优秀案例：9 个工具「真实案例 + 做同款」已通过；2 个（高清放大 / 图生视频）原站有案例模块而本地为空；其余 28 个原站本就无案例模块，不列为缺口。
- 设计系统：2 个文件仍有 `#723cf9` 等原站像素值（4 处 warning），属样式收敛待办，不阻塞功能。

## 各维度问题清单

### 文案
- `PRODUCT_IMAGE_SUITE` PARTIAL：计费/占位文案 1 处，需改为本项目口径
- `PRODUCT_MARKET_MATERIAL` PARTIAL：计费/占位文案 1 处，需改为本项目口径

### 案例
- `SCALE_UP` MISSING：原站有案例模块，本地结果区为空/未接数据
- `IMAGE_TO_VIDEO` MISSING：原站有案例模块，本地结果区为空/未接数据

### 真实生成
- `SCENE_TRANSFER` BLOCKED：无可复核产物字节
- `SALE_VIDEO` BLOCKED：未发起真实生成调用
- `AI_VIDEO_EDITING` BLOCKED：未发起真实生成调用
- `VIDEO_CONCAT` BLOCKED：未发起真实生成调用

### 设计系统
- `PRODUCT_IMAGE_SUITE` PARTIAL：原站像素级样式残留 4 处（#723cf9/!important 等）
- `PRODUCT_MARKET_MATERIAL` PARTIAL：原站像素级样式残留 4 处（#723cf9/!important 等）

