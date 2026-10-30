# r32 · 视频翻译 EN i18n 真实浏览器验收报告

- 验收对象：`feat/linkfox-v1-real` @ `f53da52afc2279701e816e9ae43a19ae66f22e63`
  （`fix(video-translation,i18n): EN 态中文残留清零（状态/结果/历史/侧边栏/面包屑）`）
- 验收时间：2026-10-30 14:40–14:52（本地）
- 环境：`http://127.0.0.1:3000`（Vite dev，服务工作树，热更新端口 24678）
- 方法：Playwright + Chromium（独立 profile，`locale=en-US`），真实点击语言切换按钮走 UI，
  DOM 取证（可见文本节点 + ARIA/属性 + 计算样式 + 视口/滚动宽度），无截图依赖
- 脚本：`scripts/accept_r32.py`（桌面/移动/导航）、`scripts/identity.py`（源码同一性）
- 结论：**PASS（i18n 主目标达成）**，含 **2 个 P2 缺陷**（其中 D1 为本次提交引入的可见文案回归）

---

## 1. 结论速览

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | EN 工具名 / h1 / 面包屑无中文 | PASS | `02-en-desktop.json`：`h1 = "Video Translation"`；面包屑 `AI video / Video Translation`（`09-en-breadcrumb.json`） |
| 2 | EN 上传区（标题/配额/拖拽提示/格式说明） | PASS（文案；计数见 D1） | `Source video` / `Not uploaded` / `Upload source video` / `Click to choose a local file, or drop it here` / `Validates format / size / pixels; saved to the asset library and restored after refresh` |
| 3 | EN 预览区 | PASS | `Preview the source video here after you upload it` |
| 4 | EN 输出区（画幅/数量/模型/提交） | PASS | `Output aspect for this run: 16:9 landscape (1280x720)`、`Follow source video`、`Generate now`(disabled) |
| 5 | EN 结果区 + 空态 | PASS | `No results yet` + `Fill in the settings and submit…` |
| 6 | EN 历史区 + 空态 + 提示 | PASS | `History`、`0 records`、`No regeneration tasks yet; real task records appear…` |
| 7 | EN 口型说明（无成句中文）+ 开关 disabled | PASS | 开关 `aria-checked=false`、`disabled=true`、`cursor:not-allowed`、`opacity 0.6`；提示 `Upstream has no lipSync parameter…` |
| 8 | EN 诚实降级提示保留（12px/20px） | PASS | `video-translation-honesty-notice` 三段英文齐备，字号行高与 zh 一致（12px/20px） |
| 9 | 切回中文完整（无丢失） | PASS | `03-zh-back-desktop.json`：`htmlLang=zh-CN`、h1「视频翻译」、提示与口型置灰均保留 |
| 10 | 375×812 无横向滚动 | PASS | `04-en-mobile375.json` / `04b`：`docScrollWidth = 375 = innerWidth`，工作台/提交按钮/提示右边界 ≤ 346 |
| 11 | 首页 / AI 视频列表 / 无限画布入口可用 | PASS | `06-navigation.json`(zh) / `06b-navigation-en.json`(en)：`/` → `/tools/ai-video` → `/tools/ai-video/video-translation` → workspace；`/canvas` 渲染「画布库/Infinite Canvas」 |
| 12 | 源码同一性（页面 = PIN） | PASS | `07-source-identity.json`：11/11 文件 `PIN blob = 磁盘 sha256 = 浏览器 ?raw sha256`；`HEAD == PIN` |
| 13 | 控制台/网络无功能错误 | PASS（见 §5 说明） | 无 4xx/5xx 功能响应；失败项均为 `ERR_ABORTED`（页面卸载打断）与 1 张跨域图 |

---

## 2. 缺陷

### D1（P2，本次提交引入的回归）上传配额行重复计数：`00 / 1 items`

- 现象：上传区配额行渲染为 `00 / 1 items · MP4 / MOV · ≤ 100 MB`（zh：`00 / 1 个`），多出一个前导 `0`。
- 位置：`web/src/components/tools/tool-asset-input.tsx:332–338`
- 成因：外层保留 `{readyCount}`，同时又用新 key 插值 `{{ready}}`，两处都输出计数：

```tsx
{readyCount}                                   {/* 332 */}
{t("toolChrome.quotaLine", {
    ready: readyCount,                         {/* 334 */}
    max: maxCount ? ` / ${maxCount}` : "",
    ...
```

  而 key 值为 `"{{ready}}{{max}} items · {{mime}} · ≤ {{size}}"` / `"{{ready}}{{max}} 个 · …"`（`en-US.ts:53`、`zh-CN.ts:53`）。
- 性质判定：**由 `f53da52a` 引入**。改动前该行为 `{readyCount}{maxCount ? " / X" : ""} 个 · …`，输出正确（`0 / 1 个`）；改动后 `{readyCount}` 未删除，叠加 `{{ready}}` 变成 `00 / 1`。
- 影响面：两语种、两视口均出现（`02-en-desktop`、`04-en-mobile375`、`05-zh-mobile375` 实测），属可见文案瑕疵，不影响上传功能。
- 建议修法（1 行）：删除 JSX 中裸的 `{readyCount}`（或把 key 内的 `{{ready}}` 去掉），二选一，勿两处并存。
- 证据：`08-defect-quota-double-count.json`（含 `childNodes` 真值：`["0", "0 / 1 items · …"]`）

### D2（P2，ARIA 未本地化）侧栏导航容器 `aria-label` 硬编码中文

- 现象：EN 态 `nav` 的 `aria-label = "工具"`（视觉文本全英文，仅无障碍名残留中文）。
- 位置：`web/src/components/tools/tool-sidebar.tsx:106` — `<nav aria-label="工具" …>`
- 另外两处 EN 中文属**数据层可保留项**，不计缺陷：
  - 渠道显示名 `grok-imagine-video（默认渠道）`（`title` 属性同为该值）— 来自渠道配置的品牌名，非界面文案；
  - 语言切换按钮 `Switch to 简体中文` — 目标语言用母语标注是常见设计（对应 zh 态显示 `EN`）。
- 建议：把 `aria-label` 走 `t("toolsNav.ariaLabel")`，zh 值保持「工具」即可不动既有断言。

---

## 3. EN 态残留统计（可见文本节点）

| 视口 | 可见文本中文残留 | 属性/ARIA 残留 | 说明 |
|---|---|---|---|
| 1440×900 | 2 | 3 | 均为 §2 D2 所列 3 类（渠道数据名 ×2：文本+title、语言切换名 ×2：文本+aria、侧栏 aria ×1） |
| 375×812 | 0 | 1 | 移动端渠道名不渲染；仅语言切换 `aria-label` |

> 判据：成句界面文案（上传/预览/输出/历史/结果/空态/口型说明/降级提示）**中文残留为 0**。

---

## 4. 源码同一性（页面确实跑的是 PIN）

| 文件 | PIN blob | 磁盘 sha256 | 页面 ?raw sha256 | 变换后模块 sha256（bytes） |
|---|---|---|---|---|
| `web/src/components/tools/workspaces/video-translation.tsx` | `218a78331bc2` | `ca3482aee77d78fc` | `ca3482aee77d78fc` | `87bb01744df61f44` (156398) |
| `web/src/components/tools/workspaces/video-translation-honesty.tsx` | `ef5d69d80bdf` | `f899a47ee25b27b2` | 同左 | `be36af94da31067c` (17729) |
| `web/src/components/tools/tool-asset-input.tsx` | `333e60ae2ff9` | `0886e298b35b1117` | 同左 | `6e1fdc6e37bd3201` (95443) |
| `web/src/components/tools/tool-result.tsx` | `eb044eb68677` | `45a5ef3454858957` | 同左 | `4fffb6a0e70318db` (69507) |
| `web/src/components/tools/tool-task-history.tsx` | `a43087980ef6` | `e1c014dd0df3b483` | 同左 | `e1d65759fa1e60c4` (31638) |
| `web/src/components/tools/tool-sidebar.tsx` | `1455369a71cb` | `0869611802d122c7` | 同左 | `e03a0814fa6fe66d` (21966) |
| `web/src/components/tools/tool-history-dock.tsx` | `1f8d347c3aa3` | `3c44d9d0934a371f` | 同左 | `820f788395a5cc56` (91021) |
| `web/src/components/tools/task-status.tsx` | `fa5b08b1c1b4` | `dd013cf11d97ccdc` | 同左 | `ddeafdfc2f6ca9de` (40932) |
| `web/src/features/tools/tool-page.tsx` | `5605a805600f` | `edec480d5163beee` | 同左 | `f9df6492f663ad83` (125185) |
| `web/src/i18n/locales/en-US.ts` | `14cba0ff9ae6` | `affc62cfeb63525c` | 同左 | `20888249d0d26742` (276249) |
| `web/src/i18n/locales/zh-CN.ts` | `79773225afc7` | `bf26985552998812` | 同左 | `ff36f2f50ee9c607` (266135) |

`head_equals_pin = true`，`all_blob_match = true`，`all_raw_match = true`。

---

## 5. 控制台 / 网络

- 桌面首轮出现 2 条 `Failed to load resource: 403`，复跑（捕获 `response` 事件，阈值 ≥400）**未复现任何 4xx/5xx**；判定为热更新期资源被中断的一次性噪声，非接口鉴权失败。
- `failed` 请求共 10–11 条，全部为 `net::ERR_ABORTED`：`api.github.com/releases`（版本检查，被页面卸载打断）、`/__canvas-hub/state`、`http://127.0.0.1:23210/`（本地代理探测），以及 1 张 `linux.do` 跨域图 `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`。
- 结论：与本地化/工作台渲染无关，无阻塞性错误。

---

## 6. 覆盖边界（如实声明）

本次**未覆盖**，不构成通过结论：

1. **未做真实生成**（按任务约束禁止），因此「结果已生成态」「历史有记录态」的英文文案仅经源码与 i18n key 核对，未经运行时渲染验证；
2. **未上传真实视频文件**，上传后的文件名/预览/校验失败态英文文案未运行时验证；
3. 未覆盖语言下拉的全部选项标签运行时遍历（仅核验默认「源语言/目标语言」与画幅 7 项枚举）；
4. 未做像素级视觉回归（无截图权限，采用 DOM 计算样式取证：诚实降级提示 12px/20px（桌面与移动一致）、移动端工作台右边界 346 ≤ 375、提交按钮右边界 317）。
5. **工作树杂质**：验收时工作树存在他人未提交改动 `web/src/features/tools/adapters/video-translation.ts`（`3cae58f8` → `4c3b71c7`）与同名 `.test.ts`（`5cb84aa8` → `3b404efc`），故运行时 = **PIN + 该 adapter WIP**。经读 diff 确认：改动只增补 `composeVideoTranslationPrompt` 的提示词片段（languageContract / rules）与 `auditVideoTranslationPrompt` 的核对项，**不产生界面可见文案**；上表 11 个「显示相关」文件均已与 PIN 逐字节一致，故本次可见文案结论不受影响。
6. 未验证 EN 态「提交失败错误提示」（按 code 映射后的英文文案）——需真实生成才触发，按任务约束禁止。

---

## 7. 复现命令

```bash
# 1) 桌面 zh → EN → zh 三段 + 移动 375 + 导航取证
python3 scripts/accept_r32.py /tmp/r32/out f53da52afc2279701e816e9ae43a19ae66f22e63 all

# 2) 源码同一性（PIN blob / 磁盘 / 浏览器 ?raw）
python3 scripts/identity.py
```

前置：dev 服务已在 `127.0.0.1:3000` 运行；脚本使用独立持久化 profile，不触碰用户浏览器会话。

---

## 8. 证据清单

| 文件 | 内容 |
|---|---|
| `01-zh-desktop.json` | zh 基线（`htmlLang=zh-CN`，76 条中文文本节点，全量区块） |
| `02-en-desktop.json` | EN 桌面全量区块、残留 2/3、控件状态（含 lipsync/submit） |
| `03-zh-back-desktop.json` | 切回 zh 后完整性 |
| `04-en-mobile375.json` | EN 375×812 全量区块 |
| `04b-mobile-overflow-refined.json` | 视口溢出精算（`badCount=0`，抽屉在视口外） |
| `05-zh-mobile375.json` | zh 375 对照 |
| `06-navigation.json` / `06b-navigation-en.json` | 首页→AI视频列表→VT、无限画布入口（zh/en） |
| `07-source-identity.json` | 11 文件三方哈希 |
| `09-en-breadcrumb.json` | EN 面包屑/页头/侧栏文本定点取证 |
| `08-defect-quota-double-count.json` | D1 DOM 子节点真值 + 源码行 + 改动前行为 |
| `08b-defect-sidebar-aria.json` | D2 硬编码 ARIA |
| `90/91/92-network-console-*.json` | 网络与控制台事件全量 |
| `scripts/accept_r32.py`、`scripts/identity.py` | 可复跑脚本 |
