# 缺陷记录：FISSION_LINK 成功后二次提交挂起（2026-10-29 真机复现）

## 现象
同一页面内第一次提交真实出图成功（已生成 1 张，三动作可用）后，第二次点「生成」：
- 结果状态文本永久停在「正在生成：已返回 0/1 张」
- 结果单元格仍显示「等待提交」，`fission-link-actions-*` 按钮数为 0
- 页面内 fetch/XHR 钩子 14s / 60s 内 **零** 上游请求（连参考图校验请求都没有）
- `performance.getEntriesByType('resource')` 过滤 23210/cc-ai/images 为空
- 动态 `import('/src/features/tools/adapters/fission-link.ts')` 4ms 返回，`useToolTaskStore.getState().runTool` 是 function
- 控制台无 error、无 unhandledrejection

## 与真机成功链路的对照
新标签页首次提交正常：`S/E http://127.0.0.1:23210/http://127.0.0.1:18471/product-watch.jpg`（参考图）→ `S/E ... oss-us.dimenoss.com/images/...`（结果图）→ 「已生成 1 张」→ 三动作回执（资产 ID / 画布 ID / 下载文件名）。

## 已排除
- gateway fingerprint 去重（只匹配非终态任务，首次任务已 succeeded）
- 动态 import 死锁
- task store 空/未初始化

## 代码位置
`web/src/components/tools/workspaces/scene.tsx` → `runCells`（`setBusy(true)` 之后的 await 链：`createFissionLinkRunPort()` → `resolveSource()` → `port.run(...)`）。阻塞点在 `resolveSource()` 之后、真实 provider 请求之前。

## 已修的相关缺陷（本次已上补丁）
`resolveSource()` 中资产路径的 `imageToDataUrl()` 在「草稿有资产、IndexedDB 字节已丢失」时会永久挂起 → 已加 8s 超时兜底并回退资产 URL。

## 结论
属 FISSION_LINK 自身遗留缺陷，不伪造结果、不 mock 上游；本次六视频工具收口不依赖此路径，记录为开放缺陷，需单独排查 `runCells` await 链上的 promise 泄漏。
