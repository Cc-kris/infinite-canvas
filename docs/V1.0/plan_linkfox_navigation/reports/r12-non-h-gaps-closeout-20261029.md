# R12 非 H 缺口收口（PRODUCT_IMAGE_SUITE / SALE_VIDEO / VIDEO_TRANSLATION / VIDEO_CONCAT）

日期：2026-10-29　方式：复用已存在的真实 task，不重新生成（`reusedNotRegenerated: true`），只做真实 UI 动作与对账。

## 结论表

| 工具 | F | T | 依据 | 说明 |
|---|---|---|---|---|
| PRODUCT_IMAGE_SUITE | PASS（沿用） | **PASS（本次修复）** | `PRODUCT_IMAGE_SUITE/b4-actions.json`（下载/存资产/发画布，2151517B 与 02-result.png 一致）+ 本次新增 `r12-task-record.json` | 案例区占位文案已移除 |
| SALE_VIDEO | **PARTIAL** | **PASS（本次修复）** | 本次 `SALE_VIDEO/r12-actions.json` + `r12-downloaded.mp4` | 下载 + 发画布 2 项真实回执；历史任务坞无「存入资产」按钮 |
| VIDEO_TRANSLATION | PARTIAL | **PASS（本次修复）** | 历史 `VIDEO_TRANSLATION/downloaded.mp4`、`sent-canvas.png`，但回执 JSON 未绑定 taskId 与三动作字段 | 见下「未完成」 |
| VIDEO_CONCAT | PARTIAL | **PASS（本次修复）** | 历史 `VIDEO_CONCAT/downloaded.mp4`（2133234B），同上 | 见下「未完成」 |

## 本次修复（代码）

`web/src/components/tools/workspaces/video.tsx`、`video-translation.tsx`、`suite.tsx`：
案例区从「`cases={[]}` + 注释『未抓到前 cases 为空 … 暂无优秀案例』」改为 **有真实案例才渲染**（`*_CASES.length > 0 ?`），并在区块内保留上游数据源说明（`/image/make-case/list?type=<bizType>`、`type=73/52/814`），不输出任何空态占位文案。

验证：
- `web/node_modules/.bin/tsc --noEmit` → 0 错误
- `bun test case-module-copy.test.ts tool-result-actions.deps.test.ts tool-history-dock.test.tsx` → **19 pass / 0 fail**
- 提交：`f2bbbf4`

## SALE_VIDEO 实测（task-mvt76u6p-7cfnff，succeeded）

- 上游：`openai` / `task_hhe2FmdxNCwz8Vn86YO7kYxrudtQDGVx`；结果 `video/mp4` 1,366,190 B（storageKey `tool-result:Be9yI14yvxVSg1r0TjYPJ`）
- 查看结果：历史任务坞恢复成功，配置快照面板可见
- 下载：真实点击 `tool-history-dock-download` → 反馈「下载 sale-video-result-1.mp4」，落盘字节 **1,366,190 B**、sha256 `39193f0a2c97c24e…`、`ftypisom`，与任务记录字节一致
- 发画布：真实点击 `tool-history-dock-canvas` → 「已发送到画布（lA2nAfkKAt5CrIhZDwcTK / video-1793278569675-4m128）」
- 存资产：本入口（历史任务坞详情）只有下载/发画布两个动作，**未验证**

### 字段/画幅/时长透传（如实）
- 文案：PASS（市场 JP / 语言 日本語 / 5 秒 / 720P / 画幅 9:16 全部进 prompt）
- 画幅：**PARTIAL** — prompt 声明 9:16，但 `configSnapshot.size = "1:1"`
- 时长：**PARTIAL** — 时长只出现在 prompt 文本，`configSnapshot` 无 duration/seconds 字段（上游请求体未落盘）

## 未完成 / 风险
1. SALE_VIDEO「存入资产」在当前入口无按钮，需在结果区（非坞）入口复验或补入口。
2. SALE_VIDEO `size` 与 prompt 画幅不一致，未定位是表单默认值未随「画幅」联动，还是提交映射缺失（未改代码，避免无证据改动）。
3. VIDEO_TRANSLATION / VIDEO_CONCAT 的真实 task 只存在于另一浏览器 profile；本 profile localStorage 无该任务记录，无法在不重新生成的前提下复跑三动作，因此回执仍缺 taskId 机器绑定 → 保持 PARTIAL。
