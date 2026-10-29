# R14 · IMAGE_TO_VIDEO 真实提交落库验证 / VIDEO_REPLICATION 未启动

- 时间：2026-10-29 20:48–20:54（本地）
- 仓库基线：550b6c7（本次未改业务代码，只落证据）
- 运行方式：Playwright 持久化 profile `/tmp/ic_r9_profile_translation`，只点真实 UI 控件，**无任何注入/种子任务**
- 产物目录：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r14/`

## 1. 关键环境事实（此前 UNVERIFIED 的根因）

| 项 | 实测 |
| --- | --- |
| 应用 | `http://127.0.0.1:3000` (vite dev) 200 |
| 渠道 | `sub2api-real` → `https://sub2api.1006000.xyz`，模型 `MiniMax-H3`（video） |
| 代理开关 | `proxyEnabled=true`，`proxyUrl=http://127.0.0.1:23220`（canvas-proxy 0.1.3，**存活**） |
| 23210 | **无监听**（cloudflared 隧道仍指向它）；页面里 `ERR_CONNECTION_REFUSED` 只来自历史素材 URL，与提交链路无关 |
| 提交实际出口 | `http://127.0.0.1:23220/https://sub2api.1006000.xyz/v1/videos` |

> 结论：r13 的“提交未落库”不是校验阻断（I2V 默认 videoType=product-showcase，issues 为空），而是运行环境/时序问题；本轮同 profile 直接跑通，未改代码。

## 2. IMAGE_TO_VIDEO：真实回执（已落库）

- 表单：素材 `product-watch.jpg`（仓内 fixture），prompt=商品轻微旋转展示…，参数 `5s · 自适应 · 768P · 产品展示`，提交前 `issues=[]`
- 应用侧 taskId：`task-mvtjhbcg-e8lnin`（`tool-task:v1:task-mvtjhbcg-e8lnin`）
- 上游 taskId：`task_KOkmL8wCOOmL5AdPyeGwQhAZyIBdMvPR`

原始请求（截断 base64）：

```
POST http://127.0.0.1:23220/https://sub2api.1006000.xyz/v1/videos
{"model":"MiniMax-H3","seconds":"5","size":"1280x720","resolution_name":"768p",
 "generate_audio":true,"watermark":false,"mode":"reference","images":["data:image/jpeg;base64,..."]}
```

原始响应：

```
200 {"id":"task_KOkmL8wCOOmL5AdPyeGwQhAZyIBdMvPR",
     "request_id":"task_KOkmL8wCOOmL5AdPyeGwQhAZyIBdMvPR","status":"pending","model":"MiniMax-H3"}
```

终态快照（pollCount=31）：

```
status=succeeded  error=null
items=[{kind:"video", storageKey:"tool-result:guW96FrxlpSM3CtY3clem",
        bytes:1266723, mimeType:"video/mp4", payloadDropped:false, ingestError:null}]
```

## 3. 字节与三动作

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 下载（file-saver） | ✅ | `i2v-result.mp4` 1266723 B，偏移 4 处 magic=`ftyp`，sha256=`fe5c85f8274bb7d44b1febbf2844487dcecd440dc58a129b5f1d5398c091a524`，文件名 `image-to-video-result-1.mp4` |
| 存资产库 | ✅ | 反馈文案 `已保存到资产库（C1BDmN9PzlfeXw5HHc6_T）` |
| 发到画布 | ❌ | `locator('[data-testid="tool-result-canvas-0"]').click` 超时 60000ms（按钮存在且未 disabled，点击不可达 → 疑似被浮层遮挡），未伪造成成功 |
| fresh reload | ✅（首刷） | 刷新后同 taskId 命中：历史行 `2026-10-29 20:48已完成…sub2api-real::MiniMax-H3 · video · 1 个结果`；面板 `download/save/canvas` 均 exists+enabled，`<video>` `1344x768` `duration=5.2s` `readyState=4`（blob 可播） |

判定：**PARTIAL**（提交/落库/终态/字节/首刷恢复全 PASS；发画布动作在本次运行中未完成，保留真实超时错误，不计 PASS）。

补充：本次会话存在一条上游瞬时 Cloudflare 520（`error.code=unclassified`），发生在轮询期，最终仍 `succeeded`，说明网关未把瞬时 5xx 改写成 failed。

## 4. VIDEO_REPLICATION

**BLOCKED（未启动）**：按 MASTER 指令（立即提交 I2V 回执、不再长轮询；若 VR 未开始则记 BLOCKED 退出）终止。当前状态仍为 UNVERIFIED，未产生任何 VR 任务或回执，不做推断性结论。

已备好的下次执行条件（无代码改动）：
- 入口 `/tools/ai-video/video-replication`；链路模式按钮文案 `TikTok 链接`；直链输入 `placeholder=/粘贴公网视频直链/`；脚本 `data-testid=video-replication-script`；提交 `data-testid=video-replication-submit`
- 探针结果：直链模式 + 1 张参考图 + 脚本即可提交，`issues=[]`，`clip=0–15s`
- 运行脚本：`/tmp/ic_r14/run.mjs VR`（`/tmp/ic_r14/node_modules` 软链到 `web/node_modules`）

## 5. 复现命令

```bash
cd /tmp/ic_r14 && node run.mjs I2V   # 结果落 /tmp/ic_r14/I2V/{run.log,result.json,downloads}
cd /tmp/ic_r14 && node run.mjs VR    # 需先解决 MASTER 限流
```
