# r8h 4 工具真实 H 进度（2026-10-29）

## 已完成的实物事实（可复现）
- MATERIAL_UPPER_BODY task-mvtd45nv-y7cum6
  - IDB `infinite-canvas/media_files` key `tool-result:oU0TI--EZsIZ_14iPu4Jp` = 1,525,374 B, 1024x1024 PNG
  - sha256 `79bddf28c16aa5c792efbf429e084b1f81c98cfe5bc6336081480ef60f0fa5d6`
  - 下载 → `~/Downloads/material-upper-body-result-1 (1).png` 同 sha
  - 存资产 → assetId `sAXwygUSnXUieCD4l2YJm`，images `image:hZFKnYBpDEy-2DwN6gHiL` 同 sha
  - 发画布 → project `KB77KFIhQpdz3x82Sp4QX`，node `image-1793271704834-tsu8h`，`image:BhlmUm5XTF-XohP62Q72C` 同 sha
  - 证据：`MATERIAL_UPPER_BODY.json` + `MATERIAL_UPPER_BODY.png`

## 修复的真实缺陷
`web/src/components/tools/tool-result-actions.ts` L282/L408：`uploadImage(item.dataUrl ?? item.url ?? "")`
→ 历史恢复结果只有 blob，导致 `uploadImage("")` 抛「读取图片失败」，存资产/发画布全挂。
改为 `item.blob ?? item.dataUrl ?? item.url`。

## 工具链坑（勿重犯）
- localforage `get()` 直接返回 Blob（无 `.blob` 字段）→ 必须 `rec?.blob || rec`。
- 长 await 的 web_execute_js 会返回 null：改「页面内 window.__X 后台任务 + 轮询读 window.__X」。
- 坞缩略图来自 `image_previews`（1.2KB webp），不能当原图字节证据。
- 结果区不回填历史（MaterialUpperBody / AI_POSTURE 都只由 live submit 设 task）。

## 待办
- AI_POSTURE（task-mvtczxwo-e1d1w0，IDB 1,557,308 B sha 03ec4754…）：同法取证三动作。
- AI_DRESSING_V2 / AI_WEARABLE：确认是否有真实任务快照。
