# AI_TEXT｜POD素材 · 1:1 E2E 验收

- 原站 URL：https://www.linkfox.com/draw/ai-text （**本账号被重定向** → `https://www.linkfox.com/home`，标题「首页 - LinkFox」；与 page-spec 记录的 `permission_redirect_home` 一致，白名单未开通）
- 本地 URL：http://127.0.0.1:3000/tools/product-design/ai-text （标题「无限画布」）
- 视口：双端均用 CDP `Emulation.setDeviceMetricsOverride` 固定 1600×1000（实测 innerWidth/innerHeight = 1600/1000，DPR=1）
- 验收时间：2026-11-02
- 只读验收：未修改任何源码；未点击任何生成/购买/删除类按钮；未提交生成任务。

## 原站 baseline 说明（重要）

`/draw/ai-text` 在已登录账号下 302/SPA 跳转到 `/home`，没有任何 POD 素材工作区 DOM。本轮已如实截图，**未伪造原站工作区**：

| 说明 | 路径 |
|---|---|
| 原站 baseline = `/home` 首页（非工具页） | `docs/V1.0/e2e-1to1/20261102/AI_TEXT/original.png` |

因此本工具的「视觉/布局 1:1」只能对照 page-spec §2/§7 的字段契约与 §9 的空摘录，**无法做原站视觉像素比对**。原站侧判定为 **BASELINE 不可用（权限重定向）**，不是本地实现缺陷。

## 截图

| 说明 | 路径 |
|---|---|
| 原站 baseline（重定向到的 /home） | `docs/V1.0/e2e-1to1/20261102/AI_TEXT/original.png` |
| 本地 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/AI_TEXT/local.png` |
| 本地 · 平铺切 2×2 + 完整提示词模式 | `docs/V1.0/e2e-1to1/20261102/AI_TEXT/local-interact-01-tiling-prompt.png` |
| 本地 · 完整提示词模式（4000 字 textarea） | `docs/V1.0/e2e-1to1/20261102/AI_TEXT/local-interact-02-prompt-mode.png` |
| 本地 · 模式/比例/风格/平铺/文案都配置后 | `docs/V1.0/e2e-1to1/20261102/AI_TEXT/local-interact-03-config.png` |

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | BLOCKED | 原站被重定向到 /home，无工作区可对照；只有本地截图，不能宣布一致或不一致 |
| 布局 | BLOCKED（含 1 个本地 P1 缺陷） | 无原站布局可对照；但本地自身有可复现的溢出缺陷（差异 1）：`main` 高 926、内容高 1370，`overflow-y:hidden` 且滚轮无效，「生成 POD 素材」在 y=1338 永久不可达 |
| 交互 | PASS | 本地实测 6 个零成本控件（素材模式/输出比例/风格/中文风格 4 个下拉、平铺 4 选 1、简易文字↔完整提示词切换、上传入口），均有前后差异证据；原站无工作区，故只有本地侧 |
| 功能 | REAL_PROVIDER（引用既有真实证据，本轮未提交） | 适配器 `web/src/features/tools/adapters/ai-text.ts:300` → `gateway.submit` + `waitForResult`，网关直连 `services/api/image.ts`；既有真实上游取证 `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_TEXT/result.json`（`status: PASS`，`realProviderCall: true`，gpt-image-2 via canvas-proxy → api.cc-ai.xyz，b64_json 出图） |

## 本地实测数据（1600×1000）

- 页头：H1「POD 素材」+ 副文「图案 / 文字素材生成，支持平铺规则、案例变体与真实 provider 出图。」；右上「目录：模式 / 比例 / 风格 / 中文风格」灰标 + 「✓ default::gpt-image-2」。
- 页面上方原站页面 nav chip 条（素材和灵感 / 场景素材 / 相似图裂变 / AI自由绘图 / POD素材 / 素材贴合 / 印花提取 / 企业功能）+「ljq_driver: 已连接」。
- 内容网格 `grid lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]` 1354×1279 @219,148（可视高 926）：左配置 360、右预览 978。
- 左配置分 4 段卡片：
  1. 「上传底图（参考图）」+「0/1 个 · PNG / JPG / WebP · ≤ 20 MB」；拖拽区 334×~111「点击选择本地文件，或拖拽到这里 / 校验格式 / 大小 / 像素，入库后可刷新恢复」；「还没有素材」
  2. 「素材模式」（请选择 / 图案素材 / 文字素材 / 图案 + 文字）、「输出比例」（请选择 / 1:1 / 4:5 / 3:4 / 2:3 / 3:2 / 4:3 / 16:9 / 9:16）、「风格」（不指定 / Vintage / Minimal / Floral / Geometric / Cartoon / Hand-drawn / Retro poster / Line art）、「中文风格」（不指定 / 复古 / 极简 / 花卉 / 几何 / 卡通 / 手绘 / 复古海报 / 线稿）、「输出数量（1–15）」number=1
  3. 模式切换「简易文字（默认选中）/ 完整提示词」+「简短提示词 / 文案（≤200 字）」textarea + 计数 `0/200` + checkbox「自动扩写提示词」（副文「本地确定性扩写，不调用上游；扩写结果会进预览与真实请求。」）+ checkbox「增强变化强度」+ checkbox「基于当前配置新建案例变体」
  4. 「本次生成 1 张素材」+「生成 POD 素材」334×40 @232,1338（**视口外、disabled**）
- 右侧预览：标题「平铺预览」+ 副文「不平铺（单图）· 只输出一张独立图案，适合单面印刷。」；右上「撤销 重做 复位」；棋盘格预览区约 478×478，内含虚线「文字区」框；下方平铺 4 选 1「不平铺（单图）（默认选中）/ 2×2 平铺 / 2×2 错位平铺 / 3×3 平铺」；`<details>`「将进入请求的提示词（按模式生成）」；再下方「POD 素材结果」空态「还没有生成结果 / 填好参数并提交后，结果会出现在这里，可预览、下载、存入资产库或发送到画布。」
- 页脚另有「连接本地 Agent / Claude Code / Codex / Galley」面板（本地自造）。

## 逐条差异

> 原站无工作区 DOM（重定向 /home），下表只列**本地自身可验证的问题**与**对 page-spec 契约的符合度**，不虚构原站行为。

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 布局 · 配置栏溢出 | **P1** | 「生成 POD 素材」主按钮 + 计数区 | 无原站证据（页面重定向） | `main` 926 高、内容 1370 高、`overflow-y:hidden`，滚轮实测 `main.scrollTop` 恒 0、`documentElement.scrollHeight=1000`；主按钮 @232,1338 永久不可见（且当前 disabled，`page.click` 报 `element is disabled`） | `local.png`；`main.scrollTop=0` 前后不变 |
| 2 | 契约 · page-spec 字段落位 | P2 | `ratio` / `styles` / `stylesCn` / `mode` / `outputNum` / `tilingPreset` / `useAutopromptOption` / `variationStrength` / `aiSimpleTextPrompt` / `prompt` | 无 | 全部 14 个 §7 字段都有可见控件（4 下拉 + 1 number + 4 平铺 + 2 textarea + 3 checkbox），无遗漏 | `local-interact-03-config.png`；`[select]` ×4、`[type=number]` ×1 |
| 3 | 本地自造 · 中文风格 | P2 | 「中文风格」下拉（9 项） | 无 | page-spec §7 同时列了 `styles` 与 `stylesCn`，本地做成两个独立下拉（英文 9 项 / 中文 9 项），且选「Floral」会联动把「中文风格」置为「花卉」 | 实测 S3：styles=floral → stylesCn=花卉 |
| 4 | 文案 · 默认值 | P2 | 素材模式 / 输出比例 | 无 | 两项默认均为空「请选择」，主按钮默认 disabled；与 page-spec「outputNum 默认 1」一致（number=1），但 `mode/ratio` 无默认值 | 实测 S0 四个 select value 全为 `""` |
| 5 | 本地自造 · 平铺预设 | P2 | 平铺预览 4 选 1 | 无 | page-spec 只有 `tilingPreset` 一个字段，本地扩成 4 个预设（不平铺 / 2×2 / 2×2 错位 / 3×3）+ 棋盘格预览 + 文字区框，`aria` 只用 border 色表达选中 | 实测 S4 选中态从「2×2」移到「3×3」 |
| 6 | 本地自造 · 顶部目录标注 | P2 | 「目录：模式 / 比例 / 风格 / 中文风格」 | 无 | 页头右上灰标 + 「✓ default::gpt-image-2」，属内部实现提示泄漏到 UI | local.png 右上 |
| 7 | 本地自造 · 结果区动作 | P2 | 存入资产库 / 发送到画布 | 无 | 空态文案预告「可预览、下载、存入资产库或发送到画布」，但结果区未生成时无按钮 | local.png |
| 8 | 壳层 · 全局 | P2 | 促销条 / 算力 / 学习中心 / HelpDock | 原站全局有（/home 截图可见：学习中心、免费得算力 350、购买、用户6991、操作咨询/产品教程、水印分组） | 本地缺失；另有本地自造 top-right 图标组、右缘竖条、右侧 Agent 面板 | 双端截图 |

## 交互实测（本地，原站无工作区）

1. 「素材模式」→ 请选择 → 图案素材（`select[0]` value `""`→`pattern`）；主按钮仍 disabled（还缺比例）。
2. 「输出比例」→ 请选择 → 1:1（`select[1]` value `""`→`1:1`）。
3. 「风格」→ 不指定 → Floral（`select[2]` value `""`→`floral`），并联动「中文风格」`select[3]` 同步变 `花卉`。
4. 平铺「2×2 平铺」→「3×3 平铺」：`border-primary` 选中态从 2×2 移到 3×3；预览副文由「2×2 平铺 · 四宫格无缝重复，适合布料/包装连续图案。」变「3×3 平铺 · …」（文案随预设联动）。
5. 「简易文字」→「完整提示词」：配置区由「简短提示词 / 文案（≤200 字）+ 0/200」换成「完整提示词（≤4000 字）+ 0/4000」，textarea 高 128。
6. 上传入口：`input[type=file]` 存在（accept 由 `AI_TEXT_UPLOAD_LIMITS.mimeTypes` 生成），点击拖拽区会打开文件选择器（只验证入口，未上传以保持基线干净）。

> 主按钮在 4 步配置后仍 disabled（还缺必填的上传素材/文案），与「模式/风格/比例为页面目录取值，仅接受目录内取值」的本地提示一致；未强行提交。

## 结论

- 原站不可用（权限重定向 /home），已如实标注 baseline，未伪造工作区截图；因此**不宣布视觉/布局 PASS**。
- 本地自身有 P1 溢出缺陷（差异 1）：「生成 POD 素材」在 1600×1000 首屏不可达且无法滚动到，实际提交路径被阻断；这与 SDS/AI_WEARABLE 同一类 `overflow:hidden` 布局问题。
- 字段覆盖度好（page-spec §7 的 14 个字段全部有控件），平铺/自动扩写等扩展控件属本地自造，需按 1:1 要求确认是否保留。
- 交互 PASS（本地 6 个控件实测）；功能 REAL_PROVIDER 依据既有真实取证 `evidence/real-acceptance/AI_TEXT/result.json`（PASS，真实 200 出图）+ 源码链路，本轮未真实提交。
