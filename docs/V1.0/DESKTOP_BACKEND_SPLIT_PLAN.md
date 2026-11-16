# 桌面客户端前后端分离迁移方案

> 分支：`feat/desktop-backend-split`（从 `feat/linkfox-v1-real` 拉出）
> 状态：已实施（P0–P5 已完成；本分支以桌面客户端为唯一发布形态）
> 适用仓库：`Cc-kris/infinite-canvas`（已改为 private）

## 1. 决策摘要

| 项 | 结论 |
| --- | --- |
| 浏览器版 | 冻结在 `feat/linkfox-v1-real`，不再更新；`main` 暂不动，待单独确认是否合入后归档 |
| 本分支定位 | 只支持桌面客户端（Electron 安装包），不再保证网页版可运行 |
| 前后端边界 | 渲染进程只做 UI；所有业务处理（上游请求、内容解析、媒体处理、存储）移到主进程本地服务 |
| 通信方式 | 业务能力走本地 HTTP（`127.0.0.1`），壳能力/系统对话框/更新走 IPC |
| 保留项 | 无限画布主题、工具页 UI、交互结构全部不变；只换数据与能力的来源 |

### 实施结果

- 主进程同时起两个本地服务：`23211` 托管 `web/dist`（固定 origin），`23212` 承载业务接口；端口被占用时各自向后顺延最多 12 个。
- 业务服务每次启动生成随机 token，经 `additionalArguments` → preload → 渲染层；`/api/*`、`/files/*` 校验 Bearer（`<img>` 等无法带头的场景用 `?token=`），Origin 只允许渲染服务自身；`/health` 不需要 token，便于 `curl` 排查。
- 接口按域注册：
  - `/api/providers/*`：生图/改图、文本对话与流式、视频提交/轮询、音频、模型列表、插件脚本的 HTTP 转发。
  - `/api/content/*`：页面抓取、商品链接解析、JSON 拉取（提示词源）、文本补全、视频转录、取视频、长图切分、视觉分析、营销文案。
  - `/api/media/*`：上传、抽音轨、拼接、封装。
  - `/api/imaging/*`：自动分割、点选分割、像素合成。
  - `/api/storage/*`：状态、媒体、日志、插件、WebDAV、一次性迁移。
- `/files/*` 从 `data/media` 流式读取并支持 `Range`（同时允许 `data/assets`，当前媒体统一走 `media/`）；`/__media/*` 是独立的公网素材发布通道，不校验 token。
- IPC 只保留壳能力：窗口与菜单、本机目录选择（Agent）、外部链接、更新检查与下载、Agent Hub。
- `canvas-proxy`、浏览器 FFmpeg wasm、`localforage` 运行时存储均已删除；`localforage` 只保留在一次性迁移中读取旧 IndexedDB。

## 2. 目标与非目标

**目标**

1. 业务代码可在 Node 环境运行，不再依赖 DOM、Canvas、`@ffmpeg.wasm`、`localforage`。
2. 渲染进程体积与内存占用下降（不再加载 24MB wasm、不在主线程做像素运算）。
3. 上游请求由主进程发出，去掉 `canvas-proxy` 这一层转发（跨域问题消失）。
4. 数据从 IndexedDB 迁到用户目录下的真实文件，可备份、可导出、无浏览器配额限制。
5. 后续可把同一套服务端能力复用于「本机守护进程 / 团队内网部署」，不需要重写业务。

**非目标**

1. 不重做 UI，不改工具页视觉与交互。
2. 不引入云同步；数据仍在用户本机。
3. 不做多用户、权限体系、远程鉴权。
4. 不在本阶段做签名/公证之外的发布体系改造（见 §11 风险）。

## 3. 迁移前现状（代码事实）

> 以下为迁移前基线，保留用于对照；当前实现见 §1「实施结果」。

| 组件 | 位置 | 事实 |
| --- | --- | --- |
| Electron 主进程 | `desktop/main.js`（653 行） | 已起两个本地服务：静态渲染服务 `SHELL_PORT = 23211`、转发代理 `PROXY_PORT = 23210`（`PORT_SCAN = 12` 逐个探活） |
| 静态渲染服务 | `desktop/main.js` `serveRenderer()` | 用 `http://127.0.0.1:23211` 托管 `web/dist`，**目的是让 origin 稳定、IndexedDB 可用** |
| 本地转发代理 | `canvas-proxy/server.js`（553 行） | `http://127.0.0.1:23210/<完整目标 URL>` 转发并补 CORS；系统代理 → 直连双通道 |
| 渲染桥 | `desktop/preload.cjs`（44 行） | `contextBridge` 暴露 `window.infiniteCanvasDesktop`，已有 `update:*`、`shell:open-external`、`agentHub.*` |
| 已有的本地服务先例 | `desktop/agent-hub.js`（779 行）+ `canvas-agent/` | 已实现「主进程 spawn 一个内置 Node 服务 + IPC 管理 + 健康检查 + 日志落盘」 |
| 业务层 | `web/src/services/api/**` | 全部在渲染进程运行，直连外部 API（经 `withLocalProxy` 改写） |
| 媒体处理 | `web/src/services/api/tools/ffmpeg-media.ts` | `@ffmpeg/ffmpeg` + `@ffmpeg.wasm/core-st`，资源在 `web/public/ffmpeg/`（`core.wasm` 24MB） |
| 图像算法 | `segmentation.ts`、`local-pixel.ts` | 浏览器 Canvas / 主线程 |
| 存储 | `localforage` → IndexedDB | 见 §8 清单 |
| 打包 | `desktop/package.json` `build.files` + `extraResources` | 已打包 `web/dist`、`canvas-proxy`、`canvas-agent` |

结论：**不是从零搭后端**，而是把已有主进程从「只做代理 + 静态托管」扩成「能做业务」。

## 4. 目标架构

```
┌────────────────────────────── Electron 主进程（Node） ──────────────────────────────┐
│                                                                                     │
│  ① app-service（127.0.0.1:23212）                                                    │
│     ├─ /health                          健康检查 / 版本                              │
│     ├─ /api/providers/*                 上游模型请求（图像/视频/文本/音频/轮询）        │
│     ├─ /api/content/*                   链接解析、文本、转录、视觉分析、切图            │
│     ├─ /api/media/*                     ffmpeg 原生转码/拼接/抽帧/提音轨              │
│     ├─ /api/imaging/*                   分割、像素处理、缩略图                       │
│     ├─ /api/storage/*                   画布/资产/草稿/任务/日志/WebDAV 读写          │
│     ├─ /files/*                         本地文件流式读取（Range 支持）               │
│     └─ /__media/*                       公网素材发布通道（不带 token）               │
│                                                                                     │
│  ② 静态渲染服务（127.0.0.1:23211）                                                    │
│  ③ agent-hub（桌面端本地 Agent，保持不变）                                            │
└─────────────────────────────────────────────────────────────────────────────────────┘
              ▲ 业务：fetch + Bearer token        ▲ 壳能力：IPC（preload 桥）
              │                                   │
┌─────────────┴───────────────────────────────────┴───────────────────────────────────┐
│ 渲染进程（web/dist）：只做 UI、状态展示、交互；不再持有业务实现                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**为什么业务走 HTTP 而不是全部 IPC**

- 媒体往返体积大（100MB 视频），IPC 的结构化克隆会整块复制内存；HTTP 支持流式与 `Range`。
- 现有 `services/api/**` 本身就是 `fetch` 写法，改造面最小。
- 便于用 `curl` 直接排查，也便于将来把同一服务跑成独立进程。
- IPC 只保留：窗口与菜单、本机目录选择、更新检查与下载、外部链接打开、Agent Hub。

**端口规划**

| 端口 | 用途 | 说明 |
| --- | --- | --- |
| 23211 | 渲染静态服务 | 保留（origin 稳定性依赖它） |
| 23212 | app-service | 业务接口与 `/files`、`/__media`，冲突时沿用 `PORT_SCAN` 逐个试探 |

`23210`（原 canvas-proxy）已随迁移删除。

## 5. 安全模型

1. 渲染静态服务与业务服务一律 `listen(..., "127.0.0.1")`，不监听 `0.0.0.0`。
2. 每次启动生成随机 token（`crypto.randomUUID()`），通过 `additionalArguments` 传给 preload，preload 暴露给渲染层；app-service 对 `/api/*`、`/files/*` 校验 `Authorization: Bearer <token>`（无法带头的媒体标签用 `?token=`）。
3. 校验 `Origin` 只允许 `http://127.0.0.1:23211`（含端口扫描后的实际端口）；无 Origin 的本机命令放行，`/__media/*` 不校验 Origin。
4. 文件接口只允许访问 `dataRoot` 下的规范化路径，拒绝 `..`。
5. API Key 仍保存在本机配置（渲染层读取、写入用户目录）；上游请求改由主进程发出，渲染层不再直接拼接请求。

## 6. 接口层设计

渲染层新增一个薄客户端，业务模块统一从这里取能力：

```
web/src/services/api/desktop/
  runtime.ts      // 从 preload 取 serviceUrl + token；非桌面环境直接抛错
  http.ts         // requestJson / requestText / requestStream / requestBlob / uploadBlob
  capabilities/
    providers.ts       // 图像 / 视频 / 音频 / 文本 / 模型列表 / 插件转发
    content.ts         // 链接解析、文本、转录、视频、切图、视觉、文案
    media.ts           // ffmpeg 相关
    imaging.ts         // 分割、像素处理
web/src/services/desktop-storage.ts   // 状态 / 媒体 / 日志 / 插件 / WebDAV 客户端
web/src/lib/desktop-storage.ts        // zustand persist 适配器
```

约束：

- `web/src/services/api/tools/gateway.ts`、`task-machine.ts` 的**状态机保留在渲染层**（它是 UI 状态），只把「发请求 / 查状态」下沉。
- 所有能力函数保持现有签名，内部换成 HTTP 调用，页面代码零改动。
- 本分支不保留浏览器兜底；`runtime.ts` 检测不到桌面桥时明确报错，而不是静默降级。

## 7. 能力迁移清单

| # | 能力 | 现有文件 | 现在运行位置 | 目标实现 | 验收 |
| --- | --- | --- | --- | --- | --- |
| 1 | 上游模型请求 | `services/api/image.ts`、`video.ts`、`audio.ts`、`request.ts` | 渲染进程 + canvas-proxy | 主进程，`node:fetch` 直连（不再需要 CORS 转发） | 生图/生视频/文本/音频各跑通一次，结果与本分支前一致 |
| 2 | 任务提交与轮询 | `services/api/tools/gateway.ts` | 渲染进程 | 请求下沉到 `/api/providers/*`，轮询由主进程承载 | 提交、取消、超时、重试行为与现状一致 |
| 3 | 商品链接解析 | `content-analysis.ts` `parseEcommerceProductLink` | 浏览器 `fetch` + `DOMParser` | 主进程 `fetch` + `linkedom`（或 `cheerio`）解析 | 同一链接解析出的标题/卖点/图片数一致 |
| 4 | 视频转录与脚本分析 | `content-analysis.ts` `transcribeToolVideo` | 浏览器 + `ffmpeg.wasm` 提音轨 | 主进程原生 ffmpeg 提音轨 + ASR 请求 | 转录文本与时间轴结构一致 |
| 5 | 视觉商品分析 | `analyzeProductImageWithVision` | 渲染进程直连 | `/api/content/vision` | 返回结构一致，大图不再吃浏览器内存 |
| 6 | AI 文案/提示词 | `generateMarketingCopyWithAI` | 渲染进程直连 | `/api/content/copywrite` | 输出一致 |
| 7 | OCR 识别翻译 | `ocr-translate.ts` | 渲染进程 + `requestImageQuestion` | 无独立端点 | 文本框坐标与译文结构一致 |
| 8 | 主体分割 | `segmentation.ts` | 浏览器 Canvas 主线程 | 主进程 `worker_threads` + 纯 JS 像素库（见 §11 决策） | 蒙版/透明图结果一致 |
| 9 | 本地像素处理 | `local-pixel.ts` | 浏览器 Canvas | 同上 | 输出像素一致 |
| 10 | FFmpeg 拼接/裁剪/转码 | `ffmpeg-media.ts` | `@ffmpeg.wasm` | 原生 ffmpeg 二进制 | 固定时长档、音轨对齐、输出可播放 |
| 11 | 资产与文件存取 | `services/file-storage.ts` | IndexedDB（`media_files`） | 磁盘文件 + 索引 | 刷新/重启后可读，导出可用 |
| 12 | 画布/草稿/配置持久化 | `stores/*.ts`（经 `lib/localforage-storage.ts`） | IndexedDB | `/api/storage/*` | 重启后画布、草稿、配置完整 |
| 13 | 生成日志 | `pages/image/index.tsx`、`pages/video/index.tsx` | IndexedDB | 磁盘 JSONL | 历史记录可查 |
| 14 | 批量任务编排 | `services/api/tools/batch-runner.ts` | 渲染进程 | **保留在渲染层**（只做调度），执行请求走主进程 | 并发、重试、取消行为不变 |
| 15 | WebDAV 同步 | `services/app-sync.ts` | 浏览器 `fetch` | 主进程 | 连接测试与同步可用 |

实施说明：#7 OCR 在渲染层通过 `requestImageQuestion` 调用本地服务的文本模型接口完成，未单独注册 `/api/content/ocr`；文字框坐标与颜色依赖模型输出，需人工验收。#8/#9 已迁到主进程用 jimp 实现，但尚未移入 `worker_threads`。

## 8. 存储迁移

### 8.1 迁移前存储清单（代码事实）

| 存储 | 位置 | 内容 |
| --- | --- | --- |
| `infinite-canvas / media_files` | `services/file-storage.ts` | 素材与结果的二进制 Blob |
| `infinite-canvas / image_generation_logs` | `pages/image/index.tsx` | 生图历史 |
| `infinite-canvas / video_generation_logs` | `pages/video/index.tsx` | 生视频历史 |
| zustand `persist`（localforage） | `use-canvas-store`、`use-asset-store`、`use-tool-draft-store`、`use-plugin-store`、`use-prompt-source-store` | 画布工程、资产索引、工具草稿、插件、提示词源 |
| zustand `persist`（localStorage） | `use-config-store`、`use-theme-store` | 模型配置、主题 |
| `infinite-canvas-plugins / <pluginId>` | `lib/canvas/canvas-event-bus.ts` | 插件数据 |
| IndexedDB 元信息 | `services/local-storage-usage.ts` | 用量统计 |

### 8.2 目标磁盘布局

```
<userData>/data/                     # macOS: ~/Library/Application Support/Infinite Canvas/data
  state/app_state/<key>.json         # zustand 状态：画布工程、模型配置、草稿、资产索引、提示词源等
  media/<file>.<ext>                 # 素材与结果的二进制文件
  media-index.json                   # storageKey → 文件、大小、mime、kind
  logs/image-generation/<YYYY-MM>.jsonl
  logs/video-generation/<YYYY-MM>.jsonl
  plugins/<pluginId>/<key>.json
  published/<sha256>.<ext>           # /__media 公网发布通道的落盘目录
  backup-indexeddb-<timestamp>.json  # 一次性迁移的元数据清单
  .migrated                          # 迁移完成标记
```

### 8.3 迁移步骤

1. 新版本首次启动时检查 `<userData>/data/.migrated` 标记。
2. 无标记则先写 `data/backup-indexeddb-<timestamp>.json` 元数据清单（数据库/对象仓库/记录数/字节数/状态键）。不复制 `backup-media/`：旧 IndexedDB 与写入后的媒体文件都原样保留。
3. 逐项写入磁盘，全部成功后写 `.migrated`。
4. 任一步失败：不写标记、不回滚已写文件、保留 IndexedDB 原数据，并在界面给出明确错误与备份路径。
5. 备份保留至用户手动清理，不自动删除。

> 说明：`AGENTS.md` 目前允许「不兼容旧数据」，但本机已有实际使用数据，因此方案默认做一次性导入 + 备份；如确认可丢弃数据，可跳过第 2 步。

## 9. 打包与发布变更

`desktop/package.json`：

```jsonc
{
  "build": {
    "files": ["main.js", "service.mjs", "agent-*.js", "preload.cjs", "package.json"],
    "extraResources": [
      { "from": "../web/dist", "to": "renderer" },
      { "from": "bin", "to": "bin" },      // 含 <platform>-<arch>/ffmpeg，在 asar 外
      { "from": "agent", "to": "agent" }
    ]
  }
}
```

要点：

1. `desktop/scripts/build-service.mjs` 用 esbuild 把 `desktop/service/index.mjs` 打成单文件 `service.mjs`；开发环境直接加载 `service/index.mjs`，打包后加载 `service.mjs`。
2. `build:service` 把 `ffmpeg-static` 复制到 `desktop/bin/<platform>-<arch>/`，`extraResources` 整体带入安装包；可执行文件位于 asar 外，因此没有额外使用 `asarUnpack`。
3. 当前只在构建机上打包本机架构的 ffmpeg；跨架构（`darwin-x64` / `darwin-arm64` / `win32-x64`）构建仍需分别执行，见 §11。
4. 未引入 `sharp` / `better-sqlite3` 等原生模块：图像算法用 jimp，存储用 JSON + 文件。
5. `mac.identity` 仍为 `null`（未签名、未公证）。带原生 ffmpeg 后必须先解决签名，否则用户侧 Gatekeeper 拦截概率显著上升。

## 10. 分阶段实施

| 阶段 | 内容 | 完成标准 |
| --- | --- | --- |
| P0 | 服务骨架：`service.mjs`、端口探测、token、`/health`、渲染层 `runtime.ts` + `http.ts`、启动失败时的可见报错 | 应用启动后 `/health` 可用；业务行为零变化 |
| P1 | 上游请求与网关下沉（清单 #1、#2、#15） | 生图、生视频、文本、音频、WebDAV 各跑通一次；此时可关闭 canvas-proxy |
| P2 | 内容能力下沉（#3–#6） | 商品链接解析、转录、视觉分析、AI 文案跑通；OCR 由渲染层视觉模型调用实现，见 §7 |
| P3 | 媒体与图像（#8–#10） | 原生 ffmpeg 拼接/转码、分割、像素处理跑通 |
| P4 | 存储迁移（#11–#13） | 旧数据完整导入；重启、升级、异常退出均不丢数据 |
| P5 | 收尾 | 删除 `@ffmpeg.wasm`、`canvas-proxy` 依赖与调用、浏览器直连代码；更新 `AGENTS.md`、`README`、`CHANGELOG`、`pending-test` |

P0–P5 均已完成；阶段拆分只表示实施顺序，最终以桌面端整体可运行和 `pending-test` 清单验收。

## 11. 风险与阻塞

| 风险 | 影响 | 处理建议 |
| --- | --- | --- |
| macOS 未签名/未公证 | 打包原生二进制后用户可能看到「应用已损坏」 | 本阶段必须补 `identity` 与公证，否则不建议对外发布 |
| 安装包体积 | 原生 ffmpeg 每架构约 75–80MB | 按架构分别分发；mac 不再打通用包 |
| 原生模块编译 | `sharp` / `better-sqlite3` 需要 `electron-rebuild`，跨平台 CI 成本高 | P0 先避开：像素处理用纯 JS，存储用 JSON + 文件 |
| 主进程崩溃 | 会带走整个应用 | 服务启动失败只降级该能力并明确报错；不静默失败 |
| 大文件传输 | base64 会让内存翻倍 | 一律用流式上传/下载，支持 `Range` |
| 去除浏览器兜底 | 网页版彻底不可用 | 已由用户明确确认；浏览器版冻结在 `feat/linkfox-v1-real` |

签名/公证与跨架构 ffmpeg 打包仍未完成，属于发布阻塞项；迁移首启耗时与 `media-index.json` 的整文件重写也尚未实测，见 `docs/content/docs/progress/todo.mdx`。

## 12. 已确认决策

| 决策 | 采用方案 | 说明 |
| --- | --- | --- |
| 存储格式 | JSON + 文件 | 未引入 sqlite。`state/<namespace>/<key>.json` 存 zustand 状态，`media/` + `media-index.json` 存二进制与索引，日志按月写 JSONL，插件按 `<pluginId>/<key>.json`。方案早期的 `projects/`、`assets/` 分文件改为等价的状态键 + 媒体索引布局。 |
| 一次性 IndexedDB 导入 | 保留 | 首次启动先写 `data/backup-indexeddb-<timestamp>.json` 元数据清单，再导入状态、日志、插件与媒体；旧 IndexedDB / localStorage 原样保留，不写 `backup-media/`；全部成功后写 `.migrated`。 |
| 服务运行形态 | 主进程内嵌 `createService` | 未使用 `utilityProcess`。服务与窗口同生共死，启动失败在界面明确报错；图像算法后续可再移入 `worker_threads`。 |
| 签名与公证 | 尚未处理 | `mac.identity` 仍为 `null`，属于发布阻塞项。 |
| `main` 分支 | 本分支不处理 | 浏览器版冻结在 `feat/linkfox-v1-real`，`main` 保持原状，是否合入归档另行确认。 |

## 13. 已同步修改的规则文档

- `AGENTS.md`：业务能力统一放在 `desktop/service/`，渲染层经 `web/src/services/api/desktop/` 调用本机服务；删除「浏览器直连」「localforage 默认」等旧表述。
- `AGENTS.md` 项目注意事项：数据改为保存在本机用户目录；补充本地服务鉴权边界与迁移保留规则。
- `README` / `docs/index.md`：说明本分支只发布桌面客户端，浏览器部署方式标注为历史。
- `CHANGELOG.md`：`Unreleased` 按 `[调整]` 记录架构变更。
