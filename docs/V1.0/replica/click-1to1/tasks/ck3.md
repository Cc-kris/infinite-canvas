# 批次 ck3｜点击级 1:1 补齐工单

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

### CHANGE_COLOR_V2　文件 `web/src/components/tools/workspaces/color-v2.tsx`
本地页面：`http://localhost:3000/draw/change-color-v2`
原站控件顺序：上传图片 | 从本地上传 | 从作品库选择 | 从商品库选择 | 上传多张图片，开始批量套图换色 | 颜色选择 | 商品图提色 | 历史使用颜色 | 换色部位 | 模型设置 | 生成结果 | 优秀案例 | 历史记录 | 一键做同款 | 1 | 2 | 3 | 4 | 5 | 6
**必须补齐：**
- [ ] 上传图片
- [ ] 从本地上传
- [ ] 颜色选择
- [ ] 换色部位
- [ ] 模型设置
- [ ] 生成结果
- [ ] 优秀案例
- [ ] 历史记录
- [ ] 一键做同款

### CHANGE_COLOR　文件 `web/src/components/tools/workspaces/color.tsx`
本地页面：`http://localhost:3000/draw/change-color`
原站控件顺序：从本地上传 | 从作品库选择 | 从商品库选择 | 批量一键换色 | 收藏色卡 | 选择颜色 | 拖拽 或 点击上传 颜色参考图 10M以内,jpg/jpeg/png/webp | 开启 关闭 | 重置 | 细调颜色效果 | 重置 | 光影优化 | 边缘优化 | 开启 关闭 | 色彩平衡 | 生成结果 | 优秀案例 | 历史记录 | 暂无生成结果图 快在左侧操作物品换色吧~
**必须补齐：**
- [ ] 从本地上传
- [ ] 收藏色卡
- [ ] 选择颜色
- [ ] 拖拽或点击上传颜色参考图10M以内,jpg/jpeg/png/webp
- [ ] 开启关闭
- [ ] 重置
- [ ] 细调颜色效果
- [ ] 光影优化
- [ ] 边缘优化
- [ ] 色彩平衡

### AI_POSTURE　文件 `web/src/components/tools/workspaces/model.tsx`
本地页面：`http://localhost:3000/draw/ai-posture`
原站控件顺序：图片规则 | 从本地上传 | 从作品库选择 | 从商品库选择 | 上传多张图片，开始批量姿势裂变 | 姿势库 | 自定义 | 生成结果 | 历史记录 | 一键做同款
**必须补齐：**
- [ ] 从本地上传
- [ ] 从作品库选择
- [ ] 从商品库选择
- [ ] 上传多张图片，开始批量姿势裂变
- [ ] 姿势库
- [ ] 自定义
- [ ] 生成结果
- [ ] 历史记录
- [ ] 一键做同款

### AI_TEXT　文件 `web/src/components/tools/workspaces/ai-text-static.tsx`
本地页面：`http://localhost:3000/draw/ai-text`
原站控件顺序：业务咨询
**必须补齐：**
- [ ] 业务咨询
