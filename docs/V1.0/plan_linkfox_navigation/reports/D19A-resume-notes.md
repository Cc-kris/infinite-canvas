# D19-A 续作笔记（2026-10-29 接续）

## 起点
- 分支 `feat/linkfox-v1-real`，HEAD `55e2cea`（design19 前10工具证据 + 每工具 visual-parity.json，全 PARTIAL/BLOCKED）。
- 剩余清单（见 `D19-design10-visual-parity.md`）：8 个 PARTIAL＝布局未对齐 + 文案缺口 + 交互未实测；2 个 BLOCKED（AI_TEXT/ORNAMENT_TEXT，原站入口失效）。

## 禁区（design B / 共享 shell）
`tool-shell.tsx` / `tool-asset-input.tsx` / `tool-page.tsx` / `outpaint.tsx` / `color-v2.tsx` / `video*`。
→ 本组只动 `src/components/tools/workspaces/<tool>.tsx` 等「工具自有」文件。

## 原站真实蓝图（1908×781，默认未上传态）

### 外壳（原站）
body `#F5F7FA`；顶 nav 60px 白；左侧 180px 白（原站自带工具子导航）；内容区 `#F4F6F8` padding 10px。
→ 本地 main 实际为 `(180,161,1728,620)` padding `16px 20px`（共享 shell 多 41px 标题区、内边距不同）。
   **结论：只对工具工作区做 1:1，高度/宽度由 shell 决定，用 h-full 顶满，差异记 shell 约束。**

### SDS_DESIGN（素材贴合，/draw/sds-design）
- 左主卡 `(190,120,1398,651)` bg `#EDEFF5` 边框 `1px #E8E8E8` 圆角 8 padding `10px 0` flex gap 10
  - 中间上传区 `(191,131,1099,629)` padding `50px 0 0 10px`，内部白卡 **540×444** 圆角 12 padding 20，居中：
    - 演示视频 500×282（品牌素材 → 需替换为同等尺寸中性占位，记 brand_removal）
    - 标题 `素材贴合` 20px `rgba(0,0,0,.85)` 居中 y541 h31
    - 副标题 `上传精美素材，一键贴合到商品预览效果，极大提高测款效率` 16px `#939599` y578 h25
    - 按钮 `上传素材` 108×32 圆角 6 白字（紫色渐变背景）
  - 右参数列 279 宽，flex column gap 10：
    - 产品卡 279×80 bg `#F9F9F9` 圆角 8 padding `10px 20px 10px 10px` gap 10：60×60 缩略图 + `产品` 14px rgba(0,0,0,.6) + `选择产品进行素材贴合` 12px `#9E9E9E`
    - 选择颜色 279×81 padding `10px 16px 0`：标题 `选择颜色` 12px rgba(0,0,0,.3)，色块 32×32（内 24×24 圆）
    - 素材操作 279×69：标题 `素材操作` 12px rgba(0,0,0,.3) + 4 个 20×20 图标（撤销/重做/复位/删除，删除 `#FA5151`）
    - `立即生成 (20算力)` 277×32 紫色圆角 6
- 右结果面板 `(1598,120,300,651)` bg `#EDEFF5` 圆角 8：白 header 42px 内 tab `生成结果`(选中紫 `#723CF9`)/`优秀案例`/`历史记录`，14px padding 10px 0；空态 `暂无生成结果图` + `快在左侧操作素材贴合吧~` 14px rgba(0,0,0,.6)
- 水印面板：`aside` fixed **opacity:0 / w:0**（悬浮抽屉，默认不可见）→ 默认态无需复刻。

### REPLACE_GOODS（商品替换，/draw/product-replacement）
- 左卡 `(190,120,1083,651)` 白底 边框 `1px #E8E8E8` 圆角 8
  - 上区 `(191,121,1081,601)` bg `#EDEFF5` padding 20 flex column 居中：
    - 提示胶囊 `(571,136,322,28)` bg `rgba(114,60,249,.15)` 圆角 39 padding `3px 10px`：`💡 温馨提示：支持上传多张商品图进行批量替换`
    - 白卡 481×481 圆角 12，内含虚线框 447×447（`1px dashed rgba(0,0,0,.16)` 圆角 12）：`商品替换` / `上传参考图，一键替换商品，快来替换您的商品吧~` / `上传参考图`
    - 左下浮按钮 40×40 圆形 `rgba(0,0,0,.3)`
  - 底栏 `(191,722,1081,48)` border-top `3px #F5F7FA` padding `0 16` gap 10，chip 高 28 bg `#F7F7F7` 圆角 6：
    `生成尺寸: 1024x1024` / `参考图场景变化程度： 不变 高` / `生成： 4张` / 按钮 `立即生成 (40算力)` 187×32
- 右结果面板 `(1283,120,615,651)` 同上（tab 生成结果/优秀案例/历史记录；空态 `暂无生成结果图` + `快在左侧合成您的第一张商品图吧`）

## 复用点
- 上传：`uploadToolAsset` / `loadToolAssetRecords`（`@/services/api/tools/assets`）可直接调，不动 `tool-asset-input.tsx`。
- 工具→文件：SDS_DESIGN→`workspaces/pod.tsx`(SdsDesignWorkspace)；REPLACE_GOODS→`workspaces/replace.tsx`。
- 采集/对比：`tools/capture_design19.py`、`tools/dump_containers.py`（本次新增）、`tools/parity_diff.py`。
