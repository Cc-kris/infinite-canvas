# R7 design19 历史取证 · 探针笔记（2026-10-29）

## 范围（13）
NEW_REPLACE_BG_V2 / REPLACE_GOODS / PRODUCT_SCENE / HANDHELD_GOODS / AI_DRESSING_V2 /
AI_POSTURE / AI_WEARABLE / PRINT_EXTRACT / AI_POSE_GENERATOR / IMAGE_TEXT_EDIT /
MATERIAL_UPPER_BODY / NEW_DESIGNER / PRODUCT_MARKET_MATERIAL
（AI_DRESSING_XSY 归另一 worker，不碰）

## 环境
- 浏览器 ego lite Profile 1（真实用户 profile，非临时 playwright）
- 本地 http://127.0.0.1:3000（vite dev，200）；另有 http://localhost:3000 独立 origin（IDB 4.6MB，待查）
- 索引键 `tool-task:v1:index`（localStorage）→ 37 个 task id 数组

## 已探明（127.0.0.1:3000）
- 37 条任务按 toolId 汇总：仅 IMAGE_TEXT_EDIT 属本次 13 个工具，共 1 条
  - task-mvs8bhu1-hhue24, succeeded, createdAt 1793198888713 (2026-10-28T09:28:08Z)
  - result.items[0] = {kind:"image", payloadDropped:true} —— **无 storageKey、无字节**
  - 即「成功但产物未落盘」，刷新后历史行无图可下载/入库/发画布
- 其余 12 个工具在真实 profile 的索引里 0 条
- IDB infinite-canvas：media_files 74（tool-result 20 / tool-asset 51 / video 3）、image_files 32、tool_assets 48（无 toolId 元数据）

## 代码事实
- web/src/stores/use-tool-task-store.ts：hydrate 只按 storageKey 复原对象 URL；payloadDropped 项不会重取
- web/src/features/tools/use-task-recovery.ts：挂载时只 resume 「未完结」任务，已 succeeded 但不完整的不处理
- web/src/features/tools/tool-page.tsx：WORKSPACE_OWN_HISTORY 豁免板（无我 13 个，除 PRODUCT_SCENE 自带历史 tab）
  → 13 个工具都有历史表面（dock 或自带 tab）

## 真机验证 1（2026-10-29T09:2x）
- 修复后新开 127.0.0.1 标签 /tools/product-design/handheld-goods（hard navigation = fresh load）
- localStorage index 由 38 → **53**（healTaskIndex 把 15 条孤儿补回索引）
- tool-history-dock：count=「1 条」，行=「2026-10-28 21:34 失败 Photorealistic e-commerce product photo…」
  → 该任务此前在索引外，历史坞恒为空；属真实任务的历史行恢复（无产物，仅行级）
