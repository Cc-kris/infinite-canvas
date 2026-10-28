# SALE_VIDEO 输入/输出差异对照

取证：2026-10-29，真实 UI 提交（非 mock），抓包见 `net.json`。

> 证据精度说明：`reqBody` 是页面内观测器截取的**前 3000 字符**（图片 dataURL 尾部被截断），但 `model / prompt / seconds / size / resolution_name / mode / ratio / images` 全部落在截断点之前，均可直接读证；未出现在截断体内的字段不作断言。

## 1. 输入侧：页面状态 → 请求体

| 页面控件（实测选中/取值） | 页面声明 | 实际请求体 | 是否一致 |
|---|---|---|---|
| 商品图 | `product.png 141 KB · 1024×744 · image/png`（资产 id `Av-jVHErVHd5JrI1RTwi6`） | `images=[1 张 dataURL]`（`multipart` 内联） | ✅ |
| 提示词（365/4000） | 可见脚本 + 「口播：…」 | `prompt` = 隐藏模板 v1 + 可见脚本（模板含目标市场/语言/成片/素材/结构/约束/模式） | ✅（模板化发送，符合设计） |
| 国家/语言 | `US（美国）` / `英语（English）` | 仅以文本形式写入 `prompt`（「目标市场：US（美国）；口播语言：英语（English）」） | ✅（无独立参数，见差异 D2） |
| 视频分辨率 | `720P`（aria-checked=true） | `resolution_name=720p` + `size=720x720` | ⚠️ 分辨率片段一致，但 `size` 为方形像素，不是 720P 对应画幅 |
| 视频时长 | `5秒`（aria-checked=true） | `seconds=6` | ❌ **不一致** |
| 视频比例 | `9:16`（aria-checked=true） | `ratio=1:1` | ❌ **不一致** |
| 模型 | `grok-imagine-video（ccai-tmp）` | `model=grok-imagine-video` | ✅ |
| 产物说明 | 「1 条 · 5 秒 · 720P」 | — | ❌ 与 `seconds=6/ratio=1:1` 矛盾 |

自证逻辑（不依赖任何外部信息）：**同一个请求体内**，`prompt` 里的模板文字写着「成片：5 秒 / 720P / 画幅 9:16」，而参数区写着 `seconds=6`、`ratio=1:1`。模板由页面状态生成，参数由全局配置生成 → 两者来源不同即证明参数未绑定页面。

## 2. 根因（代码级）

- `web/src/features/tools/adapters/sale-video.ts` → `buildSaleVideoBrowserInput()` 只返回 `prompt / references / model / fields`，**不返回 `size`，也不返回时长**。
- 页面选中的 `resolution/videoTime/aspectRatio` 只进了 `fields`（审计/指纹用，见 `buildSaleVideoFields`），不进执行链路。
- `web/src/services/api/tools/gateway.ts` → `buildToolConfig()` 仅按 `input.model` 覆盖模型；`ProviderInvocation` 只携带 `prompt/references/videos/audios/config`。
- `web/src/services/api/video.ts` → `createOpenAIVideoTask` 的 `seconds` 取 `normalizeVideoSeconds(config.videoSeconds)`、`size` 取 `config.size`（全局 AI 配置，当前 `videoSeconds=6`、`size=720x720`）。

即：**页面控件 → provider 参数 的通道缺失**（字段只到审计层）。

## 3. 输出侧差异（相对 LinkFox）

| 维度 | LinkFox | 本地结果 | 说明 |
|---|---|---|---|
| 产物 | 成片视频（Seedance） | **无产物**：`404 page not found · api.cc-ai.xyz/videos · HTTP 404 · 诊断码 provider-rejected` | 通道 ccai-tmp 无 `/v1/videos` 路由 |
| 任务 ID | 有 | 无（404 在创建阶段即失败，未产生 task id） | 上游失败早于 ID 分配 |
| 时长/画幅 | 遵循所选 5/10/15s 与比例 | 无法验证（无产物）；若通道可用，按当前代码会输出 6s/1:1，与页面所选不符 | D1 缺陷的后果 |
| 口播语音 | 按语言生成旁白 | 无法验证 | — |
| 结果动作 | 下载/保存/复刻 | 失败态只给「重试 + 诊断码」，无下载/存资产/发画布 | 见 `RESULT_ACTIONS.md`（失败态无产物，动作本应不出现） |

## 4. 差异清单

| ID | 级别 | 状态 | 内容 |
|---|---|---|---|
| D1 | **P1** | open | 页面「视频时长/视频比例/分辨率」未绑定到 provider 请求；请求恒用全局 `config.videoSeconds/videoSize`。用户选 5s/9:16，实际下发 6s/1:1（`prompt` 模板文字却写 5s/9:16 → 输出必然与声明不符）。建议：`ToolAdapterInput` 增 `videoSeconds?/videoSize?`，`buildToolConfig` 覆盖 `config.videoSeconds/size`，`sale-video` adapter 由 `videoTime+resolution+aspectRatio` 计算 `size`（如 720P+9:16 → 720×1280）并回传。 |
| D2 | P3 | open | 国家/语言无独立参数，仅拼进 `prompt` 文本；对支持原生 locale 参数的模型无法精确表达。 |
| D3 | P2 | open | 提交体未携带 `mode/aspect_ratio` 之外的编辑语义（如「标准模式」仅写在 prompt 里），属于同一类"参数文本化"问题。 |
| D4 | P2 | blocked | 无法端到端产出：ccai-tmp 无视频路由（外部约束，非实现缺陷）。 |

## 5. 复现命令

```bash
# 路由存在性（无鉴权即可区分 404/401）
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.cc-ai.xyz/v1/videos
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.cc-ai.xyz/v1/images/generations
```

页面复现：打开 `/tools/ai-video/sale-video` → 上传商品图 → 填口播 → 选 5秒/9:16/720P → 立即生成 → DevTools 看 `POST /v1/videos` 的 `seconds/size/ratio`。
