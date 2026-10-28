# TASK-016 实施报告：CHANGE_COLOR「一键换色」真实工作台

- 分支：`feat/linkfox-v1-real`
- 提交：`441c7a4` — feat(tools): CHANGE_COLOR 一键换色真实工作台（区域蒙版+目标色/参考色+去杂色/细调/光影+16字段防丢参自检）
- 规格：`page-specs/09-change-color.md`、`tool_specs.json#CHANGE_COLOR`（makeType 19，layout `color`，batchCapable true，字段 16 个）
- 对应验收：TC-024 / AC-024

## 1. 改了什么

| 文件 | 变更 |
| --- | --- |
| `web/src/features/tools/registry/change-color.ts`（新增，596 行） | 页面契约与纯逻辑：工具常量/路由/草稿键、源图与参考图限制、`REGION_PRESETS`（整图主体/衣服/上装/下装/鞋/包/配饰/假发/自定义，自定义 40 字上限）、去杂色与 `ADJUSTMENT_CONTROLS`（色相/饱和度/明度/对比）、`LIGHT_STRENGTH_LIMITS`/`BALANCE_LIMITS`/`COLOR_CURVES`（线性/柔光/S曲线/强对比）、收藏色卡增删去重上限、`clampToRange` 越界夹取、`readChangeColorValues` 草稿容错收口（未知键丢弃、蒙版本体不入草稿只留 `hasMask`）、`validateChangeColorSource`/`validateChangeColorState`（就地原因）、**16 字段唯一出口** `buildChangeColorFields`、快照指纹 `changeColorFingerprint` + `isChangeColorSnapshotStale`、`snapshotFieldSummary` |
| `web/src/features/tools/adapters/change-color.ts`（新增，411 行） | 真实链路：`toChangeColorReference`/`toMaskReference`（原图 + 蒙版 + 可选颜色参考图）、`buildChangeColorInput`（`imageUrl/sourceImageUrl/imageSize/imageWidth/imageHeight/imageFormat/imageName/imageTagData/imageSegUrl/imageMaskUrl/doInpaint/colorParams/adjustLight/coverList/images/name` 全部落点）、`assertChangeColorInput` 自检（字段缺失/被清空/与页面状态不一致 → 本地抛 `ChangeColorAdapterError`，**绝不发出坏请求**）、`runChangeColor` 走共享 `TaskGateway`（提交→轮询→可重试，首次即终态不再轮询）、`changeColorResultFromTask`（上游成功无图 → 如实报错，不造占位图；旧任务结果标 `stale`） |
| `web/src/components/tools/workspaces/color.tsx`（新增，985 行） | 工作台 UI，10 个分区：图片（上传/重新上传/任务名/源图尺寸格式）、颜色 / 参考图（取色器 + HEX 输入 + 收藏色卡 + 参考图上传取色）、区域（预设枚举 + 自定义 + 画布涂抹导出真实蒙版 PNG）、去杂色（开/关）、颜色细调（4 滑杆 + 重置 + 汇总）、光影与边缘（开关/强度/边缘保护/边缘修复/色调平衡/曲线 + 重置 + 汇总）、生成（阻塞原因就地列出 + 「立即生成（10 算力）」）、本次提交（16 字段快照可展开核对）。前后对比滑块只在真实原图与真实结果同时存在时渲染 |
| `web/src/features/tools/adapters/change-color.test.ts`（新增，283 行） | 16 条契约测试 |
| `web/src/components/tools/workspaces/color.test.tsx`（新增，80 行） | 4 条 SSR 渲染测试 |

其它并行任务的文件（`mask.tsx`、`remove-pen.*`、`crop.tsx`）未触碰。

## 2. 怎么验证

```bash
cd web
PATH=/opt/homebrew/bin:/usr/bin:/bin:$HOME/.bun/bin bun test \
  src/features/tools/adapters/change-color.test.ts \
  src/components/tools/workspaces/color.test.tsx
PATH=/opt/homebrew/bin:/usr/bin:/bin npx tsc --noEmit -p tsconfig.json
```

- 测试：**20 pass / 0 fail / 103 expect() calls**（证据 `evidence/task-016-verification.txt`、`evidence/task-016-verification-full.txt`）
- 类型：`npx tsc --noEmit` **全仓 exit=0，0 个 error**（同上证据文件末段）
  - 注：TASK-015 报告里提到的 `change-color.test.ts:81 Cannot find name 'lightSummary'` 就是本任务在写过程中的中间态，已修掉，现全仓干净

### 测试覆盖到的契约点

- 16 字段与 `registry/index.ts` 的 `f("...")` 列表**逐个同名**（脚本比对：`same set: True diff: set()`）
- 提示词真的带目标色 `#B3261E`、区域描述、去杂色、细调数值、光影选项，不是模板空话
- 篡改/清空任一字段 → `assertChangeColorInput` 抛错且 gateway `submit` 计数保持 0（防丢参）
- `doInpaint` 无蒙版 → 校验直接给 `mask-required`
- 快照指纹同值稳定、改色即变；task 快照与当前快照不一致 → `stale: true`
- 草稿：非法 HEX/未知区域/越界滑杆（hue 999 → 180）回到安全值；蒙版 base64 不进草稿
- 配置不合法时本地拒绝，**不产生一次真实提交**

### 渲染证据

`evidence/task-016-render.html`（19,732 字节真实 SSR 输出），可核对的点：

- 分区标题（`<h3>`）实测：图片 / 上传素材 / 颜色 / 参考图 / 上传素材 / 区域 / 去杂色 / 颜色细调 / 光影与边缘 / 生成 / 本次提交
- 31 个 `data-testid`（`change-color-source/color/hex/swatches/region/noise/adjust/light/submit/issues/generate/snapshot…`）
- 区域预设实测文案：整图主体、衣服、上装、下装、鞋、包、配饰、假发、自定义
- 未上传原图时：生成按钮**真实带 `disabled=""`**；`change-color-issues` 列出「请先上传…」；不渲染涂选画布与前后对比（`change-color-compare-section` 不存在），也没有「生成中」
- 光影优化默认开启（`adjustLight = "on:50"`）且强度滑杆可调，按钮标注「立即生成（10 算力）」

## 3. 真实边界（不造假的部分）

- 区域蒙版是画布真实笔画按原图尺寸导出的 PNG（白=命中、黑=保留），上传后才渲染涂选区；无蒙版时 `doInpaint` 与蒙版字段保持空，不编造
- 提交 = 一次真实图像编辑请求，参考图 1~2 张：`[原图, 蒙版PNG]`，可选第 3 张颜色参考图；`images` 只在有参考图时非空
- 上游成功但无图 → 结果区报错并允许重试，**不生成占位图、不伪造成功**
- 没有原图就不编造输出尺寸/画布/对比；尺寸、格式全部来自真实资产记录
- `coverList`：`tool_specs` 里是 `asset-list` 且非必填，本页没有套图选择器 → 如实为空数组（区域描述走 `imageTagData.region/regionText` 与提示词），不塞假封面

## 4. 未完成 / 风险

- **页面挂载未接线**：仓库当前没有把 `workspaces/*` 挂进路由的映射（`features/tools/tool-page.tsx` 只是规格浏览页，`router.tsx` 的 `/tools/:category/:toolId` 指向它）。这与并行任务（TASK-013/015 的 crop/mask/enhance）现状一致——工作区组件 + 契约 + adapter 是交付物，接线属独立任务，本次未越界改动 `tool-page.tsx`/`router.tsx`
- **`workspaces/color.tsx` 与 TASK-010（CHANGE_COLOR_V2 套图换色）共用同一路径**：本任务先落地为单图换色版（TASK-016）。TASK-010 若后续开工需在同一文件上增量（套图选择 + 逐张微调），可能产生冲突，建议那时改为按 layout 拆分或 TASK-010 复用本页组件
- 真实上游联调（网关实际返回）未在本任务内跑：`runChangeColor` 已按 `TaskGateway` 契约用 fake gateway 全覆盖，真实 key/额度取决于运行环境
- `light.enabled` 收口为 `!== false`（只有明确 false 才关），草稿里的脏值不会误关开关；若产品要求严格布尔，需要另行约定
