# 独立复核报告 · infinite-canvas 三提交（2026-10-29）

复核对象：`4b2e721`（DESIGN_BATCH 真实批次回执）、`9a7b137`（DESIGN_BATCH 运行记录）、`5f41f91`（电商套图四工具真实生成终态）。
约束：不派子 worker、不改功能源码、不重新生成任何图片；所有 PASS 均以「实际执行 / 实际取字节」为准，读码和他人自述不作为通过依据。

环境：macOS + ego lite（extension 可控标签），前端 `http://127.0.0.1:3000`，数据面 = localStorage（`tool-task:v1:*`、`batch-task:v1:*`）+ IndexedDB/localforage `infinite-canvas / media_files`。

---

## 1. 结论总表

| # | 被复核断言 | 结论 | 依据 |
|---|---|---|---|
| 1 | 批次 `batch_XoWY1VJqvX` 真实提交、completed、成功 2 / 失败 0 / 跳过 0 | **PASS** | 全新标签页打开 `/tools/batch-generate/batch_XoWY1VJqvX`，DOM 计数 `行数 2 / 成功 2 / 失败 0 / 跳过 0`；store `status=completed` |
| 2 | 两行结果都是真实 PNG 字节，sha256 与回执一致 | **PASS** | 证据 PNG `shasum -a 256` 复算 = 回执值；`git ls-tree` blob 与工作区一致 |
| 3 | 行 2 产物可从 OSS 直链独立取得同字节 | **PASS** | `curl` → HTTP 200、1237615 B、sha256 `e4bd821f…` 完全一致 |
| 4 | 两行结果与输入不是同一张图（真跑过模型） | **PASS** | 灰度 128×128 相关：input↔row1 0.532、input↔row2 0.530；row1↔row2 0.777；三者 sha 各异；锐度 mean\|∇\| 2.291 → 2.578 / 2.513 |
| 5 | 两行并行执行 | **PASS** | 两行 `submittedAt` 差 11 ms；wall 41.9 s < 41.9+22.7 s |
| 6 | 回执 / RUNLOG 记「2 行，并发 1」 | **FAIL（文档错，功能无碍）** | store `concurrency=3`；详情页并发下拉实测 `3`；`b6-real-batch-receipt.json` 写 3 正确，`RUNLOG.md` 与 `4b2e721` commit message 写 1 错误 |
| 7 | 刷新后批次状态与计数可恢复 | **PASS** | fresh reload 后仍 2/0/0，逐行「成功 · 第 1 次」 |
| 8 | 刷新后行 1 无缩略图、行 2 有可点链接（回执自述） | **PASS（现象属实，原因已定位）** | 行 1 `result.items[0].url` = `blob:`+`storageKey=tool-result:MOMNo1Dk…`，`outcomes[row_D3BqXT8q].resultUrls=[]` → 刷新后失效；行 2 `resultUrls=[OSS…]` 稳定 → `<a href>` 缩略图可点 |
| 9 | 刷新后能从 UI 看到「批次历史」 | **FAIL（UX 缺口）** | `batch-task:v1:index` 实测 `["batch_XoWY1VJqvX","batch_dPefELopUM"]`，但 `/tools/batch-generate` 只渲染「选择可批量工具」；`BATCH_INDEX_KEY` 仅被 store 内部读写、**无组件消费** → 刷新后只能靠已知 URL 回到详情 |
| 10 | 四工具任务均 succeeded，字节/尺寸/sha 与 RESULTS.json 一致 | **PASS** | 4 条 `tool-task:v1:*`：`succeeded`、`attempts=1`、`payloadDropped=false`，`items[0].bytes/storageKey` 与 RESULTS.json 对应 |
| 11 | 6 个 `storageKey` 原始 blob 可解且同字节 | **PASS** | 逐个从 IDB `media_files` 取 Blob 计 sha256，全部命中证据 PNG |
| 12 | 4 条结果已入资产库（tool-asset） | **PASS** | `asset_store` 中 4 个 assetId 均存在，其 `image:*` blob sha 与结果一致 |
| 13 | AI_POSE_GENERATOR「UI 报成功但文件不落盘，4 次重试均失败」→ BLOCKED | **PARTIAL / 该结论不成立** | 见 §3：全新页面首次点击**真实落盘** 1151209 B、sha `19028125…`、带 quarantine；第 2/3 次点击 toast 仍报成功但无文件 → 真实边界是**浏览器重复自动下载拦截 + 单张下载乐观提示** |

---

## 2. DESIGN_BATCH 详证

### 2.1 字节与哈希（本机复算）

| 对象 | 尺寸 | bytes | sha256 |
|---|---|---|---|
| 输入 `SCALE_UP/05-downloaded.png` | 1024×752 RGB | 1152074 | `1e12a562cb2cdc19cb9e4e1c800d68f7be6a6892dc2f0b52a6fc21b991d440f7` |
| 行 1 `…-row_D3BqXT8q.png` | 1024×1024 RGB | 1638630 | `cc6cf58b3ee94bff9dfacb859853618711189bc7cf83fe7ba39b7759f9cb047b` |
| 行 2 `…-row_KWQoUzW9.png` | 1024×1024 RGB | 1237615 | `e4bd821fcd8f52f9f150cb23dfbdfb20bf6be0ad27ce3d4a4813f92617dcd8f9` |

行 2 OSS 直链 `https://oss-us.dimenoss.com/images/2026/10/29/1793268247_7ccc9eed5d79e196344c3b00aab00fc3.png`：HTTP 200，1237615 B，sha 同上（独立于浏览器缓存）。

### 2.2 批次 store（localStorage 实测）

```
batchId=batch_XoWY1VJqvX  toolId=SCALE_UP  concurrency=3  status=completed
aborted=false  lastError=null  startedAt=1793268224777  finishedAt=1793268266694
rows=[row_D3BqXT8q, row_KWQoUzW9]   每行 references=[]（参考图未持久化）
outcomes=[
 {rowId:row_D3BqXT8q, succeeded, attempts:1, resultCount:1, resultUrls:[],
  taskId:task-mvtdllw0-dn440l, startedAt:1793268224782, finishedAt:1793268266682, durationMs:41900},
 {rowId:row_KWQoUzW9, succeeded, attempts:1, resultCount:1,
  resultUrls:[https://oss-us.dimenoss.com/.../1793268247_7ccc9eed....png],
  taskId:task-mvtdllwa-4nnit3, startedAt:1793268224793, finishedAt:1793268247518, durationMs:22725}]
```

并行证据：两项 `submittedAt` 相差 11 ms，总耗时 41.9 s 明显小于「41.9 + 22.7」→ 两行同时在跑，与 `concurrency=3` 一致、与 RUNLOG「并发 1」矛盾。

### 2.3 结果与输入的差异（量化）

- 结构：输入 1024×752（4:3）→ 两行输出均 1024×1024（1:1）。提示词写「输出 2048px 长边」，实际由 `configSnapshot.size="1:1"` 决定为 1024×1024。证据文档未注明这条不一致，易误读为「按提示词等于 2048」。
- 内容：灰度 128×128 相关 input↔row1 0.532、input↔row2 0.530（构图保留但明显重绘）；row1↔row2 0.777（同场景不同细节，非重复产物）；三文件 sha 全不同。
- 锐度代理 mean|∇|：输入 2.291 → 2.578 / 2.513，方向符合「提升清晰度」，但 4:3→1:1 属比例改变，事实层面应写成「1:1 规格重绘」而非等比放大。

### 2.4 fresh reload 实测（自开新标签 1709629257）

- 详情页：`行数 2 / 成功 2 / 失败 0 / 跳过 0`，`batch-status=已结束`，`select[aria-label="并发上限"].value="3"`（选项 1–5）。
- `batch-row-0`：无 `<img>`、无 `<a>`，仅「成功 · 第 1 次」+「刷新后有 1 张参考图未恢复，请重新上传」。
- `batch-row-1`：有 `<a href="https://oss-us.dimenoss.com/images/2026/10/29/…">`（无 `download` 属性），缩略图挂在该链接上。
- 列表页 `/tools/batch-generate`：只有 12 个工具入口，无任何批次历史。

---

## 3. AI_POSE_GENERATOR 下载边界（实测，非读码）

| 次序 | 操作 | UI 反馈 | 磁盘 |
|---|---|---|---|
| 第 1 次 | 全新标签打开 ai-pose 页 → 展开历史 `task-mvtd89f3-9qpix6` → 点 `tool-history-dock-download` | toast「已下载 ai-pose-generator-result-1.png」 | **落盘** `ai-pose-generator-result-1 (1).png`，18:18:30，1151209 B，sha256 `19028125bae9618e8e01801480518db186b6ace6cccf0cff7f5ae4c6ec84300d`（= 任务 `items[0].bytes`）；xattr `com.apple.quarantine … ego lite` + `kMDItemWhereFroms=http://127.0.0.1:3000/…` |
| 第 2 次 | 再点同一按钮 | toast 仍「已下载 …png」 | 无新文件、无 `.crdownload` |
| 第 3 次 | 重新查询按钮后重点 | toast 仍「已下载 …png」 | 无新文件 |

判断：
1. 「下载功能坏了」不成立 —— 正常一次点击即可拿到真实字节，sha 对齐任务记录，且是浏览器原生下载（quarantine/WhereFroms）。
2. 能复现「提示成功但没文件」—— 连续第 2、3 次点击时后续自动下载被浏览器拦掉，而 UI 仍报成功。代码原因：`downloadResultItem()` 调 `file-saver` 的 `saveAs()` 后立即返回文件名，**无落地校验**；`tool-history-dock` 拿到文件名就渲染「已下载」。
3. 故 `5f41f91` 中 `download.status=blocked`「4 次重试均不落盘」与实测不符（我在全新加载页面首次点击即成功，等价其「整页 reload 后」场景），应改为 PARTIAL，失败原因是浏览器重复自动下载策略 + 乐观 toast。
4. 相关事实：`tool-result-actions.ts` 的批量路径 `downloadResultItems()` 已用 ZIP 合并 + `skipped` 明细规避同一坑（注释写明「连续三次 saveAs 只落地第一个文件」），**单张路径没对齐**。

---

## 4. 四工具终态（5f41f91）

| 工具 | taskId | 尺寸/模式 | bytes | sha256(16) | 下载状态（复核后） |
|---|---|---|---|---|---|
| AI_POSTURE | task-mvtczxwo-e1d1w0 | 1024×1024 RGB | 1557308 | `03ec4754b62fb2e6` | ok（有 quarantine/WhereFroms） |
| MATERIAL_UPPER_BODY | task-mvtd45nv-y7cum6 | 1024×1024 RGB | 1525374 | `79bddf28c16aa5c7` | ok |
| AI_POSE_GENERATOR | task-mvtd89f3-9qpix6 | 1024×1024 RGB | 1151209 | `19028125bae9618e` | **实测 ok**；原 blocked 不成立，见 §3 |
| NEW_DESIGNER | task-mvtdl9v8-165q1n | 1200×1200 RGBA | 411801 | `90e28e0f93420bb4` | ok；`canvas={canvasId:hizF9wCnG20QNBDsnjRM0,nodeId:image-1793268249669-dk2gs}`，`designerConfig.layers=2` |

- 4 条任务记录均 `succeeded`、`attempts=1`、`payloadDropped=false`；`items[0].storageKey/bytes` 与 RESULTS.json 一一对应。
- 6 个 `storageKey`（含批次 2 条）从 IDB `media_files` 取 Blob 复算 sha，全部与证据 PNG 一致。
- 4 个 assetId（`JBUR9FikfKJ9MKa4mqGNt` / `HF5bgHaqdS4Lo33cIxWIB` / … / `8J_BAwI8zxZ4ShWj0fxB7`）存在于 `asset_store`，其 `image:*` blob sha 与结果一致 →「已存入资产」成立。

---

## 5. 发现的问题（如实）

1. **文档数字错**：`RUNLOG.md`、`4b2e721` commit message 的「并发 1」与实测 `concurrency=3` + 并行时序不符（`b6-real-batch-receipt.json` 写 3 是对的）。
2. **批次历史无 UI 入口**：`batch-task:v1:index` 有数据、详情页可恢复，但列表页无批次列表组件（`BATCH_INDEX_KEY` 无消费者）→ 刷新后只能手输 URL。
3. **行结果持久化不完整**：本地存储型结果（`storageKey`+`blob:`）刷新后无缩略图/无入口，只有 OSS 型结果可点；`outcomes.resultUrls` 只收集 http(s)。
4. **单张下载乐观提示**：被浏览器拦截时仍报「已下载」，`downloadResultItem` 无落地校验，与批量路径的防护不一致。
5. **prompt 与配置不一致**：SCALE_UP 提示词要求 2048px 长边，实际 `size=1:1` 出 1024×1024，4:3 输入被改成 1:1，需在证据里注明。

---

## 6. 未验证 / 限制

- 未在「干净 profile、从未下载过」状态下验证首次点击策略；重复下载拦截的确切策略由行为证据（1 次成功 / 后两次无文件且无 `.crdownload`）推断，未从 ego lite 的 `automatic_downloads` 配置直读（该 profile 的 Preferences 路径未定位到）。
- 未重新生成任何图片（按要求），模型侧请求日志与计费未复核。
- 行 1 刷新后无法从 UI 再次下载（无入口），只能走任务历史/IDB 取字节，未做 UI 侧复测。

---

## 7. 复现命令

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance
shasum -a 256 DESIGN_BATCH/*.png SCALE_UP/05-downloaded.png
curl -sSL -o /tmp/row2.png "https://oss-us.dimenoss.com/images/2026/10/29/1793268247_7ccc9eed5d79e196344c3b00aab00fc3.png"; shasum -a 256 /tmp/row2.png

open -a "ego lite" "http://127.0.0.1:3000/tools/batch-generate/batch_XoWY1VJqvX"   # 2/0/0，并发下拉=3
open -a "ego lite" "http://127.0.0.1:3000/tools/product-design/ai-pose-generator"   # 历史栏→下载，diff ~/Downloads
```

原始数值见同目录 `VERIFY_DATA.json`。
