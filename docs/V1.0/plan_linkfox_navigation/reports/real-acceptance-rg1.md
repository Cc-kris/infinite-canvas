# 真实验收报告 · rg1 组（7 个商品设计工具）

工作分支：`feat/linkfox-v1-real` · 应用：http://127.0.0.1:3000 · 时间：2026-10-28 18:30–22:40
证据目录：[evidence/real-acceptance](../evidence/real-acceptance/)（每个工具一份 `result.json` + 出图落盘）

真实上游：`gpt-image-2`，经 canvas-proxy（127.0.0.1:23210，`POST /v1/images/edits`），未拦截响应、未 mock。

## 结论总表

| 工具 | 路由 | 状态 | 真实出图 | 证据 |
| --- | --- | --- | --- | --- |
| NEW_REPLACE_BG_V2 | /tools/product-design/new-replace-bg-v2 | **PASS** | 1024×1024 / 1.06MB | result1.png、before_submit/inflight/done/result_actions.png |
| PRODUCT_SCENE | /tools/product-design/product-scene | **PASS** | 1024×1024 / 1.39MB | result1.png、done.png |
| HANDHELD_GOODS | /tools/product-design/handheld-goods | **PASS**（含缺陷修复） | 720×960 / 1.03MB（base64 PNG 解码校验） | result.png、atob_fail.json（修复前）、actions_before/after |
| REPLACE_GOODS | /tools/product-design/replace-goods | **PARTIAL（真实缺陷）** | 上游 200 出图 1254×1254，但 UI 不渲染 | upstream.json、upstream_result.png |
| AI_DRESSING_V2 | /tools/product-design/ai-dressing-v2 | **PARTIAL** | 720×960 / 0.80MB | result1.png |
| AI_POSTURE | /tools/product-design/ai-posture | **PARTIAL** | 720×960 / 0.95MB | result1.png |
| AI_WEARABLE | /tools/product-design/ai-wearable | **PARTIAL** | 720×960 / 1.60MB | result1.png |

PASS 判据：提交前槽位/按钮状态正确 → 提交后进入 inflight → 结果区渲染真实成片（从 `img.currentSrc` 取图，非截图）→ 图像文件头/尺寸校验通过。
PARTIAL 判据：真实上游已出图并落盘，但结果区动作链（下载/存入资产/发送画布）或页面文案未取得点击级证据。

## 1) 已修复的真实缺陷（HANDHELD_GOODS）

**现象**：提交即崩，`window.onerror` → `InvalidCharacterError: atob 失败`（证据 `HANDHELD_GOODS/atob_fail.json`），结果区永远出不来。

**根因**：工具的“姿势示意图”是 `data:image/svg+xml`（百分号编码，非 base64），却被当成普通参考图送进 `dataUrlToFile()` 做 base64 解码，`atob()` 直接抛错，整个提交流程中断。

**修复**（提交 `8191fdf`，仅本组 owned 文件）：
- `web/src/lib/image-utils.ts`：`dataUrlToFile` 正确解析 data URL（分 base64 / 非 base64），SVG 与百分号编码不再误判，解析失败给出明确错误而不是裸 `atob` 异常。
- `web/src/lib/inline-image.ts`：SVG 参考图始终经 canvas 光栅化为 PNG 后再上传。
- 新增 `web/src/lib/image-utils.test.ts`（5 个用例，含 base64/百分号/SVG/非法输入）。

**验证**：修复后同一路由重新提交（21:02 提交 → 21:05 出图），无 atob 异常，面板文案 `已生成 1 张` / `已回填输出字段：imageResultUrl / targetResultUrl` / `已完成`，结果图 720×960 真实落盘。`bun test src/lib` 通过，`tsc --noEmit` 干净。

## 2) 未修复的真实缺陷（REPLACE_GOODS）

`REPLACE_GOODS-1`：上游 `POST images` 返回 200，`data[0]` 只带 `url`（无 `b64_json`），`usage` 与 `revised_prompt` 正常（4 张参考图编号与导引图落位都在），下载该 url 得到 1254×1254 合格成片 —— 但**页面不渲染任何结果**，直接回到空态且无错误提示（silent reset），用户看不到成片也拿不到动作按钮。

本组未修改该处（不在我 owned 的修复范围内，且需先定位结果提取对 `url` / `b64_json` 两种 data 形状的处理），如实记为 PARTIAL + 缺陷候选，交由主 agent 分派。

## 3) 结果区动作链（下载 / 存入资产 / 发送画布）

- 真实 UI 里三个按钮确实渲染（HANDHELD_GOODS 出图后 DOM 实测：`第 1 张 | 最近一次上游返回 | 已完成 | 共 1 个结果 · 图片 1 | 下载 | 存入资产 | 发送画布`）。
- 行为由**可执行单测**验证：`bun test src/components/tools/tool-result-actions.deps.test.ts src/components/tools/tool-result.test.tsx` → **25 pass / 0 fail / 121 expect**，覆盖：真实存储键的存入资产、视频分支、剥离字节时拒绝对失败伪装成功、向选定项目追加真实节点、无 projectId 时自动建项目并拒绝未知项目。
- **端到端点击未执行**（诚实边界）：点击窗口期页面被外部重载/标签被关，随后 Chrome 变为双窗口、TMWebDriver 扩展只上报另一窗口的 5 个旧标签，我的验收标签无法再被注入（AppleScript 侧确认标签仍在且 URL 正确；Chrome「允许 Apple Events 中的 JavaScript」为关闭，无法绕过）。详见 [ACTIONS_verification.md](../evidence/real-acceptance/ACTIONS_verification.md)。
- 顺带修正旧结论：此前记录的“发送画布在 /tools 路由不可用（D3）”与当前代码不符 —— `sendResultItemToCanvas` 在未选项目时会 `createProject()` 再写节点，已有测试覆盖，旧结论作废。

## 4) 与 LinkFox 原版 parity（逐条对比，两侧都是 DOM 文本实测）

原版证据：`evidence/page-dom-20261028/<TOOL>.json`（Python repr 格式，用 `ast.literal_eval` 解析读取）。

| 原版共有控件 | 我们这边 | 差异定性 |
| --- | --- | --- |
| `从本地上传` | 有（各工具素材槽位 + 本地文件上传） | 对齐 |
| `从作品库选择` | **无** | 缺功能：无法复用历史作品 |
| `从商品库选择` | **无** | 缺功能：无商品库联动 |
| `立即生成(40算力)` | `立即生成 · 1 张`（无算力/价格信息） | 计费展示缺失（本地自建，非阻塞） |
| `一键做同款` | **无** | 缺功能 |
| `操作咨询 / 产品教程` | **无** | 缺运营入口（非核心） |
| `＋ 新增水印分组` / `LinkFox 默认` 水印 | **无**（AI_DRESSING_V2 页面上仍能看到旧残留文案） | 缺水印能力 |
| `生图模型` / `默认尺寸` / `自定义` | 有尺寸与比例选择（PRODUCT_SCENE：`默认尺寸 / 自定义`；NEW_REPLACE_BG_V2：`1:1`…） | 基本对齐，模型选择未暴露给用户 |
| 多张/批量 | 有 `1/2/3/4 张`（PRODUCT_SCENE、HANDHELD_GOODS） | 对齐（批量并发未压测） |

能力更强于原版的点：NEW_REPLACE_BG_V2 有可交互 `画主体蒙版 / 确认抠图 / 上传主体蒙版（白=主体）`、`请求参数（真实下发）` 面板；REPLACE_GOODS 有框选原商品位置 + 多商品批量替换；AI_POSTURE 有姿势库（站姿/坐姿/角度/动态 + 英文提示词）；AI_WEARABLE 有 10 类首饰品类 + 部位细分。

## 5) 环境与执行说明（可复现）

- 显式 `NO_PROXY=127.0.0.1,localhost`、清空 `HTTP(S)_PROXY` 后再调本地桥，避免 curl/python 走代理。
- 扩展 session id 会复用/漂移（同一 id 曾指向 changelog 页），每次操作前按 URL 断言 `location.pathname`；用 `tabs.create` 让扩展自己登记标签才能稳定注入。
- 一次“上游未知”路径被顺带验证为诚实：直连 `api.openai.com` 超时时页面显示 `上游状态未知，只能查询或人工确认` / `请求可能已被上游受理，为避免重复扣费不会自动重发` / `诊断码：timeout-or-network`，不伪造成功。
- 验收标签仅关自己开的；用户原有 21 标签未动。

## 6) 后续动作建议

1. 分派 REPLACE_GOODS 静默清空：检查结果提取是否只认 `b64_json`，`url` 形态需显式下载或直接作为结果 `src`，且解析异常必须冒泡到 UI。
2. 补齐动作链端到端点击（环境稳定时按 ACTIONS_verification.md §4 复现）。
3. 需要 parity 收口的三项：作品库/商品库选择、一键做同款、水印分组。
