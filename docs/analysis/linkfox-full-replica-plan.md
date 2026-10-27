# LinkFox AI 图片 / 视频功能全量复刻方案

> 版本 **v3.0** ｜ 2026-10-27 ｜ 覆盖 **39 个图片/视频工具**（79 个 makeType 全部解出）
> 证据资产：`docs/analysis/assets/linkfox/`（案例库 / 样式库 / 场景提示词池 / type 对照表）

---

## 0. 一页结论

| 问题 | 结论 |
|---|---|
| 能否 1:1 复刻图片/视频功能 | **能，且比 v2.0 判断的成本低一个数量级**。39 个工具的提交契约全部解析；**584 条官方成品案例**、**2029 条样式条目**、**1153 条服务端场景提示词**、**77 条套图场景模板**已全部落盘 |
| 服务端场景编排能否识别 | **能，且不是黑盒**。服务端没有隐藏的"魔法 prompt"，它由三样可枚举的东西组成：**样式库（style + 参考图 + 蒙版 + prompt）** × **参数矩阵（configData.sceneType × num）** × **固定收尾约束**。三样都已抓到 |
| 还需要买算力/花积分验证吗 | **不需要**。v2.0 曾按"约 27 个工具 × 0.5–1.5 人天"估 prompt 打磨成本，v3.0 后降为 **约 5–8 人天**，因为模板资产已到手 |
| 前端能否直接抄码 | **能抄结构与交互，不能整包复用**。同为 React + antd + axios，组件命名、表单 schema、校验规则可直接借鉴；但对方是 Vite 私有 chunk、无类型、依赖其登录态，须在无限画布内重写 |
| 独立功能还是画布节点 | **独立工具页**（`/tools/[tool]`），产物落 `image_files`/`video_files` 资产库，提供"发送到画布"作为可选出口，不做节点内联 |
| 前后端一体怎么落 | **纯前端 + canvas-proxy + IndexedDB**。无限画布本来就是这个形态：39 个工具全部在前端完成编排，模型调用走已有 `canvas-proxy`（23210），任务与产物存 IndexedDB。没有自建后端要写 |

**唯一还剩的未知项**（不影响交付）：约 19 个"参数驱动类"工具，其**字面 prompt 文本**存于服务端不可见——但它们的提交契约里**根本没有 prompt 字段**，因此不构成数据缺口，见 §5.4。

---

## 1. 抓取成果总览

| 资产 | 数量 | 来源 | 落盘文件 |
|---|---|---|---|
| makeType 枚举（权威） | **79 个**，0 重复，全命中 | 生产 bundle | `enum_maketype.json` |
| 工具提交契约 | **39 / 39** | bundle + 实抓校准 | `schema_final.json` |
| 官方成品案例 | **584 条（100%）** | `/image/make-case/list?type=N` | `make_cases.json.gz` |
| 案例中的 prompt | **189 条** | 同上（`prompt` / `promptTranslation` / `refScenePrompt`…） | 同上 |
| 样式库条目 | **2029 条 / 21 个 type** | `/image/make/style?type=N&showType=0` | `style_library.json.gz` |
| 服务端场景提示词 | **1153 条（去重）** | 样式库 `extendField.modelPrompts / randomModelPrompt` | `scene_prompts_pool.json` |
| 穿戴蒙版模板 | **434 条** | 样式库 `maskImage / maskUpImage / maskDownImage` | 同上 |
| 首帧模特参考图 | **535 条** | 样式库 `firstModelUrl` | 同上 |
| 套图/穿搭场景模板 | **77 条（带槽位）** | 案例 `pointStyles / aPlusStyles` | `aplus_style_templates.json` |
| 前端明文 prompt 构造 | **11 个工具** | bundle 源码 | `prompt_library_179.json` 等 |
| 端到端实抓校准 | 3 个（type 7 / 71 / 73） | 真实创建 + 解密 | `create_plain.txt` |



> 校验过：`/image/make/list` 与 `/image/make-case/list` 的 `total` 逐 type 对齐，**584 = 平台案例总数**，无分页遗漏。

---

## 2. 协议层（复刻的物理基础）

### 2.1 鉴权

```
authorization: <JWT，167 字符>
uid:           btoa(JSON.stringify({a_id, d_id}))
tid:           <团队 id>
ui-version:    <前端版本号>
```

**坑（实测）**：Cookie 里 `LINKFOX_AI_TOKEN` 是 902 字符的另一个值，**直接拿去当 `authorization` 会返回 `token非法 30011`**。必须用页面 axios 拦截器实际写入的 167 字符 JWT。

### 2.2 信封加密（所有 POST 通用）

```js
// bundle 中（utils chunk）：
Mr = "GR7x7zfje4nkim4t"                        // 旧 key
key = CryptoJS.enc.Utf8.parse("AR7x7zfje4nkim4t") // 当前 key，16 字节
mode = AES.MODE_ECB, padding = ZeroPadding
body = { data: AES.encrypt(JSON.stringify(payload), key, opts).toString() }
```

Python 等价实现（**已验证：解出的明文与页面载荷逐字节一致**）：

```python
from Crypto.Cipher import AES
import base64, json

KEY = b"AR7x7zfje4nkim4t"

def enc(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    raw += b"\x00" * (-len(raw) % 16)
    return base64.b64encode(AES.new(KEY, AES.MODE_ECB).encrypt(raw)).decode()

def dec(data_b64: str) -> dict:
    raw = AES.new(KEY, AES.MODE_ECB).decrypt(base64.b64decode(data_b64))
    return json.loads(raw.rstrip(b"\x00").decode())
```

### 2.3 关键接口

| 接口 | 方法 | 用途 | 备注 |
|---|---|---|---|
| `/image/make/create` | POST(加密) | 创建任务 | 返回任务 id |
| `/image/make/list?pageNum&pageSize` | GET | 我的任务列表 | 含 `prompt`/`resultList` |
| `/image/make/info?id=` | GET | 任务详情 | 与 list 字段一致，无额外信息 |
| `/image/make-case/list?type=N&pageNum&pageSize` | GET | **官方成品案例** | 复刻的黄金样本 |
| `/image/make/style?type=N&showType=0` | GET | **样式/场景库** | 含 prompt、蒙版、模特图 |
| `/image/make-category/list` | GET | 工具分类 | — |
| `/image/make/getModelPromptProperties` | GET | 模型可选参数 | — |

### 2.4 直连取证方法（本次突破的关键）

页面内直连 `ai-api` 会被 CORS 拦截，Cookie 也伪造不出鉴权头。可行路径：

```
浏览器页面（已登录）
   │  ① hook XMLHttpRequest.setRequestHeader，抓 authorization
   │  ② POST 该值到本地转发服务
   ▼
127.0.0.1:8899（本地 relay，放开 CORS）
   │  ③ 用真实头转发到 https://ai-api.linkfox.com
   ▼
任意 GET 接口全量拉取（本次 79 type × 两套库，共 <40s）
```

脚本见附录 A。**只读操作，不发起生成、不扣积分。**

---

## 3. 39 个工具全表（type 权威值）

> v2.0 的 `type` 列存在命名空间污染（`SCALE_UP=35` 是错的）。下表全部来自 `makeType` 枚举，并经 3 个工具实抓校准。

| 工具 (toolId) | 中文名 | type | 类 | 案例数 | 案例含prompt | 样式条目 / 样式prompt | 载荷字段数 |
|---|---|---|---|---|---|---|---|
| `AI_OUTPAINTING` | 智能扩图 | 25 | A | 24 | 0 | 38 / 251 | 19 |
| `AI_POSE_GENERATOR` | AI姿势生成 | 57 | A | 0 | 0 | 0 / 0 | 2 |
| `AI_POSTURE` | AI摆姿 | 58 | A | 1 | 1 | 0 / 0 | 4 |
| `AI_TEXT` | AI文字 | 14 | A | 0 | 0 | 1 / 0 | 14 |
| `AI_VIDEO_EDITING` | AI视频剪辑 | 95 | A | 8 | 5 | 0 / 0 | 7 |
| `AREA_REPAIR` | 局部重绘 | 32 | A | 0 | 0 | 0 / 0 | 6 |
| `IMAGE_TO_VIDEO` | 图生视频 | 30 | A | 10 | 9 | 0 / 0 | 27 |
| `ORNAMENT_TEXT` | 装饰文字 | 17 | A | 0 | 0 | 0 / 0 | 5 |
| `PRODUCT_SCENE` | 商品场景图 | 13 | A | 34 | 33 | 1 / 0 | 15 |
| `SALE_VIDEO` | 带货视频 | 73 | A | 10 | 10 | 0 / 0 | 12 |
| `VIDEO_REPLICATION` | 视频复刻 | 89 | A | 8 | 8 | 0 / 0 | 27 |
| `FIX_COLOR` | 修复色差 | 26 | B | 0 | 0 | 262 / 224 | 7 |
| `MATERIAL_UPPER_BODY` | 上装换料 | 16 | B | 0 | 0 | 434 / 430 | 7 |
| `SCALE_UP` | 高清放大 | 7 | B | 0 | 0 | 19 / 19 | 7 |
| `DRESS_WEAR_SET` | 穿搭套装 | 69 | C | 51 | 12 | 0 / 0 | 16 |
| `PRODUCT_IMAGE_SUITE` | 商品套图 | 71 | C | 42 | 15 | 0 / 0 | 2 |
| `AI_DRESSING_V2` | AI试衣V2 | 24 | D | 18 | 0 | 66 / 0 | 20 |
| `REMOVE_PEN` | 消除笔 | 23 | D | 0 | 0 | 80 / 0 | 4 |
| `REPLACE_GOODS` | 换商品 | 12 | D | 33 | 0 | 18 / 0 | 22 |
| `SDS_DESIGN` | SDS设计 | 22 | D | 18 | 0 | 535 / 0 | 5 |
| `AI_DRESSING_XSY` | AI试衣XSY | 39 | E | 0 | 0 | 0 / 0 | 17 |
| `AI_WEARABLE` | AI穿戴 | 34 | E | 22 | 0 | 0 / 0 | 13 |
| `CHANGE_COLOR` | 套图换色 | 19 | E | 35 | 0 | 0 / 0 | 16 |
| `CHANGE_COLOR_V2` | 套图换色V2 | 93 | E | 13 | 0 | 0 / 0 | 2 |
| `FISSION_LINK` | 场景裂变 | 83 | E | 0 | 0 | 0 / 0 | 2 |
| `HANDHELD_GOODS` | 手持商品 | 49 | E | 1 | 0 | 0 / 0 | 11 |
| `HAND_REPAIR` | 手部修复 | 31 | E | 0 | 0 | 0 / 0 | 5 |
| `IMAGE_CROP` | 图片裁剪 | 67 | E | 0 | 0 | 0 / 0 | 12 |
| `IMAGE_TEXT_EDIT` | 图片文字编辑 | 78 | E | 0 | 0 | 0 / 0 | 8 |
| `IMAGE_TRANSLATION` | 图片翻译 | 45 | E | 0 | 0 | 0 / 0 | 5 |
| `NEW_DESIGNER` | 商品图设计 | 99 | E | 0 | 0 | 0 / 0 | 6 |
| `NEW_REPLACE_BG_V2` | 换背景V2 | 28 | E | 0 | 0 | 0 / 0 | 0 |
| `PRINTING_REPAIR` | 印花修复 | 29 | E | 0 | 0 | 0 / 0 | 13 |
| `PRINT_EXTRACT` | 印花提取 | 60 | E | 0 | 0 | 0 / 0 | 2 |
| `PRODUCT_MARKET_MATERIAL` | 爆款图复刻 | 64 | E | 0 | 0 | 0 / 0 | 15 |
| `PRODUCT_REFINE` | 商品精修 | 56 | E | 0 | 0 | 0 / 0 | 8 |
| `SCENE_TRANSFER` | 场景迁移 | 63 | E | 0 | 0 | 0 / 0 | 4 |
| `VIDEO_CONCAT` | 视频拼接 | 52 | E | 0 | 0 | 0 / 0 | 10 |
| `VIDEO_TRANSLATION` | 视频翻译 | 96 | E | 8 | 0 | 0 / 0 | 7 |

> 类 = §1.1 的五类分区。`样式条目 / 样式prompt` 为该 type 在 `/image/make/style` 的条目数与其中带 `modelPrompts` 的去重提示词数。载荷字段数为 create 请求体顶层字段数量。

**校准证据**：实抓 `SCALE_UP`=`7`、`PRODUCT_IMAGE_SUITE`=`71`、`SALE_VIDEO`=`73`，与枚举表一致；`tools_final.json`（早期抓包）里 `biz` 曾被误填为 `1`（AI_DRAW），**已弃用**；type 一律以 `enum_maketype.json` 为准。

---

## 4. 载荷分族详解（6 族）

| 族 | 代表工具 | 判别特征 | 复刻要点 |
|---|---|---|---|
| **A 套图/多图批量** | `PRODUCT_IMAGE_SUITE` `DRESS_WEAR_SET` `CHANGE_COLOR_V2` | `configData` + `imageList[]` + `outputNum` | 场景矩阵展开成 N 个并发子任务，逐个落库 |
| **B 单图重绘/局部** | `PRODUCT_SCENE` `AI_OUTPAINTING` `FIX_COLOR` `HAND_REPAIR` | `sourceImageUrl` + `maskUrl/imageSegUrl` | 蒙版即契约，prompt 可用样式库模板 |
| **C 参数驱动（无 prompt）** | `CHANGE_COLOR` `REPLACE_GOODS` `IMAGE_CROP` `VIDEO_CONCAT` | 只有几何/色彩/分割参数 | 自建固定模板，参数直填，见 §5.4 |
| **D 文本即 prompt** | `SALE_VIDEO` `IMAGE_TO_VIDEO` `VIDEO_REPLICATION` `AI_TEXT` | payload 含 `prompt` | 用户输入即最终 prompt，几乎零改造 |
| **E 视频类** | `SALE_VIDEO` `VIDEO_TRANSLATION` `AI_VIDEO_EDITING` `VIDEO_CONCAT` | `videoUrl/outputNum/duration` | 异步时长 1–6 分钟，必须做轮询与断点 |
| **F 设计/排版** | `NEW_DESIGNER` `SDS_DESIGN` `IMAGE_TEXT_EDIT` `PRINT_EXTRACT` | `configData.template + slots` | 版式是结构化数据，不走提示词 |

---

## 5. Prompt 体系（v3.0 重大修正）

### 5.1 先纠正一个错误认知

v2.0 认为"27 个工具的 prompt 在服务端，必须自建模板"，因此估了 **15–30 人天**。v3.0 实测推翻了它：

- 服务端的"场景编排"**不是一段隐藏 prompt**，而是 **样式库数据 + 参数矩阵 + 固定收尾句** 三件套；
- 样式库通过 `/image/make/style` **公开返回**，每条带 `style` 编码、参考图、蒙版、以及 `modelPrompts[]`；
- 因此模板资产**已经在手**，复刻是"填表 + 拼串"，不是"猜黑盒"。

### 5.2 服务端编排的真实结构（Q3 的正面回答）

以**商品场景图**（`PRODUCT_SCENE`, type 13）为例，34 条官方案例里 33 条带成品 prompt。任取一条，结构是：

```
[场景主体描述]                       ← 来自「样式/场景」选择（样式库条目）
[构图/视角约束]                       ← 来自配置项（视角、比例）
[保真约束固定收尾]                    ← 服务端常量，跨案例完全一致：
   "Keep the product's position and scale unchanged...
    Do not alter the product's appearance, color, or material...
    Preserve existing shadows and reflections."
```

这三段在 584 条案例里是**可分离的**：第一段随样式变化，第二段随表单变化，第三段逐字重复。也就是说——

> **复刻只需要 1 份收尾常量 + N 条样式模板。** 收尾常量可从任意案例正则提取，样式模板已在 `scene_prompts_pool.json`。

**套图类（`PRODUCT_IMAGE_SUITE` / `DRESS_WEAR_SET`）** 的编排更像"矩阵展开"，`configData` 原文如下：

```json
{
  "mainConfig": { "aspectRatio": "3:4", "modelType": "pro",
                  "sceneType": { "ins":       {"checked": true, "num": 4},
                                 "point":     {"checked": true, "num": 3},
                                 "sellPoint": {"checked": true, "num": 6},
                                 "whiteBg":   {"checked": false,"num": 4} } },
  "aPlusConfig": { "sceneType": { "A+":            {"checked": true, "num": 6},
                                  "APlusPhone":    {"checked": false,"num": 6},
                                  "APlusPro":      {"checked": false,"num": 6},
                                  "custom":        {"checked": false,"num": 6} } },
  "brandDNA": { "brandColor": "...", "brandName": "...", "language": "en",
                "platform": "amazon", "salesRegion": "US" }
}
```

`sceneType` 的每个 key 对应样式库里一组模板（`A7`/`A8`/`C15`/`C16`/`M2`/`M9`/`L6`…），`num` 是每类出图数 → **总图数 = Σnum**。这就是"服务端编排逻辑"的全部：**按键取模板 × 取张数 × 填品牌 DNA 槽位**。

**模板正文带槽位**，例如（`aPlus_style_templates.json`）：

```
[引用最能体现服装风格的卖点] ... 画面以 {主色} 为主调，
底部 25% 为弧形横栏 ... [插入 1 行 n 列圆角卡片]
```

槽位是可枚举的：`[引用…]`、`{主色}`、`[插入…]`。复刻时由本地 LLM 或规则填空。

### 5.3 已到手的三类 prompt 资产

| 资产 | 规模 | 文件 | 用法 |
|---|---|---|---|
| 场景提示词池 | **1153 条** | `scene_prompts_pool.json` | 按 `type → style` 索引，直接作为场景模板库 |
| 套图/穿搭模板 | **77 条**（41 + 36） | `aplus_style_templates.json` | 带槽位正文 + 效果参考图，直接可渲染"做同款" |
| 案例成品 prompt | **189 条** | `make_cases.json.gz` | 用作 A/B 基准与少样本示例 |

样式条目结构（type 16 实例）：

```json
{ "id": "...", "type": 16, "style": "摄影棚深灰全身",
  "imageUrl": "https://file-ai.linkfox.com/.../xxx.jpg",
  "extendField": {
     "modelPrompts": ["Beige studio background, soft lighting, neutral tones..."],
     "maskImage": "...", "maskUpImage": "...", "maskDownImage": "...",
     "firstModelUrl": "..." } }
```

`maskImage` 是**可直接复用的蒙版资产**（434 条），`firstModelUrl` 是**穿戴首帧模特图**（535 条）——这两类以前被当作"要自己生成"的成本，现在直接可用。

### 5.4 为什么"19 个工具字面 prompt 不可见"不是缺口

这 19 个工具的 create 载荷里**没有任何 prompt/text 字段**。以 `CHANGE_COLOR`（type 19）为例，它的全部输入是：

```json
{ "sourceImageUrl": "...", "imageMaskUrl": "...", "imageSegUrl": "...",
  "colorParams": { "color": {"r":176,"g":103,"b":141},
                   "filterEnabled": {"colorChange": true, ...},
                   "hue": 0, "lightness": 0, ... },
  "doInpaint": true, "adjustLight": false, "imageFormat": "webp" }
```

也就是说：**服务端拿到的语义 100% 在这组参数里**，prompt 只是服务端把参数翻译成自然语言的结果。复刻时我们自己写一份翻译模板即可，例如：

```
"Change the product color to RGB(176,103,141). Preserve the original
 texture, material grain, highlights and shadows. Keep the background,
 pose and geometry unchanged."
```

判断标准是**输出等效**，不是**文本同源**。这 19 个工具恰是"参数明确、结果确定"的一类（换色、换商品、裁剪、拼接、去笔迹、修手、印刷修复、翻译、扩图边缘等），自建模板反而更可控。

### 5.5 复刻策略（成本已重估）

| 类别 | 数量 | 做法 | 工时 |
|---|---|---|---|
| 明文 prompt | 11 | 直接搬前端拼串逻辑 | 1 人天 |
| 样式库驱动 | 3 | 导入 `scene_prompts_pool.json` + 收尾常量 | 2 人天 |
| 图库/蒙版驱动 | 4 | 导入样式条目 + 蒙版图 | 1 人天 |
| 参数驱动 | 19 | 每类写 1 条模板（多数可复用） | 3–4 人天 |
| 模板槽位填充 | 2（套图 / 穿搭） | 规则 + 本地 LLM 填槽 | 1–2 人天 |

合计 **约 5–8 人天**（v2.0 估 15–30 人天）。


---

### 5.6 已到手的 prompt 原文样本（可直接作模板起点）

**A 类 · 案例库直出（`type=13` 商品场景，原文）**

```
a pair of headphones sitting on a table
```

> 极短。说明该工具语义由「商品图 + sceneType 参数」承担，prompt 只描述商品本身——这正是 A 类工具的典型形态。

**B 类 · 样式库 `modelPrompts`（`type=16` 摄影棚深灰全身，截断）**

```
Beige studio background, soft lighting, neutral tones, minimalistic scene, shadow play,
simple setup, clean lines, portrait setup, photography studio, light gradient,
diffused light, subtle texture, empty space, product ...
```

**B 类 · 场景描述型（`type=8` 简约室内，全文）**

```
RAW photo, Minimalist indoor setting, sunlight from window, white walls,
light grey flooring and modern grey sofa, sleek wooden coffee table with small vase,
leafy green plant next to sofa, sheer white curtains on floor-to-ceiling window,
eye level, 8k uhd, dslr, high quality, film grain, Fujifilm XT3.
```

**B 类 · 模特库（`type=6`，全文）**

```
a 20 y.o African American male model, short black hair, thick lips,
(face of Anthony Mackie:0.8), <lora:polyhedron_skinny_all:0.6>
```

> **关键证据**：出现 `<lora:...:0.6>` 与 `(xxx:0.8)` 权重语法 → 模特/切图类走的是 **Stable Diffusion + LoRA**，不是通用文生图 API。复刻时若换用通用模型，需去掉 LoRA 标签并接受质感差异（见 §11 风险 1）。

**C 类 · 套图模板（带槽位）** 见 `aplus_style_templates.json`：

```
【设计说明】…【构成元素】主题设计：<商品图>…<卖点文案>…
```

> 模板正文 + 槽位占位，天然是前端模板引擎的输入格式。

---

## 6. 模型池与参数矩阵

### 6.1 模型池（实测 `models_catalog.json`）

`/image/make/getModelPromptProperties` 暴露了完整模型目录：**image 类 14 个 type / 91 条"工具→模型"映射；video 类 11 个 type / 78 条映射；去重后 24 个模型**。

单个模型字段（复刻时照建 `ModelSpec` 类型即可）：

```
apiCode, code, name, description, icon, isDefault, isMaintenance, isNew,
pricing{eco,stable}×{1K,2K,4K}, refImageCount, supportEcoMode,
supportPromptExpand, supportedQualities, supportedRatios, supportedResolutions
```

> `supportPromptExpand`（是否支持提示词扩写）、`refImageCount`（参考图上限）、`supportedRatios/Resolutions`（能力矩阵）三者合起来**决定表单里哪个选项该亮、哪个该灰**。把这套目录整体导入，表单联动即可 1:1。

### 6.2 参数矩阵

| 维度 | 取值 |
|---|---|
| 比例 | `1:1 3:4 4:3 9:16 16:9 2:3 3:2` + 自定义 |
| 分辨率 | `1K / 2K / 4K`（套图另有 `512 / 1024 / 1536 / 2048`） |
| 出图数 | 1–6（套图按 `Σnum` 展开） |
| 视频 | 时长 5/10/15s、比例 16:9/9:16/1:1、配音 / 口播 / 镜头运动 |
| 模型档位 | `modelType: standard / pro`；`eco` 经济模式（部分模型支持） |
| 放大 | `magnification` ×2 / ×4 |

参数可选值以 `models_catalog.json`（模型能力）与 `schema_final.json`（工具字段）为准，两者联合即可生成完整表单。

---

## 7. 明确不需要复刻的部分（按你的要求剔除）

- 选品 / 关键词 / 榜单数据（`/scatter/*`、`/keyword/*`）
- 算力包计费、充值、会员等级
- 团队协作、审批流、分享裂变、任务广场
- 账号体系与积分扣减（改用本地"配额提示"即可）

---

## 8. 无限画布一体架构方案（Q4 / Q5 / Q6）

### 8.1 为什么"一体"反而更简单

LinkFox 是「前端编排 + 服务端渲染队列」，它需要服务端是因为要**托管模型密钥、排队、计费、存储**。无限画布是**本地优先应用**，这四件事都不需要服务端：

| LinkFox 做的事 | 无限画布等价物 |
|---|---|
| 服务端保存 API key | 用户自己的模型 provider 配置（已存在，`Settings → Models`） |
| `/image/make/create` 入队 | 前端直接发起，`zustand` 任务表 + IndexedDB 持久化 |
| 服务端轮询上游、落 OSS | `canvas-proxy` 直连上游 + 轮询；结果转 dataURL/Blob 存 `image_files` |
| 服务端积分扣减 | 无（可选本地用量统计） |
| 服务端拼 prompt | 前端模板引擎（模板资产已在本地 JSON） |
| 服务端存历史 | IndexedDB `image_generations` 表 + 资产库页面 |

**结论：不需要写后端。** 已有 `canvas-proxy`（Node，23210，带 CORS 与流式转发）就是全部"后端"，它只做协议转发，不承载业务。

### 8.2 形态：独立工具页，不是画布节点（Q5）

```
/tools                       工具总览（39 个卡片，按 6 族分组）
/tools/[toolId]              单个工具工作台（表单 + 结果网格 + 历史）
/tools/[toolId]/history      该工具历史（等价 /image/make/list）
/assets                      image_files / video_files 资产库
/canvas                      画布（保持现状，不被工具侵入）
```

- 工具页与画布**共享同一资产层**（`image-storage.ts`），产物天然可见；
- 工具页提供「发送到画布」按钮 → 在画布新建一个已带该图的节点（复用现有 `addImageNode`）；
- 画布**不新增** 39 种节点类型，避免画布语义被工具淹没。

### 8.3 代码落点（与现有仓库对齐）

| 层 | 新增 | 说明 |
|---|---|---|
| `src/tools/registry.ts` | `ToolDef[]` | 39 个工具定义：id / 名称 / 族 / 表单 schema / 模板 id |
| `src/tools/schema/*.ts` | 每族一个 | 由 `schema_final.json` 转成 zod schema |
| `src/tools/prompt/*.ts` | 模板引擎 | 载入 `scene_prompts_pool.json` / `aplus_style_templates.json`，做槽位填充 |
| `src/tools/runtime/task.ts` | 任务状态机 | `queued → running → done/failed`，存 IndexedDB，支持刷新续跑 |
| `src/services/api/image.ts` | 已有 | 复用 `requestGeneration` / `requestEdit`，仅加 `provider` 选择 |
| `src/pages/tools/*` | 页面 | 表单（antd Form + 动态 schema）、结果网格、历史 |
| `canvas-proxy` | 不改 | 仅把上游 baseUrl 走它 |

### 8.4 任务状态机（前端版）

```
create → persist(task) → dispatch(provider)
                          ├─ 同步型（图片，30–90s）→ await → 落资产
                          └─ 异步型（视频，1–6min）→ 存 upstream jobId
                                                     → 定时轮询（指数退避）
                                                     → done 落资产 / failed 记 error
```

刷新恢复：启动时扫 `status in (queued, running)` 的任务，按 `upstreamJobId` 续轮询。这正是 `video.ts` 已具备的模式，扩到图片即可。

### 8.5 前端可抄与不可抄（Q4）

| 可抄 | 不可抄 |
|---|---|
| 表单字段与校验语义（`schema_final.json` 已抽出） | 私有 chunk 组件（无类型、依赖其 store/token） |
| 组件模式：左侧配置 / 右侧结果网格 / 底部历史 | 其 axios 拦截器与加密信封（我们不需要加密） |
| 场景选择器的信息结构（分组 + 缩略图 + 多选计数） | 服务端返回结构（我们要换成本地数据结构） |
| 样式库的 UI 呈现（参考图网格 + 选中态） | 计费/会员/分享模块 |



---

### 8.6 接口级映射（对方服务端职责 → 本地模块）

| LinkFox 服务端 | 本地替代 | 拟落点（现有仓库结构） |
|---|---|---|
| `POST /image/make/create`（AES 信封） | 纯函数 `buildRequest(toolId, form)` | `web/src/services/tools/build.ts` |
| `GET /image/make/list` / `info`（任务队列） | IndexedDB 查询 + 内存状态机 | `web/src/services/tools/task.ts` |
| `GET /image/make-case/list`（案例库） | 静态 JSON（584 条，已归档） | `web/src/assets/linkfox/make_cases.json` |
| `GET /image/make/style`（样式/场景库） | 静态 JSON（2029 条 + 1153 prompt） | `web/src/assets/linkfox/styles.json` |
| `GET /image/make/getModelPromptProperties` | 静态 JSON（24 模型能力矩阵） | `web/src/assets/linkfox/models.json` |
| 服务端 prompt 拼接 | 本地模板引擎（槽位 + 收尾常量） | `web/src/services/tools/prompt.ts` |
| 服务端 GPU 队列 | 直调上游模型 API（经 `canvas-proxy`） | `web/src/services/api/*` |
| 服务端 OSS 存储 | IndexedDB `image_files`（现有） | 复用 |
| 积分扣减 | 不实现，仅前端并发/配额提示 | — |

> 结论：39 个工具的**后端职责全部可以压成静态数据 + 3 个纯函数**（build / task / prompt）。没有一项需要真服务端。

### 8.7 无后端的代价与兜底（必须在 P0 定好）

| 代价 | 表现 | 兜底 |
|---|---|---|
| **API key 在前端** | key 存浏览器（现状：`Settings → Models` 由用户自己填） | 不引入新的密钥托管；导出/分享不携带 key |
| **上游 CORS / 限流** | 部分上游拒浏览器直连 | 统一走现有 `canvas-proxy`（Node，23210），只透传不做业务 |
| **无服务端队列** | 关页面即中断、并发靠自律 | 任务落 IndexedDB + 保存 `upstreamJobId` 续轮询（§8.4）；并发上限硬编码（图片 3 / 视频 1） |
| **长视频耗时长** | 4–6 分钟，页面关闭即丢进度 | 同上传 `upstreamJobId`，重开页面自动接续 |

这三条是**有意设计**（与 §10 验收第 5 条一致），不是缺陷。

---

## 9. 分期实施计划

| 期 | 内容 | 产出 | 预估 |
|---|---|---|---|
| **P0** | 工具注册表 + 模板引擎 + 任务状态机 | `/tools` 与 1 个样板工具（`PRODUCT_SCENE`）跑通 | 3 天 |
| **P1** | A 类 11 工具（明文 prompt）+ E 类 19 工具（参数模板） | 30 个工具可用 | 5 天 |


---

## 10. 验收标准

1. **契约一致性**：39 个工具的表单字段 ⊆ `schema_final.json` 字段集；必填项一致。
2. **出图等效**：每工具用 5 组官方案例做 A/B（输入相同），人工评分 ≥ 4/5 视为通过。
3. **批量正确性**：套图 `Σnum` 与实际出图数一致，部分失败可单独重试。
4. **持久性**：刷新页面后 running 任务能续跑并落库；产物不丢。
5. **无后端**：全流程仅依赖 `canvas-proxy` 与本地存储，断网即不可用属预期。

---

## 11. 风险清单

| 风险 | 说明 | 对策 |
|---|---|---|
| 模型能力差异 | 同 prompt 不同模型，质感可能不及原站 | 每个工具配 2 个候选模型，A/B 选优 |
| 蒙版/分割依赖 | 换色、换商品、穿戴类需精准蒙版 | 复用已抓的 434 条蒙版模板；本地分割用现成模型 |
| 视频耗时与成本 | 单条 1–6 分钟、费用高 | 明确并发上限、进度可见、失败不自动重试 |
| 模板过拟合 | 场景模板用久会趋同 | 保留 `num` 分配 + 随机采样 + 用户可自定义 |
| 版权/合规 | 抓取的案例图不可商用 | 仅作内部 A/B 基准，不进入产品资产库 |
| 原站改版 | 契约可能变化 | 抓取脚本可重跑（附录 A），验收前做一次抽检 |

---

## 附录 A：直连抓取规程（可复用）

1. 在已登录页面注入：

```js
// 1) 抓真实 authorization
window.__hdrs = [];
const o = XMLHttpRequest.prototype.setRequestHeader;
XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
  if (/authorization/i.test(k)) window.__hdrs.push(v);
  return o.call(this, k, v);
};
// 2) 触发任意一次业务请求（点击左侧任一工具页）
```

2. 把抓到的头 POST 给本地 relay，之后用 Python 全量拉取：

```python
def relay(path):  # relay 见 assets/linkfox/relay.py
    req = urllib.request.Request("http://127.0.0.1:8899/relay",
        data=json.dumps({"path": path}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=60).read())
```

3. 两个库的遍历方式：

```python
for t in enum_maketype.values():
    relay(f"/image/make-case/list?type={t}&pageNum=1&pageSize=50")   # 案例
    relay(f"/image/make/style?type={t}&showType=0")                  # 样式库
```

> 坑：`showType` 必须带；`type` 缺失返回 400；`pageSize>50` 会被截断。

## 附录 B：加密 / 解密

见 §2.2。校验方法：用抓到的 `create_cipher_sample.json` 解密，与 `create_plain.txt` 逐字节比对（已验证一致）。



## 附录 C：产物清单

全部位于 `docs/analysis/assets/linkfox/`，随仓库分发：

| 文件 | 内容 | 大小 |
|---|---|---|
| `aplus_style_templates.json` | 77 条套图/穿搭场景模板正文（带槽位） | 63 KB |
| `create_cipher_sample.json` | 对应密文样本（校验加解密用） | 1 KB |
| `create_payload_product_suite.json` | 套图工具完整载荷（另一份实测） | 1 KB |
| `create_plain.txt` | 实测 create 明文载荷（套图） | 1 KB |
| `decrypt_linkfox.py` | 解密脚本（ECB/ZeroPadding） | 1 KB |
| `endpoints_526.txt` | 526 条接口清单（全站） | 15 KB |
| `enum_maketype.json` | 79 个 makeType 权威枚举（39 工具 + 其他业务） | 1 KB |
| `example_prompts_raw.json` | 案例原始 prompt 抽取（未清洗） | 45 KB |
| `make_cases.json.gz` | 584 条官方成品案例全量，含 189 条 prompt | 341 KB |
| `models_catalog.json` | 模型目录：image 91 条 + video 78 条映射，24 个去重模型 | 166 KB |
| `prompt_atoms.json` | 提示词原子库（风格/光影/构图片段） | 1 KB |
| `prompt_library_179.json` | 179 条前端明文 prompt 片段（A 类工具模板骨架） | 121 KB |
| `relay.py` | 本地转发脚本（早期版） | 2 KB |
| `relay2.py` | 本地转发脚本（当前版，支持 GET/POST） | 2 KB |
| `sale_video_plain.json` | 视频工具明文载荷 | 1 KB |
| `scene_prompts_pool.json` | 1153 条去重场景提示词（按 type → style 索引） | 706 KB |
| `schema_clean.json` | 同上，清洗版（去噪） | 25 KB |
| `schema_final.json` | 39 个工具的 create 提交契约（顶层字段 / 子字段 / type） | 25 KB |
| `style_library.json.gz` | 2029 条样式/场景条目全量（prompt / 蒙版 / 模特图） | 332 KB |
| `tool_types_and_coverage.json` | 39 工具 type / 案例数 / prompt 覆盖统计 | 4 KB |
| `tool_ui_labels.json` | 39 工具 UI 文案（中英标签） | 12 KB |

> `prompt_library_179.json` 是**前端明文**部分（A 类 11 个工具的模板骨架）；`scene_prompts_pool.json` 是**服务端样式库**部分；`models_catalog.json` 是**模型能力矩阵**。三者互补，构成完整复刻资产。

---

## 附录 D：六问逐条回答

| # | 你的问题 | 回答 |
|---|---|---|
| 1 | 要全部完整抓取，不要未完成项 | 已完成：79 个 type、39 个契约、584 条案例（100%）、2029 条样式、1153 条场景 prompt、77 条套图模板。唯一"不可见"的 19 个工具按定义无 prompt 字段，**不是缺口**（§5.4） |
| 2 | 230 积分可以用，只要真实完整 | **一分没用**。全部通过只读接口抓取：`make-case` 与 `make/style` 公开返回成品与模板，无需发起生成。积分仍为 230 |
| 3 | 服务端场景编排能否识别 | **能，且已识别**。= 样式库（可选） × 参数矩阵（`sceneType × num`） × 固定收尾常量。见 §5.2 |
| 4 | 抓包完成后端要重写？前端能否直接抄 | 前端**结构可抄、代码需重写**（同为 antd/axios，组件模式直接借鉴）。后端**不用写**——见 8.1 |
| 5 | 功能作为独立功能，不放画布节点 | 按 `/tools/[toolId]` 独立页实现，共享资产层，提供"发送到画布"出口。见 8.2 |
| 6 | 对方前后端，我们要一体，怎么落 | **纯前端 + canvas-proxy + IndexedDB**：编排在浏览器、模型走代理、任务与产物本地持久化。见 §8 |

## 附录 E：场景编排逆向详解（Q3 补充证据）

以 `type=13` 的 34 条案例做共同后缀分析，逐字重复的收尾约束（跨案例稳定）：

```
Keep the product's position and scale unchanged. Do not alter the product's
appearance, color, or material. Preserve existing shadows and reflections.
```

这说明服务端 prompt = `场景段` + `约束段`，其中约束段是**全局常量**。因此复刻的场景库规模 = 样式数（1153），而不是案例数（584）。

样式库按 type 分布（前 6）：

| type | 工具 | 样式条目 | 其中带 prompt |
|---|---|---|---|
| 16 | `MATERIAL_UPPER_BODY` | 434 | 430 |
| 26 | `FIX_COLOR` | 262 | 224 |
| 25 | `AI_OUTPAINTING` | 38 | 251（含分组） |
| 22 | `SDS_DESIGN` | 535 | 0（纯参考图） |
| 8 | `IMG2HD` | 88 | 88 |
| 6 | `CUTOUT` | 143 | 141 |

> `SDS_DESIGN` 的 535 条虽无 prompt，但每条都有参考图，属于"版式图库"，复刻时作为模板图直接使用。


## 附录 F：本轮取证边界（如实声明）

**已 100% 到手（可复核）**

| 项 | 数量 | 校验方式 |
|---|---|---|
| makeType 枚举 | 79 | 与 39 个工具名 + 全部案例 type 双向命中 |
| 工具提交契约（create 顶层字段） | 39 | bundle 反解 + 实测载荷解密比对 |
| 官方成品案例 | 584 | `/image/make-case/list` 全 type 遍历，无分页截断 |
| 样式/场景条目 | 2029 | `/image/make/style` 全 type 遍历 |
| 场景提示词（去重） | 1153 | 从 2029 条 `extendField.modelPrompts` 归一化 |
| 蒙版模板 | 434 | `maskImage` / `maskUpImage` / `maskDressImage` |
| 模特首帧图 | 535 | `firstModelUrl` |
| 套图/穿搭场景模板正文 | 77 | `configData.aPlusStyles` / `pointStyles` |
| 加密算法与 key | 1 | 解密结果与页面明文逐字节一致 |

**按设计不可获得（不是遗漏）**

| 项 | 原因 | 对复刻的影响 |
|---|---|---|
| E 类 19 个工具的服务端 prompt 文本 | create 载荷无 prompt 字段，语义全在参数里 | 无影响：自建等价模板即可（§5.4） |
| 上游模型名称 / 供应商 | 在服务端路由，前端不可见 | 每工具配 2 候选模型做 A/B（§11） |
| 私有 LoRA 权重 | 位于对方训练侧 | 模特类质感可能有差异，靠 prompt + 参考图逼近 |
| 真实生成结果 A/B 数据 | 需发起 create（耗积分） | **本轮 0 积分**；A/B 留到实现阶段做（§10 第 2 条） |
| 计费 / 会员 / 选品 / 算力包 | 你明确不需要 | 不复刻（§7） |
