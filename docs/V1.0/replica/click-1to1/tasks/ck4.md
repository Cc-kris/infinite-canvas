# 批次 ck4｜点击级 1:1 补齐工单

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

### AI_WEARABLE　文件 `web/src/components/tools/workspaces/dress.tsx`
本地页面：`http://localhost:3000/draw/ai-wearable`
原站控件顺序：图片规则 | 从本地上传 | 从作品库选择 | 从商品库选择 | 生成结果 | 优秀案例 | 历史记录 | 一键做同款
**必须补齐：**
- [ ] 从本地上传
- [ ] 历史记录
- [ ] 一键做同款

### AREA_REPAIR　文件 `web/src/components/tools/workspaces/mask.tsx`
本地页面：`http://localhost:3000/draw/area-repair`
原站控件顺序：反选 | 撤销 | 重做 | 重置 | 从本地上传 | 从作品库选择 | 从商品库选择 | 生成结果 | 历史记录 | 暂无生成结果图
**必须补齐：**
- [ ] 从本地上传

### REMOVE_PEN　文件 `web/src/components/tools/workspaces/mask.tsx`
本地页面：`http://localhost:3000/draw/remove-pen`
原站控件顺序：重置 | 撤销 | 重做 | 重新上传 | 高清放大 | 商品图 | 手部修复 | 从本地上传 | 从作品库选择 | 从商品库选择
**必须补齐：**
- [ ] 从本地上传

### HAND_REPAIR　文件 `web/src/components/tools/workspaces/repair.tsx`
本地页面：`http://localhost:3000/draw/hand-repair`
原站控件顺序：重置 | 撤销 | 重做 | 上传图片 | 从作品库选择 | 生成结果 | 历史记录 | 暂无生成结果图
**必须补齐：**
- [ ] 上传图片
- [ ] 从作品库选择
- [ ] 生成结果
- [ ] 历史记录
- [ ] 暂无生成结果图

### HANDHELD_GOODS　文件 `web/src/components/tools/workspaces/handheld-goods.tsx`
本地页面：`http://localhost:3000/draw/handheld-goods`
原站控件顺序：图片规则 | 从本地上传 | 从作品库选择 | 从商品库选择 | 生成结果 | 历史记录 | 一键做同款
**必须补齐：**
- [ ] 图片规则
- [ ] 从本地上传
- [ ] 从商品库选择
- [ ] 生成结果
- [ ] 历史记录
- [ ] 一键做同款

### AI_OUTPAINTING　文件 `web/src/components/tools/workspaces/outpaint.tsx`
本地页面：`http://localhost:3000/draw/ai-outpainting`
原站控件顺序：从本地上传 | 从作品库选择 | 生成结果 | 优秀案例 | 历史记录 | 暂无生成结果图 快在左侧操作智能扩图吧~
**必须补齐：**
- [ ] 从本地上传
- [ ] 生成结果
- [ ] 优秀案例
- [ ] 历史记录
- [ ] 暂无生成结果图快在左侧操作智能扩图吧~
