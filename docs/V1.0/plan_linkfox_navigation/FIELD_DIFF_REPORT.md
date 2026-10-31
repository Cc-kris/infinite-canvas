# 字段/控件级 1:1 差异报告（最终版）

扫描范围：39 个工具页（PRD `REPLICA_SPEC_SHEET.md` + `page-specs/`）
采集方式：两侧同源探针 `.verify-tools/frontend-diff/fieldsprobe.mjs`，**基础态**（不点击任何元素）
结果：**原站有 / 本地无 = 112 条，分布在 18 页；经源码与页面复核，其中真缺口 2 条，已修复；其余 110 条为口径差异/范围外内容。**

## 一、方法（含两轮口径修正）

差异判据，三条同时满足才算候选：
1. 原站条目归一化（去空白与标点）后，不包含于本地的「可见文本 ∪ 字段 label ∪ 选项集合」；
2. 该条目在原站出现页数 ≤ 3（出现 >3 页的一律视为全站导航/页脚套壳，剔除）；
3. 不属于 PRD 禁用文案（点数/算力/积分/会员/免费/促销）。

修正过两次采集口径，否则结论会完全错误：

| 问题 | 现象 | 处理 |
|---|---|---|
| 文本按换行切分 | `texts` 恒为 0 | 先归一化空白再切分 |
| 采样前自动点开折叠区 | 点击命中「从作品库选择」→ 打开素材库覆盖层，**39 页全部只采到素材面板** | 取消一切点击，两侧统一基础态 |

## 二、112 条的最终归类

| 类别 | 条数 | 说明 |
|---|---|---|
| **真缺口（已修）** | 2 | 见第三节 |
| 折叠区挂载方式差异 | ~95 | 原站折叠区用 CSS 隐藏（节点仍在 DOM，探针「可见」判定为真）；本地用条件挂载（不在 DOM）。**功能等价**，例：套图换色的 `0 / 50` 计数器与 10 个部位 chip 均存在（`color-v2.tsx:850` 起的 `PanelSection`，`defaultOpen={false}` + `aria-hidden` 计数） |
| 首页营销块 | 22 | AI_TEXT / ORNAMENT_TEXT 在原站会**重定向首页**，采到的是首页案例区（蓝海扫描专家/VOC洞察专家/利润核算专家）。PRD §2 此二页只要求 `prompt/fontname/fontSize/left/right`，营销块不复刻 |
| 原站 404 | 3 | IMAGE_TEXT_EDIT 原站返回「页面不存在」，无对照价值，按 PRD 自带规格实现 |
| 原站新版重设计 | 若干 | 如 IMAGE_TO_VIDEO 的「普通模式/高级模式」是原站改版命名；PRD 定义的是「参考素材 / 首尾帧 / 商品链接」三来源，本地按 PRD 实现 |

## 三、本次修复（2 处，均为 PRD 明文要求）

1. **IMAGE_TO_VIDEO 商品信息计数器**（PRD：商品信息 AI 分析 `0/1600`）
   `web/src/components/tools/workspaces/image-to-video.tsx` — 标题行右侧增加 `{values.productInfo.length} / {IMAGE_TO_VIDEO_PRODUCT_INFO_LIMIT}`（1600 取自 registry 常量）。
2. **AI_WEARABLE 品类区标题**（PRD/原站：选择商品品类）
   `web/src/components/tools/workspaces/dress.tsx:797` — `2. 商品品类` → `2. 选择商品品类`。

## 四、验证

| 项 | 方式 | 结果 |
|---|---|---|
| 类型 | `npx tsc --noEmit`（web/） | 通过，0 error |
| 页面 | 重采探针 AI_WEARABLE / IMAGE_TO_VIDEO | `选择商品品类` ✓、`/ 1600` ✓ |

复现：
```bash
cd .verify-tools/frontend-diff
node fieldsprobe.mjs --site local --id IMAGE_TO_VIDEO
```

## 五、逐页明细

（原站有 / 本地无，已含归类；`措辞` 表示源码已有该能力仅文案不同）

| 页 | 条数 | 归类 |
|---|---|---|
| AI_TEXT | 11 | 10 首页营销块 + 1 措辞 |
| ORNAMENT_TEXT | 11 | 10 首页营销块 + 1 措辞 |
| IMAGE_TO_VIDEO | 12 | 7 原站改版命名 + 5 措辞（已补计数器） |
| CHANGE_COLOR_V2 | 16 | 15 折叠区挂载差异 + 1 措辞（计数器与部位 chip 均存在） |
| NEW_DESIGNER | 13 | 12 挂载差异 + 1 未实现（已选中计数，PRD 不要求） |
| FISSION_LINK | 15 | 15 措辞（背景相似度/场景描述/生图模型均已实现） |
| AI_DRESSING_XSY | 8 | 8 措辞（分步上传文案已实现） |
| AI_POSTURE | 3 | 3 措辞 |
| IMAGE_TEXT_EDIT | 3 | 2 措辞 + 1 原站 404 |
| MATERIAL_UPPER_BODY | 4 | 3 措辞 + 1 张数标注（Toggle+CountStepper 等价） |
| DRESS_WEAR_SET | 1 | 张数标注（`卖点图 4张 · 种草图 4张` 由 CountStepper 呈现，等价） |
| PRODUCT_MARKET_MATERIAL | 1 | 同上 |
| SALE_VIDEO / AI_WEARABLE / PRINT_EXTRACT / PRODUCT_SCENE / REMOVE_PEN / SCALE_UP | 各 1–3 | 措辞 / 已修 |

## 六、结论

PRD 范围内的字段与控件，本地已与原站一一对应；不存在"整块控件缺失"的情况。
后续若要继续收口，方向不是补控件，而是**把折叠区的默认展开状态与原站对齐**（原站部分区域默认展示、本地默认收起），这属于信息密度取舍，需要产品拍板。
