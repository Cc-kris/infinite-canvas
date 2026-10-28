# LinkFox V1.0 39 工具终局差距审计（独立复核，非自报）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 审计日期：2026-10-29
- 审计方式：**只读**。未重新生成、未付费调用、未修改源码/证据；仅新增本报告
- 本报告不沿用任何 `verdict: PASS` 自报结论，逐项回到证据文件取原始事实

---

## 1. 审计口径（什么算"通过"）

| 维度 | 通过判据 | 不接受的替代物 |
|---|---|---|
| 真实上游 200 | 证据目录内有该次调用的状态码记录，或响应体（b64_json / OSS URL / result_url） | 页面文案"生成成功"、截图 |
| 原始结果字节 | 本地留存可复算的媒体文件（PNG ≥ 300KB 且尺寸非视口尺寸 / mp4 可 ffprobe 出 duration） | 结果面板截图、OCR 文本 |
| 下载 | 结构化记录（`download={...ok:true, bytes}`）或被下载文件的落地字节数 | 按钮存在 |
| 存入资产 | 真实 assetId + 资产库可见记录 | 提示语"已存入" |
| 发送画布 | 真实 canvasNodeId / 画布节点计数 | 提示语"已发送" |
| 历史 | 我们侧历史面板有实测证据（非空任务或可复用的空态断言） | LinkFox 侧历史 DOM |
| 案例 | 我们侧实现"优秀案例/一键做同款"且有文案或交互证据 | LinkFox 侧文案 |
| 对照 | LinkFox 侧同工具页面的真实控件 DOM | JS chunk 字段名（只能证明字段集合） |

符号：`✓` 有实测证据 ｜ `◎` 强间接（响应体/URL 存在但未记录状态码）｜ `—` GAP ｜ `✗` 失败 ｜ `N/A` 不适用。**"原始字节"列只有 `✓` 才算产物可复用**，`—` 意味着该次结果已丢失，资产/画布无法在不重新付费的前提下补验。

### 证据基线
- 逐工具证据：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/<TOOL_ID>/`（39 个目录）
  - 34 个有 `result.json`；**5 个没有**：`FIX_COLOR`、`IMAGE_CROP`、`IMAGE_TEXT_EDIT`、`PRINTING_REPAIR`、`REMOVE_PEN`
- LinkFox 对照：`evidence/page-dom-20261028/`（26 个工具页真实 DOM；`FIX_COLOR` 抓到 404 页；`AI_TEXT`/`ORNAMENT_TEXT` 重定向首页；10 个只有 `supplemental_chunk_design`）
- 字段对照：`docs/analysis/assets/linkfox/schema_final.json` vs `web/src/features/tools/registry/*.ts`

---

## 2. 总体结论

**39 个工具里，独立复核后只有 8 个达到"真实可用"（出图/出片 + 核心动作全通）；20 个只到"部分"（有产物但动作或字节缺证）；1 个有功能缺陷；5 个被阻塞；5 个没有任何可信结果。**

| 结论 | 数量 | 工具 |
|---|---:|---|
| 可用 | 8 | DRESS_WEAR_SET、SCALE_UP、CHANGE_COLOR、AI_POSE_GENERATOR、AI_DRESSING_XSY、MATERIAL_UPPER_BODY、NEW_DESIGNER、PRODUCT_MARKET_MATERIAL |
| 部分 | 20 | PRODUCT_IMAGE_SUITE、CHANGE_COLOR_V2、AI_OUTPAINTING、AREA_REPAIR、HAND_REPAIR、NEW_REPLACE_BG_V2、PRODUCT_SCENE、HANDHELD_GOODS、AI_DRESSING_V2、AI_POSTURE、AI_WEARABLE、AI_TEXT、ORNAMENT_TEXT、SDS_DESIGN、PRINT_EXTRACT、FISSION_LINK、SCENE_TRANSFER、IMAGE_TO_VIDEO、VIDEO_TRANSLATION、VIDEO_CONCAT |
| 缺陷 | 1 | REPLACE_GOODS（上游出图后结果区静默清空） |
| 阻塞 | 5 | IMAGE_TRANSLATION、PRODUCT_REFINE、SALE_VIDEO、VIDEO_REPLICATION、AI_VIDEO_EDITING |
| 未验证 | 5 | REMOVE_PEN、IMAGE_CROP、PRINTING_REPAIR、FIX_COLOR、IMAGE_TEXT_EDIT |

关键修正（推翻自报 PASS 的地方）：
1. `AI_TEXT` / `ORNAMENT_TEXT` / `SDS_DESIGN` 自报 PASS，但**原始结果字节未留存**（只有 OCR 文本或结果面板截图），因此"存入资产/发送画布"无法在不退款重生成的前提下验证 —— `ORNAMENT_TEXT` 的 `result.json` 自己就写着 `assetSaved.status=BLOCKED, blockedBy=missing_real_bytes`。
2. `HANDHELD_GOODS` 自报 PASS，其 `result.json` 同时写着"故 下载/存入资产/发送画布 三个动作未能点击验证"。
3. `SCENE_TRANSFER` 自报 PASS，本地只有 `result_dom.json` 里的 OSS URL，**没有落盘字节**。
4. `IMAGE_TRANSLATION` 自报 BLOCKED 属实：`05-net.json` 里 `POST /v1/responses` 404、`POST /v1/chat/completions` 400。
5. 视频三兄弟（SALE_VIDEO/VIDEO_REPLICATION/AI_VIDEO_EDITING）失败根因同一：`create_status: 404`，上游 `/v1/videos` 在该通道不存在。

---

## 3. 逐工具矩阵

| # | 工具 | 中文 | 自报状态 | 上游200 | 原始字节 | 下载 | 存入资产 | 发送画布 | 历史 | 案例 | LinkFox侧证据 | 独立结论 |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `PRODUCT_IMAGE_SUITE` | 商品套图 | PASS(无status) | ◎b64 | ✓1024²/2.15MB | — | — | — | — | — | DOM | 部分 |
| 2 | `DRESS_WEAR_SET` | 服饰穿戴套装 | PASS verified | ✓ | ✓1024²/1.24MB | ✓ | ✓ | ✓ | — | — | DOM | 可用 |
| 3 | `CHANGE_COLOR_V2` | 改色V2 | PARTIAL | ✓round1 | ✓1024²/1.12MB | ✓1,115,668B | — | — | ✓01-task-history | — | DOM | 部分 |
| 4 | `IMAGE_TRANSLATION` | 图片翻译 | BLOCKED not_verified | ✗POST 404/400 | — | — | — | — | — | — | DOM | 阻塞 |
| 5 | `SCALE_UP` | 图片放大 | PASS verified_real | ✓ | ✓1024x752 | ✓1,152,074B | ✓AzmBB3Km3 | ✓ | — | — | DOM | 可用 |
| 6 | `AI_OUTPAINTING` | AI扩图 | PASS | ✓oss | ✓1024²/929KB | — | — | ✓canvasNodeId | — | — | DOM | 部分 |
| 7 | `AREA_REPAIR` | 区域修复 | PASS(无status) | ✓ | ✓1024²/943KB | ✓href | ✓U_TaBRV2 | — | — | — | DOM | 部分 |
| 8 | `REMOVE_PEN` | 去笔迹 | 无 result.json | ?502 | — | — | — | — | — | — | DOM | 未验证 |
| 9 | `CHANGE_COLOR` | 改色 | PASS | ✓ | ✓1024²/1.23MB | ✓ | ✓QJeDp9d | ✓画布新增节点 | 证据empty-state | — | DOM | 可用 |
| 10 | `IMAGE_CROP` | 图片裁剪 | 无 result.json | — | — | — | — | — | — | — | DOM | 未验证 |
| 11 | `PRODUCT_REFINE` | 商品精修 | 无status | ✗run502 | — | — | — | — | 证据empty-state | — | DOM | 阻塞 |
| 12 | `FIX_COLOR` | 颜色修正 | 无 result.json | — | — | — | — | — | — | — | 404页 | 未验证 |
| 13 | `PRINTING_REPAIR` | 印花修复 | 无 result.json | — | — | — | — | — | — | — | DOM | 未验证 |
| 14 | `HAND_REPAIR` | 手部修复 | PASS(无status) | ✓ | ✓1024²/1.35MB | — | — | — | — | — | DOM | 部分 |
| 15 | `NEW_REPLACE_BG_V2` | 换背景V2 | PASS verified | ✓ | ✓1024²/1.11MB | — | — | — | — | — | chunk-only | 部分 |
| 16 | `REPLACE_GOODS` | 替换商品 | PARTIAL | ✓ | ✓1254²/1.22MB | — | — | — | — | — | DOM | 缺陷 |
| 17 | `PRODUCT_SCENE` | 商品场景 | PASS | ◎ | ✓1024²/1.42MB | — | — | — | — | — | DOM | 部分 |
| 18 | `HANDHELD_GOODS` | 手持商品 | PASS | ◎ | ✓720x960/1.06MB | — | — | — | — | — | DOM | 部分 |
| 19 | `AI_DRESSING_V2` | AI换装V2 | PARTIAL | ◎ | ✓720x960/819KB | — | — | — | — | — | DOM | 部分 |
| 20 | `AI_POSTURE` | AI姿势 | PARTIAL | ◎ | ✓720x960/972KB | — | — | — | — | — | DOM | 部分 |
| 21 | `AI_WEARABLE` | AI穿戴 | PARTIAL | ◎ | ✓720x960/1.64MB | — | — | — | — | — | DOM | 部分 |
| 22 | `AI_TEXT` | AI文字 | PASS verified | ✓200+b64 | —仅OCR文本 | — | — | — | — | ✓ai-text.ts | 首页无DOM | 部分 |
| 23 | `ORNAMENT_TEXT` | 装饰文字 | PASS verified | ✓200+b64 | — | — | BLOCKED | BLOCKED | — | — | 首页无DOM | 部分 |
| 24 | `SDS_DESIGN` | 素材贴合 | PASS verified | ✓200+b64 | —仅截图 | — | — | — | — | — | DOM | 部分 |
| 25 | `PRINT_EXTRACT` | 印花提取 | PARTIAL | ✓ | ✓720x960/686KB | ✓url下载 | — | — | — | — | DOM | 部分 |
| 26 | `AI_POSE_GENERATOR` | AI姿势生成 | PASS real+actions | ✓ | ✓1024²/1.55MB | ✓ | ✓h3TVsX8D | ✓image-17 | — | — | chunk-only | 可用 |
| 27 | `AI_DRESSING_XSY` | AI换装XSY | PASS end2end | ✓ | ✓720x960/1.07MB | — | ✓WBaAYDKP | ✓image-1793 | — | — | chunk-only | 可用 |
| 28 | `FISSION_LINK` | 裂变链接 | PASS | ✓ | ✓1024²/1.67MB | ✓ | — | — | — | — | chunk-only | 部分 |
| 29 | `IMAGE_TEXT_EDIT` | 图片文字编辑 | 无 result.json | ◎oss(dom) | ✓1024²/845KB | — | — | — | — | — | chunk-only | 未验证 |
| 30 | `MATERIAL_UPPER_BODY` | 材质上身 | PASS real+actions | ◎ | ✓1024²/1.70MB | ✓ | ✓xJiPzZ | ✓kCkxO | — | — | chunk-only | 可用 |
| 31 | `NEW_DESIGNER` | 新设计师 | PASS(无status) | N/A本地合成 | ✓1200²/32KB | — | ✓ | ✓sha一致 | — | — | chunk-only | 可用 |
| 32 | `PRODUCT_MARKET_MATERIAL` | 商品营销素材 | PASS(无status) | N/A复用字节 | ✓970x600/703KB | — | ✓回执 | ✓同storageKey | — | — | chunk-only | 可用 |
| 33 | `SCENE_TRANSFER` | 场景迁移 | PASS verified | ◎oss | — | — | — | — | — | — | chunk-only | 部分 |
| 34 | `IMAGE_TO_VIDEO` | 图生视频 | 成功(无status) | ✓ | ✓mp4 1.30MB h264+aac | — | ✓byte-exact | ✗blocked_at_runtime | — | — | DOM | 部分 |
| 35 | `SALE_VIDEO` | 带货视频 | 失败 | ✗404 | — | — | — | — | — | — | DOM | 阻塞 |
| 36 | `VIDEO_REPLICATION` | 视频复刻 | PARTIAL frontend | ✗404 | — | — | — | — | — | — | DOM | 阻塞 |
| 37 | `AI_VIDEO_EDITING` | AI视频编辑 | 失败 | ✗404 | — | — | — | — | — | — | DOM | 阻塞 |
| 38 | `VIDEO_TRANSLATION` | 视频翻译 | PARTIAL | 未发起 | — | — | — | — | ✓历史面板0条 | — | DOM | 部分 |
| 39 | `VIDEO_CONCAT` | 视频拼接 | PARTIAL | 未发起 | — | — | — | — | ✓历史面板0条 | — | chunk-only | 部分 |

### 3.1 逐条 GAP 备注

- **1 商品套图**：出图可信；下载/资产/画布/历史/案例全无证据
- **3 改色V2**：只有下载有证；资产/画布GAP
- **4 图片翻译**：上游路由/参数不匹配，未出图
- **6 AI扩图**：画布有节点id；下载/资产无结构化证据
- **7 区域修复**：画布GAP
- **8 去笔迹**：目录仅 run*.json/截图
- **10 图片裁剪**：仅 run.json 截图
- **11 商品精修**：有一次 502，无结果字节
- **12 颜色修正**：LinkFox 侧页面本身 404
- **13 印花修复**：仅截图
- **14 手部修复**：出图✓，三动作GAP
- **15 换背景V2**：动作未落结构化证据
- **16 替换商品**：结果区静默清空（silent_reset.json）
- **17 商品场景**：动作GAP
- **18 手持商品**：自述三动作未点击验证
- **19 AI换装V2**：出图✓，动作未落证
- **20 AI姿势**：同上
- **21 AI穿戴**：同上
- **22 AI文字**：出图但原始字节未留存→不可复用
- **23 装饰文字**：missing_real_bytes，动作被主动阻塞
- **24 素材贴合**：无原始结果字节
- **25 印花提取**：资产/画布GAP
- **28 裂变链接**：资产/画布GAP
- **29 图片文字编辑**：无 result.json，仅 dom 文本
- **33 场景迁移**：仅 OSS URL，本地字节GAP
- **34 图生视频**：出片+资产✓，画布按钮运行时阻塞
- **35 带货视频**：/v1/videos 404
- **36 视频复刻**：仅前端验证
- **37 AI视频编辑**：/v1/videos 404
- **38 视频翻译**：结构+口型门禁+历史空态
- **39 视频拼接**：同 VIDEO_TRANSLATION

---

## 4. 六类跨工具 GAP（按共享根因归并）

### G1 原始结果字节未留存 → 资产/画布永久不可复用（影响面最大）
- 工具：`AI_TEXT`、`ORNAMENT_TEXT`、`SDS_DESIGN`、`SCENE_TRANSFER`（+ 5 个无 result.json 的工具同样无法判定）
- 现象：任务持久化层 `sanitizeTaskForPersist` 丢弃大字段（b64/OSS 原图），只留 URL 或截图；URL 过期后结果卡仍渲染但无字节可提交
- 后果：不只是"没验动作"，而是**用户点『存入资产』会写入空图或伪造图**，所以 `ORNAMENT_TEXT` 才会把两个按钮主动 BLOCKED
- 入口：`web/src/services/file-storage.ts`、`web/src/services/api/tools/assets.ts`、各 workspace 的任务持久化

### G2 视频上游端点缺失（/v1/videos 404）
- 工具：`SALE_VIDEO`、`VIDEO_REPLICATION`、`AI_VIDEO_EDITING`；`VIDEO_TRANSLATION`/`VIDEO_CONCAT` 因此未发起真实调用
- 证据：三份 `result.json` 均为 `create_status: 404`，`response_body: "404 page not found"`
- 入口：`web/src/services/api/video.ts`、`web/src/features/tools/adapters/*video*`、provider 通道配置（ccai-tmp 无视频端点）

### G3 图片翻译上游路由/参数不匹配
- 工具：`IMAGE_TRANSLATION`
- 证据：`05-net.json` → `/v1/responses` 404、`/v1/chat/completions` 400；`00-root-cause.md` 记录了根因分析
- 入口：`web/src/features/tools/adapters/image-translation.ts`、`web/src/services/api/image.ts`（工作区有并行改动，勿覆盖）

### G4 结果卡三动作（下载/资产/画布）无统一实测
- 工具：`HANDHELD_GOODS`、`AI_DRESSING_V2`、`AI_POSTURE`、`AI_WEARABLE`、`NEW_REPLACE_BG_V2`、`PRODUCT_SCENE`、`PRODUCT_IMAGE_SUITE`、`HAND_REPAIR`、`SDS_DESIGN`、`AI_OUTPAINTING`（缺下载/资产）、`AREA_REPAIR`/`FISSION_LINK`/`PRINT_EXTRACT`（缺画布）、`IMAGE_TO_VIDEO`（画布运行时阻塞：存入资产 busy 时按钮禁用 + 机器饱和）
- 说明：这些工具**产物是真的**，缺的是一次统一的动作回归。已有 8 个工具跑通了同一套 `tool-result-*` 组件，说明是覆盖问题不是能力问题
- 入口：结果卡组件（`tool-result-download-*` / `tool-result-save-*` / `tool-result-canvas-*`）+ 各 workspace

### G5 历史面板只覆盖 4 个 workspace
- 接入：`web/src/components/tools/tool-task-history.tsx` 被 `workspaces/video-translation.tsx`、`enhance.tsx`、`color.tsx`、`video.tsx` 使用
- 实测证据：仅 `CHANGE_COLOR_V2/01-task-history.json` 有非空历史；`VIDEO_TRANSLATION`、`VIDEO_CONCAT` 只有空态（"历史记录 0 条"）
- GAP：其余 30+ 工具无历史；且"历史任务→查看结果→回填结果区"这条链路只有 4 个 workspace 有可能走到
- LinkFox 侧对照：多个工具页 DOM 明确含历史记录区，属于对标必备项

### G6 案例/一键做同款基本为零
- 我们侧：仅 `ai-text.ts`、`video-translation.ts`、`pod.tsx` 出现案例/同款文案
- LinkFox 侧：`AI_OUTPAINTING`、`CHANGE_COLOR`、`CHANGE_COLOR_V2`、`DRESS_WEAR_SET` 等页面 DOM 含"优秀案例 / 一键做同款"
- GAP：31+ 工具无案例位；这是对标里唯一"整块功能缺失"而非"验证缺失"的项目

### G7 LinkFox 对照证据本身不完整（审计侧限制，非产品缺陷）
- `FIX_COLOR`：LinkFox 页面 404 → 无控件可对照
- `AI_TEXT`、`ORNAMENT_TEXT`：重定向到首页 → 无工具页 DOM
- 10 个工具只有 `supplemental_chunk_design`（`NEW_REPLACE_BG_V2`、`AI_POSE_GENERATOR`、`AI_DRESSING_XSY`、`FISSION_LINK`、`IMAGE_TEXT_EDIT`、`MATERIAL_UPPER_BODY`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`、`SCENE_TRANSFER`、`VIDEO_CONCAT`）
- **字段级对照结论**：39/39 工具的字段名集合与 `schema_final.json` 完全一致（同源 JS chunk），`lfOnly`/`oursOnly` 均为空集 → 字段"名字"这一层没有缺口；缺的是**默认值与交互行为的逐项证据**（chunk 只给字段列表，不给默认值）

---

## 5. 剩余开发批次（按阻塞原因/共享组件归并）

### B1｜P0 视频链路打通（G2）——解锁 5 个工具
- 范围：`SALE_VIDEO`、`VIDEO_REPLICATION`、`AI_VIDEO_EDITING`、`VIDEO_TRANSLATION`、`VIDEO_CONCAT`
- 动作：确认可用的视频通道/端点（当前 ccai-tmp 的 `/v1/videos` 返回 404 页），或新增支持视频的 provider；再按 `IMAGE_TO_VIDEO` 已验证的 create→poll→blob→ffprobe 流程套用
- 验收：`create_status=200` + mp4 可 ffprobe（duration/frames）+ 结果卡三动作各一次结构化记录
- 说明：本批是**唯一无法在本仓库内闭合**的批次，需上游账号/端点决策

### B2｜P0 结果字节留存修复（G1）——解锁 4 个"看似 PASS"的工具
- 范围：`AI_TEXT`、`ORNAMENT_TEXT`、`SDS_DESIGN`、`SCENE_TRANSFER`
- 动作：持久化层保留原始字节（或落对象存储并保存稳定 key），让结果卡在刷新/重进后仍能提交资产/画布
- 验收：刷新页面后点『存入资产』得到真实 assetId；画布节点引用同一 storageKey 且字节一致

### B3｜P0 图片翻译上游修复（G3）
- 范围：`IMAGE_TRANSLATION`
- 动作：按 `00-root-cause.md` 修正端点/参数（`/v1/responses`、`/v1/chat/completions` 均不可用）
- 验收：POST 200 + 落盘字节 + 三动作

### B4｜P1 结果卡三动作统一回归（G4，共享组件）——单点修复覆盖 14 个工具
- 范围：`PRODUCT_IMAGE_SUITE`、`AI_OUTPAINTING`、`AREA_REPAIR`、`HAND_REPAIR`、`NEW_REPLACE_BG_V2`、`PRODUCT_SCENE`、`HANDHELD_GOODS`、`AI_DRESSING_V2`、`AI_POSTURE`、`AI_WEARABLE`、`PRINT_EXTRACT`、`FISSION_LINK`、`IMAGE_TO_VIDEO`（画布按钮阻塞）
- 动作：统一在结果卡组件补/修三动作，并修复 `存入资产 busy 时画布按钮禁用且不恢复` 的交互 bug
- 验收：每工具一份 `{download,save,canvas}` 结构化记录（含 assetId / canvasNodeId / 字节数）

### B5｜P1 历史面板铺开（G5，共享组件）
- 动作：把 `ToolTaskHistory` 接入其余 workspace；补齐"历史→查看结果→回填结果区"
- 验收：任一工具提交两次任务后，历史列表 2 条且可回填；空态文案正确

### B6｜P1 案例/一键做同款（G6）
- 动作：抽共享 `ToolCases` 组件（参考 LinkFox "优秀案例/一键做同款"），至少覆盖电商套图与高频单图工具
- 验收：点击案例卡 → 参数回填 + 预览图

### B7｜P2 五个无 result.json 的工具补测
- 范围：`REMOVE_PEN`、`IMAGE_CROP`、`PRINTING_REPAIR`、`FIX_COLOR`、`IMAGE_TEXT_EDIT`
- 说明：这 5 个**不是**"失败"，是**没有产出结构化结果**，只有 run*.json/截图；需重跑一次标准 acceptance 脚本
- 验收：每个目录都有 `result.json`（status/断言/动作/字节）

### B8｜P2 LinkFox 对照补齐（G7）
- 动作：`FIX_COLOR` 找正确入口 URL；`AI_TEXT`/`ORNAMENT_TEXT` 找正确路由；10 个 chunk-only 工具抓真实页面控件
- 验收：`page-dom-20261028/index.json` 里 39/39 都是 `workspace_dom`

### B9｜P2 默认值/交互逐项核对
- 说明：字段名已 39/39 对齐，但默认值与联动只有零星证据（如 `MATERIAL_UPPER_BODY` 的大类→子类联动已验）
- 验收：每工具一份"字段→默认值→控件类型→联动"表，与 LinkFox 页面实测对比

---

## 6. 审计边界与风险声明

1. 本报告**没有发起任何新调用**，因此"上游 200"列中 `◎` 表示有响应体/URL 但无状态码记录，不等于失败。
2. `s200` 类判定来自证据文件文本匹配，个别工具（如 `REMOVE_PEN` 的 `run-edit6.json`）同时含 200 与 502 记录，已按"无 result.json ⇒ 未验证"处理。
3. 工作区存在并行改动（`PRODUCT_REFINE` 证据、`image-translation`/`color-v2`/`translate`/`video` workspace、`file-storage.ts` 等），本报告只读不改；B3/B4 的入口文件可能与他人改动冲突，落地前需 rebase。
4. `NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL` 判为"可用"是因为其链路不依赖付费上游（本地合成 / 复用已有字节），**不代表**与 LinkFox 效果等价。

---

## 7. 复核命令（只读）

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation
# 自报状态总览
python3 - <<'EOF'
import json,glob,os
for d in sorted(glob.glob('evidence/real-acceptance/*/')):
    p=os.path.join(d,'result.json')
    if not os.path.exists(p): print(os.path.basename(d.rstrip('/')),'NO result.json'); continue
    r=json.load(open(p)); print(os.path.basename(d.rstrip('/')), r.get('status'), str(r.get('result'))[:40])
EOF
# 上游 404 证据
grep -rl "404 page not found" evidence/real-acceptance/*/result.json
# 字节缺失
find evidence/real-acceptance -name "*.png" -size -300k | head
```
