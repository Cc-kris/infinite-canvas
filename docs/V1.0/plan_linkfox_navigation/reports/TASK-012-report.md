# TASK-012 高清放大（SCALE_UP）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`1105251` feat(tools): TASK-012 高清放大 SCALE_UP 注册表+适配器+放大工作台
- 规格来源：仓库根 `SCALE_UP.json`（2026-10-28 页面 DOM 实测采集）
- 变更规模：5 文件 / +1584 行（新增，无改动他人文件）

## 1. 交付内容

| 文件 | 作用 |
| --- | --- |
| `web/src/features/tools/registry/scale-up.ts` | 页面契约：4 模式、3 档质量、原图/输出尺寸上限、尺寸对齐与校验、提示词、草稿 schema、快照 fingerprint |
| `web/src/features/tools/adapters/scale-up.ts` | 真实 provider 适配：原图校验、请求组装（size/quality/fields）、提交+轮询+重试、结果归一、快照比对 |
| `web/src/features/tools/adapters/scale-up.test.ts` | 25 条契约测试（尺寸数学、校验、防丢参、真实执行路径注入替身网关） |
| `web/src/components/tools/workspaces/enhance.tsx` | 放大工作台 UI：模式/自定义尺寸联动、质量档位、面部美化、输出尺寸实时映射、生成/取消/重试、前后对比滑块 |
| `web/src/components/tools/workspaces/enhance.test.tsx` | 3 条渲染测试（服务端真实渲染组件 HTML 断言） |

## 2. 关键实现点（对齐页面规格）

- **四种模式**：变高清（1×）、高清+2倍放大（2×）、高清+4倍放大（4×）、自定义 —— 与 `SCALE_UP.json` 采集到的按钮文案逐字一致。
- **尺寸数学**：输出宽高按 provider 规则对齐到 16 的倍数（`alignToStep`），并校验最小像素 `655360`、最大像素 `8294400`、最大边 `3840`、最大比例 `3`；不合法时给出可执行的原因，而不是静默换尺寸。
- **未上传原图**：输出尺寸不回退成 `16×16` 之类的编造值，返回 `width/height = 0` + `source-size-unknown` 提示（这是写测试时抓到的真实 bug，已修）。
- **自定义尺寸**：宽高联动保持原图比例；比例偏差超出容差即报错，不会带着错比例提交。
- **原图约束**：JPG/PNG/WEBP，单边 ≤4096（与页面一致）。
- **面部美化**：有 `FaceDetector` 时为 detected/absent/unavailable 三态；检测到无人脸则阻塞并说明原因，绝不"乐观放行"。
- **提示词**：把输出尺寸、倍率、质量档位、面部开关写死在 prompt 里，避免模型自由发挥。
- **防丢参**：请求体 `size` 与 `quality` 之外，`imageOutputWidth/imageOutputHeight/magnification/enhanceFace/enhanceQuality/imageUrl/imageName` 全量进 `fields`；`guardScaleUpRequest` 能识别被篡改的请求（丢参/换尺寸/换质量）。
- **快照**：记录原图 assetId+尺寸+参数 fingerprint；参数或原图变化后结果标记 stale，提示重新生成。
- **算力区**：按仓库既有约定（见 `product-image-suite.ts`、`ai-outpainting.ts` 注释）不复刻原站"算力"文案，`立即生成(20算力)` 的算力部分不进入 UI。

## 3. 验证证据（跑出来的，不是读代码）

```
# 1) 契约 + 渲染测试
$ cd web && bun test src/features/tools/adapters/scale-up.test.ts src/components/tools/workspaces/enhance.test.tsx
 28 pass / 0 fail / 121 expect() calls

# 2) 全量回归（确认未污染他人测试）
$ cd web && bun test
 341 pass / 0 fail / 2852 expect() calls / 17 files

# 3) 类型检查（只看我的文件）
$ cd web && bunx tsc --noEmit -p tsconfig.json | grep -E "scale-up|enhance"
 （无输出 = 干净）
```

渲染测试断言的是**真实渲染出的 HTML**：分区标题、四个模式文案、三档质量、4096 上限提示、未上传时按钮 `disabled=""` 且不出现"生成中"、未上传时不渲染前后对比区。

## 4. 未完成 / 风险

1. **组件挂载未接线（非本任务范围）**：`tool-page.tsx` 目前只把 `layout` 当规格字段展示（第 285 行 `SpecRow label="layout"`），仓库尚无 layout→工作台组件的解析器。我的 `enhance.tsx` 默认导出已按注册表 `layout: "enhance"` 命名，接线时直接映射即可。
2. **批量高清放大**：`SCALE_UP` 已在 `BATCH_TOOL_IDS` 中，批量能力由 TASK-007 批量工作台承载，本任务只做单据工作台。
3. **真实 provider 未联调**：适配层用注入网关替身验证契约（提交/轮询/重试/结果归一），未经真实 LinkFox 端点（需 token，按规范不落盘）。字段白名单来自既有 gateway 的 SCALE_UP 能力声明。
4. **`FaceDetector`**：浏览器实验特性，多数环境返回 `unavailable`，此时不阻塞生成（有明确提示），只在检测到 absent 时阻塞。
5. **其他 worker 的在飞类型错误**：本次收尾时全项目 `tsc --noEmit` 仅剩 4 处报错，全部位于 `web/src/components/tools/workspaces/mask.tsx`（`getToolCatalog` 未导出、两处隐式 any、`AreaRepairSnapshot` 参数不匹配），不属本任务文件，未触碰；我的 5 个文件类型检查干净。

## 5. 使用入口

- 契约/常量：`web/src/features/tools/registry/scale-up.ts`（`computeOutputSize`、`validateScaleUpState`、`buildScaleUpPrompt`、`createScaleUpSnapshot`）
- 执行：`web/src/features/tools/adapters/scale-up.ts`（`buildScaleUpRequest`、`runScaleUp`、`guardScaleUpRequest`）
- UI：`web/src/components/tools/workspaces/enhance.tsx`（默认导出 `ScaleUpWorkspace`，`data-tool="scale-up"`）
- 测试：`bun test src/features/tools/adapters/scale-up.test.ts src/components/tools/workspaces/enhance.test.tsx`
