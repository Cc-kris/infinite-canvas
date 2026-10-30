# R22-H 多标签资产覆盖（last-write-wins）复现与修复证据

日期：2026-10-30　分支：`feat/linkfox-v1-real`　基线版本：v0.27.0

## 1. 缺陷现象

两个标签页同时打开资产库，各自新增一个不同的图片资产，后保存的标签会把先保存标签的资产
元数据整条覆盖（`image_files` 里的字节还在，但资产记录消失）。刷新后只剩后保存的那一个。

根因：zustand `persist` 每次 `setState` 都把「本标签内存里的整份 assets 数组」写回
IndexedDB 的 `app_state`，两个标签各持旧快照 → 最后写入者胜出。

## 2. 修复

- 新增 `web/src/stores/asset-store-persist.ts`：
  - 写入前先读存储里的最新快照，按 `id` 维度合并（`updatedAt` 新的胜出）；
  - 删除用墓碑（`assetTombstones`）表达，避免合并把别处删掉的资产复活；墓碑 7 天过期；
  - 同标签写入串行化；跨标签用 Web Locks 互斥（无 Locks 时退化为写后回读校验 + 退避重试）；
  - 合并吸收了别的标签内容时通过 BroadcastChannel 广播，让其它标签尽快追平内存快照。
- `web/src/stores/use-asset-store.ts` 的 persist `storage` 换成上述实现，并接上
  `onChange` 回灌内存快照。

## 3. 复现 / 验证方法（可重跑）

`repro2.mjs` 用 Playwright 开一个浏览器上下文里的两个标签页：

1. 预热：两个标签各调一次 `uploadImage`，把 `image_files` / `image_previews` 对象仓建好
   （避免首跑时的建仓版本升级干扰，与本缺陷无关，已在 pristine 上同样存在）；
2. A 页新增图片资产 `*-TAB-A`，B 页新增 `*-TAB-B`；
3. 刷新两个标签，直接读 IndexedDB 的 `app_state.assets` 与 `image_files` 字节数。

运行：

```bash
# 修复后（dev server 在 :3020）
IC_BASE=http://127.0.0.1:3020 IC_TAG=fixed-v2 node repro2.mjs
# 未修复基线（git archive HEAD 到临时目录后在 :3030 起 dev server）
IC_BASE=http://127.0.0.1:3030 IC_TAG=pristine-v2 node repro2.mjs
```

脚本自包含：两张测试 PNG 以 base64 内嵌，Playwright 从 `web/node_modules` 解析
（可用 `IC_PLAYWRIGHT` 覆盖），结果写到当前目录的 `evidence-<TAG>.json`
（可用 `IC_EVIDENCE_OUT` 覆盖）。退出码 0 = PASS，1 = FAIL。

复跑记录（本轮）：`IC_TAG=selfcheck2` 从 `/tmp` 运行 → PASS，count=2，bytes 各 124。

## 4. 实测结果（机读证据见同目录 JSON）

| 运行 | 版本 | 结果 | 刷新后 assets | 字节 |
| --- | --- | --- | --- | --- |
| `evidence-pristine.json` | HEAD 未修复 | **FAIL** | count=1，仅 `pristine-TAB-B` | 只有 TAB-B 的 124B |
| `evidence-pristine-v2.json` | HEAD 未修复 | **FAIL** | count=1，仅 `pristine-v2-TAB-B` | 只有 TAB-B 的 124B |
| `evidence-fixed.json` | 修复后 | PASS | count=2，A+B 都在 | 两条各 124B |
| `evidence-fixed-v2.json` | 修复后 | PASS | count=2，A+B 都在 | 两条各 124B |

未修复版本稳定丢先保存的那一条（两次独立运行一致），修复后稳定两条都在且 `bytes` 均非空。

## 5. 已知限制（如实记录）

- 两层存储共用 IndexedDB 库 `infinite-canvas`（`app_state` / `image_files` / `image_previews`）。
  第一个标签首次上传图片时 localforage 会为新对象仓做一次版本升级；第二个标签恰在此时上传，
  `uploadImage` 可能长时间挂住。**该现象在未修复的 HEAD 上同样可复现，与本修复无关**，
  已通过「测试前先预热对象仓」规避，未在本次范围内修。
- 无 Web Locks 的环境里，「读最新→写回」之间仍有极窄窗口：两个标签在同一毫秒同时写，
  后写者可能用自己刚读到（那时还没有对方数据）的快照覆盖。Chromium / Electron / Safari
  15.4+ / Firefox 96+ 都有 Web Locks，实际运行路径是互斥的；单测里显式覆盖了两种路径。

## 6. 单测

`web/src/stores/asset-store-persist.test.ts`（`bun test`，12 passed）：

- 合并保留只在存储快照里的资产（LWW 回归）
- 同 id 时 `updatedAt` 新者胜出 / 时间相同以本次写入为准
- 墓碑阻止复活、删除后重新新增能盖过旧墓碑、过期墓碑清理
- 两个标签同时写（Web Locks 互斥路径）两份都在
- 无 Web Locks 时用旧快照写入不丢已落库资产
- `getItem` / `removeItem` 行为
