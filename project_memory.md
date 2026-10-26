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

## 0.25.1 图标修正（2026-10-21，用户反馈「界面 icon 换了但 app logo 还是旧版」）
- 实测（像素比对，非猜测）：0.23–0.25 的 `desktop/build/icon.icns` **内容确实是 v2**，但排版是「图案缩到 824px + 1024 画布居中留 100px 透明边 + 自带 squircle」；macOS 26 会把这种带留白的图标**再套一层遮罩**，视觉上比界面 logo 小一圈，用户当成「没换」。
- 正确做法：`icon.png` 直接由 v2 母图（1254²，本身满幅带圆角）缩到 1024 **铺满**，不内缩、不额外留白；iconset 10 档 → `iconutil -c icns`；`icon.ico` 同源出 16–256。
- 校验手法：`iconutil -c iconset` 反解包 icns，与母图算灰度 MAE（满幅应 ≤1；内缩版是 4~5 且 alpha bbox 从 (100,100) 开始）；包内 `Contents/Resources/icon.icns` 与 `desktop/build/icon.icns` md5 必须一致（新图标 md5 `459fd932…`，1.87MB）。
- 发布：0.25.1（commit `bfb0728`，tag `desktop-v0.25.1`），CI 两个 build job + release 全绿，资产 3 个（mac arm64 114MB / mac x64 119MB / win 95MB）。
- 对比图（旧内缩 vs 新满幅）：`/Users/mac/Documents/GAdocs/infinite-canvas/icon-check/app-icon-before-after.png`；核查记录 `desktop/build/ICON_AUDIT.md`。

## 0.25.2 Windows 三项 + 连接串行化（2026-10-21）

- **升级仍弹「给谁安装/装哪里」**：`/S --force-run` 让 NSIS 自己从注册表猜位置与权限；旧装是 perMachine（`D:\Program Files\Infinite Canvas`）时静默分支不回退到既有路径，于是弹向导或另装一份到 `%LOCALAPPDATA%\Programs\Infinite Canvas`，用户点开的还是旧目录旧版本（这正是「升级了但图标/版本没变」的真因）。改法：`installOnWindows()` 用 `path.dirname(app.getPath("exe"))` 钉死原位覆盖，非 `%LOCALAPPDATA%` 加 `--allusers`，`net session` 判管理员，否则 `powershell Start-Process -Verb RunAs`；NSIS 硬约束 `/S` 大写、`/D=` 必须最后且不加引号。
- **Codex 连上但用不了**（`initialize response: connection closed`）：`canvas-agent/src/agent/codex-client.ts` 生成 Codex 的 `mcp_servers."infinite-canvas"` 时没带 `env`。打包版 command 是 Electron 可执行文件本身，缺 `ELECTRON_RUN_AS_NODE=1` 会被当 GUI 拉起。实测带 env 手动跑 `canvas-agent.mjs mcp` → initialize/tools/list 全通，不带则被关。修完必须 `node scripts/build-agent.mjs` 重出 `desktop/agent/canvas-agent.mjs`（CI 也会重打，仓库里的 bundle 只是兜底）。
- **Windows exe 图标不更新**：`win.signAndEditExecutable=false` 会整个跳过改写 exe 资源。改 true 后 CI 日志出现 `updating asar integrity executable resource executablePath=release\win-unpacked\Infinite Canvas.exe` 即为生效证据；另加 `extraResources: build/icon.ico → icon.ico`，BrowserWindow 在 win32 下设 `icon`。
- **连接中其它卡片仍可点**：前端 `agent-runtime-cards.tsx` 已有 `disabled={Boolean(busy)}`；补主进程单飞：`connectRuntime` 内 `connectInFlight` 复用同一 Promise，实际流程移到 `runConnect(spec, runtime)`。
- 发布：0.25.2（commit `0dad3a8`，tag `desktop-v0.25.2`，run 39567957971），三 job 全绿，资产 3 个（109MB / 114MB / 91MB）。
- 校验心得：本机下 GitHub 资产只有 ~15KB/s（91MB 要 1.7 小时），**不要靠下载 exe 验证**；改用 CI 日志的 rcedit 行 + 本地像素比对（`build/icon.ico` 最大帧 vs `web/public/logo.png` MAE=0.43、alpha 覆盖 96.8%）。

## 本机跑 electron-builder 的正确姿势（重要，别踩）
- **坑1**：本机到 GitHub CDN 只有 ~60KB/s，electron-builder 若判定缓存未命中会重新下 111MB 运行时，日志停在 `packaging … downloading` 几十分钟看着像卡死（`lsof -p <pid>` 能看到 `->cdn-*.github.com:https` 才写得进几 MB）。
- **坑2**：`code_run` 调用结束会连带杀掉它启动的子进程，所以本地打包必须 `nohup … > /tmp/x.log 2>&1 &` 后台跑，再轮询日志。
- **正解（实测 15 秒出包）**：`unzip -q ~/Library/Caches/electron/c6eaac…/electron-v38.8.6-darwin-arm64.zip -d /tmp/electron-dist` 然后
  `cd desktop && pnpm exec electron-builder --mac dir --arm64 --publish never -c.electronDist=/tmp/electron-dist`
  产物在 `desktop/release/mac-arm64/Infinite Canvas.app`，用于校验包内资源，不必出 dmg。

## Agent 运行时（Claude Code / Galley）相关事实（2026-10-21）
- 运行时切换：`POST /api/agent/runtime?token=<t>` body `{"runtime":"claude|galley|codex"}`；**token 只能放 query**（放 header 会报 invalid token）。查询用 `GET /api/agent/runtimes`、`GET /config`（含 runtime/runtimeLabel）。
- MCP 清单：`GET /agent/mcp?token=` 返回 `{runtime,supported,servers[{name,status,detail}],reason}`。Claude 走 `claude mcp list`（输出形如 `name: cmd - ✔ Connected`，失败时也是非零退出但正文有效）；Galley 明确 supported:false（MCP 由桌面版管理）。真实清单示例：ast-bro 失败(ENOENT)、infinite-canvas ready。
- 前端文案不要再硬编码 "Codex"：i18n key `agent.composer.selectModel/selectPermission`、`agent.panel.placeholder/initFailed`、`agent.composer.permission.automaticDescription` 已改为 `{{agent}}` 插值，调用点传 `agentRuntimeLabel()`（`web/src/lib/agent/agent-runtime-mode.ts`）。
- 对话页 MCP 汇总行 `conversationBootstrapView`：services 为空时不渲染（否则会出现「0 个 MCP 服务已完成初始化」）。Galley 无模型选择（turn 不接收 model，`/agent/models` 返回 []，面板自动隐藏模型按钮）。
- 本地 UI 验收套路：`vite build` 后用带 SPA fallback 的静态服务器（`python -m http.server` 会让 /canvas 404），页面 hash 传 `#agentUrl=...&agentToken=...` 自动连通；面板文本要取「对话框容器」innerText —— `aria-label="Agent 内容"` 其实是**标签栏**，聊天/技能内容在它的兄弟节点。

## 打包 mac dmg + 对已打包 app 做 UI 验收（2026-10-21 实测）
- 版本号只在 `desktop/package.json`（0.25.3）。打包：`cd desktop && CSC_IDENTITY_AUTO_DISCOVERY=false npx pnpm@10 exec electron-builder --mac dmg --arm64 --publish never -c.electronDist=/tmp/electron-dist`（`/tmp/electron-dist` 已有 Electron 38.8.6 解包目录；不给它就会去 GitHub 以 60KB/s 重下）。
...[Truncated]...
体所在，取 `window.infiniteCanvasDesktop.agentHub.list()/connect(runtime)`；app 自带 agent 监听 **17371**，token 从 `agentHub.connect()` 返回里拿。
- 切换运行时后要 `location.reload()` 让 renderer 重新 bootstrap 才会更新文案；直接调 agentHub 不刷新 React 状态。首页默认不打开 Agent 面板，需先点 `[aria-label="收起 Agent"]/打开 Agent`，再点 `[role=tab][aria-label="对话"]`。

## 发版：推 tag 就会自动出三件包，正文来自 desktop/RELEASE_NOTES.md
- `git push origin desktop-vX.Y.Z` 即触发 `.github/workflows/desktop-release.yml`（"Desktop installers"，macos-14 + windows-latest 矩阵），
  自动构建 **mac-arm64.dmg / mac-x64.dmg / Setup-x64.exe** 三件并上传到同名 Release（会覆盖本地手动上传的同名资产）。所以本机只需 `git tag` + push，不必自己传包。
- **Release 正文由 `body_path: desktop/RELEASE_NOTES.md` 决定**：先手写 `gh release create --notes-file` 会被 CI 用该模板覆盖成上一版旧文案。
  正确顺序：先改 `desktop/RELEASE_NOTES.md` 并提交 → 打 tag 推送；事后补救用 `gh release edit <tag> --notes-file desktop/RELEASE_NOTES.md`。
- gh 在 /opt/homebrew/bin/gh，且所有命令要带 `-R Cc-kris/infinite-canvas`。GitHub 下载速度只有 ~37KB/s，109MB 的包别想着拉回来复验；
  改用 `gh run view <id> --json headSha` 确认 CI 用的就是 tag 的 commit，再从日志 grep `[build-agent] canvas-agent` 证明 bundle 重新打过。

## Windows 自更新「下载完就退出、无安装窗口」= 0.25.4 已修（2026-10-22）
- 三个并列原因，缺一个都还是坏：① 非管理员时先套 `powershell Start-Process -Verb RunAs` 是**有害**的（UAC 被拒=用户看到「退出、没下文」；`-ArgumentList` 重拼引号会破坏含空格的 `/D=`）——assisted+Silent+注册表有 perMachine 时 NSIS 自己 `UAC_RunElevated`，原生就能提权，**不要自己预提权**；② 安装范围只认**单斜杠** `/allusers` `/currentuser`（源码依据 electron-builder `nsisScriptGenerator.js` 的 `flags()` → `assistedInstaller.nsh` → `StdUtils.TestParameter`），旧代码传 `--allusers` 被整条忽略；③ 失败必须抛出并提示，别 log 完照样 `app.quit()`。
- 现行实现：`desktop/main.js` 的 `buildInstallerArgs()` 返回 `["/S", perUser?"/currentuser":"/allusers", "--force-run", "/D=<exe dir>"]`（`/D=` 必须最后且不加引号）；`installOnWindows()` 等 `spawn` 事件确认 pid 再 `unref`，`error` 直接 reject；下载后比对 `asset.size` 与实收字节数。
- 可观测性：升级日志写 `%APPDATA%\Infinite Canvas\update.log`（= `app.getPath("userData")`，productName 是 `Infinite Canvas` 不是中文）；升级前落 `pending-update.json`，重启后版本号没变就弹「上次更新到 x.y.z 没有完成」+「打开下载页」。
- **跨版本自更新的第一次永远跑旧代码**：老用户必须先手动装一次新版，发布说明里必须写明，否则他们会以为没修。
- 无 Windows 机时的验证套路：`node --check` + 从 main.js 用 `indexOf` 切出真实函数喂 `new Function`，桩掉 electron/node:path/child_process 并 `Object.defineProperty(process,"platform",{value:"win32"})`，断言参数形态与失败分支（`node:path` 在 macOS 上对 Windows 路径 `dirname` 得 `.`，是脚手架现象）。

## 2026-10-22 排障：Win 用户生图「fetch failed / 生图请求超时」
- **根因（实测，非猜测）**：`canvas-proxy/server.js` 的出站 `fetch()` 是 Node/undici，**完全不读 Windows「系统代理」注册表设置，也不读 HTTPS_PROXY**。Electron 38 实测：`session.setProxy` 指向死端口时 Node fetch 仍 200，只有 `electron.net.fetch` 报 `ERR_PROXY_CONNECTION_FAILED`。→ 用 Clash「系统代理」模式（未开 TUN）的用户，应用出站全是直连，墙外 API 必然失败；上游 basketikun 的 canvas-proxy 同逻辑未修。
- `fetch failed` 是 undici 的 DNS/连接失败原话，proxy 以 502 `{error}` 原样回传，前端 `readAxiosError` **优先取 body.error** → UI 直显，可据此断定是**主进程出站**失败而非渲染层网络。生图超时 = `web/src/services/api/image.ts` 的 `IMAGE_REQUEST_TIMEOUT_MS = 10 * 60_000`（ECONNABORTED → imageTimeout）。
- 修复已验证可行：出站改用 `electron.net.fetch`（跟随系统代理/PAC），实测 SSE 分块时序与 undici 一致（424/814/1217ms）、200KB POST body 完整。落地需 server.js 加 `setFetchImpl` + desktop/main.js 注入 net.fetch，并留 undici 兜底给 npx/浏览器版。
- 复现/验证脚手架在 `/tmp/e-proxy-test2`（易失，重搭要点：Electron 入口必须是「目录 + package.json main」，直接把 .mjs 当 app 参数不执行；`startProxyServer` 返回 server 本体而非 `{server}`；代理 URL 格式是 `http://127.0.0.1:23210/<完整上游URL>`）。

## 2026-10-22 落地：canvas-proxy 出站双通道（0.25.5）
- 设计：`startProxyServer({ transports })`，desktop 传 `[{name:"system",proxyAware:true,fetch:net.fetch},{name:"direct",...,fetch:undici}]`；有头响应即停止重试，body 只在选定通道后才流式，所以重试不会给客户端半截数据（POST 重试安全，因为 body 已先 buffer 完）。
- 上游 `403/407/451`（国内中转封境外 IP）时从代理通道改试直连，此时请求未被受理不产生费用；`401/429/500` 不重试。
- **loopback 目标强制直连优先**（`isLoopbackTarget` 按 `Number(proxyAware)` 排序）：用户 VPN 挂了也不要让 127.0.0.1 的请求去绕代理。
- 超时：只卡「等响应头」，默认 180s（`CANVAS_PROXY_HEADER_TIMEOUT_MS`），两通道共享 1.5x 总预算，黑洞地址最坏 270s；头到手后不计时 → 生图/SSE 不受影响。
- 失败文案取 **direct 通道** 的 code 作主因，否则代理没启动的 `ERR_PROXY_CONNECTION_FAILED` 会掩盖真正的 `ENOTFOUND`；502 body `{error,host,code,attempts}`，前端 `readAxiosError` 直接显示 `error`。
- **坑（自己踩的）**：`req.on("close")` 在 POST **请求体读完**后就会触发，不能当「客户端断开」用——会误判成已取消，一次都不发请求，最终 502「Cannot read properties of undefined (reading 'code')」（attempts 为空）。正确做法是监听 `req.socket` 的 `close`。
- 验证：`/tmp/e-proxy-test3`（Electron 里 setProxy 指死端口）证明 T1 自动回退直连成功、真实 API 401 透传、坏域名 502 中文、SSE 36/14/12B@12/308/706ms、200KB POST 完整、6MB 二进制 sha256 一致。
- 独立版 `npx @basketikun/canvas-proxy` 只有 node 通道；**Node 的 fetch 默认不读 HTTPS_PROXY**，要 `NODE_USE_ENV_PROXY=1`（Node 24 实测有效：设死代理 + 该变量 → 立刻 ECONNREFUSED），index.js 已加启动告警。
- 自动更新（`desktop/main.js` 的 RELEASES_API / 安装包下载）同样从裸 fetch 换成 `outboundFetch`，否则 GitHub 打不开的网络环境下更新检查静默失败。
- cc-ai.xyz 实测：站点根 `/` 返回 **403**（Cloudflare 拦非浏览器/境外线路），`/v1/models` 返回 401 → **站点和 API 是不同链路**；应用只走 API（`buildApiUrl` 拼 `/v1`，gemini 拼 `/v1beta`，无任何请求首页的路径）。

## 2026-10-22 发布 0.25.5（含本次 proxy 修复）
- 发版就是 `git push origin main` + `git tag -a desktop-v0.25.5 -m "..."` + `git push origin desktop-v0.25.5`；CI 自动跑 mac dmg(arm64/x64) + win nsis + 校验 + 建 release，约 3 分钟出全部产物。`VERSION` 与 `desktop/package.json` 里的版本由流水线按 tag 覆写，本地不必手改到完全一致（但本地改一下便于自测）。
- 发布说明顺序很重要：`desktop/RELEASE_NOTES.md` 的第一节就是 release 正文开头，新版本内容要放最前，历史升级提醒放后面；已发布的正文可用 `gh release edit <tag> -R Cc-kris/infinite-canvas --notes-file desktop/RELEASE_NOTES.md` 事后修正（不用重新打包）。
- 校验发布：`gh release view desktop-v0.25.5 -R Cc-kris/infinite-canvas --json assets`、`gh api repos/Cc-kris/infinite-canvas/releases/latest -q .tag_name`（应用内更新读的是 `/releases/latest`，必须是 non-prerelease 才会被看到）。资产名要和 `desktop/main.js` 的匹配规则对齐：win `*-Setup-*x64.exe`、mac `*-mac-{arm64,x64}.dmg`。
- 新 tag 后 main 若再提交（如改说明），不会重跑 release（只监听 tag），tag 指向的仍是旧 commit——正文与仓库文件短暂不一致，靠 gh release edit 补齐。
- 仍待办：`canvas-proxy` 已升到 0.1.1 但**未 `npm publish`**，所以 `npx @basketikun/canvas-proxy@latest` 拿到的还是 0.1.0（桌面版不受影响，proxy 是随包内置的 server.js）。

## Release 清理（2026-10-22 实操）
- `gh release delete <tag> -R Cc-kris/infinite-canvas --yes` **只删 release 对象与资产，保留 git tag**；要连 tag 一起删才加 `--cleanup-tag`。清完 `gh release list` 只剩想留的那条，`gh api repos/.../tags` 里 desktop-v* 仍在。
- 旧 release 可以放心清：应用内更新读的是 `/releases/latest`（只认一条），历史安装包对更新链路没用；删完后 `releases/latest` 仍指向新版、资产数不变即健康。
- 清理后必查三样：`gh release list`（应只剩 1 条）、`gh api .../releases/latest -q .tag_name`、`gh release view <tag> --json assets`（确认 3 个包还在）。

## Agent 连接互斥 / 卡「连接中」（2026-10-22 修复 c68112b）
- 现象：Win 上连着 Claude Code 再点 Codex，一直「连接中」且其他 Agent 按钮还能点。根因两条：①`connectRuntime` 里全局 `connectInFlight` 不区分 runtime，点另一个 Agent 会拿到上一条 promise（结果串味、界面无从判断）；②前端 `busy` 只是组件内 useState，面板重挂载/事件丢失就解锁；③`readCliVersion` 在 `listRuntimes()` 里用 **spawnSync** 跑 `--version`（4 个 CLI × 15s 上限），每次广播 changed 都同步阻塞主进程。
- 现机制：`connectState{runtime,startedAt,stage,promise}` 全局唯一；点别的 runtime 立即返回 `{ok:false,busy:true,runtime,error}`；同 runtime 复用同一流程；`withDeadline` 120s 兜底；阶段 detect→server→runtime→plugin→verify 通过 `listRuntimes().connecting.stage` 给界面；开始/结束都 `notifyAgentHubChanged()`。前端 `serverBusy` 锁全部按钮 + 1.5s 轮询兜底。
- 版本号缓存 `CLI_VERSION_TTL_MS=10min`、单次 5s：`listRuntimes` 连续调用已从百毫秒级降到 1ms。
- 测 agent-hub 的办法（无需启动 Electron）：把 `desktop/agent-hub.js` + `desktop/agent/canvas-agent.mjs` 拷到 `/tmp/agenthub-test`，配 `{"type":"module"}` 的 package.json，写 `node_modules/electron` **ESM** 桩（导出 app/BrowserWindow；CJS stub 会报 "does not provide an export named BrowserWindow"），`HOME=/tmp/xxx` 隔离 `~/.infinite-canvas` 与 CLI 配置，然后直接 `node test.mjs`。跑完必须 `stopAgentServerOnQuit()` 收掉 17371 上的服务。
- 【重要坑】项目私域目录 `temp/projects/infinite-canvas-701e72df` 是 `/Users/mac/Documents/Dev/infinite-canvas` 的**软链接**：往里写任何临时文件都等于写进 git 工作区，测试目录一律放 `/tmp`。
## 发版动作清单（0.25.6 实操，2026-10-22）
- 版本号两处必须同时改：`VERSION`（格式带 v：`v0.25.6`，vite.config.ts 构建期注入 `__APP_VERSION__`）+ `desktop/package.json`；**改 package.json 用逐行 patch，别用 json.dump 整体重写**（会重排 224 行，diff 全糊）。
- `desktop/RELEASE_NOTES.md` 新版本节放**最前面**（release 正文整篇取这个文件，CI 不裁剪）。
- 改完版本号必须**重新 `pnpm build`**，否则界面/包内还是旧版本号（dist 是提交前产物，CI 会自己重建，但本地自检要对得上）。
- 流程：commit → push main → `git tag -a desktop-vX -m "..."` → push tag → 工作流 `Desktop installers`（仅 tag `desktop-v*` 或 workflow_dispatch 触发）出 3 件包：mac-arm64.dmg / mac-x64.dmg / Setup-x64.exe → 校验 `releases/latest` 的 tag_name + 资产数 3 → 按用户偏好删旧 release（**保留 tag，只删 release**）。
- **坑：macos-14 job 会被 GitHub 直接 cancel**，注解 `The job was not acquired by Runner of type hosted even after multiple attempts` + 提示 arm64 runner 容量受限；排队约 15 分钟就会取消，连带 release job skip，整个 run 变 failure。**处置：不要改代码、不要重打 tag，直接 `gh run rerun <runid> --failed`**，重跑通常几十秒就拿到机器并成功（0.25.6 实测：18:05 排队→18:20 取消→rerun→18:30 mac/win+release 全绿）。
- 查这类失败别用 `gh run view --log-failed`（返回空），用 `gh api repos/<repo>/actions/runs/<id>/jobs` 逐个 job 拉 `/annotations` 才看得到原因。
- 用户明确表示：**本地 electron-builder 打包是多余的**，推 tag 让 CI 出包即可；本机只在需要排查「包内文件对不对」时挂 dmg 抽查（`hdiutil attach` → 看 Resources/renderer/index.html 指向的 hash、Resources/proxy/server.js、app.asar）。
- 应用内更新（回答「能不能不重装」必查）：不是只跳网页——`update:check` → `update:download`（主进程下载 + `update:progress` 进度）→ `launchInstaller` 静默覆盖安装到当前 exe 目录（Win 参数 `/S /currentuser|/allusers --force-run /D=<dir>`，`/D=` 必须最后且不加引号）→ 应用退出后 `--force-run` 拉起新版；`update-pending.json` 记录 from/to，版本没变会弹「升级未生效」。入口：顶部导航右侧的**版本号文字**（`user-status-actions.tsx` → `version-release-modal.tsx`），有新版本时旁边一个绿点，点开按钮是「更新到 x.y.z」。0.21 起就有（commit 2d6214b）。
- 更新通道网络细节：桌面端 `checkLatestVersion` 优先走 `bridge.checkUpdate()`（主进程，0.25.5 起用能跟随系统代理的 net.fetch）；renderer 里 `fetch(raw.githubusercontent.com CHANGELOG)` 失败只是历史列表退回本地，不影响安装。真正风险是 **91MB 安装包下载速度**（本机到 GitHub 资产仅 13–50KB/s），慢到用户以为卡住；下载后有字节数校验，截断会报 `installer incomplete`。

## 发版 0.25.7（2026-10-22，多运行时对齐 + 更新弹窗兜底）
- 本轮修的四件事同时进 0.25.7：更新弹窗空白（CHANGELOG 补 0.25.x + Release 正文兜底 `notesToItems/withReleaseNotes` + `update:check` 返回 `notes`）、切运行时模型列表不刷新（`runtime.changed` 广播 + 模型 effect 加 runtime 依赖 + galley 走 `galley llm list` + 无档位模型给占位档而不是丢弃）、选 Claude/Galley 仍拉 Codex（`app.listen`/`reset`/`resume` 三处加 `isBridgeRuntime` 守卫）、功能对等（附件、`session stop` 中断、换模型自动 `session new`、同模型 `session send` 续接）。
- `runtime.changed` 是**新增**事件名，前端 `local-agent-panel.tsx` 监听后 `runtimeRevision++` 触发重取模型；后端切运行时/连接完成都要广播。
- 更新弹窗数据链路（排查任何「没有更新内容」先看这里）：`use-version-check.ts` 用 `RELEASE_REPO="Cc-kris/infinite-canvas"` 的 `raw/main/VERSION` + `raw/main/CHANGELOG.md` + `releases?per_page=30`；desktop 侧 `main.js` 用同一 REPO 的 releases API。**fork 与上游 basketikun 必须分清**：`gh` 不加 `-R Cc-kris/infinite-canvas` 会默认解析到上游，查不到 tag/run。
- 校验「已装旧版能不能看到更新」不用装新包：`curl -s -w "%{http_code}" raw.githubusercontent.com/Cc-kris/infinite-canvas/main/VERSION`（应 200 + `v0.25.7`）与 `CHANGELOG.md` 首屏含 `## v0.25.7` 即可，旧版点更新就能出内容（兜底代码只在新包里有，旧版靠 CHANGELOG 正常记录）。
- CI 会 `[build-agent] canvas-agent -> agent/canvas-agent.mjs` 从 tag 源码重建 agent bundle，**不用担心仓库里 `desktop/agent/canvas-agent.mjs` 是旧产物**；想确认可 `gh run view <id> --log | grep build-agent`。
- 验证 bundle 里的 galley 逻辑别搜「llm list」这种带空格串——源码是数组参数 `["llm","list"]`，bundle 里搜 `"llm"` / `"session"` / `"supervisor"` 才有命中。
- 本机从 GitHub 资产下载 dmg 只有 ~1MB/min（115MB 要一小时），**别用下载再挂载的方式做发布验收**，用 tag 源码 + CI 日志 + raw VERSION/CHANGELOG 三个证据即可。
- 0.25.7 结果：run 39794987310 全绿（mac 排队被 cancel 后 `gh run rerun --failed` 重跑即过），三件包 114.6MB/119.6MB/95.5MB。

## macOS 剪贴板快捷键全失效（2026-10-23，0.25.8）
- 现象：配置→「编辑渠道」里所有输入框（Base URL / API Key / 模型名）都不能 ⌘V 粘贴，⌘C/⌘X/⌘A 同样失效。根因不在 web 层（grep 过，无 paste/keydown 拦截；渠道抽屉是普通 antd `ant-input`），而是 `desktop/main.js` 的 `buildMenu()`：darwin 分支只 `Menu.buildFromTemplate([{ role: "appMenu" }])`。**macOS 的 ⌘C/⌘V/⌘X/⌘A/⌘Z 是菜单项 key equivalent 派发的，没有「编辑」菜单就永远发不到渲染层**——以后改这个函数别再精简掉编辑菜单。Windows/Linux 走 `Menu.setApplicationMenu(null)`，Ctrl+V 由渲染层自己处理，不受影响。
- 修法：编辑菜单 role 版（undo/redo/cut/copy/paste/pasteAndMatchStyle/delete/selectAll）+ 窗口菜单 + `attachContextMenu(window)`（`webContents.on("context-menu")` 自己 popup，macOS 无默认右键菜单）。渲染层已对 input/textarea 早退（`project.tsx` keydown guard），所以画布的 ⌘Z 撤销不会被菜单抢走。
- 本机验证不受 AX 权限限制的招（osascript `UI elements enabled=false`、python `AXIsProcessTrusted()=False`，合成不了真按键）：① 装「探针 asar」在 `whenReady` 里 dump `Menu.getApplicationMenu()` 结构；② 用 `wc.paste()` / `Menu.sendActionToFirstResponder("paste:")` 走原生响应链，再 `executeJavaScript` 读真实输入框 value——这能覆盖「菜单 role → 编辑命令 → 真输入框 → React state」整条链，只有「⌘V 键 → 菜单项」这一跳靠平台保证。注意 `pasteItem.click(...)` 无效（role 项的 click 不是原生动作），别拿它当证据。
- 热补已装 app（用户跑的是 `desktop/release/mac-arm64/Infinite Canvas.app`，`/Applications` 里没有副本）：`node_modules/.pnpm/@electron+asar@3.4.1/.../bin/asar.js` extract → 换 `main.js` → pack → 覆盖 `Contents/Resources/app.asar`（备份 `/tmp/app.asar.backup-0.25.6`）。`app.asar` 里的 `package.json` 版本也要一起改，否则界面版本号与仓库不一致、还会弹更新提示。
- 该 app 的 CDP：`--remote-debugging-port=9333` 可开，但 websocket 必须 `suppress_origin=True`（否则 403）；`curl --noproxy '*'`。用它点「配置」→「编辑」可核对真实抽屉的 DOM。

## 「Mac 版点击反应很慢，没有 win 快」的定位（2026-10-23）
- 先分清是哪台机器：用户 2026-10-23 澄清慢的是**另一台被 UU远程 控制的 Mac**，不是本机。以后遇到「某平台慢」先问清机器，别在本机白测。
- 本机（M4/1080p@60Hz/arm64 原生、非 Rosetta）实测**代码层没有任何性能问题**，可直接引用的数字：冷启动到画布可交互 1.07s（load 174ms）；路由切换 1.2–17ms（无路由懒加载，单包 3.58MB）；wheel 每事件约 2ms；rAF 帧滞后 0.1–2.4ms；96 次点击输入延迟 0.2–1.2ms、无 longtask。**所以「3s 才响应」不是 React/zustand 渲染慢**。
- 真正的可疑机制（已在本机复现）：Electron 窗口被判为遮挡时，Chromium 把绘制压到 ~1fps。用 `open -a Galley` 把画布窗口压到后面：`document.hidden=true`，**1.5s 内 rAF 0 帧**（画面冻结），而 React 路由 commit 仍 6ms → 状态早变了、画面几秒后才变，正是用户的症状。远程桌面/宿主屏幕息屏时最容易触发。
- 修法（已改 `desktop/main.js` 并推到 origin/main，commit 083761f）：顶部 `app.commandLine.appendSwitch` 三个开关 `disable-renderer-backgrounding` / `disable-background-timer-throttling` / `disable-backgrounding-occluded-windows`，webPreferences 加 `backgroundThrottling: false`。同条件复测：`hidden=false`、rAF 30/30 帧、点击照常提交。
- 验证手法（无 AX 权限也能做）：dev 模式 `cd desktop && zsh -lc './node_modules/.bin/electron . --remote-debugging-port=9334'`（必须 login shell，否则 `node: not found`；`cdp.py` 的 `Session(port=9334)`，默认 9333）。遮挡 = `open -a Galley`，还原 = `Page.bringToFront`。注意窗口在后台时 rAF 会整体停摆，测时序前必须先 `bringToFront` + `activate`，否则得到一堆 TIMEOUT/0 帧的假数据。
- 未验证的备选原因（若关掉节流后仍慢就该查这条）：那台机器 IDB 里的 `canvas_store` JSON 过大（节点图/视频日志 base64）→ 启动 `JSON.parse` + 切到视频工作台加载生成记录要好几秒，与 Windows 机器数据量不同也会造成「win 快 mac 慢」。
- 现场收尾：本机用户跑的是 `desktop/release/mac-arm64/Infinite Canvas.app`（不在 /Applications）；dev 测试完要 `pkill -f "remote-debugging-port=9334"` 再 `open -a` 拉回正式版，别把 dev 实例留在 23210/23211 端口上。

## Windows 上 Galley 运行时必然连不上（2026-10-23，0.25.8）
- 现象：Windows 用户装 0.25.7 后选 Galley，界面红字 `'galley' 不是内部或外部命令`（且是 GBK 乱码）。mac 上我实测全绿，因为**平台差异这块本地单测从没覆盖过**。
- 权威事实（Galley 源码 `~/Documents/Dev/galley/core/src/discovery.rs`）：登记文件 Windows 写 `%APPDATA%\galley\cli-path`（mac/linux 才是 `$XDG_CONFIG_HOME` 或 `~/.config`）；CLI 名 `galley.exe`，与 `Galley.exe` 同目录（`C:\Program Files\Galley\` 或 `%LOCALAPPDATA%\Programs\Galley\`）。IC 旧代码在 win32 也读 `~/.config` → 找不到 → 回退裸 `galley` + `shell:true` → cmd 必然报错，且 stderr 是系统代码页（GBK）。
- 修法：`runtimes.ts` 加 `galleyDiscoveryFiles()` 按平台列登记文件；`searchDirs()` 下探 `<dir>/<bin>/` 子目录，**目录名按小写比对**（别写死 `Galley` 大小写，mac 上大小写敏感）；`galley.ts` 的 CLI 路径改为每次调用现算（模块级常量会把一次失败永久缓存）、win 下 `.exe` 用 `shell:false`、stdout/stderr 先 UTF-8（fatal）再 GBK 解码，找不到 CLI 时给可照做的中文提示。
- 无 Windows 真机的验证手法：单测里 `Object.defineProperty(process, "platform", { value: "win32" })` **之后**再动态 `import()` 模块（`IS_WIN` 是加载期求值）；GBK 乱码用 `/bin/sh` stub 把 GBK 字节 `> &2` 即可复现整条链路。见 `canvas-agent/src/agent/galley-win32.test.ts`。
- 环境坑：非登录 shell 里没有 `node`/`npx`，跑测试用 `PATH=/usr/local/bin:/usr/bin:/bin ./node_modules/.bin/tsx --test ...`（node 在 `/usr/local/bin`，不在 homebrew）。
- 打包后核验 bundle 别搜中文：esbuild 会把非 ASCII 转成**大写** `\uXXXX`，搜「未找到 Galley」永远 0 命中，要搜 `\u672A\u627E\u5230` 或直接看 `friendlyCliError` 附近。

## 白虎远程取证的正确姿势（2026-10-23 实测）
- SSH 私钥在 `~/.ssh/hive_workers_ed25519`（global_mem 里写的 `temp/ssh_keys/` 已失效），主机 `administrator@100.119.66.94`，GA 根 `C:\Users\Administrator.PC-20260127QTCJ\GenericAgent`。
- **但 2026-10-23 实测白虎不可达**：ping 100% 丢包、22 端口 timeout；`Tailscale status --json` 显示 `PC-20260127QTCJ windows offline, last seen 2026-09-15`。它是这个 tailnet 里唯一的 Windows 节点。
- 结论：想在 Windows 实机上验证 IC/Galley 问题，先去 `tailscale status` 看 `Online`，别直接 ssh 浪费时间；离线就只能请用户开机联网，或让用户贴 PowerShell 输出。

## 0.25.9 打包实录：别再用 electron-builder 在本机等（2026-10-23）
- 本机 `electron-builder --mac dmg --arm64` 会**重新下载 Electron 38.8.6（110MB）**，实测只有 ~140KB/s，卡在 `packaging` 阶段十几分钟（日志最后一行停在 `downloaded label=electron progress=100%` 是假象；用 `lsof -p <pid>` 能看到它还在往 `/private/var/folders/.../electron-download-*/electron-v38.8.6-darwin-arm64.zip` 里写）。`~/Library/Caches/electron/c6ea…/` 里有完整 zip 也不会被复用。
- **更快的等价做法（本次采用，1 分钟出包）**：`desktop/node_modules` 里**没有 asar 工具**（只有 electron / electron-builder 两个包），但 `main.js` 的路径解析是 `process.resourcesPath` + `here`（`here` = main.js 所在目录），所以可以直接把 `Contents/Resources/app.asar` 删掉，换成 `Contents/Resources/app/` 目录（放 `main.js`、`agent-hub.js`、`preload.cjs`、精简版 `package.json`，version 改成目标版本）——Electron 原生支持这种布局，`app.isPackaged` 仍为 true。`Resources/` 下的 `renderer/`、`proxy/`、`agent/` 是 extraResources，不用动。
- 改完必须 `/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString X.Y.Z"` 和 `CFBundleVersion`，再 `xattr -cr` + `codesign --force --deep --sign -`（arm64 必须 adhoc 重签，否则被改过的包打不开），`codesign -v` 应输出 `satisfies its Designated Requirement`。
- dmg 不用 electron-builder：`hdiutil create -volname "Infinite Canvas" -srcfolder <staging> -ov -format UDZO -fs HFS+ xxx.dmg`（staging 里放 app + `/Applications` 软链），261MB 的 app 压出 118MB。
- 验证 0.25.9 的判据（可复用）：启动时带 `--remote-debugging-port=9335`，CDP 里 `document.hidden` 应为 `false`、遮挡状态下 rAF 60 帧跑满。
- 注意 `release/mac-arm64/Infinite Canvas.app` 是**用户本机正在用**的包（Info.plist 版本还写着 0.25.6、asar 是手工打补丁的 0.25.8），不要直接覆盖它；新包放在 `release/mac-arm64-0.25.9/`。

## 遮挡节流修复：真机确认（2026-10-23）
- 用户把那台慢 Mac 换成 0.25.9 后反馈「比原来的那个不卡」→ `backgroundThrottling: false` + 三个 `disable-*backgrounding` 开关这一组，就是「远程桌面下点击数秒才响应」的根因修法。以后再遇到「Electron 桌面版响应慢、但代码测不出问题」，先查这项，别急着怀疑 React 渲染。
- 提醒用户做对照时要注意：`caffeinate -d` 是**静默阻塞**命令（不打印任何东西，Ctrl+C 才退出），它本身就能阻止息屏→阻止遮挡判定，所以「跑了 caffeinate 就不卡了」只能说明方向对，**不能证明补丁生效**；真正的判据是把 caffeinate 停掉后依旧不卡。用户当时也可能以为命令没生效就关掉了终端，所以结论要落在「停掉 caffeinate 复测」上。
- 官方发版通道：`.github/workflows/desktop-release.yml` 监听 `desktop-v*` tag（matrix: macos-14 + windows-latest，会自动发布安装包）。所以打 `desktop-v0.25.9` 就能出正式的 mac/win 包，不必再用本机手工组包的 dmg。

## 0.25.9 已正式发版（2026-10-23）
- tag `desktop-v0.25.9` 指向 `232b2d2`，推 tag 即触发 `.github/workflows/desktop-release.yml`（macos-14 + windows-latest + release job），本次实测 **270 秒全绿**，产出三个包：`Infinite-Canvas-0.25.9-mac-arm64.dmg`(109MB)、`Infinite-Canvas-0.25.9-mac-x64.dmg`(114MB)、`Infinite-Canvas-Setup-0.25.9-x64.exe`(91MB)。所以**不需要再在本机手工组 dmg**，除非急着用（CI 慢时可临时组一个，方法见上节）。
- 发版前必须改两份文案：`desktop/RELEASE_NOTES.md`（= GitHub Release 正文，CI 用 `body_path` 读取）和 `CHANGELOG.md`（= 应用内更新弹窗读取）。只改一个会造成「更新弹窗没内容」。
- **用户明确要求（长期有效）**：Release 说明里不要再写「无需签名 / 未做代码签名 / 首次打开被拦截 / 右键打开放行」这类提示。我此前把这段写在 RELEASE_NOTES 顶部，被要求删掉，本次已删成干净标题「# 无限画布 桌面版」。以后写发版文案直接跳过签名话题。
- `gh` 在这个仓库默认解析到**上游** `basketikun/infinite-canvas`（会 404），所有 gh 命令必须带 `-R Cc-kris/infinite-canvas`。

## 0.26.0 已发版：Agent 手选安装目录 + 修 Claude 模型列表（2026-10-23）
- tag `desktop-v0.26.0` 指向 `8fe5bf9`，run `39927848834` **约 4 分钟全绿**，三个包：`Infinite-Canvas-0.26.0-mac-arm64.dmg`(109MB)、`-mac-x64.dmg`(114MB)、`Infinite-Canvas-Setup-0.26.0-x64.exe`(91MB)；release 已自动标 Latest、prerelease=false（应用内更新读 `/releases/latest`，所以这一步必须核）。
- **仓库里的 `VERSION` 文件长期停在旧值**（0.25.9 发版时还是 v0.25.8，本次发 0.26.0 时也是 v0.25.8）。CI 在「Resolve version from tag」步骤里 `printf 'v%s' "$version" > VERSION` 覆盖它，所以**安装包内的版本是对的**；核对版本请看 run 日志里该步骤打印的 `v0.26.0`，不要拿 raw.githubusercontent 的 VERSION 当判据（否则会误判发版失败）。顺手已把仓库 VERSION 补到 v0.26.0（commit `29e175e`，晚于 tag，不影响安装包）。
- 本轮功能实现要点：手选目录存在 `~/.infinite-canvas/canvas-agent.json` 的 `agentPaths.<runtime>`，agent 端 `POST/DELETE /api/agent/runtime-path` 在该目录递归找可执行文件；桌面端对应 `agent-hub:pick-dir` / `agent-hub:set-path`；卡片仅在 `!installed || customPath` 时露出输入区。
- 修「Claude 拉不出模型列表」的真因是**前端运行时缓存把失败兜底成 codex 并缓存**，于是去请求 `/agent/codex/models` 必失败；现统一走 `/agent/models`（该路由按 `config.runtime` 分流并在响应体回传 `runtime`），解析失败不再落缓存。

## 0.26.0 本机「切页很卡」排查结论（2026-10-23，详细数据见 diag-0.26.0-lag.md）
- 应用侧实测没问题：切页 click→paint 中位 59–120ms、空闲主线程 0%、45s 无 longtask、堆稳定 23MB、IDB 仅 8.6MB、资源全缓存。**别再重复怀疑 React 渲染或数据量**。
- 真凶是整机级：`ps -p $(pgrep -x WindowServer) -o pcpu=` 稳定 **42–46%**、`UURemoteServer`（UU 远程被控组件）**16% 持续 6 小时**、swap 用掉 **8.8GB/10GB**、已连续开机 49 天、mds_stores 正在索引。以后再听到「本机装新版就卡」，先跑这两条命令排掉系统级/远程捕获占用，再看前端。
- 排查坑（会重复踩）：① `cdp.py` 的类名是 `CDP`（`.call/.ev/close`），不是 `Session`；② `ps -Ao pcpu | grep 'X (Y)'` 的括号被当正则 → 用 `grep -F` 或精确 PID；③ `Performance.getMetrics` 必须导航后静置 ≥4s 再取 `TaskDuration`，否则把挂载算成空闲；④ 自己注册的 rAF 会自驱动出帧，"N 秒 N 帧"不能证明应用在持续重绘；⑤ 运行时注入的 `<style>` 会在当前 SPA 会话里残留，污染后续测量，必须 `Page.navigate` 重载才干净。

## 更新说明约定（2026-10-24 重构）
- GitHub Release 正文改为**一版一文件**：`desktop/release-notes/<版本>.md`（只写本版改动），`_install.md` 是共用安装步骤；`.github/workflows/desktop-release.yml` 的 release job 按 tag（`desktop-vX.Y.Z`）取同名文件拼装 body，**缺文件直接失败**，不会再退回「发全量说明」。
- 旧的累积式 `desktop/RELEASE_NOTES.md` 已删除——它被 `body_path` 整篇当成每个 Release 的正文，这正是「每版都写所有版本」的根因。发版另需在 `CHANGELOG.md` 写本版小节（应用内更新弹窗读它，`__APP_RELEASES__` 打包时生成）。
- 历史 4 个 Release（0.26.0 / 0.25.9 / 0.25.7 / 0.25.6）正文已用 `gh release edit --notes-file` 逐个改写为单版本；gh 必须 `zsh -lc` 且 `-R Cc-kris/infinite-canvas`。

## 2026-10-24 README/docs 去上游化（a807bbe）
- 需求口径：README 只说「基于 basketikun/infinite-canvas 的二开」，赞助只留 CCAI（cc-ai.xyz，API base `https://cc-ai.xyz/v1`，素材取 `sub2apis/frontend/public/logo.png` → `assets/ccai.png`），上游 7 家赞助 logo（88api/apimart/atlascloud/infistar/metaso/packycode/heyroute）已 `git rm`。
- 上游联系方式散布 6 处，grep 复扫命令：`rg -n "1844025705|qm\.qq\.com|linux\.do|contrib\.rocks" --glob '!node_modules' --glob '!*.map' .`；本轮已清：README、SECURITY.md、docs/content/docs/support/{security,sponsor}{,.zh-CN}.mdx、business/{business}{,.zh-CN}.mdx、docs/src/lib/layout.shared.tsx(qqUrl+QQ 图标)、docs 首页 contrib.rocks 贡献者区块。
- `canvas.best` / `docs.canvas.best` 是本仓库自己（HouYunFei 提交）的演示站与文档域名，**不是**上游，别当上游痕迹删。
- docs 目录**没有 node_modules**，别直接 `pnpm build` 验证；语法校验用 `web/node_modules/.bin/tsc --noEmit --jsx react-jsx --noResolve --skipLibCheck` 再 grep `TS1xxx`/`TS6133`。

## 重启本机 3000 端口的网页版（2026-10-24 实测）
- 3000 = `/Users/mac/Documents/Dev/infinite-canvas/web` 的 **vite dev**（不是 dist 静态站，改源码即热更）。重启命令：
  `cd web && PATH=/usr/local/bin:/opt/homebrew/bin:$PATH nohup ./node_modules/.bin/vite --host 127.0.0.1 --port 3000 > /tmp/infinite-canvas-3000.log 2>&1 &`
  **必须显式带 PATH**（code_run 的非登录 shell 里没有 node，直接跑会 `exec: node: not found`），必须 nohup 后台（否则调用结束被回收）。
- 旧进程是 `npm exec vite` 拉起的（node PID 的父是 npm），kill 时两个 PID 一起收，再 `lsof -iTCP:3000 -sTCP:LISTEN` 确认释放。
- 「更新版本」= `git pull --ff-only`，页面版本徽标读仓库 `VERSION`（dev 下显示 v0.26.0）。验收：curl 200 + `#root` 有内容（6102 字）+ 徽标版本。

## 参考图不生效的头号原因：@[node:...] token 悬空（2026-10-24 实测，必读）
- config 节点只要 `metadata.composerContent` 非空，`buildComposerGenerationContext`（`web/src/components/canvas/canvas-node-generation.ts:66`）就**只认 token 指向的节点，连线本身被忽略**；token 指向已删除节点时不报错：标签变空串、该输入不进 selectedInputs → `referenceImages=[]` → 走 requestGeneration（纯文生图）而不是 requestEdit（/images/edits）。
- 现场特征：成品节点 `metadata.generationType === "generation"` + `references.length === 0`，而 prompt 里出现「先看 。」这种空标签。真正的图生图节点是 `generationType:"edit"` 且 `references` 有值。
- 已修项目 `Z1EEWcwo...`（亚马逊出图sop）：7 个流程 config 的 token 由已删的 `image-1790664623792-0f3b0` 改成实际抠图结果 `hLnIpnlfYbVE_G6_KIY2t`（16 个 config → 悬空 0）。备份：`canvas_store_backup_20261024.json`。
- 零成本验证手法（不烧额度）：页面里 `await import('/src/components/canvas/canvas-node-generation.ts')`，取 IDB 里的 nodes/connections 直接调 `buildNodeGenerationContext(id, nodes, conns, composerContent)`，看 `referenceImages.length`。改成 1 且有 dataUrl 即通。
- 画布数据：IDB `infinite-canvas` / store `app_state` / key `infinite-canvas:canvas_store`（JSON 字符串，结构 {state:{projects,deletedProjects},version}）。改完必须 `location.reload()`，否则被内存态覆盖。
- 节点参考图元数据字段名是 **references**（不是 referenceImages）。

## 网页版 Agent 面板（2026-10-24）
- 网页版**有** Agent 面板：`layouts/user-layout.tsx` 挂 `<AgentPanel />`，无 Electron 门控；连接方式是填本地 Canvas Agent 地址+token（`services/api/canvas-agent.ts`，需本机跑 canvas-agent）。本机当时没跑 canvas-agent，页面显示「未连接」。

## v0.27 真实数据/页面验证手法与踩坑（2026-10-26）
- **别只做 UI 点检**：页面里 `await import('/src/...ts')`（Vite dev 直接编译 TS）就能跑真模块，零成本验逻辑，比读代码可信。跑 `canvas-node-generation` / `canvas-resource-references` 这类依赖节点注册表的模块，**必须先 `await import('/src/components/canvas/nodes/builtin-nodes.tsx')` 调 `registerBuiltinNodes()`**，否则 `getNodeDefinition` 全空、`referenceImages` 假性为 0——我在这上面误判过一次「fixedImage 不被识别」，其实代码是对的。
- 真实数据查法：IDB `infinite-canvas` / `app_state` / `infinite-canvas:canvas_store`（`db.transaction('app_state')` + `store.get(key)`，值是 JSON 字符串）。遍历 `state.projects` 得到每个画布 `{id,name,nodes.length,connections.length}`；实测本机两个画布：`0v-MdkxjdtaebYLLGspor`「无限画布 2」1 节点（fixedImage 落库证据）、`Z1EEWcwokfUMHKW19egIY`「亚马逊出图sop」40 节点/47 连线（回归基线）。
- 页面回归判据：`document.querySelectorAll('[data-node-id]').length` 只数**顶层可见框**（分组折叠时远小于节点数，40 节点只渲染 6 个是正常的），真正的完整性看左栏计数（与库里 nodes.length 对齐）+「错误节点数 = 0」。
- **HTTP 视频协议 URL 模板坑（已修 750c44b）**：`renderHttpTemplate` 在引号外走 `JSON.stringify`，给 URL 占位符加上引号 → XHR 实际请求变成 `"http://host"/submit?k="key"`，提交 404、轮询失败。修法：URL 用新增的 `renderHttpUrlTemplate`（原样 `String()` 替换），只有请求体/请求头继续用 JSON 版。以后凡是「模板里塞 URL」的地方都要用 URL 版。
- 真请求联调夹具：临时起 `python3` 假视频服务（POST /submit→`{"code":0,"data":{"task_id":...}}`、GET /poll/<id>→`SUCCESS`+`video_url`、GET /v.mp4 返字节），把渠道 `baseUrl` 指过去即可跑通「提交→轮询→下载」全链路；用 `XMLHttpRequest.prototype.open` 打点能直接看到真实 URL（本次靠它才发现引号 bug）。

## 2026-10-26 网页版 Agent 与客户端对齐（已完成）

三处根因（均已修复并实测，提交 6d8f19d）：

1. **输入框永久禁用** — `local-agent-panel.tsx loadThreads` 非 Codex 分支调用 `applyConversationState` 会因线程切换推进 `loadThreadsSequenceRef`，`finally` 里序列号不匹配就永不复位 `loadingThreads`（composer disabled 条件之一）。修法：apply 之后同步 `sequence = loadThreadsSequenceRef.current`（Codex 分支本来就有这一行）。
2. **发送后报 "Claude 退出码 1"** — `canvas-agent/src/agent/claude.ts buildArgs` 把 prompt 放在 `--allowedTools` 之后；该选项是可变参数，吞掉位置参数，CLI 报 `Input must be provided`。修法：prompt 排在 `--allowedTools` 之前。
3. **首轮回复后发送按钮卡“发送中”** — Claude/Galley 桥只发 `agent_event/turn.completed`，不发 `codex_state`，而前端只在 `codex_state(busy=false)` 里清 `sending`。修法：`turn.completed` 分支对当前线程收尾 `sending/waiting`。

**验证**：页面内连发两轮（"第一轮：只回 OK"→OK、"第二轮：只回 DONE"→DONE），每轮 `sending` 均复位为 false，activity=完成，无重复消息；连接设置卡片与客户端一致（已连接/运行时/CLI 版本/断开连接，无 URL+token 手填）。
**注意**：canvas-agent 改动需 `npm run build` 后用 `~/.infinite-canvas/agent-server.pid` 精确重启（hub 拉的是 dist/index.js）。

## 2026-10-26 参考图过大：工作台 + 画布 + 全协议统一（提交 768bf41 / 4da7c60）

- **根因不是协议，是体积**：sub2api/Cloudflare 处理内联图的成本随 base64 线性上升（1.5MB≈70s、2.8MB≈90~128s 后 524、5MB≈502）。画布节点/资产库原图是 1.8~2.3MB PNG，内联后请求体必然 2.8MB+。
- **压缩只在共享层做一次**：`web/src/lib/inline-image.ts`（`shrinkInlineImages`，最长边 1280 JPEG q0.86，>500k 字符降 0.7）。视频 plugin/gemini/http/openai 四条路径 + 生图 gemini parts/plugin refs（JSON 内联）+ `requestEdit`（multipart 上传）全部调用它。**以后调阈值只改这一个文件，别在页面里复制。**
- **同步验证约定（用户明确要求）**：工作台（`pages/video`、`pages/image`）与画布（`pages/canvas`、`components/canvas`、`canvas-node-generation.ts`）共用 `services/api/*`。任何「请求体 / 协议 / 轮询 / 存储」类修复必须落在共享层，并**两边各跑一次真实链路**才算完成；只验一侧等于没验。
- 实测数字：画布侧 2.28MB 原图 → `POST /v1/videos` 请求体 336KB，创建 5.87s（修复前同尺寸 92~128s 后 524），任务 completed，blob 5.04MB / 6.58s / 768×1344；生图 `images/edits` FormData 252KB（图片约 246KB），真实改图 27.9s 返回 URL。
- 踩坑（省下一次摸索）：
  - 画布/生图配置必须 `resolveModelRequestConfig(raw, raw.videoModel|imageModel)` 解析后再调 API，`raw.baseUrl` 是 `api.cc-ai.xyz`（调 `aiApiUrl` 会 404），解析后才是 `sub2api.1006000.xyz`。
  - 生图 `size` 必须是 16 的倍数，否则本地直接抛错、根本不发请求。
  - `image_files` IDB 是键值库（key=`image:xxx` → value=Blob），`getAll()` 丢 key，必须 `openCursor` 拿 key 当 `storageKey`。
  - `web_execute_js` 长任务只回 ACK：把结果写进 `window.__xxx` 再分次轮询读取。

## 2026-10-26 补：遗漏项的 UI 级复验（真正跑页面，不是只读码）

- **又抓到一个真 bug**：工作台点「开始生成」3 秒即失败、连请求都没发出去，报「图像尺寸的宽高必须是 16 的倍数」。根因是 `pages/image/index.tsx` 的 `previewGenerationLog` 把历史记录里的 `config.size`（`480x854`，既非 16 倍数又低于最小像素）原样恢复，下次点生成直接被本地校验拦住。历史遗留值会「传染」到当前配置。
- **修法（三处，均为共享层/共用组件）**：
  1. `services/api/image.ts` 导出 `isSupportedImageSize(size)`，把 `validateImageSize`/`resolveSize` 的校验包成布尔判断。
  2. `pages/image/index.tsx` 恢复日志配置前先判断，非法值不覆盖当前配置。
  3. `components/image-settings-panel.tsx`（工作台与画布配置节点共用）加 `useEffect` 自愈：尺寸非法时静默改成 `computeMediaSize("1k", 当前比例)`，用户不会再点了才炸。
- **UI 实测证据**：`/image` 与 `/canvas/<id>` 两个页面 reload 后 store 里的 `size` 都自动从 `480x854` 变 `864x1536`（DOM + zustand store 双证）。
- **工作台带大图端到端（真花额度）**：浏览器内造 2.66MB 噪声 PNG 走真实 `input[type=file]`+DataTransfer 上传 → 点「开始生成」→ 请求体 **0.411MB**（压缩 ~84%）→ **4分29秒**返回 → 结果区 `生成结果 864x1536 3.4 MB 4分29秒 加入我的资产 加入参考图 下载`。耗时大头仍在上游排队，不是本地压缩。
- **验收方法论（下次照做）**：验证必须是「点真实按钮 + 看真实 DOM/网络」，`web_execute_js` 长任务只回 ACK，把结果写 `window.__gen` 再分次轮询；页面 reload 会让 CDP 报 `Inspected target navigated`，直接重发即可。
- 提醒：`/api/assets/<key>` 这类路径不能直接 fetch（返回空），要造测试大图就在浏览器里用 canvas 生成噪声 PNG 再包成 File。

### 2026-10-26 生图两侧 UI 级实测（参考图压缩共享层）
- 工作台 `/image`：2.66MB 参考图 → 请求体 0.411MB，4分29秒返回 `864x1536 / 3.4MB`，结果区有「下载」。
- 画布图片节点：同一张图 → 请求体 0.411MB（同一条共享压缩路径），约 8 分钟返回，画布自动新建结果节点回填 `864x1536`。
- 另修：历史记录把 `480x854` 这类非法 size 写回配置，导致点生成 3 秒本地报错（提交 d84c555）。
