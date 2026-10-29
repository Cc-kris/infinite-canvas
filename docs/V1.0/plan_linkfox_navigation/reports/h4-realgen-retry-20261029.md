# H4 复测：NEW_REPLACE_BG_V2 真实 UI 重试（2026-10-29）

- 基线：`bcafd94`（该提交中 NEW_REPLACE_BG_V2 上游 502、无任务，记 BLOCKED）
- 前置：`bcafd94` 已把 `scene.tsx` 生成/重试/取消改为 `getPersistedToolGateway()`；本轮先核验 dev 3000 实际服务的 `scene.tsx` 含 3 处 `getPersistedToolGateway()`（修正在线），再行动。
- 输入（与 bcafd94 完全一致）：商品图 `fixtures/product-watch.jpg` 31,860B `sha256=43ede96e…0dc19be3`；蒙版 `/tmp/h4gen/mask-watch.png` `sha256=2540c6a0…bec42af6d`（白色=商品主体）。
- 执行：真 Chrome（Playwright channel=chrome）+ 真实文件输入（goods、mask 两个 `input[type=file]`）+ 真实点击 `scene-generate`；provider 走本机 canvas-proxy `127.0.0.1:23210` → `https://api.cc-ai.xyz`，模型 `ccai-accept::gpt-image-2`。
- 证据：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/h4-design-realgen-retry-20261029/`

## 结论

**PASS。上游 502 未复现，属瞬时故障。**

| 项 | 实测值 |
| --- | --- |
| taskId | `task-mvthl08d-06efgs`（`tool-task:v1:` 键真实落盘，来源 localStorage） |
| 提交时间 | 2026-10-29T11:55:15.293Z |
| 上游回执 | `POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits` → **200** |
| 任务状态 | `succeeded`（耗时 32.9s） |
| 结果字节 | **837,987B PNG**，`sha256=e3646058…ad98ae`，1024×1024 RGB |
| 结果来源 URL | `https://oss-us.dimenoss.com/images/2026/10/29/1793274946_ae244e3010598cc6040e3e83304506c8.png` |
| 输入差异 | `resultDiffersFromGoods=true`（与商品图 sha 不同） |
| 参数快照 | `image / ccai-accept::gpt-image-2 / 1024x1024 / auto / count=1` |

## 三动作（均真实点击 + 真实反馈）

- 下载：`new-replace-bg-v2-result-1.png`，837,987B，`sha256=e3646058…ad98ae`（与结果图**逐字节一致**）
- 存入资产：`已保存到资产库（2HGusbdJGgddFxgTAcZml）`
- 发送画布：`已发送到画布（OUZvYDSInQ8Zfhl_Ay1EO）`

## fresh reload

- 真实 `page.reload()`，`navigation.type=reload`
- `tool-task:v1:task-mvthl08d-06efgs` = `true`
- 历史坞 `1 条`、`empty=false`、条目 `task-mvthl08d-06efgs / succeeded / "ccai-accept::gpt-image-2 · image · 1 个结果"`，缩略图 `blob:` 1024×1024 `decoded=true`
- 即 `bcafd94` 的 scene 持久化修复在商品图工具上首次得到成功链路实证（此前只有 REPLACE_GOODS 成功过）

## 诚实性说明（本轮实际发生两次提交）

为在真实 502 时能快速收口并保留回执体，本轮对脚本做了增强；增强代码首跑时有一个作用域 bug（`upstreamFailures` 定义在 `main()` 内、`runScene` 顶层引用）：

- **Attempt A（11:53:11Z 提交）**：`ReferenceError` 在点击后 4s 崩溃，network 记录**无任何 POST /v1/images**（仅 3 条代理探活 GET），未产生 taskId、未取得上游回执 → **不构成有效判定**，原样留档 `NEW_REPLACE_BG_V2-attemptA-harness-error.json` 与 `*-attemptA.png`。
- **Attempt B（11:55:15Z 提交）**：修好作用域后唯一一次决定性提交，即上表 PASS。此后未再提交，无重试循环。

脚本增强（提交于本次）：`IC_EVIDENCE_DIR` 可指定证据目录；`page.on("request")` 记录 `/v1/images` 请求；4xx/5xx 响应体截取 800 字符 + sha256 作为上游回执；上游失败且 45s 内无任务落盘则提前判 BLOCKED（避免空等 7 分钟）。

## 未完成 / 风险

- 上游 502 为瞬时故障，本次已不复现；若再次出现，脚本会按 `upstream-http-<status>` 如实记 BLOCKED 并带响应体，不会伪 PASS。
- REPLACE_GOODS 与 NEW_REPLACE_BG_V2 现均有真实成功取证；无其他未闭环项。
