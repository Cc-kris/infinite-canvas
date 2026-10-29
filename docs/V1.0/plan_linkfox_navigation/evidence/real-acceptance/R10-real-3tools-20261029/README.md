# R10：AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN 三工具真实 UI 生成取证（2026-10-29）

## 背景

- `d66e690`（r9）已证实：这三工具的历史任务 ID 在活任务库里**物理不存在**，历史三腿无法回填，当次被阻塞、**未做任何注入**。
- 本轮按用户决策 3 执行：**解除"禁止新生成"**，三工具各做 **一次最小真实 UI 生成**（复用仓库内合法素材 `web/scripts/real-acceptance/fixtures/apparel-print.jpg`、`product-watch.jpg` 与既有 provider），再对**真任务**做刷新/字节/下载/存资产/发画布全链路取证。
- 边界：无 mock、无 `localStorage.setItem` 注入、无结果改写；失败原样保留（本次无生成失败）。

## 真实链路

UI 填表（Playwright `channel: chrome` 真 Chrome，真 `<input type=file>` 上传）→ 点生成 →
`http://127.0.0.1:23210`（canvas-proxy，keychain 里的 ccai 通道）→ 上游 `/v1/images/generations` 真返回 →
任务落 `localStorage: tool-task:v1:task-*`，结果字节落 IndexedDB `infinite-canvas/media_files`。

## 结果（三腿全 PASS）

| 工具 | taskId | 上游 | x-request-id | 字节（sips 复核） | 下载 sha == IDB | 整页 reload 历史 | 存资产 | 发画布 | 耗时 |
|---|---|---|---|---|---|---|---|---|---|
| AI_TEXT | `task-mvthk2pn-kdz7i6` | 200 | `7c06ae40-814b-41e7-a18e-717dcee31713` | 1024x1024 / 1445425 B / `f2b8505e85f08cd7…` | True | 1 行 / 我的行可见=True / succeeded | 0→1 | 0→1 | 37.6s |
| ORNAMENT_TEXT | `task-mvthnof4-02hmyy` | 200 | `230e715c-5b2f-4fd4-b2a4-1e6edece90c2` | 1024x1024 / 2478875 B / `91de3dcbe591d270…` | True | 1 行 / 我的行可见=True / succeeded | 0→1 | 0→1 | 37.2s |
| SDS_DESIGN | `task-mvthlhwg-txm7nl` | 200 | `f6b5b285-1303-492f-9332-85357cdf3338` | 1024x1024 / 2059699 B / `1f13cf01caefaaf0…` | True | 1 行 / 我的行可见=True / succeeded | 0→1 | 0→1 | 63.6s |

- 上游回执原始记录：各工具目录 `net.json`（status / x-request-id / created / b64 长度 / revised_prompt / usage tokens）。
- 结果图：`03-result.png`（IDB 真字节，与 `05-download-*.png` 逐字节一致）；`04-after-reload.png` 为 reload 后现场；`06-after-actions.png` 为三动作执行后现场。
- 首屏/结果/relaod/动作截图：`01-before-submit.png`、`02-result.png`。

## 复现命令

```bash
cd web && node scripts/real-acceptance/accept-pod3-real.mjs --tool AI_TEXT        # 或 ORNAMENT_TEXT / SDS_DESIGN
```

## 已知坑（本轮实测）

1. 资产库与画布都走 **zustand persist + localforage（IDB `app_state`）**，不是 localStorage；用 localStorage 计数会得到假的 `delta: 0`（首轮 AI_TEXT 就踩了，已修正口径后重测）。
2. `getByLabel("饰品文字内容")` 会同时命中 `<section aria-label>` 与 `<textarea aria-label>` → strict mode violation；用 `getByRole("textbox", {name})`。
3. AI_TEXT 的 select 选项 id 来自模型目录（如 `pattern-text`），按 label 选容易失败，按索引/value 选更稳。

## 与 r9 状态的关系

r9 的"物理不存在"结论仍成立（旧 taskId 未复活）；本目录是**新生成的真任务**取证，不覆盖也不改写旧记录。
