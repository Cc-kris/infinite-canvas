# R8 审计工作日志（物理取证记录）

- 仓库：/Users/mac/Documents/Dev/infinite-canvas　分支 feat/linkfox-v1-real
- 运行时刻 HEAD：e33c56f（并行漂移：0a6d2c8 → 9873bb4 → 5fc2e69 → e33c56f）
- dev 栈：http://127.0.0.1:3000 HTTP 200
- 浏览器：ego lite 真实 profile，index 53 条任务；无法新建标签（popup 被拦），只读并行 agent 已开标签

## 裸测结论（现场）

| 对象 | 现场读数 | 对账 |
| --- | --- | --- |
| IMAGE_CROP tab | nav=reload，dock "1 条"，结果图 1024×744 | 任务 task-mvtbmukl-quasjm，result.items[0].bytes=205951，mime=image/png，storageKey=tool-result:_Z7jp3P-mlkBnYUUw5Zf9 |
| HEAD 产物 IMAGE_CROP/result.png | 205951 B，sha256 c046374eac48b82e… | 与任务记录字节完全一致 |
| FIX_COLOR/result-real-20261029.png | 1218527 B，sha256 83ef17c23f33eb25… | HEAD blob 与工作区一致，未被并行改动污染 |

## 关键证伪

- `evidence/real-acceptance/B5_HISTORY_DOCK/summary.json`：taskId 形如 `b5-<TOOL>-succeeded-N-<ts>`，产物走 127.0.0.1:23298 静态挂载 —— **注入式种子**，非真实历史。R7 用它给 13 个工具 H=PASS，R8 全部降级。
- 部分 H 回执声明字节与 HEAD 产物字节不一致（PRODUCT_REFINE 2827346 vs 2044177；PRINTING_REPAIR 1183770 vs 1153165；HAND_REPAIR 2153466 vs 1353583；PIS 2840825 vs 2151517；DWS 1883817 vs 1239248）——回执对账的是当次内存结果，落盘产物是另一次运行，**字节证据链断裂**，H 只能 PARTIAL。
- `use-tool-task-store.index-heal.test.ts` 为单测，不计入 H。
