# R31 独立审计报告 —— 39 工具六维矩阵重算

- **审计点（PIN）**：`e7826acfe4620a91c7651dc160112b1dad13bd1e`（fix(media-auth): 视频结果入库按原任务渠道补鉴权，修 401 API_KEY_REQUIRED）
- **基线**：`c17890c3` — docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r27-matrix/matrix.json
- **工具**：`tools/recompute_scope_matrix_r31.py`（`--check` 在任意 HEAD 重跑同一结论）
- **断言**：328/328 通过

## 0. 一句话结论

39 个工具 × 6 维共 234 格中，**非全绿 1 格**：`VIDEO_TRANSLATION.F`。
本轮 7 个待吸收提交**没有一个**把 `VIDEO_TRANSLATION.F` 从 PARTIAL 翻成 PASS，但它们把「为什么做不到」钉成了可复算的事实；同时新增两项必须单列的风险：**画幅只验到请求侧**、**媒体 401 只修到单测层**。

## 1. 判据与方法

1. 只吸收 PIN 树内已提交证据：size/sha256 由 `git cat-file blob` 现算，工作区未提交内容不参与判据。
2. 升级须通过硬断言（字段/取值/字节/sha 交叉相等）；断言失败即保持基线原判。
3. 能力级失败不因「UI 已诚实降级」转绿：T 与 F 分开判，T 绿不得替代 F。
4. 画幅/语言只在请求侧或单测层成立时，一律算「未验」：请求侧绿 ≠ 结果绿。
5. 未吸收提交只作负证，逐条登记到 unabsorbedCommits，并断言其确为 PIN 祖先。
6. 媒体鉴权风险单列 mediaAuthRisks，不折算进任何维度分数。
7. 门禁覆盖按时序机检：R28 四闸绑定 c17890c3，晚于它的提交必须判定为「未覆盖」。
8. R25→R27 的 38 个工具六维逐格比对，任何一格漂移即断言失败。

## 2. 与基线（R27）的差异

| 单元 | R27 | R31 | 依据 |
|---|---|---|---|
| VIDEO_TRANSLATION.F | PARTIAL | PARTIAL | 191/191 断言通过 |
| VIDEO_TRANSLATION.T | PASS | PASS | 35/35 断言通过 |
| VIDEO_TRANSLATION.R | PASS | PASS | 8/8 断言通过 |

`invariant.*` 断言保证其余 38 个工具六维逐格未漂移（42 条全部通过）。

## 3. 未吸收提交（逐个交代：为什么没进判据）

| 提交 | 主题 | 去向 | 理由 |
|---|---|---|---|
| `1ef24fba` | docs(video-translation): r27 上游协议调查结论 BLOCKED | VT.F（仅负证） | BLOCKED 是能力缺失的证明，不是能力证据；只加强「不得宣称翻译完成」，不给任何维度加分 |
| `454fa580` | test(video-translation): r26 真实上游复验——语言契约压住「朗读提示词」，但 zh 未生效 | VT.F（负证）/ VT.R（字节） | 目标 zh 的成片仍是英语（0 中文字符），只能作 F 的 FAIL 证据；同批 04-result.mp4 可用于 R 三方对账 |
| `bd71498f` | docs(video-translation): r27-aspect 画幅修复真实验收（请求侧通过；输出侧产物丢失阻断） | 未进 F（只到请求侧） | 请求档位 16:9/1280x720 已实测，但结果字节在上游 502 后消失、无 storageKey → 不得当「结果画幅已修」 |
| `b7970998` | verify(r28): 固定 HEAD c17890c3 独立四闸 | 门禁节（gate） | 四闸本身是绿，但绑定 c17890c3；晚于它的三个提交（UI/素材/鉴权）不在覆盖范围内 |
| `73075698` | feat(video-translation): 诚实降级 UI——标明 AI 重生成，非逐句翻译/口型对齐 | VT.T / VT.U | 只改「怎么说」，不改「能不能」；按文本内容断言判 T，绝不用它给 F 加分 |
| `a1f29d0c` | docs(vt-fixtures-r27): 新增真实中文语音测试素材 | 未进 F（尚无真实运行） | 素材就绪但没有任何真实任务引用它 → 是「准备好的输入」，不是「验证过的能力」 |
| `e7826acf` | fix(media-auth): 视频结果入库按原任务渠道补鉴权，修 401 | mediaAuthRisks（不进五维） | 纯函数矩阵 + 本地 HTTP + ingest 透传三组单测（自述 1560 pass），无真机复验、树内无日志 → 不能当作 401 已端到端修复 |

其中 `1ef24fba` 的 **BLOCKED** 结论只作负证：上游 `/v1/videos` 没有 `sourceLanguage / targetLanguage / lipSync / 字幕` 字段，所以「视频翻译」当前只能是「照提示词重生成」。

## 4. 媒体鉴权风险（单列，不折算进任何维度）

### MA1 · 未验证（代码已提交，证据等级=单测）

401 修复只到单测/本地 HTTP：media-auth 纯函数矩阵 + Bun.serve 本地链路 + ingest 透传，没有任何一次「真实 sub2 渠道 → 下载结果 → 入库」的真机回执

证据：
- `web/src/services/media-auth.test.ts`
- `web/src/stores/use-tool-task-store.ingest-auth.test.ts`
- `docs/r28-video-media-auth-401-receipt.md`

### MA2 · 不可回放

r27 那次 401 的产物已被上游删除（502→404），无法回放验证修复是否生效；只能靠新任务复验，而新任务尚未跑

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r27-aspect/06-proxy-log-content-401-404.txt`
- `docs/r28-video-media-auth-401-receipt.md`

### MA3 · 设计取舍（需在产品说明中写明）

鉴权按任务快照 channelId 解析且「不回退默认」——渠道被删后宁可 401 也不拿错 key；这是正确取舍，但意味着历史任务在渠道删除后永久不可取回

证据：
- `web/src/services/media-auth.ts`
- `web/src/services/media-auth.test.ts`

### MA4 · 覆盖缺口

媒体鉴权改动未被任何四闸覆盖（R28 四闸绑定 c17890c3，本改动 e7826acf 晚于它），自述 1560 pass 在仓库内没有日志可核

证据：
- `docs/r28-video-media-auth-401-receipt.md`
- `docs/V1.0/reports/verify-head-r28-fixed/summary.json`

## 5. 语言与画幅：本轮最硬的两组事实

### 5.1 目标语言 zh 未达成（454fa580 真实任务）

- 任务 `task-mvuilah9-v6u5s1` → 上游 `task_fnyYPg9WDzJfWzhWzjI9y80mBKUQNmT9`，渠道 `sub2::MiniMax-H3`，**succeeded**（1 attempt / 675s）
- 成片 1,199,227B / sha256 `a3613615…`：音轨仍是英语，0 个中文字符（强制 `-l zh` 也转不出中文）
- 源片是真实英语人声（6.59s，「Meet the watch…」）→ 不能用「没有语音」解释
- 已修掉的是「成片朗读提示词」（EVIDENCE 记「不再复现」）；未修掉的是「换语言」本身

### 5.2 画幅：请求侧绿，输出侧无字节（bd71498f）

- 请求：`globalSize=1:1` 被 plan 覆盖为 `16:9 / 1280x720`，`builtConfig.size=1280x720` ✅
- 结果：任务 succeeded 后 `502 → 状态查询 404 → 内容 401`，`items[0].ingestError=媒体下载失败（HTTP 401）`，无 `storageKey`，目录内无 mp4 ⛔
- 结论：**不得**表述为「画幅已端到端修复」

## 6. 门禁（R28 四闸）与覆盖缺口

- 目录：`docs/V1.0/reports/verify-head-r28-fixed`，绑定 commit `c17890c3`，记录结论 `PASS (4/4)`
- install：931 包 / exit0
- typecheck：0 error，program 3443 文件（web/src 410）
- test：1535 pass / 0 fail / 89 文件 / 8520 expect
- build：8831 modules / 443 dist 文件 / 入口 `index-DTgGRCtK.js`

**覆盖缺口（时序机检）**：四闸绑定 `c17890c3`，而以下提交都在它之后 → 均未被四闸覆盖：

- 诚实降级 UI `73075698`
- 中文语音素材 `a1f29d0c`
- 媒体鉴权修复 `e7826acf`

`gate31.coverage.no_gate_covers_late_commits` 断言：PIN 树内不存在任何绑定这些后继提交的门禁目录。

## 7. 中文语音素材（a1f29d0c）

素材本身已核实：104,361B / sha256 `7e4ab7c2…` / 7.4s / faster-whisper zh p=1.0 / VAD 覆盖 0.934 / 纯色无字画面（OCR 干扰为零）/ CC BY-SA 4.0。
**但它还没有被任何真实任务引用** → 是「准备好的输入」，不是「验证过的能力」。

## 8. T 维为什么可以 PASS（附判定依据）

T 的 PASS 由 35/35 条**文本内容断言**支撑（`matrix.tBasis` 全量列出），不是「UI 已降级所以绿」这种结论式判断：

- ✅ `t.files.committed` — honesty 组件 + workspace + 中英 i18n 全在 PIN 树内
- ✅ `t.i18n.blocks_found` — zh=1000B en=2072B
- ✅ `t.notice.rendered_in_workspace` — workspace 里渲染诚实提示
- ✅ `t.notice.has_testid` — 有稳定 testid
- ✅ `t.notice.not_dismissible` — 组件无关闭入口（常驻）
- ✅ `t.zh.title_states_not_translation` — 标题写明非逐句翻译/口型对齐
- ✅ `t.zh.title_states_no_real_channel` — 标题写明真实通道未接入
- ✅ `t.zh.body_prompt_only` — 正文写明语言只写进提示词
- ✅ `t.zh.body_no_guarantee` — 正文写明不能保证生效
- ✅ `t.zh.body_unverified_draft` — 正文要求按未验证草稿处理
- ✅ `t.zh.basis_cites_commit` — 依据引用协议调查提交 1ef24fba
- ✅ `t.zh.language_hint_no_field` — 语言选择器提示无上游字段
- ✅ `t.zh.source_hint_not_detected` — 源语言说明不被上游识别
- ✅ `t.zh.lipsync_disabled_reason` — 口型开关置灰并给理由
- ✅ `t.zh.lipsync_snapshot_unsupported` — 口型快照值=不支持
- ✅ `t.zh.output_count_honest` — 说明单结果限制
- ✅ `t.zh.result_title_unverified` — 结果区标题标注未验证
- ✅ `t.zh.result_badge` — 结果徽标要求人工确认
- ✅ `t.zh.sidebar_no_dub_claim` — 侧栏写明不代表译制完成
- ✅ `t.zh.history_hint` — 历史任务同样需人工确认
- ✅ `t.en.title_states_not_translation` — EN 标题同构
- ✅ `t.en.title_no_real_channel` — EN 写明无真实通道
- ✅ `t.en.body_prompt_only` — EN 正文写明仅提示词
- ✅ `t.en.body_no_guarantee` — EN 写明不保证生效
- ✅ `t.en.result_badge` — EN 结果徽标
- ✅ `t.no_false_promise` — []
- ✅ `t.no_brand_word` — []
- ✅ `t.no_billing_placeholder` — []
- ✅ `t.lipsync.forced_false_in_state` — 状态层强制 lipSync=false
- ✅ `t.lipsync.section_has_testid` — 口型区块有 testid
- ✅ `t.lipsync.snapshot_rendered` — 页面渲染不支持快照值
- ✅ `t.language.section_has_testid` — 语言区块有 testid
- ✅ `t.language.badge_no_effect` — 语言区有「仅提示词」徽标
- ✅ `t.test.committed` — web/src/components/tools/workspaces/video-translation-honesty.test.tsx
- ✅ `t.test.asserts_no_false_promise` — 测试断言不含「已完成」类文案

同时明文限定：**T=PASS 与 F=PARTIAL 并存**，说清楚了不等于做到了（见 nonClaims NC16）。

## 9. 精确剩余非全绿项

### VIDEO_TRANSLATION · F = PARTIAL

R31 维持 PARTIAL。相比 R27：证据更硬（真实失败任务 + 真实丢产物），但没有任何一项把「目标语言未达成」翻转。UI 变诚实、画幅请求侧变对、鉴权补了单测，都不能替代「成片里出现目标语言语音与字幕」。

证据：
- `docs/V1.0/plan_linkfox_navigation/reports/vt-language-r26/REPORT.md`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-language-r26/EVIDENCE.md`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-language-r26/artifacts/05-result-analysis.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r27-aspect/REPORT.md`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r27-aspect/05-tool-task-record-succeeded.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r27-aspect/06-proxy-log-content-401-404.txt`
- `docs/r28-video-media-auth-401-receipt.md`
- `docs/V1.0/plan_linkfox_navigation/evidence/fixtures/zh-speech-r27/fixture-evidence.json`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-protocol-r27/REPORT.md`
- `VIDEO_TRANSLATION/r22-g/REPORT.md`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md`
- `docs/V1.0/plan_linkfox_navigation/reports/vt-aspect-r26/report.md`

## 10. 非声明（明确不主张的事）

| ID | 维度 | 不主张 | 实际情况 | 闭合条件 |
|---|---|---|---|---|
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
| NC12 | F | 「画幅修复已端到端生效」 | bd71498f 只证明请求侧：globalSize 1:1 被 plan 覆盖为 16:9/1280x720，builtConfig.size=1280x720。结果 mp4 在任务 succeeded 后经 502→404→401 消失，无 storageKey、目录内无 mp4 → 输出侧像素无证据。 | 产物存活窗口内立刻下载并 ffprobe 记录宽高，或让入库把字节写进仓库。 |
| NC13 | F | 「语言契约已修复，翻译已生效」 | 454fa580 修掉的是「成片朗读提示词」这一现象（EVIDENCE 记「不再复现」），但目标语言 zh 仍未达成：成片音轨英语、0 个中文字符、强制 -l zh 也无中文。 | 上游提供 translation 字段或换可翻译通道；否则产品只能叫「AI 重生成」。 |
| NC14 | F | 「401 已端到端修复」 | e7826acf 的验证是纯函数矩阵 + 本地 Bun.serve + ingest 透传单测（自述 1560 pass，树内无日志），没有真实渠道上的下载/入库回执；旧产物已被上游删除，无法回放。 | 跑一次新任务，把「下载成功 + storageKey + 字节 sha」写进仓库。 |
| NC15 | F | 「中文语音素材已验证翻译能力」 | a1f29d0c 只交付素材（104,361B / 7.4s / ASR zh p=1.0 / VAD 0.934 / 纯色无字画面），真实验收目录内没有任何文件引用它 → 尚未被任何任务消费。 | 用该素材跑一次真实任务，并给出目标语言达成情况。 |
| NC16 | T | 「T 绿=能力可用」 | T 只断言文案诚实（能力缺失被写明、结果标注未验证、无虚假承诺/品牌/计费占位）。T=PASS 与 F=PARTIAL 同时成立：说清楚了≠做到了。 | 无需闭合；文档中禁止用 T 绿替代 F 的能力结论。 |
| NC17 | H | 「H 维度吸收了本轮新证据」 | R31 没有新增 H 证据（无 b5-*/task-real-* 新回执，无新 recovery 目录）。H 维持基线判，不由本轮任何提交支撑。 | 若要用新提交支撑 H，需给出对应真实回执。 |

## 11. 风险清单

- **VIDEO_TRANSLATION.F**：目标语言未满足：可宣告「生成成功」，不能宣告「翻译成功 / 译制完成」
- **VIDEO_TRANSLATION.F**：字幕未交付：无字幕流、底部条带 0 命中 → 「译制语音与字幕统一」的字幕一半不存在
- **VIDEO_TRANSLATION.F**：画幅只到请求侧：结果画幅（720x720 还是 1280x720）没有像素证据，且不在最新四闸覆盖内
- **VIDEO_TRANSLATION.F**：媒体入库 401 只在单测层修复；真机是否仍 401 未知（旧产物已被上游删除，无法回放）
- **VIDEO_TRANSLATION.F**：上游产物会蒸发：任务 succeeded 后 502/404 即可让结果永久不可取，验收必须在产物存活窗口内做
- **VIDEO_TRANSLATION.F**：素材就绪 ≠ 能力就绪：zh 素材还没有跑过任何真实任务
- **VIDEO_TRANSLATION.T**：T 绿只说明「说得对」，不说明「做得到」：同一轮 F 仍 PARTIAL
- **VIDEO_TRANSLATION.T**：若后续新增别的入口（如批量/工作流）未复用该组件，文案可能不一致
- **VIDEO_TRANSLATION.R**：字节可复算只说明「拿到了结果文件」，不说明结果语言正确（见 F）

## 12. 断言总表（失败项）

无失败断言。

## 13. 复现方式

```bash
python3 tools/recompute_scope_matrix_r31.py --check   # 只读 PIN 树 + 断言，任一失败即非 0 退出
python3 tools/recompute_scope_matrix_r31.py          # 重新生成 docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r31-matrix/matrix.json|matrix.md|report.md
```

> `--check` 不写盘、不读工作区未提交内容；换到更新的 HEAD 也得到同一结论（证据全部来自固定 PIN 树）。

