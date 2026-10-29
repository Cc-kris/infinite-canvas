# R26b · REMOVE_PEN 真实任务终态与三路字节对账（succeeded）

日期：2026-10-29
仓库：`/Users/mac/Documents/Dev/infinite-canvas`
前序：`ec33cf99`（当时任务未终态、无 taskId）；本轮**不重新生成**，只从同一真实任务 store 读取终态并做同文档 fresh reload 对账。

## 1) 真实任务（来源：`.acceptance-profile/r26b` 的 localStorage `tool-task:v1:*`，只读解析 leveldb）

| 字段 | 值 |
| --- | --- |
| taskId | `task-mvtp33dv-57nmbx` |
| toolId | `REMOVE_PEN` |
| status | **succeeded** |
| createdAt | 2026-10-29T15:25:16.387Z |
| finishedAt | 2026-10-29T15:25:50.143Z |
| attempts | 1 |
| result.items[0] | kind=image, bytes=**1831533**, storageKey=`tool-result:task-mvtp33dv-57nmbx:0:3yrrtwJa4FBz7TxtYTf29` |

上游回执（`/tmp/r26/run4.log`）：`POST /v1/images/edits` → `[response] 200 2442902 B`（b64Len 2442044）。

另一条 store 记录 `task-mvtoj0nz-0varve` 为早前错误 key 那轮的 provider-rejected 失败记录，与本轮无关。

## 2) 同文档 fresh reload + 三路字节对账（脚本：`web/scripts/real-acceptance/_r26_verify_succeeded.mjs`，输出 `/tmp/r26/out5/receipt.json`）

- fresh reload：`navType=reload`，结果图 `blob:` 渲染，natural 1024×1024，`complete=true`；全程 `requests=[]`（**未触发任何新生成请求**，`noNewGenerationRequest=true`）。
- 任务结果字节：IDB `media_files` 1831533 B / image/png / sha256 `2f8f7f112bccc0a67d13bf8fb5a166da715ec85c2ff169f8c147f7e3d3cf415e`；磁盘落盘 blob（`IndexedDB/http_127.0.0.1_3000.indexeddb.blob/1/00/b`）同尺寸同 sha。

| 路径 | 字节 | sha256 | 与结果一致 |
| --- | --- | --- | --- |
| 任务结果（IDB media_files / 磁盘 blob） | 1831533 | `2f8f7f11…415e` | 基准 |
| 下载（`remove-pen-download` → `apple_1024-erased.png`） | 1831533 | `2f8f7f11…415e` | ✅ |
| 存资产（assetId `wdwqvHbNsra6AtPJ4L5h8`，storageKey `image:W0c3_5mj2XabPdUv-RrFq`） | 1831533 | `2f8f7f11…415e` | ✅ |
| 发画布（canvasNodeId `image-1793288157196-3h0q0`，storageKey `image:uha9pfm1R-iq9WvM80SvR`） | 1831533 | `2f8f7f11…415e` | ✅ |

画布落点：项目 `APddJ5zOQBDrB_sr6xqO1`（UI 回执文案「已发送画布（项目 APddJ5zO · 节点 image-17）」中的 `image-17` 是画布内短标签，真实节点 id 为 `image-1793288157196-3h0q0`），节点 metadata：`bytes=1831533, mimeType=image/png, naturalWidth/Height=1024`，其 storageKey 的 IDB `image_files` 内容 sha 与结果一致。

## 3) 与 ec33cf99 的关系（更正）

ec33cf99 回执称「未终态」，但同一 store 记录显示该任务已于 `15:25:50.143Z` 转为 `succeeded`（生成本身成功，仅是当时的观测脚本在 `waitForTimeout` 时页面被关闭而中断、未读到终态）。因此「图片工具无同步终态收尾」的推断不成立——终态写入正常。

## 4) 结论

REMOVE_PEN 真实 UI 全链路成立：真实上游 200 / 2.44MB → 任务 succeeded → 同文档 fresh reload 后结果仍在 → 下载 / 存资产 / 发画布三路产出的字节与任务结果**逐字节相同**（1831533 B，sha256 `2f8f7f112bccc0a67d13bf8fb5a166da715ec85c2ff169f8c147f7e3d3cf415e`）。

## 5) 源码改动

无。仅新增真实验收脚本 `web/scripts/real-acceptance/_r26_verify_succeeded.mjs`、`_r26_canvas_probe.mjs`（`src/` 未改，未触发 tsc / 单测）。

## 6) 复跑

```bash
cd web && IC_PROFILE=<profile> IC_OUT=<outdir> node scripts/real-acceptance/_r26_verify_succeeded.mjs
```
