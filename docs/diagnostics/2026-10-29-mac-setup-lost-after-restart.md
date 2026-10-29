# macOS 安装版「配置渠道 + 生图记录，重启后全没了」查因

日期：2026-10-29　版本：Infinite Canvas 0.28.0（/Applications，已装包，非 dev）

## 结论（一句话）

数据没有被删。**渲染页的 origin 变了**：桌面壳把界面挂在 `http://127.0.0.1:23211`，
而配置（localStorage）和生图记录/画布/资产（IndexedDB）都按 origin 隔离；
一旦 23211 起不来，壳子**静默**换到 23212，界面就打开一个全新空库 —— 用户看到的就是"全没了"。

## 关键事实（都已实测）

1. 存储位置（0.28.0 实测）
   - 配置：localStorage `infinite-canvas:ai_config_store`
   - 记录/画布/资产：IndexedDB `infinite-canvas`，store = `app_state`（`infinite-canvas:canvas_store`、`infinite-canvas:asset_store`）+ `image_generation_logs`
   - 两者都是 origin 级隔离，**一荣俱荣、一损俱损** —— 这正好解释"配置和记录同时消失"。
2. 正常路径没问题
   - 正常退出（SIGTERM）再启动：配置、IDB 原样还在。
   - `kill -9` 强制杀（模拟崩溃/断电）：写入的 400 条记录、配置全都还在（Chromium leveldb 抗崩溃）。
   - userData 目录跨版本未变（0.25.9 与 0.28.0 都落 `~/Library/Application Support/Infinite Canvas`）。
   - 打包代码里没有 `clearStorageData` / `partition` / 退出清库逻辑（asar 原文已核对，与仓库 `desktop/main.js` 完全一致）。
3. 真正的坑在端口编排（`desktop/main.js`）
   - `SHELL_PORT = 23211`（渲染页），`PROXY_PORT = 23210`（本地代理），`PORT_SCAN = 12`
   - 渲染页端口被占 → `listen(port + 1)` **静默顺延**，只在日志里写一行，界面无任何提示
   - 代理扫描区间 `23210..23221` **包含 23211**；`detectRunningProxy()` 只有在端口返回
     `{app:"infinite-canvas", proxy:...}` 时才复用，否则走 `startProxyServer` —— 撞 EADDRINUSE 后继续 `port + 1`

## 复现（安装版实测，无需第二个画布实例）

```
# 让 23210 被一个"不会应答画布握手"的程序占住（模拟任意别的程序/半开监听）
python tools/ic_selfsteal.py     # 脚本见 docs/diagnostics/
```

启动日志：

```
[infinite-canvas] local proxy started at http://127.0.0.1:23211   <-- 代理抢了渲染端口
[infinite-canvas] renderer served at http://127.0.0.1:23212       <-- 界面被迫换 origin
```

此时窗口 `location.origin = http://127.0.0.1:23212`：
- `localStorage` 里没有 `infinite-canvas:ai_config_store`（配置"没了"）
- IndexedDB 是空的新库（生图记录"没了"）

**数据仍在**：把 23210 放开再启动，回到 `23211`，配置与记录原样出现（已实测 E2E 渠道与 IDB 键全部回来）。
同理：只要 23211 被任何程序（含用户自己的本地服务）占用，也会触发同样的"假丢失"。

## 修复建议（按性价比排序）

1. 代理扫描跳过渲染端口（一行）：`if (port === SHELL_PORT) continue;`，并让两段端口区不重叠（例如代理固定 23230+）。
2. 渲染端口**禁止静默漂移**：23211 起不来时不要自己 +1 换 origin，而是弹模态提示
   「23211 被占用，请关闭占用程序后重开」+ 按钮「打开数据目录」；实在要降级，也必须显式告知"本次为临时空间"。
3. 根治：改用自定义协议承载渲染页（`app://canvas/...` + `registerSchemesAsPrivileged`），
   origin 与端口解耦，永远不会因为端口变化而"丢数据"。
4. 兜底：启动时若发现同 userData 下存在其它端口的 canvas 数据（例如 `IndexedDB/http_127.0.0.1_2321x.indexeddb.leveldb`），
   提示"检测到旧数据，是否迁移/切回"，并提供一键恢复。

## 已实施修复（分支 fix/desktop-stable-origin）

`desktop/main.js` 三处：

1. `proxyPorts()`：代理只在 `23210..23221`（排除 `SHELL_PORT`）与自己独立的 `23240..23251` 段里找端口，
   从根上不再可能出现"自家代理抢自家渲染端口"。
2. `serveRenderer()` 只绑 `23211`，失败不再 `port+1`；`resolveRendererUrl()` 弹窗说明原因，给
   「重试 / 打开数据目录 / 退出」三个动作，绝不换 origin。
3. `legacyOriginHint()`：若 `userData/IndexedDB` 下存在 `http_127.0.0.1_2321x.indexeddb.leveldb`
   （旧版本漂移留下的数据），弹窗里额外提示那一层数据还在，可用「打开数据目录」查看。

验证（安装包 0.28.2 解包换入补丁版 main.js，同一 Electron 二进制真机跑）：

| 场景 | 结果 |
|---|---|
| 23210 被哑端口占 | 代理起在 23212，渲染仍在 23211 |
| 23211 被占 | 不出窗口、日志 `refusing to switch origin`、弹窗等待用户 |
| 端口全空 | 代理 23210 + 渲染 23211 |
| 23210 被占 + 重启 | origin 仍 23211，配置与 IndexedDB 记录原样保留 |

## 用户侧恢复办法（已可立即用）

完全退出 App（⌘Q），确认没有程序占着 23210/23211（`lsof -nP -iTCP:23211 -sTCP:LISTEN`），
重新打开即可回到原来的数据。数据目录：`~/Library/Application Support/Infinite Canvas/IndexedDB/`。
