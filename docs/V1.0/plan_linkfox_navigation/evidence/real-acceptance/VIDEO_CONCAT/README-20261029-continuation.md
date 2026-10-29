# VIDEO_CONCAT 真实生成缺口 — 续查与历史恢复（2026-10-29）

## 一、本轮结论（诚实记录）

| 项 | 结果 |
|---|---|
| 真实请求是否带页内画幅/时长 | ✅ 是。`seconds=10&size=720x1280&ratio=9:16&resolution_name=720p`（见 `request-evidence-20261029.json`） |
| 上游是否受理 | ❌ 否。multipart 体被 sub2api 网关以 `'utf-8' codec can't decode byte 0xe8 in position 1481` 拒绝（400），与页内字段无关 |
| 网关回退 JSON | ✅ 已回退，但暴露出封面是 mp4 被塞进 `images`（data:video/mp4）的本地缺陷 |
| 真实 mp4 产物 | ❌ 无。任务最终 `failed / submit-unconfirmed`（提交期间页面被 HMR 重载），未伪造 succeeded |
| 历史恢复 | ✅ 刷新后历史仍显示「1 条 · 失败」+ 可执行失败原因 + 配置快照（`videoSeconds=10`、`size=720x1280`） |
| 草稿恢复 | ✅ 刷新后片段数恢复为 3（`clipCount=3`） |

## 二、已修（提交 f5c580e，5 文件）

1. `web/src/features/tools/adapters/video-concat.ts` — `buildVideoConcatBrowserInput` 补 `videoRatio` / `videoSeconds`
   （修复前只写进 prompt，真实请求沿用全局 1:1 · 6s）
2. `web/src/features/tools/registry/video-concat.ts` — 新增 `VIDEO_CONCAT_COVER_MIMES` / `isVideoConcatCoverMime`，
   封面非位图直接 `cover-invalid` 阻断，提示「仅 PNG/JPG/WebP，当前是 video/mp4」
3. `web/src/components/tools/workspaces/video.tsx` — 封面上传拦截非图片并回滚封面，避免 `images` 收到 `data:video/mp4`
4. `web/src/features/tools/adapters/video-concat.test.ts` — 画幅/时长断言改用 `state` 真值；新增封面 mp4 阻断（validate + assert 双路径）
5. `docs/.../real-acceptance/FINDINGS_20261029.md` — 实测发现记录

验证：`bun run typecheck` → 0 错；`bun test src/features/tools/adapters/video-concat.test.ts` → 50 pass / 0 fail。

## 三、环境副作用（非应用缺陷，需在验收说明中区分）

CDP 自动化所在标签页处于 `document.visibilityState === "hidden"`。Chrome 对后台标签页抑制媒体元数据加载：
`<video>` 停在 `readyState=0`（`networkState=2` 仍在加载）→ 页内「读不到片段真实时长」阻断提交。

实证：同一 `blob:` URL 用 `fetch()` 可正常取回（probe.mp4 = 1297168 B、clip-b.mp4 = 422358 B），
说明是可见性导致的解码/元数据抑制，而不是资产失效或校验逻辑错误。

**判定**：这两次「读不到时长」不构成应用缺陷；真实用户在可见标签页下不受影响。
后续若在后台做自动化验收，应先 `Page.bringToFront` 再读时长。

## 四、证据文件

- `history-recovery-20261029.json` — 刷新后的历史面板文本 + 全量任务索引 + clipCount
- `task-record-20261029.json` — `tool-task:v1:task-mvt94gxs-p0r29t` 原始落库记录（failed + 原因 + configSnapshot）
- `request-evidence-20261029.json` — 两次真实请求体字段 + 上游 400 回执 + 封面 data:video/mp4 缺陷
- `dom-snapshot.json` / `result.json` — 上一轮会话遗留页面快照

## 五、遗留（交棒说明）

1. 上游 multipart 400 属 sub2api 网关侧能力问题（把文件字节当文本解码），本地无法绕过；
   JSON 回退路径依赖公网可访问的资产 URL。
2. 封面 mp4 已被拦截，但**历史脏草稿**（已存 mp4 封面）在恢复时仍会触发一次阻断提示，需用户重新抓帧——行为正确，不做静默清理。
