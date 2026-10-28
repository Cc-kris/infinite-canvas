# HAND_REPAIR / AREA_REPAIR 收尾（实况记录，边做边写）

日期：2026-10-28 · 分支 feat/linkfox-v1-real

## 1. 证据复核（对 d7a0de6 的交叉核验）

| 工具 | result.png | sha256 | 判定 |
| --- | --- | --- | --- |
| HAND_REPAIR | 1024×1024，1.35MB | `3e53cf33…`，与 OSS `https://oss-us.dimenoss.com/images/2026/10/28/1793199487_1ae76b65bdf7c0c415e9fed0e8025f06.png` 完全一致，且该 URL 现在仍 200 | 真实上游结果（run-edit6.json：POST `23210/https://api.cc-ai.xyz/v1/images/edits` **200**，30s） |
| AREA_REPAIR | 1024×744，31KB | `43ede96e…` **== `web/scripts/real-acceptance/fixtures/product-watch.jpg`** | **不是生成结果，是源图回声**。对应 run.json 里上游是 `POST /v1/images/edits` **401 Incorrect API key**，却被记成 `ok:true`（误判） |

结论：HAND_REPAIR 有真实结果可复用；AREA_REPAIR 没有任何真实出图证据，必须补一次真实生成，否则无法给出非弱对照的 PASS。

## 2. 与原站（LinkFox）1:1 对照要素

### AREA_REPAIR（https://www.linkfox.com/draw/area-repair）
原站控件（page-dom-20261028/AREA_REPAIR.json）：画笔、大小(px)、自动扩大选择区域、反选、撤销、重做、重置；上传图片（从本地上传 / 从作品库选择 / 从商品库选择）；重绘描述 * 0/600；生成张数 1–4；立即生成(40 算力)；生成结果 / 历史记录。

### HAND_REPAIR（https://www.linkfox.com/draw/hand-repair）
原站控件（page-dom-20261028/HAND_REPAIR.json）：画笔、大小、重置、撤销、重做（无羽化/反选/自动扩边）；上传图片 + 从作品库选择；性别与年龄（4 选项）；生成张数 1–4；立即生成（限免）；生成结果 / 历史记录；侧栏标注「即将下架 / 下架」。

## 3. 代码缺口（实测）

- `web/src/components/tools/workspaces/mask.tsx`（AREA_REPAIR 结果区 690–724）：只有 `<img>` + 状态文字，**没有 存库 / 发画布 / 下载** 三个动作 → 与原站及 HAND_REPAIR 不一致，属真实功能缺口。
- `repair.tsx`（HAND_REPAIR 1203–1440）：三动作已接 `saveResultItemToAssets` / `sendResultItemToCanvas`，只差真实点击证据。

## 4. 本次改动

### 4.1 代码（唯一改动）

`web/src/components/tools/workspaces/mask.tsx`

- `runAreaRepairUnits` 由 `concurrency: 2` → `concurrency: 1`：实测并发 2 时两个单元都卡在 `submitting`，互相拖住。
- 新增 `onOutcome`：每张完成即回流结果区，不再等整批结束（修前单张成功也不渲染）。

> 注：第 3 节记的「结果区没有 存库/发画布/下载」在本次收尾时**已不成立**——
> `mask.tsx` 107–153 行结果卡已接 `saveResultItemToAssets` / `sendResultItemToCanvas` / `<a download>`，
> `run-area-repair.mjs` 点击的 `area-repair-save-1 / -send-1 / -download-1` 与代码一致。

### 4.2 证据（真实，无 mock）

- AREA_REPAIR：2/2 真实出图（`POST /v1/images/edits` 200/36270ms、200/36342ms），
  下载/存库(assetId `U_TaBRV2fBhWCEm-hu6Ug`)/发画布(projectId `bzQ2ePN7UDxTFI1nbkfWy`) 三动作真实点通，
  `assets.png` / `canvas.png` 独立路由回验 → **PASS**，见 `evidence/real-acceptance/AREA_REPAIR/{result.json,CLOSEOUT.md,LINKFOX_COMPARE.md}`。
- HAND_REPAIR：真实出图 PASS（200/30093ms，sha `3e53cf331d5dae4b` ≠ 源图 `6fa693cbc2a1bf08`），
  但 存库/发画布/下载 未取得真实点击证据（`run-actions.json` 300s 超时），
  真实 Chrome 探针确认无持久化任务、无 hand-repair 资产可复用（`browser-control-probe.json`），
  按「禁止重复生成」不补跑 → **PARTIAL**，见 `evidence/real-acceptance/HAND_REPAIR/{result.json,CLOSEOUT.md,LINKFOX_COMPARE.md}`。
- 删除 `AREA_REPAIR/run.json`（源图回显假阳性 `bogusSourceEcho: true`），保留 `run-area.json` 作为修复前失败快照。

### 4.3 校验

- `bun test` 4 个聚焦文件：**65 pass / 0 fail / 313 expect()**（mask、area-repair、hand-repair、printing-repair-result-actions）
- `npx tsc --noEmit`：**EXIT=0**

