# R17：HANDHELD_GOODS 真实生成回执（从 0 个成功任务 → 1 个真实成功任务）

环境：`http://127.0.0.1:3000`（vite dev，node pid 80431）；浏览器 ego lite（Galley 默认控制浏览器）；
任务库 `localStorage tool-task:v1:*`；字节库 IndexedDB `infinite-canvas/media_files`。
本轮规则：真实 UI 点击、真实上游请求、不注入、不改库、失败保留原始错误。

## 结论

HANDHELD_GOODS 之前**从未有过成功任务**（历史唯一一条 `task-mvs5p8g8-or3oim` 因页面刷新中断被判 `failed/submit-unconfirmed`）。
本轮通过页面真实点击「立即生成」得到一条**真实成功**任务，结果字节 1455193 B，下载文件 sha256 与 IDB 字节完全一致。

| 项 | 值 |
|---|---|
| taskId | `task-mvtm8p59-8qkp5s` |
| 终态 | `succeeded`（UI「已完成」，`data-task-status=succeeded`） |
| createdAt / finishedAt | 1793282739021 / 1793282780051 |
| 结果 | 1 张 PNG，1 455 193 B，sha256 `29c1afcd7bdad71b369664a756b2825395aea9c7e6634a6e23360ba9682cae84` |
| storageKey | `tool-result:task-mvtm8p59-8qkp5s:0:c3Xf2R0z4RYt31DCxRmmX` |
| upstreamTaskId | `null`（提交路径仍未落盘，与 PRODUCT_SCENE 同一缺口，本轮未改源码） |

## 真实请求（原始回执见 `request.json`）

- 端点：`POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits`（`127.0.0.1:23210` 是本地代理前缀，真实目标是 `https://api.cc-ai.xyz/v1/images/edits`）
- 形态：`multipart/form-data`，字段：
  - `model: gpt-image-2`、`n: 1`、`size: 1024x1024`、`output_format: png`
  - `prompt:` 参考图片编号说明 + 左手托底正面 + 纯色棚拍 + 手部接触/一致性质检句
  - `image[]: File(product.png|image/jpeg|42762B)` —— 页面 draft 里的真实商品图（经 `shrinkInlineImages` 最长边 1280 JPEG 瘦身）
  - `image[]: File(left-cradle-front.svg|image/png|7490B)` —— 姿势库 SVG 参考，已被 `shrinkInlineImages` 光栅化成 PNG 再上传
- 上游响应：HTTP 200，`{"created":1793282748,"data":[{"revised_prompt":"…","b64_json":"…"}]}`
- 采集方式：页面作用域 XHR 观测器（只读 tap，记录 url/method/status/FormData 字段/响应文本），**不改载荷、不改响应**；因 ego lite 未开 CDP 端口，无法走 Network 面板。

## fresh reload 后的三动作（`freshReload` 字段）

`location.reload()` 之后（`navigationType=reload`）验证：结果面板恢复为 `task-mvtm8p59-8qkp5s / succeeded`，结果图 1024×1024 可渲染（`blob:` 来源 IDB），三个按钮全部可用。

| 动作 | 回执 | 核验到的落点 |
|---|---|---|
| 下载 | 反馈「已下载 handheld-goods-result-1.png」 | `~/Downloads/handheld-goods-result-1.png` 1 455 193 B，sha256 = IDB 字节 sha256（**硬证据**） |
| 存入资产 | `2hc-FbpV9uk6XjFocyUIq` | `infinite-canvas/app_state` 中该资产记录含 `toolId=HANDHELD_GOODS`、`taskId=task-mvtm8p59-8qkp5s`、`resultItemId=task-mvtm8p59-8qkp5s-0`，`createdAt=2026-10-29T14:07:58.425Z`（元数据级核验） |
| 发送画布 | `cj94ASOc2e-p121Fv-PNB` | `infinite-canvas/app_state` 中存在 project「HANDHELD_GOODS 结果」`cj94ASOc2e-p121Fv-PNB`，`createdAt=2026-10-29T14:08:07.217Z`，含 1 个 image 节点 `image-1793282887289-477su` |

判定尺度：下载 sha 与磁盘一致 = 硬腿；存资产/发画布只有页面反馈 + IDB 元数据/节点存在 → 记为 PARTIAL（未做资产字节与画布节点渲染的二次深挖）。

## 旧失败任务（原样保留，未重跑、未回填）

```
taskId: task-mvs5p8g8-or3oim
status: failed
error.code: submit-unconfirmed
error.message: 页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。
result.items: 0
reconcileRequired: true
```

## 已排除的怀疑点

- 姿势参考是 `data:image/svg+xml` → 上游拒收？**否**：`lib/inline-image.ts` 的 `shrinkInlineImages` 会先经 canvas 光栅化，实际上传就是 `image/png`（7490 B），本轮 200 成功即证。

## 复现入口

打开 `/tools/product-design/handheld-goods` → 上传商品图 → 选左手/姿势/场景 → 「立即生成」→ 完成后「下载 / 存入资产 / 发送画布」。

## 门禁

- `pnpm typecheck`（web）：0 错
- `bun test src/features/tools/adapters/handheld-goods.test.ts`：18 pass / 0 fail / 119 expect
- 本轮未改任何源码（只新增本证据目录）
