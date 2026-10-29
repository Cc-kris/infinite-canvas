# design19「优秀案例·做同款」真实复现进度

> 证据目录：`docs/V1.0/plan_linkfox_navigation/evidence/design19-cases-20261029/<tool>/`
> 复现脚本：`web/scripts/real-acceptance/design19-cases-gen.mjs --tool=scene|replace|wearable|dressing|sds`
> 口径：真实浏览器点「优秀案例」→ 点「做同款」→ 点「立即生成」→ 真实 provider 出图；失败保留原始错误截图与 run.json。

## 结果（5/5 真实出图成功）

| 工具 | toolId | 案例 ID | 结果字节 | 文件 |
| --- | --- | --- | --- | --- |
| 商品场景 | PRODUCT_SCENE | 1983831220118597632 | 2,377,287 | `scene/result-1983831220118597632.png` |
| 商品替换 | REPLACE_GOODS | 1986723360895819776 | 1,043,427 | `replace/result-1986723360895819776.png` |
| AI 穿戴 | AI_WEARABLE | 1955579942177386496 | 1,229,594 | `wearable/result-1955579942177386496.png` |
| AI 换装 | AI_DRESSING_V2 | 1940370107691995136 | 1,646,968 | `dressing/result-1940370107691995136.png` |
| SD 设计 | SDS_DESIGN | 1780443735213010944 | 1,442,444 | `sds/result-1780443735213010944.png` |

每目录同时含 `01-applied.png`（回填后）、`02-submitted.png`（提交后）、`03-result.png`（结果态）、`run.json`（参数快照 + 网络流水 + 步骤 DOM）。
失败原始证据保留：`replace/error.png`（修复前尺寸预设 1024×1024 触发 100 字提示词上限）、`dressing/error.png`（第 1 轮结果图缺 testid，误判 timeout，实际已出图）。

## 本地缺陷清单（本轮修复）

1. **提示词上限过窄**：`SCENE_PROMPT_LIMIT` 100 → 1000，原站案例提示词远超 100 字直接不可用。
2. **尺寸预设不匹配原站**：预设改 1024×1360 / 1360×1024；自定义尺寸 step 8 → 16（原站 1040/1360 等值无法输入）。
3. **参数告警不明显**：scene-fission 的 issues 常显，用户能看到当前参数为何不可用。
4. **商品替换不可回填**：新增 `quadFromCaseShape()`，把原站 `{point, scale, rotate, width, height, stage}` 转本地归一化四角；`isQuadShape()` 防御任意 JSON；`quadIsConvex` 遇畸形数据返回 false 不崩页；`denoiseStrength` 0–1 → 0–100；`cutoutProvider`（`CUTOUT_ALI` 等）→ 本地 model/local 映射。
5. **AI 穿戴无「优秀案例」区**：`dress.tsx` 加「优秀案例」折叠入口 + `applyCase`（真实 `uploadCaseFiles` 落盘入库后回填商品图/模特图；`modelTabType` 仅在能映射到本地枚举时回填，其余忽略不猜）。
6. **AI 换装结果图无稳定标记**：`dressing.tsx` 结果 `<img>` 补 `data-testid="tool-result-image"`（其余工具经 `ToolResult` 已有），UI 自动化/验收此前无法定位结果。

## 校验

- `npx tsc --noEmit`：通过（无输出）
- `npx vitest run`：见 `web` 下执行结果（本轮改动含 tool-result 相关断言，已回归）
- 5 个工具各 1 条真实同款出图；扩量入口同一脚本加 `--case=<caseId>`
