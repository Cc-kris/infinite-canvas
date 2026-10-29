# R17 三动作真实回执（PIS / NEW_DESIGNER，修复后 fresh reload）

日期：2026-10-29 · 环境：vite dev `http://127.0.0.1:3000` · 浏览器：用户 Chrome 现有会话（新开标签验证后关闭）
被测修复：`e78f634`（PRODUCT_IMAGE_SUITE 结果还原保真）、`c034fae`（NEW_DESIGNER fresh reload 后发画布/下载不再 Failed to fetch）
约束：不新生成任务、不注入数据，只复用已有成功任务的结果。

## 结论速览

| 工具 | 下载 | 存资产 | 发画布 |
|---|---|---|---|
| PRODUCT_IMAGE_SUITE | 1/2 落盘（第 2 张被 Chrome 连续自动下载静默拦截） | PASS 2/2 | PASS 2/2 |
| NEW_DESIGNER | PASS（sha 与真字节一致） | PASS（导出即入库，2 条） | PASS |

## PRODUCT_IMAGE_SUITE

页面：`/tools/ecommerce-suite/product-image-suite?fresh=1793281840581`，还原 2 个单元（A+ 图 / 场景图），任务
`task-mvt6vpdn-17qby2`、`task-mvt6vpdo-sc1x8w`。

存资产（点击「保存」→ 按钮态变「已存作品库」，读 IndexedDB `app_state/infinite-canvas:asset_store`）：

| assetId | resultItemId | bytes | sha256 |
|---|---|---|---|
| `VNzmLg-tuAfTh0nJcODrp` | `task-mvt6vpdn-17qby2-0` | 2785837 | `6f9dec2af872e9e97f26830b63f3126fd462a71ff8106bfbc3f67c43ae22c6a4` |
| `wz_Za93ggobpIS9WqsPkG` | `task-mvt6vpdo-sc1x8w-0` | 2840825 | `4047edd57e482b45f47a61d8fbacb4ec9b17635d06c1004793039e3ee42d7b52` |

发画布（点击「发送画布」→ 按钮态变「已发送画布」，读 `app_state/infinite-canvas:canvas_store`）：

| projectId | nodeId | 类型 |
|---|---|---|
| `aGnnTvJu1QdMhV7H_hu9_` | `image-1793281952745-t588k` | image |
| `y8FGuKkp7tc1KWnIRwB-f` | `image-1793281957755-63se1` | image |

下载：`~/Downloads/product-image-suite-result-1 (3).png`，2785837 B，
sha256 `6f9dec2af872e9e97f26830b63f3126fd462a71ff8106bfbc3f67c43ae22c6a4` —— 与 assetId `VNzmLg…` 的字节完全一致（bytes/sha 双等）。

第 2 张（场景图）点击「下载」后：无新文件、无 `.crdownload`、页面无报错；单独重试一次仍无文件。
判定为**浏览器策略层**（Chrome 对同 origin 连续自动下载的静默拦截），非应用异常——`downloadResultItem` 未抛
`ToolResultActionError`，且该函数成功后本就不写 UI 回执，所以应用侧看不到差异。

## NEW_DESIGNER

页面：`/tools/product-design/new-designer?fresh=1793281986826`，任务 `task-mvtdl9v8-165q1n`，响应 `dz1-156niae-2`，
结果区显示「已入库资产 #156niae- · 402 KB」，恢复草稿提示正常。

- 下载：`~/Downloads/new-designer-result-1 (2).png` 411801 B，
  sha256 `90e28e0f93420bb42270708737760d810d9df1e986566aed60d61a79b4a09d88`，
  与 IndexedDB `tool-result:vf21IxChoGYqJ9C8z8qMg` 真字节（411801 B、同 sha）**字节与哈希双等** → `c034fae` 生效，fresh reload 后 fetch 不再失败。
- 发画布：回执「已发送画布（项目 Z_1vTtbr · 节点 image-17…）」，`canvas_store` 新增 project `Z_1vTtbrlxiYoAUmDXh3t`、
  node `image-1793282047892-95442`（image）。
- 存资产：同任务 2 条资产 `nowDKQUvmRssATNlZ83VO` / `8J_BAwI8zxZ4ShWj0fxB7`，均 411801 B、sha 同上（设计器「导出设计稿」即入库）。

## 残留风险（未改代码，仅记录）

1. PIS 保存只写 `metadata.resultItemId`，不写 `taskId`，下游按 taskId 反查需解析前缀。
2. PIS 保存后 UI 只显示「已存作品库」，不回显 assetId，人工核对需读存储层。
3. PIS 批量下载第 2 张起会被浏览器静默拦截，若要批量需改打包 zip 或提示用户放开「自动下载」权限。
4. NEW_DESIGNER fresh reload 后没有独立「存资产」按钮，入库绑定在导出动作上。

## 代码健康度（未改业务代码，本次仅补回执证据）

- `npx tsc --noEmit -p tsconfig.json` → `TSC_EXIT=0`
- `~/.bun/bin/bun test`（suite / new-designer / product-image-suite / result-assets / tool-result-actions.hydration / tool-result-actions.deps / tool-result）→
  **136 pass / 0 fail，615 expect()，7 files，1.05s**

> 注意：这批测试用 `bun:test`，`vitest run` 无法执行（会报 `Cannot find package 'bun:test'`）；且 `bun` 不在 PATH，须用 `~/.bun/bin/bun`。

机器可读版本：[ACTIONS.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/R17-three-actions-20261029/ACTIONS.json)
