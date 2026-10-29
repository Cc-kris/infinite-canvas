# design19 前 10 工具 · 非视觉维度验收报告

日期：2026-10-29　证据目录：`evidence/design19-nv-20261029/`
结论：**不得整体 PASS**。三动作/历史/真实生成维度全绿；**案例维度 3 个工具 DIFF**、**默认值维度 10 个工具 DIFF**。

口径说明
- local = `http://127.0.0.1:3000`（开发版工作台）
- real = `https://www.linkfox.com/draw/*`（原站，**已登录态**：Cookie 由 TMWebDriver CDP `Network.getAllCookies` 导出后注入 Playwright，含 `LINKFOX_AI_TOKEN`）
- 两端使用**同一段提取器** `/tmp/d19_extract.js`，脚本 `web/scripts/design19-nv/run-defaults-real.mjs`
- 原站匿名访问被登录墙拦截（realCtrls=0），因此早期匿名采集作废，`defaults/` 为作废产物，以 `defaults-real/` 为准

---

## 1. 真实生成（仅 3 个可生成工具）

| 工具 | 结果 | 证据 |
|---|---|---|
| AI_TEXT | PASS | `gen/AI_TEXT.png`（sha256 与源字节一致） |
| ORNAMENT_TEXT | PASS | `gen/ORNAMENT_TEXT.png` |
| SDS_DESIGN | PASS | `gen/SDS_DESIGN.png` |

其余 7 个工具为「需上传素材 → 真实出图」链路，本轮以既有素材回放验证三动作，未重复真实出图（风险见 §5）。

## 2. 三动作（下载 / 存资产 / 进画布）

runner：`web/scripts/design19-nv/run-actions10.mjs`，产物 `actions/<TOOL>.json`。

10/10 PASS，字节一致性 `download == asset == node == 源文件`：

| 工具 | source | download | asset | node |
|---|---|---|---|---|
| NEW_REPLACE_BG | 1109268 | 1109268 | 1109268 | 1109268 |
| PRODUCT_SCENE | 1421980 | 1421980 | 1421980 | 1421980 |
| AI_DRESSING_V2 | 819224 | 819224 | 819224 | 819224 |
| AI_POSTURE | 972271 | 972271 | 972271 | 972271 |
| REPLACE_GOODS | 1216214 | 1216214 | 1216214 | 1216214 |
| SDS_DESIGN | 2052150 | 2052150 | 2052150 | 2052150 |
| 其余 4 个 | 见 actions/*.json | 同源 | 同源 | 同源 |

修前缺口归因（已关闭）：
- `NEW_REPLACE_BG` 规范 id 为 `NEW_REPLACE_BG_V2`（历史按 toolId 过滤），runner 增加 `taskToolId` 覆盖
- `PRODUCT_SCENE` 历史 dock 位于「历史记录」页签内，runner 增加 `historyTab` 步骤（SceneWorkspace 两工具同因）

已知实现细节（非缺陷，但影响脚本选择）：部分工具的结果区未渲染 action 按钮时，动作走历史 dock 入口；`AI_TEXT` / `ORNAMENT_TEXT` / `SDS_DESIGN` / `REPLACE_GOODS` 为 result 区入口，其余为 dock 入口。

## 3. 历史持久化

10/10 PASS：刷新后历史 dock `dockItems = 1`，条目文本含该工具标题（`actions/*.json → steps.historyText`）。
即 persistTask 落盘 + 重新加载可召回。

## 4. 案例 / 同款

DOM 证据：`case-module-check.json`、`defaults-real/*.json → caseModule`。

| 工具 | 原站「优秀案例」 | 本地「优秀案例」 | 判定 |
|---|---|---|---|
| PRODUCT_SCENE | 有 | 有 | 一致 |
| SDS_DESIGN | 有 | 有 | 一致 |
| REPLACE_GOODS | 有 | **无** | **DIFF** |
| AI_DRESSING_V2 | 有 | **无** | **DIFF** |
| AI_WEARABLE | 有 | **无** | **DIFF** |
| HANDHELD_GOODS | 无 | 无 | 一致（N/A） |
| AI_POSTURE | 无 | 无 | 一致（N/A） |
| NEW_REPLACE_BG_V2 | 无（原站对应页 `/draw/product-home`） | 无 | 一致（N/A，页面身份存疑见 §5） |
| AI_TEXT | **原站 `/draw/ai-text` 不存在，跳 `/home`** | 无 | 原站无对应页 → N/A（留 DOM：`url=.../home`, `title=首页 - LinkFox`） |
| ORNAMENT_TEXT | 同上，跳 `/home` | 无 | 原站无对应页 → N/A（留 DOM） |

同款：两端所有工具均无「同款」按钮（`sameStyle=0`），一致 N/A。

复核方式：本地 `ai-dressing` / `ai-wearable` / `replace-goods` 页面实测 `hasCase=false`，`replace-goods` 仅有「生成结果」页签，确认非懒加载误判。

## 5. 默认值逐控件

原站 10 个工具页均含两个高级设置字段，本地情况：

| 字段 | 原站默认值 | 本地 |
|---|---|---|
| 名称 | `LinkFox 默认` | 仅 AI_DRESSING_V2 有此输入框（placeholder「可选，便于在历史里辨认」），**默认空** |
| 水印文案 | `本图片由 LinkFox AI 生成` | 仅 AI_DRESSING_V2 有（placeholder「留空跟随当前配置」），**默认空**；其余 9 个工具页面全无「水印」字样（已查设置抽屉，无） |

判定：**DIFF（10/10 工具）**
- AI_DRESSING_V2：字段存在但默认值与原站不同（空 vs 原站文案）
- 其余 9 个：字段缺失

逐控件其余差异（原站为 antd/自研组件，native 控件仅 2~3 个）：原站可见 `input[text] 名称`、`input[text] 水印文案`、`radio 当季热门 / Agent 创作`；本地为 chips/自定义组，未做 1:1 对应，故仅就「名称/水印文案」给出确定性结论。

## 6. 未完成 / 风险

1. **案例 DIFF 未修**：REPLACE_GOODS / AI_DRESSING_V2 / AI_WEARABLE 本地缺「优秀案例」页签 —— 属功能缺失，需开发实现（不在本轮只验收范围内自行改产品代码）。
2. **默认值 DIFF 未修**：名称/水印文案默认值与原站不一致，且 9 个工具缺字段。
3. `NEW_REPLACE_BG_V2` 原站对应页为「商品图合成」(`/draw/product-home`)，是否同一产品语义需产品确认；若是，则其「优秀案例」也构成 DIFF。
4. 原站 `ai-text` / `ornament-text` 无独立页（跳首页），这两工具的案例/默认值维度无法 1:1 对照，只能判 N/A。
5. 真实出图仅覆盖 3 个工具，其余 7 个为回放素材，未覆盖真实模型出图耗时与失败重试路径。

## 7. 复现

```bash
# 三动作 + 历史（10 工具）
cd web/scripts/design19-nv && node run-actions10.mjs
# 单工具
IC_D19_ONLY=REPLACE_GOODS node run-actions10.mjs
# 默认值/案例双端（需 /tmp/d19_cookies.json，TMWebDriver 导出）
node run-defaults-real.mjs
```
