# H2｜FISSION_LINK / AI_DRESSING_XSY 真实历史恢复（2026-10-29 续做记录）

接续：`lf_design19_history_batch` 批次 + 提交 `32ef68e`。
约束：不派子 worker；不新建任务（只复用既有真实任务）；不注入快照冒充历史；只修真实持久化缺口；其他 design 工具不碰。

## 1. 代码侧排查（先读码）

| 项 | 事实 | 位置 |
|---|---|---|
| FISSION_LINK 工作区 | `FissionLinkWorkspace`；提交/重试/取消走 `getPersistedToolGateway()` | `web/src/components/tools/workspaces/scene.tsx:871,1588,1620` |
| FISSION_LINK 任务落盘 | `useToolTaskStore.upsertTask` + `hydrate`（G1 刷新恢复） | scene.tsx |
| AI_DRESSING_XSY 工作区 | 提交走 `createXsyRunPort().run()` → `useToolTaskStore.getState().runTool()`（已持久化） | `web/src/features/tools/adapters/ai-dressing-xsy.ts:254-261` |
| 历史坞入口 | 对所有非 `WORKSPACE_OWN_HISTORY` 工具统一挂 `<ToolHistoryDock toolId=… />`；XSY/FISSION_LINK 均不在排除表内 | `web/src/features/tools/tool-page.tsx:419-427,627-629` |
| 结果字节持久化 | 成功结果字节写 IndexedDB `media_files` 并记 `storageKey`；`hydrate()` 后 `restorePersistedTaskMedia()` 还原 | `web/src/stores/use-tool-task-store.ts:142-180,285-292` |

结论（代码）：两工具「提交 → 落盘 → 刷新 → 历史坞」链路均已接通，未发现需要新增的持久化接线。

## 2. 真实任务实测（ego lite，origin http://127.0.0.1:3000）

`localStorage['tool-task:v1:index']` 共 33 条：

- `FISSION_LINK` 5 条（4 succeeded + 1 failed；任务记录用 `result` 字段承载结果）
- `AI_DRESSING_XSY` **0 条**

全 profile 补充核查：对 `~/Library/Application Support/{Google/Chrome,Chromium,Microsoft/Edge,BraveSoftware,Vivaldi,@hilo,Novabox}/*/Local Storage/leveldb` grep `AI_DRESSING_XSY`，**无命中** → 该工具在任何可达 profile 内都没有真实历史任务（2026-10-28 那次真实出图跑在临时 Playwright profile，未留下任务记录）。

（后续实测结果追加见同目录 JSON。）
