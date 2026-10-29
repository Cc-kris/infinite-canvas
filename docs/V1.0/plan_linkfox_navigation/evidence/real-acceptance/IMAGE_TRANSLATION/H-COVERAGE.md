# IMAGE_TRANSLATION · H（历史坞 / 恢复）取证补全 2026-10-29

独立审计 r6 中该工具 H=PARTIAL 的理由是「未取证：无 reload 快照恢复回执，也未采集全新加载后历史坞」。
本目录 `b5-history-dock-reload-20261029.json` 即为补齐件，来源为浏览器内真实操作（非注入快照）。

## 取证链路（真实提交，非注入）

1. 打开真实工具页 `/tools/ecommerce-suite/image-translation`。
2. 上传合成图 `sale-banner.png`（900×600 PNG，canvas 生成）。
3. 展开默认折叠的「逐文本框校对」(`details#proofread`)，用「添加文本框」手工录入：
   原文 `夏日大促 5折起` / 译文 `SUMMER SALE 50% OFF`，点「确认译文」。
4. 点「开始翻译」→ 真实提交任务 `task-mvt9elbs-u4grlv`（capability=image，model=default::gpt-image-2）。
5. 轮询至 `succeeded`，结果 1 项（`storageKey=tool-result:T0C8ObdjKKWK0yXPxajoJ`）。
6. `location.reload()` 整页重载，读取历史坞。

## 重载后观测（b5-history-dock-reload-20261029.json）

- 历史坞计数：**1 条**（不依赖内存态）。
- 条目：`task-mvt9elbs-u4grlv`，`data-task-status="succeeded"`，文案 `已完成 · default::gpt-image-2 · image · 1 个结果`。
- 缩略图：`blob:` URL，`naturalWidth=1024 / naturalHeight=1024` → 已真实解码（重载后重新由结果存储水合，非旧内存 blob）。

## 顺带修复的真实缺陷（本轮唯一代码改动）

`web/src/features/tools/adapters/image-translation.ts` 的 `createModelTextPort()`：

- 原实现把 `config.model`（默认 = 图像模型 `gpt-image-2`）透传给 `requestImageQuestion`，
  视觉识别/逐框翻译这类**文本问答**请求因此打到图像模型上游 → 上游返回
  `{"error":{"message":"Upstream request failed","type":"upstream_error"}}`，
  页面「识别文字」100% 报「识别失败」，历史坞永远 0 条。
- 改为显式使用 `config.textModel`（仅当与 `config.model` 不同才覆盖，缺省行为不变）。
- 实测：请求模型由 `gpt-image-2` 变为 `gpt-5.5`（响应里 `response.model` 已切换）；
  该文本上游当前返回 `Service temporarily unavailable`（503，外部可用性问题，与本改动无关）。

## 证据边界（真话）

- 本次 B5/H 取证走的是**手工文本框 → 真实出图**路径，OCR 通道因上游 503 未能在本轮跑通端到端；
  OCR 的模型路由缺陷已修并可观察（模型名已切换），但「识别文字成功」需上游恢复后复测。
- 未新增 / 未改动 LinkFox 模块、suite6、video 相关代码。
