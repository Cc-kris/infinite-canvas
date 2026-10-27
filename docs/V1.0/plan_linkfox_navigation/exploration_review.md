# 探索复审记录

日期：2026-10-27  
范围：`plan.md`、真实 workbench 配置、39 schema、router/top-nav。

## 独立探索输出复核

- 探索 worker `ic_nav_explore` 已产出 `exploration_findings.md`，其五类分配明确标记为 inferred，不能直接作为事实。
- 复审 worker `ic_nav_review` 完成代码与证据读取，但因轮次静默退出，未生成报告/未给 PASS；因此本记录由主 session 对其工具输出复核，**不声称独立复审 PASS**。
- 复审实际输出：39 schema 中 **30 个**可在 workbench 菜单配置找到 drawType，**9 个**无菜单 drawType：`AI_DRESSING_XSY`、`AI_POSE_GENERATOR`、`FISSION_LINK`、`IMAGE_TEXT_EDIT`、`MATERIAL_UPPER_BODY`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`、`SCENE_TRANSFER`、`VIDEO_CONCAT`。
- 另有菜单/页面类型不属于 39 schema，如 `SMART_REPAIR`、`MATTING`、`IMAGE_REPLICATION`、`BATCH_GENERATE_VIDEOS`；不得为凑数加入 39 registry。
- 原站菜单 label 与早期 `tool-ui-labels` 有冲突时，以本次 workbench label 为导航文案、schema key 为稳定 ID。
- 原站顶部函数只直接映射 4 个工具菜单；第五类是设计/批量工作台。故“五类各含一组互斥 39 工具”是本项目的信息架构适配，不是原站事实。
- 项目 router 可新增 `/tools/*`；Vercel 有 SPA 回退；顶部现有导航和移动端 Drawer 必须同步。
- 图片/视频真实服务在 `services/api/image.ts`、`video.ts`，页面壳不能直接伪造统一 submit。

## 决策

1. 采用稳定 39 key 注册表；每项记录 `origin` 与证据来源。
2. 五类导航保留用户指定名称；侧栏按原业务组归并，补充工具明确标记。
3. 批量生图作为批量任务工作区，可引用其他工具作为任务模板，但注册表只计 39 个唯一定义。
4. 本轮代码仅承诺导航、路由和差异化页面壳/字段展示；真实生成逐工具验收，未接入禁用。
5. 可进入用户计划确认；独立最终验证仍在实施后执行，不能用本次探索代替。

结论：**探索信息足够制定实施计划；分类补充关系必须在 UI/文档透明标注。**
