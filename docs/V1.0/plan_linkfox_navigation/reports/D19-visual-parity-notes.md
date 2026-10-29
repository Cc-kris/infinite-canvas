# D19 前10工具视觉 1:1 工作笔记（2026-10-29）

## 范围（注册表 index 15-24 / product-design）
| idx | id | 原站 URL | 本地路由 |
|---|---|---|---|
|15|NEW_REPLACE_BG_V2 商品图|https://www.linkfox.com/draw/product-home|/tools/product-design/new-replace-bg-v2|
|16|REPLACE_GOODS 商品替换|/draw/product-replacement|/tools/product-design/replace-goods|
|17|PRODUCT_SCENE 场景裂变|/draw/product-scene?type=2|/tools/product-design/product-scene|
|18|HANDHELD_GOODS 手持商品|/draw/handheld-goods|/tools/product-design/handheld-goods|
|19|AI_DRESSING_V2 AI穿衣|/draw/ai-dressing|/tools/product-design/ai-dressing-v2|
|20|AI_POSTURE 姿势裂变|/draw/ai-posture|/tools/product-design/ai-posture|
|21|AI_WEARABLE AI穿戴|/draw/ai-wearable|/tools/product-design/ai-wearable|
|22|AI_TEXT POD素材|/draw/ai-text|/tools/product-design/ai-text|
|23|ORNAMENT_TEXT 饰品文字|/draw/ornament-text|/tools/product-design/ornament-text|
|24|SDS_DESIGN 素材贴合|/draw/sds-design|/tools/product-design/sds-design|

## 采集
- 脚本 `docs/V1.0/plan_linkfox_navigation/tools/capture_design19.py`（复用 capture_parity 函数），manifest `tools/design19_manifest.json`
- 产物 `evidence/design19-visual-parity-20261029/{real,local}/<ID>/{shot.jpg,shot-full.jpg,form.json,text.txt}`，viewport 1908x781，均已实测 ready。
- 对比脚本 `tools/parity_diff.py <ID>`。

## 关键事实
- 原站页面自带左侧子导航（商品图/我的商品/场景参考图/商品替换/场景裂变/手持商品/历史记录/企业功能/批量生图）+ 右侧水印分组面板；本地是全局左侧 39 工具导航（另一组 ToolShell 负责，不改）。
- 对比时只对工具工作区（中间表单/画布区）做 1:1，全局导航差异归入 brand_removals/shell（共享组件）。
- 禁区文件：tool-shell.tsx / tool-asset-input.tsx / tool-page.tsx / outpaint.tsx / color-v2.tsx / video*。
