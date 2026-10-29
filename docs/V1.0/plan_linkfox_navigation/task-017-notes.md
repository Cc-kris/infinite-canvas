# TASK-017 图片裁剪（IMAGE_CROP）施工笔记

## 证据
- 页面规格：`page-specs/10-image-crop.md`（区域：裁剪画布与历史｜尺寸调整｜比例调整｜平台预设｜自定义尺寸；组件 CropCanvas + PlatformPresetGrid + PixelSizeForm）
- 原站 DOM：仓库根 `IMAGE_CROP.json`（Python repr，需 `ast.literal_eval`，非 JSON）
- 实测文案：`尺寸调整`/`比例调整`/`自由裁剪`/`目标尺寸`/`宽`/`高`/`保存自定义尺寸`/`重置`/`撤销`/`重做`/`重新上传`/`下载图片`；旋转图标 anticon-rotate-left/right
- 平台卡（DOM 顺序）：亚马逊 1600、沃尔玛 2000、Etsy 2000、美客多 1200、eBay 1600、Temu 1200、Shopify 方形 2048、Shopify 横板 2000×1800、Shopify 竖版 1600×2000、SHEIN 1340×1785、速卖通 1200、Shopee 1080、Lazada 1080、Tiktok Shop 1024、抖音小店 1024、淘宝/天猫 1024、京东 1024、Wayfair 2000、Cdiscount 2000、Jumia 1024、Rakuten 1024、Wish 1024（22 张）

## 共享 API（已读，不改）
- `services/api/tools/task-machine.ts`：`createTaskRecord`（status=draft）、`transitionTask`（draft→validating→submitting→running→succeeded|failed）、`computeFingerprint`、`ToolTaskResultItem{id,kind,dataUrl,mimeType,bytes,url}`
- `services/api/tools/assets.ts`：`uploadToolAsset(blob, opts) → ToolAssetRecord{id,storageKey,url,bytes,mimeType,width,height}`
- `stores/use-tool-draft-store.ts`：`patch(toolId,{values,assetIds})`、`hydrate(toolId)`、`flush`
- `stores/use-tool-task-store.ts`：`upsertTask(task)`（落盘，二进制会被剥离）
- 组件：`ToolShell`(title/subtitle/badges/actions/notices/sidebar/children)、`ToolAssetInput`(toolId/constraints/maxCount/library/onChange)、`ToolResult`(task/toolId/onRetry/onCancel)、`TaskStatusPanel`(task)

## 既有同类实现（模式参考）
- `registry/area-repair.ts` + `adapters/area-repair.ts` + `workspaces/mask.tsx`（TASK-014）

## 本任务交付
1. `web/src/features/tools/registry/image-crop.ts` — 契约常量、22 平台预设、比例预设、裁剪框几何纯函数（拖动/缩放/锁定比例/旋转/翻转）、输出尺寸同步、校验、快照 + hash、12 字段 compose、草稿序列化/反序列化
2. `web/src/features/tools/adapters/image-crop.ts` — 真实裁剪执行：canvas 真实像素绘制（旋转/翻转/裁剪/缩放）→ `uploadToolAsset` 真实入库 → 真实 `ToolTask`（validating→submitting→running→succeeded/failed）；失败即 failed，绝不补造结果
3. `web/src/components/tools/workspaces/crop.tsx` — 裁剪工作台（CropCanvas 拖拽/键盘、平台卡、比例卡、目标尺寸、自定义尺寸保存、撤销/重做/重置/重新上传/下载、历史、结果区）
4. `web/src/features/tools/adapters/image-crop.test.ts` — 几何/同步/校验/执行端口单测

## 已知接线缺口（需共享文件负责人处理，写入 report.md）
- `features/tools/tool-page.tsx` 未挂载任何 workspace（仍渲染 WorkspacePlaceholder），`crop.tsx` 需在 `layout === "crop"` 分支按 toolId 渲染
- `registry/index.ts` 已有 IMAGE_CROP spec（字段 12 个），本次不改
