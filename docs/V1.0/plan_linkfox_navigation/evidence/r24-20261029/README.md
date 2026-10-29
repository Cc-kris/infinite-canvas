# r24 CHANGE_COLOR_V2 H — 同文档 reload + 已提交字节 + 三动作（无新生成、无注入）

时间：2026-10-29 22:46–22:48（本地）｜单 agent，未派子 worker｜未调用任何生成接口、未注入结果字节。

## 0. 为什么有这一轮

R17（753074cc）判 CCV2.H = PARTIAL，两条腿各缺一半：

1. de79a8f6 的 “fresh reload” 是**新开标签**（全新会话、内存态清零）→ 不满足 rubric 的**同文档** Page.reload 机读标记；
2. 回执声明 2,545,568B，但 HEAD 内无同尺寸已提交产物 → 字节腿无法复核。

本轮把两条腿一次补齐，且全部机读。

## 1. 同文档 reload（机器标记）

- 复用既有真实任务 `task-mvtn1xg0-sbk0fl`（succeeded，IndexedDB 内既有产物），无新生成。
- 在同一标签 `1709629349`（`/tools/ecommerce-suite/change-color-v2`）执行 **CDP `Page.reload`**，非新开标签。
- 导航标记：
  - `navigationType = "reload"`（`performance.getEntriesByType('navigation')[0]`）
  - `domContentLoadedEventStart = 713.6`
  - `sessionDocId`（sessionStorage 写入的文档标记）reload 前后**同一值** `2486dccf-…` → 同一文档会话连续
  - `window.__inMemoryMarker` reload 后**已消失** → 文档确实重建
  - `timeOrigin` 1,793,285,159,394.8 → 1,793,285,186,666.1

## 2. 真实字节 → 已提交产物

- 从 IndexedDB `infinite-canvas/media_files` 读出 `tool-result:task-mvtn1xg0-sbk0fl:0:KWct7e2ggt9qZP80UbreK`，
  大小 **2,545,568B**，magic `89504e470d0a1a0a`，sha256 `e1b1d638f6eb941f8eebf74da3c969e22887501fb25cee61fc57a8f8ea732458`。
- 落盘为本目录 [`CHANGE_COLOR_V2-result-1.png`](./CHANGE_COLOR_V2-result-1.png)（同 2,545,568B，写盘后重算 sha 一致）
  → 字节腿此后可由 git HEAD 的 blob 直接复算。

## 3. 三动作（真 DOM 点击，逐条取字节+sha）

| 动作 | 触发 | 结果 | 字节 | sha256 |
|---|---|---|---|---|
| 下载 | `[data-testid=color-v2-restored-download]` | `~/Downloads/…换色 #EB88A0 (1).png`（22:47:23 新文件） | 2,545,568 | `e1b1d638…` |
| 存资产库 | `[data-testid=color-v2-restored-save]` | assetId `12Zq5U4wkjI0P7jtnywb-`，storageKey `image:lCU0u_K_u-b8evOmYtrJP` | 2,545,568 | `e1b1d638…` |
| 发画布 | `[data-testid=color-v2-restored-send]` | projectId `CM1D7JF9OyJVB40VYzAZS` / nodeId `image-1793285279595-8bd7n` | 2,545,568 | `e1b1d638…` |

四方（已提交产物 / 下载落盘 / asset_store blob / canvas 节点 blob）字节与 sha **全等**。

> 口径备注：`存资产库`写 `app_state/infinite-canvas:asset_store`，blob 落 `image_files`（不是 `tool_assets`、也不是 `media_files`）；
> `发画布`写 `app_state/infinite-canvas:canvas_store`，blob 同落 `image_files`。三者 storageKey 前缀不同是正常现象，字节一致即可对账。

## 4. 根因与代码改动

- 同文档 reload 后恢复卡与三动作全部可用 → **恢复链路（`useToolTaskStore` hydrate + storageKey→blob 还原）无回归**。
- R17 的 PARTIAL 根因在**证据侧**（新标签 ≠ 同文档 reload；HEAD 无同尺产物），不在恢复代码。
- 故本轮**未改任何前端源码**，只在审计器里补一条严格升级断言 `up_change_color_v2_h`（字段/取值/字节/sha 全等才升级，任一不符即保持原判）。

## 5. 门禁

- `web`: `./node_modules/.bin/tsc --noEmit` → **exit 0**
- `~/.bun/bin/bun test src/components/tools/tool-result.test.tsx src/components/tools/tool-result-actions.deps.test.ts` → **35 pass / 0 fail**（174 expect，2 files）

## 6. 复算方法

```bash
git show HEAD:docs/V1.0/evidence/r24-20261029/CHANGE_COLOR_V2-result-1.png | shasum -a 256
# 期望 e1b1d638f6eb941f8eebf74da3c969e22887501fb25cee61fc57a8f8ea732458
git cat-file -s $(git rev-parse HEAD:docs/V1.0/evidence/r24-20261029/CHANGE_COLOR_V2-result-1.png)
# 期望 2545568
```
