# r13 三工具真实链路回执（IMAGE_TO_VIDEO / VIDEO_REPLICATION / AI_VIDEO_EDITING）

日期：2026-10-29　harness：`web/scripts/real-acceptance/accept-r13-three-video-tools.mjs`
复现：`cd web && NODE_PATH=$PWD/node_modules node scripts/real-acceptance/accept-r13-three-video-tools.mjs <TOOL>`

## 结论（按真实回执，不做推断）

| 工具 | 真实提交 | 客户端 task | 终态 | MP4 ftyp/sha | 三动作 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| IMAGE_TO_VIDEO | 已点「生成视频（1 个视频 · 5s · 自适应 · 768P · 产品展示）」 | 未落库 | 未知（run 被导航打断） | 无 | 未执行 | UNVERIFIED |
| VIDEO_REPLICATION | 已提交（截图缺失，日志见 temp） | 未落库 | 未知（240s 等待超时） | 无 | 未执行 | UNVERIFIED |
| AI_VIDEO_EDITING | 已提交并落库 | `task-mvtizx6d-mha8cl` | failed（submit-unconfirmed） | 无（items 空） | 未执行 | FAILED_REAL_RECEIPT |

## AI_VIDEO_EDITING 上游真实回执（evidence/AI_VIDEO_EDITING/result.json）

```json
POST /v1/videos → 502 {"error":"无法连接 sub2api.1006000.xyz：连接超时（ETIMEDOUT）..."}
POST /v1/videos → 400 {"error":{"message":"'utf-8' codec can't decode byte 0xff in position 1817: invalid start byte"}}
```

## 已知缺口与下一步

1. 提交成功后立即 dump `tool-task:v1:*`（本次把 dump 放在整段流程末尾，I2V/VR 的 reload 流程已覆盖快照）。
2. 上游 host 当前 ETIMEDOUT；恢复后 AI_VIDEO_EDITING 的 multipart 400 需单独复现（字节 0xff 非 UTF-8，疑二进制源视频被当文本解析）。
3. 三动作（下载 / 存资产 / 发画布）与 payloadDropped 复验，必须等到有 succeeded 且有 result items 的真实 task 后再做。
