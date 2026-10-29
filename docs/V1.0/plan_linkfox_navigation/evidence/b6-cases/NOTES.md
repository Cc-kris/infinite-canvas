# B6 案例同款 — 现场笔记（工作中）

## 原站结构（真实抓取，2026-10-29）
右栏 tab 组：`生成结果 / 优秀案例 / 历史记录`（AI_OUTPAINTING 实测 tab 文案与盒子：x=1296 起，56x22，font 14px）

AI_OUTPAINTING 优秀案例面板（真实 DOM，tab 已点击展开）：
```html
<div class="_content_176zc_1">
  <div class="_wrapper_176zc_11">
    <div class="_imageBox_176zc_23 _mult2_176zc_39">
      <img alt="优秀案例-1986721155815989248" data-image-id="1986721155815989248" src="…">
      <div class="_mask_176zc_74"><div class="_btnBox_176zc_87"><span class="anticon-eye"/><p>预览</p></div></div>
      <div class="_opera_176zc_95">
        <div class="_paramInfo_176zc_562">
          <div class="_paramItem_176zc_568"><span>原图</span><img src="…"/></div>
        </div>
        <button class="ant-btn … _btnBox_176zc_87"><span>做同款</span></button>
      </div>
    </div>
    …
```
- 卡片数 20；卡片盒 264.4 x 148.8（x=1315.1,y=178 第一张）；wrapper `display:grid`（columns 解析为 none，实际应为固定两列），padding 0。
- hover 显示 `预览`（眼睛图标 + 文案），参数区 `原图` = 案例输入图；按钮 `做同款`。
- 空态（未点 tab 时）：`暂无生成结果图` / `快在左侧操作智能扩图吧~`。

AI_DRESSING_V2：卡片刻度 = 三图故事板 `上传平铺服装图 / 选择参考图 / 生成结果` + 按钮 `一键做同款`，翻页 `1/2`；面板副标题 `无需约模特，上传服装正面图，一键生成衣服上身效果~`。

各工具「优秀案例」命中：AI_OUTPAINTING(1) SCALE_UP(0，见下) AI_DRESSING_V2(1,一键做同款×5) IMAGE_TO_VIDEO(1) ；`NEW_REPLACE_BG_V2` 原站无独立页面（supplemental_chunk_design）→ 无原站截图，标 PARTIAL。

## 本地真实产物（复用，不重跑）
- AI_OUTPAINTING: `evidence/real-acceptance/AI_OUTPAINTING/02-result.png`（1024×1024, 929476B）；源图 fixture `product-watch.jpg`（1024×744）
- SCALE_UP: `…/SCALE_UP/02-result.png`（真实放大结果）
- NEW_REPLACE_BG_V2: `…/result1.png`（1024×1024, 1109268B）
- AI_DRESSING_V2: `…/result1.png`（720×960, 819224B）
- IMAGE_TO_VIDEO: `…/06-result-video.mp4`（h264 1344×768, 5.17s）+ `04-result-ui.png`

## 本地实现位置
- 右栏 dock：`web/src/components/tools/tool-history-dock.tsx`（B5，历史任务）
- 工作区：outpaint.tsx / enhance.tsx(SCALE_UP) / scene.tsx(NEW_REPLACE_BG_V2) / dressing.tsx / image-to-video.tsx
- 资产入库：`web/src/services/api/tools/assets.ts` → `uploadToolAsset(File|Blob)` → localforage `tool-asset:<nanoid>`，记录含 id/url/width/height
- 草稿持久化：`web/src/stores/use-tool-draft-store.ts`（键 `tool-draft:v1:<toolId>`）
