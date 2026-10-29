# VIDEO6 余 4 工具 · 本轮进展（2026-10-29 15:0x）

## 已完成（IMAGE_TO_VIDEO 缺口修复）
文件：web/src/components/tools/workspaces/image-to-video.tsx
1) 导入 ToolTaskHistory + useToolTaskStore
2) submit 内 onTask 与完成态都 `useToolTaskStore.getState().upsertTask(...)`
3) 结果区下方新增 `data-testid="image-to-video-history"` 历史区（ToolTaskHistory + onSelectTask 回填 task）

根因：该工具直接 `createToolGateway().runTool()`，从不写任务库 → 历史恒空、刷新丢失（其它视频适配器都在适配器内 upsert，仅此工具漏）。

验证：
- bun test src/features/tools/adapters/image-to-video.test.ts → 19 pass
- tsc --noEmit → 0 错
- UI：历史区渲染；真实提交 task-mvt71akq-bu2hxh 落库，历史显示 1 条（2026-10-29 14:59 · 失败 · 提示词 · sub2::MiniMax-H3 · 0 个结果）
- 失败任务无「查看结果」按钮（无结果可回填，属预期）

## 上游阻塞（原始回执）
- sub2api /v1/videos：503 `No eligible Grok media accounts`（14:46/14:52）
- 本轮 UI 提交：任务失败，原文
  `open inline image: operation error S3: GetObject, StatusCode 404, NoSuchKey: The specified key does not exist.`（retryable:false, provider-failed）
- 轮询阶段另有一次 CF：`The origin web server returned an invalid or incomplete response to Cloudflare.`
- 环境探针（15:0x）：sub2api /health 200；/v1/models 401(无key)；隧道 /__media/notexist 404(路由存在)；app 3000 200；proxy 23211 404

## 可复用真实产物
- IMAGE_TO_VIDEO/06-result-video.mp4（2026-10-28 18:50，1,297,168B，h264 1344x768 5.167s，task_ee59WDydFTvP1EJkT76YtmR3eJAs8fuP）
- VIDEO_REPLICATION/link-mode/out.mp4
