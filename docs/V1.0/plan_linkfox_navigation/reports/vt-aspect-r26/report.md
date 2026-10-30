# r26 · VIDEO_TRANSLATION 输出画幅修复（画幅不再被全局 1:1 重构图）

- 分支：`feat/linkfox-v1-real`
- 日期：2026-10-30
- 范围：`video-translation` 一条链路（registry / adapter / workspace / 回归测试）；未改全局配置默认值；未碰工作区里既有的 `use-asset-store.ts` 改动

## 1. 问题（实测证据，非推断）

真实源片 `/tmp/r22f-source.mp4`：`ffprobe` h264 **1344×768**，5.1667s，sha256 `56226153eb7e1f8b9b8a5db680ffc966bc2b2da81f4411005fd33de1212a3acf`。
用它跑真实 VIDEO_TRANSLATION，上游产物是 **768×768**（方形）。

证据（既有文件，未改动）：

| 文件 | 事实 |
| --- | --- |
| `evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-video.mp4` | `ffprobe` 768×768 / 6.583s |
| `evidence/real-acceptance/VIDEO_TRANSLATION/downloaded.mp4` | `ffprobe` 768×768 |
| `evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/REPORT.md` F3 | 已记录「画幅被改：1344×768 → 768×768 … 与配置 `size=1:1` 一致」 |

根因链（读码确认）：

1. 全局默认 `size = "1:1"`（`web/src/stores/use-config-store.ts:148`）。
2. `buildToolConfig`（`web/src/services/api/tools/gateway.ts:180`）只有在收到 `input.videoRatio` 时才把 size 换算成像素串，否则把 `"1:1"` 原样下传。
3. provider `createOpenAIVideoTask`（`web/src/services/api/video.ts:329`）`normalizeVideoSize("1:1","720")` → `computeVideoSize` → `"720x720"`，`ratio` → `1:1`。
4. 上游按 `ratio=1:1` 构图，返回 768×768（其像素网格对齐结果）。

即：一个「保持原画面、只换译制音轨/字幕」的工具，画幅被全局出图默认值接管。

## 2. 修复

### registry `web/src/features/tools/registry/video-translation.ts`

- `VideoTranslationValues.outputRatio`，默认 `"source"`（跟随原视频）。
- `VIDEO_TRANSLATION_OUTPUT_RATIOS` = `source` + 上游真实档位（取自 `media-size.videoRatioOptions`，去 `auto`）：`16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9`。
- `planVideoTranslationOutput(source, requested, resolution)`：
  - `source` → 按源像素宽高比在档位里取最接近一档（相对误差 ≤0.5% 视为一致），像素尺寸由 `computeVideoSize(resolution, ratio)` 推；
  - 源尺寸未知 → 回落 `16:9`；
  - **任何情况都产出 `notice`**，说明「申请了什么 / 源是什么 / 是否逐像素保持」，不静默裁切；
  - 显式选档且源尺寸未知时措辞改为「无法核对是否与原画面一致」，不谎称「无法跟随原画幅」。
- 草稿序列化/解析、`createVideoTranslationSnapshot` 指纹均含 `outputRatio`（改画幅 → 旧结果 stale）。非法值回落 `source`。

### adapter `web/src/features/tools/adapters/video-translation.ts`

- `buildVideoTranslationBrowserInput` 输出 `videoRatio: plan.ratio` → 网关据此把 size 换成像素串。
- 新增 `resolveVideoTranslationOutputPlan(values, source, resolution)`，UI 与请求共用同一判定（不允许两套算法）。
- `BuildVideoTranslationInputArgs.resolution?`：传全局 `vquality`，档位与请求一致。

### workspace `web/src/components/tools/workspaces/video-translation.tsx`

- 输出区新增「输出画幅」下拉：`data-testid="video-translation-output-ratio"`，7 个选项，默认「跟随原视频」。
- 偏差提示：`data-testid="video-translation-aspect-notice"`（amber `role="alert"`）。
- 提交时带 `resolution: config.vquality`。

## 3. 验证

### 3.1 单元 + 协议级

`bun test src/features/tools/adapters/video-translation.test.ts` → **39 pass / 0 fail，131 断言**（新增）：

- 默认画幅 `source`，档位集合与顺序固定；
- 真实源 **1344×768**（1.75，与 16:9 相对误差 1.6% > 0.5%）→ 档位 `16:9` → 申请 `1280x720`，`preservesSource=false` 且 `notice` 明说不是逐像素保持；
- 1568×768 → `21:9`；1080×1920 → `9:16`；720×720 → `1:1` 且 `preservesSource=true`；源尺寸缺失 → 16:9 + 提示；
- **协议级**：`buildToolConfig({size:"1:1"}, "video", {videoRatio:"16:9"})` → `size="1280x720"`；该串满足 `^\d+x\d+$`（`normalizeVideoSize` 原样透传进 body），且 `inferVideoRatio("1280x720")==="16:9"`（body 的 `size`/`ratio` 自洽，不会二次构图）；对照固化旧行为 `"1:1" → "720x720"`；
- 请求带 `videoRatio`，`fields` 仍严格 7 项（不污染 provider 字段）；草稿读写保留画幅，改画幅使快照 hash 变化。

### 3.2 回归面

- `bun test src/features/tools src/services/api/tools` → **1269 pass / 0 fail**（54 文件）。
- `bunx tsc --noEmit` → **0 错误**。

### 3.3 真实 UI（dev server `127.0.0.1:3000`，只读验收，未发翻译）

`/tools/ai-video/video-translation` DOM 实测：

- 下拉存在、7 选项、默认值 `source`；
- 未上传原视频时提示：`读不到原视频分辨率，无法按原画幅提交：本次按 16:9（1280x720）申请，上游实际返回画幅以上游为准`；
- 原生 setter 切到 `9:16` 后提示实时变为：`已选 9:16（720x1280）；读不到原视频分辨率，无法核对是否与原画面一致`。

验收用的浏览器标签就地导航回原页面，未新增/未关闭用户标签。

## 4. 未做 / 风险

1. **未重跑真实翻译**（按要求不复跑长任务）：上游收到 `ratio=16:9` 后是否稳定返回 16:9，仍**未经实测**；本次只证明请求侧画幅正确 + 提示诚实。
2. 上游仅支持固定档位：1344×768（7:4）无法逐像素保持，实际会是 16:9（1280×720 申请）并按比例缩放/补边；UI 已明示，不做任意比例透传。
3. 源尺寸依赖上传探测；探测失败时回落 16:9 并提示，不假装保持。
4. 历史任务/结果不做画幅迁移。
5. 工作区里 `web/src/stores/use-asset-store.ts`、`project_memory.md` 为既有改动（非本次），未纳入提交。

## 5. 使用入口

- 页面：`/tools/ai-video/video-translation` → 配置面板「输出」区 → **输出画幅**（默认「跟随原视频」），下方即偏差说明。
- 代码入口：`planVideoTranslationOutput` / `VIDEO_TRANSLATION_OUTPUT_RATIOS`（registry）；`resolveVideoTranslationOutputPlan`（adapter，UI 与请求共用）；生效点在 `gateway.buildToolConfig` 的 `videoRatio` 分支。
