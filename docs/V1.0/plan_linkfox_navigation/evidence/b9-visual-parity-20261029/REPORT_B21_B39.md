# B9 后半 19 工具（registry #21–#39）真实原站对照

> 采集器：`tools/capture_parity.py`（TMWebDriver/CDP，真实登录态 用户6991）
> 证据：`real/<ID>/{shot.jpg,shot-full.jpg,form.json,text.txt}`；清单：`tools/b9_manifest.json`（已补至 39 条）
> 原则：默认值/联动不做静态推断；未取到工作区一律 `UNVERIFIED`，取到但未做点击探针一律 `PARTIAL`。

## 1. 总览

| # | Tool | 真实路由 | ready | 控件/chips | 状态 |
|---|---|---|---|---|---|
| 21 | AI_WEARABLE | /draw/ai-wearable | complete | 14/66 | PARTIAL |
| 22 | AI_TEXT | /home | complete | 41/118 | UNVERIFIED |
| 23 | ORNAMENT_TEXT | /home | complete | 41/118 | UNVERIFIED |
| 24 | SDS_DESIGN | /draw/sds-design | complete | 10/48 | PARTIAL |
| 25 | PRINT_EXTRACT | /draw/print-extract | complete | 12/49 | PARTIAL |
| 26 | AI_POSE_GENERATOR | /draw/ai-posture | complete | 16/67 | PARTIAL |
| 27 | AI_DRESSING_XSY | /draw/ai-dressing | complete | 26/73 | PARTIAL |
| 28 | FISSION_LINK | /draw/product-scene?type=2 | complete | 23/59 | PARTIAL |
| 29 | IMAGE_TEXT_EDIT | /draw/designer | complete | 0/0 | UNVERIFIED |
| 30 | MATERIAL_UPPER_BODY | /draw/clothing-image-suite | complete | 42/105 | PARTIAL |
| 31 | NEW_DESIGNER | /draw/designer-home | complete | 11/28 | PARTIAL |
| 32 | PRODUCT_MARKET_MATERIAL | /draw/product-image-suite?batchType=PRODUCT_MATERIAL | complete | 42/101 | PARTIAL |
| 33 | SCENE_TRANSFER | /draw/ai-draw | complete | 38/67 | PARTIAL |
| 34 | IMAGE_TO_VIDEO | /draw/video | complete | 34/85 | PARTIAL |
| 35 | SALE_VIDEO | /draw/sale-video | complete | 41/77 | PARTIAL |
| 36 | VIDEO_REPLICATION | /draw/video-replication | complete | 32/71 | PARTIAL |
| 37 | AI_VIDEO_EDITING | /draw/ai-video-edit | complete | 18/57 | PARTIAL |
| 38 | VIDEO_TRANSLATION | /draw/video-translation | complete | 12/49 | PARTIAL |
| 39 | VIDEO_CONCAT | /draw/video-concat | complete | 9/50 | PARTIAL |

> 本地侧仅完成 `AI_WEARABLE` / `AI_TEXT` 两次快照后，浏览器驱动会话断开（`会话ID None 未连接`），
> 其余 17 个本地快照**未采集**，故本报告只给真实侧证据，本地逐项差异待补采（见 §4）。

## 2. 采集过程中发现的路由问题（本身就是对照结论）

1. `AI_TEXT` / `ORNAMENT_TEXT`：本账号访问 `/draw/ai-text`、`/draw/ornament-text` 被重定向 `/home` → 权限级不可见。
2. `IMAGE_TEXT_EDIT`：`/draw/designer` = 「页面不存在」；`/draw/designer-home` = 「创建设计（上传商品图 / 模板推荐）」→ 后者才是设计器入口。
3. `SCENE_TRANSFER`：page-spec 给的 `/draw/ai-draw` 实为「AI自由绘图」，侧栏无「场景迁移」入口。
4. `PRODUCT_MARKET_MATERIAL`：`?batchType=PRODUCT_MATERIAL` 被忽略，页面仍是商品套图「多视角白底商品&实拍图」。
5. `MATERIAL_UPPER_BODY`：`/draw/clothing-image-suite` 渲染「多角度服装图&搭配图」，疑非「上装换料」专属页。
6. `SDS_DESIGN` 映射正确：`/draw/sds-design` = 素材贴合（上传素材 / 产品 / 选择颜色 / 立即生成 20算力）。

## 3. 逐工具真实侧证据

### AI_WEARABLE（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/ai-wearable｜ready=complete｜控件 14｜chips 66
- 真实可见文案（去导航）：历史记录 / 上传穿戴商品 / 💡 以模特穿戴效果图作为商品图，会为AI提供更好的作图参考 / 图片规则 / 上传商品图 / 从本地上传 / 从作品库选择 / 从商品库选择
### AI_TEXT（UNVERIFIED）
- 真实 URL：https://www.linkfox.com/home｜ready=complete｜控件 41｜chips 118
- 真实可见文案（去导航）：批量视频 / 从一个想法，到全球爆单 / 自由创作 / 套图 Agent / 视频 Agent / 链接复刻 / 电商 Agent / 添加- 差异/阻塞：权限受限：真实站 /draw/ai-text 重定向到 /home（捕获 bodyText 为首页），无法取得工作区默认值/字段；不猜。
### ORNAMENT_TEXT（UNVERIFIED）
- 真实 URL：https://www.linkfox.com/home｜ready=complete｜控件 41｜chips 118
- 真实可见文案（去导航）：批量视频 / 从一个想法，到全球爆单 / 自由创作 / 套图 Agent / 视频 Agent / 链接复刻 / 电商 Agent / 添加- 差异/阻塞：权限受限：/draw/ornament-text 重定向 /home，同样只有首页文案；不猜。
### SDS_DESIGN（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/sds-design｜ready=complete｜控件 10｜chips 48
- 真实可见文案（去导航）：上传精美素材，一键贴合到商品预览效果，极大提高测款效率 / 上传素材 / 产品 / 选择产品进行素材贴合 / 选择颜色 / 素材操作 / 立即生成 / (20算力)
### PRINT_EXTRACT（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/print-extract｜ready=complete｜控件 12｜chips 49
- 真实可见文案（去导航）：上传需要提取印花的商品图片 / 从本地上传 / 从作品库选择 / 20M以内，分辨率：384 * 384 ~ 4096 * 4096，宽高比小于5 / 或试试这些 / 上传多张图片，开始批量提取 / 生成透明图 / 开启
### AI_POSE_GENERATOR（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/ai-posture｜ready=complete｜控件 16｜chips 67
- 真实可见文案（去导航）：历史记录 / 图片规则 / 拖拽/粘贴 或 上传模特姿势图 / 从本地上传 / 从作品库选择 / 从商品库选择 / 10M以内，384*384 ~ 4096*4096 / 或试试这些
### AI_DRESSING_XSY（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/ai-dressing｜ready=complete｜控件 26｜chips 73
- 真实可见文案（去导航）：历史记录 / 上下装衣服 / 连体衣服 / 图片规则 / 拖拽/粘贴 或 上传上装正面图 / 从本地上传 / 从作品库选择 / 从商品库选择
### FISSION_LINK（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/product-scene?type=2｜ready=complete｜控件 23｜chips 59
- 真实可见文案（去导航）：历史记录 / 上传参考图 / 从本地上传 / 从作品库选择 / 从商品库选择 / 10M以内，分辨率：384*384 ~ 4096*4096，最大宽高比5 / 上传多图，体验新功能商品套图 / 背景相似度：- 差异/阻塞：页面为「场景裂变」（product-scene?type=2），与本地 fission-link（链接裂变）信息架构不同，需按真实页面对齐。
### IMAGE_TEXT_EDIT（UNVERIFIED）
- 真实 URL：https://www.linkfox.com/draw/designer｜ready=complete｜控件 0｜chips 0
- 真实可见文案（去导航）：页面不存在 / 您访问的页面可能已被删除、移动或暂时不可用 / 返回首页- 差异/阻塞：URL 失效：/draw/designer 返回「页面不存在」，需从站内导航重新定位真实路由。
### MATERIAL_UPPER_BODY（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/clothing-image-suite｜ready=complete｜控件 42｜chips 105
- 真实可见文案（去导航）：多角度服装图&搭配图 / 从本地上传 / 从作品库选择 / 从商品库选择 / 最多上传5张图，10M以内，384*384~4096*4096 / 或试试这些 / 商品信息 / AI分析- 差异/阻塞：页面映射存疑：clothing-image-suite 渲染「多角度服装图&搭配图」（服装套图），需确认「上装换料」真实入口。
### NEW_DESIGNER（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/designer-home｜ready=complete｜控件 11｜chips 28
- 真实可见文案（去导航）：创建设计 / 我的设计 / 我的模板 / 团队空间 / 上传商品图 / 或拖拽图片到此处 / 或试试这些 / 模板推荐
### PRODUCT_MARKET_MATERIAL（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/product-image-suite?batchType=PRODUCT_MATERIAL｜ready=complete｜控件 42｜chips 101
- 真实可见文案（去导航）：多视角白底商品&实拍图 / 从本地上传 / 从作品库选择 / 从商品库选择 / 10M以内，384*384 ~ 4096*4096，最大宽高比5 / 商品信息 / AI分析 / 向导- 差异/阻塞：urL 参数未生效：product-image-suite?batchType=PRODUCT_MATERIAL 渲染的仍是「多视角白底商品&实拍图」套图页，batchType 被忽略。
### SCENE_TRANSFER（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/ai-draw｜ready=complete｜控件 38｜chips 67
- 真实可见文案（去导航）：以下内容由LinkFoxAI调用第三方平台生成，使用时请遵守国家法律和有关规定。 / 历史记录 / AI / 请描述要创作的图像,AI 将自动为你生成4张图片。每次生成图片大约需要2分钟。 / 例如：1瓶香水，商业摄影，玻璃镜面，少量水滴的效果，深色干净的背景，正视构图，高级感，不要logo。 / 快速组装咒语 / AI写咒语 / 提取咒语- 差异/阻塞：页面映射存疑：清单 URL /draw/ai-draw 实际是「AI自由绘图」，非场景迁移；需重新定位路由。
### IMAGE_TO_VIDEO（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/video｜ready=complete｜控件 34｜chips 85
- 真实可见文案（去导航）：历史记录 / 参考素材 / 首尾帧 / 商品链接 / 分析 / 或 手动上传参考图 / 图片规则 / 上传参考图
### SALE_VIDEO（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/sale-video｜ready=complete｜控件 41｜chips 77
- 真实可见文案（去导航）：历史记录 / 多视角白底商品&实拍图 / 图片规则 / 上传商品图片 / 支持上传9张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界） / 本地上传 / 作品选择 / 商品库选择
### VIDEO_REPLICATION（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/video-replication｜ready=complete｜控件 32｜chips 71
- 真实可见文案（去导航）：历史记录 / TikTok 视频链接 / 解析 / 或 手动上传参考视频 / 上传参考视频 / 本地上传 / 作品选择 / 支持MP4/MOV格式，100M以内
### AI_VIDEO_EDITING（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/ai-video-edit｜ready=complete｜控件 18｜chips 57
- 真实可见文案（去导航）：历史记录 / 原视频 / 上传需要编辑的视频 / 本地上传 / 作品选择 / 支持MP4/MOV格式，100M以内，时长不低于4秒 / 超长视频可截取30秒以内片段 / 参考图（选填）
### VIDEO_TRANSLATION（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/video-translation｜ready=complete｜控件 12｜chips 49
- 真实可见文案（去导航）：历史记录 / 智能识别源语言，驱动口型与目标语言精准匹配。 / 原视频 / 上传需要翻译的视频 / 本地上传 / 作品选择 / 支持 MP4、MOV 格式，100MB 以内 / 建议上传画面清晰、音频完整的视频（2-30 秒）
### VIDEO_CONCAT（PARTIAL）
- 真实 URL：https://www.linkfox.com/draw/video-concat｜ready=complete｜控件 9｜chips 50
- 真实可见文案（去导航）：历史记录 / 选择视频素材 / 支持选择2~4个视频素材，一键拼接成品视频。 / 视频比例 / 16:9 / 9:16 / 1:1 / 4:3

## 4. 未完成清单（下一班次直接接）

1. **本地快照 17 个**（除 AI_WEARABLE / AI_TEXT）：`python3 tools/capture_parity.py --side local --ids <ID,...>`（驱动重连后执行）。
2. **逐项对照**：真实 form.json vs 本地 form.json 的 字段名/默认值（紫框 rgb(114,60,249)）/枚举/控件类型，产出 `visual-parity.json`。
3. **联动探针**（当前全为 PARTIAL）：分辨率↔品质、生成类型↔张数/排版、多选计数与算力文案。
4. **3 个路由待重新定位**：IMAGE_TEXT_EDIT、SCENE_TRANSFER、MATERIAL_UPPER_BODY（建议从真实站侧栏逐级展开抓 href，一次拿全 39 条）。
5. **AI_TEXT / ORNAMENT_TEXT** 需换有权限账号或向产品确认，否则保持 UNVERIFIED（不得按 spec 猜默认值）。
6. 本地侧栏中多数后半工具仍带「补充」占位标记（`web/src/features/tools/tool-page.tsx:585`），属共享壳，未改。
