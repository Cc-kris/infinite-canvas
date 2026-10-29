# edit8 六维终验 — 进度笔记（2026-10-29）

## 已完成（有证据）
1. IMAGE_CROP 回放修复：裁剪结果任务不回流历史，但草稿+源图恢复；`run-nv.json` issues=[] / dl 205951B / storeAssetsAfterReload 1 条 / resultVisible true。
2. IMAGE_CROP 三动作：下载 205951B、存资产、发画布 1 节点（`evidence/real-acceptance/IMAGE_CROP/run-nv.json`）。
3. CHANGE_COLOR 三动作：dl 930500B、assetId 0SQDdAuB8BY6nDazj9fAm、projectId gEEC-5hIDKRGT-J99WofC。
4. PRODUCT_REFINE：dl 1941138B、assetId IVO2_kf-bGqFYhZmATHqE、projectId hRvgcYZQs83KjNdPAiMnI。
5. 上传区文案对齐：SCALE_UP/PRODUCT_REFINE(enhance.tsx)、CHANGE_COLOR(color.tsx)、IMAGE_CROP(crop.tsx)、FIX_COLOR(repair.tsx) 改用 `variant="linkfox"`（从本地上传/从作品库选择/从商品库选择）。
6. 全局帮助浮窗：新增 `web/src/components/tools/help-dock.tsx`（右侧居中两枚 101×40 r=89px #723cf9 胶囊「操作咨询/产品教程」），在 `tool-page.tsx` 挂载。
7. `product-scene.ts` SceneIssueCode 补 `custom-size-step`（既有 typecheck 阻塞）。`npx tsc --noEmit` EXIT=0。

## 采集器
`web/scripts/real-acceptance/edit8-final-snap.mjs` → `docs/V1.0/plan_linkfox_navigation/evidence/edit8-final-20261029/local/<ID>.json`（rect/计算样式/bodyText/controls/chips）+ `dom/<ID>.html`（原始 DOM）。

## 待办差异（逐项）
- IMAGE_CROP：原站「下载图片」= canvas 右上主按钮 130×32 白字可见文本（本地是 IconButton 仅 aria-label）；原站「自由裁剪」是「尺寸调整」页签里的首个 _sizeItem_ 卡片 236×40 默认选中（本地在「比例调整」页签内）。
- SCALE_UP：原站 CTA「立即生成」+「(20算力)」；本地「开始放大（…）」。另有「批量高清放大」入口（本地无批量队列，建议 disabled + PARTIAL）。
- CHANGE_COLOR：「开启/关闭」分段（去杂色）、「知道了」（水印分组提示）本地形态不同。
- PRODUCT_REFINE / FIX_COLOR：原站「点击上传」+「20M以内，jpg/jpeg/png/webp」提示行。
- REMOVE_PEN：「或试试这些」（空态相似推荐）本地无。

## 原站真实站快照（只读参考）
`evidence/b9-visual-parity-20261029/real/<ID>/form.json`（view 1908×781；text.txt 为 GBK，读要用 gbk 解码）。
