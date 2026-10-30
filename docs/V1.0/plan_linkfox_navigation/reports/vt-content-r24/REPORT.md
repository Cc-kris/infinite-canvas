# VIDEO_TRANSLATION r22-f：内容级复验（r24）

- 复验对象：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-video.mp4`
  （sha256 `7c15bdb2…274c`，与 r22-f 记录 `06-result-sha256.txt` 一致）
- 源片：`/tmp/r22f-source.mp4`，sha256 `56226153…3acf`，与 r22-f `01-source-sha256.txt` 一致
- 结论日期：2026-10-30｜单 worker｜未改任何业务源码，仅在本目录产出脚本与证据

## 0. 为什么还要复验

r22-f 的 REPORT 验的是**链路**（上传 → 提交 → succeeded → 下载 → 存资产 → 发画布）与工程性缺陷（F1 资产尺寸兜底、F2 时长 +27%、F3 画幅被改）。
它**没有**验证任务本身的两条内容硬指标，且其 `08-audio-envelope-compare.json` 用「音频包络互相关 0.921」暗示音轨被保留/翻译正确——包络相似度**不能**证明语言、也不能证明译制正确。

编号记录里的原始要求（`02/05-tool-task-record.json` 的 `prompt` 原文）：

> 目标语言：**英语（English）**；**译制语音与字幕统一使用该语言**。
> 口型同步：关闭，仅替换音轨与字幕，不改动唇形。

本轮就只验这两件事：**① 音轨说的是不是英语；② 字幕是否烧录、是什么语言。**

## 1. 结论

| 判据（来自任务 prompt） | 实测 | 判定 |
|---|---|---|
| 译制语音为英语 | 结果音轨为**中文**（LID zh p=0.987~0.997，ASR 解出中文句子） | **FAIL** |
| 字幕统一使用该语言 | **没有任何字幕**：无字幕流、158 帧×2 语言 OCR 全空、检出下限 ≤14 px | **N/A（未提供）**，不判 PASS |
| 把原视频语音翻译成目标语言 | 源片 **0% 语音**（5.18 s 纯音乐） | 前提不成立 |

补充（最严重的一条）：结果音轨的中文内容**不是对源片台词的翻译**，而是一句**在朗读任务说明**的中文：
「原视频语音识别…成片，翻译成…，模式、标准（的）翻译。」——源片根本没有语音可译，这段旁白是模型在「无语音输入」下的自由生成。

## 2. 证据

### 2.1 语音活动（VAD）— `artifacts/vad-speech.json`
Silero VAD（faster-whisper `get_speech_timestamps`），16 kHz 单声道，三档阈值：

| 轨道 | 时长 | th=0.3 | th=0.5 | th=0.7 |
|---|---|---|---|---|
| 源片 | 5.184 s | 0 段 / 0.0% | 0 段 / 0.0% | 0 段 / 0.0% |
| 结果 | 6.592 s | 1 段 / 100% | 1 段 / 96.4%（0.24–6.59 s） | 2 段 / 96.4% |

源片在任何阈值下都没有语音段 → **纯音乐**。这一条决定了：任何「源语言识别」都不可能在输入端成立。

### 2.2 语言识别（LID）— `artifacts/lid-distribution.json`
用 faster-whisper 的 LID 头，small 与 base 两个规模各跑一次：

| | small | base |
|---|---|---|
| 结果片 | **zh 0.9967** | **zh 0.9927** |
| 源片 | en 0.6147 | en 0.6364 |

源片的 en 是**假阳性**：模型在纯音乐上给出低置信语言判断是已知行为（medium 规模更直接暴露这一点，见 2.3）。**先 VAD、再 LID**，否则会被这条 0.61 带偏。

### 2.3 语音转写（ASR）

Small，四种解码配置（`artifacts/asr-deep-result.json`）：

| 配置 | lang/p | 转写 |
|---|---|---|
| `language=zh`, beam=5 | zh / 1.0 | 原製動識別原視頻語音成片, 翻譯成譯項度依請程俏,模式、標準能翻譯。 |
| `language=null`（自动） | zh / 0.9967 | 同上（逐字一致） |
| `language=en`（强制英文） | en / 1.0 | 原智動識別原視頻語音成片翻譯詞役相同一寢成竅模式標準的翻譯 |
| `language=zh`, beam=1 | zh / 1.0 | 原製動識別原視頻語音成片,翻譯成譯相同一啟成竅,模式、標準能翻譯。 |

medium 独立复核（`artifacts/asr-medium-crosscheck.json`）：

- 结果片：**zh / p=0.9873**，分三段 `0.00–3.00 / 3.00–5.00 / 5.00–7.00`，文本与 small 同源同义
- 源片：en / p=0.6554，文本 `Thanks for watching!` —— 这是 Whisper 在**静音/纯音乐**上的经典幻觉，反过来印证源片无语音

关键点：**即使强制 `language=en`，输出仍是中文字符**。这说明音轨里是中文语音，不是「英语识别失败」。

### 2.4 字幕（OCR）— `artifacts/ocr-*.jsonl` + `artifacts/summary.json`

判定阈值（写进 `scripts/summarize.py`，可复核）：`conf ≥ 0.5`、`0.008 ≤ 框高 ≤ 0.20`（0.8%~20% 帧高，即 768 高画面约 6~154 px）。

| 集合 | 帧数 | 有字帧 | 命中 | 底部带(y<0.40) |
|---|---|---|---|---|
| 结果片 全帧 en-US | 158 | 1 | 1 | **0** |
| 结果片 全帧 zh-Hans | 158 | 0 | 0 | **0** |
| 结果片 底部条带 en-US | 158 | 0 | 0 | **0** |
| 结果片 底部条带 zh-Hans | 158 | 0 | 0 | **0** |
| 源片 全帧 en-US | 124 | 7 | 7 | **0** |
| 源片 全帧 zh-Hans | 124 | 0 | 0 | **0** |

- 结果片唯一那 1 个命中：`r_150.png` → `"CAT"`，conf 0.50，框在 `y=0.516`（画面中部），是画面纹理噪声，不是字幕。
- 源片 7 个命中全部在 `x≈0.45–0.47, y≈0.52`，内容是 `15000 / 1205 / 1273) / NONT / MOST` —— 同一位置的**数字计数器/水印区**，不是字幕；且在两种语言下都未落在底部带。
- **容器层**：`ffprobe` 显示结果片仅 `index=0 h264 video` + `index=1 aac audio`；**没有任何 subtitle stream**。

**为什么「全空」可以当结论**（这一步是必须的，否则「没检出」= 「可能漏检」）：
`artifacts/keep/ocr-positive-control-*.jpg` 与 `ocr-sensitivity-*.jpg` 是在**同一张真实画面**上叠加描边字幕（模拟烧录字幕的视觉特征）后的对照图：

原始数据：`artifacts/ocr-controls-en-US.jsonl`、`artifacts/ocr-controls-zh-Hans.jsonl`

| 图（在**自己语种**的 locale 下） | en-US 运行 | zh-Hans 运行 |
|---|---|---|
| 阳性对照（30 px） | `This is a positive control subtitle line.`，conf **1.0** | `这是一条中文阳性对照字幕`，conf **1.0** |
| 灵敏度梯 14 px | `English subtitle sensitivity test at this size`，conf **1.0** | `中文敏感度测试字号`，conf **1.0** |
| 灵敏度梯 16/18/20/24/28 px | 全部 conf **1.0** | 全部 conf **1.0** |

即：**每种语言在自己的 locale 下都能稳定识别到 14 px**（en 的 14 px、zh 的 14 px 都是 conf 1.0），而 768×768 成片的正常字幕字号通常在 28–48 px。因此「158 帧全空」是**真实的没有字幕**，不是分辨率导致的漏检。

反向对照同样有意义：把中文对照图丢给 `en-US` 得到 **0 命中**，把英文对照图丢给 `zh-Hans` 得到 conf 0.5 的错字（`Engish`）。这正是「单语言分别跑」必要性的直接实测证据——跨 locale 会漏检或降级。

## 3. 判读

1. **语音语言不符（硬失败）**：要求英语，实测中文（两种模型、四种解码配置一致，p ≥ 0.987）。这不是「翻译质量差」，是**目标语言完全没被满足**。
2. **字幕未提供（不是「语言错」）**：输出既无烧录字幕、也无内嵌字幕流。要求「译制语音与字幕统一使用该语言」，字幕这一半**没有交付**，因此判 N/A 而非 PASS；也不构成「字幕语言错误」。
3. **任务前提不成立**：源片是 5.18 s 纯音乐（VAD 0%）。「把语音翻译成英语、仅替换音轨与字幕」在输入端无处落脚。
4. **实际发生了什么**：上游在无语音输入下生成了一段**中文旁白**，内容是对任务的描述（"原视频语音识别…翻译成…标准翻译"）。这既不是翻译，也不是英语。

## 4. 方法学坑（本轮踩过，可复用）

1. **Vision 多语言列表会压掉中文**：`recognitionLanguages = ["en-US","zh-Hans"]` 时中文一律返回空或 conf 0.30 的噪声碎片（28 px 对照图也一样）。**必须单语言分别跑再合并** —— 这就是 r22-f 之后「OCR 全空」若被误读的根源。
2. **PyAV 与 faster-whisper 版本冲突**：`decode_audio` 走 PyAV 会崩。改成 stdlib `wave` + numpy 读 16 kHz 单声道 s16le，把 numpy 数组喂给 `transcribe()`，绕开 PyAV。
3. **包络互相关不是语言证据**：r22-f 的 `maxEnvelopeCorr=0.921` 只说明两段波形的能量起伏像，与「谁在说、说什么语言」无关；源片是音乐时它连「音轨被替换」都证明不了。
4. **先 VAD 再 LID**：纯音乐上 LID 会给 0.61~0.66 的假阳性；ASR 会给 `Thanks for watching!` 这类幻觉。
5. **判据阈值要写进代码**：`summarize.py` 里 `MIN_CONF=0.5`、`MIN_H=0.008`、`MAX_H=0.20`（曾出现一个 `text="1"`、框高 0.62 的假命中，被 `MAX_H` 挡掉）。

## 5. 未验证 / 边界

- **Apple Speech 独立第三引擎**：CLI 无 TCC 麦克风/语音识别授权，退出即空输出。记为 UNVERIFIED，不影响结论（已用 small+base+medium 三个规模的 LID 与 ASR 交叉）。
- 未做逐样本音频指纹/水印比对（对判据无必要）。
- 未复核上游侧（MiniMax-H3 / sub2api-real）内部日志；本报告只基于**落地字节**。
- 「句义是否通顺」不做评价：转写本身有错字（`製動/依請程俏`），但**语种判定不依赖字面准确率**。

## 6. 复现

```bash
cd docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24
bash scripts/run_all.sh <结果mp4> <源mp4>          # 抽帧/条带/对照图/OCR/ASR/VAD 全流程
/opt/homebrew/bin/python3.14 scripts/summarize.py artifacts artifacts/summary.json
```

- 本机解释器坑：`faster_whisper` 只装在 **`/opt/homebrew/bin/python3.14`**，默认 `python3` 没有。
- 模型：`Systran/faster-whisper-{small,base,medium}`；本机经 `hf-mirror.com` 拉取（直连 huggingface.co 不通）。
- 目录：`artifacts/` 为证据（jsonl/json/wav/对照图 JPEG），`scripts/` 为可复现脚本（5 个）。
