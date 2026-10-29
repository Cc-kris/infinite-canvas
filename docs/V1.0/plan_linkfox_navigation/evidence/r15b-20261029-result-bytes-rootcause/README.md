# r15b 结果字节持久化共同根因（2026-10-29）

## 一、历史任务为什么永久无字节（不可救，不伪造）

用 git 时间线对账 7f64b09 里两条真实任务的落库时间：

| 事实 | 时间 |
| --- | --- |
| task-mvsc4fyg-qobp8k / task-mvsbsk21-8jy2kn（CHANGE_COLOR_V2）succeeded | 2026-10-29 00:35:08 |
| 当时 HEAD（477a23c）`sanitizeTaskForPersist`：**只有** `dataUrl` 分支，剥掉 dataUrl 后置 `payloadDropped:true`，**没有 url 分支，也没有任何字节入库（ingest）** | 00:34 已生效 |
| G1「结果字节落库并持久化 storageKey」e680e76 | 01:14:48 |
| B7「OSS 结果落 url 而非 dataUrl」deddee0（imageResultItems） | 01:23:03 |

结论：这两条任务成功时，上游给的持久地址是放在 `dataUrl` 里的 https 地址，被当时的 sanitize 当二进制一起剥掉，
且当时没有 IDB 入库 → 快照里只剩 `{id,kind,payloadDropped:true}`，IndexedDB 里也不存在可归属的字节。
**这是历史不可逆丢失**，按约束不注入历史任务、不补造字节。

## 二、仍然存在的三条共同缺口（本次修复）

1. **mapper**：`image.ts resolveImageSource()` b64 优先且只返回一个字符串 —— 上游同时给 `b64_json` + `url` 时，
   https 地址被静默丢弃；`gateway.imageResultItems()` 只见 dataUrl → 刷新后无地址可回取。
2. **IDB provenance**：入库键名 `tool-result:<nanoid>` 不含任务信息 —— 快照被剥成 payloadDropped 后，
   字节即使已在 media_files 里也永远无法归属回任务（实测 103 条 media_files 中 33 条 tool-result 全部非空，却无法反查）。
3. **写入防降级**：`upsertTask` 在同一 `receivedAt` 下允许无 storageKey 的副本覆盖已有 storageKey 的副本，
   轮询/重复回调会把「已入库」降级成「无字节」。

## 三、修复（commit 6ede584）

- `web/src/services/api/image.ts`：`resolveImageSource` → `resolveImageItem`，同时返回 `{dataUrl, url}`。
- `web/src/services/api/tools/gateway.ts`：`ProviderImageResult.url?`；`imageResultItems` 在 b64 场景同时落 `dataUrl` + `url`
  （快照只剥 dataUrl，url 保留，可随时重新抓字节）。
- `web/src/services/file-storage.ts`：入库键改为 `tool-result:<taskId>:<index>:<nanoid>`，新增 `listTaskResultMedia(taskId)`
  按任务前缀反查真实字节。
- `web/src/stores/use-tool-task-store.ts`：入库时写带 provenance 的键；新增 `healResultMediaByProvenance()`
  （刷新后把 IDB 里**真实存在**的字节按 provenance 挂回被剥的 item，找不到即空操作，不伪造）与
  `mergeWithoutStorageKeyDowngrade()`；两者接入 `upsertTask` 与 hydrate 自愈链路。

## 四、验证（真实任务 + fresh reload，非注入）

修复前（标签 1709629290 只读盘点）：37 条 succeeded，其中 28 条带 storageKey；media_files 103 条，
`tool-result:*` 33 条且 **33/33 非空**（样例 1,963,716B video/mp4、1,237,615B image/png、2,268,656B video/mp4）。

fresh reload 后（`location.reload()` + 2.5s 后取 DOM/IDB）：

- 历史坞/结果面板存在 2 个 `blob:` 结果图，且 `naturalWidth>0` 已真实解码：1024×683（alt=hand-product.jpg）、1024×1024（alt=历史结果缩略图）。
- 抽样真实任务 `task-mvtk9pu3-sfifnh`（VIDEO_REPLICATION，succeeded，payloadDropped=false，storageKey=`tool-result:4zwepLZTtpMan11tTGMKR`），
  按 storageKey 从 IndexedDB 读回字节 = **1,963,716 B / video/mp4**，与快照 bytes 字段一致。

测试与类型：
- `tsc --noEmit` → exit 0。
- `bun test` 10 个相关文件 → **107 pass / 0 fail / 436 expect**，含新增 5 例
  （provenance 自愈、IDB 无字节时不伪造、防降级覆盖、不同批次不合并、mapper 保留 url）。

## 五、剩余风险

- 新键名 `tool-result:<taskId>:<index>:` 需要**新产生的真实任务**才能端到端跑到；本次未新提交付费上游任务，
  旧数据里 newScheme 计数为 0（属预期，因为旧任务都发生在旧键名下）。
- 历史 CHANGE_COLOR_V2 / REMOVE_PEN / 场景 / 手持 / 印花 的成功任务仍无字节（不可逆），面板维持无字节态。
