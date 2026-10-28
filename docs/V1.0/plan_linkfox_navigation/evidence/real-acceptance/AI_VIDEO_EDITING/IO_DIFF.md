# AI_VIDEO_EDITING 输入/输出差异对照

取证：2026-10-29 干净重跑（清空该工具草稿后用页面内 `DataTransfer` 真实入库，非 mock），抓包见 `net.json`。

> 证据精度：`reqBody` 为观测器抓取的 multipart 摘要（字段级，二进制以 `[file N b]` 表示），字段完整可读。

## 1. 输入侧：页面状态 → 请求体

| 页面控件（实测） | 页面声明 | 实际请求体 | 一致 |
|---|---|---|---|
| 原视频 | `06-result-video.mp4 1.2 MB · 1344×768 · video/mp4`（IMAGE_TO_VIDEO 真实产物） | `video[]=[file 1297168b]` + `first_frame=[file 144874b]` | ✅ |
| 参考图 | `product.png 141 KB · 1024×744 · image/png`（1/30） | `images=[file 144874b]` | ✅ |
| 截取区间 | `0–5.2 秒（共 5.2 秒）`；按钮旁「1 条 · 5.2 秒」 | 仅以文本进入 `prompt`：「源视频取自 0–5.2 秒…」「输出：1 条视频，时长约 5.2 秒」；参数区 `seconds=6` | ❌ **不一致** |
| 编辑需求 | 38 / 2500 字符 | `prompt` = 模板 v1 + 需求文本 | ✅ |
| 视频类型 | `商品人物精准编辑` | 以文本进入 `prompt`（「编辑类型：商品人物精准编辑」），无独立参数 | ⚠️ 文本化（可用但不精确） |
| 输出画幅 | 未提供画幅控件（预期跟随源视频 1344×768） | `size=720x720`、`ratio=1:1`（全局配置默认） | ❌ **不一致**（横屏源片 → 方形输出） |
| 分辨率 | 无控件 | `resolution_name=720p` | — |
| 模型 | `grok-imagine-video（ccai-tmp）` | `model=grok-imagine-video` | ✅ |
| 音频/水印 | 无控件 | `generate_audio=true`、`watermark=false`（全局配置） | 说明：默认值下发 |

## 2. 根因（代码级）

- `ai-video-editing` adapter 的 browserInput 同样只携带 `prompt/references/videos/model/fields`；截取区间与类型只写入 `prompt` 文本与 `fields`（审计）。
- `gateway.ts` 的 `ProviderInvocation` 只带 `config`；`createOpenAIVideoTask` 的 `seconds/size` 取自全局 `config.videoSeconds`（=6）与 `config.size`（=720x720）。
- 因此：**"编辑类"应跟随源视频的本征属性（时长/画幅）没有跟随**——这正是 P1 缺陷 D1 在视频编辑场景下的表现。

## 3. 输出侧差异

| 维度 | LinkFox | 本地（本轮） | 说明 |
|---|---|---|---|
| 产物 | 编辑后视频（Seedance 2.5） | **无**：`404 page not found · api.cc-ai.xyz/videos · HTTP 404 · 诊断码 provider-rejected` | 通道 ccai-tmp 无 `/v1/videos` |
| 任务 ID | 有 | 无（创建即 404） | — |
| 时长 | 跟随截取区间（≤30s） | 不可验证；按当前代码会是 6s | D1 |
| 画幅 | 跟随源视频 | 不可验证；按当前代码会是 1:1 方图 | D1 |
| 结果动作 | 下载/保存/复刻 | 失败态仅「重试 + 诊断码」 | 见 `RESULT_ACTIONS.md` |

## 4. 差异清单

| ID | 级别 | 状态 | 内容 |
|---|---|---|---|
| D1 | **P1** | open | 截取时长与输出画幅未绑定到请求：`seconds`/`size` 恒取全局配置。视频编辑场景下应为「跟随源视频（5.2s / 1344×768）」或「跟随截取区间」，而不是 6s / 1:1。建议在 adapter 计算 `videoSeconds=ceil(clipEnd-clipStart)`、`videoSize` 由源视频宽高比推导，并在 `buildToolConfig` 覆盖。 |
| D2 | P2 | open | `readVideoMeta/readAudioMeta` 无超时：本条本轮再次实测复现——后台标签上传视频时进度条停在「读取 100%」不动，置前标签后 ~8s 内正常完成并显示 `1344×768`。（沿用既有 D2，本轮补实证） |
| D3 | P2 | open | 清空草稿前，历史污染态下两个上传区会同时显示彼此素材（`product.png` 出现在原视频区、`06-result-video.mp4` 出现在参考图区）。根因是 `DOM.setFileInputFiles` 绕过 `accept`（自动化侧），真实用户选择不受影响；清空草稿后分区正确。记为边界行为，**不计为产品缺陷**。 |
| D4 | P2 | blocked | 无法端到端产出：ccai-tmp 无视频路由（外部约束）。 |

## 5. 复现步骤

1. 打开 `/tools/ai-video/ai-video-editing`（若历史草稿污染，删除 IDB `infinite-canvas/app_state` 中 `tool-draft:v1:AI_VIDEO_EDITING` 后刷新）。
2. 原视频上传 `06-result-video.mp4`（1344×768, 5.2s），参考图上传 `product.png`；等待两者读出像素（需标签在前台）。
3. 填需求 → 立即生成 → DevTools 查看 `POST /v1/videos` 的 multipart 字段：`seconds=6; size=720x720; ratio=1:1`，而 `prompt` 内写「时长约 5.2 秒」。
