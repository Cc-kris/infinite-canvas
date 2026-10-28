# IMAGE_TRANSLATION 真实阻塞诊断（2026-10-29）

## 结论（真实 API 探测，非推断）

| 调用 | 端点 | 结果 |
| --- | --- | --- |
| 文本/视觉（SiliconFlow Qwen3-VL） | `POST {sf}/v1/responses` | **404 Not Found** |
| 文本/视觉（SiliconFlow Qwen3-VL） | `POST {sf}/chat/completions` | **200**，4.4s 返回 4 个文字框 |
| 图像编辑（CCAI gpt-image-2） | `POST {ccai}/v1/images/edits` | **200**，24s，1,118,294 bytes PNG |

→ 阻塞根因：`web/src/services/api/image.ts` 的文本/视觉端口**只走 `/responses`**（`requestStreamingResponse`），
而 OpenAI 兼容上游（SiliconFlow/CCAI 等）多数只有 `/chat/completions`，OCR 与逐框翻译因此必然失败；
图像生成本身可用。

## 探针日志
- `/tmp/probe_img2.log`：edits 200，`data[0].b64_json`，保存 `/tmp/probe_edit.png`（1,118,294 bytes）
- `/tmp/probe_ocr.log`：chat/completions 200，boxes=4（春季新品 / 限时八折 / 全场包邮 满299减50 / 今日下单 次日发货）

## 修复方向
`requestImageQuestion`：先走 `/responses`，当上游返回 404/405（端点不存在）时自动回落 `/chat/completions`
（含 SSE 流式解析与视觉 image_url 内容块），并按 baseUrl 缓存该判定，避免每次多打一次 404。
不 mock、不伪造文案；识别为空仍按既有逻辑提示「未识别到文字」。
