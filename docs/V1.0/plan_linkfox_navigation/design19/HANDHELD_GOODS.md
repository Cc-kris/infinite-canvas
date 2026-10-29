# HANDHELD_GOODS（手持商品）1:1 对照证据

- 本地：`/tools/product-design/handheld-goods`
- 真站：`https://www.linkfox.com/draw/product-scene?type=2`（design19 前10）
- 基线数据：`evidence/design19-visual-parity-20261029/{real,local}/HANDHELD_GOODS/`
- 测量方式：Playwright(channel=chrome) 1908×781，`getBoundingClientRect` + `getComputedStyle`

## 逐节点对照

| 节点 | 真站基线 | 本地实测（改造后） | 判定 |
|---|---|---|---|
| 工作台容器 | x190 y120 w1708 h651 | x190 y120 w1708 h651 | MATCH |
| 左参数列 | x190 w300，白底 | x190 w300，`bg-white` | MATCH |
| 左列内边距 | 10/12/10/16（内容宽 268） | `pl-4 pr-3 py-[10px]` → 10/12/10/16 | MATCH |
| 左卡标题 | 「手持商品」+ tagline「快速生成手持商品图，快速上架」在左卡内 | 已移入左列首个分区（16px/12px） | MATCH |
| 页签栏 | y120 h42，白底，右栏通宽 | x490 y120 h42 w1408 | MATCH |
| 「生成结果」页签 | 文字 x503 y130，14px，rgb(114,60,249) | 文字 x502 y130，14px，rgb(114,60,249) | MATCH（x 差 1px） |
| 「历史记录」页签 | 右对齐，12px | x1834 右端 1886，12px | MATCH |
| 上传面板 | 268×306，#f7f7f7，radius 8，padding 10；内部虚线框 248×196 | 272×249，#fafafa，radius 6，padding 12；无虚线框 | **PARTIAL（阻塞）** |
| 提交按钮 | 整宽 268×32 渐变 #3A7DF9→#723CF9，文字 14px 白 | 整宽 272×32 同渐变，14px 白 | MATCH（宽随上传卡 4px 差） |
| 页底 dock | 无 | 有（ToolHistoryDock，y1210，h80） | **PARTIAL（阻塞）** |

## 阻塞原因（不可在本文件内修复）

1. **上传面板**由禁区组件 `components/tools/tool-asset-input.tsx` 的 `variant="linkfox"` 渲染，其尺寸/底色/圆角/虚线框写在该文件内 → 需批准修改禁区文件才能对齐。
2. **页底 dock** 由禁区 `features/tools/tool-page.tsx:626` 的 `WORKSPACE_OWN_HISTORY` 名单控制；该集合当前含 PRODUCT_SCENE 但不含 HANDHELD_GOODS → 需在该名单加一行（1 行改动）才能去掉重复的历史面板。

## 本轮已修复项
- `design19-frame.tsx`：按钮类加 Tailwind v4 `!` 修饰符（antd reset 无 layer，`button{margin:0;font-size:inherit;color:inherit}` 覆盖 `@layer utilities`，导致 ml-auto / text-[12px] / text-white 失效）。
- `handheld-goods.tsx`：去掉自套的一层 `ToolShell`（nested 分支会额外渲染 63px 标题行，把工作台推到 y195），标题/tagline 按真站位置移入左列 → 工作台回到 y120。
