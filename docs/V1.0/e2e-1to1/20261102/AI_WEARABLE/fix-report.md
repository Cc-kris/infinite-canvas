# AI_WEARABLE｜AI穿戴 + 上装换料 · 1:1 差异修复记录

- 修复范围：`web/src/components/tools/workspaces/dress.tsx`（两个工具共用文件）+ `registry/ai-wearable.ts`、`registry/material-upper-body.ts`、`registry/index.ts` 的 AI_WEARABLE 字段行 + 两个适配器的直接测试。
- 未改：`tool-shell.tsx`、`tool-workspace-columns.tsx`、`globals.css`、`orig-rail.tsx`、`tool-page.tsx`（均保持其它 worker 的现状，一行未动）。
- 对照基准：`docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/report.md`，以及本轮 ego-browser 对原站 `https://www.linkfox.com/draw/ai-wearable`、
  `https://www.linkfox.com/draw/clothing-image-suite`、`https://www.linkfox.com/draw/material-upper-body`（404）的只读复测。
- 只读约束：未点击任何「立即生成 / 开始生成 / 购买」，未提交生成任务，未消耗算力；本地只上传了自制的纯色 PNG 探针到本机资产库（已从表单移除，资产库未新增商品/模特库数据）。

## 1. P0：配置栏溢出、生成按钮不可达（已修复）

| 项 | 修前（report.md） | 修后实测 |
|---|---|---|
| `main` 滚动 | report 记录 `overflow-y: hidden`、`scrollTop` 恒为 0 | `overflowY: auto`，`scrollHeight=1160`、`clientHeight=944`、滚轮后 `scrollTop=216` |
| 「立即生成」位置 | y=1764（上传模特后 3358），视口外且不可达 | 吸底 `sticky bottom-0`，滚动末端 y=964（视口 1000 内），`elementFromPoint` 命中按钮本身 |
| 三档视口 | 1440×900 / 1600×1000 / 1920×1080 全复现溢出 | 三档全部可滚到末端并命中按钮（另有 1280×800 也验证） |

| 视口 | 修前 scrollTop/可滚 | 修后 `main.scrollTop` | 修后按钮 y | 命中原按钮 |
|---|---|---|---|---|
| 1440×900 | 0（不可滚） | 492 = max(492) | 864（< 900） | 是 |
| 1600×1000 | 0（不可滚） | 392 = max(392) | 964（< 1000） | 是 |
| 1920×1080 | 0（不可滚） | 312 = max(312) | 1044（< 1080） | 是 |

上装换料同样验证：`main` 可滚（1440/1600/1920 的 `scrollTop` 分别 226/126/46 = 各自 max），吸底「立即生成」在末端可见且命中。

做法：不再给配置列内容设固定高度，也不依赖父级 `overflow`；主按钮放进 `sticky bottom-0` 的 268 宽页脚，
结果列 `lg:sticky lg:top-0 lg:self-start` 贴顶（对应原站「左列滚动、右列固定」）。

## 2. 删除原站没有的本地自造控件（已完成）

| 自造控件 | 处置 |
|---|---|
| 检测类型 4 chip（不检测/敏感词/合规/主体） | **删除 UI**；`checkType` 保留为内部默认值 `compliance`，仍进入 11 字段真实提交 |
| 模特类型 4 页签（真人模特/手部特写/半身/全身） | **删除 UI**；`modelTabType` 默认 `real` 内部提交 |
| 场景类型 4 chip | **删除 UI**；`sceneTabType` 默认 `keep` 内部提交 |
| 二次操作 checkbox | **删除 UI**；`isSecondOperate` 默认 `false` 内部提交 |
| 生图模型下拉 | **删除 UI**（AI穿戴与上装换料都删）；提交仍用渠道配置的 `imageModel` |
| 素材名输入框 | 上装换料侧删除输入（`imageName` 由上传资产名/资产 id 兜底，adapter 原实现不变） |
| 5 步步进条（上装换料） | **删除**（原站无此控件） |
| 本次提交快照卡（上装换料） | **删除**（原站无），结果区改为「生成结果」Tab + 右上下拉历史 |
| `categoryIds/categoryName/subType` 字段名直出、`chunk 未取证` 括注 | 全部改成中文文案（`MATERIAL_CATALOG_NOTICE` 与上传提示同步改写） |
| 「穿戴的部位与模特参考」显式部位 chip | **删除交互**；部位由所选品类隐式决定（原站的部位由模特卡决定），`part` 仍参与提示词与目标蒙版默认值 |

SSR 断言已覆盖：`检测类型 / 模特类型 / 场景类型 / 二次操作 / 生图模型 / material-model-select` 均不得出现在 HTML 里。

## 3. 品类选择：268×80 选择卡 + 12 项弹层网格（已完成）

- 选择卡：`w-[268px] h-80px`，左侧缩略图位 + 「选择商品品类 / 穿戴的商品品类」双行 + 右箭头；点击打开弹层。
- 弹层：4×3 = 12 项，**顺序与集合逐项对齐原站**：鞋靴 / 箱包 / 眼镜 / 项链 / 帽子 / 耳环 / 戒指 / 手表 / 手环手链 / 头饰 / 皮带 / 其他；
  标题「选择商品品类」+ 原站 Tips 原文（`选择对应的商品品类，生成的效果会更佳！若没有对应品类，则选择「其他」即可~`）。
- 弹层用 `position: fixed` + 触发元素矩形定位并夹到视口内（实测 `panel` 完全在视口内，Esc/点击外部关闭）。
- 图片：原站每项是 LinkFox CDN 真实商品图，本地没有这些图、也没有商品库可查，因此每项用**图标 + 中文名**的诚实占位（不贴任何别家照片冒充）。
- 选项集合变更同步到 registry：`WearableCategoryKey` 从 9 项（首饰/手表/眼镜/帽饰/围巾/手套/腰带/鞋履/包袋）改为原站 12 项；
  默认品类 `jewelry` → `necklace`（项链）。

## 4. 结果区：两 Tab + 右上历史入口（已完成）

- Tab 改为 `生成结果 / 优秀案例` 两个；删掉本地自造的内联第三个「历史记录」Tab 与结果区下方的内嵌历史卡。
- 右上「历史记录」入口（`HistoryIcon + 历史记录`）位置对齐原站；原站是外链 `/draw/history?type=34`，本地无该路由，
  点开打开**本地真实落盘的任务历史**（`ToolTaskHistory`，空态诚实），不新增第三个 Tab 形态。
- 去掉二级「生成结果」重复标题，改为右对齐摘要「本次 N 张 · 已返回 M 张」，空态是三段「上传穿戴物品 → 选择参考图 → 生成结果」+「一键做同款」。
- 上装换料同步：结果区 `生成结果` Tab + 右上「历史记录」入口，删掉自造快照卡。

## 5. 生成张数默认 4、主按钮文案/位置/宽度（已完成）

- `registry/index.ts` 的 AI_WEARABLE `outputNum` 字段 `defaultValue: 1 → 4`（registry 层）；
  `DEFAULT_WEARABLE_VALUES.outputNum` 已是 4；草稿回退值也改成 `DEFAULT_WEARABLE_VALUES.outputNum`（不再硬编码 1）。
- 页面实测：`data-output-num="4"` 带 `data-active="true"`，按钮文案 `立即生成 (4张)`，与张数联动。
- 按钮：`h-32px`、`w-268px`（原站 `268×32`）、`bg-primary #723cf9`、圆角 6、吸底。
- 不显示算力（合规），用张数代替 `(40算力)`；**不把品类/部位塞进按钮文案**（原站也没有）。

## 6. 上传入口 / 图片规则 / 主色 / 尺寸（已完成）

- 上传卡：原站形态的 `上传商品图` + 紫底「从本地上传」214×24 + 白底紫边「从作品库选择」「从商品库选择」各 100×24 + `10M以内，384*384 ~ 4096*4096`。
- 主色：`--primary: #723cf9`（`tool-linkfox-surface`）实测上传按钮 `rgb(114,60,249)`，与原站 `#723CF9` 一致。
- 「图片规则」放在「上传穿戴商品」标题右侧（原站位置），文案逐字未改。
- 💡 提示回到上传区顶部（原站 y160 的位置），不再是示例图下方。
- 「或试试这些」4 个 64px 示例缩略图保留（真实案例素材，点击走真实入库回填）。
- 蒙版编辑器默认折叠成「穿戴区域微调（商品蒙版 / 模特蒙版）」，不占首屏。

## 7. 作品库 / 商品库入口（已完成）

- 「从作品库选择」**不再 disabled**：读本机 `useAssetStore` 真实作品；有图 → 网格选择并 `adoptLibraryAsset` 真实入库回填；空 → 诚实空态「作品库还没有图片，先在画布/图片页生成或上传吧。」
- 「从商品库选择」**不再 disabled**：打开弹层并如实说明「本机没有接入账号级商品库，这里没有可选的商品」+ 引导用本地上传/作品库；
  **没有伪造任何商品数据**。
- 上装换料同上（`material-from-works` / `material-from-goods`）。

## 8. 上装换料（同文件同 registry 配套）

- 原站 `/draw/material-upper-body` 本轮复测仍 **404**；对照页 `clothing-image-suite`（服装套图）确认原站上传卡是「从本地上传 + 从作品库选择 + 从商品库选择」三按钮，
  已按此改；材质大类/子类是本地目录（原站无对应控件），因此文案明确写「材质类目为本地目录」，不再把 chunk 取证备注给用户看。
- 上传限制与原站商品类卡一致：`10M以内，384*384 ~ 4096*4096`（原来 20M + 「通用图片上限」括注）。
- 保留真实的抠图蒙版、张数、单张重试、结果资产；去掉自造步骤条、快照卡、素材名输入、生图模型下拉、字段名直出。

## 9. 验证

- **浏览器实测**（ego-browser，本地 `http://127.0.0.1:3000`，1600×1000 / DPR1）：
  - 滚轮：`main.scrollTop` 0 → 216（AI穿戴）、0 → 126（上装换料），均等于 `scrollHeight - clientHeight`；
  - 末端 `elementFromPoint` 命中「立即生成」按钮本身（不被父级裁切、不被浮层遮挡）；
  - 品类卡 → 12 项弹层 → 选「耳环」→ 卡片值变「耳环」，弹层关闭；
  - 模特卡 → 弹层 → Esc 关闭；作品库/商品库弹层空态文案正确；
  - 「优秀案例」Tab 切到真实案例瀑布流；右上「历史记录」入口切到本地真实历史。
- **类型检查**：`tsc` 只跑本文件与两个 registry/适配器测试文件（`/tmp/tsconfig.dress.json`）**0 error**。
  说明：`web/` 全量 `tsc` 当前被 `workspaces/video.tsx:2734` 的 JSX 标签未闭合挡住
  （该文件是其它 worker 的改动，本任务禁改；已用 `git stash` 验证与本次改动无关），故只做定向 tsc。
- **测试**：`bun test src/features/tools/adapters/ai-wearable.test.ts src/features/tools/adapters/material-upper-body.test.ts` → **59 pass / 0 fail**。
  - 两个 SSR 用例按新形态重写（两 Tab、无自造控件、默认 4 张、按钮 `立即生成 (4张)`、上装换料三按钮上传卡、无步骤条）。
  - 品类集合变更后，`ai-wearable.test.ts` 里两处用 `gloves` 的用例改成新集合内的 key（`ring` / `bag`）。
  - `tool-page.integration.test.tsx > sidebar scopes itself...` 一条失败是**既有失败**：stash 掉本次全部改动后仍失败（与本次无关）。

## 10. 截图

| 说明 | 路径 |
|---|---|
| AI穿戴修后基线（1600×1000） | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-01-baseline.png` |
| AI穿戴滚到末端（主按钮可达、右列贴顶） | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-02-scroll-bottom.png` |
| AI穿戴「图片规则」弹层 | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-03-imagerule.png` |
| AI穿戴品类 12 项弹层 | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-04-category.png` |
| AI穿戴模特选择弹层 | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-05-model.png` |
| 从作品库选择（诚实空态） | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-06-works.png` |
| 从商品库选择（诚实空态） | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-07-goods.png` |
| 优秀案例 Tab | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-08-cases.png` |
| 右上历史入口（本地真实历史） | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-09-history.png` |
| 做同款回填后（真实素材入库、按钮可点、末端可达） | `docs/V1.0/e2e-1to1/20261102/AI_WEARABLE/local-fixed-11-case-applied.png` |
| 上装换料修后基线 | `docs/V1.0/e2e-1to1/20261102/MATERIAL_UPPER_BODY/local-fixed-01-baseline.png` |
| 上装换料滚到末端（主按钮可达） | `docs/V1.0/e2e-1to1/20261102/MATERIAL_UPPER_BODY/local-fixed-02-scroll-bottom.png` |
| 上装换料从作品库选择 | `docs/V1.0/e2e-1to1/20261102/MATERIAL_UPPER_BODY/local-fixed-03-works.png` |
| 上装换料材质大类选中（棉质→子类联动） | `docs/V1.0/e2e-1to1/20261102/MATERIAL_UPPER_BODY/local-fixed-04-cotton.png` |
| 上装换料从商品库选择（诚实空态） | `docs/V1.0/e2e-1to1/20261102/MATERIAL_UPPER_BODY/local-fixed-05-goods.png` |
| 上装换料历史入口 | `docs/V1.0/e2e-1to1/20261102/MATERIAL_UPPER_BODY/local-fixed-06-history.png` |

## 11. 仍未完成 / 已知边界

1. **品类 12 项没有真实商品图**：原站每项是 LinkFox CDN 图，本地无该素材来源、也无商品库可查；现在用图标占位（诚实占位），
   若要 1:1 图像，需要提供可用的商品品类图片素材或授权 CDN 取图。
2. **模特选择弹层不是原站模特库**：原站有「智能推荐/我的/收藏/采集素材 + 商品品类筛选 + 60 张模特图」；
   本地没有账号级模特库，弹层只提供「本地上传 / 作品库」并如实说明，未伪造模特数据。
3. **「历史记录」是本地面板而非原站外链**：本地没有 `/draw/history?type=34` 对应路由；位置/入口形态对齐，内容是本机真实任务快照。
4. **优秀案例只有 6 张**（本地 `AI_WEARABLE_CASES` 真实素材就是这些）；原站是 4 列瀑布流 + 「原图」左下角标。
   本轮未改案例数据与角标样式（`tool-cases.tsx` 属共享组件，不在允许编辑范围）。
5. **壳层差异**（促销条/算力/学习中心/HelpDock/top-right 图标组/右缘竖条/Agent 面板）不在本次允许编辑范围，未处理。
6. **上装换料没有上游 1:1 基准页**：原站该 slug 仍 404，只能对照 `clothing-image-suite` 的上传卡形态；换料语义本身是本地补充能力。
7. 配置栏仍是 300px（`tool-workspace-columns` 提供，禁改），因此 268 宽卡片左侧留 16px 内边距时右侧会多 2px 余量，视觉上比原站略宽松。
