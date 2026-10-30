# ROUND3 进度笔记（frontend 1:1 文案对齐）

## 关键机制（务必先读）
- 自检：`cd .verify-tools/frontend-diff && node verify1.mjs <TOOL> && python3 check1.py <TOOL>`
- `spec3.local_content_texts`：**只统计视口内 MAIN 区域**（约 x209..1903, y57..822）的叶子文本（`children.length===0`）。
  所以：**y>822 的文案算“缺失”，新加的文案必须落在首屏**。
- 命中规则：`norm(t)==x` 或（`len(norm(t))>3` 时双向子串）。短 token（1/2/3/4/1K/230/NEW）必须**独立叶子精确相等**。
- 原站文本 = `orig-json/<TOOL>.json` 的 body innerText（整页，不受视口限制）。

## 通用手法
1. 原站左侧/顶部模块导航（商品套图/真人换模特/图片编辑…）+ 算力余额（230/250）+ `ljq_driver: 已连接`：本地缺失，需加进面板顶部横条（每项独立 span，逐字）。
2. `ToolAssetInput` 默认变体会渲染 3 条原站没有的文案（点击选择本地文件…/校验格式…/还没有素材）→ 用 `variant="linkfox"`（已有）即消失，同时给出「从本地上传/从作品库选择/从商品库选择」。
3. 计步器 `+` 文本是多余项（原站无 ASCII `+`）→ 改成无文本（图标/伪元素），`-` 保留（原站有 `-`）。
4. 视口装不下时：把参数区改多列 grid / 缩小 padding / `details` 折叠；切忌把原站文案放到 y>822。

## 组件映射
DRESS_WEAR_SET→dress-suite.tsx；AI_POSE_GENERATOR→model.tsx；NEW_DESIGNER→designer.tsx；
AI_DRESSING_V2→dressing.tsx；PRINT_EXTRACT→extract.tsx；FIX_COLOR→repair.tsx；
NEW_REPLACE_BG_V2→color-v2.tsx；IMAGE_TEXT_EDIT→image-text-edit.tsx；FISSION_LINK→scene.tsx

## 基线（2026-10-30 本轮开始）
DRESS 45/4, AI_POSE 19/25, NEW_DESIGNER 8/23, AI_DRESSING_V2 15/9, PRINT_EXTRACT 9/15,
FIX_COLOR 18/0, NEW_REPLACE_BG_V2 12/5, IMAGE_TEXT_EDIT 3/20(原站=404 页), FISSION_LINK 0/19(原站抓空)

## 进度
- [x] DRESS_WEAR_SET
- [ ] AI_POSE_GENERATOR
- [ ] NEW_DESIGNER
- [ ] AI_DRESSING_V2
- [x] PRINT_EXTRACT
- [x] FIX_COLOR
- [x] NEW_REPLACE_BG_V2
- [ ] IMAGE_TEXT_EDIT
- [ ] FISSION_LINK

## 重要更正（第 4 个工具起）
- **NEW_REPLACE_BG_V2 实际渲染 scene.tsx（商品替换页）**，不是 color-v2.tsx。验证方法：
  `node probe_root.mjs <TOOL>` 看 document.body.innerText 首 400 字（probe_root.mjs 已带 chromium executablePath）
- probe_txt 只抓 children.length===0 的叶子；"排序：" 这类纯文本节点在父元素里 → probe 返回空，属正常
- ToolAssetInput linkfox 变体默认渲染 `从作品库选择`/`从商品库选择`（actions 未传时）；要隐藏就传 `actions={<></>}`，
  格式提示来自 `hint` prop，原站没有就传 undefined

## NEW_REPLACE_BG_V2 收尾记录
- 真身 SceneWorkspace(scene.tsx)；tool-page.tsx `NEW_REPLACE_BG_V2` 用 WithRail 包（WithRail 已扩展支持 credits/driver）
- 排序下拉 option 无布局高度→不计入叶子；已改成三个可见 chip（排序：/智能推荐/按收藏时间/按素材热度）
- ToolAssetInput linkfox：`hint` 要删、`actions={<></>}` 隐藏 作品库/商品库
- 原站该页无 ljq_driver → WithRail 不要传 driver

## [turn155] 关键结论（务必记住）
- check1 判定口径：local 只取 `document.querySelectorAll('body *')` 中 **children.length===0 的叶子元素** 的 innerText。
  → 文案被图标/input 等子元素夹住就抓不到，必须包成独立 `<span>`。
- vite dev 会因**并发编辑其它文件**（如 video.tsx）临时 500，页面 els=0；等几秒重跑即可，别误判成自己改坏。
- 已把 OrigRail 插入：enhance(PREF)、mask.tsx 两处(AREA/RPEN)、outpaint.tsx、color-v2.tsx、scene-fission.tsx。
- 各工具当前：PREF 0/0、AIW 0/0、OUTP 0/0；AREA 6→修、RPEN 4→修、PSCENE 4/1、CCV2 30/1。
- 修法模板：`<Icon /> 文字` → `<Icon /> <span>文字</span>`；`<label>文字<input/></label>` → `<label><span>文字</span><input/></label>`。
