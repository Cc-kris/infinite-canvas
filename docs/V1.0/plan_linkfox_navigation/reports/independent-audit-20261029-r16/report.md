# r16 独立验收 — 8761c4e（I2V 刷新后可播放判定 + 历史回填）

> 复用真实任务 `task-mvtjhbcg-e8lnin`，**全程 fresh reload，不重生成、不注入数据、不修改源码**。
> 唯一动作序列：刷新页面 → 点历史任务（真实控件）→ 下载 → 存资产 → 发画布 → 读 IndexedDB 校验。
> 证据：`evidence/receipt-fresh-reload-sequence.json`（机器回执）、`evidence/verify-store.json`（字节复核）、
> `evidence/01-reload-panel.png`、`evidence/02-after-sequence.png`、`evidence/probe_accept.mjs`、`evidence/verify_store.mjs`。

## 1. 环境与被测对象

| 项 | 值 |
|---|---|
| 仓库 / 提交 | `/Users/mac/Documents/Dev/infinite-canvas` @ `8761c4e`（HEAD） |
| 服务 | `http://127.0.0.1:3000`（dev server，PID 80431），实测 `/src/features/tools/adapters/image-to-video.ts:207` 已含修复 `item?.storageKey && !item?.payloadDropped` |
| 浏览器 | Playwright `chromium.launchPersistentContext`，持久 profile `/tmp/ic_r9_profile_translation`，headless，1440×1000 |
| 源码改动 | 无（`git status web/src` 为空；验收前后均未改动） |

## 2. 现场复现的关键前提：持久化结果确实是 storageKey-only

刷新后 localStorage `tool-task:v1:task-mvtjhbcg-e8lnin`（由页面读出，非手工构造）：

```json
{"id":"task-mvtjhbcg-e8lnin","toolId":"IMAGE_TO_VIDEO","status":"succeeded",
 "upstreamTaskId":"task_KOkmL8wCOOmL5AdPyeGwQhAZyIBdMvPR",
 "configSnapshot":{"capability":"video","model":"sub2api-real::MiniMax-H3","apiFormat":"openai",
                   "size":"auto","quality":"768P","count":"1","videoSeconds":"5","channelId":"sub2api-real"},
 "sourceAssetIds":["QjHmWRaCMSRfd8ipT0hre","tyLv_ID7ANvdWI6Wut0vY"],
 "result":{"items":[{"keys":["bytes","id","kind","mimeType","payloadDropped","storageKey"],
                     "url":null,"blob":undefined,
                     "storageKey":"tool-result:guW96FrxlpSM3CtY3clem",
                     "payloadDropped":false,"bytes":1266723,"mimeType":"video/mp4"}]}}
```

→ `url:null` / `blob:undefined` / `storageKey` 存在 / `payloadDropped:false`，**正好命中 8761c4e 新分支**。
（修复前该分支为 `Boolean(url||blob)` → 必然判失败并报「没有可播放视频 / 已记录上游返回为空」。）

## 3. 刷新后结果区（修复点 1）

| 观测项 | 实测值 |
|---|---|
| `image-to-video-result-tone` | `视频生成完成` |
| `image-to-video-result-detail` | `模型 sub2api-real::MiniMax-H3 · 31 次轮询` |
| 结果区文本 | `视频结果已完成共 1 个结果 · 视频 1 下载 存入资产 发送画布` |
| 误报文案检测 | `/没有可播放视频|已记录上游返回为空/` → **false（不再误报）** |
| `<video>` 元素 | `blob:…/4aa477a4…`，**duration=5.167 / videoWidth=1344 / videoHeight=768 / readyState=4**（真实可播放，非占位） |
| 三个动作按钮 | 下载 ✓ / 存入资产 ✓ / 发送画布 `disabled=false` |

## 4. 历史回填的配置字段（修复点 2）

快照 ↔ 表单 ↔ 实片三方对照：

| 字段 | 任务快照 | 回填后表单（DOM 实测） | 实片（ffprobe） |
|---|---|---|---|
| 时长 | `videoSeconds:"5"` | `duration=5`（显示「5 秒」） | `5.166667s` / 124 帧 |
| 清晰度 | `quality:"768P"` | `resolution=768P` | `height=768` |
| 比例 | `size:"auto"` | `ratio=auto`（显示「自适应」） | `1344×768`（自适应横向） |
| 提示词 | 原文 | 原文完整回填 | — |
| 参考图 | 2 张 sourceAssetIds | `2 张参考图` | — |

提示文案实测：`已按历史任务 task-mvt 回填表单：提示词取该任务真实提交文本；2 张参考图；比例 auto；时长 5s；清晰度 768P`
→ **不再出现**「时长/清晰度任务快照未存，沿用当前值」（页面全文正则 `比例未记录|沿用当前值|任务快照未存` 命中 0 次）。

## 5. 三段动作真实回执

| 动作 | 机器回执 |
|---|---|
| **下载** | `1266723` bytes，magic `ftyp`，`sha256 fe5c85f8274bb7d44b1febbf2844487dcecd440dc58a129b5f1d5398c091a524`，文件名 `image-to-video-result-1.mp4` |
| **ffprobe** | video `h264 1344×768 24/1 5.166667s 124 帧`；audio `aac 5.167s`；`format.size=1266723` |
| **存资产** | 反馈 `已保存到资产库（vT7_AZTJmExCSJO3_dt3j）`；资产库 6 → 7 条；新资产 `kind=video / bytes=1266723 / 1344×768 / mimeType=video/mp4 / storageKey=video:3Gi2P5gtItjUL3gLmgKcb / metadata.taskId=task-mvtjhbcg-e8lnin` |
| **发画布** | 反馈 `已发送到画布（c86DFKiJXDkVfHFgz5-jP）`；画布项目 6 → 7 个 |

### 画布落库校验（IndexedDB `infinite-canvas/app_state` → `canvas_store`）

```json
{"id":"c86DFKiJXDkVfHFgz5-jP","title":"IMAGE_TO_VIDEO 结果","nodes":1,"videoNodes":1,
 "node":{"id":"video-1793279957420-oc3a1","type":"video","title":"视频","width":420,"height":236,
         "metadata":{"status":"success","storageKey":"video:Ungj5Op5QcjjEDTtlJAYY",
                     "naturalWidth":1344,"naturalHeight":768,"bytes":1266723,
                     "mimeType":"video/mp4","durationMs":5167}}}
```

### 字节三方一致性

| 存储点 | key | 实测 |
|---|---|---|
| 任务结果 | `tool-result:guW96FrxlpSM3CtY3clem` | `video/mp4, 1266723` |
| 资产库 | `video:3Gi2P5gtItjUL3gLmgKcb` | `video/mp4, 1266723` |
| 画布节点 | `video:Ungj5Op5QcjjEDTtlJAYY` | `video/mp4, 1266723` |
| 下载落盘 | `/tmp/ic_r16/downloads/seq.mp4` | `1266723`, sha256 `fe5c85f8…` |

## 6. Console（真实、未过滤）

- 错误总数 **1**，内容仅 `Failed to load resource: net::ERR_CONNECTION_REFUSED`（与 I2V 无关的外部请求）。
- 渲染期 setState 告警（r15 记录的 `Cannot update a component … while rendering`）**0 次**。
- 三段动作（下载/存资产/发画布）**无超时、无重试**，发画布一次点击即落地（对照 r14 的 60s `locator.click` 超时已消失）。

## 7. 结论

| 修复点 | 判定 | 依据 |
|---|---|---|
| 刷新后 storageKey-only 结果被判可播放 | **PASS** | tone=视频生成完成；video 元素 duration 5.167/1344×768/readyState=4；误报正则 false |
| 历史回填 duration/quality（不再谎称未存） | **PASS** | 表单 5s/768P/auto 与快照三字段逐一相等；旧文案 0 命中 |
| 下载 / 存资产 / 发画布 完整序列 | **PASS** | 1266723B + 真实 assetId `vT7_AZTJmExCSJO3_dt3j` + 真实 projectId `c86DFKiJXDkVFHFgz5-jP` + IDB video 节点 |
| 配置字段与实片一致 | **PASS** | 快照 768P/5s/auto ↔ 实片 768 高 / 5.167s / 1344×768 |

- 未重生成（无任何生成请求；31 次轮询为历史任务原始记录）
- 未注入任何数据（task 记录、字节、画布节点全部由真实 UI 动作产生）
- 未修改源码（`git status web/src` 空）
- 无未收口失败项

## 8. 复现

```bash
cd /tmp/ic_r16 && zsh -lc 'node probe_accept.mjs'   # fresh reload → 历史任务 → 下载/存资产/发画布 → receipt.json
cd /tmp/ic_r16 && zsh -lc 'node verify_store.mjs'   # 只读核对三处 storageKey 字节与画布节点
```
