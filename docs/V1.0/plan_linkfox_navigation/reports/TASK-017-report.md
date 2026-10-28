# TASK-017 图片裁剪（IMAGE_CROP）实施报告

- 分支：`feat/linkfox-v1-real`
- 代码提交：`142a946` — feat(tools): IMAGE_CROP 图片裁剪真实工作台（22 平台预设 + 锁定比例 + 自由裁剪 + 真实画布导出 + 12 字段防丢参）
- 对应验收：TC-025 / AC-025
- 原始页面抓取证据：仓库根 `IMAGE_CROP.json`（DOM 文本 / 尺寸 / 控件清单）

## 1. 改了什么

新增 4 个文件（全部在本次允许清单内，共 1968 行）：

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/image-crop.ts` | 613 | 状态模型、22 个平台预设、比例库、`createCropState` / `resetForNewSource` / `applyPlatform` / `setOutputSize` / `applyRotate` / `applyFlip` / `toggleLock` / 校验边界 `guardImageCropRequest`、12 字段 `composeImageCropFields` + prompt 内嵌配置、快照 `createImageCropSnapshot` 与过期判定 |
| `web/src/features/tools/adapters/image-crop.ts` | 335 | `createCanvasCropRenderer()` 真实 canvas 绘制（旋转/翻转/裁剪框 → 真实字节，零字节按失败处理）、`createImageCropUploader`、12 字段 draft→running→succeeded/failed 任务流、幂等指纹、空字节/入库失败的错误码 |
| `web/src/features/tools/adapters/image-crop.test.ts` | 385 | 26 条测试 / 184 断言（比例同步、平台预设、自定义尺寸、换图重置、校验边界、12 字段 roundtrip、真实执行路径、SSR 渲染断言） |
| `web/src/components/tools/workspaces/crop.tsx` | 635 | 工作台 UI：复用 `ToolShell` / `ToolAssetInput` / `ToolResult` / `TaskStatusPanel`；顶部工具条（撤销/重做/重置/重新上传/下载图片/旋转/翻转/锁定比例）、尺寸调整 vs 比例调整双页签、目标尺寸（宽高联动 + 比例锁）、保存自定义尺寸、22 张平台预设卡、画布 + 裁剪框拖拽 |

关键行为（对齐规格 §3）：

1. **选平台**：写入 `platform` + `platformTitle` + `ratio` + `imageWidth/imageHeight`，并锁定该比例。
2. **拖裁剪框**：`selectedMode` 变 `free`，保留所选平台与比例，不静默丢掉 preset。
3. **锁定比例**：开启后改宽自动算高（双向），关闭后可自由输入。
4. **重新上传**：清空源图与画布变换（`resetForNewSource` 语义），保留格式 / 页签 / 自定义尺寸。
5. **下载图片**：用与提交同一个 `renderer.render(source.url, plan)` 实时导出当前裁剪结果并触发浏览器下载（真实字节，不是占位）。
6. **12 字段防丢参**：`composeImageCropFields` 恰好输出规格 §7 的 12 个字段，且 prompt 内嵌配置行可解析回完全一致的字段（测试覆盖）。

## 2. 如何验证

在工作区 `web/` 执行（bun 1.4.2）：

```bash
bun test src/features/tools/adapters/image-crop.test.ts
# 26 pass / 0 fail / 184 expect() calls
```

证据文件（均已落盘）：

- [task-017-verification.txt](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/task-017-verification.txt) — 26 条测试全绿原始输出
- [task-017-crop-render.html](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/task-017-crop-render.html) — 工作台初始态 SSR 渲染快照（23.7KB）
- [task-017-tsc.txt](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/task-017-tsc.txt) — `tsc --noEmit` 输出，**本任务 4 个文件 0 错误**

渲染证据实测（用 grep 复核，不是"看起来像"）：

```
crop-platform-* 卡片数 = 22      ← 与 IMAGE_CROP.json 的 22 张平台卡逐序一致
crop-submit     disabled=""      ← 无源图时提交禁用
crop-empty      出现            ← 无源图时不渲染画布
crop-reupload   disabled=""      ← 重新上传（无源图禁用）
crop-download   disabled=""      ← 下载图片（无源图禁用）
```

**平台卡保真核验**：从 `IMAGE_CROP.json` 抽出的尺寸序列（1600²/2000²/2000²/1200²/1600²/1200²/2048²/2000×1800/1600×2000/1340×1785/1200²/1080²/1080²/1024²×4/2000²×2/1024²×3，共 22 个）与 `PLATFORM_PRESETS` 逐项对应，DOM 里出现的平台名（亚马逊/沃尔玛/Etsy/美客多/eBay/Temu/Shopify/Shopee/Lazada/Wayfair/Cdiscount/Jumia/Rakuten/Wish/速卖通/Shein/TikTok/抖音/淘宝/京东）全部覆盖。（早期笔记记的"23 个"是误计，实际 DOM 就是 22 张卡。）

## 3. 未完成 / 风险

1. **页面挂载缺口（阻塞上线，非本任务可改）**：`crop.tsx` 已就绪，但 `web/src/pages` / `app` 下没有任何路由把 `IMAGE_CROP` 映射到 `<CropWorkspace />`（`registry/index.ts` 里 toolSpec 已有 IMAGE_CROP，`BATCH_TOOL_IDS` 也含它）。`tool-page.tsx` 不在本任务允许清单内，**故未改动**。需要负责路由/工具页的任务补一行 workspace 注册，工作台才能在浏览器里点开。
2. **`tsc --noEmit` 仓库级未全绿**：剩余错误全部来自并行的另一任务文件（`components/tools/workspaces/repair.tsx`、`features/tools/registry/printing-repair.ts`、`fix-color.ts` 的 `MaskHistory/MaskStroke` 导出与 `ToolSpec.label/description` 未定义等），与本任务 4 个文件无关，未越界修改。
3. **下载与提交的一致性**：下载走客户端 canvas 实时导出（当前裁剪框），提交走服务端任务流后入资产库。两者用同一 `plan`，但由于提交时的源图经上传接口换了 URL，理论上色彩/EXIF 方向在极端来源下可能有一像素级差异；已通过"结果过期标记"（改参数后提示重新生成）避免用户误解。
4. **未做真实浏览器端手工验收**：本环境无屏幕录制权限、裸 CDP 也不可用，故 UI 验收以 SSR 渲染断言 + DOM 文本比对代替。等第 1 条挂载补上后，建议在浏览器里点一遍：上传 → 选平台 → 拖框 → 锁定比例 → 下载 → 提交。

## 4. 使用入口

- 工作台组件：`web/src/components/tools/workspaces/crop.tsx` → `CropWorkspace`
- 状态/规则：`web/src/features/tools/registry/image-crop.ts`
- 执行/渲染：`web/src/features/tools/adapters/image-crop.ts`（`createCanvasCropRenderer`、`runImageCropTask`、`buildImageCropRequest`）
- 单测：`bun test src/features/tools/adapters/image-crop.test.ts`（在 `web/` 下）
