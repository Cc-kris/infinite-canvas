# NEW_DESIGNER：同工具 LinkFox 1:1 对照（feat/linkfox-v1-real）

- 原站入口：`https://www.linkfox.com/draw/designer-home`（未登录可访问，截图 `linkfox-designer-home-20261029.png`，1908×781）
- 原站编辑器：`https://www.linkfox.com/designer?designerId=&imageUrl=&isDesignerUse=&open=&onClose=&onDone=`
- 本站路由：`/tools/product-design/new-designer`
- 原站证据来源：
  1. 入口页真实截图（本目录 `linkfox-designer-home-20261029.png`）
  2. 设计器路由与接口清单：`docs/V1.0/assets/15-endpoint-catalog.md` 第 79–87 行（`/designer?...`）、第 279–297 行（`/image/designer/*`，取自原站 bundle 的请求字面量）
- 本站证据：`result.json`（导出/入库/发画布 PASS）+ 本轮的 DOM 实测追加（见 §3）

> 说明：本轮未取得登录态，原站编辑器内部（字体列表内容、背景素材列表、模板画廊素材）**未抓到真实数据**，因此下表对这类条目只标注「原站存在该能力」，不编造具体条目，并在 §2 记为偏差。

## 1. 逐项对照

| # | 原站（真实证据） | 本站实现 | 实测证据 | 结论 |
|---|---|---|---|---|
| 1 | 入口 `/draw/designer-home`：创建设计 / 我的设计 / 我的模板 / 团队空间四个入口 | 无独立入口页；工具内直接进入设计器宿主 | 截图 `linkfox-designer-home-20261029.png`；本站 `web/src/components/tools/workspaces/designer.tsx` | ⚠️ 偏差（见 §2-1） |
| 2 | 入口页上传：`accept=png/jpg/jpeg/webp` | 设计器内「添加图片」走本站资产/上传校验（PNG/JPEG/WEBP） | UI 实测：`添加图片` 按钮存在 | ✅ 等价 |
| 3 | 编辑器路由参数 `designerId / imageUrl / isDesignerUse / open / onClose / onDone` | 同名宿主契约：`designerId`（草稿恢复）、`imageUrl`（底图图层）、`isDesignerUse`、`open`、`onClose`、`onDone`（完成回传） | `new-designer.ts` `DesignerHostState` + 单测《宿主状态》组；UI 实测顶部有「关闭」「完成回传」 | ✅ 1:1 |
| 4 | 三栏画布编辑器：左侧素材/图层、中间画布、右侧属性 | 同构三栏：素材与图层 / 画布 / 属性 | UI 实测 DOM：`素材与图层`「1 层」、画布 1200×1200、`属性` 面板 | ✅ 1:1 |
| 5 | 顶部撤销 / 重做 / 预览 / 完成 | 顶部撤销、重做、预览、关闭、完成回传、导出设计稿 | UI 实测按钮 `撤销` `重做` `预览` `关闭` `完成回传`；撤销 → 背景从 `#102030` 回到 `#ffffff` 且字体保留 `宋体` | ✅ 1:1（另加导出） |
| 6 | 图层操作：选择、显隐、锁定、删除、层级调整 | 图层列表：选择、隐藏、锁定、删除、上移一层、下移一层、置顶、置底 | UI 实测按钮 `隐藏 文字 0` `锁定 文字 0` `删除 文字 0` `上移一层` `下移一层` `置顶` `置底` | ✅ 1:1 |
| 7 | 文字图层属性：字体、字号、颜色 | 名称、文案、字号、**字体族（系统默认/黑体/宋体/楷体/等宽）**、颜色 | UI 实测：字体按钮组 `data-testid=designer-font-*`；点「宋体」→ 画布 `font-family: "Songti SC", SimSun, Georgia, serif` | ✅ 等价（字族按本机可渲染系统字体，见 §2-3） |
| 8 | 原站字体接口 `/image/designer/font/list`、`/image/designer/fontStyle/list` | 只实现字族（`font/list` 语义），**字体样式（加粗/描边/阴影等）未实现** | `DESIGNER_FONT_FAMILIES`（5 族，全部系统字体） | ⚠️ 部分（§2-3） |
| 9 | 原站背景接口 `/image/designer/background/list/{id}` + `backgroundClassify/group`（背景素材分类） | **纯色画布背景**（`input[type=color]`） | UI 实测：改 `#102030` → 画布 `rgb(16,32,48)`；导出合成把背景画在最底层（单测《合成器把字体族写进 ctx.font，并把背景色画在最底层》） | ⚠️ 部分（§2-4） |
| 10 | 原站素材接口 `/image/designer/element/list/{id}` + `elementClassify/group`（贴纸/元素库） | 「添加文字」「添加图片」两类图层 | UI 实测按钮 | ⚠️ 部分（§2-2） |
| 11 | 原站模板：`official/list`、`createTemplate`、`editTemplate`、`changeTeamTemplate` | 未实现模板库 | — | ⚠️ 偏差（§2-1） |
| 12 | 原站设计项目管理：`/image/designer/list`、`info`、`edit`、`copy`、`delete` | 以本地草稿（`tool-draft:v1:NEW_DESIGNER`）+ `designerId` 恢复代替服务端项目列表 | UI 实测「已恢复草稿：2026-10-28T16:45:50.261Z（0 个图层）」 | ⚠️ 等价能力不同域（§2-1） |
| 13 | 原站多入口：`/designer?leftType=material`、`?leftType=text&imageUrl=`、`?open=layerExtract`、`?open=textExtract` | 仅 `imageUrl` 底图入口；无左栏预设/图层提取入口 | — | ⚠️ 偏差（§2-5） |
| 14 | （原站结果动作）保存/回传 | 导出设计稿（本地真实合成）→ 入库资产 → 发送画布；字节一致 | `result.json`：`sha256 2ee5aa7b…`、32854 B，画布节点同一 sha256 | ✅ 本站能力对齐 |
| 15 | 画布预设 | 1:1 方形（1200×1200）、3:4 竖版、4:3 横版 | UI 实测按钮 | ✅ 本站能力 |
| 16 | 键盘操作 | 方向键 8px / Shift 32px、`[` `]` 旋转 1°、撤销/重做按钮 | 画布提示条实测文案 | ✅ 本站能力 |

## 2. 偏差（明确记录，不掩盖）

1. **设计项目管理域缺失**：原站有「我的设计 / 我的模板 / 团队空间」列表页与 `designer/list|copy|delete|changeTeamTemplate`；本站没有设计项目后端域，用本地草稿 + `designerId` 恢复覆盖「打开已有设计」这一核心诉求，未新建列表/模板服务。
2. **素材（element）库缺失**：原站 `element/list` 提供贴纸/元素素材；本站仅「添加图片」从本地上传/资产库取图，未做分类素材库（无授权素材，不造假库）。
3. **字体样式缺失**：原站 `fontStyle/list` 提供字体样式；本站只做 5 个系统字族，且**只用本机可渲染字体栈**，不接远端字体库（避免加载失败的字族静默回退）。
4. **背景库缺失**：原站 `background/list` + `backgroundClassify/group` 是背景素材库；本站只做纯色背景。
5. **左栏预设入口缺失**：原站 `/designer?leftType=material|text`、`?open=layerExtract|textExtract` 支持按入口预设左栏与提取动作；本站未做入口预设。
6. **优秀案例**：本轮未取得任何原站优秀案例授权素材，**不做占位画廊**。

## 3. 本轮修复（真实 UI 实测）

| # | 问题 | 根因 | 修复 | 验证 |
|---|---|---|---|---|
| 1 | 切换字体后画布/面板不更新 | `designerDocumentKey()` 生成的文档指纹只含 id/kind/name/src/text/位置尺寸/旋转/透明度/显隐/锁定，**漏掉 `fontSize`/`fontFamily`/`color`**；`commitDesignerDocument()` 据此判定「文档未变」直接返回旧历史，改动被丢弃 | 指纹补齐 `fontSize/fontFamily/color` | 单测《字体/字号/颜色变化都会进入历史栈（不被 key 折叠）》；UI 点「宋体」→ `font-family` 变为 Songti SC |
| 2 | 字体选择器在受控 `<select>` 下点击不生效 | 受控 select 的合成事件路径不稳定 | 改为 5 个分段按钮（带 `aria-pressed` 与 `data-testid=designer-font-<id>`），与站内其他面板一致 | UI 实测 `aria-pressed` 由「系统默认」切到「宋体」 |
| 3 | 文字图层 `fontFamily` 不入文档 | `createTextLayer()` 未透传 `patch.fontFamily` | 补默认值透传（`DEFAULT_DESIGNER_FONT_FAMILY`） | 单测《文字图层带字体族，切换字体递增 revision 且不影响几何》含草稿序列化往返 |
| 4 | 画布背景无控件 | 文档已有 `background` 字段但无 UI | 属性面板加 `input[type=color]`（`data-testid=designer-background`），仅接受 `#RGB`/`#RRGGBB`，非法值不改文档 | UI 实测 `#102030` → 画布 `rgb(16,32,48)`；非法 `red`/`#12` 返回原文档（单测） |

验证命令：`cd web && bun test src/features/tools/adapters/new-designer.test.ts` → 33 pass / 0 fail；`./node_modules/.bin/tsc --noEmit` → 无错误。

## 4. 未完成 / 风险

- 原站编辑器内部真实数据（字体清单、背景素材、模板画廊）未取得登录态数据，表中相关行只做能力级标注，**不能视为内容一致**。
- 上述 §2 的 5 项偏差未修复，属本轮范围外（需设计项目/素材/字体服务后端域）。
