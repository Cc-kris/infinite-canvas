# 批次 ck1｜点击级 1:1 补齐工单

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

### SALE_VIDEO　文件 `web/src/components/tools/workspaces/video.tsx`
本地页面：`http://localhost:3000/draw/sale-video`
原站控件顺序：分析 | 图片规则 | 本地上传 | 作品选择 | 商品库选择 | UGC种草 | AI帮写 | 5 | 10 | 15 | 自适应 | 9:16 | 16:9 | 1:1 | 4:3 | 3:4 | 21:9 | 生成结果 | 优秀案例 | 历史记录 | 一键做同款 | 1 | 2 | 3
**必须补齐：**
- [ ] 分析
- [ ] 本地上传
- [ ] UGC种草
- [ ] 生成结果
- [ ] 优秀案例
- [ ] 历史记录
- [ ] 一键做同款

### VIDEO_CONCAT　文件 `web/src/components/tools/workspaces/video.tsx`
本地页面：`http://localhost:3000/draw/video-concat`
原站控件顺序：选择视频素材 | 生成结果 | 历史记录
**必须补齐：**
- [ ] 生成结果
- [ ] 历史记录

### VIDEO_REPLICATION　文件 `web/src/components/tools/workspaces/video.tsx`
本地页面：`http://localhost:3000/draw/video-replication`
原站控件顺序：解析 | 本地上传 | 作品选择 | 图片规则 | 本地上传 | 作品选择 | 商品库选择 | 默认自动分析 | Auto | 5 | 10 | 15 | 9:16 | 16:9 | 1:1 | 3:4 | 4:3 | 21:9 | 生成结果 | 优秀案例 | 历史记录 | 一键做同款 | 关闭
**必须补齐：**
- [ ] 本地上传
- [ ] 图片规则
- [ ] 默认自动分析
- [ ] 生成结果
- [ ] 优秀案例
- [ ] 历史记录
- [ ] 一键做同款
- [ ] 关闭
