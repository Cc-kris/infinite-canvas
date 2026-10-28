# POD 6 工具真实运行验收（worker: AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN / PRINT_EXTRACT / AI_POSE_GENERATOR / AI_DRESSING_XSY）

日期 2026-10-28，应用 http://127.0.0.1:3000（v0.27.0），分支 feat/linkfox-v1-real。

## 关键结论（有网络证据）

| 工具 | 请求 | 状态 | 结果 |
|---|---|---|---|
| AI_TEXT | POST https://api.cc-ai.xyz/v1/images/edits (FormData, model=gpt-image-2) | 200 | UI「已完成 / 共 1 个结果·图片 1」 |
| ORNAMENT_TEXT | POST https://api.cc-ai.xyz/v1/images/generations | 200 | 结果图 720x960 真实 PNG（data:image/png;base64） |
| PRINT_EXTRACT | POST https://api.cc-ai.xyz/v1/images/edits | 200 | 已完成 1 图，耗时 1m27s |
| SDS_DESIGN | POST https://api.cc-ai.xyz/v1/images/edits，2 张输入图（商品图+素材） | 200 | 已完成 1 图 |
| AI_POSE_GENERATOR | POST https://api.cc-ai.xyz/v1/images/generations，model=gpt-image-2 | 200 | 请求成功（截图因桥接超时未取到） |
| AI_DRESSING_XSY | 未运行（桥接卡死） | — | 待补 |

证据文件：evidence/real-acceptance/<TOOL>/*-net.json、*-result.png

## 环境事实（重要）

1. 可用图像渠道是 localStorage `infinite-canvas:ai_config_store` 里的 `ccai-tmp`（baseUrl https://api.cc-ai.xyz，有 apiKey），
   且 `config.imageModel = "ccai-tmp::gpt-image-2"`；`config.model` 仍是 `default::gpt-image-2`（走 api.openai.com，无 key → 401 "You didn't provide an API key"）。
2. 工具页读的是 `config.imageModel || imageModels[0]`（web/src/components/tools/workspaces/pod.tsx:164），网关解析见 web/src/services/api/gateway.ts:172。
3. **坑**：页面已打开后再改渠道/模型，React 状态不会跟着变（zustand persist 不会自动 rehydrate），必须整页 reload 才会用新 imageModel。这是最初 AI_TEXT 401 的唯一原因。
4. 提交被拦时的真实原因举例（都是校验，不是 bug）：
   - SDS_DESIGN 需要两个上传位：商品图（input[0]）+ 素材（input[1]，最多 6 个），只传商品图时按钮一直 disabled，提示「至少上传 1 个素材后才能贴合」。
   - AI_POSE_GENERATOR 必须填「姿势提示词」textarea（点姿势 chip 不会自动填），否则按钮 disabled，提示「填好姿势提示词后点『生成姿势参考』」。

## 疑似缺陷（需复核，非我方修改）

1. **1:1 比例却请求 size=720x960**：AI_TEXT（POD 1:1）与 ORNAMENT_TEXT 的请求体 size 都是 `720x960`（3:4），
   PRINT_EXTRACT 的 prompt 里写「at 1024x1024 pixels」但 size 仍为 720x960。比例/尺寸映射疑似错误或与上游不一致。
2. `config.model` 与 `config.imageModel` 分裂：文生图工具用 imageModel（ccai-tmp，可用），但其它路径（如 initial 401 时的请求）可能落到 config.model（api.openai.com，无 key）。
   建议统一或在前端显式提示「图像模型未配置」而不是把 401 透传给用户。

## 操作笔记（复现用）

- 驱动脚本：`.worker-scratch-linkfox-accept/drv.py`（TMWebDriver 桥，127.0.0.1:7890），`run_tool.py`（UPLOAD_JS / submit_and_capture / open_fresh）。
- 上传：`input[data-testid="tool-asset-file-input"]` 用 DataTransfer 注入 File。
- 抓包：drv.inject_xhr(tab) 后读 drv.net(tab)，记录 method/url/status/reqBody（FormData 打印为字段摘要）。
- **桥接限制**：同时开 6 个含 base64 大图的标签 + Page.captureScreenshot(full) 会把桥打满，后续 execute_js 30s 超时；
  应一页一用一关，截图用 full=False。
- code_run 默认 60s 超时会打断批量脚本，跑一次工具流程要 timeout>=300。
