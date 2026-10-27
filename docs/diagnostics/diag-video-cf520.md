# Windows 版视频生成报 Cloudflare 520 排查记录

时间：2026-10-27

## 用户报错原文
"The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured."
→ 这是 Cloudflare **520** 错误页正文（origin 返回空/非法响应），不是我们代码自己写的文案。

用户参数（画布底部视频节点截图）：
- 模型 MiniMax-H3（视频）/ 默认渠道
- 480p，W480 H480，比例 1:1，6 秒
- 首尾帧模式（未放参考图）
- 提示词：分层纸艺 + origami 鲸鱼 + 剪纸村落 + 两镜头 + 音效描述（长文本，纯文字）

## 已确认事实（实测）
1. sub2api 账号 `https://sub2api.1006000.xyz` 只有 **MiniMax-H3** 一个模型（/v1/models 200）。
2. **multipart/form-data** POST /v1/videos → 400 `{"error":{"message":"Expecting value: line 1 column 1 (char 0)"}}`（已知坑，sub2api 只吃 JSON）。
3. **JSON** POST /v1/videos（model/prompt/seconds/size/resolution_name/generate_audio/watermark/mode/ratio）
   - 480x480 + 1:1 + 6s → 200 `task_...` pending（2.6s）
   - 1280x720 + 16:9 + 6s → 200 `task_...` pending（3.5s）
   → 创建链路本身正常，短时间后仍是 pending（上游排队）。
4. mac 本机 dev 实例日志：`system proxy: http://127.0.0.1:7890 (macos system proxy) — outbound goes through it`；
   `reusing local proxy at http://127.0.0.1:23210`。
5. desktop/main.js + canvas-proxy/system-proxy.js 里 **已有 win32 分支**（读注册表 ProxyServer/ProxyOverride），
   即 Windows 系统代理检测不是空白。

## 尚未确认（关键缺口）
- Windows 上到底是哪一步 520：提交 / 轮询 / 下载 content。
- Windows 上用的渠道 baseUrl 是否就是 sub2api（用户没说）。
- Windows 系统代理（Clash 等）是否存在、canvas-proxy 是否走它。

## 复现环境（本机 dev 实例）
```
cd ~/Documents/Dev/infinite-canvas/desktop && npx electron . --remote-debugging-port=9446 --user-data-dir=/tmp/ic-vidtest
# 页面 http://127.0.0.1:23212/
# 配置注入：localStorage['infinite-canvas:ai_config_store'] = {"state":{"config":{...},"webdav":{}},"version":0}
# config: channels[0]={id:"sub2",baseUrl:https://sub2api.1006000.xyz,apiFormat:"openai",models:[{name:"MiniMax-H3",capability:"video"}]}
#         videoModel="sub2::MiniMax-H3", vquality="480p", videoSeconds="6", videoMode="frames"
```
CDP 连接需 `suppress_origin=True`（否则 403 Rejected an incoming WebSocket connection）。
helper: `cdp_helper.py`（同目录）

## 根因（2026-10-27 复现到硬证据）
单发一切正常，**突发并发**立刻露出真身：
```
5 条并发 POST /v1/videos（同一 key/同一 payload）
→ 1 条 502 "error code: 502"（CF 家族错误页正文），其余 4 条 200 pending
```
结论：**sub2api 源站/CF 边缘抖动**，与客户端平台无关（Windows 只是碰巧撞上）。
旧代码在创建环节**没有任何重试**：一次 520/502 就直接把 CF 的错误页 HTML 当错误文案弹给用户
（所以用户看到的是 Cloudflare 的英文原句，而不是"视频任务创建失败"）。

## 修复（web/src/services/api/video.ts）
1. `prefersJsonFirst()`：除 `api.openai.com` 外（sub2api 等中转）**先发 JSON**，multipart 只作兜底。
   省掉"注定 400 且要等十几秒"的一次白跑。
2. `withGatewayRetry()`：408/425/429/500/502/503/504/520/521/522/523/524/525 + 纯网络错误
   退避重试（0.8s → 2s，最多 3 次）。套在：openai 创建、poll 内容下载、直链下载、http 协议提交。
3. `withRequestDiagnosis()`：错误信息尾部追加 `host/path/HTTP 状态码`，下次报错能一眼定位是哪一跳。
4. `pollHttpVideoTask`：轮询遇瞬时故障返回 `pending` 而不是 `failed`
   （旧行为会把上游其实还在跑的任务判死，用户重试=重复扣费）。
5. 生图（image.ts）**故意不加自动重试**：同步接口，5xx 时上游可能已出图，重试有重复扣费风险。

## 验收证据
- mock 上游（前两次 502、第三次 200）：视频工作台点「开始生成」→ mock 收到 **3 次 POST**，
  第 3 次成功，随后 GET task → GET content → 页面出现可播放视频（768×768 / 6.58s / 880KB），无报错。
- 真实 sub2api（480p / 1:1 / 6s / 用户原提示词）：创建 <10s 进入「生成中」，JSON 首发无 multipart 白跑。
