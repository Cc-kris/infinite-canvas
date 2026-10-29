# 39 工具独立验收复核报告（F/T/R/H/K/U）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`
- 快照：commit `81d9f7c`（分支 `feat/linkfox-v1-real`），生成时间 2026-10-29 15:34 
- 审计范围：39 个 LinkFox 对应工具页（1:1 工具集）
- 本报告不改功能源码，只做证据复核、矩阵重算与缺口定位
- 机器可读结果：[matrix.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029/matrix.json)、[matrix.md](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029/matrix.md)、[scope-audit.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029/scope-audit.json)

## 一、为什么要重做矩阵

`recompute_scope_matrix.py` 的判据是「目录里有没有大图 / 有没有 B5 行」，导致两类系统性误判：

1. **把注入快照当真实历史**：B5 脚本用应用自身的 `persistTask()` 把任务写进 localStorage 再刷新，历史面板当然能渲染。这只证明「面板能显示数据」，不证明「真实提交的任务在刷新后仍可回填」。旧矩阵据此给 20 个工具 H=PASS。
2. **把截图/中间图当生成产物**：`ui.png`、`download-action.png` 之类页面截图与真实模型输出同尺寸量级时被计入 R，例如 `FIX_COLOR` 仅 640×1344 的 `download-action.png`（下载按钮截图）被判 R=PASS。

本报告的判据是「证据文件必须能定位、能解释来源、能排除注入与截图」，宁可判 PARTIAL 也不给无证据的 PASS。

## 二、判据（脚本内实现，可复算）

| 维度 | PASS 条件 | PARTIAL / BLOCKED 条件 |
| --- | --- | --- |
| F 功能闭环 | 有真实上游产物 + ≥2 项动作（下载字节 / 资产 ID / 画布节点）回执 | 有产物无动作回执=PARTIAL；无产物=BLOCKED |
| T 文案 1:1 | `scope_audit.py` 对该 workspace 无 error/warning 命中 | 命中（含 case-module 占位文案）=PARTIAL |
| R 真实生成 | 产物文件存在且 ≥50KB，短边 ≥1024 或长图宽 ≥1440（排除截图尺寸），或 URL-only 结果 HEAD 200 且 ≥50KB | 只有截图/小图=PARTIAL；无任何产物=BLOCKED |
| H 历史 | 真实提交 → 刷新 → 历史面板回填同一任务（可复现的完整链路证据） | 仅 persistTask 注入/仅面板渲染=PARTIAL |
| K 案例 | 原站案例数据来自真实 API 落盘 + 本地一键做同款跑通回执 | 原站无案例= N/A；缺证据=MISSING |
| U 设计系统 | `scope_audit.py` 无原站品牌色/旧 token 命中 | 命中=PARTIAL |

补充口径：R 的截图排除集合为常见屏幕/视口宽度（1920/1728/1512/1470/1440/1366/1280/2560/390/430）；`result1.png` 这类 1024² 输出不受影响。

## 三、汇总与对照

| 维度 | 旧矩阵（scope-reaudit-20261029） | 本次复核 | 变化 |
| --- | --- | --- | --- |
| F | 26/11/2 | PASS 18 / PARTIAL 19 / BLOCKED 2 | 见下 |
| T | 37/2/0 | PASS 32 / PARTIAL 7 | 见下 |
| R | 35/4/0 | PASS 33 / PARTIAL 1 / BLOCKED 5 | 见下 |
| H | 20/19/0 | PARTIAL 39 | 见下 |
| K | 9/28/2 | PASS 9 / N/A 29 / MISSING 1 | 见下 |
| U | 37/2/0 | PASS 39 | 见下 |

差异逐项（自动比对旧报告表格 39 行）：

- **H：旧矩阵 20 个 PASS 中 16 个不成立，降为 PARTIAL**。原因：依赖 `run-b5-history-dock.mjs` 的 `store.persistTask()` 注入。另 4 个（PRODUCT_IMAGE_SUITE、DRESS_WEAR_SET、FISSION_LINK、CHANGE_COLOR_V2）本次用「整页加载后读历史坞」重新实测，仍判 PASS 并附机器证据。
- **F：8 个 PASS 降为 PARTIAL**：CHANGE_COLOR、PRODUCT_REFINE、PRODUCT_SCENE、AI_TEXT、SDS_DESIGN、NEW_DESIGNER、PRODUCT_MARKET_MATERIAL、SCENE_TRANSFER。原因：这些工具只有真实产物（或结果 URL）与页面截图，没有 b4/b7 那类「下载字节 + 资产 ID + 画布节点」动作回执。
- **T：5 个 PASS 降为 PARTIAL**：SALE_VIDEO、VIDEO_REPLICATION、AI_VIDEO_EDITING、VIDEO_TRANSLATION、VIDEO_CONCAT。原因：`scope_audit.py` 在 `video.tsx` / `video-translation.tsx` 命中 `unfinished-copy:case-module`（原站有优秀案例的工具以占位文案收尾），共 15 条 warning。
- **R：4 项变化**：FIX_COLOR PASS→BLOCKED（唯一候选是 640×1344 的 `download-action.png`，属页面截图）；VIDEO_TRANSLATION PASS→BLOCKED（目录内无真实视频产物）；AI_TEXT PASS→PARTIAL（`05-real-result.png` 1206×2622 为长图，达到长图宽阈值但需保留 PARTIAL 观察；`result.png` 缺失）；SCENE_TRANSFER BLOCKED→PASS（结果直出 OSS，URL HEAD 200，属 URL-only 产物）。
- **K：SCALE_UP MISSING→N/A**。b6 证据显示原站该工具无「优秀案例」页签，不存在可 1:1 的案例数据，不应记为缺失。
- **U：2 个 PARTIAL→PASS**：PRODUCT_IMAGE_SUITE、PRODUCT_MARKET_MATERIAL。`suite.tsx` 的「算力」计费文案与原站紫色 token 已在 `81d9f7c` 修掉，`scope_audit.py` 现在 errors=0。

## 四、逐工具矩阵

| # | 工具 | F | T | R | H | K | U | 缺口/阻断（可定位） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 商品套图<br>`PRODUCT_IMAGE_SUITE` | PASS | PARTIAL | PASS | PARTIAL | PASS | PASS | T PARTIAL：case-module 占位文案： web/src/components/tools/wor…；H PARTIAL：刷新回填见 suite6 报告，但无「真实提交→persist→reload」证据文件；B5… |
| 2 | 服装套图<br>`DRESS_WEAR_SET` | PASS | PASS | PASS | PARTIAL | PASS | PASS | H PARTIAL：同上：无真实提交→刷新回填证据文件 |
| 3 | 套图换色<br>`CHANGE_COLOR_V2` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | F PARTIAL：b4 动作在 unit1 产物上通过，但任务仅 1/2 unit 有产物（unit2 失败）；H PARTIAL：01-task-history.json 记录真实提交（状态 unknown/失败）已落 l… |
| 4 | 批量翻译<br>`IMAGE_TRANSLATION` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：b4 三动作通过，但工作台存在控件/校验缺陷（旧矩阵已记录）；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无优秀案例页签（b6 未列；本地未新增） |
| 5 | 高清放大<br>`SCALE_UP` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：b6 明确：原站该页无「优秀案例」页签（origin/SCALE_UP-cases.json… |
| 6 | 智能扩图<br>`AI_OUTPAINTING` | PASS | PASS | PASS | PARTIAL | PASS | PASS | H PARTIAL：无真实提交→刷新回填证据 |
| 7 | 局部重绘<br>`AREA_REPAIR` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 8 | 局部消除<br>`REMOVE_PEN` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 9 | 一键换色<br>`CHANGE_COLOR` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：仅有 download 截图 + 资产校验断言，无存资产/发画布回执；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 10 | 图片裁剪<br>`IMAGE_CROP` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 11 | 商品精修<br>`PRODUCT_REFINE` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：有 step-3/4/5/6 存资产与画布截图，无机器回执 JSON；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 12 | 色差修复<br>`FIX_COLOR` | PARTIAL | PASS | BLOCKED | PARTIAL | N/A | PASS | F PARTIAL：提交后无结果区（仅有空态），三动作未执行；R BLOCKED：目录内只有 1440x900 UI 截图，无任何产物字节（旧矩阵 R=PASS 为截图充数）；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 13 | 印花修复<br>`PRINTING_REPAIR` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 14 | 手部修复<br>`HAND_REPAIR` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：仅 download 字节；存资产/发画布未取得回执；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 15 | 商品图<br>`NEW_REPLACE_BG_V2` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站页面未取得（仅 supplemental 片段），案例有无未取证；不得判定为“原站有案例… |
| 16 | 商品替换<br>`REPLACE_GOODS` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | F PARTIAL：上游已出图但结果区静默清空（渲染缺陷），动作未验收；H PARTIAL：无真实提交→刷新回填证据 |
| 17 | 场景裂变<br>`PRODUCT_SCENE` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | F PARTIAL：有真实产物，无三动作回执；H PARTIAL：无真实提交→刷新回填证据 |
| 18 | 手持商品<br>`HANDHELD_GOODS` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 19 | AI穿衣<br>`AI_DRESSING_V2` | PASS | PASS | PASS | PARTIAL | PASS | PASS | H PARTIAL：无真实提交→刷新回填证据 |
| 20 | 姿势裂变<br>`AI_POSTURE` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：design19 未覆盖；b6 origin 有案例但本地未实现（见 report 缺口） |
| 21 | AI穿戴<br>`AI_WEARABLE` | PASS | PASS | PASS | PARTIAL | PASS | PASS | H PARTIAL：无真实提交→刷新回填证据 |
| 22 | POD素材<br>`AI_TEXT` | PARTIAL | PASS | PARTIAL | PARTIAL | N/A | PASS | F PARTIAL：provider 200 但响应 b64 截断；三动作未验收；R PARTIAL：真实调用成功但产物字节/URL 未留存（05-real-result.png 是 1920x…；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 23 | 饰品文字<br>`ORNAMENT_TEXT` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：仅有 nv-actions.png 截图，无机器回执；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 24 | 素材贴合<br>`SDS_DESIGN` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | F PARTIAL：真实产物存在，无三动作回执（旧矩阵 H 依赖 B5 注入）；H PARTIAL：无真实提交→刷新回填证据 |
| 25 | 印花提取<br>`PRINT_EXTRACT` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：结果落地状态机缺陷（卡片停在 running）；动作未全验收；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 26 | AI姿势生成<br>`AI_POSE_GENERATOR` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 27 | AI试衣XSY<br>`AI_DRESSING_XSY` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 28 | 场景裂变链接<br>`FISSION_LINK` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 29 | 图片文字编辑<br>`IMAGE_TEXT_EDIT` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 30 | 上装换料<br>`MATERIAL_UPPER_BODY` | PASS | PASS | PASS | PARTIAL | N/A | PASS | H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 31 | 商品图设计器<br>`NEW_DESIGNER` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：本地导出 + 画布截图，无资产/画布机器回执；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 32 | 商品营销素材<br>`PRODUCT_MARKET_MATERIAL` | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | F PARTIAL：有 step-2 资产库/step-3 画布截图，无机器回执；T PARTIAL：case-module 占位文案： web/src/components/tools/wor…；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 33 | 场景迁移<br>`SCENE_TRANSFER` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | F PARTIAL：仅 URL 产物，无三动作回执；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 34 | 图转视频<br>`IMAGE_TO_VIDEO` | PARTIAL | PASS | PASS | PARTIAL | MISSING | PASS | F PARTIAL：生成+存资产已验收；发画布未执行（ddba2e6 刚修落库，待重取证）；H PARTIAL：ddba2e6 修真实任务落库+历史区，但无刷新回填证据文件；K MISSING：原站有 10 张案例卡+做同款，本地未接线（占位文案 video.tsx:649） |
| 35 | 带货口播<br>`SALE_VIDEO` | BLOCKED | PARTIAL | BLOCKED | PARTIAL | N/A | PASS | F BLOCKED：上游端点 404，无自有产物；b4 动作使用 IMAGE_TO_VIDEO 借用 mp4（s…；T PARTIAL：case-module 占位文案： web/src/components/tools/wor…；R BLOCKED：无自有产物；b4 视频字节来自 IMAGE_TO_VIDEO；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 36 | 视频复刻<br>`VIDEO_REPLICATION` | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | F PARTIAL：工作台通道 404；仅直连 link 模式成功，三动作未走 UI；T PARTIAL：case-module 占位文案： web/src/components/tools/wor…；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 37 | 视频编辑<br>`AI_VIDEO_EDITING` | BLOCKED | PARTIAL | BLOCKED | PARTIAL | N/A | PASS | F BLOCKED：上游 404，无自有产物；b4 借用 IMAGE_TO_VIDEO mp4；T PARTIAL：case-module 占位文案： web/src/components/tools/wor…；R BLOCKED：无自有产物（旧矩阵 R=PASS 不成立）；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 38 | 视频翻译<br>`VIDEO_TRANSLATION` | PARTIAL | PARTIAL | BLOCKED | PARTIAL | N/A | PASS | F PARTIAL：未取得成功样例；三动作未验收；T PARTIAL：case-module 占位文案： web/src/components/tools/wor…；R BLOCKED：无任何视频产物，上游失败（旧矩阵 R=PASS 为口误）；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |
| 39 | 视频拼接<br>`VIDEO_CONCAT` | PARTIAL | PARTIAL | BLOCKED | PARTIAL | N/A | PASS | F PARTIAL：只验证工作台/校验，未发起真实拼接；T PARTIAL：case-module 占位文案： web/src/components/tools/wor…；R BLOCKED：未发起真实生成调用，无产物；H PARTIAL：无真实提交→刷新回填证据；K N/A：原站无案例模块 |

## 五、剩余缺口与阻塞（按严重度）

### 1. 阻断级（无真实产物，必须重跑上游）

| 工具 | 证据现状 | 需要补的证据 |
| --- | --- | --- |
| FIX_COLOR | `evidence/real-acceptance/FIX_COLOR/` 只有 `ui-error.png`(640×926)、`download-action.png`(640×1344)，无模型输出 | 一次成功提交的 1024²+ 结果图 + result.json |
| SALE_VIDEO | 仅有 1297168 字节的 b4 fixture（与 AI_VIDEO_EDITING 完全同字节，说明是同一段样例视频） | 真实带货视频任务产出 + 结果 URL |
| AI_VIDEO_EDITING | 同上，共享 fixture | 真实视频编辑任务产出 |
| VIDEO_TRANSLATION | 目录内无视频文件 | 真实翻译视频产物 |
| VIDEO_CONCAT | 无产物（拼接依赖多次真实生成） | 两条真实生成视频 + 拼接结果 |

R=BLOCKED 恰为以上 5 个；F=BLOCKED 为 SALE_VIDEO、AI_VIDEO_EDITING（其结果来自同一段样例视频 fixture，非本次任务产出）。

### 2. 高优先（有产物，缺动作闭环）

F=PARTIAL 共 19 个，分两类：

- **有真实产物、缺动作回执（15 个）**：CHANGE_COLOR_V2、IMAGE_TRANSLATION、CHANGE_COLOR、PRODUCT_REFINE、HAND_REPAIR、REPLACE_GOODS、PRODUCT_SCENE、ORNAMENT_TEXT、SDS_DESIGN、PRINT_EXTRACT、NEW_DESIGNER、PRODUCT_MARKET_MATERIAL、SCENE_TRANSFER、IMAGE_TO_VIDEO、VIDEO_REPLICATION。
- **产物本身不达标或缺失（4 个）**：FIX_COLOR(R=BLOCKED)、AI_TEXT(R=PARTIAL，仅长图)、VIDEO_TRANSLATION(R=BLOCKED)、VIDEO_CONCAT(R=BLOCKED)。

对照：`b4` 覆盖的 14 个工具是「真实历史产物 + 真实按钮 + 真实 store 写入」，动作链路本身可信，但发生在注入任务而非同一次 submit，因此只在工具有其他产物证据时支撑 F=PASS，不单独升格。

**最佳证据范式**：`AREA_REPAIR/result.json` 是目前唯一「同一次真实提交」内同时含上游回执（POST api.cc-ai.xyz 200 / 36s）、2 张 1024² 产物（含 bytes+sha）、下载 href、`assetId`、`projectId` 的完整记录，其余工具应以此为模板补齐单跑证据。

### 3. 历史（H）

旧矩阵 20 个 H=PASS 中，**16 个不成立**（依赖 `run-b5-history-dock.mjs` 的 `store.persistTask()` 注入后再刷新），降为 PARTIAL：

> IMAGE_TRANSLATION、SCALE_UP、NEW_REPLACE_BG_V2、HANDHELD_GOODS、AI_DRESSING_V2、AI_POSTURE、AI_WEARABLE、AI_TEXT、ORNAMENT_TEXT、SDS_DESIGN、AI_POSE_GENERATOR、AI_DRESSING_XSY、MATERIAL_UPPER_BODY、SCENE_TRANSFER、SALE_VIDEO、AI_VIDEO_EDITING

**4 个经本次全新加载实测确认为 PASS**（证据：`evidence/real-acceptance/H-history-freshload-20261029.json`）：

| 工具 | 实测结果 |
| --- | --- |
| PRODUCT_IMAGE_SUITE | 历史坞 2 条（14:55 已完成 · gpt-image-2 · 1 结果），缩略图 blob 已解码 |
| DRESS_WEAR_SET | 历史坞 2 条（15:02 已完成），素材还原 1/5，结果区 3 张 blob 解码 |
| FISSION_LINK | 历史坞 5 条，4 张 1024² 缩略图解码 |
| CHANGE_COLOR_V2 | 历史坞 4 条可读（1 条已完成含结果） |

方法：`location.href` 整页加载（非 SPA 路由切换）→ 读 `[data-testid="tool-history-dock"]` 文本 + 缩略图 `naturalWidth`，可复现。

**顺带发现两个真实缺陷**（实测副作用，建议单独立项）：

1. **僵尸任务无收敛**：CHANGE_COLOR_V2 刷新后仍有 2 条永久「提交中」（00:37）、2 条「结果未知」（00:06）；FISSION_LINK 有 2 条 12:15 卡在「提交中」。刷新时未按 task store 状态做一次对账，用户会看到永久 pending。
2. **历史卡片重复渲染**：历史坞 `count` 为 2，但 DOM 中同类行出现 4 次（每任务 2 个节点，疑桌面/移动两套容器同时挂载）。

其余 35 个工具仍为 PARTIAL：任务是否落盘未经「整页加载后回填」验证。判定依据（可 `rg` 复验）：`run-b5-history-dock.mjs` 与 `run-b4-dock-actions.mjs` 均直接 `store.persistTask(payload)` 注入。

### 4. 文案（T）

17 条 warning，集中在 `video.tsx`(12)、`video-translation.tsx`(3)、`suite.tsx`(2)，规则均为 `unfinished-copy:case-module`。修复方式是补齐「优秀案例」模块的真实数据渲染，而不是换文案。

### 5. 案例（K）

唯一 MISSING 为 **IMAGE_TO_VIDEO**（`K MISSING=1`）。原站该工具有案例页，但本地无对应的 `cases-*-20261029.json` 落盘与「一键做同款」跑通回执，需补。`SCALE_UP` 已确认为原站无案例页签，记 N/A。

## 六、复现方式

```bash
cd /Users/mac/Documents/Dev/infinite-canvas

# 1) 组件/文案/设计系统扫描（T、U）
python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py \
  --json docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029/scope-audit.json

# 2) 证据矩阵重算（F/T/R/H/K/U，逐条校验文件存在/尺寸/哈希/URL）
python3 docs/V1.0/plan_linkfox_navigation/tools/independent_evidence_audit.py

# 3) 类型与单测（本次日志）
cat docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029/logs/typecheck.log
cat docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029/logs/tests.log
```

本次实测结果：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 文案/设计系统扫描 | `scope_audit.py` | errors=0，warnings=17（3 组聚合） |
| 类型检查 | `bun run typecheck` | exit 0 |
| 工作区单测 | `bun test src/components/tools/workspaces` | 36 pass / 0 fail（7 文件，221 expect） |

## 七、局限与风险

1. **快照在漂移**：审计期间 HEAD 从 `9edebbe` → `ddba2e6` → `81d9f7c`，另有 5 个 `web/src` 文件带未提交改动。本报告结论绑定 `81d9f7c`；若继续合入新提交，需重跑第 6 节两条命令。
2. **T/U 依赖工作树**：`scope_audit.py` 读的是工作区文件，未提交改动会直接影响结论（本次 U 的 2 项 PASS 即来自未提交前的修复提交）。
3. **b4 是间接动作证据**：它证明「真实历史产物 + 真实按钮 + 真实 store 写入」这条链路可用，但不是同一 submit 的端到端闭环；因此本报告没有把它单独升格为 F=PASS（b4 覆盖的工具有其他产物证据支撑才判 PASS）。
4. **URL-only 产物**（SCENE_TRANSFER）无法校验像素尺寸，仅以 HEAD 200 + 字节数为准，属于弱证据。
5. **未做的事**：没有真实调用上游生成（避免消耗额度与污染证据目录），因此所有 BLOCKED 项都需要一次真实跑批来解锁。

## 八、结论

以「证据可定位、可复现、不可被注入伪造」为标准：**39 个工具中，六维全 PASS 的工具为 0 个**。当前真实状态是：

- 真实生成闭环（F+R 均 PASS）：**18 个**
- F=PARTIAL：**19 个**，其中 15 个已有真实产物仅缺动作回执，4 个产物未达标
- 真实产物缺失（R=BLOCKED）：**5 个**（FIX_COLOR、SALE_VIDEO、AI_VIDEO_EDITING、VIDEO_TRANSLATION、VIDEO_CONCAT）
- 历史（H）：PASS **4 个**（全新加载实测），PARTIAL **35 个**
- 案例（K）PASS 9 个，N/A 29 个，缺失 1 个

也就是说，旧矩阵「F 26 PASS / H 20 PASS」的结论不成立。对外宣称 1:1 完成前，至少还需要：补齐 35 个工具的「真实提交→刷新→回填」证据、5 个视频/修复类工具的真实产物、15 个工具的同一次任务内动作回执，以及修复刷新后僵尸任务不收敛的缺陷。

## 附录 A：审计期间其他 worker 的提交（不覆盖，仅记录）

审计基线 `fcb1b69` → 最新 `81d9f7c`，期间他人提交 8 个：

| commit | 说明 | 对矩阵的影响 |
| --- | --- | --- |
| `5f50899` | docs(scope)：刷新重审快照（统一设计 token 后） | 提供旧矩阵对照基线 |
| `7b04cb8` | fix(dress-suite)：刷新后按 `dataUrl ?? url` 取图源，修复「成功但产物 0 张」 | 直接支撑 DRESS 的 H=PASS（本次实测确认图源可解码） |
| `5383656` | docs(suite6)：PIS/DRESS 真实批量与刷新回填证据 | 仅 3 份 md，无机器证据；本次补了 `H-history-freshload-20261029.json` |
| `6528c05` | fix(copy)：去掉算力计费与 LinkFox 品牌残留 | T 从 10 PARTIAL 降到 7 PARTIAL |
| `930b477` | refactor(theme)：剩余工作台中性色 token 化 | U 从 37 PASS 升到 39 PASS |
| `9edebbe` | docs(theme)：工作台主题接管与去品牌/去计费收口报告 | 文档归档 |
| `ddba2e6` | fix(image-to-video)：真实任务落库 + 历史区，修复刷新即丢失 | IMAGE_TO_VIDEO 的 H 仍 PARTIAL（未实测回填），但落库链路已修 |
| `81d9f7c` | fix(suite6/pis)：商品套图去计费/去原站像素色，统一 token | PIS 的 T/U 转 PASS |

审计时 HEAD=`81d9f7c`，工作树另有 5 个 `web/src` 脏文件（他人未提交改动），`scope-audit.json` 即在该状态下生成。

## 附录 B：本次审计产出的可复用资产

| 文件 | 用途 |
| --- | --- |
| `tools/independent_evidence_audit.py` | 证据驱动矩阵生成器，产物尺寸/哈希/URL HEAD 实测，缺文件即报 problem |
| `tools/scope_audit.py` | 既有：shell/设计 token/文案规则审计（本次直接复用，未改） |
| `reports/independent-audit-20261029/matrix.{json,md}` | 39×6 结论 + 每维证据路径 |
| `reports/independent-audit-20261029/scope-audit.json` | 0 error / 17 warning 明细 |
| `evidence/real-acceptance/H-history-freshload-20261029.json` | 4 个工具的整页加载历史回填实测 |
| `reports/independent-audit-20261029/logs/` | typecheck(0) 与 36 项单测全绿日志 |
