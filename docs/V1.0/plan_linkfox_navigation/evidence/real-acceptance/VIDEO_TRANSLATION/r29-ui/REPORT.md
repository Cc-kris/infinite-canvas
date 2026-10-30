# r29 UI 机读验收 — 视频翻译（VIDEO_TRANSLATION）诚实降级 UI

- 验收时间：2026-10-30 13:44–14:10（本地）
- 被测对象：`http://localhost:3000/tools/ai-video/video-translation`（Vite dev，端口 3000）
- 结论：**9/9 项通过**（其中第 5 项按「阻断 + 解释」口径通过，口径差异见 §4.1；3 项非阻塞观察项见 §4）
- 未做任何：真实生成、上传媒体、调用上游 `/v1/videos`、读取密钥、修改 `web/src`、更换模型

---

## 1. 环境与被测代码

| 项 | 值 |
| --- | --- |
| 仓库 | `/Users/mac/Documents/Dev/infinite-canvas` |
| 分支 | `feat/linkfox-v1-real` |
| HEAD | `e1fe463ab82f01d84f37d88709ee4445fdad1e7b`（docs(verify-r29): 固定 454fa580 独立四闸 PASS） |
| 目标提交 | `73075698`（feat(video-translation): 诚实降级 UI）**已是 HEAD 祖先**（`git merge-base --is-ancestor` 返回 YES） |
| 工作区状态 | **脏树**：`M web/src/features/tools/adapters/video-translation.ts`（+76/−7，提示词新增 `languageContract` / `rules` 段）、`M web/src/features/tools/adapters/video-translation.test.ts`（+36）、`M project_memory.md`；其余为未跟踪的临时目录。这些改动**非本次验收所写**，属他人 WIP |

> **口径声明**：浏览器实际加载的是**工作区（HEAD + 上述 WIP）**代码。为避免「验收了旧 bundle」的误判，用内联 sourcemap 做了源码同一性证明（§2.2）：3 个被测模块的 `sourcesContent` 与磁盘文件 **sha256 完全一致**。9 项 UI 行为不受该 WIP 影响（WIP 只改提示词文案，不改控件/禁用/告警逻辑）；第 3 项的提示词分段结果已按工作区版本记录。

---

## 2. 方法

### 2.1 机读 DOM 采集（Playwright + Chromium，独立 profile）

- 脚本：`scripts/accept.py`（桌面：提示条/副标题/语言/口型/输出数量/徽标/locale）、`scripts/accept3.py`（画布往返 + 390px 移动端 + 失败请求）、`scripts/accept4.py`（英文态中文残留 + 对比度 + 源码同一性）、`scripts/srcmap.py`、`scripts/en_compare.py`。
- 一律取**真实渲染后的计算样式 / ARIA / BBox / 下拉选项 / 点击后状态**，不靠读码推断。
- 每个断点写一个 JSON（见 §5 索引），文中数字均可回查。

### 2.2 旧 bundle 排除（关键）

`?raw` 未生效（Vite 返回转译后 JS 并附内联 sourcemap），故改为解析 `sourceMappingURL=data:application/json;base64,…` 的 `sourcesContent`：

| 模块 | sourcesContent sha256[:16] | 磁盘 sha256[:16] | 相等 |
| --- | --- | --- | --- |
| `components/tools/workspaces/video-translation.tsx` | `a1ff82366a8a0be2` | `a1ff82366a8a0be2` | ✅ |
| `components/tools/workspaces/video-translation-honesty.tsx` | `ae702096ce5ab254` | `ae702096ce5ab254` | ✅ |
| `features/tools/adapters/video-translation.ts` | `892013749f3e6393` | `892013749f3e6393` | ✅ |

证据：`10-vite-sourcemap-identity.json`（`10-vite-module-identity.json` 是 `?raw` 方案失败的过程留档，结论以上表为准）。

### 2.3 无副作用验证

- 全程网络只有 1 类请求：`GET /__canvas-hub/state`（画布 hub 状态）；**无** `/v1/videos`、无 media 上传、无生成。
- 控制台：`pageerror` **0** 条；`console.error` **2** 条，均为 `Failed to load resource: net::ERR_CONNECTION_REFUSED`；`requestfailed` 共 **4** 次，全部指向 `http://127.0.0.1:23210/`（3×CONNECTION_REFUSED、1×ERR_ABORTED）——这是画布本地 Agent 探测端口未启动，属既有行为，不影响本页功能。证据：`98-network-desktop.json`、`99-console-desktop.json`。

---

## 3. 逐项结果

| # | 验收项 | 判定 | 关键实测 |
| --- | --- | --- | --- |
| 1 | 提示条常驻且可读 | **PASS** | 1 个 `section[data-testid=video-translation-honesty-notice]`，`role=note`、`aria-live=polite`，桌面 1142×111 @(245,273) 完整在视口内，关闭按钮 0 个；对比度 **6.84:1**（`rgb(151,60,0)` on `rgb(255,251,235)`）；字号 11px/行高 20px |
| 2 | 诚实副标题/徽标 | **PASS** | `video-translation-draft-badge`：`未验证翻译 · 请人工确认语言与字幕`；页面同时出现「AI 视频重生成（实验）· 非逐句翻译 / 口型对齐」「AI 重生成结果（未验证翻译）」等 11 条口径文案 |
| 3 | 语言选择只影响提示词 | **PASS** | 切换语言期间唯一请求 `GET /__canvas-hub/state`；`composeVideoTranslationPrompt` 输出 9 段，随语言变化的仅 `source` / `target` / `languageContract` / `text`，`task` / `rules` / `lipSync` / `output` / `type` / `mode` 不变；`buildVideoTranslationFields` 7 个 provider 字段 `audit=[]`（无缺项、无多传语言字段） |
| 4 | 口型同步不可用并解释 | **PASS** | 1 个 `role=switch`：`aria-checked=false`、`disabled=true`、`aria-disabled=true`、`cursor:not-allowed`、`opacity .6`；点击后 `aria-checked` 仍 `false`；旁注「口型同步（当前渠道不支持）」+「上游无 lipSync 参数：开关已置灰，提交时不带该字段，也不做逐句口型对齐。」 |
| 5 | 输出数量只 1 条 | **PASS（阻断口径）** | 下拉仍列 1/2/3/4 条，但选 2（或 4）立即出现阻断「当前视频模型一次只能返回 1 条视频，请把输出数量改成 1」且「立即生成」`disabled=true`；改回 1 阻断消失；旁注「当前渠道一次只返回 1 条结果。」 |
| 6 | 中文/英文切换 | **PASS（带风险注）** | locale 键位 zh/en 各 1782 键、`missingInEn=[]`、`missingInZh=[]`，VT 命名空间 19/19 对齐；诚实降级文案完整双语（EN：「AI video regeneration (experimental) · not sentence-level translation / lip-sync」）。**但**工作区主体仍是硬编码中文（见 §4.2） |
| 7 | 从无限画布工具入口进入并返回不破坏画布 | **PASS** | 画布 `A2KkSIG4n5hHCiXzYjBRv` 含节点 `text-1793339269433-bquer` → 画布菜单「我的画布」→ 顶栏「AI视频」→「视频翻译」（提示条存在）→ 顶栏「我的画布」→ 重开画布：节点 id 完全一致；再走浏览器后退链 `video-translation → image-to-video → /canvas → 直达画布`：节点仍在（`nodePreserved=true`） |
| 8 | 移动端 390px 可用 | **PASS** | `innerWidth=390`、`scrollWidth=390`（无横向滚动）、溢出元素 **0** 个；提示条 300×211 全在视口内、`clippedX/Y=false`；4 个 select 宽 274、右边界 332 未越界；switch 36×20 在视口内 |
| 9 | 不静默越界承诺 / 不丢参 | **PASS** | 禁用词扫描 12 条（中 7：翻译完成 / 已译制 / 已对口型 / 已生成字幕 / 已识别源语言 / 专业翻译 / 准确翻译；英 5：translation complete / dubbed / lip-synced / subtitles generated / source language detected）**全部未命中**；提示条明示「非逐句翻译 / 口型对齐」与「结果按未验证草稿处理」；7 字段 `audit=[]` |

---

## 4. 观察项与风险（不阻塞通过，但需产品/后续批次决策）

### 4.1 「只 1 条」的口径差异

设计是**保留 1–4 选项 + 选非 1 时阻断并解释**（对应 TC-053「不支持时禁用并解释，禁止悄悄丢参」）。若验收口径要求「下拉里物理上只有『1 条』一项」，则本项应判 FAIL。当前实现不会静默降级，属可接受的一种诚实表达；**建议产品明确口径**，二者择一并写入 page-spec。

### 4.2 全站既有 i18n 缺口（非本批引入）

EN locale 下页面仍有中文文本节点：视频翻译 92/203（45%）、对照「既有页」图转视频 126/207（60.9%）、电商套图 108/162（66.7%）。说明工具工作区主体文案硬编码中文是**全站历史问题**，本批新增的诚实降级模块反而覆盖率更好（已完全双语）。源码侧可见硬编码位置：`components/tools/workspaces/video-translation.tsx` 第 298/316/319/396/597 行（`视频翻译` / `AI 视频重生成` / `目标语言`）。→ 归入 i18n 专项，不在本批判 FAIL。

### 4.3 小字号与触控尺寸

提示条标题/正文均 11px（与全站 caption 一致），对比度达标但小屏可读性偏弱；口型 switch 命中区 36×20（<44×44 建议值），因其恒为禁用态，暂不构成误触风险。建议后续把提示正文字号提到 12–13px、switch 命中区补 padding。

### 4.4 「无限画布工具入口」的落点说明

画布工程页**没有**指向 `/tools/*` 的入口：画布菜单只有 主页 / 文档 / 我的画布 / 新建画布 / 删除当前画布 / 导入资产 / 导出当前画布 / 撤销 / 重做；底部工具栏按钮是**节点/画布操作**（实测 aria-label 含 `文本`、`音频`、`上传资产`、`生成配置`、`组`、`画布外观`、`清空画布`），「节点插件」面板点击后为空菜单。因此第 7 项按**站点顶栏工具导航（AI视频 → 视频翻译）** 执行往返，并已用「画布工程 → 菜单离开 → 工具页 → 返回画布」覆盖真实用户路径。若后续要求画布内直连工具页，需要新需求（当前不存在该入口）。

---

## 5. 证据索引

| 文件 | 内容 |
| --- | --- |
| `01-notice-desktop.json` | 提示条 ARIA/位置/子节点/对比色/视口完整性/徽标 |
| `02-subtitle-desktop.json` | 页面 11 条诚实口径文案原文 |
| `03-language-desktop.json` | 4 个 select 选项与值、切换期间请求、9 段提示词 diff、7 字段 audit |
| `04-lipsync-desktop.json` | 口型 switch 禁用状态与点击后不变 |
| `05-outputnum-desktop.json` | 输出数量 1–4 选项、选 2/4 的阻断文案与提交禁用、回 1 恢复 |
| `06-badges-desktop.json` | 徽标样式 + 结果区/历史区文案 + 禁用词扫描（中） |
| `07-locale-desktop.json` | locale 键位一致性与各语言页面正文 |
| `08-canvas-roundtrip.json` | 画布往返四态（s0 / 离开 / 菜单返回 / 浏览器后退）节点 id 比对 |
| `09-mobile.json` | 390px 视口指标、溢出元素、提示条/select/switch BBox、禁用词扫描（英） |
| `10-vite-sourcemap-identity.json` | 源码同一性（sourcesContent == 磁盘 sha） |
| `11-en-residue-and-contrast.json` | 中文残留清单（含 DOM 路径）、提示条对比度计算、EN 下拉选项文本 |
| `12-en-locale-coverage.json` | 三个工具页 EN 中文残留率对照 |
| `13-canvas-cleanup.json` | 测试画布清理记录（3→0，库已恢复空态） |
| `98-network-desktop.json` / `99-console-desktop.json` | 失败请求与 console/pageerror |
| `scripts/*.py` | 可复跑脚本（Playwright 持久 profile） |

## 6. 复跑方式

```bash
# 前置：本地 dev 已在 3000 端口，node/python3 + playwright + chromium 可用
cd <repo>
python3 docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r29-ui/scripts/accept.py
python3 .../scripts/accept3.py
python3 .../scripts/accept4.py
python3 .../scripts/srcmap.py
python3 .../scripts/en_compare.py
# 输出去向：脚本内 OUT=/tmp/r29ui/out，可改成本目录
```
