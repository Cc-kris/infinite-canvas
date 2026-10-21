# Infinite Canvas 0.23 需求设计与进度

## 需求清单
1. 本地 agent 连接改为一键：列出 Claude Code / Codex / Galley 三卡，显示状态 + 连接/断开；点连接 → 自动装插件 + 联通；联不通 → 退回直跑（原有形式）
2. 去掉窗口左上角 编辑/视图/窗口 菜单
3. 生图 SOP 出 logo（画布+设计寓意），后续替换
4. 生图/视频工作台配置参数选中框改橙色
5. 去掉右上角文档入口

## 关键事实（探明）
- 桌面壳：`desktop/main.js`（ESM，Electron），`desktop/preload.cjs` 用 contextBridge 暴露 `window.infiniteCanvasDesktop`；`buildMenu()` 在 main.js ~L275，含 `{role:"editMenu"}`/`{role:"viewMenu"(自定义)}`/`{role:"windowMenu"}`
- 前端入口：`web/src/components/layout/user-status-actions.tsx` L45 文档图标（DOCS_URL）
- 选中框：`web/src/components/image-settings-panel.tsx`、`video-settings-panel.tsx` 的 `OptionPill`（选中 borderColor=theme.node.text）+ 比例按钮 borderColor
- 手动连接 UI：`web/src/components/agent/agent-connect-view.tsx`（url+token+连接按钮）
- 连接逻辑：`web/src/components/agent/local-agent-panel.tsx`（`connect()` ~L900，支持 `?agentUrl=&agentToken=` 查询参数、hash bootstrap、autoConnect）；`web/src/services/api/canvas-agent.ts`（discoverAgentConfig 走 /config）
- canvas-agent（Node/Express, @basketikun/canvas-agent 0.6.0）：端口 17371，token 存 `~/.infinite-canvas/canvas-agent.json`；`PORT` 可覆盖；端点 `/agent/codex/*`、`/agent/claude/turn`（spawn `claude -p --output-format stream-json`）；`AGENT_PROMPT` 读 `agent-instructions.md`
- canvas-agent 依赖装法：**npm ci 会因 lock 过期失败**，用 `npm install --no-package-lock`；`npm run build`（tsc）产出 dist ✅ 已在本机构建成功
- CLI 探测（macOS）：`/opt/homebrew/bin/{claude,codex}`，Galley CLI = `/Applications/Galley-0.6.2.app/Contents/MacOS/galley`（`~/.config/galley/cli-path`）
- 插件安装命令：`claude mcp add infinite-canvas -- npx -y @basketikun/canvas-agent@latest mcp`；`codex mcp add infinite-canvas -- npx -y ... mcp`；`codex plugin marketplace add <dir>` + `codex plugin add`
- Galley CLI：`galley session new <TASK>` 返回 JSON（session.id, dispatch）；`galley session wait <id> --until-idle`；`galley session show <id> --tail N`；`galley session follow/watch`（NDJSON）

## 设计
### A. 运行时（canvas-agent）
- `src/agent/runtime.ts`：`resolveRuntime()` 读 `CANVAS_AGENT_RUNTIME`（codex|claude|galley，默认 codex）；`/health`、`/config` 返回 runtime
- `src/agent/galley.ts`：`runGalleyTurn(prompt, emit)` → spawn galley CLI `session new` (JSON) → `session wait --until-idle` → `session show --tail 2` 取 assistant 文本 → emit 成与 claude 相同的事件形状 → `agent_done`
- `http.ts`：新增 `/agent/galley/turn`、`/agent/galley/interrupt`（尽力而为）

### B. 桌面端 Agent Hub（新 `desktop/agent-hub.js`）
- 目录（3 项）：claude / codex / galley，字段：id、name、cliPath、version、installed、pluginInstalled、connected、mode(linked|direct)、detail
- `detect()`：用登录 shell 解析 CLI（`zsh -lc 'command -v x'` + 常见路径回退），读版本
- `installPlugin(id)`：claude/codex 用各自 `mcp add`（幂等：先 remove 忽略失败）；galley 写 Galley skill（`managed-ga-state/skills/infinite-canvas/SKILL.md`，指向 canvas-agent HTTP + 指令）
- `connect(id)`：installPlugin → 解析 canvas-agent 入口（打包资源 `Resources/canvas-agent/dist/index.js` 或仓库 `../canvas-agent/dist/index.js`）→ spawn（ELECTRON_RUN_AS_NODE=1, env CANVAS_AGENT_RUNTIME=id）→ 轮询 `/config` 拿 url/token → 推给渲染进程（`agent:changed` 事件）→ web 自动连接
- 直跑兜底：canvas-agent 起不来 → 直接 spawn 对应 CLI（claude -p / codex exec 一轮）标记 mode=direct
- `disconnect(id)`：杀掉该 id 的 canvas-agent 子进程 + 清状态
- IPC：`agent:catalog`、`agent:connect`、`agent:disconnect`、`agent:refresh`，事件 `agent:changed`
- preload 暴露 `window.infiniteCanvasDesktop.agents`

### C. 前端
- `agent-connect-view.tsx` 改为卡片列表（有 desktop bridge 时），每卡：图标、名称、状态点、连接/断开按钮、模式标签；保留手动填写作为「高级」折叠
- 连接：调用 `bridge.connect(id)` → 返回 {url,token} → 复用现有 `connect()`（通过 onConnect prop/或写 store）

### D. 其他
- menu 只保留 appMenu（mac）
- 删文档图标
- OptionPill 选中色 → 橙色 #f97316（含比例/画质/数量按钮）

## 进度
- [x] 探明架构、构建 canvas-agent
- [x] 需求 2/5/4 改码（去菜单、去文档入口、选中色改橙）
- [x] canvas-agent galley runtime（codex/claude/galley 三运行时 + /api/agent/runtimes + /api/agent/runtime）
- [x] desktop agent hub + preload + 单文件产物（desktop/agent/canvas-agent.mjs）
- [x] 前端三卡片（AgentRuntimeCards）+ 连接/断开
- [x] logo 生图（GAdocs/generated_images/infinite-canvas-logo-v*.png）
- [x] 实测验收：三运行时探测正常、galley 一轮对话返回「收到」、卡片 UI 渲染正确
- [ ] 打包 dmg

## 0.23 实测记录（2026-10-21）
- canvas-agent 单文件：esbuild 需 `--banner:js` 注入 createRequire，否则 ESM 内 require 报错
- 打包后 codex 无法 `require.resolve("@openai/codex/package.json")` → codexBin() 三级回退（CANVAS_AGENT_CODEX_BIN → 依赖 → PATH）
- Galley CLI 不在 PATH，只在 `~/.config/galley/cli-path`；runtimes.ts / agent-hub.js / galley.ts 均特判
- Finder 启动的 Electron 只有极简 PATH → agent-hub 用登录 shell 取 PATH 传给子进程
- 验收：GET /api/agent/runtimes → claude 2.1.285 / codex 0.163.0 / galley 0.6.4；galley turn 返回「收到」
