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
