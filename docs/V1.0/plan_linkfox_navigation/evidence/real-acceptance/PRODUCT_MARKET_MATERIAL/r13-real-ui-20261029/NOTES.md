# R13 真实 UI 验收（2026-10-29，HEAD ff621c3）

结论：**PASS**。`receipt.json` 中 `ok: true`，全链路真实、无注入、无 mock。

## 环境前置（本次根因）
- 第一轮提交失败的真实原因：`canvas-proxy`（127.0.0.1:23210）**进程已消失**，UI POST 直接
  `请求失败`（task `status=unknown`, error.code=unclassified, 0 结果）。R12 的「提交后无结果」同源。
- 恢复方式（项目内合法入口，未读任何密钥、未改代码）：
  `canvas-proxy/` 下 `node index.js --port 23210 --host 127.0.0.1`
  → 启动日志 `canvas-proxy-startup.log`（经系统代理 127.0.0.1:7890 转发，PID 5446）。
- 直连与经代理 `GET /v1/models` 均 401（无 key 属正常），证明链路可达。

## 本次真实链路证据
| 环节 | 证据 |
| --- | --- |
| 素材上传 | 仓库 fixture `web/scripts/real-acceptance/fixtures/product-watch.jpg`（31860 B，sha256 `43ede96e…19be3`，1024×744 JPEG）经真实 `<input type=file>` 上传 → UI 显示 `1 / 6 个`、主图 |
| A+ 模板守护（ff621c3 修复点1） | `market-aplus-template-APlusPro` 默认 `aria-pressed=true` 且 `aria-disabled=true`、`title="至少保留一个 A+ 模板"`；对唯一选中项真实点击后仍 `pressed=true`，提示文案仍在 → 点空死局未复现 |
| 提交 | 「预计生成 1 屏 · 高级A+×1」，按钮可点；taskId `task-mvtjpn12-s1c4t6`，`status=succeeded` |
| 上游回执 | `POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits` → **200**，requestId `9745d7b1-…, 19db8171-…`，返回 `data[0].b64_json` 长度 2,595,008 |
| 真实图片字节 | IDB `media_files` key `tool-result:CAPv0__15orwUjL60Q9n-`，1,902,882 B，PNG 头 `89504e470d0a1a0a`，sha256 `5cdef97d…1823` |
| 下载（修复点2 三动作之一） | 真实 download 事件 `product-market-material-result-1.png`，1,902,882 B，sha256 `5cdef97d…1823`，**与 IDB 字节完全一致** |
| 存入资产库 | 资产数 0 → 1（标题「高级A+ 1/1 · 970×600」），按钮回执 `已存资产库 BRxRfQm8` |
| 发送画布 | 项目 1、节点数 0 → 1，按钮回执 `已发送画布` |
| fresh reload | 页面重载后：历史任务 1 条命中 `task-mvtjpn12-s1c4t6 / succeeded`；结果面板卡片重建 1 张，横幅「共 1 屏 · 成功 1 · 失败 0」；三动作按钮俱在（存资产/发画布/下载） |

截图：`01-before.png` … `10-reload-result.png`；产出图 `s1c4t6-c4t6-0.png`、`download-product-market-material-result-1.png`。

## 复现命令
```bash
cd /Users/mac/Documents/Dev/infinite-canvas/canvas-proxy && node index.js --port 23210 --host 127.0.0.1 &
cd ../web && node scripts/real-acceptance/accept-r13-market-real.mjs --screens 1
```

## 备注 / 风险
- 脚本使用持久 profile（`.tmp_r13/profile-r13`）以便 reload 后 IDB 数据仍在；仍属同一浏览器真实链路。
- 控制台残留 React 警告「Cannot update a component while rendering a different component」与「连接本地 Agent 未连接」为既有 UI 噪声，未影响结果。
- `historyTabClicked=false`：reload 后历史行由右侧历史 dock 直接渲染（`[data-task-id]` 命中），无需点「历史记录」页签；已在脚本内改为容错并记录。
