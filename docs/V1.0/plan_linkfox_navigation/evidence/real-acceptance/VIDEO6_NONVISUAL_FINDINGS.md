# 6 视频工具非视觉缺口 — 现场勘察记录（2026-10-29）

## 环境事实（已实测）
- 应用 `http://127.0.0.1:3000` HTTP 200（node PID 80431 在听）。
- 本机 canvas-proxy `http://127.0.0.1:23210` health 200（node PID 51086）。
- 代理转发链路正常：`/https://api.cc-ai.xyz/v1/models` → 上游 401 `API_KEY_REQUIRED`（无 key 时的标准响应，1.09s），说明通道可达、非黑洞。
- 直连 `https://api.cc-ai.xyz/v1/models` 同样 401，1s 内。

## 代码现状
| 工具 | 结果区 | 历史入口 | 案例页签 | 提交端点 |
|---|---|---|---|---|
| SALE_VIDEO | ToolResult(三动作) | 全局 ToolHistoryDock | 缺（原站有「优秀案例」） | video 网关 /videos |
| AI_VIDEO_EDITING | ToolResult | 全局 dock | 缺（原站有） | video 网关 |
| VIDEO_REPLICATION | ToolResult | 全局 dock | 缺（原站有） | video 网关 |
| VIDEO_TRANSLATION | ToolResult | 自带 ToolTaskHistory(section) | 缺（原站有） | video 网关 |
| VIDEO_CONCAT | ToolResult | 自带历史 section | 原站无 → N-A | video 网关 |
| FISSION_LINK | ToolResult | 全局 dock | 基线 DOM 缺失(captureMissing) | image 网关 |

- `WORKSPACE_OWN_HISTORY` = {CHANGE_COLOR, PRODUCT_REFINE, AI_OUTPAINTING, VIDEO_CONCAT, VIDEO_TRANSLATION, PRODUCT_SCENE}，其余工具走全局 dock（tool-page.tsx:595）。
- 案例组件 `ToolCases` 已存在（outpaint/pod/suite/scene-fission 在用），视频工具未接。

## 原站 DOM 证据（page-dom-20261028）
- SALE_VIDEO / AI_VIDEO_EDITING / VIDEO_REPLICATION / VIDEO_TRANSLATION 的 innerText 均含 `生成结果 / 优秀案例 / 历史记录` 三页签 → 案例模块存在，必须对齐。
- VIDEO_CONCAT innerText 仅 `生成结果 / 历史记录`、`选择视频素材/视频比例/开始拼接` → 无案例，N-A 有 DOM 依据。
- FISSION_LINK.json 只有 511B 元数据（`captureMissing: /draw/product-scene?type=2`），无 innerText → 不能据此断言 N-A，需补真实 DOM 或明确标 UNVERIFIED。

## 下一步
1. 核对 4 个视频工具页内参数是否进请求体（D 维：默认值/联动）。
2. 照片/视频真实产物验证三动作：FISSION_LINK 真实出图 + VIDEO_CONCAT 真实拼接（若为本地/上游可行）。
3. 上游视频端点真实响应取证（不许 mock）。
