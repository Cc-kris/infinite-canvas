# design19 前10工具 非视觉验收 — 进度

## 已完成
- 双端 DOM 快照：real/<ID>.json（原站，TMWebDriver 临时标签，读完即关）、local/<ID>.json（本地 Playwright 冷启动）
  - 采集器：tools/design19_nv_snap.js（含 controls/optionGroups/activeEls/caseModule/bodyText）、tools/design19_nv_capture.py、web/scripts/real-acceptance/design19-nv-local-snap.mjs
- 原站案例模块事实：REPLACE_GOODS / PRODUCT_SCENE / AI_DRESSING_V2 / AI_WEARABLE / SDS_DESIGN 有「优秀案例」tab；
  HANDHELD_GOODS / AI_POSTURE 无案例 tab 但有「一键做同款」；NEW_REPLACE_BG_V2 无案例；
  AI_TEXT / ORNAMENT_TEXT 原站路由 302 回 /home（无基线 → 案例 N/A，保留 DOM 事实）
- F 字节核验（尺寸判真图 vs 截图）：
  - 有真实产物 png：NEW_REPLACE_BG_V2 1024x1024、REPLACE_GOODS 1254x1254、PRODUCT_SCENE 1024x1024、HANDHELD_GOODS 720x960、AI_DRESSING_V2 720x960、AI_POSTURE 720x960、AI_WEARABLE 720x960
  - 仅截图（缺真实字节）：AI_TEXT、ORNAMENT_TEXT、SDS_DESIGN → 需现场真实生成

## 待办
1. 现场真实生成 AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN，落盘原始字节 + sha256 + 上游响应 id
2. 10 工具三动作（下载 / 存资产 / 发画布）UI 实测 + 历史面板刷新后仍在
3. 默认值逐控件对照表（来源：real/local 快照 + activeEls）
4. 汇总报告 MD/JSON（任何 DIFF 不得整体 PASS）
5. 只提交自有证据与必要的工作区改动

## 关键坑
- 原站 antd 默认值只在 activeEls/antSelected 文本里，controls 覆盖不足
- 本地资产库随 Playwright 上下文隔离（每次 fresh），不能跨会话复用字节
- 本地前2工具（NEW_REPLACE_BG_V2/REPLACE_GOODS）是新式分段工作台，控件集与原站结构不同

## 2026-10-29 12:5x 关键环境结论
- 沙箱 shell 直连外网全断（google/api.openai.com 均 000）；系统代理 127.0.0.1:7890 可用（200）
- canvas-proxy 原由 proxy_launch.mjs 直接 import startProxyServer，绕过 index.js 的 NODE_USE_ENV_PROXY 自重启 → 只走 direct → ETIMEDOUT / 「任务失败·无法确认上游是否受理」
- 修复：kill 旧 PID，用 `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 NO_PROXY=localhost,127.0.0.1 node .worker-scratch-w6/proxy_launch.mjs` 重启 → 代理可出网（直连 OpenAI 返回真实 401 而非超时）
- 结论：本地真实生成依赖系统代理环境变量启动 canvas-proxy，否则一律失败（不是工具缺陷）
- ORNAMENT_TEXT 只填「文字内容」不填「效果描述」→ 提交被拦截（prompt 未带上 effect 参数），任务 0 条、无网络请求（潜在 DIFF：可选字段被当必填）

## 2026-10-29 收尾（非视觉五维全部有结论）

### 已关闭
- 三动作 10/10 PASS（字节 download==asset==node==源）。两个失败根因已修：`NEW_REPLACE_BG` 规范 id 为 `NEW_REPLACE_BG_V2`（runner 加 `taskToolId`）；`PRODUCT_SCENE` 历史 dock 在「历史记录」页签内（runner 加 `historyTab`）
- 历史持久化 10/10：刷新后 dockItems=1
- 真实生成 3 工具 PASS：AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN（gen/*.png + 源字节 sha）

### 关键方法论修正（避免误判）
- 原站匿名 Playwright 被登录墙拦截（realCtrls=0）→ 用 TMWebDriver CDP `Network.getAllCookies`（tabId 传**整数**）导出 Cookie（含 HttpOnly `LINKFOX_AI_TOKEN`），注入 Playwright 后 real 侧才可采
- 原站 slug ≠ 本地 slug：ai-dressing / product-replacement / product-home；`ai-text`、`ornament-text` 在原站**不存在**（跳 /home）→ 案例/默认值维度只能判 N/A（已留 DOM url+title）
- 两端控件标签写法不同（real aria-label vs local placeholder），精确匹配全错配 → 必须模糊匹配/人工语义比对

### 未关闭 DIFF（本轮不自行改产品代码，交接）
1. 案例：原站 REPLACE_GOODS / AI_DRESSING_V2 / AI_WEARABLE 有「优秀案例」页签，本地缺（本地实测 hasCase=false，非懒加载）；PRODUCT_SCENE / SDS_DESIGN 两端一致
2. 同款：两端全无 → 一致 N/A
3. 默认值：原站 10 工具均有「名称=LinkFox 默认」「水印文案=本图片由 LinkFox AI 生成」；本地仅 AI_DRESSING_V2 有这两输入框（默认空），其余 9 个工具无字段（工具页无任何「水印」字样，无设置抽屉）
4. NEW_REPLACE_BG_V2 原站对应页实为「商品图合成」(`/draw/product-home`)，语义是否同一产品待产品确认

### 为什么不动代码
`web/src/components/tools/workspaces/replace.tsx`、`dress.tsx` 等为共享工作区且当前有多个 worker 并发改动（git status 多份 .worker-* + 共享 src 被改），且案例卡数据必须取自仓库真实产物（tool-cases-data 仅有 AI_OUTPAINTING_CASES），不能伪造 → 交由产品/对应工作区 owner 实现。

### 交付物
- `REPORT.md`（逐维度结论，不整体 PASS）
- `actions/*.json`、`defaults-real/*.json`、`case-module-check.json`、`gen/*`
- 脚本：`web/scripts/design19-nv/run-actions10.mjs`、`run-defaults-real.mjs`
- 复现：`node run-defaults-real.mjs`（需 /tmp/d19_cookies.json，由 CDP 导出）
