# 线上排障：Windows 用户生图报「fetch failed」/「生图请求超时」（2026-10-22）

## 用户现象
- 新装 Windows 版（v0.25.4 安装包）生图，一次提示「生图请求超时」，一次提示「fetch failed」。
- 维护者本机（macOS，开着 VPN）一切正常。

## 调用链
```
renderer axios (60s? 否 → 生图 10min)
  → withLocalProxy(): http://127.0.0.1:23210/https://api.xxx/v1/images/generations
  → canvas-proxy/server.js forward()  ← 跑在 Electron 主进程内（desktop 内置，永远开启）
  → fetch(target)  ← Node 22+/undici
  → 上游 API
```
失败时 proxy 回 `502 {error: reason}`，前端 `readAxiosError` → `readApiErrorMessage` **优先采用 body.error 原文**，
所以用户在界面上看到的就是 undici 的原话：`fetch failed`。

## 实测证据（Electron 38.8.6，本机跑）
脚本：`/tmp/e-proxy-test2/`（proxy.mjs = 仓库 server.js 副本 + setFetchImpl 注入）

| 场景 | 结果 |
|---|---|
| session.setProxy 指向死端口 127.0.0.1:9 后，用 **Node fetch** 直连 https://example.com | **200（完全无视系统代理）** |
| 同一环境用 **net.fetch**（Chromium 栈） | `ERR net::ERR_PROXY_CONNECTION_FAILED` |
| 环境变量 HTTPS_PROXY 设死端口，Node fetch | 仍 200（undici 不读 env 代理） |
| Node fetch 解析不存在域名 | `TypeError: fetch failed`，cause=ENOTFOUND |
| proxy 走 Node fetch 透传 SSE | 200，分块 424/814/1217ms（正常流式） |
| proxy 走 net.fetch 透传 SSE | 200，分块 419/813/1217ms（**流式没有被吃掉**） |
| proxy 走 net.fetch 透传 200KB POST | 200，body len=200013（正文完整） |

## 结论
1. **不是转发逻辑写错**，是**出站通道选错**：本地代理的 `fetch()` 是 Node/undici，
   它不读 Windows「系统代理」（注册表 WinINET 设置）、也不读 HTTPS_PROXY。
   → 用户只要用 Clash/Verge 的「系统代理」模式（没开 TUN 虚拟网卡），或压根没开代理，
     应用内所有出站请求都是**直连**。API 在墙外就必然失败。
2. 维护者本机正常，最可能的差异：TUN/全局模式、或用的是国内可直连的中转域名。
3. 两种报错都符合「直连被墙 / 上游不可达」：
   - `fetch failed` = DNS 污染或 TCP 直接被拒（快速失败，cause=ENOTFOUND/ECONNREFUSED）；
   - `生图请求超时` = 连接建立了但数据永不回（GFW 丢包 / 中转站卡死），撞前端 10 分钟 axios 超时。
4. 「生图请求超时」的 10 分钟来自 `web/src/services/api/image.ts` 的 `IMAGE_REQUEST_TIMEOUT_MS`，
   属于**兜底超时**，不是代理的 bug，但用户体验上等于「卡 10 分钟没反馈」。
5. 上游 `basketikun/infinite-canvas` 的 canvas-proxy（已合并成单个 index.js）**逻辑相同，未修**。

## 建议修复（待用户拍板）
- A. 桌面版 proxy 出站优先用 `electron.net.fetch`（跟随系统代理/PAC），失败或非桌面环境回退 undici。
  已验证：流式、POST body 均无损。改动面：`canvas-proxy/server.js`（加 fetchImpl 注入）+ `desktop/main.js`（传入 net.fetch）。
- B. 502 响应体带上诊断信息：`{error, cause, host}`，前端展示成
  「无法连接 api.xxx.com（DNS 解析失败），请检查网络或代理」。
- C. 生图超时从 10min 降到可配置，并在 60s/120s 时给「仍在等待上游」的提示。
- D. 设置页/文档加一条：Windows 用 Clash 请开 TUN（虚拟网卡）模式，仅「系统代理」对本应用无效。

## 待用户确认
- 该用户用的是什么 API 域名（官方还是中转）、是否开了代理、什么模式。
