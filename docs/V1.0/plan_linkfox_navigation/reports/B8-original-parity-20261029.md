# B8｜原站路由核准与 DOM 落证（final-gap-audit）

- 日期：2026-10-29；分支：`feat/linkfox-v1-real`
- 账号：LinkFox 已登录账号（用户6991），浏览器为日常 Chrome，viewer 1600×1000
- 方法：同源 iframe 注入原站（CDP `Runtime.evaluate`），等 9s 后取 `body.innerText` + 可见 `button/input/textarea` 的 rect / 字号 / 颜色 / 圆角 / 背景；**未截图**（本机无屏幕录制权限），未读取任何密钥。
- 路由真源：`/web-assets/workbench-BcUrzOPA.js` 侧栏菜单表 `{text,label,path,key,drawType,whitelist,betaLabel}` 与 56 条 `/draw/*` 路由表，**非猜测**。

## 1. 结论表（13 个 final-gap 工具）

| 工具 | 原站真实 URL | 证据级别 | 说明 |
|---|---|---|---|
| FIX_COLOR 色差修复 | `/draw/color-diff-repair` | workspace_dom | 27 控件；旧猜测 `fix-color` / `high-definition-repair` 均 404 |
| AI_TEXT（原站名「创意文字」，本地旧名 POD素材） | `/draw/ai-text` | permission_redirect_home | 菜单表 `whitelist:!0`，本账号 iframe finalUrl=`/home` |
| ORNAMENT_TEXT 饰品文字 | `/draw/ornament-text` | permission_redirect_home | 同上，Beta + whitelist |
| NEW_REPLACE_BG_V2 商品图 | `/draw/product-home` | workspace_dom | 17 控件：商品图/我的商品/场景参考图/商品替换/场景裂变/手持商品 |
| VIDEO_CONCAT 视频拼接 | `/draw/video-concat` | workspace_dom | 12 控件：2~4 素材、16:9/9:16/1:1/4:3、60 算力 |
| NEW_DESIGNER 商品图设计器 | `/draw/designer-home` | workspace_dom | 20 控件：草稿箱/模板推荐/创建设计 |
| AI_POSE_GENERATOR AI姿势生成 | `/draw/ai-posture` | workspace_dom | 21 控件；字段 modelPose/modelStyle/outputNum 与本地一致 |
| AI_DRESSING_XSY AI试衣XSY | `/draw/ai-dressing` | workspace_dom | 39 控件；upper/suit/down + Mask/Origin 与本地一致 |
| FISSION_LINK 场景裂变链接 | `/draw/product-scene?type=2` | workspace_dom | 30 控件：参考图/背景相似度/场景描述 |
| PRODUCT_MARKET_MATERIAL 商品营销素材 | `/draw/product-image-suite?batchType=PRODUCT_MATERIAL` | workspace_dom_text_only | 主副图8张+A+图4张=600 点；仅文本层 |
| MATERIAL_UPPER_BODY 上装换料 | `/draw/clothing-image-suite` | workspace_dom | 40 控件；公共站无独立入口，判定为套图子能力（PARTIAL） |
| SCENE_TRANSFER 场景迁移 | 无公共入口 | private_b2b_route | 仅 `M.custom.bsqSceneTransfer`（倍思奇 B2B） |
| IMAGE_TEXT_EDIT 图片文字编辑 | `/draw/designer` 404 | route_not_found | `/draw/ai-image-edit` 亦被白名单重定向 `/home`；编辑态经 designer-home 进入 |

## 2. 关键纠错

1. **AI_TEXT / ORNAMENT_TEXT 不是没有路由**：真实路由分别是 `/draw/ai-text`、`/draw/ornament-text`，被账号白名单拦截才落在 `/home`。此前页面记录的 `原站 URL = /home` 是现象不是入口，已改为「真实路由 + 重定向说明」。
2. **10 个 chunk-only 工具不是「补充工具无直达 URL」**：均已在菜单表/路由表定位到真实页面，仅 SCENE_TRANSFER 确属 B2B 私有路由。
3. `/draw/designer` 是 404，设计器编辑态只能从 `/draw/designer-home` 进入——IMAGE_TEXT_EDIT 无法单页验收。
4. 原站侧栏分两层：一级为 `<a href>`（8 条），二级是 SPA 点击项（无 href），只能靠 `location.href` 变化判定；本次用点击+同源 iframe 双路交叉验证。

## 3. 产物

- 逐工具证据：`evidence/page-dom-20261028/{TOOL_ID}.json`（13 份，含 controls/regions/styles）
- 索引：`evidence/page-dom-20261028/index.json`（39 条，状态分布：workspace_dom 34 / permission_redirect_home 2 / workspace_dom_text_only 1 / route_not_found 1 / private_b2b_route 1）
- 对照门禁：`evidence/page-dom-20261028/visual-parity.json`（overall=PARTIAL：原站侧已落证，本地侧本轮未采集）
- 原始回包：`_raw_rich1.txt`、`_raw_rich2.txt`、`_raw_batchA~D.txt`、`_raw_drawpaths.txt`、`_raw_bundle_enums.txt`、`_raw_click_pod.txt`、`_raw_nav_anchors.txt`

## 4. 未完成/风险

- 8 个 workspace_dom 页面尚无本地页面逐项 diff（布局/字号/颜色/间距），`visual-parity.json` 记为 PARTIAL，需 B9 采集本地 DOM 后比对。
- PRODUCT_MARKET_MATERIAL 仅文本层，缺控件样式与坐标。
- MATERIAL_UPPER_BODY 映射到服装套图属推断（字段一致 + 无独立入口），未在页面内点开「换料」交互验证。
- SCENE_TRANSFER、AI_TEXT、ORNAMENT_TEXT、IMAGE_TEXT_EDIT 无法 1:1 验收，本地实现只能依据字段与文案推演。
