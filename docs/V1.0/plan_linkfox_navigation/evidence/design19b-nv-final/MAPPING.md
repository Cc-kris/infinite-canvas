# 原站映射校准（design19b-nv-final）

取证方式：已登录原站（用户6991）逐 URL 抓 `location.href + title + body.innerText`，产物见 `real-map/*.json`。
**修正原则**：按「页面文案/字段」判定对应关系，不按序号；无对应页必须写 N/A，禁止用登录墙页面伪造 DIFF。

| 本地 ID | manifest 旧映射 | 校准后原站页 | 判定依据 | 状态 |
|---|---|---|---|---|
| PRINT_EXTRACT 印花提取 | /draw/print-extract | **/draw/print-extract** | 正文含「印花提取 / 上传需要提取印花的商品图片 / 生成透明图 / 立即生成(10算力)」 | 确认 |
| AI_POSE_GENERATOR AI姿势生成 | /draw/ai-posture | **N/A（原站无对应）** | `/draw/ai-pose`→404；`/draw/ai-posture` 正文为「姿势库/自定义/选择生成张数」，无 prompt 与 scenePrompts 字段，且该页归 #20 AI_POSTURE 姿势裂变 | 确认 |
| AI_DRESSING_XSY AI试衣XSY | /draw/ai-dressing | **/draw/ai-dressing** | 页内 tab：真人换模特/模特换场景/AI穿衣/姿势裂变/AI穿戴；表单「上下装衣服/连体衣服」+ 上装/下装正面图，与 XSY 分步试衣字段（upper/lower/suit + mask）一致 | 确认 |
| FISSION_LINK 场景裂变链接 | /draw/designer-home | **/draw/image-fission** | 「相似图裂变」页：上传参考图 + 原图相似度 + 裂变描述(0/600) + 比例 + 张数，与本地 imageUrl/outputNum 生成链路一致 | 确认 |
| IMAGE_TEXT_EDIT 图片文字编辑 | /draw/designer-home | 待定（疑似 N/A） | `/draw/ai-text` 跳首页；智能修图子导航为 局部重绘/局部消除/一键换色/图片裁剪/质量提升/商品精修/图像修复/色差修复/印花修复/抠图，无文字编辑入口 | 待复核 |
| MATERIAL_UPPER_BODY 上装换料 | /draw/clothing-image-suite | 待定 | 服装套图页无「材质/面料」字段；需查 素材和灵感 组（素材贴合等） | 待复核 |
| NEW_DESIGNER 商品图设计器 | /draw/designer-home | **/draw/designer-home** | 「创建设计/我的设计/我的模板/团队空间」+ 上传商品图 + 模板推荐，即宿主内嵌设计器 | 确认 |
| PRODUCT_MARKET_MATERIAL 商品营销素材 | /draw/product-image-suite?batchType=PRODUCT_MATERIAL | 待定（疑似 /draw/product-image-suite） | 字段 APlusAspectRatio/coverList/brandDNA/platform/salesRegion/language 与套图页「商品信息+品牌与合规+主副图设置+A+图设置」对应；需确认 batchType 参数 | 待复核 |
| SCENE_TRANSFER 场景迁移 | N/A（旧） | 待定（疑似 /draw/product-scene 商品图 tab） | 字段 imageUrl+imageStyleUrl+segImageUrl+similarity 与「上传商品图 + 场景参考图 + 相似度」对应 | 待复核 |
