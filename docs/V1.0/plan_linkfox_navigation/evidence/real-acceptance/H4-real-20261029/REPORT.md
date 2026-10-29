# H4 真实 H 验收（4 工具，2026-10-29 19:00–19:25）

环境：`http://127.0.0.1:3000`，用户真实 Chrome（CDP 自建标签，收工即关），真实整页 reload（`navigation.type=reload`）。
约束：复用 R8-fix 真实任务；未注入快照、未新生成、未改产品代码。

| 工具 | H | 路径 | 机器数据 |
|---|---|---|---|
| AI_POSE_GENERATOR | PASS | 历史坞回填 | task-mvtd89f3-9qpix6：渲染 1151209B / 1024² / sha256 19028125… == 任务声明；三动作 下载·存资产 eOac1dvc…·画布 nlMUWNNq… |
| NEW_DESIGNER | PASS | 历史坞+草稿回填 | task-mvtdl9v8-165q1n：411801B / 1200² / sha256 90e28e0f… == 任务声明；三动作 下载·存资产 nowDKQUv…·画布 3R6-XT-Tr… |
| IMAGE_TEXT_EDIT | BLOCKED(payload) | 结果卡自然回填 | reload 后结果卡自动为 succeeded（未点历史项），但任务 payloadDropped=true，无字节/三动作可验 |
| PRODUCT_MARKET_MATERIAL | BLOCKED(no-task) | 无 | 64 条本地任务中该 toolId 为 0；localhost 源与 worker profile 亦无 |

结论：两工具 H 由 PARTIAL 升 PASS 并附字节与动作回执；另两工具受「无可用真实任务」限制，需修复后提交一次真实任务（或授权新生成）才能出 PASS，本轮按约束不做。
