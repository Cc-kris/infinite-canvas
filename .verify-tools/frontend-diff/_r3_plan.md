# R3 计划与事实（2026-10-30）

## 验证
```
cd /Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff
node verify1.mjs <TOOL> ...   # 抓 local-dom2/*.json (dev :3000)
python3 check1.py <TOOL> ...  # 复用 spec3
```

## 关键机制（spec3.py）
- orig: `lines_of(o.text)` 整页文本（含原站左侧导航），仅过滤 SHELL 正则（首页/电商套图/智能修图/新模型/AI视频/HOT/批量生图/商品图设计/Skills/Agent/更多/学习中心/免费得算力/购买/用/个人账号/用户N/灵感/创作/工具/历史记录/免责声明/操作咨询/产品教程/登录/注册/会员/充值/客服/帮助中心/优秀案例/一键做同款/LinkFox*/ljq_driver）
- local: `local_content_texts` 只取正文大框(cb)内 textEls → **原站左侧导航必须镜像到面板内部**
- 命中: norm 后相等，或 len>3 时双向子串

## 各家族导航（orig 内一致，已验证）
- ecommerce-suite: 商品套图|服装套图|爆款图复刻|NEW|套图换色|批量翻译|高清放大|批量抠图|智能扩图（原站 NEW 出现两次）
- smart-edit: 图片编辑|局部重绘|局部消除|一键换色|图片裁剪|质量提升|商品精修|图像修复|色差修复|印花修复|抠图工具|精细抠图|批量抠图|企业功能|即将下架|手部修复|下架
- model-wear(AI_WEARABLE 族): 真人换模特|模特换场景|AI穿衣|姿势裂变|AI穿戴|企业功能|即将下架|人台换模特|下架
- product-scene 族: 商品图|我的商品|场景参考图|商品替换|场景裂变|手持商品|企业功能

## 组件映射
PRODUCT_IMAGE_SUITE→suite.tsx ProductImageSuiteWorkspace
CHANGE_COLOR_V2→color-v2.tsx ColorV2Workspace
AI_OUTPAINTING→outpaint.tsx OutpaintWorkspace
AI_WEARABLE→dress.tsx AiWearableWorkspace
PRODUCT_REFINE→enhance.tsx ProductRefineWorkspace
AREA_REPAIR/REMOVE_PEN→mask.tsx Mask/RemovePenWorkspace
PRODUCT_SCENE→scene-fission.tsx ProductSceneWorkspace

## 基线 (缺/多)
PIS 55/0, CCV2 39/1, AIW 10/18, PREF 19/0, AREA 24/0, RPEN 21/0, OUTP 10/0, PSCENE 8/1

## 待删多余
- CHANGE_COLOR_V2: 第2天
- AI_WEARABLE: › / 5. 结果 / 点击选择本地文件，或拖拽到这里 / 校验格式 / 大小 / 像素，入库后可刷新恢复 / 还没有素材 / 商品蒙版 / 圈出要穿戴的商品主体，导出 PNG 与商品图同尺寸 / 撤销 / 重做 / 上传后在此框选蒙版 / 本次提交快照 / 真人模特 · 保持原背景 / 主体 / 目标蒙版 / 模型 / 已配置 / 第 1 张 / 待生成
- PRODUCT_SCENE: 真实光影与材质，背景相似度可手调
