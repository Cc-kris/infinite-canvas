# 登录态下原站可达性复核（egolite）

复核方式：使用用户本机已登录 LinkFox 的 egolite 浏览器（账号「用户6991」）实测。

## 一、本轮结论：此前「17 页不可对照」的判断是错的

**原站路由与本地 slug 不是同一套命名**，例如：

| 本地 slug | 原站真实路由 | 原站页面名 |
|---|---|---|
| `dress-wear-set` | `/draw/clothing-image-suite` | 服装套图 |
| `scale-up` | `/draw/quality-increase` | 高清放大 |
| `fix-color` | `/draw/color-diff-repair` | 色差修复 |
| `ai-dressing-v2` | `/draw/ai-dressing` | AI穿衣 |
| `replace-goods` | `/draw/product-replacement` | 商品替换 |
| `new-replace-bg-v2` | `/draw/product-home` | 商品图合成 |
| `image-to-video` | `/draw/video` | 商品视频 |
| `ai-video-editing` | `/draw/ai-video-edit` | 视频编辑 |
| `video-concat` | `/draw/video-edit` | 视频剪辑 |
| `image-text-edit` | `/designer?type=78` | 商品图设计编辑器 |
| `new-designer` | `/draw/designer-home` | 创建设计 |

我此前直接用本地 slug 拼 `/draw/<slug>` 去探测，得到「页面不存在」，就把这些页面判成原站不存在。**这个方法是错的**，结论也随之错了。

## 二、实测验证

用 egolite 直接访问上表的真实路由，逐页读取页面正文：

| 工具 | 路由 | 页面正文关键内容 | 判定 |
|---|---|---|---|
| 服装套图 | `/draw/clothing-image-suite` | 多角度服装图&搭配图 / 从本地上传 / 最多上传16张图 / 商品类目 | **真实工具页** |
| 高清放大 | `/draw/quality-increase` | 变高清 / 高清 + 2倍放大 / 高清 + 4倍放大 / 立即生成 (20算力) | **真实工具页** |
| AI穿衣 | `/draw/ai-dressing` | 上下装衣服 / 连体衣服 / 图片规则 / 上传上装正面图 | **真实工具页** |
| 色差修复 | `/draw/color-diff-repair` | 非「页面不存在」 | 存在 |

同时复核了两类确实不可用的情况（这两类判断成立）：

| 工具 | 现象 | 判定 |
|---|---|---|
| AI_TEXT（POD素材） | `/draw/ai-text` → 跳转 `/home` | 本账号重定向 |
| 饰品文字 | `/draw/ornament-text` → 跳转 `/home` | 本账号重定向 |
| 商品营销素材 | 仅批量生图 create-task 入口，需团队版账号 | 本账号不可见 |

## 三、更正后的数字

| 分类 | 数量 | 说明 |
|---|---|---|
| 可做 1:1 对照 | **31** | 有真实原站路由 + 有 `original.png` 基线 |
| 本账号不可见（blocked） | 3 | AI_TEXT、ORNAMENT_TEXT、PRODUCT_MARKET_MATERIAL |
| 原站无独立页面（no-page） | 5 | AI_POSE_GENERATOR、AI_DRESSING_XSY、FISSION_LINK、MATERIAL_UPPER_BODY、SCENE_TRANSFER |

「缺基线」为 0：31 个可对照工具全部有 `original.png`。

## 四、隔离区的更正

此前误判导致 17 张基线被移入 `_INVALID-BASELINE/`。现已恢复其中 9 张（服装套图、高清放大、色差修复、商品图、商品替换、AI穿衣、图转视频、商品图设计器、图片文字编辑），并删除对应的 `BASELINE-INVALID.md`。

恢复后已抽查确认：`DRESS_WEAR_SET/original.png` 是原站「服装套图」页（含「多角度服装图&搭配图」「开始生成 600算力」），`AI_DRESSING_V2/original.png` 是原站「AI穿衣」页（含「上下装衣服/连体衣服」「立即生成 30算力」）。

仍保留隔离的 8 张属正确隔离：5 张 no-page（原站无独立页面）+ 3 张 blocked（本账号看不到）。

## 五、教训

`tool_specs.json` 里的 `slug` 是**本地路由**用的，不是原站路由。任何跨站比对都必须先拿到原站真实路由，不能靠 slug 拼接猜测。这一点已写入审计脚本注释，避免再次踩坑。
