# LinkFox 功能面解析 & 「1:1 复刻进无限画布」可行性评估

- 分析对象：`https://www.linkfox.com/home`（连带 `os.linkfox.com` / `skill.linkfox.com` / `pricing` / `browserplugins`）
- 分析日期：2026-10-27
- 方法：REA 6.5.0（CDP 观测 + bundle 静态推断）+ 临时 headless Chrome 直连 CDP 取渲染文本
- 结论先行：**不能 1:1 复刻**。UI 观感可到 ~80%，AI 视觉能力可到 ~40–50%，数据能力 ~5%，商业底座 0%（架构性不匹配）。真正值得抄的是「工具即节点 + 套图工作流 + 任务队列」这三件事。

---

## 0. 证据与可复现路径

| 产物 | 说明 |
|---|---|
| `temp/linkfox_scan/inspect.json` | REA inspect：DOM 1726 节点、a11y 831 节点、network（attach 后为空） |
| `temp/linkfox_scan/bundle.json` | REA bundle 推断：**97 条前端路由**、**328 个接口候选**、215 脚本节点 / 1207 边 |
| `temp/linkfox_scan/routes.txt` / `endpoints.txt` | 去重后的路由与接口全量清单 |
| `temp/linkfox_scan/home_text.txt` | 工作台登录前可见文案（CDP `innerText`） |
| `temp/linkfox_scan/{pricing,plugin,os.linkfox.com,skill.linkfox.com}_text.txt` | 定价页 / 插件下载页 / 两个子站文本 |

复现命令（要点）：
```bash
export PATH="/opt/homebrew/bin:$PATH"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9333 \
  --user-data-dir=./profile --headless=new --window-size=1440,1000 about:blank &
curl -X PUT "http://127.0.0.1:9333/json/new?https://www.linkfox.com/home?cb=1"
rea inspect-web-page http://127.0.0.1:9333 <targetId> --observation-ms 4000 --format json
rea analyze-web-bundle http://127.0.0.1:9333 <targetId> --observation-ms 4000 --format json
```
坑：REA 的 `accessibility.text_capture` 返回 `not_approved`、节点 `name` 全为 null，**拿不到任何文案**；页面文本必须用 CDP `Runtime.evaluate(document.body.innerText)` 自取。`network.requests` 因 attach 晚于加载而为空，接口地图只能靠 bundle 静态推断。

技术栈（bundle 证据）：React + **mobx** + antd + **rolldown** 打包，入口 `/web-assets/workbench-*.js`，共 203 个 JS chunk，主包即路由表。

---

## 1. LinkFox 到底是什么（不是一个网站，是四层生态）

| 站点 | 定位 | 体量证据 |
|---|---|---|
| `www.linkfox.com` | 创作工作台（作图/视频工具 + 商品库 + 团队 + 算力） | 97 路由 / 328 接口 |
| `os.linkfox.com` | **Agent OS**：业务 Agent、技能市场、定时任务、店铺经营助手、资产 | 「技能·专家」分类 6 组（选品与开发/产品视觉/产品运营/营销广告/数据分析/通用热点） |
| `skill.linkfox.com` | **Skills 市场**：1000+ 跨境 AI 技能 + MCP 服务 + CLI 安装 | MCP 已有 7+ 个：亚马逊选品(31 工具)、跨境选品(56)、合规检测(23)、视频生成(3)、图片生成(4)、Sorftime(2)、Sif(4)、卖家精灵(5)、Ozon Seerfar |
| `browserplugins` / App | Chrome 插件 V3.16.6（AI 助手/作图/图片采集，伴随式选品）+ Android/iOS | 插件侧栏即完整工具目录 |

主体：厦门紫讯信息科技有限公司；已做 ICP + 网信算备（`闽ICP备2023003248号`、`网信算备350102316065101240011号`）——这两条直接说明它是**持牌运营的云 SaaS**。

### 1.1 作图/视频工具（`/draw/*` 共 57 条路由，其中 5 条是批量任务子路由）

| 分类 | 数量 | 工具 |
|---|---|---|
| 商品图/套图 | 13 | `product-image-suite`、`clothing-image-suite`、`product-home`、`product-generation`、`product-replacement`、`product-scene`、`product-refine`、`scene-image`、`scene-reference`、`ai-draw`、`changing-bg`、`ai-outpainting`、`image-fission` |
| 模特/服装 | 8 | `changing-model`、`ai-dressing`、`changing-mannequin`、`ai-wearable`、`ai-posture`、`hand-product`、`handheld-goods`、`hand-repair` |
| 修图/抠图 | 10 | `smart-repair`、`area-repair`、`color-diff-repair`、`printing-repair`、`print-extract`、`remove-pen`、`quality-increase`、`batch-matting`、`fine-matting`、`image-crop` |
| 换色 | 2 | `change-color`、`change-color-v2` |
| 文字/排版/翻译 | 5 | `ai-text`、`ornament-text`、`sds-design`、`ai-image-edit`、`image-translation` |
| 图复刻 | 1 | `image-replication`（含 `cost/estimate`、`split/preview` → 分镜级复刻） |
| 视频 | 8 | `video`、`video-edit`、`video-replication`、`video-translation`、`sale-video`、`inspiration-video`、`ai-video-edit`、`video-publish` |
| 批量 | 5 | `batch-generate-images`（+ 建任务/草稿/我的任务 3 子路由）、`batch-generate-videos` |
| 设计器/模板/记录 | 5 | `designer-home`、`my-design`、`my-template`、`product-records`、`team-space` |

其他一级路由：`/aiChat/{batchListing,template,myTemplate,history,analysisRecords}`（Listing 批量生成）、`/productManagement`、`/linkManagement`、`/referenceLinks`、`/inspiration`、`/image-delivery`、`/database/{picturelibrary,sensitiveThesaurus}`、`/team/{home,manage,records,api-guide}`、`/usercenter/pricing`、`/settings`。

### 1.2 接口分布（328，按首段）

```
image 135 | linkFoxApp 35 | user 23 | product 22 | team 17 | keywordLibrary 13
prompt 11 | information 10 | order 10 | userPlan 9 | agent 6 | certification 6
advertisement 4 | brandGene 4 | chat 3 | cp(微信) 3 | newPlan 3 | teamInviteRebate 3
favorite-color 2 | file 2 | notice 2 | subscribe 2 | calendar 1 | moli 1 | userModel 1
```
结构含义：
- `image/*` 135 个 = 全部视觉能力（`make/process/{cutout,interactCutout,interactErase,pvu}`、`changeColor/v2/analyze-colors`、`wearSegment`、`intelligentFittingRoomPoint`、`modelFaceProcess`、`extractImageLayout`、`imageTextEdit`、`replication/*`、`batch/task/*`、`designer/*`）——**每个工具都是「异步任务 + 轮询 + 结果落库 + 下载」同一套骨架**。
- `order`/`userPlan`/`newPlan`/`subscribe`/`advertisement`/`teamInviteRebate` = 算力计费、套餐、退款、广告位、邀请返佣。
- `certification`（个人/企业实名）、`cp/v1/user`（微信登录/解绑）、`team/*`（席位、审计日志、算力上限） = 云账号体系。
- `team/api-guide` + `userCenter/openapi/authorize` = **对外开放 API**（把能力当 API 卖）。
- `agent/chat/*` + `https://ai-api.linkfox.com/agent/chat/stream` = Agent 对话走独立 SSE 域名，工具调用在服务端。

### 1.3 定价（说明它卖的是「算力 + 模型成本」）

| 档 | 年费 | 算力/月 | 折算 |
|---|---|---|---|
| 基础版 | ¥949（原 2148） | 5,600 点 | 约 1,400 张/月；**不支持批量** |
| 高级版 | ¥2,870（原 7,068） | 22,000 点 | 约 5,500 张/月；仍不支持批量 |
| 团队版 | ¥4,788 起（5–10 席） | 52,500 点 | 13,125 张/月；批量 + 席位算力上限 + 审计 |

成本基准（页面自述）：`LF 全能模型 Lite ≈ ¥0.212/张`、`LF 智能模型 G-2 ≈ ¥0.056/张`、`Seedance 2.5 ≈ ¥0.748/秒`。
→ 三个信号：① 它有**自研/深度定制模型**（LF 系列）；② 毛利靠算力包而非订阅；③ 批量能力被当作**付费闸门**（免费/基础版锁死）。

---

## 2. 无限画布现状（对照基线）

- 架构：Vite 7 + React Router 7 前端优先；Electron 桌面壳（固定端口 23211 + 本地代理 23210）；数据在 **IndexedDB**，可选 WebDAV 同步；**无账号、无云存储、无计费**（`docs/content/docs/overview/features.mdx` 的 Current limitations 明写）。
- 节点类型（`web/src/types/canvas.ts`）：`image / fixedImage / text / config / video / audio / group`，且 `CanvasNodeTypeId = CanvasNodeType | (string & {})` —— **插件可注册任意 `pluginId:name` 新节点类型**。
- 已有 AI 能力：文生图、图生图/参考图编辑、文生视频、音频、文本问答（全部走用户自己的 OpenAI 兼容端点）；提示词库（7 个内置源 + 自定义 JSON 源）；画布助手；本地 Agent（Claude Code / Codex / Galley）+ MCP 可读写画布。
- 已有工程能力（对比 LinkFox 的差异优势）：离线可用、数据不上云、多画布编排、撤销重做、导出、插件热装。

**差距量化**：LinkFox 的 57 个工具里，无限画布原生覆盖 ≈ 2 个（`ai-draw` 文生图、`ai-image-edit` 部分）。UI 骨架覆盖率 ≈ 15%（有画布/有生成/有提示词库，缺工具页、任务队列、商品库、素材库、模板、导出交付）。

---

## 3. 逐层复刻可行性矩阵

评级：**A**=可复刻（现有能力+编排）｜**B**=需接专用模型（可外包 API）｜**C**=需视频/音频管线｜**D**=结构性不可复刻

| # | 模块 | 层 | 判级 | 关键依赖 | 单人估时 |
|---|---|---|---|---|---|
| 1 | 商品图套图（白底图→主图/场景图/卖点图/A+） | 视觉 | **A/B** | 现成 image-edit + 固定 prompt 模板 + 尺寸预设 | 2–3 周 |
| 2 | 批量生图/批量视频（任务队列、草稿、我的任务） | 编排 | **A** | 现有 canvas 批量结果节点 + 本地队列（IndexedDB） | 2 周 |
| 3 | 智能修图（指令式改图） | 视觉 | **B** | gpt-image / Flux Kontext / Nano-Banana 类编辑模型 | 2 周 |
| 4 | 抠图（自动/精细/批量/交互） | 视觉 | **B** | BiRefNet / SAM2 + 边缘羽化；交互抠图需点选 UI | 3–4 周 |
| 5 | 一键换色（含颜色分析、色卡库） | 视觉 | **B** | 分割 + 局部重绘 + 色相映射保纹理 | 3 周 |
| 6 | 高清放大 / 智能扩图 / 局部消除 | 视觉 | **B** | ESRGAN 类 / outpainting / inpainting | 2–3 周 |
| 7 | 模特换装 / 人台模特 / AI 穿衣 / 换姿势 | 视觉 | **B** | 专用试衣模型（IDM-VTON/Kolors 系）+ 人体解析 | 4–6 周，效果不稳 |
| 8 | 场景裂变 / 商品替换 / 素材贴合 | 视觉 | **B** | 同上 + 合成光影 | 3 周 |
| 9 | 图片翻译 / 文字排版（AI 文字、花体字） | 视觉 | **B/C** | OCR(版面) + 擦除 + 重排 + 字体渲染 | 4 周 |
| 10 | 图复刻（链接→拆解→分镜→复刻） | 视觉+抓取 | **B/C** | 需抓竞品图 + 分镜理解；`replication/split` 是核心难点 | 4–6 周 |
| 11 | 视频：图生视频 / 带货视频 / 口播 / 视频复刻 / 视频翻译 | 视频 | **C** | 视频模型 + TTS/数字人 + ASR+翻译+口型 + ffmpeg 合成 + 长任务断点 | 8–12 周 |
| 12 | 商品图设计器（画布式排版、模板、字体） | 前端 | **A** | 无限画布本身即底座，反而不是难点 | 3–4 周 |
| 13 | 灵感库 / 提示词库 / 素材库 / 商品库 | 资料 | **A** | 本地 IndexedDB + 标签体系；"做同款"需参数化 | 3 周 |
| 14 | 链接管理 / 图片交付（对外分享） | 资料 | **A/B** | 分享链接需服务端或 WebDAV | 2 周 |
| 15 | 团队空间 / 席位 / 审计 / 算力上限 | 商业化 | **D** | 需账号+后端+计费；桌面本地优先架构不匹配 | — |
| 16 | 算力计费 / 套餐 / 订单 / 退款 / 发票 | 商业化 | **D** | 支付主体、对账、退款 | — |
| 17 | 选品数据（亚马逊/1688/TikTok/Temu/Shopee…） | 数据 | **D** | 卖家精灵/Sif/Sorftime/EchoTik 授权 + 抓取代理池 + 反爬维护 | — |
| 18 | 合规检测（外观专利/商标/版权/TRO） | 数据 | **D** | 专利商标数据库商业授权 + 法律口径 | — |
| 19 | 店铺报表（95+ 报表）/ 广告报表 | 数据 | **D** | Amazon SP-API 授权 + 报表解析；或爬虫 | — |
| 20 | 关键词库 / Listing 批量生成 | 数据+文本 | **D/C** | 关键词需搜索量数据；Listing 需平台规则与类目知识 | — |
| 21 | 1000+ Skills 市场 / MCP 服务 / Agent OS | 生态 | **D** | 数据授权 + 持续内容运营 + 账号体系 | — |
| 22 | 微信登录 / 实名认证 / 开放 API / 邀请返佣 | 商业化 | **D** | 主体资质 + 备案 | — |

### 汇总

| 层 | 可达程度 | 依据 |
|---|---|---|
| UI 观感/交互 | **~80%** | 工具页 = 表单 + 画布 + 任务列表，无限画布的画布/节点/插件系统已覆盖大半 |
| AI 视觉能力 | **~40–50%** | 生成类齐平；分割/试衣/翻译/复刻类需专用模型，效果与成本不可控 |
| 视频能力 | **~30%** | 需 4–6 个模型串联 + 长任务管线 |
| 数据/选品/合规 | **~5%** | 全是第三方数据授权，**不是代码问题** |
| 商业底座（账号/算力/团队/开放 API） | **0%** | 与「本地优先、无账号、Key 在浏览器」的架构冲突 |

**判定：1:1 不可能。** 真正卡死的不是模型，是 15–22 这 8 项——它们占 LinkFox 收入的全部理由（它本质是「数据订阅 + 算力包」，作图只是入口）。

---

## 4. 如果要做，建议的差异化路线（三阶段）

### 阶段一：把画布变成「电商套图流水线」（3–4 周，纯现有能力）
- 新增节点类型（插件方式，不动核心）：`suite-template`（套图模板：白底→主图/场景/卖点/A+ 的固定链路）、`batch-task`（批量任务，读 Excel/文件夹）、`watermark`、`export-pack`（按平台尺寸批量导出）。
- 复用现有 image-edit + 提示词库：把 LinkFox 的 13 个商品图工具**降维成 13 个参数化模板**（同一套 image-edit，不同 system prompt + 尺寸 + 参考图策略）。
- 交付物：一键把 1 张白底图 → 6–10 张平台合规图，全部落画布、可继续迭代。
- 这一阶段最容易「看起来 1:1」，因为 LinkFox 的差异很大程度来自模板与默认参数，不是模型。

### 阶段二：确定性修图工具（6–8 周，接专用模型）
- 抠图（BiRefNet/SAM2）、换色、扩图、消除、高清、换背景——各自一个节点类型 + 本地任务队列 + 结果缓存。
- 需要新增：本地任务队列（IndexedDB 状态机 + 断点续跑）、代理侧多模型路由（现在只有单通道 OpenAI 兼容）。

### 阶段三：视频管线（8–12 周，成本最高）
- 图生视频 → 口播（TTS+数字人）→ 视频翻译（ASR+翻译+TTS+口型）→ ffmpeg 合成。桌面版有 Node 主进程，可直接驱动 ffmpeg。
- 视频成本高（Seedance 级 ≈ ¥0.7/秒），本地无计费兜底，必须做「本地成本预估 + 失败重试」。

### 明确不做
选品/合规/报表/关键词/团队计费/技能市场。要用就**接 LinkFox 或同类 MCP**（`skill.linkfox.com` 已提供 MCP 与 CLI），把它们当外部工具源挂到画布的 Agent 上——比自研便宜两个数量级，也回避数据授权问题。

---

## 5. 风险清单

1. **法务**：LinkFox 的 UI 布局、模板、图标、文案有著作权；「1:1」若含视觉与文案照搬，属侵权高风险。可抄**信息架构与交互范式**，不可抄视觉资产与文案。
2. **成本**：试衣/换色类模型单张成本 0.05–0.5 元，用户本地自带 Key 的模式下无法做「免费试用 + 算力包」，商业模型与 LinkFox 完全不同。
3. **反爬/授权**：数据类功能一旦自建，维护成本是持续性的（代理池、验证码、平台改版），单人不可持续。
4. **合规**：生成式 AI 对外提供服务需算法备案；无限画布是本地工具（用户自备 Key）才绕开这一层，一旦加账号+代付就会踩到。

---

## 6. 一句话结论

**别做「LinkFox 的克隆」，做「LinkFox 商品图那 13 个工具的画布版」**：用无限画布已有的画布/节点/插件/本地 Agent 能力，把「套图模板 + 批量任务 + 确定性修图」做成离线可用的流水线，数据类能力用 MCP 外挂。这样 3–4 周能出可用版本，6 个月能覆盖 LinkFox 视觉侧的 60%，且成本结构比它健康。
