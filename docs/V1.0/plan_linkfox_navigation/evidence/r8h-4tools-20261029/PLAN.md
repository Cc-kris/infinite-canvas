# r8h 四工具 H 维真实取证（2026-10-29）

范围：AI_DRESSING_V2 / AI_WEARABLE / AI_POSTURE / MATERIAL_UPPER_BODY。不碰其他组。
约束：**不注入、不新生成**；只读用户既有真实任务（`task-mv*`）；真实整页 reload；机器 JSON 落盘。

## 结论

| 工具 | 真实 task | reload 后坞 | 真实字节 | 下载 | 存资产 | 发画布 | H |
|---|---|---|---|---|---|---|---|
| MATERIAL_UPPER_BODY | task-mvtd45nv-y7cum6 | 1 条（同 taskId） | 1,525,374 B / `79bddf28…` | ✅ 同 sha | ✅ 同 sha | ✅ 同 sha | PASS |
| AI_POSTURE | task-mvtczxwo-e1d1w0 | 1 条（同 taskId） | 1,557,308 B / `03ec4754…` | ✅ 同 sha | ✅ 同 sha | ✅ 同 sha | PASS |
| AI_DRESSING_V2 | 无 | 0 条 | — | — | — | — | BLOCKED |
| AI_WEARABLE | 无 | 0 条 | — | — | — | — | BLOCKED |

`AI_DRESSING_V2.json` / `AI_WEARABLE.json` 记录的是“本机无任何真实任务”的实测状态（页面坞 0 条 + `localStorage/tool-task:v1:index` 64 条中 0 条），按指令不允许新生成，故无法产出历史取证。

## 本轮修掉的真缺陷（payloadDropped 同族）

`web/src/components/tools/tool-result-actions.ts`

- L282 `saveResultItemToAssets`、L408 `sendResultItemToCanvas`（图片来源分支）原先只取 `item.dataUrl ?? item.url`。
- 历史结果刷新后拿到的条目**只有 blob**（url/dataUrl 不落盘），于是 `uploadImage("")` → 抛「读取图片失败」。
  实测复现：修复前同一任务两次调用均失败；修复后同一份 1.53 MB 真实字节成功入库/入画布。
- 改为 `item.blob ?? item.dataUrl ?? item.url`（与 `downloadResultItem` 已有的取源顺序一致）。
- 回归测试：`tool-result-actions.deps.test.ts` 增加「历史结果只有 blob 时发画布必须用真实字节」用例。

## 复现命令

```bash
cd web && PATH=$HOME/.bun/bin:$PATH bun test \
  src/components/tools/tool-result-actions.hydration.test.ts \
  src/components/tools/tool-result-actions.deps.test.ts
```

## 其他实测结论（避免下次踩坑）

- localforage 的 `get()` 直接返回 Blob 本身（没有 `.blob` 字段）。取 `rec?.blob || rec`，否则 `createObjectURL` 报 Overload failed，会误判成“图片损坏”。
- `tool-history-dock` 的缩略图来自 `image_previews`（约 1.2 KB webp），**不能当原图字节证据**；原图在 `media_files` 的 `tool-result:*` 键。
- 两个工作区（MaterialUpperBody / AI_POSTURE）的结果区只由 live submit 渲染，reload 后结果区为空，历史只能从坞恢复 → H 以“坞恢复 + IDB 原图字节对账 + 三动作 sha 全等”为准。
- 浏览器桥：长 await 的 `web_execute_js` 会返回 null，改「页面内 `window.__X` 后台任务 + 轮询」。
