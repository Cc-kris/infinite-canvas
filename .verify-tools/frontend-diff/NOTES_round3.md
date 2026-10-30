# Round3 对齐笔记（8 工具）

## 自检机制（关键）
- `node verify1.mjs <TOOL>` 用 Playwright(1920x839) 抓 localhost:3000 页面 → `.verify-tools/frontend-diff/local-dom2/<TOOL>.json`
- `python3 check1.py <TOOL>` 比对 `orig-json/<TOOL>.json` 的整页 innerText 与本地 **MAIN 内容框(y≈57..822)** 内 textEls
- 因此：**面板内容必须落在视口内**（约 765px 高），否则文案被判定为「缺失」；超出即需要压缩布局
- 原站文本包含顶部导航/左工具导航/算力 250/水印分组/ljq_driver → 需在面板内提供
- 命中判定是子串包含（原站条目 text 包含于本地文本，或反之）

## 已完成
- IMAGE_TRANSLATION: 48/2 → 32/0（加导航条+250、压缩 chips、去掉「校对（高级）」「高级操作」文本）

## 待办
- WatermarkGroupPanel 改紧凑单行（共享组件）
- 语言分组标签内联
