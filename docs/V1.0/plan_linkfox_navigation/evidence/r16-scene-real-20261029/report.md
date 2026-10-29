# R16：PRODUCT_SCENE / HANDHELD_GOODS 真实生成回执

环境：`http://127.0.0.1:3000`（vite dev）；任务库 `localStorage tool-task:v1:*`；字节库 IndexedDB `infinite-canvas/media_files`。
本轮规则：真实 UI 操作、真实请求、不注入、不改库；失败保留原始错误。

## PRODUCT_SCENE —— 已从 0 任务变为真实成功任务

| 项 | 值 |
|---|---|
| taskId | `task-mvtly3vu-fdqgy7` |
| 终态 | `succeeded`（UI「已完成」） |
| 结果项 | `tool-result:task-mvtly3vu-fdqgy7:0:TTlb-VmksNFfPn_GhRyTk` |
| 真实字节 | **2398828 B**，`image/png` |
| sha256 | `fa5ee380ab79ae8b924e1481136cbcfe4f23473926246c79129fc0c59093f9e2` |
| 下载 | 已下载 `product-scene-result-1.png`，落盘副本即本目录 PNG（字节一致） |
| 存入资产 | `ofbXDtlnY5gFse29gfpuf` |
| 发送画布 | `A6AI_SDmdn8KK1WmaHkg5` |

输入素材：使用浏览器内既有真实商品图字节（483818 B，1200×1200），经上传控件（`data-testid=tool-asset-dropzone`）真实走 `change` 事件进入工具输入，非构造结果。

## HANDHELD_GOODS —— 状态未变

既有任务 `task-mvs5p8g8-or3oim` 仍为 `failed` / `submit-unconfirmed`（页面刷新中断），items=0，`upstreamTaskId` 为空，无法向上游对账。本轮未重跑、未回填，保持原样。

## 缺口与根因线索

- 提交路径未把 `upstreamTaskId` 落盘（`gateway.ts` 在拿到上游 id 前的持久化窗口太窄），导致刷新中断后只能判 `submit-unconfirmed`。这是明确的代码缺口，但修复需要改动提交流程，本轮未动源码（无 tsc/测试改动）。
- PRODUCT_SCENE 之前的「0 任务」是历史遗留（从未落库），本轮已用一次真实生成补齐。

## 复现入口

打开 `/tools/product-design/product-scene`，上传商品图 → 选风格/尺寸 → 「立即生成」。
