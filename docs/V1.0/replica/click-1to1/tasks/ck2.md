# 批次 ck2｜点击级 1:1 补齐工单

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

### PRODUCT_IMAGE_SUITE　文件 `web/src/components/tools/workspaces/suite.tsx`
本地页面：`http://localhost:3000/draw/product-image-suite`
原站控件顺序：从本地上传 | 从作品库选择 | 从商品库选择 | AI分析 | 向导 | LF智能模型 G-2.5 Sunburst 2K · 中品质 · 50点/张 | 主副图 卖点图 4张 | 配置主副图 | A+图 高级A+（1464×600） 4张 | 配置A+图 | 生成结果 | 优秀案例 | 历史记录 | 一键做同款 | 1 | 2 | 3 | 关闭提示 | 立即体验 | 关闭 | 立即体验
**必须补齐：**
- [ ] 从本地上传
- [ ] 主副图卖点图4张
- [ ] 配置主副图
- [ ] A+图高级A+（1464×600）4张
- [ ] 配置A+图
- [ ] 生成结果
- [ ] 优秀案例
- [ ] 历史记录
- [ ] 一键做同款
- [ ] 关闭提示
- [ ] 立即体验
- [ ] 关闭

### SDS_DESIGN　文件 `web/src/components/tools/workspaces/pod.tsx`
本地页面：`http://localhost:3000/draw/sds-design`
原站控件顺序：上传素材 | 生成结果 | 优秀案例 | 历史记录 | 暂无生成结果图 快在左侧操作素材贴合吧~
**必须补齐：**
- [ ] 生成结果
- [ ] 优秀案例
- [ ] 历史记录
- [ ] 暂无生成结果图快在左侧操作素材贴合吧~
