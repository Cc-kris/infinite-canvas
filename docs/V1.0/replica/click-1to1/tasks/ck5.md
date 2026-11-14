# 批次 ck5｜点击级 1:1 补齐工单

## 目标
原站 linkfox.com/draw/* 与本地面板逐控件比对，下列工具存在「缺入口」。把原站已有的控件在本地补齐，**文案逐字一致**。

## 可复用组件（务必复用，不要新造）
- `design19-frame.tsx` → `Design19ResultPanel`（tabs 传 `["result","case","history"]` 得 生成结果/优秀案例/历史记录 三页签）；`Design19Empty` 空态
- `tool-cases.tsx` → `ToolCases` 优秀案例画廊
- `tool-asset-input.tsx` → 已含 从本地上传/从作品库选择/从商品库选择
- `edit8-frame.tsx` → `Edit8ResultsEmpty`（暂无生成结果图）

## 红线
1. 不复刻 LinkFox 全局外壳：客服浮窗、素材和灵感、POD素材、企业功能、算力/积分、顶部导航、页码。
2. 只改本批列出的文件。3. 文案逐字照原站，不改写。4. 无真实数据就写空态，不塞假图。
5. 完成前必须 `cd web && npx tsc --noEmit` 通过。

## 逐工具清单

### IMAGE_CROP　文件 `web/src/components/tools/workspaces/crop.tsx`
本地页面：`http://localhost:3000/draw/image-crop`
原站控件顺序：重置 | 撤销 | 重做 | 重新上传 | 真人换模特2.0 | 从本地上传 | 从作品库选择 | 从商品库选择 | 尺寸调整 | 比例调整 | 自由裁剪 亚马逊 1600 × 1600 沃尔玛 2000 × 2000 Ets | 保存自定义尺寸 | 逆时针旋转90° | 顺时针旋转90° | 水平翻转 | 垂直翻转
**必须补齐：**
- [x] 真人换模特2.0
- [x] 从本地上传
- [x] 尺寸调整
- [x] 比例调整
- [x] 自由裁剪亚马逊1600×1600沃尔玛2000×2000Ets
- [x] 保存自定义尺寸

### IMAGE_TRANSLATION　文件 `web/src/components/tools/workspaces/translate.tsx`
本地页面：`http://localhost:3000/draw/image-translation`
原站控件顺序：从本地上传 | 从作品库选择 | 从商品库选择 | 上传多张图片，开始批量翻译 | 生成结果 | 历史记录 | 快速翻译成多语言，快速上架
**必须补齐：**
- [x] 从本地上传
- [x] 上传多张图片，开始批量翻译
- [x] 生成结果
- [x] 历史记录
- [x] 快速翻译成多语言，快速上架

### ORNAMENT_TEXT　文件 `web/src/components/tools/workspaces/text.tsx`
本地页面：`http://localhost:3000/draw/ornament-text`
原站控件顺序：业务咨询
**必须补齐：**
- [x] 业务咨询

### PRINTING_REPAIR　文件 `web/src/components/tools/workspaces/printing-repair.tsx`
本地页面：`http://localhost:3000/draw/printing-repair`
原站控件顺序：从本地上传 | 从作品库选择 | 从商品库选择 | 从本地上传 | 从作品库选择 | 从商品库选择 | 生成结果 | 历史记录 | 暂无生成结果图
**必须补齐：**
- [x] 从本地上传
- [x] 生成结果
- [x] 历史记录
- [x] 暂无生成结果图

### PRINT_EXTRACT　文件 `web/src/components/tools/workspaces/extract.tsx`
本地页面：`http://localhost:3000/draw/print-extract`
原站控件顺序：从本地上传 | 从作品库选择 | 上传多张图片，开始批量提取 | 开启 关闭 | 生成结果
**必须补齐：**
- [x] 从本地上传
- [x] 从作品库选择
- [x] 上传多张图片，开始批量提取
- [x] 开启关闭
- [x] 生成结果

### PRODUCT_REFINE　文件 `web/src/components/tools/workspaces/enhance.tsx`
本地页面：`http://localhost:3000/draw/product-refine`
原站控件顺序：1 | 2 | 3 | 4 | 上传图片 | 从作品库选择 | 拖拽 或 点击上传 需要修复的图 20M以内，jpg/jpeg/png/webp | 生成结果 | 历史记录 | 暂无生成结果图
**必须补齐：**
- [x] 上传图片
- [x] 拖拽或点击上传需要修复的图20M以内，jpg/jpeg/png/webp

### PRODUCT_SCENE　文件 `web/src/components/tools/workspaces/scene-fission.tsx`
本地页面：`http://localhost:3000/draw/product-scene`
原站控件顺序：从本地上传 | 从作品库选择 | 从商品库选择 | 上传多图，体验新功能商品套图 | 生图模型 | 默认尺寸 | 自定义 | 生成结果 | 优秀案例 | 历史记录 | 一键做同款 | 1 | 2
**必须补齐：**
- [x] 从本地上传
- [x] 生图模型
- [x] 一键做同款

### VIDEO_TRANSLATION　文件 `web/src/components/tools/workspaces/video-translation.tsx`
本地页面：`http://localhost:3000/draw/video-translation`
原站控件顺序：生成结果 | 优秀案例 | 历史记录 | 一键做同款
**必须补齐：**
- [x] 生成结果
- [x] 优秀案例
- [x] 历史记录
- [x] 一键做同款
