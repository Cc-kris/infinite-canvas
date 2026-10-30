# R22-F 真实浏览器验收：过期 VIDEO_CONCAT 任务恢复 + 结果三动作 + 公网回读

日期：2026-10-30　分支：`feat/linkfox-v1-real`　证据目录：本目录

## 1. 结论

| 验收点 | 结果 | 证据 |
| --- | --- | --- |
| 过期视频任务能恢复出真实结果 | ✅ | `pollCount` 251→252、`lastPolledAt` 推进到 2026-10-30T03:47、`status=succeeded`、结果 4,633,118 字节 |
| 结果可预览 | ✅（真 Chrome） | 公网地址在 Playwright 真 Chrome：`duration=13.667s`、`768×1344`、`readyState=4`、播放到 `currentTime=1.162s` |
| 可下载 | ✅ | 「下载」→ `video-concat-result-1.mp4`，4,633,118 字节，sha256 `928c4113…8471` |
| 可存资产 | ✅ | 「存入资产」→ assetId `uhEi4hRZ6FQm_BZP6D3kC`，storageKey `video:iFfp2GEznAPvk1RTkbEn2` |
| 可发画布 | ✅ | 「发送画布」→ project `BQaQ6fu-w5wv8NRshhLvQ`，node `video-1793332164186-6guwp` |
| 三处字节一致 | ✅ | 任务结果 / 资产 / 画布节点 / 下载文件 sha256 全等 |
| 公网回读一致 | ✅ | `POST /__media/upload` → `https://telephony-…trycloudflare.com/__media/928c4113….mp4`，HTTP 200、同字节同 sha |

## 2. 代码改动（唯一生产改动）

`web/src/services/api/tools/task-machine.ts` → `planRecovery()`

- 旧行为：任务被判过期且带 `upstreamTaskId` 时返回 `reconcile`，而 `gateway.recover` 只是把任务再 `transitionTask` 成 `unknown`，**从不查上游**。结果：上游早就 done、视频已就绪，本地刷新多少次都恢复不出来，下载/存资产/发画布三动作全部不可达。
- 新行为：过期 + `capability === "video"` + 有 `upstreamTaskId` → 返回 `poll`（`reason: expired-query-upstream`），把恢复交给真正的上游查询接口。过期只说明「本地等待超时」，不等于「上游不可查」。

配套测试：`gateway.recovery.test.ts` 新增 2 例（过期视频走 poll、无 upstreamTaskId 仍 reconcile）。视频工具回归 8/8 通过，`pnpm typecheck` 通过。

## 3. 本轮踩到的坑（复现要点）

1. **后台标签让 `<video>` 读不到元数据**：`document.hidden=true` 时 `readyState` 恒为 0、`networkState=2`。用同字节新建 `<video>`、甚至换成公网 https 源都同样超时——说明与字节/编码无关，纯浏览器节流。**判定预览必须用 Playwright 真 Chrome**，不能靠交互标签页的 `readyState`。
2. **`/__media/upload` 收原始字节**：用 `curl -F` 会把 multipart 边界写进文件（本例多出 214 字节，sha 全变）。正确姿势：`curl -X POST --data-binary @file -H 'Content-Type: video/mp4' -H 'x-media-name: name.mp4'`。
3. **IndexedDB `media_files` 的记录值本身就是 Blob**，不是 `{blob}` 包装；且多个 `get` 必须各自开事务，否则事务在 await 后失效（`TransactionInactiveError`）。
4. **`node -v` 不在默认 PATH**：本机 node 在 `/opt/homebrew/bin`，跑 `web/scripts/real-acceptance/*.mjs` 前先 `export PATH=/opt/homebrew/bin:$PATH`。

## 4. 残留风险（未修，供决策）

- **画布节点尺寸偏差**：节点 `metadata.naturalWidth/Height = 1280×720`，真实是 `768×1344`（9:16）。根因是发送画布时 `readVideoMeta()` 在后台标签超时 → 走 `media-metadata.ts:17` 的 `FALLBACK_VIDEO_WIDTH/HEIGHT`（设计上带 `timedOut` 标记，为了不卡死入库）。后果：后台标签里发画布会得到 16:9 尺寸。建议后续：`timedOut` 时不要写死尺寸，改为落 `storageKey` 后在可见时机二次测量，或按传入的真实比例。
- **无 `archiveUrl` 实现**：`rg 'archiveUrl' web/src` 为空；本次「公网回读」用项目自带 `/__media/upload`（canvas-proxy 素材托管）完成，属验收手段，不是产品内建归档能力。
- 结果区视频在后台标签下不显示画面（同第 3 节第 1 条），用户切到该标签即恢复，属浏览器行为。

## 5. 复现命令

```bash
# 播放/解码校验（真 Chrome，绕开后台节流）
cd web && export PATH=/opt/homebrew/bin:$PATH
node scripts/real-acceptance/_r22f-preview-check.mjs

# 公网回读
curl -s -X POST --data-binary @downloaded.mp4 -H 'Content-Type: video/mp4' \
  -H 'x-media-name: video-concat-result-1.mp4' http://127.0.0.1:23210/__media/upload
curl -s -o /tmp/rb.mp4 -w '%{http_code} %{size_download}\n' \
  https://telephony-affects-borders-wider.trycloudflare.com/__media/<sha>.mp4
shasum -a 256 /tmp/rb.mp4
```
