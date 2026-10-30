# 第二轮进度（2026-10-30 19:20）

## 第一轮战果（可复算）
| | 基线 18:30 | 第一轮 19:20 | Δ |
|---|---|---|---|
| 缺失 | 1215 | 906 | −309 |
| 多余 | 594 | 365 | −229 |

代码：29 个文件 +2006/−2642，`npx tsc --noEmit` 干净。

## 第一轮后仍缺失最多的 12 个（第二轮重点）
| 工具 | 缺失 | 归属组件 |
|---|---|---|
| PRODUCT_MARKET_MATERIAL | 61 | suite.tsx |
| MATERIAL_UPPER_BODY | 61 | dress.tsx |
| IMAGE_TRANSLATION | 48 | translate.tsx |
| DRESS_WEAR_SET | 47 | dress-suite.tsx |
| CHANGE_COLOR_V2 | 46 | color-v2.tsx |
| IMAGE_CROP | 39 | crop.tsx |
| VIDEO_REPLICATION | 38 | video.tsx |
| AI_WEARABLE | 34 | dress.tsx |
| REPLACE_GOODS | 34 | replace.tsx |
| CHANGE_COLOR | 29 | color.tsx |
| AI_POSTURE | 21 | model.tsx |
| AI_OUTPAINTING | 12 | outpaint.tsx |

小基线噪声（原站证据本身几乎没抓到文本，缺失 0–3 条，不算问题）：
FISSION_LINK / AI_TEXT / SCENE_TRANSFER / ORNAMENT_TEXT / IMAGE_TEXT_EDIT。

## 第二轮批次
- fx_b1（llm0，续跑中）：PRODUCT_MARKET_MATERIAL / DRESS_WEAR_SET / CHANGE_COLOR_V2 / IMAGE_TRANSLATION
- fx_b2（llm7）：CHANGE_COLOR / IMAGE_CROP / PRODUCT_REFINE / SCALE_UP / REMOVE_PEN / AI_OUTPAINTING
- fx_b3（llm0）：REPLACE_GOODS / AREA_REPAIR / HAND_REPAIR / PRINTING_REPAIR / FIX_COLOR / HANDHELD_GOODS / PRODUCT_SCENE / SDS_DESIGN / SCENE_TRANSFER
- fx_b4（llm7，续跑中）：MATERIAL_UPPER_BODY / AI_WEARABLE / AI_POSTURE
- fx_b5（llm0）：VIDEO_REPLICATION / SALE_VIDEO / IMAGE_TO_VIDEO / AI_VIDEO_EDITING / VIDEO_TRANSLATION / VIDEO_CONCAT

## 踩过的坑（下次直接避开）
1. worker 任务目录必须是 `temp/<task>`，`ga_worker.py` 在 `managed-ga-state/memory/`
2. 同模型并发 >2 会被 SSE 拒绝 → 用 `--llm 0` 和 `--llm 7`（同一个 deepseek-v4.1-flash 的两个 provider 端点）分摊
3. 目录里残留 `output*.txt` 且含 `[ROUND END]` → 重启秒退；续跑前先 `mv output*.txt archive/`
4. worker 容易"只写计划不改代码"，续跑 input 必须写死"禁止只写计划、每改完一个工具跑 tsc"
5. 原站证据里 `regions/textEls` 只有 11 个工具有坐标，其余是旧脚本抓的（无 viewport/无几何）→ 只能做文本级对齐

## 第 3 轮战果（20:16 冻结快照，39/39 页面渲染正常）

| | 基线 18:30 | 第3轮 20:16 | Δ |
|---|---|---|---|
| 缺失 | 1215 | 192 | −1023（−84%） |
| 多余 | 594 | 141 | −453（−76%） |
| 完全对齐工具 | 0 | 29/39 | +29 |

### 仍不干净的 10 个
| 工具 | 缺 | 多 | 说明 |
|---|---|---|---|
| PRODUCT_MARKET_MATERIAL | 61 | 25 | 面板结构整体不同，需按原站重排 |
| PRODUCT_IMAGE_SUITE | 55 | 0 | 本地只渲染 20 条，缺整块设置区 |
| CHANGE_COLOR_V2 | 30 | 1 | |
| AI_POSE_GENERATOR | 19 | 25 | |
| AI_DRESSING_V2 | 15 | 9 | |
| NEW_DESIGNER | 8 | 23 | |
| IMAGE_TEXT_EDIT | 3 | 20 | 原站抓取只有 3 条（弹窗型工具）→ 多余为口径假象 |
| FISSION_LINK | 0 | 19 | 原站 0 条 → 假多余 |
| SCENE_TRANSFER | 1 | 18 | 原站 1 条 → 假多余 |
| PRODUCT_SCENE | 0 | 1 | 1 条多余 |

### 测量方法（重要，别再用旧法）
- **必须**用 `.verify-tools/frontend-diff/measure.sh`：它先 SIGSTOP 冻结 worker，再跑 `capture3.mjs`（页面空白会自动重载重试 3 次），最后 SIGCONT 恢复。
- 直接用 `capture2.mjs` 会在 worker 半成品状态下抓到**整页空白**（body.innerText=0 → 缺失虚高到 1600+），这是假数据。
- 逐工具清单：`python3 remain.py`；单工具闭环：`node verify1.mjs TOOL && python3 check1.py TOOL`。

## 第 4 轮·最终验收（20:46 快照，全 worker 收工后）

| | 基线 18:30 | 最终 20:46 | Δ |
|---|---|---|---|
| 缺失 | 1215 | **4** | −99.7% |
| 多余 | 594 | **57** | −90.4% |
| 完全对齐工具 | 0/39 | **36/39** | — |
| tsc | — | 0 错误 | — |
| vite build | — | 通过（19.2s） | — |

### 剩余 3 个工具：原站无基准，不计分
| 工具 | 缺 | 多 | 原站实况 |
|---|---|---|---|
| IMAGE_TEXT_EDIT | 3 | 20 | `/draw/designer`、`/draw/product-design/image-text-edit` 均返回「页面不存在」 |
| FISSION_LINK | 0 | 19 | `/draw/product-design/fission-link` 返回「页面不存在」；原站菜单无入口 |
| SCENE_TRANSFER | 1 | 18 | `/draw/product-design/scene-transfer` 返回「页面不存在」；bundle 仅见自定义路由 `M.custom.bsqSceneTransfer`（倍思奇 B2B），公共站无 DOM |

证据：2026-10-30 用 Chrome for Testing 直连 `https://www.linkfox.com/draw/` 枚举菜单，只有 7 个入口（首页/电商套图/智能修图/新模型/AI视频/批量生图/商品图设计），上述 4 条候选路径全部 404。故这 3 个工具是本地扩展，无法做 1:1 文本比对。

### 复现验收
```bash
cd .verify-tools/frontend-diff && bash measure.sh --no-freeze   # 抓 39 页 + 比对
python3 remain.py                                               # 逐工具剩余清单
cd ../../web && npx tsc --noEmit && npm run build
```
