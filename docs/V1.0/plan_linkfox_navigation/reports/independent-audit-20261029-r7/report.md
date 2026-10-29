# 39 工具独立证据矩阵 · 第 7 轮刷新（2026-10-29）

- 分支 `feat/linkfox-v1-real` ｜ 执行时 HEAD `e8121d7`（开工 `b95ff4c`，期间被并行提交推进：`df765ff` → `670062f` → `e8121d7`）
- 生成时间 2026-10-29T16:48；判定来源：`tools/independent_evidence_audit.py`（严格）+ `tools/scope_audit.py`（T/U）
- 口径（与 r6 一致，未放宽）：只认**已提交**的机器回执（JSON/DOM 序列化/字节/哈希）；R 由脚本重读产物字节并复核尺寸；**单测、注入快照、仅文字描述**不支撑 H=PASS
- 本轮新增：对 r6 之后 11 个提交逐一开箱核对，并对 6 个产物文件做**独立 sha256 / ffprobe 复算**（不采信提交说明）

## 一、汇总（r6 → r7）

| 维度 | r6（HEAD f5c580e） | r7（HEAD e8121d7） | 变化 |
| --- | --- | --- | --- |
| F 功能 | PASS 22 / PARTIAL 16 / BLOCKED 1 | **PASS 23 / PARTIAL 16** | +1 PASS（FIX_COLOR），−1 BLOCKED（SALE_VIDEO→PARTIAL） |
| T 文案 | PASS 32 / PARTIAL 7 | PASS 32 / PARTIAL 7 | 无 |
| R 真实生成 | PASS 35 / BLOCKED 4 | **PASS 37 / BLOCKED 2** | +2（FIX_COLOR、SALE_VIDEO） |
| H 历史 | PASS 8 / PARTIAL 31 | **PASS 13 / PARTIAL 26** | +5 |
| K 案例 | PASS 10 / N/A 29 | PASS 10 / N/A 29 | 无 |
| U 设计 | PASS 39 | PASS 39 | 无 |

`problems = []`（脚本自检：无「H=PASS 但恢复路径不够格」、无「证据文件缺失」、无「H 状态与路径冲突」）。

### 逐项变更（脚本 diff，非人工认定）

| 工具 | 变更 | 依据提交 |
| --- | --- | --- |
| `FIX_COLOR` | F PARTIAL→PASS、R BLOCKED→PASS、H PARTIAL→PASS | 7a56082、6d9bd86（+ 0134fb6 落盘链路） |
| `SALE_VIDEO` | R BLOCKED→PASS、F BLOCKED→PARTIAL | b43a21d |
| `IMAGE_TRANSLATION` | H PARTIAL→PASS | 9e8b6cc / dd44be3 |
| `SCALE_UP` | H PARTIAL→PASS | 0134fb6 |
| `CHANGE_COLOR` | H PARTIAL→PASS（F 仍 PARTIAL） | 0134fb6 |
| `VIDEO_CONCAT` | H PARTIAL→PASS（R 仍 BLOCKED） | 39bf486 |

零降级：r6 的 39 行状态中没有一项被打回。

## 二、对用户点名的提交逐个开箱

| 提交 | 声称 | 实际证据（我方复核） | 判定 |
| --- | --- | --- | --- |
| `b43a21d` 口播真实 MP4/历史 | 既有真实任务续查 | 任务 `task-mvt76u6p-7cfnff` succeeded，上游 `task_hhe2Fmdx…`；产物 **1366190B**，ffprobe 实测 **h264 768×768 24fps + aac，6.5833s**，sha256 `39193f0a…`；`~/Downloads/sale-video-result-1.mp4` 实测同字节。**但**下载/存资产(`CSjc856F5YIETwEX435Cr`)/画布(`P3rUhnqi1Rm9ZpAqs4KPo`) 三动作只写在 `FOLLOWUP_20261029.md`，无 JSON/DOM 回执 | R **PASS**；F **PARTIAL**；H **PARTIAL**（人工记录，不计 PASS） |
| `0134fb6` 放大/换色落盘+回放 | 修 getPersistedToolGateway + useRestoredTask | `HISTORY_RECOVERY_MINE/{SCALE_UP,CHANGE_COLOR}/run.json`：真实 `POST /images/edits 200`（task-mvta6bty-0rkwm9 / task-mvtafqev-u2yjkh）→ **Playwright `page.reload()`** → `afterReload.taskCount=1`、历史坞 1 条、结果 blob 1024×752 / 1024×1024、下载 871973B / 919689B | 两者 H **PASS**；CHANGE_COLOR F 仍 PARTIAL（无存资产/画布回执） |
| `6d9bd86` 修色真实历史 | fresh reload 复用既有任务 | `probe-fresh-load.json` 记录 **`navType: navigate`**（新标签页真整页加载）+ 2 条真实任务；`input-diff.json` 用 PIL LANCZOS 逐像素比：两次结果 meanAbsDiff **17.62 / 14.75**（非回传原图）；下载 1218527B sha256 `83ef17c2…` 与提交产物**字节一致**；存入资产 `OIRBFLPZFZt5hjgOZL3sV` | FIX_COLOR **F/R/H 三项 PASS** |
| `b95ff4c`→`df765ff` 链接裂变恢复 | reload 后从本地真实任务恢复结果并可复用动作 | `H2-fission-xsy-20261029/evidence.json`（ego lite 真实 profile + `location.reload`）：历史坞 5 条（4 完成/1 失败）→ 选中还原 → 下载 **1988694B sha256 `bbc0ca08…`**（`~/Downloads/fission-link-result-1 (1).png` 实测同字节）→ 存资产 `i28CzCpbrBdqVvU_8sKuC` → **发画布 `4YJKL9Hoq-HRiYvhqIozS` / `image-1793262996953-ratzx`**，画布页节点已渲染 | F **三动作齐全 PASS**；H **PASS** |
| `32ef68e` 场景裂变/穿戴持久化 | 接入持久化网关 | 代码侧只把提交改用 `getPersistedToolGateway`；`h7-freshload-probe.json`（全新临时 profile）实测 7 工具 **`myPersistedTasks=0`**（含 PRODUCT_SCENE、AI_WEARABLE），且 `PRODUCT_SCENE` **`dockMounted=false`**（未挂统一历史坞，仅自有 Tab） | 7 工具 H **均未改善**（仍 PARTIAL）；探针本身是有效负面证据，已记入缺口 |
| `39bf486` 拼接 | 真实提交 + 历史恢复 | 请求带 `seconds=10&size=720x1280&ratio=9:16&resolution_name=720p`；上游 **400**（multipart 被当 utf-8 解码）+ HMR 重载中断 → 显式记 `failed / submit-unconfirmed`；reload 后历史「1 条 · 失败」+ 原因 + 配置快照，草稿 3 clip 恢复 | H **PASS**（失败任务同样可回溯）；R **BLOCKED**；F PARTIAL |
| `32a7919` 视频编辑 | 真实任务 | r6 已认定：上游 `task_QFvq6WMc` done、产物 2268656B/1344×768/6.58s，R PASS；prompt/输入未恢复、无三动作回执 | F PARTIAL、H PARTIAL（无 reload 面板回执），本轮不变 |
| `9e8b6cc`/`dd44be3` 图文翻译 | 修模型路由 + 历史坞 reload | `b5-history-dock-reload-20261029.json`：真实提交 `task-mvt9elbs-u4grlv` succeeded（1028256B）→ 整页 reload → 历史坞 1 条 succeeded + 缩略图 1024×1024 | H **PASS**；F 仍 PARTIAL（文本上游 503、无成功识别回执） |
| `7a56082` 修色尺寸 | 按原图尺寸下发 | 结果 1003673B 1024×752（非 1:1），说明尺寸链路生效 | 支撑 FIX_COLOR R PASS |
| `271ab57`/`dafe860`/`dd44be3` 其余 | 修复类 | 无新增机器回执，未改变判定 | 不计分 |

`e8121d7` 是第 40 个工具 DESIGN_BATCH 的 BLOCKED 取证（本机 0 条 `batch-task:v1:*`），**不在 39 工具范围内**，不影响矩阵。

## 三、独立物理复核（本轮亲手复算，不采信提交说明）

| 文件 | 字节 | sha256 前 16 | 对账结果 |
| --- | --- | --- | --- |
| `SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4` | 1 366 190 | `39193f0a2c97c24e` | 与 `~/Downloads/sale-video-result-1.mp4` 完全一致；ffprobe 6.5833s |
| `FIX_COLOR/result-real-20261029.png` | 1 218 527 | `83ef17c23f33eb25` | 与 `~/Downloads/fix-color-result-1.png`、`actions-download.json` 三者一致 |
| `FIX_COLOR/result-real-run2-20261029.png` | 1 003 673 | `a5958a770e8f6306` | 1024×752（尺寸修复生效） |
| `FISSION_LINK/b5-restored-download.png` | 1 988 694 | `bbc0ca08cfa46fea` | 与 `~/Downloads/fission-link-result-1 (1).png`、evidence.json 三者一致 |
| `HISTORY_RECOVERY_MINE/SCALE_UP/download-…png` | 871 973 | `21f429573480ec45` | 与 run.json download.bytes 一致 |
| `HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-…png` | 919 689 | `c3a272a6ffeb0c67` | 与 run.json download.bytes 一致 |

scope_audit（`scope-audit.json`）：errors=0，warnings=17（`case-module` 占位文案仍留在 `video.tsx` 12 处、`video-translation.tsx` 3 处、`suite.tsx` 2 处）→ 对应 7 个工具 T=PARTIAL。

## 四、真实剩余缺口（按可解锁成本排序）

### 1) H 历史：26 个 PARTIAL（最大缺口）

- **未取证 18 个**：`AI_OUTPAINTING`、`PRODUCT_REFINE`、`PRINTING_REPAIR`、`HAND_REPAIR`、`NEW_REPLACE_BG_V2`、`REPLACE_GOODS`、`PRODUCT_SCENE`、`HANDHELD_GOODS`、`AI_DRESSING_V2`、`AI_POSTURE`、`AI_WEARABLE`、`PRINT_EXTRACT`、`AI_POSE_GENERATOR`、`AI_DRESSING_XSY`、`IMAGE_TEXT_EDIT`、`MATERIAL_UPPER_BODY`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`
  - 直接原因：这 18 个工具在可达 profile 里 **0 条真实任务**（`h7-freshload-probe.json`：7 个为 0；`AI_DRESSING_XSY` 经 6 个浏览器 profile leveldb grep 亦 0，因 2026-10-28 那次出图早于持久化接线 `e325ca7`）。
  - 解锁条件：**每个工具各跑一次真实提交**（产生 succeeded 任务）→ 刷新 → 历史坞回填取证。不需要改代码（网关已持久化），只缺真实调用额度。
  - 附带代码缺口：`PRODUCT_SCENE` 未挂统一历史坞（`dockMounted=false`），即使有任务也只有自有 Tab。
- **注入验证 5 个**（按 `H_path` 原字符串）：纯注入 3 个 `AREA_REPAIR`、`REMOVE_PEN`、`IMAGE_CROP`；`VIDEO_REPLICATION`（产物真实，任务为 `upsertTask` 注入）；`VIDEO_TRANSLATION`（注入的是**真实失败任务**，上游 `/v1/videos` 收不了上传字节 → 400）。→ 各跑一次真实提交即可转「历史回填」/或先解上游能力。
- **部分/人工 2 个**：`IMAGE_TO_VIDEO`（只能回填表单，上游 503 无结果）、`SALE_VIDEO`（reload 恢复真实发生，但只有文字记录、无机器回执）。
- **重建记录 1 个**：`AI_VIDEO_EDITING`（无原始 prompt/输入图，只能按 upstreamTaskId 重建，取不到 reload 面板）。

### 2) F 功能：16 个 PARTIAL

- 缺「存资产 / 发画布」机器回执：`CHANGE_COLOR`、`PRODUCT_REFINE`、`HAND_REPAIR`、`PRODUCT_SCENE`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`、`SALE_VIDEO`、`AI_VIDEO_EDITING`。
- 结果区/状态机缺陷（不只缺回执）：`REPLACE_GOODS`（上游出图但结果区静默清空）、`PRINT_EXTRACT`（卡片停在 running）、`CHANGE_COLOR_V2`（unit2 失败）。
- 上游/通道能力阻断：`IMAGE_TRANSLATION`（文本 503）、`IMAGE_TO_VIDEO`（503，发画布未执行）、`VIDEO_REPLICATION`（工作台提交 404）、`VIDEO_TRANSLATION`（400）、`VIDEO_CONCAT`（multipart 400）。

### 3) R 真实生成：2 个 BLOCKED

- `VIDEO_CONCAT`：请求字段正确，但 sub2api 网关把 multipart 字节当 utf-8 解码（`0xe8 in position 1481`）→ 400；JSON 回退需公网可访问资产 URL。属**网关侧能力问题**，本地绕过不了。
- `VIDEO_TRANSLATION`：`/v1/videos` 只收 JSON，收不了上传视频字节 → 400。

### 4) T 文案：7 个 PARTIAL（均为 `case-module` 占位）

`PRODUCT_IMAGE_SUITE`、`PRODUCT_MARKET_MATERIAL`、`SALE_VIDEO`、`VIDEO_REPLICATION`、`AI_VIDEO_EDITING`、`VIDEO_TRANSLATION`、`VIDEO_CONCAT` —— 集中在 `video.tsx`(12) / `video-translation.tsx`(3) / `suite.tsx`(2)。

### 5) K 案例：29 个 N/A（原站本就无案例模块，非缺口）；10 个 PASS 均有原站 typeXX 数据 + 本地回填回执。

## 五、方法与边界（重要）

1. **「快照恢复」vs「历史回填」都算 H=PASS，但必须有机器回执**；B5/B4/B7 注入、单测、截图、纯文字纪要一律不计。
2. H 判定绑定了具体证据文件名（见 `matrix.json` 的 `H_evidence`），复核者可按路径重跑。
3. 本轮**未改任何功能源码**；只改审计脚本 `tools/independent_evidence_audit.py` 的 E 表/H_RESTORE 与新增本目录报告。
4. 工作区未提交项 **296** 条（`web/src` **0** 条，scope_audit 报 `dirty web/src files: 0`）：其中 `docs/.../evidence/` 82 条、`web/scripts/real-acceptance/` 若干（并行 worker 的验收脚本与产物，`PRODUCT_REFINE/*`、`IMAGE_CROP/*`、`b4-summary.json` 等），以及 `tools/capture_parity.py` 等他人改动。**以上均非本轮产物，本轮未触碰**；若它们后续提交并改变产物字节，相关工具需重跑。本轮只写 `tools/independent_evidence_audit.py` 与本目录。

## 六、复现命令

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py \
  --json docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r7/scope-audit.json
python3 docs/V1.0/plan_linkfox_navigation/tools/independent_evidence_audit.py \
  --scope-audit docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r7/scope-audit.json \
  --out-dir   docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r7
```

输出：`matrix.json`（机器可读，含每项证据路径与产物实测元数据）、`matrix.md`（39 行明细 + H 路径分布 + 逐工具证据）、`scope-audit.json`。
