# agent-lf-realgen：图像工具真实生成验收

- 环境：`/tmp/ic-realgen` worktree（HEAD 49318799）`vite build` + `vite preview` 于 `127.0.0.1:3310`，避开 3000 的 HMR；代理 `127.0.0.1:23210`；图像渠道 CCAI gpt-image-2（Galley 钥匙串注入，只记长度）。
- 脚本：`web/scripts/real-acceptance/run-one.mjs`；证据：`docs/V1.0/e2e-1to1/20261105/real-generation/<TOOL>/run.json`（含 step-*.png / ui.png / result.png / download-*）。
- 每个工具先用 `IC_DRY=1` 零费用探针（上传、配置，不提交）核对选择器和张数，15 个工具都确认只出 1 张后再真实提交。

## 结果（每跑完一个追加一行）

| 工具 | 结果 | 上游请求与状态码 | 结果尺寸 | 下载校验 | 出图张数 |
| --- | --- | --- | --- | --- | --- |
| PRODUCT_IMAGE_SUITE（第 1 次） | 失败：页面「请求失败 / 1 张状态未确定」。原因是 canvas-proxy（PID 9252）在 20:47:04 被外部重启，正好打断本次 20:42 发出的请求；不是页面缺陷 | 脚本当时只记 requestfinished，断开的请求未入日志（已补 requestfailed） | - | 未执行 | 0（上游是否已计费未知，按 1 张计入上限） |
| PRODUCT_IMAGE_SUITE（第 2 次） | 通过 | images/edits 200 | 1024x1024 | 未执行：当次配方没写套图结果区「下载」按钮的选择器（无 testid），已补 `downloadSelector`；为控制费用不重跑 | 1 |
| DRESS_WEAR_SET | 通过 | images/edits 200 | 1024x1024 | 2073242B, 与源图不同=True | 1 |
| CHANGE_COLOR_V2 | 通过 | images/edits 200 | 1024x1024 | 2055261B, 与源图不同=True | 1 |
| SCALE_UP | 通过 | images/edits 200 | 1024x752 | 936684B, 与源图不同=True | 1 |
| AI_OUTPAINTING | 通过 | images/edits 200 | 1024x1024 | 1133826B, 与源图不同=True | 1 |
| NEW_REPLACE_BG_V2 | 通过 | images/edits 200 | 1024x1024 | 1187751B, 与源图不同=True | 1（上游只发 1 次；同一张图在 scene-grid 与 ToolResult 各渲染一次，选择器命中 2） |
| REPLACE_GOODS | 通过 | images/edits 200 | 1024x1024 | 1995265B, 与源图不同=True | 1 |
| PRODUCT_SCENE | 通过 | images/edits 200 | 1360x1024 | 2490502B, 与源图不同=True | 1 |
| HANDHELD_GOODS | 通过 | images/edits 200 | 1024x1024 | 1506516B, 与源图不同=True | 1 |
| AI_DRESSING_V2 | 通过 | images/edits 200 | 1024x1024 | 2141837B, 与源图不同=True | 1 |
| AI_POSTURE | 通过 | images/edits 200 | 1024x1024 | 2114529B, 与源图不同=True | 1 |
| AI_WEARABLE | 通过 | images/edits 200 | 1024x1024 | 2227724B, 与源图不同=True | 1 |
| PRINT_EXTRACT | 通过 | images/edits 200 | 1024x1024 | 1535293B, 与源图不同=True | 1 |
| SDS_DESIGN | 通过 | images/edits 200 | 1024x1024 | 2118061B, 与源图不同=True | 1 |
| IMAGE_TRANSLATION（第 1 次） | 失败：配方缺「识别文字」一步。图片 0 个文字框时「开始翻译」仍可点，只在配置栏顶部给出「这张图片还没有文字框」的提示，不发请求 | 无（零费用） | - | 未执行 | 0 |
| IMAGE_TRANSLATION（第 2 次） | 通过（识别文字 → 翻译全部目标语言 → 确认译文 → 开始翻译） | responses 404（文本渠道不支持 Responses，自动回落）,  chat/completions 200, chat/completions 200, images/edits 200 | 1024x1024 | 1034716B, 与源图不同=True | 1 |

注：同一工具重跑会覆盖 `run.json`，PRODUCT_IMAGE_SUITE / IMAGE_TRANSLATION 目录里留的是第 2 次的证据，第 1 次的情况以上表为准。

**合计**：15 个工具全部通过，成功出图 15 张（每个工具 1 张）。PRODUCT_IMAGE_SUITE 第 1 次请求可能已在上游计费，按最坏情况算上限占用 16 张，低于 30 张上限。没有工具因最少出 4 张以上被跳过。IMAGE_TRANSLATION 另有 1 次 OCR 和 1 次逐框翻译的文本请求，不产出图片。

## 页面上发现的问题

所有工具都没有出现「提交后无结果」「拿到结果但下载失败」或 pageerror。以下是交互层面值得主代理判断的点：

1. **IMAGE_TRANSLATION：门禁没拦住时「开始翻译」仍可点**（`translate.tsx` 第 733-740 行）。按钮只在 `busy / 无图 / 无目标语言` 时禁用；没有文字框、缺译文或未「确认译文」时点击只在页面顶部给出提示，不发请求，按钮附近没有任何反馈。真实流程需要依次完成 识别文字 → 展开结果区折叠的「校对」 → 翻译全部目标语言 → 确认译文，而「校对」默认收在两层 `<details>` 里，很难找到。证据：第 1 次运行的 `ui.png` 已被覆盖，可以用上面的流程复现。
2. **AI_DRESSING_V2 / NEW_REPLACE_BG_V2：同一张结果图渲染两次**：一次在共享 ToolResult，一次在工作台自绘区（`dressing-results` 中带「已生成 1 张」的卡片，`scene-grid`）。功能正确，但右栏占了两份空间。证据：`real-generation/AI_DRESSING_V2/ui.png`。
3. **PRODUCT_IMAGE_SUITE：代理被重启时只显示「1 张状态未确定，请到历史记录确认」**，没有可直接重试的入口。这一行为符合「不重复提交」的设计，这里只做记录。

## 配方改动（`web/scripts/real-acceptance/run-one.mjs`）

- 删掉 8 个由主代理重写的工具配方：AI_TEXT、ORNAMENT_TEXT、PRODUCT_MARKET_MATERIAL、AI_POSE_GENERATOR、AI_DRESSING_XSY、FISSION_LINK、MATERIAL_UPPER_BODY、SCENE_TRANSFER。
- IMAGE_CROP：**删除配方**，没有改成 crop-download。原因是该工具零算力、没有生成环节，已由 `crop-functional-accept.mjs` 单独验收；`all` 改为直接遍历全部配方。
- 按探针结果修正配方：
  - CHANGE_COLOR_V2：提色默认 5 个方案（= 5 张），改为只留 1 个方案。
  - DRESS_WEAR_SET：智能品牌基因要求先选商品类目、销售地区、语言。
  - NEW_REPLACE_BG_V2：蒙版模式改为上传 `fixtures/mask-watch.png`，页面上没有可涂抹的画布，所以保留了这个 fixture。
  - AI_DRESSING_V2 / AI_POSTURE：先展开折叠的 details。
  - AI_DRESSING_V2 / AI_WEARABLE：本地没有模特库，改为上传 `model-portrait.png`。
  - SDS_DESIGN：没有默认商品，需要分别上传商品图和素材（素材走「上传素材」弹窗）。
  - IMAGE_TRANSLATION：补上 OCR、翻译、确认三步。
  - AI_OUTPAINTING：原 resultSelector 只匹配空态。
  - SCALE_UP / DRESS_WEAR_SET / IMAGE_TRANSLATION / PRODUCT_IMAGE_SUITE：补准结果和下载选择器。
- `run.json` 新增 `resultCount`。
- `lib.mjs`：保留上一轮的 `applyProxyConfig(...).catch(() => null)`，并新增 `requestfailed` 记录，让连接断开的请求也能写进 network。
- 删除探针 `_realgen-probe2.mjs`；worktree `/tmp/ic-realgen` 已移除，3310 预览已停止。
