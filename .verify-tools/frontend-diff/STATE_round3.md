# 第三轮 1:1 对齐 状态
## 自检命令
cd /Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff
node verify1.mjs <TOOLID> && python3 check1.py <TOOLID>
度量: node measure.mjs <TOOL> [testid]
抓错: node err.mjs <TOOL>   (本文件已在)
## 规则
- 只有视口内(1920x839, main x>=209, y<=822)叶子文本算数
- 缺失必须逐字；多余靠短token子串命中，短文本天然易通过
## 进度
- DRESS_WEAR_SET 0/0 ✅
## 待办(初始)
AI_POSE_GENERATOR 19/25 | NEW_DESIGNER 8/23 | AI_DRESSING_V2 15/9 | PRINT_EXTRACT 9/15
FIX_COLOR 18/0 | NEW_REPLACE_BG_V2 12/5 | IMAGE_TEXT_EDIT 3/20 | FISSION_LINK 0/19
## 关键发现
- 共性缺口 = 原站左侧族导航(rail) + 250 算力徽标 → 已有组件 components/tools/workspaces/orig-rail.tsx (OrigRail + SMART_EDIT_RAIL/PRODUCT_DESIGN_RAIL/ECOMMERCE_SUITE_RAIL)
- 仅 printing-repair.tsx / crop.tsx 用了 OrigRail，其余工具没接
- 改 JSX 出错(els=0) => curl localhost:3000/src/<filepath> 看 babel 报错行

## 第三轮进度（自动记录）
- AI_WEARABLE: 0/0 ✅ (orig-rail WEAR_RAIL + linkfox上传卡 + 蒙版/快照/结果按需渲染 + ChipText伪元素标签)
- 待办: PREF/AREA/RPEN/OUTP/CCV2/PSCENE/PIS
- 关键坑: verify1.mjs 首个工具会因 vite 冷编译抓到空(els=0) → 逐个工具单独跑
- 关键坑: Segmented(chipLabels) 用 CSS 伪元素渲染文字，DOM 无文本节点(原站该处是图片)
