# CHANGE_COLOR_V2 验收进度（工作现场记录）

## 目标
CHANGE_COLOR_V2（套图换色）真实生成验收：服装/产品/模特/参考色输入 → 生成 → 保存字节 + 下载/存资产/发画布；不做 mock；最多两轮真实调用；结束后提交并退出。
仓库 /Users/mac/Documents/Dev/infinite-canvas 分支 feat/linkfox-v1-real。未提交的 web/src/services/api/image.ts 已备份、不提交。

## 已改代码
- web/src/components/tools/workspaces/color-v2.tsx
  - import saveResultItemToAssets / sendResultItemToCanvas
  - 新增 actingUnit/actionNotice 状态、outcomeItem/outcomeTitle/saveOutcome/sendOutcome 回调
  - 结果卡按钮从「下载」扩展为「下载 / 存入资产 / 发画布」；结果区顶部显示 actionNotice（data-testid=color-v2-action-notice）
  - tsc --noEmit 通过（web 目录，zsh -lc npx tsc --noEmit）

## 关键事实
- 页面路由 /tools/ecommerce-suite/change-color-v2；分区 id：suite/plans/region/quality/adjust/results
- file input：input[0]=[data-testid=tool-asset-file-input]（套图，multiple）；input[1]=section#plans 内（参考图）。二者都 hidden → 必须 state:"attached" 或直接 setInputFiles
- 部位档位：全身/上装/下装/鞋面/鞋底/包身/包带/外壳/瓶身/表带；品质：低/中/高
- 参考图作为第二张 reference 进入 buildUnitInput（adapter change-color-v2.ts），prompt 含「把<部位>改成参考图「X」中的颜色与材质」
- lib.mjs EVIDENCE_ROOT 依赖 cwd：脚本内显式设 IC_EVIDENCE_ROOT 到 repo docs 路径
- 正确证据目录：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/CHANGE_COLOR_V2/
- 画布 store：web/src/stores/canvas/use-canvas-store.ts；资产 store：web/src/stores/use-asset-store.ts

## 脚本
web/scripts/real-acceptance/run-color-v2.mjs（arg=1|2）
- round1：apparel-print.jpg + model-portrait.png，部位=上装
- round2：product-watch.jpg，部位=表带
- fixtures: color-ref-navy.png(512x512 海军蓝), model-portrait.png(720x960 from AI_DRESSING_V2 evidence)

## 问题与修正
1. waitForSelector 默认等 visible → hidden input 超时 30s 失败（未触发生成）。已改为 state:"attached"。
