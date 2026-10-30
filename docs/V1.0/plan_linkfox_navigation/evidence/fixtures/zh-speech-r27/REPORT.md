# VIDEO_TRANSLATION 中文语音测试素材（zh-speech-r27）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 本轮：DeepSeek worker，单层执行（无嵌套子 worker / 无换模型 / 未读任何密钥）
- 产出目录：`docs/V1.0/plan_linkfox_navigation/evidence/fixtures/zh-speech-r27/`
- 本次提交只新增本目录（fixture + REPORT + manifest + 证据 JSON），**未改 `web/src` 任何文件**

## 1. 为什么需要这份素材

`e2529d42`（r24 内容级复验）已用 VAD + ASR + OCR 证明：r22-f 的源片 **5.167s 内语音覆盖 0%（纯音乐）**，成片音轨却是中文且内容是把提示词念了出来。源片无人声 → 「是否翻译」这件事在结构上不可验证。

语言组 r26 的复验改用 `evidence/real-acceptance/SALE_VIDEO/r12-downloaded.mp4`（6.592s，**英文真人声**）验证「语言契约是否压住朗读提示词」，其最新产出 `reports/vt-language-r26/artifacts/04-result.mp4` 实测音轨仍为英文 TTS（`Meet the watch that tracks your day and night...`）。

即：仓库现有素材中**没有一段含中文人声的源片**，而 VIDEO_TRANSLATION 的核心用例是「中文 → 目标语言」翻译。本轮补这一块。

## 2. 先扫描仓库已有素材（不重复下载）

对仓库内全部 `*.mp4`（脚本命中 28 条，去掉镜像目录 `ic-03b8f47e/` 的 11 条副本后**唯一文件 17 个**）统一做「ffmpeg 提音轨 → Silero VAD → faster-whisper LID+ASR」，逐条落盘于 `repo-scan.json`。

结论（原文见 `repo-scan.json`，17 条中含本 fixture 自身 1 条）：

| 类别 | 数量 | 实测 |
|---|---|---|
| 纯音乐 / 无语音 | 7 | `vad_cov=0.0`，ASR 输出 `Music` / `Thanks for watching!` |
| **英文**人声 | 4 | `SALE_VIDEO/r12-downloaded`、`SALE_VIDEO_20261029/sale-video-task-mvt76u6p`、`vt-language-r26/artifacts/04-result`（均 `Meet the watch that tracks your day and night, s...`，en p=0.998）；`independent-audit-r14/i2v-result`（`Maya's most...`，en p=0.994） |
| 中文但为**模型胡话**（不是真人朗读） | 5 | 如 r22-f：`原製動識別原視頻語音成片,翻譯成譯相同一啟成竅...`；VT downloaded：`最是人獲得原視頻與一言只列之一場一擊斷翻條割劑掏程式將準翻亞`；r21：`彎,开场者离开的直接入境,一句话点出核心卖点结尾给出一句行动扣号召`（明显是提示词正文） |
| 本 fixture（唯一真人中文朗读） | 1 | `暴震的人類發展指數在全世界186個國家和地區之中外列165位` |

判据：真人朗读的转写应「可读、可被原文核对」；上述中文音轨是无意义字串堆叠（模型把提示词当台词念），且与任何原文不可对齐。→ **仓库内无可用中文语音素材，必须外部取真实录音。**

## 3. 素材来源（明确许可、真实人声）

| 项 | 值 |
|---|---|
| 文件 | `File:Djibouti - Chinese spoken article (3 out of 3).ogg` |
| 页面 | https://commons.wikimedia.org/wiki/File:Djibouti_-_Chinese_spoken_article_(3_out_of_3).ogg |
| 直链 | https://upload.wikimedia.org/wikipedia/commons/9/91/Djibouti_-_Chinese_spoken_article_%283_out_of_3%29.ogg |
| 来源 | Wikimedia Commons（中文维基「吉布提」有声条目，**真人朗读**） |
| 许可 | **CC BY-SA 4.0**（https://creativecommons.org/licenses/by-sa/4.0/） |
| 作者 | Carrotkit（credit: Own work） |
| 源文件 | 4,740,261 B / 261.823s / ogg |
| 源 sha1（Commons 元数据） | `c8dc8c9f970c06654a9ece60973cb406cbbf508c` |
| 源 sha1（本地实测） | `c8dc8c9f970c06654a9ece60973cb406cbbf508c` ✅ 完全一致 |
| 源 sha256（本地） | `78248635c492cb25e9eb03f7b126fe71ae2c83da8835a606c7a414fc8b34458c` |

选择理由：4 个候选（Djibouti 1/3、2/3、3/3、Tajikistan）中此段最小（4.7MB），且 VAD 显示整段为连续朗读、无音乐段。

## 4. 截取窗口（5–12s，样本精确）

- 在 261.8s 源上跑 Silero VAD：95 段语音 → 按 ≤0.6s 间隙合并为 51 块，筛出 **5–12s 连续语音块 13 个**，逐块 ASR。
- 定稿窗口：**140.65s → 148.05s，7.40s**
- 选取依据：该窗口在 `beam_size=5` 与 `beam_size=1` 两种解码下转写**完全一致**（13 个候选里唯一稳定窗口），且是完整句；VAD 覆盖率 0.934，最大静音间隙 0.33s。
- 切片方式：解码为 16kHz/mono/s16le PCM 后按样本下标精确切（`[int(140.65*16000) : int(148.05*16000)]`）。**踩坑记录**：先前的 `ffmpeg -ss` 输入定位产出 8.44s 且丢了句首词，故改为按样本切片。

## 5. 成品与验证（结论性）

| 项 | 值 |
|---|---|
| 文件 | `zh-speech-djibouti-7s.mp4`（104,361 B ≈ 102KB，小文件） |
| sha256 | `7e4ab7c205efcf37fca50fdc719a919f2745b7ea7d749811df22ccb96f049ec9` |
| 时长 | **7.400s**（ffprobe 流级与容器级一致，落在 5–12s） |
| 视频流 | h264 / 1280×720 / 25fps / 7.40s —— **合成静态纯色帧（0x1b2a41），无文字、无字幕、无烧录文本** |
| 音频流 | aac / 48kHz / mono / 7.40s —— 真实人声，仅重采样+编码 |
| 静态帧证明 | t=1s 与 t=5s 抽帧 md5 均为 `1f749cee0dd5b9e788f2500cb881e615`（**逐像素相同**） |

**VAD（faster-whisper 内置 Silero，min_silence=300ms / pad=60ms）**

```
speech_coverage = 0.934   speech_segments = [[0.16, 5.40], [5.73, 7.40]]
```

→ 连续语音占 93.4%，最大间隙 0.33s，「含中文连续语音」成立。

**ASR（faster-whisper small int8 / CPU；`language=zh, beam_size=5, vad_filter=false, condition_on_previous_text=false`，无 initial_prompt）**

```
language=zh   language_probability = 1.000
avg_logprob = -0.469   no_speech_prob = 0.004
转写（繁体原样）：暴震的人類發展指數在全世界186個國家和地區之中外列165位
规范化：        吉布提的人类发展指数在全世界186个国家和地区之中位列第165位
```

**原文交叉核对（关键一条）**：`zh.wikipedia` 条目「吉布提」§医疗 原文（2026-10-30 经 API 拉取 revisions）为

> 据《2013年世界人类发展报告》统计，吉人类发展指数在全世界186个国家和地区中列第165位。

186 / 165 两个数字与 ASR 转写**完全吻合**，句子结构也一致 → 音频内容确为该段真人朗读，**不是 TTS、不是模型生成**。

**已知局限（必须如实标注）**：开头专名「吉布提」在无上下文条件下被误识为「暴震／德部提」（同一窗口更换窗口边界时稳定出现同类误听），「位列」被认成「外列」。这是 small 模型专名识别局限，非音频质量问题；若需要逐字精确转写，建议用 medium/large 或给 initial_prompt（本轮禁用 prompt 是为避免提示词串扰污染证据 —— 曾实测 prompt 会把「185位」注入句首）。

## 6. 约束遵守

- 无 TTS、无伪造翻译、无合成人声：音频 100% 来自 Commons 真人朗读切片。
- 画面为纯色静态帧，不含任何文字，避免「画面文字替代音轨」污染。
- 未改 `src`：本次提交仅新增 `evidence/fixtures/zh-speech-r27/`。
- 未读取密钥/Keychain/浏览器凭据；出网仅用本机系统代理（`127.0.0.1:7890`，直连 Commons 超时）。

## 7. 给语言组的使用方式

测试「中文源 → 目标语言」时，直接把下面这个文件当源片上传：

```
/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/fixtures/zh-speech-r27/zh-speech-djibouti-7s.mp4
```

- 期望：成片音轨为目标语言（如 en-US），语义对应「吉布提的人类发展指数在全世界 186 个国家和地区中列第 165 位」，且**不应**出现朗读提示词、不应保留中文原声。
- 反向判据：若成片仍是中文 / 仍是提示词内容 / 出现 186 与 165 但语言不对 → 语言契约未生效。
- 与 r26 的 `SALE_VIDEO/r12-downloaded.mp4`（英文真人声）互补：r12 验「英文源 →？」的退化路径，本 fixture 验「中文源 → 目标语言」的主用例。

## 8. 复现命令

```bash
FF=/opt/homebrew/Cellar/ffmpeg/8.1/bin
# 1) 下载（走本机代理）
curl -x http://127.0.0.1:7890 -A "ic-fixture/1.0" -o src.ogg \
  "https://upload.wikimedia.org/wikipedia/commons/9/91/Djibouti_-_Chinese_spoken_article_%283_out_of_3%29.ogg"
shasum -a 1 src.ogg   # 期望 c8dc8c9f970c06654a9ece60973cb406cbbf508c
# 2) 解码
$FF/ffmpeg -v error -y -i src.ogg -vn -ac 1 -ar 16000 -c:a pcm_s16le full-16k.wav
# 3) 按样本切片 [140.65, 148.05) → slice-16k.wav，再与静态帧合成
$FF/ffmpeg -v error -y -f lavfi -i color=c=0x1b2a41:s=1280x720:r=25 -i slice-16k.wav \
  -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 96k -ar 48000 -ac 1 \
  -shortest -movflags +faststart zh-speech-djibouti-7s.mp4
```

## 9. 本目录文件

| 文件 | 说明 |
|---|---|
| `zh-speech-djibouti-7s.mp4` | 成品 fixture（7.400s） |
| `manifest.json` | 机读清单：URL/许可/作者/源 sha1+sha256/切片参数/校验数值/复现命令 |
| `fixture-evidence.json` | 成品复验原始记录（ffprobe 流信息、VAD 段、ASR 段与概率、帧 md5） |
| `repo-scan.json` | 仓库 18 个 mp4 的批量扫描结果（含本 fixture 自身一行，便于对照） |
| `REPORT.md` | 本文件 |
| `LANGUAGE_GROUP_NOTICE.md` | 给语言组的简短通知（绝对路径 + 期望/反向判据） |

## 10. 署名与同协议

本 fixture 为对 CC BY-SA 4.0 作品的改编（截取 + 重采样 + 配静态画面），使用/分发时须保留：来源文件名、作者 Carrotkit、许可 CC BY-SA 4.0 及其链接，并注明上述改动；改编作品按 CC BY-SA 4.0 同协议分发。
