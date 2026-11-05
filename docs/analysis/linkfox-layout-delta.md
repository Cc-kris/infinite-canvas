# LinkFox 复刻 —— 按 PRD 口径的现状审计（2026-10-30）

## 一、PRD 规定「要复刻什么」（唯一事实源）

- `docs/V1.0/plan_linkfox_navigation/prd.md`（556 行，REQ-001..015 + REQ-T01..T39）
- `docs/V1.0/plan_linkfox_navigation/ui_brief.md`（布局数值）
- `docs/V1.0/plan_linkfox_navigation/scope_boundary.md`（用户 2026-10-29 最高优先口径）
- `docs/V1.0/plan_linkfox_navigation/page-specs/`（39 页逐页事实源）
- `docs/V1.0/plan_linkfox_navigation/tool-matrix.md`（39 工具 canonical route）

### 要复刻
1. 信息架构：五类一级菜单（电商套图→智能修图→批量生图→商品图设计→AI视频）+ 二级 + 39 个独立路由。
2. 页面骨架：**工具侧栏 + 内容区**；内容区 = 内容头 + (`配置栏` + `结果区`)。
3. 每页真实工作区：按 `page-specs/NN-*.md` 的分区顺序、必备控件、状态联动（不得退化成「上传+提示词+结果」空壳）。
4. 工作流：输入→配置→提交→结果→历史、批量、保存资产/发送画布、失败恢复、刷新恢复。

### 不复刻（明确排除）
促销条、`免费得算力/积分/算力数字/购买`、个人中心、学习中心、活动页、HelpDock/操作咨询浮窗、
LinkFox 紫色品牌 `#723cf9`、以及为此写死的像素 className。

### PRD 给的布局数值（ui_brief §4）
| 项 | 规定值 |
|---|---|
| 桌面顶栏 | 48px |
| 工具侧栏 | 184px |
| 内容头 | 56px |
| 内容区列 | `minmax(320px,360px) + minmax(0,1fr)`，间距 16px，padding 20px |
| ≥1440 | 双栏；1024–1439 配置栏 320px；<1024 单栏；<768 侧栏 Drawer |
| 控件/按钮 | 控件 36px、主按钮 40px、卡片圆角 10、输入 8 |

## 二、实测现状（1600×1000，39 条路由逐页跑，headless 真实 DOM）

判定方法：`main` 内检测「同父容器、横向分离、竖向重叠、高度>250」的两列并列行，取面积最大者。

| 路由 | 配置栏 | 结果区 |
|---|---|---|
| ecommerce-suite/product-image-suite | 760 | 594 |
| ecommerce-suite/dress-wear-set | 443 | 443 |
| ecommerce-suite/change-color-v2 | 720 | 300 |
| ecommerce-suite/image-translation | 560 | 758 |
| ecommerce-suite/scale-up | 420 | 922 |
| ecommerce-suite/ai-outpainting | 729 | 615 |
| smart-edit/area-repair | 754 | 240 |
| smart-edit/remove-pen | 无并列双栏 | — |
| smart-edit/change-color | 362 | 600 |
| smart-edit/image-crop | 946 | 340 |
| smart-edit/product-refine | 420 | 902 |
| smart-edit/fix-color | 754 | 240 |
| smart-edit/printing-repair | 998 | 320 |
| smart-edit/hand-repair | 958 | 340 |
| product-design/new-replace-bg-v2 | 380 | 958 |
| product-design/replace-goods | 976 | 340 |
| product-design/product-scene | 300 | 1052 |
| product-design/handheld-goods | 300 | 1054 |
| product-design/ai-dressing-v2 | 318 | 716 |
| product-design/ai-posture | 918 | 420 |
| product-design/ai-wearable | 420 | 922 |
| product-design/ai-text | 无并列双栏 | — |
| product-design/ornament-text | 无并列双栏 | — |
| product-design/sds-design | 823 | 179 |
| product-design/print-extract | 300 | 1052 |
| product-design/ai-pose-generator | 300 | 1026 |
| product-design/ai-dressing-xsy | 无并列双栏 | — |
| product-design/fission-link | 300 | 1054 |
| product-design/image-text-edit | 958 | 380 |
| product-design/material-upper-body | 808 | 522 |
| product-design/new-designer | 无并列双栏 | — |
| product-design/product-market-material | 760 | 594 |
| product-design/scene-transfer | 300 | 1044 |
| ai-video/image-to-video | 380 | 912 |
| ai-video/sale-video | 300 | 340 |
| ai-video/video-replication | 250 | 280 |
| ai-video/ai-video-editing | 560 | 718 |
| ai-video/video-translation | 320 | 958 |
| ai-video/video-concat | 469 | 469 |

### 汇总
- 双栏页 34/39，5 页无并列双栏。
- **配置栏宽度散布在 250–998px**；落在 PRD 区间(320–420) 的只有 7 页
  （scale-up 420、change-color 362、product-refine 420、new-replace-bg-v2 380、ai-wearable 420、
  image-to-video 380、video-translation 320）。
- 超 420px 的 18 页（最大 998）；低于 320px 的 9 页（最小 250，video-replication）。
- **25/39 页正文出现「算力 / 点/张 / N点」文案**，与 PRD「提交按钮旁不显示原站算力」直接冲突；
  其中 `250` 徽标就在 `nav[suite-family-rail]` 里，`50点/张` 在配置栏按钮里。
- 工具侧栏 `aside[tool-sidebar]` 实测 180px（PRD 184）✓；侧栏内含原站「免责声明」条目 ✗。
- 顶栏 `shell-top-nav` 实测 56px（PRD 48 / 验收脚本 design19-shell-check 断言 60）→ 三处数字不一致。
- `aside` 右侧抽屉（x=1600 起）里有「连接本地 Agent」卡片：属 Infinite Canvas 自身 Agent 面板，
  不在可视区，**不是** LinkFox HelpDock 残留（design19-shell-check 实测 promo/userArea/points/helpDock 全 false）。

## 三、结论
不是「没做功能」，而是**39 页各自写布局、没把 PRD §4 的数值当验收项**：配置栏从 250 到 998 随意，
结果区被挤到 179–1054，所以视觉上像 39 个不同产品 → 用户看到「连页面布局都不一样」。
旧验收脚本只比「控件文本/数量」，且 13/36 原站样本为空样本，从没断言过任何几何值。

## 四、可复现
```
cd web
export PATH=/opt/homebrew/bin:$PATH
CHROME_PATH="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  node scripts/real-acceptance/design19-shell-check.mjs
```
（dev server: `cd web && pnpm dev`，127.0.0.1:3000）
