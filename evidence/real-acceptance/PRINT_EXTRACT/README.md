# PRINT_EXTRACT 真实一次生成验收（2026-10-29 21:57–22:12）

口径：全部数字来自真实 UI 点击 + 落库任务快照 + 上游返回字节，**未注入、未补造**。
此前该工具只有失败任务（`task-mvs5dd71-4s35w2`，2026-10-28 21:25，0 个结果，原样保留）。

## 1. 环境与真实请求

| 项 | 值 |
| --- | --- |
| 页面 | http://127.0.0.1:3000/tools/product-design/print-extract （本地副本，真实上游） |
| 浏览器 | ego lite（Galley 桥，Chrome/156） |
| 配置 | `imageModel=default::gpt-image-2`，`apiFormat=openai`，通道 `default`（ccai-tmp → `https://api.cc-ai.xyz`） |
| 素材 | 公网印花商品实拍 `/__cases/dress-wear-set/2026966441820966912-source.jpg`（LinkFox 案例原始商品图，同源静态，上传后文件名 `public-print-tee.jpg`） |
| 操作 | 真实点击「立即生成」（1 张 · PNG · 生成透明图=关闭） |

真实请求体（tasks 快照）：

- prompt：`Extract the printed artwork (the print/graphic) from the provided product photo. Output a single flat image of the print at 1000x1000 pixels, straightened, with the original colors and no product texture, folds or shadows. Keep the printed artwork on its original neutral background; do not invent new props. Do not add text, logos or decorative elements that are not visible in the source print.`
- configSnapshot：`{capability: image, model: default::gpt-image-2, apiFormat: openai, size: 1:1, quality: auto, count: 1, channelId: default}`
- sourceAssetIds：`j05jsicHiAvgSnXG0xcpW`
- clientOperationId：`c050eb14-1f90-4908-808a-ed15fe1f80e4`

## 2. 终态与真实字节

| 项 | 值 |
| --- | --- |
| taskId | `task-mvtlxua2-kh39uf` |
| 终态 | `succeeded`（`submittedAt` 1793282232458 → `finishedAt` 1793282257967，约 25.5s，attempts=1，pollCount=0，transientFailures=0） |
| 结果项 | `task-mvtlxua2-kh39uf-0`，`kind=image`，`mimeType=image/png`，`bytes=2783996` |
| storageKey | `tool-result:task-mvtlxua2-kh39uf:0:jf8VlMsU9spY5W5raRSnO` |
| 上游 URL | https://oss-us.dimenoss.com/images/2026/10/29/1793282257_814d48af52d78c7f9f8dc6d15cb68015.png |
| 落盘字节 | `result.png`（本目录），2740 KiB，md5 `ccdef37fe1cc90b5920d200ff9c2417e`，PNG 签名有效，1024×1024 |

原始快照：`task.json`（解析后）与 `stored-task-raw.json`（localStorage `tool-task:v1:task-mvtlxua2-kh39uf` 原样，含嵌套转义）。

## 3. fresh reload 之后的页面证据

`Page.reload(ignoreCache:true)` 后重新读 DOM：

- `[data-task-id="task-mvtlxua2-kh39uf"]` ×2，`data-task-status="succeeded"`；
- 历史列表：`2026-10-29 21:57 已完成 … default::gpt-image-2 · image · 1 个结果`；
- 结果图由 blob 复原并成功解码：`blob:http://127.0.0.1:3000/c28406c4-…`，`naturalWidth=1024, naturalHeight=1024`；
- 结果面板出现三动作按钮：`下载 / 存入资产 / 发送画布`（即 storageKey 还原字节 → 三入口都在）；
- 旧失败任务 `task-mvs5dd71-4s35w2` 仍显示 `failed`，错误原样保留未改写。

## 4. 三动作真实回执

| 动作 | 回执 | 结论 |
| --- | --- | --- |
| 下载 | toast：`已下载 print-extract-result-1.png`；`triggerDownload()` 走 `a.download` 真实保存 | PASS |
| 发送画布 | toast：`已发送到画布（oPXPj22QpHrTQkYLTo5xf）`，画布侧生成真实节点 id | PASS |
| 存入资产 | 已点击（按钮存在且可点），但本轮 toast 采集窗口被后一个「发送画布」toast 覆盖，未抓到独立回执；`tool_assets` 顶部记录不是本次结果 | UNVERIFIED（未复验、未补造） |

## 5. 根因与代码改动

- 上次 21:25 的失败任务与本次在同一页、同一模型、同一通道下重跑成功（25.5s 出图），说明该失败是**上游一次性失败**，不是本仓代码缺陷；按「只修明确根因」口径，本轮**未改任何源码**。
- 定向探测到的环境事实（非缺陷）：`web_execute_js` 的 `switch_tab_id` 在该 ego 桥上不生效、始终落在 active tab（公众号标签），需用 TMWebDriver `execute_js(session_id=…)` 定向；已在验收脚本 `eval.py` 中固化。
- 门禁：`bunx tsc --noEmit` 退出码 0；`bun test`（含 `registry/print-extract.test.ts`、`adapters/*`）**1082 pass / 0 fail**。

## 6. 复现步骤

1. 打开 `http://127.0.0.1:3000/tools/product-design/print-extract`；
2. `fetch('/__cases/dress-wear-set/2026966441820966912-source.jpg') → File → DataTransfer → input[type=file]` + `change`；
3. 点「立即生成」，等 `[data-task-status]` 从 submitting → succeeded；
4. 读 `localStorage['tool-task:v1:<taskId>']` 取 request/终态/字节；`curl` 结果 URL 落盘比对 md5；
5. `Page.reload` 后复验结果图解码与三动作。

## 7. R16 补验：fresh reload + 三动作全机器凭证（2026-10-29 22:14–22:22）

对应上一轮 R15「reload 仅散文 / 存入资产 UNVERIFIED」。本节**复用同一条真实任务** `task-mvtlxua2-kh39uf`，未重新提交生成、未发任何新上游请求、未改写任何 `localStorage`/IndexedDB 记录，只点既有结果卡片上的三个按钮并读取真实存储。机器回执见 [reload-verify-r16.json](./reload-verify-r16.json)。

### 7.1 reload 口径（附桥限制实测）

| 项 | 值 |
| --- | --- |
| 页 | `http://127.0.0.1:3000/tools/product-design/print-extract?fresh=1793283495674` |
| nav | `type=navigate`、`transferSize=1527`、`decodedBodySize=1227`、`domContentLoadedEnd=1071ms`、`loadEventEnd=1257ms` |
| 文档重建 | 新 `timeOrigin=1793283495679` > 旧文档 `1793283410632`，`documentRecreated=true` |
| 状态来源 | 结果面板**不是内存残留**：新上下文从 `localStorage['tool-task:v1:task-mvtlxua2-kh39uf']` 读任务、从 IndexedDB `media_files` 读字节后重新生成 `blob:` 预览（`naturalWidth/Height=1024/1024`、`complete=true`） |
| reload 后 DOM | 「提取结果 / 已完成 / 共 1 个结果 · 图片 1 / 下载 / 存入资产 / 发送画布」，testid `tool-result-download-0`、`tool-result-save-0`、`tool-result-canvas-0` 均在 |

桥限制（实测 3 次，非缺陷）：`location.reload()`、`setTimeout(location.reload)`、CDP `Page.reload` 在本 ego 桥上都被吞掉（`timeOrigin` 不变、`js_return=null`）。因此用**同路径 + cache-buster 的全文档导航**触发等价刷新：整个 JS 上下文重建、HTML 重新请求（transferSize>0），比单次 `reload()` 的持久化考验更强。

### 7.2 真实字节（四份副本同 sha256）

`sha256=1577dafdcda3797856efcae1c662cdccbc2de0ab94b88acd2b94fe541e51d822`、`bytes=2783996`、`image/png`、`md5=ccdef37fe1cc90b5920d200ff9c2417e`：

| 副本 | 位置 | 字节 | sha256 |
| --- | --- | --- | --- |
| 结果原始缓存 | IndexedDB `media_files/tool-result:task-mvtlxua2-kh39uf:0:jf8VlMsU9spY5W5raRSnO` | 2783996 | 1577dafd… |
| 磁盘落盘 | `~/Downloads/print-extract-result-1.png` | 2783996 | 1577dafd… |
| 资产库副本 | IndexedDB `image_files/image:ssG2wIoxYLuGtnivHhx0Z` | 2783996 | 1577dafd… |
| 画布节点副本 | IndexedDB `image_files/image:n3NLNYGrCamnFi-i5yR-Z` | 2783996 | 1577dafd… |

### 7.3 三动作回执

| 动作 | 机器证据 | 结论 |
| --- | --- | --- |
| 下载 | toast `已下载 print-extract-result-1.png`；hook 捕获真实出站：`a.download=print-extract-result-1.png` + `blob:`（`dispatchEvent(MouseEvent click)`），payload `2783996B / image/png / sha256=1577dafd…` | **PASS（payload）**；本轮自动化点击未再落新文件（Downloads 无 `(1)` 副本）——无用户手势被 Chrome「多个自动下载」策略拦下，属浏览器策略；磁盘同 sha 文件为上一轮真实落盘 |
| 存入资产 | toast `已保存到资产库（fjzr1NhaALbnYz5LOAv9r）`；`infinite-canvas:asset_store` 50→51 条；新记录 `assetId=fjzr1NhaALbnYz5LOAv9r`、`storageKey=image:ssG2wIoxYLuGtnivHhx0Z`、`metadata={taskId:task-mvtlxua2-kh39uf, resultItemId:task-mvtlxua2-kh39uf-0, toolId:PRINT_EXTRACT}`、字节与 sha 同上；`/assets` 页真实卡片「PRINT_EXTRACT 结果 1 / 工具结果 / 图片 / 1024x1024 · 2.7 MB · image/png」 | **PASS** |
| 发送画布 | toast `已发送到画布（DD6JsYYuaqJz5Eh7Ot-Oa）`；`infinite-canvas:canvas_store` 新建项目 `DD6JsYYuaqJz5Eh7Ot-Oa`（标题「PRINT_EXTRACT 结果」，1 个节点）；`canvasNodeId=image-1793283578986-px8bw`、`type=image`、`position={150,120}`、节点 `metadata.storageKey=image:n3NLNYGrCamnFi-i5yR-Z`、`1024x1024`；`/canvas/DD6JsYYuaqJz5Eh7Ot-Oa` 页 DOM 存在 `data-node-id="image-1793283578986-px8bw"` | **PASS** |

### 7.4 结论与残余风险

- R15 两条未证实项均已闭环：**fresh reload 后三动作可点且真实成功**（非散文）。
- 唯一残余：下载的**物理落盘**本轮未重演（浏览器自动下载策略），但出站 payload 与磁盘既有文件的 sha256 完全一致，字节级可信；如需强制落盘需一次真实用户手势点击。
- 本轮**未改任何源码**，因此未新增门禁；上一轮已记录 `bunx tsc --noEmit` 退出码 0、`bun test` 1082 pass / 0 fail。
