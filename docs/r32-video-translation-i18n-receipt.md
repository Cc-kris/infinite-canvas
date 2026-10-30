# R32 · 视频翻译工作台 i18n 收口（EN 零中文残留）

日期：2026-10-30 ｜ 分支：`feat/linkfox-v1-real` ｜ 范围：`web/` 前端展示层

## 1. 问题

`/tools/ai-video/video-translation` 在 EN 态仍混入大量中文：状态徽标「已完成」、
结果区「共 N 个结果 · 视频 N」与「下载 / 存入资产 / 发送画布」、历史坞「未记录模型 / N 个结果」、
侧边栏工具名与「补充 / 免责声明」、面包屑「AI video / 视频翻译」。数据层（adapter/上游）只给中文串，
但文案属于界面，必须由展示层按语言出。

## 2. 改了什么

### 2.1 文案来源（i18n）
- `web/src/i18n/locales/zh-CN.ts`、`en-US.ts`：新增 `toolChrome.*`（`assetUpload / fromLibrary / drop* /
  history* / status* / result* / shell*`）与 `videoTranslation.workspace/status.*` 等键；zh 值一律沿用原中文，
  保证既有中文断言与真实界面不变。新增 `toolsNav.disclaimer`。

### 2.2 展示层（模块级中文常量无法直接 `t()`，改为按 id/code 取键 + 兜底）
- `components/tools/workspaces/video-translation.tsx`：全部界面文案走 `t()`；
  源视频规则/画幅提示按**结构化字段**重算（不再拼 adapter 的中文 notice），语言名按语言代码取本地化名并保留原名括注；
  提交错误按 adapter 的 `code` 映射文案，未列出的原样显示（不编造翻译）。
- `components/tools/task-status.tsx`：`TASK_STATUS_META` 的 label/hint 改由 `toolChrome.status.<status>.*` 出，兜底原常量。
- `components/tools/tool-result.tsx`：结果计数行、下载/存入资产/发送画布、重试、空态默认文案走 i18n（`ResultTile` 内补 hook）。
- `components/tools/tool-history-dock.tsx`、`tool-asset-input.tsx`、`tool-task-history.tsx`、`tool-shell.tsx`：同上。
- `features/tools/tool-page.tsx`：新增 `toolLabel(entry, language)`，工具名按 `toolsNav.tools.<ID>` 取译、兜底 registry title；
  侧边栏分类/工具名、面包屑、`补充`/`该分类尚无已注册工具`/`免责声明` 一并通过 i18n（`tool-sidebar.tsx` 补 hook）。

### 2.3 未触碰
- `web/src/features/tools/adapters/video-translation.ts` 及其测试：工作树属他人 WIP，**本次未改也未提交**。
- 输出数量 1–4 的现有阻断策略、以及「不做翻译/对口型承诺」的诚实能力边界：未改动。
  `video-translation-honesty.*` 相关断言仍全绿。

## 3. 如何验证

| 手段 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `pnpm typecheck`（web/） | PASS |
| 单测（含新增 i18n 组件测试） | `bun test`（web/） | **1582 pass / 0 fail（95 files）** |
| 真实浏览器 EN（1280） | `http://127.0.0.1:3000/tools/ai-video/video-translation`，`localStorage['infinite-canvas:locale']=en-US` | 中文可见行 17 → **2**，且全为数据（语言原生名、历史任务里已固化的中文提示词） |
| 真实浏览器 EN / ZH（390，同源 iframe 真实渲染） | `documentElement.scrollWidth` vs `clientWidth` | **390 = 390，无横向溢出**；EN 标签齐全，ZH 中文正常（视频翻译/目标语言/模型/提交） |

新增静态测试 `web/src/components/tools/workspaces/video-translation-i18n.test.tsx`：
① zh/en 键位一致（无漏键）② EN 渲染态除「模型选择器里的渠道名数据 + 任务提示词」外零 CJK ③ ZH 态仍为中文
④ 诚实边界条仍存在且为 12px。

证据原文：`docs/r32-video-translation-i18n-evidence.json`。

## 4. 未完成 / 风险

- EN 态残留的两类中文是**数据不是文案**：语言下拉的原生语名（`Simplified Chinese (简体中文)`，有意保留）、
  历史任务里用户/旧版本固化的中文提示词。要清掉需迁移历史数据，不在本次范围。
- 渠道名（`xxx（默认渠道）`）是配置数据，语言随「模块加载时语言」固化；界面不改写用户数据，故模型选择器里仍可能出现中文渠道名。
- 工具名本地化依赖 `toolsNav.tools.<ID>` 覆盖度：新增工具若漏配键，会回退到 registry 中文 title（安全回退，不报错）。
- 未做打包体积/首屏对比；locale 文件各增约 200 行，gzip 影响可忽略但未实测。

## 5. 使用入口

- 页面：`/tools/ai-video/video-translation`（本地 `http://127.0.0.1:3000`）
- 切语言：右上角设置 → 语言，或 `localStorage['infinite-canvas:locale'] = 'en-US' | 'zh-CN'`
- 复跑验证：`cd web && pnpm typecheck && bun test`
