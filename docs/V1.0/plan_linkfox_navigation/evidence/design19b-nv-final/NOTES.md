# design19b NV 终验 — 关键坑与结论（2026-10-29）

## 运行方式
- runner: `web/scripts/real-acceptance/design19b-nv-final.mjs`
- 启动：`node design19b-nv-final.mjs <TOOL_ID>`；Playwright 必须 `channel: "chrome"`（本机 ms-playwright 只到 chromium-1234，playwright 需要 1248）。
- 证据：`docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final/_runs/*.json`

## 已确证的真实链路
- Provider 经本地代理 `127.0.0.1:23210`：
  - 有参考图 → `POST /v1/images/edits`
  - 纯文生图（AI_POSE）→ `POST /v1/images/generations`
  - 结果落在 `https://oss-us.dimenoss.com/images/...png`
- 页内 `fetch(result.src)` 会被 CORS 拦（拿不到字节）→ 必须用 `page.context().request.get(src)` 服务端取字节算 sha256。

## 致命坑
1. **/logo.png 假结果**：通用「新增 img」检测会把导航 logo 当结果（60838B，sha dc660659…），导致 PRODUCT_MARKET_MATERIAL / IMAGE_TEXT_EDIT / FISSION_LINK 三家出现同 sha 假 PASS。
   → 必须排除 src 含 `/logo`、必须在 `[data-testid="tool-workspace"]` 内、naturalWidth ≥ 200。
2. AI_POSE 不能点 `ai-pose-scene-add`（空场景被校验拦），只填 `ai-pose-prompt` 即可。
3. `fission-link-url` 是 **textarea**（不是 input）。
4. NEW_DESIGNER 是设计器：无 testid 的 `input[type=file]` 上传 → `designer-export`（真实合成入库）→ `designer-download` / `designer-send-canvas`。`designer-background` 是 input[type=color]，不是上传。
5. `fission` 接受 https 与本机 dev URL（`http://127.0.0.1:port/...` 合法，见 DEV_URL_PATTERN），可挂本地静态服务喂图。
6. PRINT_EXTRACT 结果在 `print-extract-card-0[data-status=succeeded]`，取 alt 含「结果」的 img（不能用首图=原图）。

## PASS 判定（收紧后）
provider 2xx（真实调用）+ result.sha 存在且非 logo/非输入图 + 下载字节 sha 与 result 一致 + 存资产/发画布有反馈 + 刷新后历史计数 ≥ 1。

## 进度（2026-10-29 续）
- 已修：结果图误判 /logo.png → 现要求在工作区内、排除 logo、naturalWidth≥200。
- 已修：IMAGE_TEXT_EDIT 需点「新增文字框」+ 填文字；实测 PASS 848KB。
- 已修：FISSION 链接不可达 → 本地静态服务 `python3 -m http.server 8123`（fixtures 目录），URL `http://127.0.0.1:8123/product-watch.jpg`；实测 PASS 2.1MB。
- 已修：history() 刷新后轮询最多 16s（原 3s 易误判 0 条）。
- market：suite-generate testid 不存在 → 兜底 getByRole button /开始生成/。
- 批量日志 /tmp/ic-b3.log（PRINT_EXTRACT, AI_POSE_GENERATOR, PRODUCT_MARKET_MATERIAL, SCENE_TRANSFER, MATERIAL_UPPER_BODY, AI_DRESSING_XSY, NEW_DESIGNER）。
