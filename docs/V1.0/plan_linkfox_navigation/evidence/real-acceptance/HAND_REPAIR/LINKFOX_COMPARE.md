# HAND_REPAIR · 与 LinkFox 原站 1:1 对照

- 本地路由：`/tools/smart-edit/hand-repair`（`RepairWorkspace`）
- 原站：`https://www.linkfox.com/draw/hand-repair`（原站菜单标「下架」，路由仍可用），证据级别 `workspace_dom`
- 规格来源：`docs/V1.0/plan_linkfox_navigation/page-specs/14-hand-repair.md`
- 对照时间：2026-10-29（分支 `feat/linkfox-v1-real`）
- 对照方式：page-specs §2/§9 文案 + 本地真实 DOM `data-testid`（`repair.tsx`）+ `run-edit6.json` 里抓到的真实结果 DOM。

## 1. 控件级对照

| 原站控件（page-specs §2/§9） | 本地实现 | 本地锚点 | 实测结论 |
| --- | --- | --- | --- |
| 画笔 / 大小：像素 | 画笔 + 尺寸 | `hand-repair-brush` | 有 |
| 撤销 / 重做 / 重置 | 三按钮 | `hand-repair-undo` / `hand-repair-redo` / `hand-repair-reset` | 有 |
| 手部蒙版画布 | 涂抹画布 | `hand-repair-canvas` + `hand-repair-coverage` | 有 |
| 成年男性 / 成年女性 / 男孩 / 女孩 | 人物类型选择（4 项） | `hand-repair-person-type` | 有 |
| 生成张数 1–4 | 张数选择 | `hand-repair-output-num` | 有 |
| 立即生成（限免） | 生成按钮，文案「开始生成」 | `hand-repair-submit` | 有；不显示算力 |
| 生成结果 / 历史记录 | 结果区 + 历史 | `hand-repair-results` / `hand-repair-summary` | 有 |
| 原站「即将下架 / 下架」标注 | 本地「原站已下架」证据标签 | `hand-repair-deprecated` | 有 |
| 结果卡动作（下载/保存资产/发送画布） | 存库 / 发画布 / 下载 | 结果 DOM：`hand-repair-save-1` / `hand-repair-send-1` / 文本「下载」 | **按钮有、真实点击未取证** |

## 2. 真实证据（非 mock）

| 证据 | 文件 | 关键值 |
| --- | --- | --- |
| 上游真实调用 | `run-edit6.json.network` | `POST /v1/images/edits` 200 / 30093ms |
| 结果图 | `result.png` | 1024×1024，1353583B，sha `3e53cf331d5dae4b` |
| 结果来源 | `run-edit6.json.resultDom` | `https://oss-us.dimenoss.com/images/2026/10/28/1793199487_1ae76b65bdf7c0c415e9fed0e8025f06.png` |
| 非回显校验 | `run-edit6.json` | fixtureSha `6fa693cbc2a1bf08` ≠ resultSha `3e53cf331d5dae4b` |
| 刷新后仍可见 | `run-edit6.json.afterReload` | images 2 / hasResult true |
| 界面截图 | `ui.png`、`step-1-loaded.png`、`step-2-submitted.png` | — |

## 3. 缺口（如实记 PARTIAL）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| 存库 → assetId | PARTIAL | `run-actions.json`（16:19:23Z 起）300s 内未拿到结果即超时，未点；`browser-control-probe.json` 证明真实 Chrome 档内也无 hand-repair 资产可复用 |
| 发画布 → projectId | PARTIAL | 同上 |
| 下载 → download 事件 | PARTIAL | 按钮存在且 `disabled=false`，本轮未落盘真实下载 |
| assets.png / canvas.png | 缺失 | 需上述动作真实点通后才能回验，禁止重复生成故不补 |

补充：`run-actions.json` 里 `fixtureSha256 == resultSha256 == 6fa693cbc2a1bf08` 属**源图回显假阳性**，那一次不构成有效结果；`run-edit6.json` 才是真实出图，故本次以它为准。

## 4. 未覆盖 / 风险

- 响应式与深色模式未取证。
- 原站已下架，原站页面本身不可再抓，对照依据为既有 page-specs 摘录。
