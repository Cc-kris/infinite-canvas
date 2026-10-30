# VIDEO_TRANSLATION 上游协议调查（r27）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 本轮范围：**只调查 + 只报告**。未改 `src`、未提交任何生成任务、未读取任何密钥、未做嵌套派工。
- 机读证据：[`evidence/vt-protocol-evidence.json`](./evidence/vt-protocol-evidence.json)
- 前序：`reports/vt-language-r26/REPORT.md`（语言仅进提示词）、`reports/vt-content-r24/REPORT.md`（内容级：输出中文旁白、无字幕）、`reports/video-translation-protocol-audit-20261029.md`（本地字段形态与已抓协议一致）

## 0. 结论（先看这段）

**BLOCKED —— 当前可用上游不具备视频翻译协议。**

| 问题 | 答案 | 证据 |
|---|---|---|
| LinkFox 的翻译到底靠什么字段？ | 独立契约 `type=96 / bizType=814`，语言/口型在 `extendFields`：`sourceLanguage/targetLanguage/lipSync/videoType/accountTypes` | `schema_final.json` + 8 条真实案例 `make_cases.json.gz` |
| 这些字段能塞进我们现在用的 `/v1/videos` 吗？ | 不能。该接口没有语言/口型/ASR/TTS 字段，只有 `model/prompt/seconds/size/ratio/resolution_name/generate_audio/watermark` | r22-f 真实回执、`video.ts` 提交体 |
| 把语言写进 prompt 能保证翻译吗？ | 不能。r24 实测：源片纯音乐，结果音轨是中文朗读任务说明（LID zh 0.987–0.997），无字幕 | `reports/vt-content-r24/REPORT.md` |
| 目录里的 SEED_V25 / HAPPY_HORSE 能直接用吗？ | 不能凭目录名推断。SEED_V25 描述为「识别→逐句翻译→口型对齐」，但其 channel 是 `accountTypes=DOUBAO_API`，我方无此渠道；HAPPY_HORSE 在 type 96 目录里但描述是「换装换景」 | `models_catalog.json` |
| 公开的 Ark Seedance 协议能做翻译吗？ | 公开视频生成协议只有 `reference_video`（参考素材），无翻译/口型/语言参数 | 本地协议文档 `volcengine-ark-video.md`；抓取 Ark 文档 82379/1520757 的 HTML 文本中「翻译」出现 0 次（`seedance` 210 次、`video_url` 89 次） |

> 能力边界一句话：**现在的「视频翻译」是「让生成模型照着提示词重做一条视频」，不是译制。** 不能宣称翻译完成。

## 1. 方法与边界

只做了四类动作，全部可复核：

1. **读仓库已抓真实资产**：`docs/analysis/assets/linkfox/{schema_final.json,models_catalog.json,make_cases.json.gz}`（LinkFox 前端抓包产物）。
2. **读既有真实运行证据**：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/`（r22-f 真实提交/轮询回执、r24 内容级复验）。
3. **核对当前渠道**：`sub2api.1006000.xyz` 的 OpenAI 兼容 `/v1/videos`（响应回显 `model: MiniMax-H3`）。
4. **核对公开协议**：Ark 内容生成任务协议（本地 `open-ai-canvas-win/backend/internal/protocol/docs/volcengine-ark-video.md`）+ 火山官方文档页面 82379/1520757。

明确**没做**的事：没有建新任务（避免与 language/aspect 组重复、避免产生费用与副作用）；没有读 localStorage/密钥文件；没有启动隧道。

## 2. 链路 A：LinkFox 原生协议（真实、可落地的目标契约）

### 2.1 端点与类型

- 页面：`https://www.linkfox.com/draw/video-translation`
- `makeType/type = 96`，`bizType = 814`
- 提交走 LinkFox 自己的 AES 信封接口（非 OpenAI 风格），字段在 `extendFields` 内

### 2.2 字段表（来自抓包 schema）

| 字段 | 位置 | 取值/含义 | 是否必填 |
|---|---|---|---|
| `sourceVideoUrl` | extendFields | 源片公网 URL（`file-ai.linkfox.com/...`） | 是 |
| `sourceVideoName` | extendFields | 源文件名 | 是 |
| `sourceLanguage` | extendFields | 实测 8/8 为 `auto`（自动识别） | 是 |
| `targetLanguage` | extendFields | 实测 `en/pt/vi/ms/ja/th/es/ko` | 是 |
| `lipSync` | extendFields | 实测 8/8 为 `true` | 是 |
| `videoType` | extendFields | 实测 8/8 为 `SEED_V25` | 是 |
| `accountTypes` | extendFields | 实测 8/8 为 `DOUBAO_API` | 是（渠道标识） |
| `duration` / `videoTime` | extendFields | 实测均为 `-1`（服务端读取源片时长） | 否 |
| `outputNum` | 顶层 | 输出条数（schema 有，案例中未出现） | 否 |

真实样本（已脱敏路径，完整见机读证据）：

```json
{
  "type": 96,
  "extendFields": {
    "accountTypes": "DOUBAO_API",
    "videoType": "SEED_V25",
    "sourceLanguage": "auto",
    "targetLanguage": "en",
    "lipSync": true,
    "duration": -1,
    "videoTime": -1,
    "sourceVideoName": "case-10-xx.mp4",
    "sourceVideoUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/<caseId>/source_video.mp4"
  }
}
```

### 2.3 8 条真实案例统计（`make_cases.json.gz` → key `96`）

| 维度 | 实测 |
|---|---|
| 条数 / 工具 | 8 条，`tool=["VIDEO_TRANSLATION"]`，`status=1` |
| 目标语言 | en, pt, vi, ms, ja, th, es, ko（8 种各 1 条） |
| 源语言 | 8/8 `auto` |
| 口型同步 | 8/8 `true` |
| 模型 | 8/8 `SEED_V25` |
| 账号类型 | 8/8 `DOUBAO_API` |
| `createTime→updateTime` | 14–28 秒 |

⚠️ 这组时长对「ASR+逐句翻译+TTS+口型」偏短，只能证明**提交契约与状态字段**，不能证明产物质量；产物语言未复验（见 §7 UNVERIFIED）。

### 2.4 模型目录（`models_catalog.video["96"]`）

| code | 描述 | apiCode | supportVoice | 关键点 |
|---|---|---|---|---|
| `SEED_V25` | 视频翻译：识别→逐句翻译→口型对齐视频编辑生成 | `doubao-seedance-2-5`\* | true | `isDefault=true`，480P/720P/1080P，5–30s |
| `HAPPY_HORSE` | 商品一键换装换景，纹理细节零失真 | —（无） | false | 只有 720P、5–15s；**描述与翻译无关** |

\* `apiCode` 不在 `models_catalog.json` 的 type-96 条目里（该条目只有 `code/name/description/能力开关`），而是来自前序资产 [`docs/V1.0/assets/08-model-catalog.md`](../../../assets/08-model-catalog.md) 的模型级整理。该文档的通用描述是「原生30秒直出，全模态参考一镜到底」且比例列表更长，与本工具条目下的描述（「视频翻译…」）和比例（`9:16,16:9`）**不一致**——说明同一底层模型在不同工具下能力被裁剪，需以工具级条目为准。

结论：type 96 下真正对得上「翻译」的只有 `SEED_V25`，且它绑定 `accountTypes=DOUBAO_API`；`HAPPY_HORSE` 属于目录错配或复用，不可当作翻译能力。

## 3. 链路 B：本仓库当前真实渠道（实际在跑的）

| 项 | 实测值 | 来源 |
|---|---|---|
| Base URL | `https://sub2api.1006000.xyz` | r22-f 代理日志 |
| 创建 | `POST /v1/videos`（JSON；multipart 会 400） | r22-f / `result.json` |
| 轮询/取片 | `GET /v1/videos/{id}`、`GET /v1/videos/{id}/content` | 同上 |
| 模型 | 配置 `sub2api-real::MiniMax-H3`，上游回显 `MiniMax-H3` | `02-tool-task-record.json` |
| 已接受源片形态 | `videos:[url]`、`video_url:url`、`input_reference:url`、`content[].video_url.url`（均 200 建任务） | `result.json → upstreamCapabilityProbe` |
| 提交字段 | `model/prompt/seconds/size/ratio/resolution_name/generate_audio/watermark/mode` | `web/src/services/api/video.ts` |
| 缺失字段 | `sourceLanguage/targetLanguage/lipSync/asr/tts/subtitle/voice/dubbing` | 同上 + 抓包回执 |

### 3.1 内容级事实（最关键的一条）

r24 用 VAD + LID + ASR + OCR 复验同一条真实任务：

- 源片 5.18s **0% 语音**（纯音乐）；
- 结果片音轨 **中文**（LID zh 0.987–0.997），内容是**朗读任务说明**：「原视频语音识别…成片，翻译成…模式、标准…」；
- 158 帧 × 中英双语 OCR：**无任何字幕**；
- 强制 `language=en` 解码仍输出中文字符 → 证明音轨里就是中文语音。

这条证据把「提示词修复」这条路彻底证伪：模型在无语音输入时自由编了旁白，而不是翻译。

## 4. 协议对照矩阵

| 能力 | LinkFox 契约 | 当前 `/v1/videos`(MiniMax-H3) | 公开 Ark 视频协议 |
|---|---|---|---|
| 源视频 | `sourceVideoUrl`（必填，语义=待译源片） | `videos[]`/`video_url`/`input_reference`（语义=参考素材） | `content[].video_url` + `role=reference_video`（语义=参考素材） |
| 源语言 | `sourceLanguage=auto` | — | — |
| 目标语言 | `targetLanguage=en/ja/...` | 只能写 prompt | 只能写 prompt |
| 口型对齐 | `lipSync=true` | — | — |
| ASR / 字幕 / 配音 | 服务端编排（`DOUBAO_API`） | — | — |
| 输出数量 | `outputNum` | 一次 1 条 | 一次 1 条 |
| 模型 | `SEED_V25` | `MiniMax-H3` | seedance 系列（生成） |

结论：**两套协议在「语义」层面就不同**——LinkFox 的 video 是"要翻译的源片"，生成接口的 video 是"参考素材"。因此不是加几个参数就能对齐。

## 5. 若未来解封：可落地的配置与字段映射

> 以下均为**待接入方案**，本轮未实现、未验证，不得当作已完成能力。

### 方案 1（推荐）：接入 LinkFox 等价服务端

- 协议：`type=96`、`bizType=814`、`extendFields.videoType=SEED_V25`、`accountTypes=DOUBAO_API`
- 必须具备：源片公网 URL、源/目标语言、口型开关
- UI → 请求映射：

| UI 字段 | 请求字段 | 转换规则 |
|---|---|---|
| 源视频 | `extendFields.sourceVideoUrl` + `sourceVideoName` | 先发布到公网 https（现有 `publishReferenceVideos`） |
| 源语言 | `extendFields.sourceLanguage` | 默认 `auto`；手选时传语言码 |
| 目标语言 | `extendFields.targetLanguage` | BCP-47 短码（en/ja/ko/...） |
| 口型同步 | `extendFields.lipSync` | 布尔，默认 true |
| 输出数量 | `outputNum` | 1–4；先确认渠道是否真支持 >1 |
| — | `extendFields.videoType` | 固定 `SEED_V25` |
| — | `extendFields.duration/videoTime` | `-1`（服务端读源片） |

验收判据（必须跑，不是读码）：结果音轨 LID = 目标语言；字幕流/OCR 命中目标语言；口型开启时唇形变化；源片有语音时才判翻译（纯音乐源片必须先判「无可译内容」）。

### 方案 2：Ark / DOUBAO_API 直连

- 现有公开协议 **不支持**：`/api/v3/contents/generations/tasks` 只有 `content[]`（text/image_url/video_url/audio_url）+ `ratio/resolution/duration/generate_audio/watermark`，`video_url` 语义是 `reference_video`。
- 需要官方给出翻译任务字段（如 `translation.source_language/target_language/lip_sync`）才可落地；**当前文档没有，故不可实现**。
- 若官方后续提供，映射同方案 1 的语义，只是承载字段换成 Ark 的 content/parameters。

### 方案 3：自建链路（成本最高、可控性最好）

`ASR(带词级时间轴) → LLM 逐句翻译 → TTS(目标语言) → 口型对齐 → 字幕烧录 → 封装`

- 该链路与 `/v1/videos` 的生成能力无关，`/v1/videos` 顶多做画面重绘，不能替代翻译。
- 需要额外模型与算力（ASR/TTS/唇形），本轮未评估成本与时长。

## 6. UI 应显示的诚实能力边界（可直接抄）

必须在页面上显式表达，避免用户误以为已译制：

1. **页面顶部提示（琥珀色）**
   > 当前渠道不支持视频翻译协议：可选择目标语言，但它只会作为提示词发送，不保证换语言；不会生成译制字幕或口型对齐。
2. **目标语言字段下的小字**
   > 仅提示词引导 · 上游无 language 字段
3. **口型同步开关**
   > 当前渠道不支持口型同步参数（置灰不可选，并说明原因，不静默丢参）
4. **输出数量 >1**
   > 当前渠道一次只返回 1 条结果
5. **结果卡片徽标**
   > 未验证翻译 · 请人工确认语言与字幕
6. **禁止出现的文案**
   - 「翻译完成」「已译制」「已对口型」「已生成字幕」「已识别源语言」
7. **任务命名/导出文件名**
   - 用 `video-translation-draft`（草稿）而非 `translated`，避免下游误用。

补充：如果产品决定保留「翻译」入口，应把它定位为**「译制草稿生成器（实验）」**，并在首次进入时做一次性说明；否则建议直接隐藏该工具，等真实渠道接入再开。

## 7. UNVERIFIED（不要当结论用）

1. `sub2api` 是否另上架 `SEED_V25`/`doubao-seedance-2-5`：`GET /v1/models` 返回 401（需 key），本轮不读密钥、不建任务，无法证明。
2. LinkFox 的 8 条案例是否真为逐句翻译 + 口型对齐：只有提交契约与 `status=1`，未下载产物做 LID/OCR 复验。
3. `HAPPY_HORSE` 为何出现在 type 96 目录：可能是目录复用/脏数据，不能据此推断能力。
4. Ark 是否有独立的「视频翻译」产品线（非 Seedance 生成）：公开视频生成文档无翻译字段；未穷举全部火山产品文档。
5. 自建链路（方案 3）的时延/成本/口型质量：未评估。

## 8. 复现方法

```bash
cd /Users/mac/Documents/Dev/infinite-canvas

# 1) 读 LinkFox 契约与真实案例
python3 - <<'EOF'
import json,gzip
print(json.load(open('docs/analysis/assets/linkfox/schema_final.json'))['VIDEO_TRANSLATION'])
c=json.load(gzip.open('docs/analysis/assets/linkfox/make_cases.json.gz','rt'))['96']['items']
print(len(c), [i['extendFields']['targetLanguage'] for i in c])
print(c[0]['extendFields'])
EOF

# 2) 读我方真实回执（模型/字段/任务 id）
python3 -c "import json;d=json.load(open('docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/02-tool-task-record.json'));print(d['configSnapshot'])"

# 3) 读内容级复验结论
sed -n '1,60p' docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md

# 4) 机读证据（含全部哈希）
cat docs/V1.0/plan_linkfox_navigation/reports/vt-protocol-r27/evidence/vt-protocol-evidence.json
```

## 9. 交付物与哈希

| 文件 | sha256 前 12 位 | 大小 |
|---|---|---|
| `docs/analysis/assets/linkfox/schema_final.json` | `7345e78d1e35` | 26,608 B |
| `docs/analysis/assets/linkfox/models_catalog.json` | `d3d9eabd71bc` | 170,381 B |
| `docs/analysis/assets/linkfox/make_cases.json.gz` | `965faff6c8ae` | 349,586 B |
| `.../VIDEO_TRANSLATION/r22-f/02-tool-task-record.json` | `11b3f9d2ed79` | 1,334 B |
| `.../VIDEO_TRANSLATION/r22-f/04-proxy-log-excerpt.txt` | `521844f18c27` | 3,230 B |
| `.../VIDEO_TRANSLATION/result.json` | `8bc920413088` | 5,209 B |
| `reports/vt-content-r24/REPORT.md` | `facffdbc8ac7` | 9,860 B |
| `reports/vt-language-r26/REPORT.md` | `ec2e1eaa9ed2` | 5,049 B |
| `.../volcengine-ark-video.md`（外部仓库，只读引用） | `4d132ae7eae3` | 3,012 B |
| `reports/video-translation-protocol-audit-20261029.md` | `f30fbb503d5d` | 6,978 B |

## 10. 一句话交接

**不要把「目标语言」继续包装成已生效能力。** 真正可落地的只有两件事：① 拿到 `DOUBAO_API/SEED_V25` 等价服务端并按 §5 方案 1 映射；② 在此之前，UI 按 §6 明示「仅提示词、不保证翻译」，并把结果标为未验证草稿。本轮为调查结论，未改动任何源码，**不代表翻译功能已完成**。
