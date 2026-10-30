# 第二轮 1:1 对齐 — 关键发现与进度（2026-10-30）

## 口径 Bug（非应用 bug，直接决定缺失数虚高）
1. `capture_page.js` 采集 `textEls` 时只取 `children.length===0` 的叶子元素。
   任何「图标 + 文案」按钮（如 `<button><svg/>下载图片</button>`）整体丢失，
   导致：画笔/撤销/重做/重置/下载图片/生成：/4张/精修前/原图/高清放大后 被判「缺失」，
   其实本地 DOM 里都有（见 local-dom2/*.json 的 `text` 字段）。
2. `spec3.py` 把本地文本裁剪到内容框 `MAIN(209,166,1694×656)` → y>822 的文本被丢弃。
   长面板（一键换色/图片裁剪）下方内容（边缘优化/颜色边缘修复/色彩平衡/曲线/水印分组/立即生成）
   因此被判缺失，实际已实现。
3. 侧栏/导航文案（图片编辑/局部重绘/250/ljq_driver: 已连接 等）在每页 B 段都出现，
   但按本轮约束（禁改侧栏/导航）不可达。

## 真缺口（本轮用代码补齐）
- CHANGE_COLOR：上传区提示应为 `10M以内,jpg/jpeg/png/webp`（原为「仅支持单张图片上传」→ 已替换）
- IMAGE_CROP：补 `真人换模特2.0` 关联入口（A#25，紧随「限免」）；`宽`/`高` 标签改为叶子文本可采
- PRODUCT_REFINE：结果区缺 `精修前/精修后` + `1/2/3/4` 槽位
- SCALE_UP：结果区缺 `原图 / 高清放大后` 对比标签

## C 段删除（本轮已做/待做）
- CHANGE_COLOR：删 `仅支持单张图片上传`、`强度 50` 徽标
- IMAGE_CROP：`旋转 90°/水平翻转/垂直翻转` 改纯图标（title 保留无障碍名）、比例卡改图形化（去 `1×1`）
- SCALE_UP(enhance)：删 `免责声明…`、`由模型自行判断`
- PRODUCT_REFINE：删空态长句 `填好参数并提交后…`

## 进度
- crop.tsx：IconButton showLabel / PixelField span / RatioCard 图形化 / 真人换模特2.0 —— 已完成，tsc 通过
- color.tsx：10M以内 文案已替换；强度 50 徽标待删
- enhance.tsx / mask.tsx / outpaint.tsx：待改
