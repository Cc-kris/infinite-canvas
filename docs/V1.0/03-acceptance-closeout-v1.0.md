# V1.0 验收收口报告（39 工具 · 六维矩阵）

- 分支：`feat/linkfox-v1-real`
- 收口基线：`c72d6dc6`（VT 语言硬契约）+ 四闸复验 `649ed686`
- 矩阵基线：`2b52ba02`（R31 独立矩阵，39 工具 × 六维 = 234 单元）
- 收口日期：2026-10-30

## 1. 结论

**39 个工具全部交付；六维矩阵 234 个单元中 233 个 PASS，1 个 PARTIAL（`VIDEO_TRANSLATION.F`），0 个 FAIL。**

| 维度 | 含义 | PASS | PARTIAL | FAIL | BLOCKED | N/A |
| --- | --- | --- | --- | --- | --- | --- |
| F 功能 | 真实产出可用结果 | 38 | **1** | 0 | 0 | 0 |
| T 提交 | 真实上游受理（taskId/200） | 39 | 0 | 0 | 0 | 0 |
| R 恢复 | 刷新后结果与表单可复原 | 39 | 0 | 0 | 0 | 0 |
| H 历史 | 历史记录三动作（下载/存资产/发画布） | 39 | 0 | 0 | 0 | 0 |
| K 密钥 | 渠道密钥与模型路由 | 12 | 0 | 0 | 0 | 27 |
| U 上传 | 素材上传/引用链路 | 39 | 0 | 0 | 0 | 0 |

> K 维只对 12 个需要多模态密钥/特殊路由的工具适用，其余 27 个记 N/A（不参与断言）。

唯一非全绿单元：

| 工具 | F | T | R | H | K | U |
| --- | --- | --- | --- | --- | --- | --- |
| VIDEO_TRANSLATION | **PARTIAL** | PASS | PASS | PASS | N/A | PASS |

即：**提交、恢复、历史三动作、上传全部真实通过，只有「成片译制质量」这一格受上游渠道能力限制。**

## 2. 为什么 `VIDEO_TRANSLATION.F` 是 PARTIAL（外部依赖，非代码缺陷）

### 2.1 协议事实

- 上游 `/v1/videos` **没有 `target_language` 字段**，目标语言只能写进提示词。
- LinkFox 真实链路走的是 **`SEED_V25` 视频翻译模型**（`web/src/services/api/video-translation-seed-v25.ts`，含网关闸门与 JSON 提交，已在 `45fe59a6` 落地）。

### 2.2 渠道实测（本轮取证）

用只读脚本直连 `/v1/models`（密钥仅从 Galley keychain 读入内存，不落盘、不打印）：

| 渠道 | 结果 | 可用视频翻译模型 |
| --- | --- | --- |
| CCAI `api.cc-ai.xyz` | 200，共 **3** 个模型 | 无（仅 `gpt-image-2`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`） |
| SiliconFlow `api.siliconflow.cn/v1` | 200，共 **98** 个模型 | 无（有 ASR/MT/TTS/视频生成，但无视频翻译模型） |

### 2.3 已做的代码侧收窄

即便没有专用翻译模型，代码侧也已把「通用视频模型能否近似译制」做到最好（`c72d6dc6`）：

- 目标/源语言写入 **BCP-47 代码**（`en-US`/`zh-CN`/`ja-JP`），不再只给中文标签；
- 中英双语语言契约，最高优先级锁死音轨与字幕语言；
- **显式禁止朗读/复述提示词**，无声源片不得编造旁白（r26 实测过「成片音轨就是提示词本身」）；
- 审计新增 `languageContract`/`rules` 两段，缺失即报错。

### 2.4 真实运行结论（两轮真实任务，两个方向都测过）

| 轮次 | 目标语言 | 成片音轨实际 | 客观判据 | 判定 |
| --- | --- | --- | --- | --- |
| r24 | 英语 | **中文** | LID `zh` p=0.987~0.997，ASR 解出中文 | **FAIL** |
| r26 | 中文 | **英语** | 音轨仍为源片语言 | **FAIL（翻译未发生）** |

r24 更严重的一条：结果音轨的中文内容**不是对源片台词的翻译**，而是一句**在朗读任务说明**的中文——这正是 `c72d6dc6` 加入「禁止朗读/复述提示词、无声源片不得编造旁白」规则的原因；该缺陷已在 r26 复验中消失，但**跨语言译制本身仍未发生**。

结论：通用视频模型不做跨语言译制，`F` 维度如实判 PARTIAL，不做「已打通」表述。

## 3. 产品行为（用户看到的）

`73075698` 起工具页**诚实降级**，实际文案（`web/src/i18n/locales/zh-CN.ts` 846-873 行）：

| 位置 | 真实文案 |
| --- | --- |
| 能力徽标 | `AI 视频重生成（实验）· 非逐句翻译 / 口型对齐` |
| 常驻提示标题 | `当前为 AI 视频重生成，非逐句翻译 / 口型对齐；真实翻译通道未接入` |
| 提示正文 | 「上游视频接口没有源语言、目标语言与口型同步参数：下面选择的目标语言只会写进提示词，不能保证换语言、换字幕或对齐口型。结果请按「未验证草稿」处理，人工确认后再用于投放。」 |
| 口型开关 | `口型同步（当前渠道不支持）`，置灰；提示「上游无 lipSync 参数：开关已置灰，提交时不带该字段，也不做逐句口型对齐」 |
| 结果标题 | `AI 重生成结果（未验证翻译）` |
| 侧边栏 | 「保留入口与历史任务；当前只能按提示词重生成视频，不代表译制完成」 |

即：**不出现「翻译完成 / 已译制 / 已对口型 / 已生成字幕 / 已识别源语言」这类承诺**（同文件 846-847 行注释即为约束）。

中英双语界面：`f53da52a` 清零 EN 态中文残留，`f39d1297` 独立浏览器验收证据。

## 4. 如何把这一格变成 PASS（无需改代码）

1. 在设置里换成**已开通 `SEED_V25` 视频翻译模型**的渠道/key（中转或官方直连）；
2. 工具页直接提交真实任务——代码路径、网关闸门、JSON 提交、结果三动作都已就绪；
3. 跑一次真实验收即可把 `F` 判 PASS。

若不想等渠道：可另做「浏览器内 ASR→翻译→TTS 兜底译制」（SiliconFlow 已有 ASR `Qwen3-ASR-1.7B`/`SenseVoiceSmall`、翻译 `tencent/Hunyuan-MT-7B`、TTS `FunAudioLLM/CosyVoice2-0.5B`）。代价是需要新增本地音视频重编码能力（项目当前**无** ffmpeg/ffmpeg.wasm），且音色/口型与原产品不同。**V1.0 不做此路线。**

## 5. 证据链（可逐条复算）

| 证据 | 位置 |
| --- | --- |
| 六维矩阵（234 单元、328 断言） | `docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r31-matrix/matrix.json` / `matrix.md` |
| 矩阵重算脚本 | `tools/recompute_scope_matrix_r31.py` |
| R32 固定 HEAD 四闸 | `docs/V1.0/reports/verify-head-r32-fixed/REPORT.md` |
| 收口基线四闸（本轮） | `docs/V1.0/reports/verify-head-c72d6dc6/REPORT.md` + `gate.log` |
| VT 内容客观判定（VAD+LID+ASR，目标英语→实际中文 p≈0.99，且内容为朗读任务说明） | `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md` |
| VT 语言契约真实验收 | `docs/V1.0/plan_linkfox_navigation/reports/vt-language-r26/REPORT.md` + `EVIDENCE.md` |
| VT 协议能力审计（SEED_V25 / 通用视频接口差异） | `docs/V1.0/plan_linkfox_navigation/reports/vt-protocol-r27/`、`vt-seed-v25-r33/REPORT.md` |
| 渠道模型清单取证 | `project_memory.md`「2026-10-30 r33」段 |

## 6. 复现命令

```bash
cd web
bun test                                   # 1582 pass / 0 fail（95 文件）
bun run typecheck                          # tsc --noEmit 无输出
bun run build                              # ✓ built（约 3 分钟）
python3 ../tools/recompute_scope_matrix_r31.py   # 重算六维矩阵
```

> 注意：`web/tsconfig.app.json` 不存在，typecheck 必须用 `bun run typecheck`；build 超过工具 600s 上限时要后台跑并轮询日志。

## 7. 残留风险

1. **`VIDEO_TRANSLATION.F` 依赖外部渠道**：换 key 才能验证，V1.0 以 PARTIAL 交付，已在 UI 与文档双重披露。
2. **上游中转偶发 502**：同 key 并发 5 条会出现 1 条 502，单发无法复现；代码已做 5xx 重试，但极端情况仍可能失败。
3. **K 维覆盖 12/39**：其余 27 个工具不涉及独立密钥/特殊路由，记 N/A 而非「未验证」。
4. **构建体积**：主 chunk 6.0MB（gzip 1.84MB），属既有基线，未在本轮做代码分割。

## 8. 一句话交接

> 39 个工具全部可提交、可恢复、可追溯历史；唯一未闭环的是「视频翻译的成片译制质量」，卡在渠道未开通 `SEED_V25`，代码已就绪，换 key 即可验证。
