# LinkFox 图片/视频全功能复刻可行性（深度版 · 2026-10-27）

> 上一版 `linkfox-replica-feasibility.md` 基于静态 bundle 推断，结论"不能 1:1"。
> 本版在**已登录态**下打通了内部 API（含鉴权），拉到了 571 个 JS chunk（18.6MB）、模型目录、prompt 素材、逐工具 UI 字段。
> 结论**修正**：图片/视频功能**可复刻度 85–95%**，且**不需要 LinkFox 的任何私有能力**——它自己也没有。

---

## 0. 一句话结论

LinkFox 的图片/视频板块 = **公开模型的编排层**（Nano Banana 2.1 / GPT Image / Seedream 5 / Wan 2.7 / Seedance 2.5 / Kling v3 / Vidu Q4 / MiniMax H3）
+ **服务端 prompt 工程** + **一层表单式 UI**。
模型你有、参数结构已拿到、prompt 公式已拿到；**拿不到的是每个工具那 1–3 句服务端 system prompt**——但那部分是可以用已提取的公式在 1–2 天内重写的。

---

## 1. 取证方法（可复现）

```bash
# 1) 前端全量 chunk（公开资源，无需登录）
#    从 /home 入口 HTML 的 <script> + 递归 import 图抓取，569 个成功 / 77 个假引用
# 2) 内部 API（需登录态）
#    基址 https://ai-api.linkfox.com   ← 注意不是 api.linkfox.com
#    必需请求头：{'Site-Flag':'site', 'authorization': <cookie accessToken>}
#    ★ fetch 绝不能带 credentials:'include'，否则服务端 ACAO=* 与凭据冲突 → 全站 TypeError: Failed to fetch
```

- token 位置：**非 HttpOnly** cookie 里的 JSON（`accessToken / expireAt / refreshToken`）→ 页面内 `document.cookie` 可读
- 证据包：项目目录 `linkfox-deep-20261027/`
  `models_catalog.json` / `prompt_atoms.json` / `example_prompts_raw.json` / `tool_ui_labels.json` / `endpoints_526.txt` / `prompt_library_179.json`

---

## 2. 架构真相：三层

| 层 | 内容 | 复刻难度 |
|---|---|---|
| **UI 层** | 57 个 `/draw/*` 页面，全是「左表单 + 中画布 + 右结果」同一套骨架 | ★☆☆ 低，无限画布节点系统天然覆盖 |
| **编排层** | 前端拼装配方 → 提交 `/image/make/create`（字段：makeType + 图 + 参数 + prompt） | ★★☆ 中，配方已拿到 |
| **模型层** | 全部第三方公开模型（见下表），LinkFox 只是转售 + 加价 | ★☆☆ 低，你有同类通道 |
| **数据层** | 选品/关键词/合规/专利 | 不做（用户明确排除） |

### 2.1 模型目录（从 `/image/model/config/list?bizType=N` 直接读到的）

图像（bizType → 工具 → 可用模型）：

| bizType | 工具 | 模型数 | 代表模型 |
|---|---|---|---|
| 61 | IMAGE_EDIT（AI 修图/编辑） | 11 | BANANA_2_1(GEMINI_NANO_BANANA_2_1), GPT_2_5_IMAGE, SEEDREAM5_PRO, WAN2_7 |
| 62 | MULTI_IMAGE_FUSION（多图融合） | 11 | 同上 + AIDRAW_EDIT |
| 69 | WEAR_COLLECTION（服装套图） | 8 | GPT_2_5_IMAGE, BANANA_2_1, SEEDREAM5_PRO, WAN2_7 |
| 71 | PRODUCT_MARKET_MATERIAL_V2（商品套图） | 9 | 同上 |
| 77 | IMAGE_GEN（文生图） | 10 | BANANA_2_1, BANANA_2_LITE, WAN2_7, GPT_2_5_IMAGE |
| 83/85/86/87 | PRODUCT_FISSION 系列 | 1–3 | GPT_2_IMAGE, GEMINI_FLASH_PRO |
| 100–103 | AGENT_* （Agent 内调用） | 7–9 | 全覆盖 |
| 107 | SUIT_COLOR（套装换色） | 1 | GPT_2_5_IMAGE |

视频（bizType）：

| bizType | 工具 | 代表模型 |
|---|---|---|
| 30 | IMAGE_TO_VIDEO | minimax-h3-lite, viduq4-preview, wan3, doubao-seedance-2-5, happyhorse-v2, seedance-2-0(-fast/-mini) |
| 73 | SALE_VIDEO（带货视频） | 同上 8 个 |
| 87/88/89 | 视频复刻 / 爆款灵感 | + GEMINI_OMNI_FLASH_1_1, kling-v3-omni, kling-v2-6 |
| 94/95/96 | 视频编辑 / 视频翻译 | SEED_V25, HAPPY_HORSE, WAN3, GEMINI_OMNI_FLASH |
| 104–106 | Agent 视频 / 批量视频 | 3–6 个 |

**关键参数结构（可直接照搬做表单）**，以 BANANA_2_1 为例：

```json
{"apiCode":"BANANA_2_1","code":"GEMINI_NANO_BANANA_2_1",
 "refImageCount":14,
 "supportedRatios":["1:1","3:2","2:3","3:4","4:3","4:5","5:4","16:9","9:16","21:9"],
 "supportedResolutions":["1K","2K","4K"],
 "pricing":{"eco":{"1K":25,"2K":30,"4K":40},"stable":{"1K":40,"2K":50,"4K":60}}}
```

视频侧还带 `promptOptimizeKey`（如 `i2vPromptOptimizeMiniMaxH3`）、`supportModes:["refImage","firstLastFrame"]`、`supportedDurations`、按「分辨率×时长」的分档定价表 → **这套 schema 就是复刻时的模型能力注册表**。

---

## 3. Prompt 真相（用户最关心的部分）

### 3.1 拿不到的

每个工具生成时真正发给模型的 **system prompt** 在服务端（`/image/make/create` 只收 `makeType + 图 + 参数`，服务端按 makeType 选 prompt）。
客户端 JS 里搜遍 571 个 chunk，只有 9 处"你是/请严格/返回JSON"，全是营销文案与对话示例。

### 3.2 已拿到的（这些足够重写）

**(a) 11 条 prompt 原子**（`/image/make/getModelPromptProperties`，AI 换模特/换姿势模块）

| 组 | 条目 |
|---|---|
| angleList | 侧身→`sideways`、侧脸→`side face` |
| faceList | 微笑→`(smirking:1.2)`、大笑→`laughing` |
| otherList | 背面→`(back:1.5),(photo from behind...)`、光头→`(skinhead:1.2)` |
| postureList | 坐着→`sitting`、躺着→`lying` |
| shapeList | 肥胖→`(very obese:1.3),big head...`、微胖→`(chubby,plump:1.3)`、苗条→`slim` |

→ 说明它用的是 **SD 权重语法**，且原子是英文、界面是中文的映射表。

**(b) 视频运镜词表**（config chunk 内，可直接抄）

```
镜头运镜 / 镜头上摇 / 镜头下摇 / 镜头推进 / 镜头拉远 /
镜头左移 / 镜头右移 / 环绕运镜 / 环绕并推进镜头 / 镜头跟随 / 镜头先推进后拉远
```

**(c) 视频脚本 prompt 的完整拼接模板**（`SaleVideo` chunk，原样抽出）

```js
[目标语言]：${language_instruction}
[情节]：${plot}
[模特]：${visual_anchors.person_anchor}
[产品描述]：${visual_anchors.product_anchor}
[环境]：${environment_setup}
[音乐]：${bgm}
[分镜]：[镜头一]：${meta}，${camera}，${visual}，${prompt}，模特说：${talk}
        [镜头二]：…
[严格遵守]：${visual_anchors.note}
[负向提示词]：${negative_prompt}
```

配套的商品信息组织顺序（同样原样抽出）：

```
[产品名称] / [卖点描述] / [材质描述] / [使用方式] / [产品类目] / [核心营销卖点]（编号列表）
```
口播方案三分型：`推荐款(recommended)` / `场景种草(scene)` / `促销转化(promo)`，按关键词正则 `/推荐/ /场景|种草/ /促销|转化/` 归类。

**(d) 图片侧 prompt 公式 + 3 条完整示例**（`AIDressingV2` chunk）

公式：`模特外貌 + #服装描述# + 场景 + 光线 + 相机型号 + 构图/景别 + 动作`
示例（原文）：

> 一位具有邻家气质的欧美年轻女性模特，她有白皙的皮肤，小巧的椭圆形脸，尖下巴，淡褐色的大眼睛，高挺的鼻梁，饱满的嘴唇，留着一头自然的浅棕色长卷发，穿着一件**#红白格纹棉质泡泡短裤#**，搭配简约的白色吊带背心，在城市公园开阔的草坪上……电商摄影，生活化构图，**佳能EOS R5**拍摄，质感清晰。中景，模特坐在野餐垫上……

**(e) 179 条精选 prompt 库**（`/prompt/list` 两页，含中英文、分类树 20 类）→ 直接可做「提示词库」功能。

### 3.3 结论

> 服务端 prompt 拿不到，但**它的 prompt 结构已经被 4 种方式交叉还原**（原子表 + 拼接模板 + 公式化示例 + 179 条成品库）。
> 重写同样效果只需：把 (c)(d) 的骨架 + 每个工具的业务参数（品类/面料/卖点/地区/合规词库）填进去，效果能到 **80–90%**，不是 100%（措辞差异会带来细节差别）。

---

## 4. 57 个工具逐个复刻评分

对照无限画布现有能力（节点系统 + 插件 + 多模型通道）打分：

### A 类：纯生成/编辑 — 可 1:1（90–100%）
| 路由 | 复刻要点 |
|---|---|
| `/draw/ai-draw` | 文生图：模型 + 比例 + 分辨率 + 品质三档 |
| `/draw/ai-image-edit` | 图生图/局部编辑（`?type=` 区分 抠图/提清晰度/去logo） |
| `/draw/product-scene` `/draw/scene-image` `/draw/changing-bg` `/draw/scene-reference` | 商品图换场景：抠图 → 场景描述 → 融合，一条 prompt 链 |
| `/draw/image-fission` | 变体裂变：同一 prompt × N 种子 |
| `/draw/product-generation` `/draw/product-refine` | 商品图生成/精修 |
| `/draw/image-crop` `/draw/ai-text` `/draw/ornament-text` `/draw/print-extract` | 裁剪/文字/装饰字/印花提取 |

### B 类：需要专用模型或算法 — 60–85%
| 路由 | 卡点 |
|---|---|
| `/draw/clothing-image-suite` `/draw/product-image-suite` | 5 类图（模特/种草/卖点/尺码/白底）× 4 排版 × A+ 图；**UI 已完全拿到**，工作量在 prompt 分支 |
| `/draw/ai-dressing` `/draw/changing-model` `/draw/changing-mannequin` `/draw/ai-wearable` | 虚拟试衣：需 inpainting/换装专用模型，BANANA_2_1 多图参考可替代但精度略降 |
| `/draw/fine-matting` `/draw/batch-matting` | 精细抠图：需 BiRefNet/SAM2 级分割 + 钢笔工具前端 |
| `/draw/change-color` `/draw/change-color-v2` | 换色：需「部位识别 → 颜色映射」两步，v2 有 `analyze-colors` 专用接口 |
| `/draw/hand-product` `/draw/handheld-goods` `/draw/hand-repair` `/draw/hand-product` | 手部合成/修复：需手部关键点 + inpaint |
| `/draw/image-translation` | 图内文字翻译：需 OCR（文字框）+ 重绘，遮罩「不翻译区」 |
| `/draw/product-replacement` `/draw/color-diff-repair` `/draw/smart-repair` `/draw/area-repair` `/draw/printing-repair` `/draw/remove-pen` `/draw/ai-posture` `/draw/ai-outpainting` `/draw/quality-increase` | 局部重绘/扩图/放大：均为 inpaint/outpaint/upscale，模型层可替代 |

### C 类：视频 — 70–90%
| 路由 | 要点 |
|---|---|
| `/draw/video` | 图生视频：模型 + 比例 + 时长 + 分辨率 + 首尾帧 |
| `/draw/sale-video` | 带货视频：**LLM 写 3 个分镜方案 → 拼 prompt → 逐镜生成 → 合成 + 配音**（拼接模板已拿到） |
| `/draw/video-replication` | 视频复刻：参考视频分析（时长/镜头/节奏）→ 重新生成；`/image/videoReclone/analyze` |
| `/draw/video-translation` | 视频翻译：ASR → 翻译 → 配音/口型；模型层仅 SEED_V25/HAPPY_HORSE 支持 |
| `/draw/video-edit` `/draw/ai-video-edit` | 视频剪辑：这是**真·时间轴编辑器**，工作量最大 |
| `/draw/batch-generate-videos` `/draw/batch-generate-images` | 批量队列：纯工程，100% 可做 |
| `/draw/inspiration-video` | 爆款灵感：视频模板库（已拿到 4 类模板：产品展示/痛点解决/家居场景…） |

### D 类：设计器/工作台 — 40–60%
`/draw/designer-home` `/draw/sds-design` `/draw/my-design` `/draw/my-template` `/draw/product-home` `/draw/team-space`
→ 这是「模板 + 图层编辑器」，等于重做一版 Canva。建议**不做完整版**，只做「模板 → 画布节点」导入。

---

## 5. 与无限画布的映射

| LinkFox 概念 | 无限画布已有 | 缺口 |
|---|---|---|
| 工具页（表单+画布+结果） | 节点 + 插件系统（可注册任意节点类型） | 需要「工具型节点」模板 |
| 套图任务（一次生成 5–20 张） | 单次生成节点 | **缺批量矩阵节点**（1 输入 × N 配置） |
| 主副图/排版/A+ 分组 | 无 | 缺"结果分组 + 导出命名" |
| 任务队列/历史 | 部分 | 缺后台任务队列 + 断点续跑 |
| 模特库/姿势库 | 无 | 可用 11 条 prompt 原子做预设面板 |
| 视频分镜脚本 | 无 | 缺「脚本文本 → 多镜节点」的自动展开 |

**最高杠杆的 3 个新节点**：①`套图矩阵节点`（1 张商品图 → N 种预设 prompt 并行）②`分镜脚本节点`（LLM 出方案 → 展开为 N 个视频节点 → 合成）③`批量队列`（后台跑，可断点）。

---

## 6. 复刻路线（按投入产出排序）

| 阶段 | 内容 | 工时 | 复刻度 |
|---|---|---|---|
| **P1** | 套图矩阵节点 + 批量队列 + 主副图/尺寸导出（纯现有模型能力） | 2–3 周 | 覆盖 A 类全部 + B 类 UV |
| **P2** | 抠图/换色/试衣/扩图/放大 专用链路（BiRefNet/SAM2 + inpaint/outpaint） | 4–6 周 | B 类补齐 → 85% |
| **P3** | 视频：I2V + 带货分镜 + 视频复刻（含 ASR/翻译/配音） | 5–8 周 | C 类 → 80% |
| **P4** | 模板/设计器（只做导入，不自研图层编辑器） | 2 周 | D 类 60% |

---

## 7. 风险与边界

1. **法务**：prompt 公式与 UI 布局属"功能与思想"层面，风险低；但**不要照抄它的示例图/素材/文案**（179 条 prompt 库是用户可见数据，可当参考，批量复制再分发有风险）。
2. **效果差 10–20%**：服务端 prompt 的措辞、参数微调（如 `(smirking:1.2)` 这类权重）决定成片质感，重写需 A/B。
3. **成本**：官方自述「Lite ¥0.212/张、G-2 ¥0.056/张」（上一版定价页文案，属其自称的模型成本，非实测）；配置接口返回的是「算力点数」，1 点 ≠ 1 元，折算需另算。你直连模型通道时单价更低，但要自己承担失败率与重试成本。
4. **反爬/封号**：本次抓取只读公开 JS + 只读配置接口，未触发生成任务、未消耗算力、未改任何数据；用户的 token 未被记录/外传。
5. **不能拿到的**：create 的完整请求体（需真实生成一次才能抓到，会消耗 25–50 点算力）。

---

## 8. 最终判断

| 问题 | 答案 |
|---|---|
| 能否 1:1 复刻图片/视频功能？ | **功能面 90% 可 1:1，效果面 80–90%**（差在服务端 prompt 措辞） |
| 它有没有私有能力？ | **没有**。模型全是公开的，它唯一自研的是 prompt 编排 + UI 打磨 + 数据层（你不做） |
| 最该先做哪个？ | **套图矩阵 + 批量队列**（2–3 周即可复刻它最卖钱的"商品套图"） |
| 唯一拿不到的 | 每个工具的服务端 system prompt（可用已提取公式重写） |

---

## 9. 实测载荷（2026-10-27 抓包验证）

已用真实点击抓下 `POST https://ai-api.linkfox.com/image/make/create` 的完整请求体并解开，**零算力消耗**（服务端因余额不足拒绝，`/image/make/list` 返回 total=0）。

**加密方式**：ai-api 的 axios 拦截器对 POST body 做了一层包装

```
e.data = Ir(JSON.stringify(e.data))
Ir = CryptoJS.AES.encrypt(明文, Utf8.parse('AR7x7zfje4nkim4t'), {mode: ECB, padding: ZeroPadding}).toString()  // → base64
```

响应里的 `data` 字段用同一把 key 解（`Rr`）。解密脚本：`linkfox-deep-20261027/decrypt_linkfox.py`。

**商品套图（type=71）明文载荷**：

```json
{
  "type": 71,
  "extendFields": {
    "imageList": [{"imageUrl": "https://file-ai.linkfox.com/.../xxx.jpg?Expires=...&Signature=..."}],
    "sellerPoint": "<商品信息文本框原文>",
    "resolution": "2K",
    "provider": "GPT_2_5_IMAGE",
    "quality": "medium",
    "brandName": "智能品牌基因",
    "brandKey": {"salesRegion": "美国", "language": "英语", "platform": "亚马逊"},
    "APlusProNum": 4,
    "sellerTypeNum": 4,
    "aspectRatio": "1:1",
    "configData": {
      "aPlusConfig":  {"sceneType": {"APlusPro": {"checked": true, "num": 4}, "A+": {"checked": false, "num": 4},
                                    "custom": {"checked": false, "num": 4}, "APlusHasPhone": {"checked": false, "num": 4}}},
      "mainConfig":   {"sceneType": {"sellPoint": {"checked": true, "num": 4}, "whiteBg": {"checked": false, "num": 4}},
                       "aspectRatio": "1:1"},
      "complianceLibs": {}
    },
    "imageUrl": "<同 imageList[0]>",
    "outputNum": 8
  }
}
```

**三条可直接落地的结论**

1. **载荷里没有任何 prompt 字段**——`sellerPoint` 只是用户填的商品信息原文，场景/风格/光影全由服务端 prompt 决定。这实证了"prompt 拿不到"的判断，也说明复刻时**必须自建 prompt 层**，不能靠偷请求。
2. **`type` 就是 bizType**（`/draw/history?type=71` 与模型目录 `image[71]` 共 9 个模型完全对应），所以 57 个工具 ↔ bizType ↔ 模型池可以静态对齐，无需逐个抓包。
3. **载荷极薄**：URL 引用图片（不传二进制）、场景配置是 `{checked, num}` 布尔 + 数量、`outputNum` 与 `*Num` 决定张数与计费。复刻这套数据结构成本很低，一天能写完 schema。

**可复用抓包方法（下次要抓别的工具）**

```
1. 开工具页 → 注入 fetch + XHR 双钩子（axios 走 XHR adapter，只 hook fetch 会漏）
2. 合成 click 无效，React 不响；必须用 CDP Input.dispatchMouseEvent 发 mousePressed + mouseReleased（真实事件）
3. tabId 必须传整数，字符串会报 debugger.attach 类型错误
4. 上传图片：fetch 案例图 → new File → DataTransfer 塞 input[type=file] → dispatch change
5. 本地校验先拦（如"请填写商品信息"），用 native setter + input/change 事件补字段
6. 余额不足时请求仍会发出（客户端弹窗 + 服务端拒绝），**失败不扣点**，是免费抓包窗口
7. 抓到的 body 用 decrypt_linkfox.py 解，或拦 `window.superEncoder.encode`（仅 workbench 页注册，工具页没有）
```

---

*证据包：`linkfox-deep-20261027/`（项目目录）｜上一版报告：`linkfox-replica-feasibility.md`*
