# AREA_REPAIR 验收排查记录

## 结论速览
- 旧 evidence/result.png 的 sha256 == fixtures/product-watch.jpg → 是“源图回声”假阳性；run.json 里 upstream 只有一条 `POST .../v1/images/edits 401`（打到真 OpenAI 代理 23299、空 key）。
- 新脚本 `web/scripts/real-acceptance/run-area-repair.mjs`（node `/opt/homebrew/bin/node`，环境变量 `AREA_OUTPUT_NUM` 控制张数）走真实 CCAI 通道。
  - **1 张**：端到端通过。上游 200 / 28.6s；结果 sha 与源图不同；存库 assetId=`K1-T...`、标题“product-watch.jpg 第 1 张”、source=area-repair；发画布 projectId=`rz_g7tl4FSL5bYdkq9WF6`，反馈“第 1 张已发到画布”；下载 href 为 OSS 真实地址，download 名 `product-watch-repainted.png`。
  - **2 张**：结果区始终 0 张卡（长时间无 notice、无失败文案），上游只看到 1 条 35s 的 200，之后偶发一条 16ms 的 200。

## 已排除
- `use-tool-task-store.runTool` 无并发锁/队列。
- `gateway.submit` 确有 fingerprint 去重，但 fingerprint 含 prompt，而 `composeAreaRepairPrompt` 在总张数>1 时会写入“第 x/y 张变体”，两组单元 prompt 不同 → 理论上不会互相去重。
- 第 1 单元请求确实发出且成功（35s/28s 量级）。

## 待验证
- mask.tsx 的 `setOutcomes` 只在 `runAreaRepairUnits` 全部单元完成后调用 → 单张成功也不会立刻渲染，用户侧看起来“卡住”。这既是观测盲区，也可能是 2 张时的真实体验缺陷（应逐单元回流）。
- 第 2 单元的 submit 是否真的发出（落盘任务快照 tool-task:v1:<id> 里应有 2 条记录）。

## 观测手段
脚本每轮轮询已打印：cards/withSrc、submitDisabled、上游请求 [status/ms]、notice、panel、failed，以及 localStorage 任务快照（status/dedupe/fingerprint/tool/error）。
