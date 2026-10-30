# R27 独立审计报告（infinite-canvas · 39 工具六维）

## 0. 结论

在审计点 `e2529d42` 上，39 个工具 × 6 维共 234 个单元：各维度分布与基线相同。**非全绿单元 1 个 / 工具 1 个**。

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 1 / PASS 38 |
| T | PASS 39 |
| R | PASS 39 |
| H | PASS 39 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

- **VIDEO_TRANSLATION.F 维持 PARTIAL（不是 PASS）**：内容级复验显示目标语言英语未满足（结果音轨中文，zh p≥0.987）、字幕未交付（底部条带 0 命中）、源片 0% 语音（纯音乐）→ 有效输入前提不成立。FAIL 证据见 6.5，**不得表述为「翻译成功」**。

## 1. 审计点与门禁

- PIN（审计点）：`e2529d422b9f2f4b50209b12f73ec4e7bbd8e492`，分支 `feat/linkfox-v1-real`
- 门禁绑定提交：`eacc18f7cb16d15ed40afaed6beeff13da1c39a9`（tree `3fbda4bac69ca39f92f94f25e6bf74b6a5ef43eb`，web 树 `3722e3cfa871ba792c2f21d0f3d54f677b385655`）
- 门禁日志来源：`docs/V1.0/reports/verify-head-r26-fixed (PIN tree blob)`（随该提交入库，本工具从 blob 现读，不读工作区、不引用他人临时目录）
  - typecheck：exit0=True，error TS 计数 0，369.03s
  - test：1514 pass / 0 fail / 1514 tests · 88 files，exit0=True
  - build：88.0s · 8830 modules · index-BM1Z8JG7.js ≈ 5616.02 kB · dist 443 文件，exit0=True
- 覆盖关系（本工具实测）：门禁 `eacc18f7:web` == `3722e3cf`，但与 PIN `e2529d42:web` **不同**（PIN 含 2dd097bb 画幅改动）→ 四闸**不覆盖**审计点全部源码，缺口见 6.7。
- 原始日志副本：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r27-matrix/evidence/gate-logs/`；机读摘要：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r27-matrix/evidence/gate.json`
- 边界：门禁只断言「该提交的源码 + 单测 + 构建」为绿；真实模型调用、E2E 与浏览器视觉验收不在四闸范围内（见第 4 节 nonClaims）。

## 2. 本轮复核明细（6 条，逐条硬断言）

### REMOVE_PEN.H：PASS → PASS（维持原判，断言全过）

- 断言 36/36 通过

R23 复核（r22-h 回执机检）：同一真实任务 task-mvtp33dv-57nmbx 的**四条腿**（任务结果 media_files / 面板下载落盘 / 存入资产 asset_store / 发送画布 canvas_store 节点）字节均 1,831,533B 且 sha 2f8f7f11… 全等；审计侧对四个已提交产物 blob 重算 size+sha256 亦与回执声明一致。fresh reload 标记 navType=reload（timeOrigin 1793331967901.4）+ 刷新后 resultImg blob 1024×1024 complete + 三动作按钮 enabled；回执自判 checks.canvasSent=true（R21 时该腿缺失，本轮补齐），四腿在同一机读回执内闭合。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/receipt.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/result.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/downloads/apple_1024-erased.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/asset-blob.bin`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/canvas-node-blob.bin`

### IMAGE_TEXT_EDIT.H：PASS → PASS（维持原判，断言全过）

- 断言 36/36 通过

R23 复核（r22-h 五腿回执机检）：真实任务 task-mvufj9u8-wefie4 succeeded，**五条链路**（media_files 结果位图 / 工具面板下载 / asset_store 入库 / canvas_store 节点 / /assets 资产卡下载）字节均 1,050,148B、sha 5665d290… 全等；审计侧对两个已提交 png blob 重算一致。reload 标记为 CDP Page.reload 后 navigation.type=reload，刷新后 asset_store 与画布节点 image:LnKmlw… 均在、字节 sha 仍全等。回执同时自报并发写风险（首次存资产的 assetId 在持久化 store 中缺失，疑似跨标签 last-write-wins），已在 risks 记录，不据此改判 H。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/r22h-bytes-and-propagation-20261030.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/tool-download-1050148-5665d290.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/asset-card-download-1050148-5665d290.png`

### AI_VIDEO_EDITING.H：PASS → PASS（维持原判，断言全过）

- 断言 35/35 通过

R23 复核（r21 recovery 回执 + 外置验证脚本）：真实任务 task-mvt42rpv-kfl1ov succeeded（上游 task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm），结果项 storageKey 为任务绑定键 tool-result:task-mvt42rpv-kfl1ov:0:video-0（legacy 键字节由 adoptLegacyResultMedia 原样搬运，非生成、非快照回填），payloadDropped=false。fresh reload 为同标签 CDP Page.reload（navType=reload、timeOrigin 1793288782457.9→1793288879030.1、sessionStorage 探针存活），刷新后历史卡可见、点「查看结果」回填结果区、三动作按钮 enabled。legacy/采纳键/下载落盘/入库资产/画布节点五处字节 2,268,656B 且 sha 47573c14… 全等，审计侧对已提交归档 mp4（docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4）重算 size+sha256 一致；外置脚本 tools/verify_ai_video_editing_h_r21.py 复跑 20/20 PASS。

证据：
- `evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-r21-20261029.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`
- `tools/verify_ai_video_editing_h_r21.py`
- `web/src/stores/use-tool-task-store.ts`
- `web/src/stores/use-tool-task-store.provenance-heal.test.ts`

### AI_VIDEO_EDITING.H：PASS → PASS（维持原判，断言全过）

- 断言 35/35 通过

R25 新增佐证（2ecd958d / r22-h）：**另一次**真实任务 `task-mvug7gog-h1df2z`（旧证据是 r21 recovery 回执，本轮不复用）—— 刷新后两上传区各回本槽（源 1/1、参考 1/1，修复前源槽会串入 ref.png），任务续跑至 succeeded；结果视频 1,984,977B（sha `e0c85726…`），本工具解析 1344×768 / 6.584s / 158 帧，与源片 5.167s / 124 帧可区分。（全部断言通过）**未主张**：该目录无下载/存资产/发画布三动作字节腿（仅结果区三按钮文案），故不构成 F 证据；上游时长/画幅与请求不完全一致属上游行为，未做前端兜底验证。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/01-reload-restore.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/02-task-result.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.mp4`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.ffprobe.txt`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/REPORT.md`

### VIDEO_CONCAT.F：PASS → PASS（维持原判，断言全过）

- 断言 33/33 通过

R23 复核（r22-f 回执机检）：过期任务 task-mvtof8um-7034v0 按 upstreamTaskId 真查上游后恢复成功（succeeded），结果 4,633,118B sha 928c4113…。三动作（下载 / 存入资产 / 发送画布）均真实点击且有回执，字节全部 4,633,118B 且与任务结果同 sha；审计侧对已提交 downloaded.mp4 重算 size+sha256 一致；另经 /__media/upload 发布后公网回读 HTTP 200、Content-Type video/mp4、回读字节与 sha 全等，preview-public.png 证明可解码预览。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/receipt-r22-f.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/downloaded.mp4`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-file.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-public.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/public-publish.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/store-records.json`

### VIDEO_TRANSLATION.F：PARTIAL → PARTIAL（维持原判，断言全过）

- 断言 125/125 通过

**R27：维持 PARTIAL（不是 PASS）**。工程链路仍成立：真实任务 `task-mvuflf9e-djxprc`（上游 `task_dYZ…`）succeeded，四条腿字节同为 **1,249,837B**；eacc18f7 的 r22-g 回执把资产/画布/源片三腿 sha256 全部绑定到 `7c15bdb2…`，asset data 由兜底的 1280×720 校正为 **768×768 / 6583ms**（与本工具自解析 mp4 一致），溯源 taskId=resultItemId 保留 → R25 的 F1 关闭。**但任务目标未达成，三条 FAIL 证据（内容级，e2529d42）：**①目标语言英语 → 实测结果音轨为中文（LID small 0.9967 / base 0.9927 / ASR medium 0.9873；强制 language=en 仍转出中文字符）；②字幕 → 158 帧底部条带 OCR 在 en-US/zh-Hans 双 locale 下均 0 命中；full frame 高置信(conf≥0.5)命中仅 en 1 条「CAT」(y=0.516 画面中部，属背景文字)，zh 侧 4 条均为 conf=0.3 的画面中部噪声；无字幕流、无烧录字幕；③有效输入前提不成立 → 源片 VAD 在 0.3/0.5/0.7 三档均为 0 段 / 0.0%（5.184s 纯音乐），而结果片旁白内容是在朗读任务说明，并非对源片语音的翻译。此外 2dd097bb 的画幅修复只覆盖**请求侧**（注册表 outputRatio 默认 source + 偏差提示 + 单测），报告自述「未重跑真实翻译」，故真实输出画幅仍未验；且该提交晚于门禁 eacc18f7，未被任何四闸覆盖。→ 维持 PARTIAL；升 PASS 的最小闭合集：用**有语音**的源片重跑一次真实任务，并交付 目标语言 ASR 断言 + 字幕文件/烧录帧 OCR 命中 + 真实输出画幅 三件证据。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-g/verify.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/vad-speech.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/lid-distribution.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/asr-medium-crosscheck.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/summary.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-aspect-r26/report.md`

## 3. 精确剩余非全绿项

### VIDEO_TRANSLATION.F = PARTIAL

**R27：维持 PARTIAL（不是 PASS）**。工程链路仍成立：真实任务 `task-mvuflf9e-djxprc`（上游 `task_dYZ…`）succeeded，四条腿字节同为 **1,249,837B**；eacc18f7 的 r22-g 回执把资产/画布/源片三腿 sha256 全部绑定到 `7c15bdb2…`，asset data 由兜底的 1280×720 校正为 **768×768 / 6583ms**（与本工具自解析 mp4 一致），溯源 taskId=resultItemId 保留 → R25 的 F1 关闭。**但任务目标未达成，三条 FAIL 证据（内容级，e2529d42）：**①目标语言英语 → 实测结果音轨为中文（LID small 0.9967 / base 0.9927 / ASR medium 0.9873；强制 language=en 仍转出中文字符）；②字幕 → 158 帧底部条带 OCR 在 en-US/zh-Hans 双 locale 下均 0 命中；full frame 高置信(conf≥0.5)命中仅 en 1 条「CAT」(y=0.516 画面中部，属背景文字)，zh 侧 4 条均为 conf=0.3 的画面中部噪声；无字幕流、无烧录字幕；③有效输入前提不成立 → 源片 VAD 在 0.3/0.5/0.7 三档均为 0 段 / 0.0%（5.184s 纯音乐），而结果片旁白内容是在朗读任务说明，并非对源片语音的翻译。此外 2dd097bb 的画幅修复只覆盖**请求侧**（注册表 outputRatio 默认 source + 偏差提示 + 单测），报告自述「未重跑真实翻译」，故真实输出画幅仍未验；且该提交晚于门禁 eacc18f7，未被任何四闸覆盖。→ 维持 PARTIAL；升 PASS 的最小闭合集：用**有语音**的源片重跑一次真实任务，并交付 目标语言 ASR 断言 + 字幕文件/烧录帧 OCR 命中 + 真实输出画幅 三件证据。

证据路径：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-g/verify.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/vad-speech.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/lid-distribution.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/asr-medium-crosscheck.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/summary.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-aspect-r26/report.md`

## 4. 不得写成通过（nonClaims，逐条已备案）

| # | 维度 | 不主张 | 实测事实 | 闭合方式 |
| --- | --- | --- | --- | --- |
| NC1 | F | VIDEO_TRANSLATION 三腿 sha256 一致是「审计侧独立测得」 | eacc18f7 的 r22-g 回执给出 asset/node/source 三腿 sha256 均等于 7c15bdb2…274c；但三腿中只有 source（06-result-video.mp4）在仓库内有 blob，可由本工具独立复算，asset/canvas 两腿的 sha 是**产品页内自算并写入回执**，审计侧无法独立复现该计算。 | 把 asset/canvas 两腿产物各存一份 blob 入库，审计侧独立复算 sha 后再主张「独立一致」。 |
| NC2 | F | VIDEO_TRANSLATION 的 ASR/字幕/配音语种正确 | e2529d42 已补齐内容级证据，但结论是**负面**：结果音轨为中文（LID small 0.9967 / base 0.9927 / ASR medium 0.9873，强制 language=en 仍出中文字符）；158 帧底部条带双 locale 0 命中 → 无字幕交付。即「已验，且不合格」，不是「未验」。 | 用含清晰人声的源片重跑，回执须含 lang=en 断言 + 字幕文件 sha / 烧录帧 OCR 命中。 |
| NC3 | F | 资产尺寸修复已由审计侧在浏览器内独立复跑验证 | eacc18f7 后 r22-g reload 实测 asset 768×768 / 6583ms / 1,249,837B，与本工具自解析 06-result-video.mp4 的 tkhd 768×768 一致，旧 1280×720 兜底已不再出现（本工具已断言 before_fix=1280×720 且 after_fix≠1280×720）。但该流程结论来自产品自测回执，审计侧未独立重跑「存资产」链路。 | 在独立环境重跑一次存资产，导出 IDB 资产记录与媒体元数据比对。 |
| NC4 | F | AI_VIDEO_EDITING 三动作（下载/存资产/发画布）已由新证据复核 | r22-h 只有任务终态 + reload 分槽 + 结果/源视频 blob（本工具自解析 1344×768/6.584s/158 样本），没有任何动作字节回执；该工具 F 维维持基线判，不由本轮新证据支撑。 | 为该次（或新一次）真实任务补三动作回执 + 每条腿字节/sha。 |
| NC5 | F | AI_VIDEO_EDITING 结果时长与源片一致（未解释偏差） | 源 5.167s/124 帧 → 结果 6.584s/158 帧（+27%），报告只陈述事实未给解释；属上游模型行为，未验是否合规。 | 确认为上游能力边界并写入产品说明，或复测确认可复现。 |
| NC6 | GATE | PIN（e2529d42）全部源码已通过四闸 | 四闸绑定 eacc18f7（install 0 / typecheck 0 error / 1514 tests 88 files / build 8830 模块 443 产物）。2dd097bb（画幅修复，改 web/src 4 个文件 + 1 个报告）提交在其后，故该改动**未被任何四闸覆盖**；本工具断言 PIN 树内不存在绑定 2dd097bb 及其后继的门禁目录。 | 在含 2dd097bb 的提交上重跑四闸并在 summary.json 里绑定该 commit。 |
| NC7 | ALL | 工作区未提交内容已复核 | 审计时工作区存在未提交内容：use-asset-store.ts（资产竞态修复）、video-translation.ts/.test.ts（语言/画幅新 E2E）、reports/vt-language-r26/（空 evidence 目录）、.tmp_assetrace/。这些一律不参与判据，只在 unabsorbed 登记。 | 提交后把 PIN 前移到该提交并重跑本工具。 |
| NC8 | F | VIDEO_TRANSLATION 已把语音翻译成目标英语 | 任务 prompt 要求英语；实测结果音轨为中文（LID small 0.9967 / base 0.9927，ASR medium zh 0.9873；强制 language=en 仍输出中文字符）。这是目标语言未满足的**硬失败**，不是「翻译质量差」。 | 用真实有语音的源片重跑，并把结果音轨的 ASR/LID 断言写进回执（lang=en 且 p 达标）。 |
| NC9 | F | VIDEO_TRANSLATION 已交付字幕（烧录或字幕流） | 158 帧底部条带 OCR 在 en-US / zh-Hans 双 locale 下 0 命中；full frame 仅在 y=0.516 画面中部命中一次 「CAT」(conf 0.5，背景文字)；报告亦记录无字幕流。阳性对照 30px 与 14px 灵敏度梯在同 locale 下 conf 1.0，可排除「分辨率导致漏检」。 | 在回执中给出字幕文件 sha 与烧录帧底部条带 OCR 命中。 |
| NC10 | F | 本次运行可作为「语音翻译」能力证据 | 源片 5.184s，VAD 三档阈值均为 0 段 / 0.0%（纯音乐）；结果片旁白是在朗读任务说明（「原视频语音识别…翻译成…」），并非对源片台词的翻译。**有效输入前提不成立**。 | 换用含清晰人声的源片重跑；并在回执中记录 VAD 语音占比。 |
| NC11 | F | 输出画幅已按源片修好（真实端到端） | 2dd097bb 只改请求侧（outputRatio 默认 source、按源像素比选档位、偏差提示、单测 39 例），报告自述「未重跑真实翻译」「上游收到 ratio=16:9 后是否稳定返回 16:9，仍未经实测」。 | 用 1344×768 源片重跑一次真实任务，核对结果 tkhd 画幅与请求档位是否一致。 |

## 5. 可复核证据路径（本轮复核单元）

- **REMOVE_PEN.H**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/receipt.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/result.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/downloads/apple_1024-erased.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/asset-blob.bin`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/canvas-node-blob.bin`
- **IMAGE_TEXT_EDIT.H**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/r22h-bytes-and-propagation-20261030.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/tool-download-1050148-5665d290.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/asset-card-download-1050148-5665d290.png`
- **AI_VIDEO_EDITING.H**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/01-reload-restore.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/02-task-result.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.mp4`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.ffprobe.txt`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/REPORT.md`
- **VIDEO_TRANSLATION.F**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-g/verify.json`
  - `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md`
  - `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/vad-speech.json`
  - `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/lid-distribution.json`
  - `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/asr-medium-crosscheck.json`
  - `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/summary.json`
  - `docs/V1.0/plan_linkfox_navigation/reports/vt-aspect-r26/report.md`
- **VIDEO_CONCAT.F**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/receipt-r22-f.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/downloaded.mp4`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-file.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-public.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/public-publish.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/store-records.json`

## 6. 缺陷与风险（不改判，但须记录）

| # | 严重度 | 问题 | 影响 | 证据 |
| --- | --- | --- | --- | --- |
| F1 | fixed | 视频资产入库尺寸兜底 1280×720（已由 eacc18f7 关闭） | R25 记录：asset.data.width/height=1280×720 兜底值与真实 768×768 冲突。eacc18f7 改为「只信未超时的严格测量，测不到写 0×0 + mediaMetaPending 并后台校正」；r22-g 回执 reload 后实测 asset 768×768 / 6583ms / 1,249,837B，三腿 sha 与源文件一致，溯源字段保留。本工具已独立复算 bytes+sha 并与自解析 mp4 尺寸互证。 该缺陷关闭，不再影响资产列表/插入画布的比例显示；仅剩「后台标签页先落 0×0 待校正」的交互取舍（单测覆盖）。 | `verify.json` |
| F2 | low | 视频翻译任务上游耗时与并发轮询未量化 | 05 记录 submittedAt→finishedAt 完整，但未记录上游轮询次数/间隔；无法据此判断限流或重试策略是否生效。 不影响判据。 | `05-tool-task-record-succeeded.json` |
| F3 | low | AI_VIDEO_EDITING 结果时长较源片 +27% | 源 5.167s → 结果 6.584s（124→158 帧），报告只陈述未解释；属上游模型行为。 不影响 F/H 判据，但产品说明需注明能力边界。 | `REPORT.md` |

- **IMAGE_TEXT_EDIT**：ITE 首次「存入资产」返回的 assetId 在持久化 asset_store 中缺失（疑似跨标签 last-write-wins 覆盖）→ 真实并发写缺陷，需后续修复；不影响本条五腿字节一致结论（第二次入库记录与字节均已复核）。
- **AI_VIDEO_EDITING**：AI_VIDEO_EDITING.H 的证据来自 **r21 历史任务的恢复回执**（本次审计未重新生成媒体）：结果字节由 adoptLegacyResultMedia 从 IndexedDB legacy 键搬运（copy，不重算）。rubric 字面满足（三动作 + 结果 + 刷新观测 + 已提交归档字节可复核），但若要求「同一会话内新生成」，需补一次全新跑。
- **AI_VIDEO_EDITING**：01-reload-restore.json 是单引号 Python-repr 而非合法 JSON（json.loads 报 line 1 column 2），本工具用 ast.literal_eval 容错解析；机器可读性不达标，建议重导为 JSON
- **VIDEO_CONCAT**：画布节点 metadata.naturalWidth/Height = 1280x720，与真实 768x1344 不符：发送画布时 readVideoMeta 在后台标签超时 → 走 FALLBACK_VIDEO_WIDTH/HEIGHT（media-metadata.ts:17，timedOut 标记设计如此）。后果：后台标签里发画布会得到 16:9 尺寸。建议（未做）：超时后置 timedOut 时不写死尺寸，改为按 storageKey 二次测量或用内容真实比例。
- **VIDEO_CONCAT**：本仓库无 archiveUrl 字段实现（rg 'archiveUrl' src 为空），公网回读是用项目自带 /__media/upload 通道完成，非产品内建归档能力。
- **VIDEO_CONCAT**：任务结果区在后台标签下 video 不显示画面（同上节流），用户切到该标签即恢复，属浏览器行为。
- **VIDEO_TRANSLATION**：结果音轨为中文而任务要求英语（LID/ASR 三模型一致）→ 目标语言未满足，不能表述为「翻译成功」
- **VIDEO_TRANSLATION**：无字幕流且 158 帧底部条带无烧录字幕 → 「译制语音与字幕统一使用该语言」的字幕一半未交付
- **VIDEO_TRANSLATION**：源片 0% 语音（纯音乐）→ 本次运行不能作为「语音翻译」能力的证据
- **VIDEO_TRANSLATION**：画幅修复仅请求侧 + 单测，真实端到端画幅未实测，且未被最新四闸覆盖

## 6.5 VIDEO_TRANSLATION.F 内容级 FAIL 证据（R27 新增，禁止写成通过）

| # | 判据（任务 prompt） | 实测 | 判定 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | 译制语音为目标语言英语（prompt 原文） | 结果音轨为中文：LID small zh p=0.9967 / base zh p=0.9927；ASR medium zh p=0.9873；强制 language=en 仍转出中文字符 | FAIL（目标语言未满足） | `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/lid-distribution.json` |
| 2 | 字幕与译制语音统一使用该语言 | 158 帧底部条带 OCR：en-US 0 命中 / zh-Hans 0 命中；full frame 高置信(conf≥0.5)命中仅 en 1 条「CAT」(y=0.516 画面中部)，zh 侧 4 条均为 conf=0.3 画面中部噪声 | 未交付（N/A，不判 PASS） | `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/summary.json` |
| 3 | 把源片语音翻译成目标语言（有效输入前提） | 源片 VAD 0.3/0.5/0.7 三档均为 0 段 / 0.0%（5.184s 纯音乐）；结果片 VAD 96.4% 有语音，内容为朗读任务说明 | 前提不成立（不得宣称翻译成功） | `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/vad-speech.json` |
| 4 | 资产/画布/源片字节一致（工程链路） | 三腿 sha256 均为 7c15bdb2…274c、1,249,837B；asset 768×768 / 6583ms（此前兜底 1280×720 已修正） | PASS（仅工程链路，不构成任务目标达成） | `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-g/verify.json` |

> 判读：本次真实运行的**工程链路**（提交 → succeeded → 下载 → 存资产 → 发画布 → 字节/sha）成立；
> 但**任务目标**（把语音翻译成目标英语、替换音轨与字幕）不成立——源片无语音、结果音轨为中文、字幕未交付。
> 因此 F 只能 PARTIAL；/videos 成功或任务 succeeded 都不能作为 F 绿的依据。

## 6.6 未吸收（审计时未提交，一律不参与判据）

| # | 路径 | 类型 | 说明 | PIN 树状态 |
| --- | --- | --- | --- | --- |
| U1 | `docs/V1.0/plan_linkfox_navigation/reports/vt-language-r26/` | untracked-dir | 语言/画幅新 E2E 证据目录（审计时仅有空 evidence/），未提交 → 不吸收 | 不在树内 |
| U2 | `.tmp_assetrace/` | untracked-dir | 资产竞态复现脚本与 evidence-pristine/fixed-*.json，未提交 → 不吸收 | 不在树内 |
| U3 | `web/src/stores/use-asset-store.ts` | tracked-modified | 资产竞态修复（工作区 +81/-16）未提交；PIN 树内仍是旧版本，本轮不据此改判 | 在树内（旧版本，工作区改动不读） |
| U4 | `web/src/features/tools/adapters/video-translation.ts` | tracked-modified | 语言/画幅新 E2E 相关 adapter 改动（工作区 +76/-16）未提交 | 在树内（旧版本，工作区改动不读） |
| U5 | `web/src/features/tools/adapters/video-translation.test.ts` | tracked-modified | 对应新 E2E 的测试用例（工作区 +36）未提交 | 在树内（旧版本，工作区改动不读） |

## 6.7 门禁覆盖缺口（时序事实）

- 四闸绑定 `eacc18f7`（fix(tools): 存入资产不再写 1280x720 视频兜底尺寸，改严格测量+后台校正）。
- `2dd097bb`（画幅修复，改 web/src 4 文件 + 1 报告）提交晚于该门禁 → **未被任何四闸覆盖**；其自带证据只有单测（39 pass）与局部 `tsc --noEmit`。
- 因此 2dd097bb 的结论只到「源码与报告已提交、请求侧逻辑有单测」，不代表含该改动的整树构建/全量测试为绿。

## 7. 断言总表

- 断言 82/82 通过

## 8. 复现

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
python3 tools/recompute_scope_matrix_r27.py --check     # 在任意后续 HEAD 上重算并与本矩阵比对
```

重算器只读 `git cat-file`（PIN 树），不读工作区未提交内容，因此结论不随后续提交漂移。
