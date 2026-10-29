# IMAGE_TO_VIDEO 真实优秀案例 · 数据来源与可复现性（2026-10-29）

## 数据来源（唯一，不伪造）
- 原始回包：`docs/analysis/assets/linkfox/make_cases.json.gz` → key `"30"`（`tool: ["IMAGE_TO_VIDEO"]`, `total: 10`, `n: 10`, `done: true`）
- 本目录导出：`cases-source.json`（10 条，逐字保留原站 API 字段，含 `id / prompt / extendFields`）
- 每条真实字段：`prompt`（500+ 字脚本）、`imageList`（3~4 张参考图，OSS 签名 URL）、`aspectRatio`（全部 9:16）、
  `resolution`（1080P / 一条 720P）、`videoTime`（10/15/16/18/20 秒）、`videoType`（SEED_V25）、`voice: true`、
  `provider: IMAGE_TO_VIDEO_DOUBAO_SEED_V25_API`、`mainResultUrl`（成片 mp4）、`videoCoverUrl`（封面 png）

## 2026-10-29 实测的可达性（curl 逐条验证，非推断）
| 资产 | 状态 |
|---|---|
| `MANAGE/CASE/IMAGE_TO_VIDEO/<id>/video_cover.png`（封面，公网 CDN 无签名） | 200 |
| `MANAGE/CASE/IMAGE_TO_VIDEO/<id>/main_result_*.mp4`（成片） | 200（首条约 11.7MB） |
| `imageList[0]`（首张参考图，签名 `Expires=1793110017` = 2026-10-27 22:06） | 前 4 条 200；其余 403 |
| `imageList[1..3]`（附加参考图，同签名） | 403（签名已过期） |

结论与取舍（诚实边界）：
1. **卡片封面 + 成片预览** 用原站公网 CDN 资产，可行；封面落本地 `web/public/__cases/image-to-video/<id>/cover.jpg`（缩略图），成片用原站 URL（10 条约 117MB，不入库）。
2. **做同款** 回填的参考素材用案例首图（`video_cover.png` 与 `imageList[0]`/`sourceImageUrl` 同字节，1200×1200，实测 size 一致 483818B → 说明原站封面即首张原图）。
3. `imageList[1..3]` 签名过期取不到 → 不伪造、不用其它图顶替；做同款只回填「首张原图 + 真实 prompt + 真实比例/时长/分辨率」，
   UI 与证据里明确标注「附加参考图签名过期，本次仅回填首图」，避免冒充 4 图同款。

## 2026-10-29 视觉验收发现与修复（真实浏览器 DOM 实测）

现象：图转视频工作区的「优秀案例·做同款」在 1908px 视口下，案例卡实测 **799×1420px**（9:16 撑满），远超原站 264.4px 宽。

根因：`tool-cases.tsx` 用 `[column-count:2]` 固定两列，原站右栏仅 614.9px 宽（两列 264px），而本页工作区主列宽 1642px → 每列被拉成 799px。

修复：改为 `[column-width:264px] [column-gap:18px]`（多列按最小列宽自适应）。窄栏（≈615px）仍是两列 ≈298px，与原行为一致；宽区自动排到 6 列，卡片回到 ~258px，接近原站规格。
