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

## 0.24 修复合集（2026-10-21，release desktop-v0.24.0）
- **更新不再二次询问安装位置**：`desktop/main.js` 的 `launchInstaller` 在 win32 走 `spawn(filePath, ["/S", "--force-run"])`，静默覆盖安装并自动重启，复用注册表里的原有安装范围与目录（NSIS 模板自带 assisted/silent 分支，`/S` 即命中静默分支）
- **退出崩溃**：`app.on("will-quit")` 里 `stopAgentServerOnQuit()` 与 `proxyServer/shellServer.close()` 全部包 try/catch，窗口/托盘已销毁时不再抛未捕获异常（用户报的 main.js:344 at App.emit）
- **去掉 Windows 原生菜单**：`buildMenu` 非 darwin 直接 `Menu.setApplicationMenu(null)`，同时消掉「文件」空菜单和顶部空白行
- **Agent 探测重写**：`desktop/agent-hub.js` 与 `canvas-agent/src/agent/runtimes.ts` 都不再依赖 `sh -lc command -v`，改为扫 PATH + 常见安装目录（win 拼 `.exe/.cmd`）；新增 `detectDesktopApp` 识别 `/Applications/*.app` 与 `Program Files`；`listRuntimes` 返回 `cliInstalled/desktop/desktopPath/version/plugin`
- **一键连接**：`connectRuntime` = 探活/拉起内置 agent → 写 runtime → `ensureMcp` 装插件 → 返回 url+token；只有桌面版时降级为直接连通并给 warning。实测 codex 返回 `Added global MCP server 'infinite-canvas'.`
- **连接面板**：删掉「方式一 / 方式二」整段，只留三张运行时卡片 + 网页连接兜底；卡片显示「CLI / 桌面版 + 版本 + 插件已装」
- **首帧 403 坑**：canvas-agent `setCors` 只有 token 校验通过才把新 origin 写进白名单，面板首次 fetch 可能 403 导致卡片整块不渲染 → `agent-runtime-cards.tsx` 的 `load()` 依赖改为 `[url, token]`，连接信息就绪后自动重探
- **logo**：`web/public/logo.png`（256px，由 GAdocs/generated_images/infinite-canvas-logo-v2.png 生成）+ 顶栏用 `<img>`、`index.html` favicon 指向 png；app 图标仍用 v2 生成的 icns
- 版本号来源：根目录 `VERSION`（vite `__APP_VERSION__`）+ `desktop/package.json`，两处必须一起改，CI 也会按 tag 覆写
- 实测手段：用 `node --import` 钩子把 `electron` 换成桩，直接跑 `agent-hub.js` 的 `listRuntimes/connectRuntime`，绕开 GUI 验证真实探测链路

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

### 为什么"卡死"而不是"慢"（2026-10-21 实测）
- 实测 `curl` 限时 10s：GitHub release asset **61 KB/s**，npm registry 对照 **274 KB/s**（约 4.5 倍差距）
- GitHub 下载会 302 到 `release-assets.githubusercontent.com`，带**有效期仅 10 分钟的 SAS 签名 token**（URL 里 `se=` 参数）
- 111MB ÷ 61KB/s ≈ 30 分钟 ≫ 10 分钟 token 有效期 → 必然中途失效，连接进入 ESTABLISHED 但零数据；electron-builder 的下载器没有超时/续传，于是表现成"永远卡住"
- 结论：**换浏览器没用**。Chrome 走同一条 TCP/TLS 与同一系统代理，签名过期它同样会失败（最多是显示进度条/让你手动重试）；缓存里已有 zip 时正确做法是 `-c.electronDist` 离线打包，不是重下

## 应用图标（2026-10-21）
- 源图：`/Users/mac/Documents/GAdocs/generated_images/infinite-canvas-logo-v2.png`（1254²，满版圆角，半径≈16.9%）
- 生成脚本逻辑（PIL + iconutil）：内容缩到 824 → 叠加 `rounded_rectangle(radius=824*0.2237)` 的 squircle 遮罩（乘原图 alpha 防硬边）→ 贴到 1024 透明画布居中 → 导出 10 档 iconset → `iconutil -c icns`
- `build/icon.ico` 用原图满版方形重出（Windows 无圆角网格约定），多尺寸 16–256
- 校验：`iconutil -c iconset` 反解包得 10 个文件；包内 `Contents/Resources/icon.icns` 与 `desktop/build/icon.icns` sha256 一致
- 预览图：`/Users/mac/Documents/GAdocs/generated_images/infinite-canvas-icon-preview.png`



## 发布流程（desktop-v* tag 触发 CI）
- `git push origin main` → `git tag -a desktop-v0.23.0 -m ...` → `git push origin desktop-v0.23.0`，push tag 会触发 `.github/workflows/desktop-release.yml`，两个 build job（macos-14 出 arm64+x64 dmg、windows-latest 出 nsis）+ release job 自动建 Release（非草稿，assets 直接可下）
- 0.23 实测：tag 推送后约 12 秒 run 就出现，整个流程约 6 分钟；不需要 workflow_dispatch
- **坑（已修）**：工作流原先只 `pnpm install`(desktop) 再跑 electron-builder，用的是仓库里提交的 `desktop/agent/canvas-agent.mjs`。源码改了但忘了本地重打，发布出去的还是旧 bundle 且无人察觉。已在 "Install desktop deps" 后补 `npm ci`(canvas-agent) + `node scripts/build-agent.mjs`
- canvas-agent 用 npm（`package-lock.json`），esbuild 0.28.1 在锁里，`build-agent.mjs` 靠它 `requireFromAgent.resolve("esbuild")`
- 核对发布：`gh release view desktop-v0.23.0 -R Cc-kris/infinite-canvas --json assets --jq '.assets[]|.name'`；CI 内已自动验证 dmg 三件套（renderer/index.html、proxy/server.js、app.asar）与 Windows 安装向导的"选择安装位置"页
- 0.23 资产：`Infinite-Canvas-0.23.0-mac-arm64.dmg` 108.1MB / `-mac-x64.dmg` 112.9MB / `Infinite-Canvas-Setup-0.23.0-x64.exe` 90.9MB
