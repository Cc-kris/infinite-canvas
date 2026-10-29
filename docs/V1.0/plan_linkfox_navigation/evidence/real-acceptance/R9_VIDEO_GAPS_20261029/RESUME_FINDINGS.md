# R9 视频任务续查（2026-10-29 20:0x）

## 上游真值（只读 GET，走本地代理 23220，未重提交）
| 工具 | taskId | 19:56 | 20:00 | 20:01 |
|---|---|---|---|---|
| VIDEO_TRANSLATION | task_ye7NHl8fwVr1Roh5ysCKB1C7Nr2lMwZd | pending 0.833 | pending 1.0 | **done 1.0** |
| VIDEO_CONCAT | task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF | pending 0.333 | pending 0.333 | pending 0.333 |

（第三次尝试 task_DPYuSe6RoixDbhaD8K97vDBoMu2X1xeR 早已 done，6s，未纳入本次两任务）

## 现场事实
- 老 run 仍活：PID 51914 `node scripts/real-acceptance/accept-r9-video-gaps.mjs --tool=concat`（19:51 起），
  headless Chrome 51924 `--user-data-dir=/tmp/ic_r9_profile_concat`，stdout 落 /private/tmp/ic_media/run-concat.log（0 字节，未 flush）。
  → concat 的轮询仍在进行，**不要**在同一 profile 并跑第二个 browser。
- 翻译的首次 run 已退出，其回执 /private/tmp/ic_media/run-translation2.log 末尾显示：
  轮询到 progress=1 仍 status=pending，中途一次 502（Cloudflare），随后 run 超时收工。
- 新版续查脚本首次执行时，页面刚加载就出现 `任务失败 / 诊断码：unclassified`（源于那次 502），
  并显示 `15m 47s · 轮询 112 次`，历史区仍有 `1 条 / 生成中`。

## 脚本坑（已确认，非猜测）
`accept-r9-video-resume.mjs` 里用 `import("/src/stores/use-tool-task-store.ts")` 拿 store，
在 Vite dev 下会拿到**另一个模块实例**（app 侧模块 URL 带 HMR query），导致 `tasks` 为空 → 报
`持久 profile 里没有该任务快照：[]`。
→ 改为从 DOM（`data-task-id` / `data-task-status`）+ localStorage 快照读取状态，不再 import store。

## 结论待补
- TR：上游 done，需在页面上让应用自己把这状态变成结果（recoverAll 查询式恢复），再验 ftyp/字节、fresh reload、下载/存资产/发画布。
- CC：上游仍 pending(0.333)，继续真值等待；若最终不是 done，就按实保存状态，不构造成功证据。
