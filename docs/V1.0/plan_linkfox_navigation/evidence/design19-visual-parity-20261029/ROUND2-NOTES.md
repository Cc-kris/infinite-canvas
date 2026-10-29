# design19 前10 视觉对齐 第二轮（2026-10-29，接 2e5aa48）

## 原站实测基线（viewport 1908x781，CDP getBoundingClientRect + getComputedStyle）

### 左列（family A：dressing/posture/wearable/handheld/scene/replace-bg）
| 元素 | rect | 样式 |
|---|---|---|
| `_configContent` 左列 | x190 y120 w300 h600 | padding 10px 12px 10px 16px，白底 → 内容宽 268 |
| `_configItem` 分区间距 | — | margin-bottom 15px |
| 上传面板 `_uploadPanel` | 268x306 | bg #f7f7f7 / radius 8 / padding 10 |
| └ `_dropZone` | 248x286 | bg #fafafa |
| └ `_uploadBox` | 248x196 | 1px dashed #d9d9d9 / radius 8 / padding 16 / gap 10 |
| └ 「图片规则」角标 | 80x24 | bg #f9f0ff / 12px / #722ed1 / radius 0 8 0 8 |
| 上传图标 | 40x40 | #723cf9 |
| 次按钮（上传类 CTA） | 268x32 | radius 6 / 14px / #723cf9 字 + 紫描边白底 |
| 主按钮 立即生成 | 268x32（y731） | radius 6 / 14px / bg #723cf9 / padding 0 15 |
| 分组标题 选择生成张数 | 268x22 | 12px / 22px / rgba(0,0,0,.3) |
| 张数 chip | 40x26 | padding 4px 16px / 12px / 16px 行高 / radius 6 / 1px #ccc / bg #fff / 间距 10 |

### 右列
| 元素 | rect | 样式 |
|---|---|---|
| 页签栏 `.ant-tabs-nav` | x490 w1408 **h42** | padding 0 12px / bg #fff |
| 页签 生成结果 | 503,130 56x22 | 14px / 22px / 选中 #723cf9，未选 rgba(0,0,0,.88) |
| 页签 优秀案例 | 573,130 56x22 | 与前者间距 14 |
| 历史记录（extra） | 1822,128 64x25 | 12px / 右对齐 |
| 空态标题 | fs14 / rgba(0,0,0,.6) | 面板内水平居中 |
| 空态说明 | fs14 / rgba(0,0,0,.6) | 同上 |

### 各工具真实口径
| ID | 右栏宽 | 页签 | 主 CTA |
|---|---|---|---|
| AI_DRESSING_V2 | 1408 | 生成结果/优秀案例/历史记录 | 立即生成 (40算力) + 次按钮「上传多件衣服，开始批量穿衣」 |
| AI_POSTURE | 1408 | 生成结果/历史记录 | 立即生成 (40算力) + 次按钮「上传多张图片，开始批量姿势裂变」 |
| AI_WEARABLE | 1408 | 3 页签 | 立即生成 (40算力) |
| HANDHELD_GOODS | 1408 | 生成结果/历史记录 | 立即生成 (40算力) |
| PRODUCT_SCENE | 1408 | 3 页签 | 立即生成 (40算力) + 次按钮「上传多图，体验新功能商品套图」 |
| REPLACE_GOODS | 615 | 3 页签 | 立即生成 (40算力) |
| SDS_DESIGN | 300 | 3 页签 | 立即生成 (20算力) |

## 本地实现
- 新增共享骨架 `web/src/components/tools/design19-frame.tsx`：Workbench / LeftColumn(300, pad 10/12/10/16) / Section(mb 15) / FieldLabel(12-22 rgba .3) / UploadPanel / DropZone / PrimaryButton(268x32 r6) / GhostButton / MiniButton / Chip(40x26) / Results(42px 页签栏，右端 12px 历史记录) / Empty(14px rgba .6)。
- 禁区：tool-shell.tsx、tool-asset-input.tsx、tool-page.tsx、outpaint.tsx、color-v2.tsx、video*（不改）。
- 已知全局差异（不计入工具内差异）：本地无原站 120px 顶部导航，工具区整体上移 110px；本地全局左侧 180px 工具侧栏 + 10px 内边距使工作区起点 x190，与原站一致。
