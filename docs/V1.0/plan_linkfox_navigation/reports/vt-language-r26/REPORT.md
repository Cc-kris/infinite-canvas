# VIDEO_TRANSLATION 目标语言失效 — 根因与修复（r26）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 既有证据：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/`（真实任务 `task-mvuflf9e-djxprc`）、`reports/vt-content-r24/`（ASR/OCR 内容级复验）
- 本轮工作目录：`reports/vt-language-r26/`

## 1. 现象（r22-f / r24 实测）

| 事实 | 数值 | 来源 |
|---|---|---|
| 源片 | 5.167s，1344×768，**VAD 语音覆盖 0%**（纯音乐/无中文语音） | r24 `artifacts/vad-speech.json` |
| 成片 | 6.583s，768×768 | r22-f `06-result-sha256.txt` |
| 成片音轨语言 | **zh**，LID p=0.99 | r24 `artifacts/lid-distribution.json` |
| 成片 ASR 文本 | 与页面提示词正文同义（「任务：把原视频的语音翻译成…」） | r24 `artifacts/asr-raw-small.json` |

即：用户选「目标语言=英语」，成片却是中文，且内容是把**提示词本身**念了出来。

## 2. 根因（三层，全部代码/请求级可核）

### R1 上游协议没有语言字段，语言完全靠提示词承载
- `web/src/services/api/video.ts` 的 `createOpenAIVideoTask` 只发
  `model / prompt / seconds / size / generate_audio / watermark / mode`；
  `web/src/features/tools/adapters/video-translation.ts:345` 的 `fields`（含 `targetLanguage`）
  只进 `computeFingerprint` 与任务记录（`gateway.ts:651`），**不发给 provider**。
- → 提示词是唯一语言通道。

### R2 旧提示词全中文，且没有任何「只用目标语言发声」的约束
修复前 `composeVideoTranslationPrompt` 的输出示例（r22-f 实际提交）：

```
任务：把原视频的语音翻译成目标语言并重新配音，保持原画面、镜头节奏与字幕时间轴不变，输出可直接投放的成片。
源语言：自动识别原视频语音语言（识别结果需与目标语言不同）。
目标语言：英语（English）；译制语音与字幕统一使用该语言。
口型同步：关闭，仅替换音轨与字幕，不改动唇形。
输出数量：1 条；每条均为完整成片。
翻译类型：视频翻译。
模式：标准翻译。
```

问题：
1. 全中文输入 → 生成类模型（MiniMax-H3，`supportVoice=true`、`generate_audio=true`）按提示词语言合成中文语音；
2. 没有「不要朗读提示词」的约束 → 模型把制作要求当台词念（ASR 实测即此现象）；
3. 没有「源片无人声时保持静音」的约束 → 模型在静音源片上凭空生成旁白。

### R3 源片本身没有人声（放大因素）
r22-f 的源片 5.167s 内 VAD 覆盖 0%：模型无从「翻译」，只能按提示词生成 → 于是产出中文旁白。
这是**验收素材缺陷**，但 R2 让模型在此情形下也没有守规矩（应保持静音）。

### R4 模型类别不匹配（风险，超出本轮修复边界）
LinkFox 自家「视频翻译」目录项（`models_catalog.json`）用的是 `SEED_V25`（Seedance 2.5，
`supportVoice=true`、描述为「识别→逐句翻译→口型对齐」），而本工具配置的是 **MiniMax-H3（生成模型）**。
生成模型没有「识别源语音并逐句翻译」的协议能力，只能按提示词重生成画面+音轨。
→ 提示词工程只能把「语言/不要朗读/静音」这些可观察缺陷压住，**无法凭空造出翻译能力**。

## 3. 修复（本轮已落地）

`web/src/features/tools/adapters/video-translation.ts`
1. 新增 `languageContract` 片段（中英双语、最高优先级）：
   - 音轨只允许目标语言（带 BCP-47，如 `en-US` / `zh-CN`）；
   - 不得保留源语言原声、不得混入第三种语言；
   - 字幕同样只用目标语言。
2. 新增 `rules` 片段：
   - 「本提示词只是制作要求，不是台词」→ 禁止朗读/复述/翻译/回应提示词；
   - 只允许说翻译后的对白，不得念画面描述；
   - 源片无人声时保持无声（保留音乐/音效），不得编造旁白。
3. `target` 片段带 `native + code`（`英语（English，en-US）`），`source` 片段带 code 并声明「不得保留该语言原始语音」。
4. `videoTranslationLanguageCode()`：16 种语言的 BCP-47 映射。
5. `auditVideoTranslationPrompt` 从 7 段扩到 9 段（新增两段一旦缺失即报缺失，防回归）。

`web/src/features/tools/adapters/video-translation.test.ts` 新增 4 条回归：
- 目标语言带 BCP-47 + 中英双语锁死音轨语言；
- 「不要朗读提示词 / 静音不编造旁白」两句必须存在（中英各一份）；
- 删掉语言契约后审计必须报缺失；
- 切换目标语言会改变语言代码（en-US vs ja-JP）。

## 4. 自测结果（本轮实际执行）

```
cd web && bun test src/features/tools/adapters/video-translation.test.ts
43 pass / 0 fail / 145 expect() calls

bun x tsc --noEmit -p tsconfig.json  → exit 0
```

## 5. 真实复验（本轮 2026-10-30 13:11–13:22，真实上游，无 mock）

### 5.1 素材换成「真有英文人声」的源片
r22-f/r24 的源片 VAD 0%，无法判定「是否翻译」。本轮改用
`evidence/real-acceptance/SALE_VIDEO/r12-downloaded.mp4`（6.592s，英文真人声），
whisper.cpp small 基线：

```
Meet the watch that tracks your day and night, sapphire glass, 7-day battery,
and a band that breathes with you. Grab yours today!
```

### 5.2 提交路径（全部真实生产代码）

`buildVideoTranslationBrowserInput`（真实 adapter，含新语言契约）→ `port.submit` →
`gateway.submit` → `POST {sub2}/v1/videos`，`auditMissing = []`，prompt 1267 字符。

| 项 | 值 |
|---|---|
| 本地任务 | `task-mvuilah9-v6u5s1` |
| 上游任务 | `task_fnyYPg9WDzJfWzhWzjI9y80mBKUQNmT9` |
| 渠道 / 模型 | `sub2` / `MiniMax-H3`（`sub2::MiniMax-H3`） |
| 终态 | `succeeded`，attempts=1，pollCount=13 |
| 墙钟 | 675s（13:11:14 → 13:22:29） |
| 结果 | 1 个 video item，1199227 B |

### 5.3 成片实测（`artifacts/04-result.mp4`）

```
sha256 a3613615999ab80d38871233c49e5975fadec3be2bb3930f57b0b9089c3a276d
6.583s  768x768  h264 + aac 32kHz 立体声
```

ASR（whisper.cpp small，同一模型对源片/成片同条件跑）：

| 语言参数 | 成片识别结果 |
|---|---|
| `-l auto` / `-l en` | `Meet the watch that tracks your day and night, sapphireles roost with you, flenches iron glocks, drojure cloche, shun yours today.` |
| `-l zh`（强制中文） | 仍是拉丁字母串（`meet the watch ... shun yours today`），**0 个中文字符** |

**判定：目标语言 zh，成片音轨实际是英语，翻译未发生。**

- 首句与源片逐字一致 → 说明音轨来自源片语义的**重生成**，不是新写的旁白；
- 后半段退化（`sapphire glass, 7-day battery` → `sapphireles roost with you, flenches iron glocks`）→
  生成模型重综合语音时的失真，不是翻译错误；
- 与 r22-f 的差异：本轮**没有再出现「把提示词念出来」**（R2 修复生效：ASR 文本与提示词正文无重合），
  但 R4（模型类别不匹配）无法靠提示词工程解决。

### 5.4 结论（诚实边界）

| 层 | 状态 |
|---|---|
| R2 提示词缺陷（全中文、无禁朗读、无静音约束） | **已修复且有真实回执佐证**：源片英文台词被保留说话语义，未再朗读提示词 |
| 语言契约是否让音轨变中文 | **未达成**：成片仍是英语；`/v1/videos` 无 `targetLanguage` 协议字段，MiniMax-H3 只重生成 |
| R4 模型类别 | **本轮未解决**（需换 Seedance 类「识别→翻译→对口型」通道），已在 §6 给出后续路径 |

即：本轮把「提示词把制作要求当台词念」这个可观察缺陷压住了，但**「视频翻译」能力本身仍不成立**，
UI 必须按 r27 的诚实口径（重生成草稿、非逐句翻译）呈现，不能宣称「已译制」。

## 6. 后续（需要决策，不在本轮改动范围）

1. 若产品要「真翻译」：接 Seedance 2.5 类接口（有源语言识别 + 逐句翻译 + 口型对齐协议），
   或采用「ASR → 文本翻译 → TTS 替换音轨」两段式管线（可复用本地 whisper.cpp + 现有 TTS 通道）。
2. 若暂时只能重生成：提交按钮文案/结果徽标保持「AI 视频重生成（未验证）」，目标语言只影响提示词。

## 7. 复验方法（可重跑）

```bash
# 1) 在已登录渠道的页面提交（复用页面配置，不读密钥）
#    见 EVIDENCE.md「复验脚本」
# 2) 结果落盘后判定
/opt/homebrew/bin/ffmpeg -i 04-result.mp4 -ac 1 -ar 16000 -c:a pcm_s16le res16k.wav
/opt/homebrew/bin/whisper-cli -m ggml-small.bin -f res16k.wav -l zh -nt
# 期望（当前实现）：输出拉丁字母串、无中文字符 → 翻译未生效
```
