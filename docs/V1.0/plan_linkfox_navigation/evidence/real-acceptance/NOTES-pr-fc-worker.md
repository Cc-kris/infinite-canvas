# PR/FC 复测笔记（worker: PRODUCT_REFINE + FIX_COLOR）

## 运行环境
- dev: http://127.0.0.1:3000（vite），canvas-proxy: http://127.0.0.1:23210，Electron canvas hub: 17371
- node: /opt/homebrew/bin/node；从 `web/` 运行脚本
- 渠道：provider.mjs 内存注入 ccai-accept(CCAI gpt-image-2) + sf-accept(SiliconFlow Qwen3-VL)；不落盘、不打印密钥

## 关键 DOM / 代码落点
- 上传：`[data-testid=tool-asset-file-input]`（run-edit6 里已验证）
- 结果面板：`tool-result-feedback`、`tool-result-save-0`、`tool-result-canvas-0`、`tool-result-download-0`
- 资产页 /assets：AssetCard 的 `<h2>{asset.title}`，封面 `<img alt={asset.title}>`；预览用 Drawer（`AssetDrawer`）
- 画布页 /canvas/:projectId；节点核对用 `useCanvasStore`（web/src/stores/canvas/use-canvas-store.ts）的 projects[].nodes
- P0 blob 修复：web/src/features/tools/source-asset.ts（data:/blob:/http(s) 统一判定），测试 web/src/features/tools/blob-source-gate.test.ts
- 真实 Result 标题来源（用于存档标题断言）：PRODUCT_REFINE=enhance.tsx `title="生成结果"`；FIX_COLOR=repair.tsx `title="色差修复结果"`

## 2026-10-28 23:1x 首次真实跑（PRODUCT_REFINE）
- 上游：POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits → 200，requestId afefb17d-33a2-4733-9f50-fac0b110eee0，15:11:56Z
- 结果：2048x1488，src 前缀 https://oss-us.dimenoss.com/images/2026/10/28/...
- P0：上传后源图 src=`blob:http://127.0.0.1:3000/...` 且提交成功 → blob 门禁已复测通过
- 存入资产回执：`已保存到资产库（dEg4N47bwpCGHbeamPiEU）`
- 发送画布回执：`已发送到画布（SUW_P2unnqmCQrN-LxdWN）`
- 现场文件：evidence/real-acceptance/PRODUCT_REFINE/{run-pr-fc.json,result.png,ui.png,step-3-saved-asset.png,step-4-sent-canvas.png,step-5-asset-library.png,step-6-canvas.png}

## 待修脚本判定（非产品问题）
1. 资产断言：原来按 `${toolId} 结果 1` 找标题 → 实际是「生成结果」；且 body 不含 assetId（卡片只显示标题）。改为：保存前记录同标题卡数 → 保存后 +1，并断言封面图/预览尺寸 2048x1488。
2. taskIds 读取返回 null，需加诊断（内存 store，不读浏览器存储）。
3. 画布核对：改为读 useCanvasStore 节点类型与数量，替换 img 计数。
