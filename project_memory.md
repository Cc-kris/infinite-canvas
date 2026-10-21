# Infinite Canvas — 项目记忆

## 仓库与环境
- 仓库: `/Users/mac/Documents/Dev/infinite-canvas`，remote `origin` = https://github.com/Cc-kris/infinite-canvas
- ⚠️ `gh` 在该目录默认解析到 upstream `basketikun/infinite-canvas`，所有 gh 命令必须显式 `-R Cc-kris/infinite-canvas`
- 本地 node v24 / pnpm 10.33；**无 wine**，Windows 包只能在 GitHub Actions 上打
- 本机到 GitHub release 下载限速约 13–50KB/s，别指望本地下载 100MB 安装包实测，用 CI 内验证

## 桌面版架构（desktop/，2026-10-20 新增）
- `desktop/main.js`：ESM 主进程。① 固定端口静态服务器 `127.0.0.1:23211` 托管 `web/dist`（固定端口保 IndexedDB origin 稳定）；② 检测 `127.0.0.1:23210` 是否已有健康 canvas-proxy → 有则复用，无则主进程内 `await import(proxy/server.js)` 启动
- `desktop/preload.cjs`：`contextBridge` 注入 `window.infiniteCanvasDesktop = { isDesktop, proxyUrl, appVersion }`
- `web/src/lib/desktop.ts`：读取桥接；`use-config-store.ts` 在桌面端强制 `proxyEnabled=true` 且 `proxyUrl=http://127.0.0.1:23210`
- 设置弹窗里原「本地代理」页签（`config-local-proxy.tsx`）已删除
- `canvas-proxy/server.js`（新）= 可复用服务端；`canvas-proxy/index.js` = CLI 入口
- electron-builder `extraResources`：`web/dist → Resources/renderer`、`canvas-proxy → Resources/proxy`

## 发布流程
- 工作流 `.github/workflows/desktop-release.yml`：矩阵 macos-14 / windows-latest → electron-builder 打 dmg(arm64+x64) 与 nsis(x64) → 上传 artifact → release job 聚合发布
- 触发：push tag `desktop-v*`，或 `gh workflow run desktop-release.yml -R Cc-kris/infinite-canvas -f version=desktop-vX.Y.Z`
- 流水线自带安装验证：mac 挂载 dmg 校验三件套；Windows `Start-Process /S` 静默安装后校验 `resources\{renderer,proxy,app.asar}`
- 坑1：刚推上去的新工作流，tag push 事件可能在 GitHub 注册工作流之前就发完了 → 用 workflow_dispatch 补触发，且两个 run 会抢同一个 release，记得 cancel 掉一个
- 坑2：release job 若没 `actions/checkout`，`body_path: desktop/RELEASE_NOTES.md` 读不到 → release 说明为空
- 安装包未签名：首次打开需放行（README/RELEASE_NOTES 已写 mac/win 放行步骤）

## 当前发布
- `desktop-v0.21.0`：mac arm64 dmg 110MB / mac x64 dmg 115MB / win x64 setup 94.7MB，三平台 job + 两项安装验证全绿

## 0.23 本地 Agent 三选一（2026-10-21）
- 连接面板 `web/src/components/agent/agent-runtime-cards.tsx` 三卡：Claude Code / Codex / Galley；`GET /api/agent/runtimes` 返回 installed+version，`POST /api/agent/runtime` 选中运行时（写 `~/.infinite-canvas/canvas-agent.json` 的 `runtime`）
- `canvas-agent/src/agent/runtimes.ts`：探测 claude / codex / galley；Galley CLI 不在 PATH，需读 `~/.config/galley/cli-path`
- `desktop/agent-hub.js`：用登录 shell 取 PATH 后 spawn `Resources/agent/canvas-agent.mjs`，并为选中的 runtime 装 MCP 插件
- 单文件 agent 由 `desktop/scripts/build-agent.mjs`（esbuild，external `@openai/codex`）生成到 `desktop/agent/`；`pnpm dist:mac` 等脚本已串上 `build:agent`

## 打包环境两个坑（0.23 实测）
- **坑A：单文件里读不到版本** → `readPackageVersion()` 用 `fileURLToPath(new URL(...))` 而不是 `URL.pathname`，否则 `Infinite Canvas.app` 里的空格被编码成 `%20`，读文件失败显示 0.0.0；构建时另写 `agent/package.json`（只含 name/version/type）
- **坑B：Codex app-server 起不来** → `spawn(process.execPath, [codexBin(), ...])`；打包后 `codexBin()` 退化成命令名 `codex`，被当成 JS 交给 node → `Cannot find module .../agent/codex`。改为按后缀判断：`.js/.mjs/.cjs` 才用 node，其余直接 spawn 命令（win32 加 shell）
- 更新提示噪音：`CODEX_VERSION` 为空时跳过内置 codex 比对；`CANVAS_AGENT_SKIP_UPDATE_CHECK=1` 或内置 codex 缺失时跳过 npm 联网检查

## 本机离线打包（GitHub 下载被打断时）
- `electron-builder` 会卡在 "no custom electronDist provided, unpacking default Electron distribution"，socket 挂在 `cdn-*.github.com`（ESTABLISHED 但无数据），`sample` 显示主线程 idle
- 解法：`ditto -x -k ~/Library/Caches/electron/<hash>/electron-v38.8.6-darwin-arm64.zip /tmp/electron-dist`，然后
  `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64 -c.electronDist=/tmp/electron-dist`
- 产出 `desktop/release/Infinite-Canvas-0.23.0-mac-arm64.dmg`（未签名，首次打开需放行）

