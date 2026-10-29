# design19b 后半组（9 个工具）真实规格快照

采集时间：2026-10-29 · 视口 1908×781 · 已登录 LinkFox 会话
采集脚本：`docs/V1.0/plan_linkfox_navigation/tools/capture_design19b.py`
原件（工作副本）：`/tmp/probe_d19b.py` → `/tmp/d19b_deep/<ID>.json`、`/tmp/d19b_specs/<ID>.txt`

## 文件

| 文件 | 说明 |
| --- | --- |
| `<ID>.txt` | 精简清单：每个可见节点的 `(x,y,w,h) fs=字号 c=文字色 bg=背景 br=圆角 \| 文本` |
| `<ID>.json` | 深度 DOM：元素路径、容器盒模型、滚动容器、flex 属性 |

## 工具清单与进度

| ID | 名称 | 工作区组件 | 状态 |
| --- | --- | --- | --- |
| PRINT_EXTRACT | 印花提取 | `web/src/components/tools/workspaces/extract.tsx` | ✅ DONE（见 `../PRINT_EXTRACT.visual-parity.json`） |
| AI_POSE_GENERATOR | AI 姿势生成 | `workspaces/model.tsx` → `AiPoseGeneratorWorkspace` | ⏳ 未开始 |
| AI_DRESSING_XSY | AI 试衣 XSY | `workspaces/dressing-xsy.tsx` → `AiDressingXsyWorkspace` | ⏳ 未开始 |
| FISSION_LINK | 场景裂变链接 | `workspaces/scene.tsx` → `FissionLinkWorkspace` | ⏳ 未开始 |
| IMAGE_TEXT_EDIT | 图片文字编辑 | `workspaces/image-text-edit.tsx` → `ImageTextEditWorkspace` | ⏳ 未开始 |
| MATERIAL_UPPER_BODY | 上装换料 | `workspaces/dress.tsx` → `MaterialUpperBodyWorkspace` | ⏳ 未开始 |
| NEW_DESIGNER | 新设计师 | `workspaces/designer.tsx` → `DesignerWorkspace`（`NewDesignerHostWorkspace` 宿主） | ⏳ 未开始 |
| PRODUCT_MARKET_MATERIAL | 商品营销素材 | `workspaces/suite.tsx` → `ProductMarketMaterialWorkspace` | ⏳ 未开始 |
| SCENE_TRANSFER | 场景迁移 | `workspaces/scene.tsx` → `SceneTransferWorkspace` | ⏳ 未开始 |

组件入口映射表在 `web/src/features/tools/tool-page.tsx#TOOL_WORKSPACES`。

**共用文件警告**：`scene.tsx`（FISSION_LINK + SCENE_TRANSFER）、`suite.tsx`（PRODUCT_IMAGE_SUITE + PRODUCT_MARKET_MATERIAL）、`model.tsx`（AI_POSTURE + AI_POSE_GENERATOR）、`dress.tsx`（AI_WEARABLE + MATERIAL_UPPER_BODY）各自承载 2 个工具，改动必须落在单个导出组件内部，不要动文件级公共样式，避免串改他人范围。

## 复用要点（PRINT_EXTRACT 已验证的通用骨架）

真实站这 9 个工具共用同一外壳：**body #F5F7FA → 1px rgba(0,0,0,.08) 圆角 8 的卡片 → 左栏 300px 白底（表单）+ 右栏 #EDEFF5（42px 白 header：结果/历史 tab + 画布）**。
差异集中在左栏的表单控件与右栏空态文案，改造时优先换表单区，外壳保持一致。

## 硬约束

- 品牌紫 `#723CF9`，主按钮高 32、字 13–14；次级按钮白底描边。
- 提示文字 `#999` / `rgba(0,0,0,.3)`，12px，两行内。
- 空态画布卡片 460×300、白底、圆角 12，标题 20px + 副标 16px 60% 黑。
- 示例缩略图用中性占位，不外链品牌 CDN。
