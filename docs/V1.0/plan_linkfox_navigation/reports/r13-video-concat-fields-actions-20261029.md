# R13 VIDEO_CONCAT 真实字段/三动作回执与修复（2026-10-29）

## 1. 复用的真实成功任务（未新生成）
- 本地 taskId：`task-mvthgaa4-pdg1eq`；上游 taskId：`task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF`
- 结果：`2133234` B，`7.292` s，`768x1344`，mp4（ftyp/isom）
- 提交配置：模型 `sub2api-real::MiniMax-H3`（通道 openai）、比例 9:16、输出时长 auto=2 段有效时长之和 7s；两段片段按工作区列表顺序拼接

## 2. 真实字节 sha 对照
- 下载动作落盘 `downloaded.mp4`：bytes `2133234`，sha256 `daf59082f500fa964baa508b9ece84a62c3f2093f46e12c2a309eec501613b2f`
- 页面 `<video>`：duration `7.292`、`768x1344`，与落盘字节同源（download 回执 `matchesResultBytes=true`）
- 画幅差异如实记录：实际 `0.5714` ≠ 9:16(`0.5625`)，差 1.6%，上游按输出比例统一所致

## 3. 三动作复核（IDB 取证）
| 动作 | 页面回执 | 库内事实 |
|---|---|---|
| 下载 | `video-concat-result-1.mp4` 2133234B ftyp | 落盘文件 sha256 `daf59082f500fa964baa508b9ece84a62c3f2093f46e12c2a309eec501613b2f` ✅ |
| 存资产 | `已保存到资产库（NCM6l4cDKtyL6cz6o67OG）` | `tool_assets` 62 条中无 2133234B 视频；`media_files` 无 `tool-result:54gWW1bCX8Ywy63CQR-xj` ❌ |
| 发画布 | `已发送到画布（ce14D3JIahdvNNuS173zT）` | `canvas_store` 中无任何 video 节点 ❌ |

结论：**下载闭环为真；存资产/发画布未落真实字节**，与审计 F=PARTIAL 一致。

## 4. 最小修复
`web/src/components/tools/tool-result-actions.ts`
- 新增 `hydrateResultItemBytes(item)`：视频项在 `!item.blob && item.storageKey` 时按 storageKey 还原真实字节（`readStoredResultBlob`）并补 mimeType
- `saveResultItemToAssets` / `sendResultItemToCanvas` 入口各加一行，先还原字节再动作（此前直接把 `undefined` blob + 失效 `blob:` 地址交给 `storeGeneratedVideo`）

## 5. 验证
- `tsc --noEmit -p tsconfig.json` → **exit 0**
- `bun test` `tool-result-actions.deps.test.ts` + `tool-result-actions.hydration.test.ts` → **9 pass / 0 fail**

## 6. 未完成（需真机复验，不伪造）
修复后需在 UI 对同一历史 task 再点一次「存入资产库 / 发送到画布」，用 IDB 复核落库字节 sha 与 `daf59082f500fa964baa508b9ece84a62c3f2093f46e12c2a309eec501613b2f` 一致；本轮未新生成、未注入，故该项留待下一轮 UI 复验。
