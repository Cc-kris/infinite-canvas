# design19b · 后 9 工具五维非视觉终验（独立复验）

日期：2026-10-29　范围：registry index 25–33
证据根：`evidence/design19b-nv-final/`（独立于 design19-visual-parity / design19b-cases）

## 五维定义（本次口径）

| 维度 | 判定 | 通过条件 |
|---|---|---|
| D1 默认值 | 本地默认值 vs 原站**已登录**默认值 | 原站必须抓到登录态（出现「个人账号/用户xxxx」，且无登录墙）；逐控件比对差异并给出归类 |
| D2 真实出图三动作 | 真实 provider 出图 → 下载 / 存资产 / 发画布 | 三处字节 sha256 全等于结果字节；画布节点刷新后仍在 |
| D3 历史复现 | reload 后历史面板读回同一任务 | 任务 ID/状态/结果图解码成功 |
| D4 案例页签 | 本地案例 tab + 同款按钮 vs 原站 | 原站有案例→数量/卡片结构可核；原站无案例→N/A |
| D5 映射 | 本地 ID ↔ 原站真实路由 | 以原站导航/页面标题语义为准，URL 仅作辅证 |

## 关键结论（滚动更新）
- 本地 9 页 `data-tool-id` 与目标 ID 全部一致（探针 `_probe/_probe.json`）。
- 原站抓取已含登录态「用户6991 个人账号」（design19b-visual-parity real/*）。
- 待修正：FISSION_LINK / IMAGE_TEXT_EDIT / MATERIAL_UPPER_BODY / SCENE_TRANSFER / PRODUCT_MARKET_MATERIAL 的原站路由需以导航实证重定。

## 提交契约（本地，实测 testid）
| ID | 上传点 | 提交 | 结果 | 备注 |
|---|---|---|---|---|
| PRINT_EXTRACT | tool-asset-file-input | print-extract-generate | tool-result-* | 需 1 张商品图 |
| AI_POSE_GENERATOR | 无 | ai-pose-submit | tool-result-* | 只需姿势描述 textarea |
| AI_DRESSING_XSY | 模特/上装/下装槽位 | xsy-submit（xsy-gate 自检） | tool-result-* | 需整件蒙版填充 |
| FISSION_LINK | tool-asset-file-input | fission-link-submit | fission-link-output | 需张数 |
| IMAGE_TEXT_EDIT | image-text-edit-file | image-text-edit-submit | tool-result-* | 需框选 + 文案 |
| MATERIAL_UPPER_BODY | tool-asset-file-input | material-submit | tool-result-* | 需材质大类 |
| NEW_DESIGNER | designer 上传 | designer-export（非生成任务） | designer-* | 本地合成导出 |
| PRODUCT_MARKET_MATERIAL | tool-asset-file-input | suite-generate | market-save/canvas | 营销素材 |
| SCENE_TRANSFER | 2 张（商品+风格） | scene-transfer-submit | tool-result-* | 相似度 |
