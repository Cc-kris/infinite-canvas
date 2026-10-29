# PRODUCT_IMAGE_SUITE 真实批量 + 刷新回填（2026-10-29 14:55）

环境：本地 dev http://127.0.0.1:3000，真实上游 gpt-image 通道，真实扣点。

## 批量（修复后）
配置：高级A+ ×1 + 场景图 ×1 = 100 点（页面算力文案一致）

| 观测 | 值 |
|---|---|
| 提交后历史坞 | 2 条真实任务（task-mvt6vpdn-17qby2 / task-mvt6vpdo-sc1x8w，submitting → succeeded） |
| 结果区汇总 | 共 2 张 · 成功 2 · 失败 0 · 待定 0 |
| 分组徽标 | 高级A+ 1/1 成功 ／ 场景图 1/1 成功 |
| 落盘 | localStorage `tool-task:v1:task-*` 中 PRODUCT_IMAGE_SUITE 2 条 |

## 刷新（Page.reload，非 SPA 路由跳转）
| 观测 | 值 |
|---|---|
| 历史任务 | 2 条（已完成，时间 2026-10-29 14:55） |
| 结果区 | 共 2 张 · 成功 2 · 失败 0 · 待定 0；高级A+（1/1）成功、场景图（1/1）成功 |
| 结果图 | 1024×1024 恢复渲染（blob URL，媒体从 IndexedDB 重新取回） |

## 修复
1. `getPersistedToolGateway()`：runSuite/retry 改走 store 网关（原先走内存 store port，任务不落盘 → 历史恒 0 条）。
2. 刷新回填用 store 任务按 prompt 对齐还原单元；prompt 落盘时换行被压成空格，改为空白归一化比对；
   「只回填一次」的锁移到匹配成功之后（避免草稿异步回填前用默认 config 误锁）。
3. 提交：c3f695d（store 网关）、ef2876a（归一化回填）。
