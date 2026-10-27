# @basketikun/canvas-proxy

Infinite Canvas 的本地转发代理。浏览器直连第三方 AI 接口时经常被 CORS 拦截，启动它之后，网页会把请求先发到本机，再由本机转发到目标地址。

代理只做转发：不改写请求体，不校验 API Key，不落盘任何日志。

## 使用

```bash
npx @basketikun/canvas-proxy@latest
```

默认监听 `http://127.0.0.1:23210`。桌面版应用启动时会自动检测并按需拉起本代理，无需手动配置；浏览器版需要在同一地址上自备代理。

带上 `@latest` 是因为 npx 会缓存已下载的版本，不加就可能一直运行旧版本。

可选参数：

```bash
npx @basketikun/canvas-proxy@latest --port 23210 --host 127.0.0.1
```

也支持 `PORT` / `HOST` 环境变量。

## 转发规则

把完整目标地址接在代理地址后面：

```
http://127.0.0.1:23210/https://api.openai.com/v1/models
        └─── 代理地址 ──┘└──────── 目标地址 ────────┘
```

请求方法、请求头（除 `host` 等逐跳头外）、请求体原样转发；响应状态码、响应头和响应体原样返回，并补上宽松的 CORS 头。SSE 流式响应按块透传，不做缓冲。

访问根路径 `/` 会返回代理版本信息，可用于连通性检测，不会记入转发日志。

## 出站连接与系统代理

桌面版会把两条出站通道交给代理，按顺序尝试：

1. **系统代理通道**：直接使用 Electron 的 `net.fetch`（Chromium 网络栈），会读取系统代理设置（Windows 的 WinINET / Internet 选项、macOS 的系统代理、PAC 脚本），因此 Clash / V2Ray 之类的「系统代理」模式对它有效。
2. **直连通道**：Node 自带的 `fetch`（undici），纯直连，不经过任何代理。

第一条失败（DNS 解析失败、连接被拒/被重置、系统代理没启动、握手超时）时自动换第二条，两条都失败才向前端返回 502。
如果上游对代理线路明确翻脸——返回 `403` / `407` / `451`（常见于国内中转站封境外 IP）——也会改试直连，
因为此时请求还没被受理，换一条路不产生任何费用；而 `401` / `429` / `500` 这类是接口自己的回答，不会再试第二次。之所以这样设计，是因为 Node 的 `fetch` 完全无视系统代理：如果只走它，用户开着「系统代理」模式时请求其实是直连出网的，接口在墙外就会表现为 `fetch failed`。

单独的 `npx @basketikun/canvas-proxy` 启动时会自己找系统代理（环境变量 → macOS 的 `scutil --proxy` → Windows 的
Internet 选项），找到就以 `NODE_USE_ENV_PROXY=1` 重启自己走代理，并把「直连」作为第二条通道自动兜底。
因此 `transports: ["system", "direct"]` 是默认形态。原因不只是「能不能连上」：同一条上游线路，直连下行只有
约 30 KB/s，一张 2 MB 的 base64 图片要白等 60~90 秒，走代理 1~2 秒就收完——生成耗时才因此从 90 秒掉到 23 秒。

想强制直连（或代理客户端本身有问题）时用：

```bash
CANVAS_PROXY_DISABLE_SYSTEM_PROXY=1 npx @basketikun/canvas-proxy@latest
```

Node 的 `fetch` 只认**进程启动时**的 `NODE_USE_ENV_PROXY`，运行中再赋值无效，所以上面是「重启自己」而不是改环境变量。
也可以自己指定代理：

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 npx @basketikun/canvas-proxy@latest
```

桌面版不需要这些环境变量，它直接用 Chromium 的网络栈。

### 失败时返回什么

两条通道都失败时返回 `502`，响应体里带可读原因，前端会原样显示：

```json
{
  "error": "无法连接 api.example.com：域名解析失败（ENOTFOUND）。建议：接口域名解析不出来，通常是网络不通或代理没走对；请确认代理已启动，必要时切换为全局/TUN 模式；已尝试 系统代理:ERR_PROXY_CONNECTION_FAILED / 直连:ENOTFOUND",
  "host": "api.example.com",
  "code": "ENOTFOUND",
  "attempts": [
    { "channel": "system", "code": "ERR_PROXY_CONNECTION_FAILED", "message": "net::ERR_PROXY_CONNECTION_FAILED" },
    { "channel": "direct", "code": "ENOTFOUND", "message": "getaddrinfo ENOTFOUND api.example.com" }
  ]
}
```

`code` 取直连通道的结果——代理自身的问题（比如代理没启动）不该掩盖「这个域名根本解析不出来」这个事实。

### 超时

启用系统代理通道时，等待上游响应头的上限是 180 秒（`CANVAS_PROXY_HEADER_TIMEOUT_MS` 可覆盖），两条通道共享 1.5 倍总预算，所以一个黑洞地址最多卡 270 秒而不是各卡一次。响应头到手后不再计时，生图这类长耗时请求照常等待，SSE 也照常按块转发。

## 转发日志

每转发一条请求就在终端打印一行，包含时间、方法、完整目标地址、上游状态码和耗时：

```
4:05:42 PM GET https://api.openai.com/v1/models -> 200 0.9s
4:05:43 PM POST https://api.openai.com/v1/images/generations -> 200 26.4s
4:05:45 PM GET https://api.example.com/v1/models -> failed (fetch failed) 1.6s
```

日志在收到上游响应头时打印，所以流式请求会立刻出现一行，而不是等整段响应结束。日志只输出到终端，不落盘，也不包含请求头和请求体，因此不会泄露 API Key。

## 安全提示

代理默认只监听 `127.0.0.1`，仅本机可访问。它会转发任何请求到任何地址，请不要用 `--host 0.0.0.0` 暴露到公网。API Key 依然由浏览器持有并随请求转发，代理本身不存储。

## 环境要求

Node.js >= 18。
