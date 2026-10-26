# 带参考图视频链路 —— 根因与修复记录（2026-10-26）

## 一、已确认根因（真机抓包证据）

1. **带图必走 multipart**：`create[OI]VideoTask` 中 `media` 非空即发 FormData。
   上游 sub2api `/v1/videos` 不解析 multipart，返回
   `400 {"error":{"message":"'utf-8' codec can't decode byte 0x89 in position 1217"}}`
   （0x89 = PNG 魔数，被当文本解码）——耗时 12.9s 才失败。
2. **旧代码无 JSON 回退**：`const jsonOnly = status === 415 || (status === 400 && !media.length)`
   → 带图时 400 永不回退，直接失败。
3. **上游 JSON 字段实测**（真实调用，非推测）：
   - `images: [dataUrl]` → 200，任务 done，`usage.input_image_count = 1` ✅ 图片被采纳
   - `image: dataUrl` → 被识别（报图片尺寸错）
   - `first_frame_image: dataUrl` → 任务 done 但 `input_image_count = 0`（**静默丢弃**，坑）
   - `mode: "frames"` + 仅 `images` → 200，正常（2.7s）
4. **轮询阶段把瞬时网络错误当致命错误**：
   带图任务创建成功后（HTTP 200，create 耗时 92.8s），轮询中途收到 Cloudflare
   `The origin web server did not return a complete response` /
   `returned an invalid or incomplete response`，应用立即把任务标记 failed（143s）。
   同时用 python 直连 + 经本地代理轮询同一 task：`status pending, progress 0.667`，
   说明**上游仍在正常生成**，只是被前端误判。

## 二、已做修改（web/src/services/api/video.ts）

- 预生成 `imageDataUrls`（每张参考图的 data URL），供 JSON 内联使用。
- `inlineImages = !videos.length && !audios.length && imageDataUrls.length > 0`
- `jsonFields.images = imageDataUrls`（仅 inlineImages 时）
- 提交改为尝试序列：`inlineImages ? [jsonFields, body] : [body, jsonFields]`，
  遇到 400/415/422 才换下一种；其它错误直接抛。
  → 带图优先 JSON（省掉 12.9s 的无谓 multipart 失败），官方 [OI] 仍 multipart 优先。

## 三、待办

- 轮询瞬时错误重试（CF 5xx / 无响应 / HTML 响应体）不应直接判失败，应重试若干次。
- 修复后重跑真机：带图 → 生成中 → 成功，并核对 `input_image_count=1`。

## 四、环境

- 页面：http://localhost:3000/video（vite dev，PID 26655）
- 本地代理：http://127.0.0.1:23210（node canvas-proxy/index.js）
- 渠道：sub2api.1006000.xyz / MiniMax-H3
- 记录库：IndexedDB `infinite-canvas` → store `video_generation_logs`

## 五、第二轮实测：根因是「请求体体积」（2026-10-26）

带参考图走 JSON 之后仍然失败，抓包与直连对照定位到真正原因：

| 请求体 | 结果 |
| --- | --- |
| ~2KB（纯色图） | 200，2.7s |
| 1.5MB | 200，70~71s |
| 1.9MB | 200，69.6s（代理）/ 104.2s（直连） |
| 2.8MB（真实资产图） | 524（Cloudflare 源站超时），127.8s |
| 4.0MB | 524，128s |
| 5.1MB | 502，124s |

- 直连与本地代理耗时同一量级 → 瓶颈不在 `canvas-proxy`，而在上游处理内联图的成本（体积越大越慢）。
- 资产库原始图是 **1.86~2.28MB 的 PNG**，base64 后请求体 2.8MB，必然超时。
- 还有一次上游内部竞态：`open inline image: operation error S3: GetObject ... NoSuchKey`（图先写 S3 再异步读回，偶发读不到），28s 判失败。

### 修复

1. `shrinkInlineImage()`：内联前把参考图降采样到最长边 1280 的 **JPEG（q0.86，超 500k 字符再降 0.7）**。
2. 工作台轮询遇到上述 S3 竞态错误时，**自动重建一次任务**（`INLINE_IMAGE_RACE`，仅一次，不无限重试）。
3. 轮询瞬时错误（CF 5xx / 408 / 429 / 无响应）容错 40 次 × 3s，避免已扣费任务被判失败。

### 修复后真机结果

- 请求体 **232KB**（原 2.8MB），创建耗时 **8.1s**（原 92~128s / 524）。
- 上游状态机：`pending(progress=0.67→1)` → `done`，总耗时 4 分 24 秒（6s 视频，含模型排队）。
- 页面 `video_generation_logs`：`status=success`，`video/mp4` 2.47MB。
- `<video>`：`readyState=4`、`duration=6.58s`、`768×1344`、blob 地址，可播放。
- 生成记录列表显示：`以参考图1中的主体和场景 | 480x854 | 480p | 6s | 成功 | 4分24秒`。

## 六、同步修复：画布 + 工作台 + 全协议共用（2026-10-26 第二轮）

用户提问「画布是否也修了参考图过大」，检查后发现压缩只写在了 `createOpenAIVideoTask` 里，覆盖面不够：

| 位置 | 是否压缩 | 说明 |
| --- | --- | --- |
| 视频 openai 协议（工作台/画布当前配置） | ✅ 原本已修 | 画布与工作台共用同一份配置，天然共享 |
| 视频 gemini / http / plugin 协议 | ❌ → ✅ | 之前仍内联原图 |
| 生图 gemini parts / plugin refs（JSON 内联） | ❌ → ✅ | 同一类坑 |
| 生图 `images/edits`（multipart 上传） | ❌ → ✅ | 之前直接上传 2MB+ 原图 |

### 做法

压缩逻辑抽到 `web/src/lib/inline-image.ts`，`shrinkInlineImages()` 一处实现，六条路径共用（不再各自复制），这样以后改阈值只改一处。

### 画布真机证据（走真实画布模块，不是模拟）

- 参考图：资产库 `image:3VXWKsdouKJ_G2i23EiWD`（2.28MB PNG，dataURL 2970KB）
- 画布模块 `hydrateNodeGenerationContext` 取图 → `createVideoGenerationTask`
- 网络探针：`POST http://127.0.0.1:23210/https://sub2api.1006000.xyz/v1/videos`，**请求体 336,685 字节**
- 创建耗时 **5.87s**（修复前同尺寸 92~128s 后 CF 524）
- 任务 `task_Q7tnjGDciQwdZ6T06Yc7hs4l4ibqFl8y` → `completed`
- 产物：blob **5.04MB**，`video/mp4`，`duration=6.58s`，`768×1344`，可解码
- 生图 `images/edits`：FormData 总计 **252,417 字节**，其中参考图约 246KB（原 2.28MB）

### 踩到的坑（供下次复用）

- 画布的 `cfg` 必须先用 `resolveModelRequestConfig(raw, raw.videoModel)` 解析：`raw.baseUrl` 是 `api.cc-ai.xyz`（会 404），解析后才是 `sub2api.1006000.xyz`。
- 画布节点 id 在 `data-node-id` 上，不在 `id` 上；`config-*` 节点的「开始生成」在无提示词时是 disabled。
- 资产库 `image_files` 是键值库：key 形如 `image:xxx`，value 直接是 Blob，`getAll()` 拿不到 key，必须用游标。
- 生图尺寸必须 16 的倍数，否则本地就抛错（根本不发请求）。

### 后续约定

工作台（`pages/video`、`pages/image`）与画布（`pages/canvas`、`components/canvas`）共用 `services/api/*`：任何「请求体/协议/轮询」类修复必须落在共享层，并在两边各跑一次真实链路，不能只验一侧。
