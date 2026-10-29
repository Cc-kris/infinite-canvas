# suite6 六工具最终缺口收口（2026-10-29）

- 分支：`feat/linkfox-v1-real`；起点 HEAD `9edebbe`
- 口径：[scope_boundary.md](../scope_boundary.md)（只复刻工具功能与必要字段；界面用 Infinite Canvas token）
- 判据来源：[scope-reaudit-20261029.md](./scope-reaudit-20261029.md) + `tools/scope_audit.py`

## 缺口清单（起点实测）

| 工具 | 维度 | 缺口 |
|---|---|---|
| PRODUCT_IMAGE_SUITE | T/U | `suite.tsx` 残留 `({expected*50}算力)` 计费文案（audit ERR）；4 处原站像素色 `#723cf9`/`#8a8a99` |
| CHANGE_COLOR_V2 | F/R | 双图第二单元真实生成未跑通（verifiedUnits 1/2；第二轮整页重置后任务停在 submitting） |
| IMAGE_TRANSLATION | F/D | 原站 7 组控件未对齐；真实翻译未重跑 |
| SCALE_UP | K | 原站有「优秀案例」模块，本地 `enhance.tsx` 无案例区/做同款 |
| AI_OUTPAINTING | H | 历史任务刷新恢复未单独实测 |
| DRESS_WEAR_SET | — | 仅回归验证（不新增能力） |

## 明确排除（不做）

- 水印分组（`管理水印分组 / 默认 / ＋ 新增水印分组`）：仓库无真实水印后端，属原站增值能力，按 scope 不伪造；
- HelpDock（操作咨询 / 产品教程 / 连接本地 Agent）：scope 已排除；
- LinkFox 全局样式、计费/积分/促销条：禁止恢复。

## 执行与证据

（随进度补充）
