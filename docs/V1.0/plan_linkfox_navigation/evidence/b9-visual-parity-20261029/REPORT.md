# B9 前半 20 工具：字段/默认值/控件类型 与视觉对照

证据：`evidence/b9-visual-parity-20261029/{real,local}/<ID>/`（2026-10-29 实拍，真实站为登录态 DOM 快照）。
默认值判定：真实站选中项 = 选项边框 `rgb(114,60,249)`（LinkFox 紫）；未取到即标 PARTIAL，不猜。

## PRODUCT_IMAGE_SUITE  `PARTIAL`
- 真实：https://www.linkfox.com/draw/product-image-suite｜本地：http://127.0.0.1:3000/tools/ecommerce-suite/product-image-suite

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 120 | 生成结果 / 优秀案例 | — |
| 130 | 生成结果 / 优秀案例 | 生成结果 |
| 516 | 智能品牌基因 智能主色、智能字体 / 智能品牌基因 | — |
| 586 | 智能合规检查 未选择敏感词库 · / 智能合规检查 | — |
| 607 | 未选择敏感词库 · 未选择替换词 / 未选择敏感词库 / · / 未选择替换词库 | — |
| 679 | LF智能模型 G-2.5 Sun / NEW | — |
| 734 | 开始生成 / (400算力) | — |

**差异**
- `missing_copy`: ["智能品牌基因 智能主色、智能字体风格", "生成类型（单选）", "10M以内，384*384 ~ 4096*4096，最大宽高", "未选择敏感词库", "分辨率选择", "A+图4张 * 每张50点 + 主副图4张 * 每张50点", "优秀案例", "手机A+ 4", "套图换色 NEW", "模型选择", "生成结果", "从作品库选择", "从本地上传 从作品库选择 从商品库选择 10M以内，384*", "模型品质"]
- `missing_option_group`: ["生成结果", "生成结果", "智能品牌基因 智能主色、智能字体", "智能合规检查 未选择敏感词库 ·", "未选择敏感词库 · 未选择替换词", "LF智能模型 G-2.5 Sun", "开始生成"]
- `raw_model_id_leak`: ["模型：default::gpt-image-2"]

## DRESS_WEAR_SET  `PARTIAL`
- 真实：https://www.linkfox.com/draw/clothing-image-suite｜本地：http://127.0.0.1:3000/tools/ecommerce-suite/dress-wear-set

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 120 | 生成结果 / 优秀案例 | — |
| 130 | 生成结果 / 优秀案例 | 生成结果 |
| 604 | 智能品牌基因 智能主色、智能字体 / 智能品牌基因 | — |
| 674 | 智能合规检查 未选择敏感词库 · / 智能合规检查 | — |
| 695 | 未选择敏感词库 · 未选择替换词 / 未选择敏感词库 / · / 未选择替换词库 | — |
| 734 | 开始生成 / (600算力) | — |
| 768 | LF智能模型 G-2.5 Sun / NEW | — |

**差异**
- `missing_copy`: ["智能品牌基因 智能主色、智能字体风格", "分辨率选择", "优秀案例", "智能主色、智能字体风格", "选择排版", "手机A+ 4", "生成结果", "套图换色 NEW", "模型选择", "爆款图复刻 NEW", "未选择替换词库", "LF智能模型 G-2.5 Sunburst NEW", "向导", "最多上传5张图，10M以内，384*384~4096*409"]
- `missing_option_group`: ["生成结果", "生成结果", "智能品牌基因 智能主色、智能字体", "智能合规检查 未选择敏感词库 ·", "未选择敏感词库 · 未选择替换词", "开始生成", "LF智能模型 G-2.5 Sun"]

## CHANGE_COLOR_V2  `PARTIAL`
- 真实：https://www.linkfox.com/draw/change-color-v2｜本地：http://127.0.0.1:3000/tools/ecommerce-suite/change-color-v2

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 120 | 生成结果 / 优秀案例 | — |
| 747 | 开始生成 / (50算力) / 换色部位 | 换色部位 |
| 861 | 全身 / 上装 / 下装 / 鞋面 / 鞋底 | — |
| 889 | 包身 / 包带 / 外壳 / 瓶身 / 表带 | — |

**差异**
- `missing_copy`: ["(50算力)", "常用", "优秀案例", "整张商品图作为换色参考 · 支持多选 · 最多 25 张 ·", "0 / 50 常用 全身 上装 下装 鞋面 鞋底 包身 包带", "生成结果", "套图换色 NEW", "本次换色方案 · 0 张参考图", "颜色选择", "从作品库选择", "模型品质", "爆款图复刻 NEW", "一键做同款", "拖拽 或 点击批量上传 商品参考图"]
- `missing_option_group`: ["生成结果", "开始生成"]
- `raw_model_id_leak`: ["default::gpt-image-2", "default::gpt-image-2", "default::gpt-image-2", "default::gpt-image-2"]

## IMAGE_TRANSLATION  `PARTIAL`
- 真实：https://www.linkfox.com/draw/image-translation｜本地：http://127.0.0.1:3000/tools/ecommerce-suite/image-translation

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 494 | 中文 / 英语 / 繁体中文 | — |
| 530 | 西班牙语 / 日语 / 韩语 | — |
| 566 | 葡萄牙语 / 德语 / 罗马尼亚语 | — |
| 602 | 俄语 / 越南语 | — |
| 724 | 英语 / 俄语 / 法语 / 德语 | 英语 |
| 737 | 开始翻译 / (20算力) | — |
| 760 | 瑞典语 / 挪威语 / 荷兰语 | — |
| 796 | 丹麦语 / 意大利语 / 葡萄牙语 | — |
| 832 | 葡萄牙语(巴西) / 西班牙语 / 波兰语 | — |
| 868 | 捷克语 / 希腊语 / 爱沙尼亚语 | — |
| 904 | 芬兰语 / 匈牙利语 / 立陶宛语 | — |
| 940 | 拉脱维亚语 / 罗马尼亚语 | — |
| 976 | 斯洛伐克语 / 斯洛文尼亚语 | — |
| 1012 | 乌克兰语 / 保加利亚语 | — |
| 1128 | 简体中文 / 繁体中文 / 日语 | — |
| 1164 | 韩语 / 泰语 / 越南语 / 马来语 | — |
| 1200 | 缅甸语 / 印度尼西亚语 / 老挝语 | — |
| 1236 | 孟加拉语 / 菲律宾语 / 他加禄语 | — |
| 1352 | 印地语 / 古吉拉特语 / 马拉地语 | — |
| 1388 | 泰米尔语 / 泰卢固语 / 乌尔都语 | — |
| 1468 | 阿拉伯语 / 波斯语 / 希伯来语 | — |
| 1504 | 中库尔德语 / 塔吉克语 / 土耳其语 | — |

**差异**
- `missing_copy`: ["上传多张图片，开始批量翻译", "塔吉克语", "目标语言（可多选，已选 1 个语言）", "老挝语", "印度尼西亚语", "生成结果", "套图换色 NEW", "爆款图复刻 NEW", "开始翻译 (20算力)", "免责声明", "开始翻译", "爪哇语", "上传需要翻译的图片 从本地上传 从作品库选择 从商品库选择", "他加禄语"]
- `missing_option_group`: ["开始翻译", "缅甸语", "中库尔德语"]

## SCALE_UP  `PARTIAL`
- 真实：https://www.linkfox.com/draw/quality-increase｜本地：http://127.0.0.1:3000/tools/ecommerce-suite/scale-up

**差异**
- `missing_copy`: ["爆款图复刻 NEW", "面部美化：", "批量高清放大", "套图换色 NEW", "免责声明", "从作品库选择", "NEW", "从本地上传", "批量抠图"]
- `raw_model_id_leak`: ["模型：default::gpt-image-2"]

## AI_OUTPAINTING  `PARTIAL`
- 真实：https://www.linkfox.com/draw/ai-outpainting｜本地：http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting

**差异**
- `missing_copy`: ["爆款图复刻 NEW", "套图换色 NEW", "默认尺寸", "免责声明", "NEW", "从本地上传", "批量抠图"]

## AREA_REPAIR  `PARTIAL`
- 真实：https://www.linkfox.com/draw/area-repair｜本地：http://127.0.0.1:3000/tools/smart-edit/area-repair

**差异**
- `missing_copy`: ["大小： 像素", "即将下架", "企业功能", "图像修复", "图片编辑", "从作品库选择", "抠图工具", "大小：", "下架", "上传图片，涂抹需要改变的区域并输入想要改变的内容， 即可重新", "精细抠图", "手部修复 下架", "自动扩大选择区域：", "免责声明"]

## REMOVE_PEN  `PARTIAL`
- 真实：https://www.linkfox.com/draw/remove-pen｜本地：http://127.0.0.1:3000/tools/smart-edit/remove-pen

**差异**
- `missing_copy`: ["大小： 像素", "即将下架", "企业功能", "图像修复", "图片编辑", "抠图工具", "大小：", "下架", "精细抠图", "手部修复 下架", "免责声明", "质量提升", "批量抠图"]
- `raw_model_id_leak`: ["default::gpt-image-2", "default::gpt-image-2", "default::gpt-image-2", "default::gpt-image-2"]

## CHANGE_COLOR  `PARTIAL`
- 真实：https://www.linkfox.com/draw/change-color｜本地：http://127.0.0.1:3000/tools/smart-edit/change-color

**差异**
- `missing_copy`: ["即将下架", "企业功能", "图像修复", "图片编辑", "从作品库选择", "抠图工具", "下架", "精细抠图", "手部修复 下架", "免责声明", "从本地上传", "质量提升", "从商品库选择", "批量抠图"]
- `raw_model_id_leak`: ["模型：default::gpt-image-2"]

## IMAGE_CROP  `PARTIAL`
- 真实：https://www.linkfox.com/draw/image-crop｜本地：http://127.0.0.1:3000/tools/smart-edit/image-crop

**差异**
- `missing_copy`: ["即将下架", "企业功能", "图像修复", "图片编辑", "支持jpg、jpeg、png、webp，10M以内，384*", "抠图工具", "重做", "撤销", "下架", "重置", "精细抠图", "手部修复 下架", "重新上传", "免责声明"]

## PRODUCT_REFINE  `PARTIAL`
- 真实：https://www.linkfox.com/draw/product-refine｜本地：http://127.0.0.1:3000/tools/smart-edit/product-refine

**差异**
- `missing_copy`: ["即将下架", "企业功能", "图像修复", "改善商品的轮廓，光泽、材质与颜色等", "图片编辑", "抠图工具", "下架", "一键提升商品质感", "精细抠图", "精修前", "手部修复 下架", "精修后", "免责声明", "上传图片"]
- `raw_model_id_leak`: ["模型：default::gpt-image-2"]

## FIX_COLOR  `PARTIAL`
- 真实：https://www.linkfox.com/draw/color-diff-repair｜本地：http://127.0.0.1:3000/tools/smart-edit/fix-color

**差异**
- `missing_copy`: ["即将下架", "企业功能", "图像修复", "图片编辑", "抠图工具", "AI将以服装原图为依据修复偏色", "下架", "精细抠图", "手部修复 下架", "免责声明", "上传偏色服装图片", "质量提升", "批量抠图"]

## PRINTING_REPAIR  `PARTIAL`
- 真实：https://www.linkfox.com/draw/printing-repair｜本地：http://127.0.0.1:3000/tools/smart-edit/printing-repair

**差异**
- `missing_copy`: ["手部修复 下架", "企业功能", "质量提升", "即将下架", "下架", "图像修复", "图片编辑", "精细抠图", "免责声明", "抠图工具", "批量抠图"]
- `raw_model_id_leak`: ["default::gpt-image-2"]

## HAND_REPAIR  `PARTIAL`
- 真实：https://www.linkfox.com/draw/hand-repair｜本地：http://127.0.0.1:3000/tools/smart-edit/hand-repair

**差异**
- `missing_copy`: ["大小： 像素", "企业功能", "图像修复", "图片编辑", "抠图工具", "上传图片，涂抹畸形的手部区域，即可对其畸形矫正与还原", "大小：", "精细抠图", "手部修复 下架", "免责声明", "质量提升", "批量抠图"]

## NEW_REPLACE_BG_V2  `PARTIAL`
- 真实：https://www.linkfox.com/draw/product-home｜本地：http://127.0.0.1:3000/tools/product-design/new-replace-bg-v2

**差异**
- `missing_copy`: ["餐桌-茶壶", "企业功能", "厨房-垃圾桶", "纯色背景-支架", "书架-储物箱", "餐桌-蜡烛", "家用电器", "厨房-搅拌器", "厨房-水果篮", "桌面-保温杯", "日用百货", "餐桌-茶具", "厨房-刀具", "节日场景-蜡烛"]
- `raw_model_id_leak`: ["模型：default::gpt-image-2"]

## REPLACE_GOODS  `PARTIAL`
- 真实：https://www.linkfox.com/draw/product-replacement｜本地：http://127.0.0.1:3000/tools/product-design/replace-goods

**差异**
- `missing_copy`: ["企业功能", "扭曲 Ctrl+拖动", "💡 温馨提示：支持上传多张商品图进行批量替换", "Ctrl+拖动", "向左切换画布 键盘左键", "历史记录", "我的商品", "上传参考图", "向右切换画布 键盘右键", "免责声明", "参考图场景变化程度：", "键盘右键", "上传参考图，一键替换商品，快来替换您的商品吧~", "场景参考图"]

## PRODUCT_SCENE  `PARTIAL`
- 真实：https://www.linkfox.com/draw/product-scene?type=2｜本地：http://127.0.0.1:3000/tools/product-design/product-scene

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 120 | 生成结果 / 优秀案例 | — |
| 130 | 生成结果 / 优秀案例 | 生成结果 |
| 739 | 立即生成 / (40算力) | — |
| 843 | 1 / 2 / 3 / 4 | 4 |

**差异**
- `missing_copy`: ["写实 简约 智能", "企业功能", "优秀案例", "从作品库选择", "立即生成 (40算力)", "上传参考图 从本地上传 从作品库选择 从商品库选择 10M以", "第一步：选择示例图或上传商品图 我是高手，不再提醒", "历史记录", "我的商品", "上传多图，体验新功能商品套图", "生图模型 写实 简约 智能", "选择生成张数", "(40算力)", "免责声明"]
- `missing_option_group`: ["生成结果", "生成结果", "立即生成"]
- `raw_model_id_leak`: ["模型：default::gpt-image-2"]

## HANDHELD_GOODS  `PARTIAL`
- 真实：https://www.linkfox.com/draw/handheld-goods｜本地：http://127.0.0.1:3000/tools/product-design/handheld-goods

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 614 | 1 / 2 / 3 / 4 | 4 |
| 739 | 立即生成 / (40算力) | — |

**差异**
- `missing_copy`: ["企业功能", "从作品库选择", "图片规则", "选择手持姿势", "选择手持姿势 手持的部位与姿势参考", "立即生成 (40算力)", "历史记录", "我的商品", "10M以内，384*384 ~ 4096*4096", "选择生成张数", "图片规则 上传商品图 从本地上传 从作品库选择 从商品库选择", "手持的部位与姿势参考", "第一步：选择示例图或上传手持商品图 我是高手，不再提醒", "(40算力)"]
- `missing_option_group`: ["立即生成"]

## AI_DRESSING_V2  `PARTIAL`
- 真实：https://www.linkfox.com/draw/ai-dressing｜本地：http://127.0.0.1:3000/tools/product-design/ai-dressing-v2

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 120 | 生成结果 / 优秀案例 | — |
| 130 | 生成结果 / 优秀案例 | 生成结果 |
| 700 | 一键做同款 / 上传多件衣服，开始批量穿衣 | 上传多件衣服，开始批量穿衣 |
| 739 | 立即生成 / (40算力) | — |
| 894 | 1 / 2 / 3 / 4 | 4 |

**差异**
- `missing_copy`: ["拖拽/粘贴 或 上传上装正面图 从本地上传 从作品库选择 从", "即将下架", "企业功能", "选择穿衣模特 穿衣的部位与模特参考", "优秀案例", "生成结果", "从作品库选择", "图片规则", "立即生成 (40算力)", "上下装衣服 连体衣服", "一键做同款", "下架", "历史记录", "选择生成张数"]
- `missing_option_group`: ["生成结果", "生成结果", "一键做同款", "立即生成"]

## AI_POSTURE  `PARTIAL`
- 真实：https://www.linkfox.com/draw/ai-posture｜本地：http://127.0.0.1:3000/tools/product-design/ai-posture

| 组(y) | 选项 | 真实默认 |
|---|---|---|
| 493 | 姿势库 / 自定义 | — |
| 663 | 1 / 2 / 3 / 4 | 4 |
| 739 | 立即生成 / (40算力) | — |

**差异**
- `missing_copy`: ["即将下架", "企业功能", "从作品库选择", "立即生成 (40算力)", "第一步：选择示例图或上传模特姿势图片", "下架", "生成图片的模特姿势", "历史记录", "10M以内，384*384 ~ 4096*4096", "姿势库 自定义 选择姿势（可选） 生成图片的模特姿势", "上传多张图片，开始批量姿势裂变", "图片规则 拖拽/粘贴 或 上传模特姿势图 从本地上传 从作品", "(40算力)", "人台换模特 下架"]
- `missing_option_group`: ["1", "立即生成"]

## 联动（LINKAGE）
真实站联动仅做了静态观察（分辨率↔品质可选集、生成类型↔张数/排版互斥、多选计数）。未做逐项点击探针 → 联动表状态 PARTIAL，不作为已完成证据。