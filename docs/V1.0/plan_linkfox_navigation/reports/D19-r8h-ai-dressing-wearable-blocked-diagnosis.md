# AI_DRESSING_V2 / AI_WEARABLE「历史坞 BLOCKED」定性诊断（HEAD 7bb731b）

> 结论：**保留真实 BLOCKED，不伪 PASS**。经 7 路物理探测，「任务存在但结果区/历史坞不回填」这一前提在常驻 profile 中**不成立**——这两个 toolId 从未落过任务快照；同时已排除 schema / adapter / 索引自愈 / 字节完整性 四类原因。

## 1. 现场（浏览器实读，非脚本摘要）

目标：`http://127.0.0.1:3000`，应用自身的 `localStorage` 与 `IndexedDB`。

| 观测 | 结果 |
| --- | --- |
| `tool-task:v1:index` 条目 | 64 |
| `tool-task:v1:task-*` 实际键 | 64（索引与实际一致，无缺键/孤键） |
| `toolId === AI_DRESSING_V2` | 0 |
| `toolId === AI_WEARABLE` | 0 |
| 旧 schema 键扫描（无 `v1` 前缀等） | 无 |
| 语义扫描（mask/suit/upper/dressing/wearable/prodCateg…） | 13 命中，逐条归属 REMOVE_PEN / PRODUCT_IMAGE_SUITE / DRESS_WEAR_SET，**无一条属于这两个工具** |
| `media_files` blobs | 88 |
| 任务引用但库中缺失的 storageKey | 0 |
| `succeeded` 但 items 为空的任务 | 0 |

→ 既没有「任务在但字节没了」，也没有「字节在但任务记错 toolId」。

## 2. 代码侧逐层排除

| 层 | 证据 | 判定 |
| --- | --- | --- |
| adapter | `web/src/features/tools/adapters/ai-dressing-v2.ts:208` → `toolId: AI_DRESSING_V2_TOOL_ID`；`ai-wearable.ts:345` 同上，且 `validate` 强校验 toolId | 正常 |
| 提交网关 | `ai-dressing-v2.ts:223 createDressingRunPort()` → `useToolTaskStore.getState().runTool()`；`dressing.tsx:383` 调 `runDressingUnit(port, unit)` | **store 背书，无旁路** |
| 落盘/自愈 | `use-tool-task-store.ts` 的 `readTaskIndexIds` / `scanPersistedTaskIds` / `healTaskIndex`；git 历史无按 toolId 裁剪或删除的逻辑（`-S"MAX_PERSISTED"`、`-S"slice(-"` 仅命中自愈提交 0b9aecf） | 正常，不存在裁剪丢数据 |
| 历史坞过滤 | `tool-history-dock.tsx:105` → `task.toolId === toolId`（严格相等）；`tool-page.tsx:390/392` 映射 `AI_DRESSING_V2→DressingWorkspace`、`AI_WEARABLE→AiWearableWorkspace`（`dress.tsx:367`） | 正常，无别名/能力表导致丢任务的路径 |
| 清理脚本 | `web/scripts/**` 无 `localStorage.removeItem('tool-task…')` 一类清理 | 正常 |

## 3. BLOCKED 的真实成因（数据级，非缺陷级）

两个工具**确实有真实上游产物**（真实 provider 出图，非 mock）：

| 文件 | 字节 | 尺寸 | sha256 |
| --- | --- | --- | --- |
| `evidence/real-acceptance/AI_DRESSING_V2/result1.png` | 819224 | 720x960 | `446d9ffe39f94d706a2d541118c1dadff9908fb4bf88fff2eec3fcfbea54365d` |
| `evidence/real-acceptance/AI_WEARABLE/result1.png` | 1641506 | 720x960 | `7615ee04f73cfd0cdbbbc42a308e272310e45d1ee16a9b30d0b46d4dd7abd312` |

但这些产物是**自动化脚本在临时浏览器 profile 内**跑出来的：`web/scripts/real-acceptance/run-b4-dock-actions.mjs` 用 `chromium.launch()` 起独立 profile，任务快照用应用自己的 `persistTask()` 落在该临时 profile 的 `localStorage`，字节落在该 profile 的 IDB；进程退出即随 profile 消失。因此：

- `evidence/real-acceptance/AI_DRESSING_V2/b4-actions.json` 里 `dockItemCount: 1`（临时 profile 内真实可见）与常驻 profile 的 `0 条` **并不矛盾**；
- 常驻 profile 从未执行过这两个工具的提交，历史坞 0 条是「**无记录**」而非「回填失败」。

补充：`tool-history-dock.tsx` 的设计边界是「只展示任务与它真实带回的结果项，不做一键全部回填」，每项自带 下载 / 存入资产 / 发送画布（`tool-result-actions.ts`）。所以「结果区自动回填」本就不是约定行为，卡在这里的不是回填链路的 bug。

## 4. 本轮验收边界

- ❌ 不做：为凑证据而向常驻 profile 注入任务快照，或新跑上游生成（违反「禁止注入或新生成」；注入快照按审计规则不计入 H）。
- ✅ 已做：现场实读 + 语义归属扫描 + 字节完整性核对 + adapter/网关/自愈/过滤/清理 五层代码排除 + 真实产物 sha256 归档。
- 结论：**H（reload 后历史坞）在 7bb731b 上对这两个工具仍是真实 BLOCKED**；要转绿需在该 profile 里**真实跑一次**任一工具（会产生新任务快照）。产物与能力均无阻塞。

## 5. 复现命令

```bash
# 现场读数（浏览器 console）
Object.keys(localStorage).filter(k=>k.startsWith('tool-task:v1:task-')).map(k=>JSON.parse(localStorage.getItem(k)).toolId)
# 产物校验
shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_DRESSING_V2/result1.png
shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_WEARABLE/result1.png
```

## 6. Fresh reload 现场取证（本轮实读，非历史证据）

`http://127.0.0.1:3000/tools/product-design/ai-dressing-v2`，硬导航后 `readyState=complete` 实读：

```json
{"url":"http://127.0.0.1:3000/tools/product-design/ai-dressing-v2","wsToolId":"AI_DRESSING_V2","wsState":"ready","dockMounted":true,"countText":"0 条","emptyHint":"本工具还没有历史任务；提交一次后会在这里留下任务、配置与结果，刷新后仍在。","itemCount":0,"indexTotal":64,"tasksForTool":0}
```

解读：
- 工作区正常挂载并到达 `ready`（草稿恢复链路在跑，页面无异常）；
- 历史坞**已挂载**，读的是 store 真实数据：`0 条` + 官方空态文案，`indexTotal=64 / tasksForTool=0`；
- 即「坞不回填」不成立——坞工作正常，只是该 toolId 在持久层没有记录（空态文案本身就是设计给这种情况的）。
