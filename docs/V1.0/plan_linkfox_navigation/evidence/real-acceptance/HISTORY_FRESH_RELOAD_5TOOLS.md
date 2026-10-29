# lf_edit8_history_b — 5 工具 fresh reload 历史恢复实测（PASS/BLOCKED）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 采集：2026-10-29 16:50–17:10，用户真实 Chrome profile，vite dev `127.0.0.1:3000`
- 方式：**真实操作 + 真实强制 reload**（`performance.getEntriesByType("navigation")[0].type === "reload"`），
  未注入任何快照 / 未手写 localStorage / 未伪造 DOM。数据只读真实 `localStorage["tool-task:v1:*"]` 与 IndexedDB(`tool-result:*`)。
- 判定口径：reload 后页面能自己把「上一次真实任务」的结果图形渲染出来，且 `fetch(渲染用 blob).byteLength == 任务落盘 bytes`。

## 结论表

| # | 工具 | 路由 | 真实任务 | reload 后结果 | 字节核对 | 判定 |
|---|---|---|---|---|---|---|
| 1 | PRODUCT_REFINE 商品精修 | `/tools/smart-edit/product-refine` | `task-mvtb3nuj-3d0mnv` succeeded | 结果图 2048 宽自然尺寸渲染 | 2,827,346 B = 落盘 2,827,346 B | **PASS** |
| 2 | PRINTING_REPAIR 印花修复 | `/tools/smart-edit/printing-repair` | `task-mvtbawv4-zxcmpv` succeeded | dock「2 条」，最新任务缩略图 1024×1024 | 1,183,770 B = 落盘 1,183,770 B | **PASS** |
| 3 | HAND_REPAIR 手部修复 | `/tools/smart-edit/hand-repair` | `task-mvtbe5rp-0maafh` succeeded | dock「1 条」，缩略图 1024×1024 | 2,153,466 B = 落盘 2,153,466 B | **PASS** |
| 4 | AI_OUTPAINTING 智能扩图 | `/tools/ecommerce-suite/ai-outpainting` | `task-mvtbhylv-bmyjus` succeeded | 「历史记录」2 条，最新有 1024×1024 缩略图；点「查看结果」回放几何（1024×1024，下扩 280px） | 1,329,760 B = 落盘 1,329,760 B | **PASS** |
| 5 | IMAGE_CROP 图片裁剪 | `/tools/smart-edit/image-crop` | `task-mvtbmukl-quasjm` succeeded（in-process-crop） | 结果区自动回放 `tool-result-item-0`（1024×744）+ dock「1 条」 | 205,951 B = 落盘 205,951 B | **PASS** |

## 逐条证据

### 1) PRODUCT_REFINE — PASS
- 上传商品图 → 开始精修 → 真实上游返回；任务 `storageKey=tool-result:bbXCXFqpAjGJXnsC3Cbph`，`bytes=2827346`，`payloadDropped=false`。
- 强制 reload 后：`data-testid="tool-result-image"` 自然尺寸 2048×n 正常，`fetch(blob).byteLength = 2827346`，与落盘一致。

### 2) PRINTING_REPAIR — PASS
- 两槽各 1/1（`apparel-print.jpg` 1024×1024、`apparel-print-ref.jpg` 768×768）→ 点「开始修复」。
- 任务 `task-mvtbawv4-zxcmpv`：succeeded，`storageKey=tool-result:gy4ol2a8gM3_BAcbOgKQz`，`bytes=1183770`，`payloadDropped=false`。
- reload（navType=reload）后 dock：「2 条」；最新任务缩略图 naturalWidth/Height=1024×1024，fetch 字节 1,183,770 = 落盘。
  第 2 条为 10-28 旧任务，`payloadDropped=true` 且无 storageKey → 按设计只显示元数据（数据侧缺失，非 UI 缺陷）。

### 3) HAND_REPAIR — PASS
- 上传 `hand-product.jpg`（1024×683）→ 在 `[data-testid="hand-repair-canvas"]` 上涂抹，覆盖率提示「已涂抹 22.7% 区域」→「开始生成」（此前按钮 disabled，证明门控生效）。
- 任务 `task-mvtbe5rp-0maafh`：succeeded，`storageKey=tool-result:MJlcLXl2-O1DnKd-NUgg2`，`bytes=2153466`，`payloadDropped=false`。
- reload 后 dock：「1 条」，缩略图 1024×1024，fetch 字节 2,153,466 = 落盘。

### 4) AI_OUTPAINTING — PASS
- reload 后原图与几何本身先自动恢复（`outpaint-source` = product-watch.jpg，1024×744，`原图已锁定`）。
- 「立即生成」初始 disabled，`title="当前画布没有外扩区域：拉大画布边界，或缩小原图占位"` → 点 `1:1` 后画布 1024×1024、`新增 下 280px`，按钮启用 ⇒ 空转保护真实生效。
- 提交后任务 `task-mvtbhylv-bmyjus`：succeeded，`storageKey=tool-result:RvlSRdnpA2kyyj8OmnSRW`，`bytes=1329760`，`payloadDropped=false`。
- reload 后「历史记录」2 条，最新（17:04）带 1024×1024 缩略图，fetch 字节 1,329,760 = 落盘；点「查看结果」提示「已载入历史任务结果（几何以当时提交快照为准）」，
  右侧画布恢复 1024×1024 / 新增下 280px，结果区显示「已完成 · 共 1 个结果 · 图片 1」+ 下载/存入资产/发送画布。
- 备注（自动化假象，非缺陷）：结果区 `<img loading="lazy">` 在**后台标签**（`document.visibilityState === "hidden"`）不触发解码，故 `naturalWidth` 读到 0；
  用独立 `new Image()` 加载同一 blob 成功解码 1024×1024，且 blob 字节匹配，证明数据与渲染链路正常，前台可见时即显示。

### 5) IMAGE_CROP — PASS
- 上传 `product-watch.jpg`（1024×744）→「开始裁剪」→ 提示「裁剪完成，结果已入资产库」。
- 任务 `task-mvtbmukl-quasjm`：succeeded，`storageKey=tool-result:_Z7jp3P-mlkBnYUUw5Zf9`，`bytes=205951`，`payloadDropped=false`（provider `in-process-crop`，本地真实像素裁剪，无上游 API）。
- reload 后：结果区 `tool-result-item-0`（`data-dropped="false"`）自动回放，结果图 natural 1024×744，fetch 字节 205,951 = 落盘；dock「1 条」带缩略图；源图 `product-watch.jpg` 亦从草稿恢复。

## 未覆盖 / 风险
- 10-28 及更早的历史任务（AI_OUTPAINTING / PRINTING_REPAIR / IMAGE_TEXT_EDIT 等）`payloadDropped=true`、无 `storageKey`：
  刷新后只能显示配置与状态文本，无法还原图片。属**历史数据侧**缺失（当时未接结果持久化），UI 已明示「原始文件未保留（历史快照只存元数据）」。
- 本轮为真实上游调用（每次 1 张图，约 40–60s），非 mock；未做批量并发压力验证。

## 复现步骤（任一工具通用）
1. 打开对应路由，上传 fixtures（`web/scripts/real-acceptance/fixtures/`），按页面要求配置（比例/蒙版/双槽）并提交。
2. 等状态变「已完成」（AI 类约 40–60s；IMAGE_CROP 秒级）。
3. `Cmd+R` 强制刷新：结果区/历史坞应自动出现上一次结果；对比 `fetch(渲染 blob).byteLength` 与 `localStorage["tool-task:v1:<id>"]` 里的 `result.items[0].bytes`。
