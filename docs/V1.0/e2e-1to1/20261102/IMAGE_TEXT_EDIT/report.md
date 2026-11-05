# IMAGE_TEXT_EDIT｜图片文字编辑 · 1:1 E2E 验收

- 原站 URL（page-spec 指定）：`https://www.linkfox.com/draw/designer` → **404「页面不存在 | Linkfox」**（实测见 `original.png`：整页只剩 logo 与「页面不存在 / 您访问的页面可能已被删除、移动或暂时不可用 / 返回首页」）
- 备用探测：`https://www.linkfox.com/draw/ai-image-edit` → 被白名单重定向到 `https://www.linkfox.com/home`（首页，无独立文字编辑工作区）；`https://www.linkfox.com/draw/image-text-edit` → 404
- 本地 URL：`http://127.0.0.1:3000/tools/product-design/image-text-edit`（registry `IMAGE_TEXT_EDIT` makeType 78 / layout text）
- 视口：双端 CDP `Emulation.setDeviceMetricsOverride` 固定 **1600×1000 / DPR=1**
- 时间：2026-11-02；只读验收；未点原站任何按钮（404 页仅 1 个 `返回首页`，未点）；本地未提交「生成图片文字」（上传测试图后仍保持未点）

> **原站 baseline 说明**：该工具在 LinkFox 公共站**没有可访问的原站工作区**（现测 404 + 权限重定向，与 page-spec `27/29` 记录的 `route_not_found` 一致）。所以 original.png 是「404 页」这一真实事实的基线，不是工具页基线；所有布局/视觉对比只能标注为「原站无对照」。

## 截图

| 说明 | 路径 |
|---|---|
| 原站 1600×1000 基线（404 页，真实抓取，未伪造） | `docs/V1.0/e2e-1to1/20261102/IMAGE_TEXT_EDIT/original.png` |
| 本地 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/IMAGE_TEXT_EDIT/local.png` |
| 本地 · 导出格式切 JPEG（说明文案变化） | `.../local-format-jpeg.png` |
| 本地 · 「查看本次输入快照」展开 | `.../local-snapshot.png` |
| 本地 · 上传测试源图后（新增文字框/生成按钮解禁） | `.../local-uploaded.png` |

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | BLOCKED | 原站无工具页（404），无可比对象；只能确认本地页面自身渲染正常、无溢出 |
| 布局 | BLOCKED | 同上。原站 404 页无任何工具区，无法比较配置栏/结果区宽度 |
| 交互 | PASS（仅本地） | 本地实测 10 个零成本控件（导出格式 3 切、上传入口、快照展开/收起、3 个 disabled 确认），均有可观测反馈；原站侧无可交互工具控件 |
| 功能 | REAL_PROVIDER（源码级）/ 本轮 UNVERIFIED | 适配器真实走 `gateway.submit → requestEdit`；没有既有真实出图取证可引用 → 不判 PASS |

## 双端实测数据

**原站**（`/draw/designer`，1600×1000）
- `document.title = "404 - 页面不存在 | Linkfox"`；`body.innerText` 全文 34 字：`页面不存在 / 您访问的页面可能已被删除、移动或暂时不可用 / 返回首页`
- 控件探针：仅 1 个可交互元素（`返回首页` 按钮，紫色 100×40 居中 @750,626）
- 无页头导航、无左侧 rail、无配置栏、无结果区（404 页把整站壳层也去掉了）

**本地**（`/tools/product-design/image-text-edit`）
- header 56 + 左 rail 180 @16,56（39 工具，`图片文字编辑 补充` 选中）+ 右侧 `aside 440×1000 @1600,0`（连接本地 Agent，视口外）
- 页头区：H1 `图片文字编辑`（360×20 @219,67）+ 副文案「上传图片后可框选或新增文字框；画布选中与右侧属性面板始终同步。」+ 右上 `撤销` 72×40（disabled）/`重做` 72×40（disabled）
- 主区 grid `918px 420px` @219,148：
  - 左列 `918` 两卡：`图片文字画布` 918×322 @219,148（标题 + 右上 `上传源图` 100×40 / `新增文字框` 114×40（disabled）+ 虚线画布 884×208「上传 JPG / PNG / WebP 源图后开始框选文字」+ 底部说明「在画布空白处拖拽可框选新文字框；选中后方向键微调（Shift 加速）、Delete 删除、⌘/Ctrl+Z 撤销。」）；`图片文字结果` 918×438 @219,482（`快照 0 框｜0×0` + 结果卡 884×329「图片文字结果 已完成 共 1 个结果 · 图片 1」+ `结果 1` 破图占位 + 4 个动作 `下载/存入资产/发送画布/重试这张` + `查看本次输入快照` 134×40 @236,863）
  - 右列 `420` 三卡：`属性编辑`（未选中提示）、`文本框列表 0/30`（`还没有文字框。`）、`导出` 420×356 @1153,358（`PNG（透明背景）` 135×40 选中 / `JPEG（更小体积）` 141×40 / `WebP（体积与质量平衡）` 186×40 + 说明 + 红字「请先上传要编辑文字的图片。」+ `生成图片文字` 386×44 disabled + `预计输出 1 张结果（单次固定，不可改数量）。` + 字体说明）
- 底部 `历史任务 2 条` 卡 1354×234 @219,936（真实任务记录：`2026-10-30 11:45 已完成 图片文字编辑｜translate-source.png｜尺寸 1200×1200｜源格式 png｜文字框 1 个… default::gpt-image-2 · image · 1 个结果`）

## 逐条差异

原站无工具页，下列「原站行为」列对 404 页统一为「无（404）」；严重度按「本地是否偏离 spec/是否有自造」评估。

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 原站可访问性 | P0 | 整个页面 | `https://www.linkfox.com/draw/designer` = 404「页面不存在」；`/draw/ai-image-edit` 重定向 `/home`；`/draw/image-text-edit` 404 | 本地有完整工具页 | `original.png`；`document.title = "404 - 页面不存在 \| Linkfox"` |
| 2 | 视觉 | BLOCKED | 全部 | 无（404） | 黑白/stone 令牌，卡片圆角 10px，控件 40px | local.png |
| 3 | 布局 | BLOCKED | 主分栏 | 无（404） | 左 918（画布 + 结果纵向）+ 右 420（属性/列表/导出），符合 spec §1「配置 320–420」 | 本地 grid `918px 420px` @219,148 |
| 4 | 本地自造 | P2 | `快照 0 框｜0×0` 元信息条 | 无 | 有 | local.png y514 |
| 5 | 本地自造 | P1 | 结果卡「图片文字结果 已完成 共 1 个结果 · 图片 1」+ `结果 1` 破图 + `下载/存入资产/发送画布/重试这张` | 无 | **空态下就渲染出「已完成 / 共 1 个结果」的结果卡与 4 个动作按钮**（无源图、无文字框），且 `结果 1` 为无 src 的破图占位 | local.png y534–860；截图可见 broken image 图标 |
| 6 | 本地自造 | P1 | `导出` 卡三格式按钮 + 说明 + `预计输出 1 张结果（单次固定，不可改数量）。` | 无 | 有（PNG/JPEG/WebP 三选，默认 PNG） | local.png y358–710 |
| 7 | 本地自造 | P2 | `历史任务 2 条` 内嵌卡 | 无（原站历史是独立页） | 有，占满底部 1354×234 | local.png y936+ |
| 8 | 缺失（无法核对） | P1 | 原站应有字段：`boxes` 画布框选、字体属性面板、文本框列表 | 404，无法取证 | 本地已实现画布框选 + 属性编辑 + 文本框列表 0/30 | 只有本地侧证据 |
| 9 | 壳层（不计工具主体） | P3 | 页头品牌/算力/学习中心/用户菜单/HelpDock/水印分组 | 404 页**连壳层都没有** | 有无限画布壳层 + 连接本地 Agent 面板 | 双端基线 |

## 交互实测记录（本地 10 步）

| # | 控件 | 前 | 后 |
|---|---|---|---|
| 1 | `JPEG（更小体积）` @1380,422 | 正文 1085 | 1144（说明文案切换），JPEG 进入选中态 |
| 2 | `WebP（体积与质量平衡）` @1263,466 | 1144 | 无文本变化（仅选中态迁移） |
| 3 | `PNG（透明背景）` @1238,422 | 1144 | 回 1085 |
| 4 | `上传源图` @948,185 | — | 打开系统文件选择器（`This action opened a file chooser`，已确认入口可用，随后取消，未上传） |
| 5 | `Esc` | — | 无残留弹层（该入口是原生 chooser，不是页内弹层） |
| 6 | `查看本次输入快照` @303,696 | 1085 | 1200（展开快照面板） |
| 7 | `Esc` | 快照展开 | 无变化（快照卡不响应 Esc，需再点按钮） |
| 8 | `生成图片文字` @1363,520 | disabled=true | 点击无变化、无请求 |
| 9 | `新增文字框` @1063,185 | disabled=true | 点击无变化 |
| 10 | `撤销` @1457,100 | disabled=true | 点击无变化 |

补充（上传链路实测，零上游成本）：`input[type=file]` 存在，`accept=image/png,image/jpeg,image/webp`；`setInputFiles(/tmp/test-garment.png)` 后页面显示 `已上传 test-garment.png（1000×1000，5.4 KB）。原图不会被覆盖。`，且 `新增文字框`、`生成图片文字` 由 disabled → **可用**（按钮状态探针 `dis=false`）。**未点生成。**

## 功能核验（只读源码）

- 注册表：`web/src/features/tools/registry/index.ts:455-468`，`IMAGE_TEXT_EDIT` / makeType 78 / layout `text` / 字段 `boxes`、`imageFormat/Height/Name/Size/Width`、`imageUrl`(required)、`resultImageUrl`(required)。
- 适配器：`web/src/features/tools/adapters/image-text-edit.ts`
  - 头注释（`:1-9`）明确：8 个字段必须写进 prompt，否则静默丢参；`requiresReferences = true`，源图必须作为参考图走 edit 模式，无图提交会被网关拦 `references-required`；`resultImageUrl` 提交时为空串，成功后回写。
  - `:200-202` `runImageTextEdit`：`gateway.submit(input)` → 非终态再 `gateway.waitForResult`；`:211` `retryImageTextEdit` 走 `gateway.retry`，无 retry 能力时显式抛 `retry-unsupported`。
  - 真实 provider 路径：`gateway.ts:534` → `requestEdit` → `image.ts:958` `fetch` 直连 OpenAI 兼容端点。
- 本地上传走 `services/api/tools/assets.ts:440 uploadToolAsset`（本地 IndexedDB 入库 + 尺寸/格式/大小校验），不产生上游请求。
- 既有测试：`web/src/features/tools/adapters/image-text-edit.test.ts:329 describe("适配器：真实提交与重试")`（fake gateway），不构成真实出图证据。
- **本轮没有真实生成**（禁止消耗算力），也没有该工具的既有真实出图取证（`evidence/real-acceptance/` 无 IMAGE_TEXT_EDIT）。判定 **REAL_PROVIDER（源码级）/ 本轮 UNVERIFIED**。

## 结论

该工具在 LinkFox 公共站**无原站工具页**（`/draw/designer` 404，`/draw/ai-image-edit` 重定向首页），本报告的 original.png 是 404 真实基线，因此视觉/布局只能判 **BLOCKED**，不做「与原站不一致」的指控；也没有伪造原站截图。本地页自身可用（左右 918/420 分栏、导出三格式、上传/框选/文本列表均在），交互 10 项均有反馈；但空态下就渲染「已完成 · 共 1 个结果」结果卡与破图占位属于本地自造/误导，应修。功能层是真实 provider 通道，本轮无真实调用证据 → **UNVERIFIED**。
