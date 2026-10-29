# H7｜7 工具真实历史恢复 — 现场结论与修复（2026-10-29）

范围：`NEW_REPLACE_BG_V2`、`REPLACE_GOODS`、`PRODUCT_SCENE`、`HANDHELD_GOODS`、`AI_DRESSING_V2`、`AI_POSTURE`、`AI_WEARABLE`
约束：不重新生成、不注入快照冒充真实历史、只修真实恢复缺陷。

## 1. 核心结论（先说结论）

**这 7 个工具在可达的浏览器配置里，真实任务记录为 0 条**，因此“fresh reload 后从历史坞恢复真实结果”在**不重新生成**的前提下，没有任何真实数据可恢复。

排查过程与证据（全部实测，非推断）：

| 检查面 | 方法 | 结果 |
|---|---|---|
| 真实用户 profile | CDP 读取 `localStorage['tool-task:v1:index']` 全量 32 条 | 15 个 toolId，**7 个目标工具 0 条**（也无变体 ID） |
| 任务是否被裁剪 | `TASK_MAX_PERSISTED=50`，现存 32 | 未触发裁剪，排除“被挤掉” |
| IndexedDB | `infinite-canvas` 的 `app_state` / `tool_assets` / `media_files` | 只有输入图与草稿，**无这 7 个工具的结果产物** |
| 磁盘证据 | `rg` 全库 JSON + 证据目录 | 无这 7 个工具的任务快照 |
| 其他浏览器 | Chrome/Edge/Brave 各 profile 的 Local Storage leveldb 二进制检索 | 无命中 |
| 其他 origin | `localhost:3000` 等 | 无额外任务库 |
| 服务端 | `tools/gateway.ts` 无任务查询接口；`canvas-proxy` 仅转发 | 无服务端任务库可查 |
| 历史坞数据源 | `tool-history-dock.tsx` 只读 `useToolTaskStore` | 无真实任务即恒空 |

补充：4 个工具（`AI_DRESSING_V2`、`AI_POSTURE`、`HANDHELD_GOODS`、`REPLACE_GOODS`）在真实 profile 里**留有草稿**，说明确实在本机跑过，但任务快照未落盘——正好印证下面第 2 节的缺陷。

## 2. 修复的真实恢复缺陷

**缺陷**：`PRODUCT_SCENE`、`AI_WEARABLE` 提交任务时用的是 `getToolGateway()`（`sharedGateway`，无 store 绑定），任务只活在内存里：刷新即丢、历史坞永远是 0 条。

- `web/src/components/tools/workspaces/scene-fission.tsx`：3 处（生成 / 重试 / 做同款）改为 `getPersistedToolGateway()`
- `web/src/components/tools/workspaces/dress.tsx`：2 处（生成 / 重试）改为 `getPersistedToolGateway()`

与已通过 G1 验收的 `scene.tsx`（`NEW_REPLACE_BG_V2`）写法一致：`gateway: port ?? getPersistedToolGateway()` 同源。

**验证**：
- `tsc --noEmit` 通过（0 error）
- `bun test src/components/tools/tool-history-dock.test.tsx src/components/tools/workspaces/pod.test.tsx` → 12 pass / 0 fail

## 3. 取证（本轮实测）

`h7-freshload-probe.json`（脚本：`web/scripts/real-acceptance/h7-restore-probe.mjs`，全新临时 profile，只读，不生成不注入）：

| 工具 | 工作台挂载 | 历史坞 | 条目数 | 本工具真实任务 |
|---|---|---|---|---|
| NEW_REPLACE_BG_V2 | ✅ | ✅ | 0 | 0 |
| REPLACE_GOODS | ✅ | ✅ | 0 | 0 |
| PRODUCT_SCENE | ✅ | —（自带「历史记录」页签，设计如此） | 0 | 0 |
| HANDHELD_GOODS | ✅ | ✅ | 0 | 0 |
| AI_DRESSING_V2 | ✅ | ✅ | 0 | 0 |
| AI_POSTURE | ✅ | ✅ | 0 | 0 |
| AI_WEARABLE | ✅ | ✅ | 0 | 0 |

> 勘误：早期一次探测（等待不足 1.5s）记录的“历史坞缺失”是**误判**，已用 4.5s 稳定等待重测并覆盖，上表为最终数据。

归档的真实产物字节（真实 provider 输出，**是产物、不是任务记录**，无法经历史坞恢复）：

| 工具 | 文件 | 字节 | 尺寸 | sha256(前 12) |
|---|---|---|---|---|
| NEW_REPLACE_BG_V2 | result1.png | 1109268 | 1024×1024 | 58041a5cf1df |
| REPLACE_GOODS | upstream_result.png | 1216214 | 1254×1254 | 6bcfd3101e48 |
| PRODUCT_SCENE | result1.png | 1421980 | 1024×1024 | 260071186391 |
| HANDHELD_GOODS | result.png | 1060068 | 720×960 | fbb05871e134 |
| AI_DRESSING_V2 | result1.png | 819224 | 720×960 | 446d9ffe39f9 |
| AI_POSTURE | result1.png | 972271 | 720×960 | 60e839b98832 |
| AI_WEARABLE | result1.png | 1641506 | 720×960 | 7615ee04f73c |

## 4. 未完成的验收项（需要真实任务才能做）

历史坞恢复 → 真实结果字节校验 → 存入资产库 → 发送画布，这一整条链路**必须由真实任务驱动**。当前没有任何真实任务，因此这 4 项对这 7 个工具均**未通过、也未伪造**。

两条可行路径（需决策）：

1. **每工具真实跑 1 次**（会真实调用 provider）：产生真实任务 → 刷新 → 历史坞恢复 → 验字节/资产库/画布。这是唯一能让这 7 个工具“历史恢复”成立的方式。
2. **只保留缺陷修复 + 归档字节校验**：不新增 provider 调用，但“历史坞恢复”验收永远缺真实任务证据。

## 5. 复现命令

```bash
cd web
./node_modules/.bin/tsc --noEmit -p tsconfig.json          # 类型检查
~/.bun/bin/bun test src/components/tools/tool-task-history.test.tsx
/usr/local/bin/node scripts/real-acceptance/h7-restore-probe.mjs   # 取证（只读）
```
