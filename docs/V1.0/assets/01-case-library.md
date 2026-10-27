# 资产 01｜官方案例库

> **资产来源**：[`make_cases.json.gz`](../../analysis/assets/linkfox/make_cases.json.gz)
> **应用位置**：黄金样本、工具页示例、A/B 验收基准；实现 `ExampleGallery` 与验收数据集
> **数据范围**：584 条案例，189 条含非空 prompt
> **使用边界**：仅用于复刻开发与内部 A/B 基准；原站图片、模板及文案不直接进入商用资产库。

---

## 怎么用

- 每个工具建立 3–10 条黄金样本：输入图、prompt、比例、输出图、扩展参数同时保存。
- 验收时先比较构图、商品一致性、文字准确性，再比较风格；不能只比较 prompt 文本。
- `prompt` 与 `promptTranslation` 可能一为空一有值，运行时以实际非空字段为准。

## 按工具统计

| type | 工具 | 案例数 | 有 prompt |
|---|---|---:|---:|
| 1 | AI_DRAW / 非39工具 | 45 | 45 |
| 2 | REPLACE_BG / 非39工具 | 0 | 0 |
| 3 | MATTING / 非39工具 | 0 | 0 |
| 4 | MJ_DRAW / 非39工具 | 0 | 0 |
| 5 | SIMILAR / 非39工具 | 28 | 28 |
| 6 | CUTOUT / 非39工具 | 0 | 0 |
| 7 | SCALE_UP / 高清放大 | 0 | 0 |
| 8 | IMG2HD / 非39工具 | 0 | 0 |
| 9 | CHANGEMODEL / 非39工具 | 2 | 0 |
| 10 | CHANGEBG / 非39工具 | 18 | 0 |
| 11 | NEW_REPLACE_BG / 非39工具 | 0 | 0 |
| 12 | REPLACE_GOODS / 换商品 | 33 | 0 |
| 13 | PRODUCT_SCENE / 商品场景图 | 34 | 33 |
| 14 | AI_TEXT / AI文字 | 0 | 0 |
| 15 | CHANGEMANNEQUIN / 非39工具 | 25 | 0 |
| 16 | MATERIAL_UPPER_BODY / 上装换料 | 0 | 0 |
| 17 | ORNAMENT_TEXT / 装饰文字 | 0 | 0 |
| 18 | AI_DRESSING / 非39工具 | 0 | 0 |
| 19 | CHANGE_COLOR / 套图换色 | 35 | 0 |
| 20 | SHADOW_MERGE / 非39工具 | 0 | 0 |
| 21 | ORIGINAL_RESOLUTION / 非39工具 | 0 | 0 |
| 22 | SDS_DESIGN / SDS设计 | 18 | 0 |
| 23 | REMOVE_PEN / 消除笔 | 0 | 0 |
| 24 | AI_DRESSING_V2 / AI试衣V2 | 18 | 0 |
| 25 | AI_OUTPAINTING / 智能扩图 | 24 | 0 |
| 26 | FIX_COLOR / 修复色差 | 0 | 0 |
| 28 | NEW_REPLACE_BG_V2 / 换背景V2 | 0 | 0 |
| 29 | PRINTING_REPAIR / 印花修复 | 0 | 0 |
| 30 | IMAGE_TO_VIDEO / 图生视频 | 10 | 0 |
| 31 | HAND_REPAIR / 手部修复 | 0 | 0 |
| 32 | AREA_REPAIR / 局部重绘 | 0 | 0 |
| 34 | AI_WEARABLE / AI穿戴 | 22 | 0 |
| 35 | AI_CHANGEMODEL / 非39工具 | 39 | 0 |
| 39 | AI_DRESSING_XSY / AI试衣XSY | 0 | 0 |
| 45 | IMAGE_TRANSLATION / 图片翻译 | 0 | 0 |
| 49 | HANDHELD_GOODS / 手持商品 | 1 | 0 |
| 52 | VIDEO_CONCAT / 视频拼接 | 0 | 0 |
| 53 | BM_SIMILAR / 非39工具 | 0 | 0 |
| 54 | IMPROVED_IMAGE_QUALITY / 非39工具 | 0 | 0 |
| 55 | IMAGE_FISSION / 非39工具 | 0 | 0 |
| 56 | PRODUCT_REFINE / 商品精修 | 0 | 0 |
| 57 | AI_POSE_GENERATOR / AI姿势生成 | 0 | 0 |
| 58 | AI_POSTURE / AI摆姿 | 1 | 1 |
| 59 | REMOVE_LOGO / 非39工具 | 0 | 0 |
| 60 | PRINT_EXTRACT / 印花提取 | 0 | 0 |
| 61 | SMART_REPAIR / 非39工具 | 61 | 61 |
| 62 | MULTI_IMAGE_FUSION / 非39工具 | 5 | 5 |
| 63 | SCENE_TRANSFER / 场景迁移 | 0 | 0 |
| 64 | PRODUCT_MARKET_MATERIAL / 爆款图复刻 | 0 | 0 |
| 65 | AUTO_DRESSING / 非39工具 | 0 | 0 |
| 66 | BM_PRINT_EXTRACT / 非39工具 | 0 | 0 |
| 67 | IMAGE_CROP / 图片裁剪 | 0 | 0 |
| 68 | IMAGE_TEXT_EXTRACT / 非39工具 | 0 | 0 |
| 69 | DRESS_WEAR_SET / 穿搭套装 | 51 | 0 |
| 70 | NEW_CHANGEBG / 非39工具 | 11 | 0 |
| 71 | PRODUCT_IMAGE_SUITE / 商品套图 | 42 | 0 |
| 73 | SALE_VIDEO / 带货视频 | 10 | 0 |
| 74 | IMAGE_LAYER_EDIT / 非39工具 | 0 | 0 |
| 76 | MOLI_VIDEO_EDIT / 非39工具 | 0 | 0 |
| 78 | IMAGE_TEXT_EDIT / 图片文字编辑 | 0 | 0 |
| 83 | FISSION_LINK / 场景裂变 | 0 | 0 |
| 85 | REPLICATE_LINK / 非39工具 | 0 | 0 |
| 86 | AGENTOS_IMAGE_GEN / 非39工具 | 0 | 0 |
| 87 | AGENTOS_VIDEO_GEN / 非39工具 | 0 | 0 |
| 88 | IMAGE_REPLICATION / 非39工具 | 14 | 0 |
| 89 | VIDEO_REPLICATION / 视频复刻 | 8 | 8 |
| 91 | PRODUCT_LIBRARY_MATERIAL / 非39工具 | 0 | 0 |
| 92 | PRODUCT_LIBRARY_WEAR / 非39工具 | 0 | 0 |
| 93 | CHANGE_COLOR_V2 / 套图换色V2 | 13 | 0 |
| 95 | AI_VIDEO_EDITING / AI视频剪辑 | 8 | 8 |
| 96 | VIDEO_TRANSLATION / 视频翻译 | 8 | 0 |
| 97 | BATCH_IMAGE_EDIT / 非39工具 | 0 | 0 |
| 99 | NEW_DESIGNER / 商品图设计 | 0 | 0 |
| 100 | AGENT_DESIGN / 非39工具 | 0 | 0 |
| 101 | AGENT_DESIGN_MULTI / 非39工具 | 0 | 0 |
| 102 | AGENT_CLOTH_COLLECTION / 非39工具 | 0 | 0 |
| 103 | AGENT_PRODUCT_COLLECTION / 非39工具 | 0 | 0 |
| 106 | BATCH_GENERATE_VIDEOS / 非39工具 | 0 | 0 |
| 201 | VIDEO_PUBLISH / 非39工具 | 0 | 0 |

## 全部案例索引

| # | type / 工具 | 案例 ID | 样式 | 比例 | 输入/封面 | 主结果 | prompt |
|---:|---|---|---|---:|---|---|---|
| 1 | 1 AI_DRAW | 1744313326904590336 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313326904590336/main_result_46dd0861056642c3a7797f400457677c.jpeg) | 有 |
| 2 | 1 AI_DRAW | 1744314565155405824 | 人物素材 | 1.777777 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314565155405824/main_result.jpeg) | 有 |
| 3 | 1 AI_DRAW | 1744314498952511488 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314498952511488/main_result.jpeg) | 有 |
| 4 | 1 AI_DRAW | 1744314450353111040 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314450353111040/main_result.jpeg) | 有 |
| 5 | 1 AI_DRAW | 1744314377649045504 | 人物素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314377649045504/main_result.jpeg) | 有 |
| 6 | 1 AI_DRAW | 1744314311509065728 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314311509065728/main_result.jpeg) | 有 |
| 7 | 1 AI_DRAW | 1744314230131179520 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314230131179520/main_result.jpeg) | 有 |
| 8 | 1 AI_DRAW | 1744314140729589760 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314140729589760/main_result.jpeg) | 有 |
| 9 | 1 AI_DRAW | 1744314058621894656 | 像素插画 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314058621894656/main_result.jpeg) | 有 |
| 10 | 1 AI_DRAW | 1744313980582674432 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313980582674432/main_result.jpeg) | 有 |
| 11 | 1 AI_DRAW | 1744313777561583616 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313777561583616/main_result.jpeg) | 有 |
| 12 | 1 AI_DRAW | 1744313681214226432 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313681214226432/main_result.jpeg) | 有 |
| 13 | 1 AI_DRAW | 1744313616617750528 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313616617750528/main_result.jpeg) | 有 |
| 14 | 1 AI_DRAW | 1744313423092563968 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313423092563968/main_result.jpeg) | 有 |
| 15 | 1 AI_DRAW | 1744313252543774720 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313252543774720/main_result.jpeg) | 有 |
| 16 | 1 AI_DRAW | 1744313215168331776 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313215168331776/main_result.jpeg) | 有 |
| 17 | 1 AI_DRAW | 1744313174504554496 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313174504554496/main_result.jpeg) | 有 |
| 18 | 1 AI_DRAW | 1744313126085509120 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313126085509120/main_result.jpeg) | 有 |
| 19 | 1 AI_DRAW | 1744313074420072448 | 场景素材 | 0.5625 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313074420072448/main_result.jpeg) | 有 |
| 20 | 1 AI_DRAW | 1744312974692106240 | 宫崎骏 | 0.5625 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312974692106240/main_result.jpeg) | 有 |
| 21 | 1 AI_DRAW | 1744312849538269184 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312849538269184/main_result.jpeg) | 有 |
| 22 | 1 AI_DRAW | 1744312776779677696 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312776779677696/main_result.jpeg) | 有 |
| 23 | 1 AI_DRAW | 1744312569732055040 | 人物素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312569732055040/main_result.jpeg) | 有 |
| 24 | 1 AI_DRAW | 1743154520449355776 | 人物素材 | 1.777777 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743154520449355776/main_result_99c0598b6f594d7cba238bd2c5bdae04.jpeg) | 有 |
| 25 | 1 AI_DRAW | 1743149634257162240 | 人物素材 | 1.777777 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743149634257162240/main_result_65cc76b34ef64c579d89e0b2893f7dfb.jpeg) | 有 |
| 26 | 1 AI_DRAW | 1743148624159707136 | 人物素材 | 1.777777 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743148624159707136/main_result_9c89f6ca9a974916bcad1e54206f1452.jpeg) | 有 |
| 27 | 1 AI_DRAW | 1743146644775374848 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743146644775374848/main_result_187a8c5344134ab2add6da282850f9ef.jpeg) | 有 |
| 28 | 1 AI_DRAW | 1743146596696068096 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743146596696068096/main_result_0c0e889a65f34017ad6c1db89a3da9c4.jpeg) | 有 |
| 29 | 1 AI_DRAW | 1742830918644199424 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742830918644199424/main_result_13c93fd10e184a4ebb27385244953140.jpeg) | 有 |
| 30 | 1 AI_DRAW | 1742485401196228608 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742485401196228608/main_result_c7b48619baac42c6bebf67095bcadd89.jpeg) | 有 |
| 31 | 1 AI_DRAW | 1742485343096729600 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742485343096729600/main_result_467c4666d2d34d6295ec483d92a575cc.jpeg) | 有 |
| 32 | 1 AI_DRAW | 1742485229540143104 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742485229540143104/main_result_565995f57cdd4e82ae0fcf2a40a9a216.jpeg) | 有 |
| 33 | 1 AI_DRAW | 1742388453403582464 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388453403582464/main_result_d143bdf82b5142ea80d589b9e2a47bf7.jpeg) | 有 |
| 34 | 1 AI_DRAW | 1742388430062280704 | 人物素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388430062280704/main_result_09143889748f4e0cb01d619582d06b57.jpeg) | 有 |
| 35 | 1 AI_DRAW | 1742388410583932928 | 人物素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388410583932928/main_result_6f98d4d6cbfd498585c1d66c889f014d.jpeg) | 有 |
| 36 | 1 AI_DRAW | 1742388388677083136 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388388677083136/main_result_24e83ef5437142a28f9ed215af7869ff.jpeg) | 有 |
| 37 | 1 AI_DRAW | 1742388233030656000 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388233030656000/main_result_2b86b0c96af54cf8b43356c8f7fc710d.jpeg) | 有 |
| 38 | 1 AI_DRAW | 1740557627646332928 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740557627646332928/main_result_76c45c59e5c24f88bbb3add88fd8c62d.jpeg) | 有 |
| 39 | 1 AI_DRAW | 1740557570440220672 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740557570440220672/main_result_62dcb35937614d958d5cc8bb8739fbc9.jpeg) | 有 |
| 40 | 1 AI_DRAW | 1740549176220241920 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740549176220241920/main_result_674479193d204043b47fa1dd1ba33a74.jpeg) | 有 |
| 41 | 1 AI_DRAW | 1740538477507039232 | 场景素材 | 1.777777 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740538477507039232/main_result_aa5486e6bde0411595854356aa8c8c67.jpeg) | 有 |
| 42 | 1 AI_DRAW | 1740538392618520576 | 人物素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740538392618520576/main_result_a37f5b161b6d4ed2a33d1aac51239aa1.jpeg) | 有 |
| 43 | 1 AI_DRAW | 1740372087273738240 | 场景素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740372087273738240/main_result_8434ea8c906d4da98ead364d6fd0efef.jpeg) | 有 |
| 44 | 1 AI_DRAW | 1740338346157461504 | 场景素材 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740338346157461504/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740338346157461504/main_result_54f5592dfc8f43818cfe18878a3e83a6.jpeg) | 有 |
| 45 | 1 AI_DRAW | 1740338229127991296 | 人物素材 | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740338229127991296/main_result_b1e0e3b9161a478e81771b684a7fcb51.jpeg) | 有 |
| 46 | 5 SIMILAR | 1740557714699112448 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557714699112448/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557714699112448/main_result_d8ee7f6ed0e641a190249938afb8b59b.jpg) | 有 |
| 47 | 5 SIMILAR | 1742485520448679936 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485520448679936/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485520448679936/main_result_58ef0bc6fc924d308754f45449f1d6d4.jpg) | 有 |
| 48 | 5 SIMILAR | 1740557769019543552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557769019543552/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557769019543552/main_result_0ff39f24f6304b78b8f4e4a507935fb2.jpg) | 有 |
| 49 | 5 SIMILAR | 1744316421659213824 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316421659213824/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316421659213824/main_result.jpg) | 有 |
| 50 | 5 SIMILAR | 1744316337966071808 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316337966071808/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316337966071808/main_result.jpg) | 有 |
| 51 | 5 SIMILAR | 1744316252918169600 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316252918169600/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316252918169600/main_result.jpg) | 有 |
| 52 | 5 SIMILAR | 1744316071959117824 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316071959117824/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316071959117824/main_result.jpg) | 有 |
| 53 | 5 SIMILAR | 1744315980753977344 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315980753977344/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315980753977344/main_result.jpg) | 有 |
| 54 | 5 SIMILAR | 1744315929956761600 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315929956761600/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315929956761600/main_result.jpg) | 有 |
| 55 | 5 SIMILAR | 1744315861593800704 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315861593800704/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315861593800704/main_result.jpg) | 有 |
| 56 | 5 SIMILAR | 1744315767037411328 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315767037411328/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315767037411328/main_result.jpg) | 有 |
| 57 | 5 SIMILAR | 1744315714084323328 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315714084323328/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315714084323328/main_result.jpg) | 有 |
| 58 | 5 SIMILAR | 1744315551706038272 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315551706038272/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315551706038272/main_result.jpg) | 有 |
| 59 | 5 SIMILAR | 1744315500074156032 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315500074156032/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315500074156032/main_result.jpg) | 有 |
| 60 | 5 SIMILAR | 1744315416821415936 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315416821415936/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315416821415936/main_result.jpg) | 有 |
| 61 | 5 SIMILAR | 1744315353101549568 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315353101549568/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315353101549568/main_result.jpg) | 有 |
| 62 | 5 SIMILAR | 1744315308377686016 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315308377686016/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315308377686016/main_result.jpg) | 有 |
| 63 | 5 SIMILAR | 1744315151930146816 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315151930146816/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315151930146816/main_result.jpg) | 有 |
| 64 | 5 SIMILAR | 1744315041628340224 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315041628340224/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315041628340224/main_result.jpg) | 有 |
| 65 | 5 SIMILAR | 1743144720827158528 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1743144720827158528/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1743144720827158528/main_result_6596029e02464fc085159984acd1ad6f.jpg) | 有 |
| 66 | 5 SIMILAR | 1742485620877094912 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485620877094912/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485620877094912/main_result_3ede90b8368847d4a5b86f3fe9ceda62.jpg) | 有 |
| 67 | 5 SIMILAR | 1740549831500550144 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549831500550144/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549831500550144/main_result_e69a346107414e229995dba583e28a00.jpg) | 有 |
| 68 | 5 SIMILAR | 1740549445561667584 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549445561667584/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549445561667584/main_result_1bf16f9b682848759f75da27ea730c15.jpg) | 有 |
| 69 | 5 SIMILAR | 1740538628992716800 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538628992716800/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538628992716800/main_result_9bc6ea0b861b4309bd4a69af6856d080.jpg) | 有 |
| 70 | 5 SIMILAR | 1740538549976223744 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538549976223744/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538549976223744/main_result_cb8ce771114a477885cb7cf9b8bf9454.jpg) | 有 |
| 71 | 5 SIMILAR | 1740372217704009728 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740372217704009728/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740372217704009728/main_result_aa4ce1fc31084b9e9685873703f0f209.jpg) | 有 |
| 72 | 5 SIMILAR | 1740338007375138816 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740338007375138816/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740338007375138816/main_result_cb48eecda9da4783a30771475ebb757f.jpg) | 有 |
| 73 | 5 SIMILAR | 1740337913523392512 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740337913523392512/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740337913523392512/main_result_5d77543ef07c4206868894e79fce53cb.jpg) | 有 |
| 74 | 9 CHANGEMODEL | 1937703451323203584 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL/1937703451323203584/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL/1937703451323203584/main_result_d292b013eb074b6b9ff5a008bdbcff21.webp) | — |
| 75 | 9 CHANGEMODEL | 1804074490163609600 | model_52 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL/1804074490163609600/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL/1804074490163609600/main_result_b4209150ed864291bff91a47e59c368f.png) | — |
| 76 | 10 CHANGEBG | 2000395856347267072 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/2000395856347267072/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/2000395856347267072/main_result_5c6eecf80a72426e9d2741abdc79d454.webp) | — |
| 77 | 10 CHANGEBG | 1999437626431373312 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999437626431373312/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999437626431373312/main_result_a5553397d5a849f09693c20268cef182.webp) | — |
| 78 | 10 CHANGEBG | 1983376970924843008 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983376970924843008/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983376970924843008/main_result_461ef980763f4c43a6769d3cff8ea500.webp) | — |
| 79 | 10 CHANGEBG | 1982006192098914304 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982006192098914304/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982006192098914304/main_result_86914b8f47284702beec3637edc8e961.webp) | — |
| 80 | 10 CHANGEBG | 1999089050379485184 | 花园 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999089050379485184/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999089050379485184/main_result_558a31a0bde64f47825830408113b017.webp) | — |
| 81 | 10 CHANGEBG | 1999089117161193472 | 雪山 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999089117161193472/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999089117161193472/main_result_30834c581ba543c2bdf83acdd27b4a3c.webp) | — |
| 82 | 10 CHANGEBG | 1999088967244185600 | 公园 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999088967244185600/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1999088967244185600/main_result_5edae72b2d9046f29d1de7a69ba97b62.webp) | — |
| 83 | 10 CHANGEBG | 1983374887244947456 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983374887244947456/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983374887244947456/main_result_1c18db310a6846a48bfde0077a9d0c33.webp) | — |
| 84 | 10 CHANGEBG | 1983374672148455424 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983374672148455424/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983374672148455424/main_result_e6d3fd62af584eec8828c0713828a419.webp) | — |
| 85 | 10 CHANGEBG | 1983372380804374528 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983372380804374528/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983372380804374528/main_result_a6c79d4ce0164f72beef671d461faff8.webp) | — |
| 86 | 10 CHANGEBG | 1983372037357985792 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983372037357985792/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1983372037357985792/main_result_368d22dcce6341de8eb03e59c3df42d5.webp) | — |
| 87 | 10 CHANGEBG | 1982010086526955520 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982010086526955520/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982010086526955520/main_result_4ea5b1aa989542a584b4437b0767865c.webp) | — |
| 88 | 10 CHANGEBG | 1982009737489559552 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009737489559552/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009737489559552/main_result_a63ff37590774aba9946c7dcb235bd4f.webp) | — |
| 89 | 10 CHANGEBG | 1982009637572849664 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009637572849664/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009637572849664/main_result_c902a9b90ac94d5cab00251c9d039e56.webp) | — |
| 90 | 10 CHANGEBG | 1982009397058875392 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009397058875392/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009397058875392/main_result_10939a0c04874b13bd6a0f382fd2fb87.webp) | — |
| 91 | 10 CHANGEBG | 1982009117785337856 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009117785337856/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1982009117785337856/main_result_99264024f2c848de935a570f08b5780f.webp) | — |
| 92 | 10 CHANGEBG | 1744311525128060928 | (handsome),(malemodel),(Champs-Elysées),(street),(flowerbed:1.3),(shops:1.2),(flowers:1.2),(greenleaves:1.2),(balcony),(outdoor),(realistic,photo-realistic:1.2),(mediumshot),(naturallight) | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1744311525128060928/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1744311525128060928/main_result_e5f02c383f1142458bfa6dc2938aa626.png) | — |
| 93 | 10 CHANGEBG | 1815590966007676928 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1815590966007676928/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE/1815590966007676928/main_result_259c7d69450f405ab5166ca2948f4392.png) | — |
| 94 | 12 REPLACE_GOODS | 1986723360895819776 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986723360895819776/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986723360895819776/main_result_09fe124342e743d0a26adb5f13b90a53.webp) | — |
| 95 | 12 REPLACE_GOODS | 1986723541208948736 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986723541208948736/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986723541208948736/main_result_60329bf0eaac4f109054f1c6fd460261.webp) | — |
| 96 | 12 REPLACE_GOODS | 1986723614667988992 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986723614667988992/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986723614667988992/main_result_342b4b1ee6674c3c9a5e8252e5dd6c83.webp) | — |
| 97 | 12 REPLACE_GOODS | 1986724130009538560 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986724130009538560/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1986724130009538560/main_result_230aa01cd2514881aca1167556e66af1.webp) | — |
| 98 | 12 REPLACE_GOODS | 1981997494957912064 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981997494957912064/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981997494957912064/main_result_9b02858a923642d783b059e652352206.webp) | — |
| 99 | 12 REPLACE_GOODS | 1981995403757629440 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981995403757629440/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981995403757629440/main_result_47a01b9fe0f44d2cb8c91c7d675d948b.webp) | — |
| 100 | 12 REPLACE_GOODS | 1981995240955719680 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981995240955719680/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981995240955719680/main_result_91a88563329647ed80ec62a367b42ee1.webp) | — |
| 101 | 12 REPLACE_GOODS | 1981995116275838976 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981995116275838976/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981995116275838976/main_result_08800b3ae5294cb7b7e5e2d3a09e917f.webp) | — |
| 102 | 12 REPLACE_GOODS | 1981994832040439808 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981994832040439808/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981994832040439808/main_result_9bde12bba48a401395e79125bc02c1d7.webp) | — |
| 103 | 12 REPLACE_GOODS | 1981993776455757824 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993776455757824/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993776455757824/main_result_e36a156df3af4e54b37603738266d934.webp) | — |
| 104 | 12 REPLACE_GOODS | 1981993547727777792 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993547727777792/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993547727777792/main_result_10a2ded4ca56493f98419e9c8625d91c.webp) | — |
| 105 | 12 REPLACE_GOODS | 1981993253358940160 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993253358940160/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993253358940160/main_result_8bb60a24af8b45a09cf382644895827a.webp) | — |
| 106 | 12 REPLACE_GOODS | 1981993022647054336 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993022647054336/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1981993022647054336/main_result_9c76838f6f3945efb9df903abca5068a.webp) | — |
| 107 | 12 REPLACE_GOODS | 1795286191198420992 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286191198420992/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286191198420992/main_result_b5e5acfed644469da6e81877e4b9476f.png) | — |
| 108 | 12 REPLACE_GOODS | 1795286137662324736 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286137662324736/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286137662324736/main_result_e288599a5b344abf994298d165fecb4f.png) | — |
| 109 | 12 REPLACE_GOODS | 1795286300254519296 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286300254519296/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286300254519296/main_result_f21c31251a4c449c8fff2eda54dd45d7.png) | — |
| 110 | 12 REPLACE_GOODS | 1795286280528707584 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286280528707584/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286280528707584/main_result_024fd09255fb40f4b0ac7cc8c2e6c080.png) | — |
| 111 | 12 REPLACE_GOODS | 1795286262690332672 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286262690332672/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286262690332672/main_result_0d04cea354764bf8b6c1d39d5cf09381.png) | — |
| 112 | 12 REPLACE_GOODS | 1795286241811087360 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286241811087360/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286241811087360/main_result_429e3c79c83f40029b93b58cd0638987.png) | — |
| 113 | 12 REPLACE_GOODS | 1795286220961202176 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286220961202176/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286220961202176/main_result_c1443a6b2c054bb69370dbc64e50a87c.png) | — |
| 114 | 12 REPLACE_GOODS | 1795286173519429632 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286173519429632/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286173519429632/main_result_732facfd932a4ef4a97379499c43f24d.png) | — |
| 115 | 12 REPLACE_GOODS | 1795286153982361600 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286153982361600/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286153982361600/main_result_4e30c2cdd47648238a0b0f92505469c0.png) | — |
| 116 | 12 REPLACE_GOODS | 1795286113083703296 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286113083703296/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286113083703296/main_result_1e3e1201fa644522b0093c37a5b9c59f.png) | — |
| 117 | 12 REPLACE_GOODS | 1795286094616182784 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286094616182784/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286094616182784/main_result_66bdf089292b4649ac73c634ad3ce6c4.png) | — |
| 118 | 12 REPLACE_GOODS | 1795286074517078016 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286074517078016/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286074517078016/main_result_102e9a8e468546e59276865d0751822a.png) | — |
| 119 | 12 REPLACE_GOODS | 1795286051825893376 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286051825893376/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286051825893376/main_result_cceb3ad3d8a34cae9f156e190ef30380.png) | — |
| 120 | 12 REPLACE_GOODS | 1795286035942064128 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286035942064128/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286035942064128/main_result_2511465c638a444eae21915381131e3b.png) | — |
| 121 | 12 REPLACE_GOODS | 1795286017755561984 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286017755561984/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795286017755561984/main_result_7e43766f2cc04515940c23d0a80e9bca.png) | — |
| 122 | 12 REPLACE_GOODS | 1795285997027311616 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285997027311616/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285997027311616/main_result_e0407200a0ee4c68a3fe4cba6cc410b3.png) | — |
| 123 | 12 REPLACE_GOODS | 1795285980300427264 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285980300427264/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285980300427264/main_result_4066008587ff43b594f7d2249830d753.png) | — |
| 124 | 12 REPLACE_GOODS | 1795285955860217856 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285955860217856/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285955860217856/main_result_991636b72b164fbf908779fb43097406.png) | — |
| 125 | 12 REPLACE_GOODS | 1795285930115579904 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285930115579904/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285930115579904/main_result_787911a1ac634b72af3065fd6a1b2842.png) | — |
| 126 | 12 REPLACE_GOODS | 1795285873236623360 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285873236623360/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SHOP_REPLACE/1795285873236623360/main_result_df46a11860e5444a807288ffdd660230.png) | — |
| 127 | 13 PRODUCT_SCENE | 1983831220118597632 | — | 1.3333 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831220118597632/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831220118597632/main_result_c70e756458aa492fb8dae1a0cebaddc8.webp) | 有 |
| 128 | 13 PRODUCT_SCENE | 1984091344636719104 | — | 1.4993 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984091344636719104/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984091344636719104/main_result_90459da3467a4800ba42113404905442.webp) | 有 |
| 129 | 13 PRODUCT_SCENE | 1740339005955035136 | — | 0.6733 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339005955035136/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339005955035136/main_result_bb0efd63b20542ee80bf4c46f4e08f2a.png) | 有 |
| 130 | 13 PRODUCT_SCENE | 1740552538122670080 | — | 0.9846 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552538122670080/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552538122670080/main_result_94f042cb4b3244679baeeff1582eef40.png) | 有 |
| 131 | 13 PRODUCT_SCENE | 1740537621810302976 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740537621810302976/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740537621810302976/main_result_89dd7e7aa3184bd7a49da33de3f80dc2.png) | 有 |
| 132 | 13 PRODUCT_SCENE | 1740552324171223040 | — | 0.7037 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552324171223040/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552324171223040/main_result_49df618ca3834e0e9354ac14f96a311e.png) | 有 |
| 133 | 13 PRODUCT_SCENE | 1984090628450922496 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090628450922496/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090628450922496/main_result_34af6bf2f2524feab10161860ac020b5.webp) | 有 |
| 134 | 13 PRODUCT_SCENE | 1984090535073132544 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090535073132544/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090535073132544/main_result_e2f5a8223a614cb9beada02999222036.webp) | 有 |
| 135 | 13 PRODUCT_SCENE | 1984090429255036928 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090429255036928/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090429255036928/main_result_8128dbe0df6147939c3c6c5e1e1b3345.webp) | 有 |
| 136 | 13 PRODUCT_SCENE | 1983846127195107328 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983846127195107328/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983846127195107328/main_result_a177d60d523a473bb908361d2f049eca.webp) | 有 |
| 137 | 13 PRODUCT_SCENE | 1983831377144950784 | — | 1.3333 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831377144950784/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831377144950784/main_result_0cb89ae460014605b800b028b74d2d2e.webp) | 有 |
| 138 | 13 PRODUCT_SCENE | 1983831155903803392 | — | 1.3333 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831155903803392/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831155903803392/main_result_5e0c454587f94b57b6368ad13328d45d.webp) | 有 |
| 139 | 13 PRODUCT_SCENE | 1983831102560645120 | — | 1.3333 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831102560645120/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831102560645120/main_result_a6d57cdf16244185ab20cc68c4fa7dfe.webp) | 有 |
| 140 | 13 PRODUCT_SCENE | 1983805839680450560 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983805839680450560/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983805839680450560/main_result_d7259032142e462a923a239c1b535b43.webp) | 有 |
| 141 | 13 PRODUCT_SCENE | 1983780547578540032 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780547578540032/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780547578540032/main_result_f7ead3c55f4c4789b25ec055f9234d69.webp) | 有 |
| 142 | 13 PRODUCT_SCENE | 1983780450664951808 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780450664951808/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780450664951808/main_result_372af6f6db9d45b39460f9210cb749f2.webp) | 有 |
| 143 | 13 PRODUCT_SCENE | 1983779885243412480 | — | 1.4993 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983779885243412480/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983779885243412480/main_result_537615aa78a54b5d941db507ff9484ac.webp) | 有 |
| 144 | 13 PRODUCT_SCENE | 1983037133948858368 | — | 0.6667 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983037133948858368/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983037133948858368/main_result_72fed3bf4fbb49e18035b16476785580.webp) | 有 |
| 145 | 13 PRODUCT_SCENE | 1982733693691506688 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982733693691506688/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982733693691506688/main_result_883c9a08957a4be99f093e75903c3acb.webp) | 有 |
| 146 | 13 PRODUCT_SCENE | 1982003556029181952 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982003556029181952/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982003556029181952/main_result_7ae131da2c2d428e8d81fbca9d13c9e3.webp) | 有 |
| 147 | 13 PRODUCT_SCENE | 1982002493309988864 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982002493309988864/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982002493309988864/main_result_f3ceb5168ba54b95a9ed21d455b314f3.webp) | 有 |
| 148 | 13 PRODUCT_SCENE | 1982001967805640704 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001967805640704/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001967805640704/main_result_b2c77cfb5a6d4e1caa19c738da374a0a.webp) | 有 |
| 149 | 13 PRODUCT_SCENE | 1982001810284359680 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001810284359680/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001810284359680/main_result_07ecdf7256a94ebb8816e3a712bd9968.webp) | 有 |
| 150 | 13 PRODUCT_SCENE | 1982001585113149440 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001585113149440/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001585113149440/main_result_df481473d2fe4cd588756e554453140d.webp) | 有 |
| 151 | 13 PRODUCT_SCENE | 1982001152613298176 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001152613298176/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001152613298176/main_result_a00f4f4702164296ad2a64bec1cc48f8.webp) | 有 |
| 152 | 13 PRODUCT_SCENE | 1982000418102587392 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000418102587392/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000418102587392/main_result_2f3053a740ae4bccb21ca04432eec31c.webp) | 有 |
| 153 | 13 PRODUCT_SCENE | 1982000205027749888 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000205027749888/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000205027749888/main_result_410d2c3409f946bebcec3cf226cbd36a.webp) | 有 |
| 154 | 13 PRODUCT_SCENE | 1981999652193316864 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1981999652193316864/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1981999652193316864/main_result_6f94f971dd4f4d93a885d18a641fae86.webp) | 有 |
| 155 | 13 PRODUCT_SCENE | 1744309222887178240 | — | 0.6667 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744309222887178240/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744309222887178240/main_result.png) | 有 |
| 156 | 13 PRODUCT_SCENE | 1744309067387551744 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744309067387551744/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744309067387551744/main_result.png) | — |
| 157 | 13 PRODUCT_SCENE | 1744308153788448768 | — | 0.5 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308153788448768/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308153788448768/main_result.png) | 有 |
| 158 | 13 PRODUCT_SCENE | 1744308017892999168 | — | 0.6186 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308017892999168/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308017892999168/main_result.png) | 有 |
| 159 | 13 PRODUCT_SCENE | 1743099341919940608 | — | 0.6667 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1743099341919940608/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1743099341919940608/main_result_4b741e9e50de453fa5c55c95ef976155.png) | 有 |
| 160 | 13 PRODUCT_SCENE | 1740339046786584576 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339046786584576/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339046786584576/main_result_1048c2a96adb4027a220ba5d53729e4b.png) | 有 |
| 161 | 15 CHANGEMANNEQUIN | 1986722042898702336 | model_53 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722042898702336/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722042898702336/main_result_74126bafc0774d30ae3e1127064adb02.webp) | — |
| 162 | 15 CHANGEMANNEQUIN | 1986722157004742656 | model_2 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722157004742656/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722157004742656/main_result_5090fefffd6146a09a4e45fbff09d708.webp) | — |
| 163 | 15 CHANGEMANNEQUIN | 1986722763408826368 | model_53 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722763408826368/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722763408826368/main_result_135cfd2748cf41579a072ede4af025d3.webp) | — |
| 164 | 15 CHANGEMANNEQUIN | 1986722879632990208 | model_49 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722879632990208/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1986722879632990208/main_result_e5db9021780a44ecaff5a7cd6d3beea7.webp) | — |
| 165 | 15 CHANGEMANNEQUIN | 1981992349230575616 | model_94 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981992349230575616/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981992349230575616/main_result_6c8f476635954f108e4bd322b5c18d15.webp) | — |
| 166 | 15 CHANGEMANNEQUIN | 1981992264195256320 | model_58 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981992264195256320/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981992264195256320/main_result_3771e8dfc07c456eab059cd97401baff.webp) | — |
| 167 | 15 CHANGEMANNEQUIN | 1981992112436948992 | model_4 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981992112436948992/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981992112436948992/main_result_c1f8155f8d99448f89da3908f4f25f8a.webp) | — |
| 168 | 15 CHANGEMANNEQUIN | 1981991679022739456 | model_91 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981991679022739456/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981991679022739456/main_result_5cd681b8e38646e79e089876201f6e16.webp) | — |
| 169 | 15 CHANGEMANNEQUIN | 1981949055687602176 | model_54 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981949055687602176/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981949055687602176/main_result_b9725e6936dd4e5cb26c7a505c715d85.webp) | — |
| 170 | 15 CHANGEMANNEQUIN | 1981947595813957632 | model_56 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981947595813957632/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981947595813957632/main_result_75fac2c9a8b642e8bc71f5e00f7e1e88.webp) | — |
| 171 | 15 CHANGEMANNEQUIN | 1981947410891288576 | model_93 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981947410891288576/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981947410891288576/main_result_4ac774b33cfb4f60a78d11b70ce2ce13.webp) | — |
| 172 | 15 CHANGEMANNEQUIN | 1981947106250600448 | model_64 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981947106250600448/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981947106250600448/main_result_49b962c93e6e4058893ac68c28e073fc.webp) | — |
| 173 | 15 CHANGEMANNEQUIN | 1981946703748411392 | model_61 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981946703748411392/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981946703748411392/main_result_1c38dc0e13a8451680a40bd50ae27dfa.webp) | — |
| 174 | 15 CHANGEMANNEQUIN | 1981946254844637184 | model_89 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981946254844637184/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981946254844637184/main_result_bc79a643d0a24ea2b38fdce062a49182.webp) | — |
| 175 | 15 CHANGEMANNEQUIN | 1981945632653193216 | model_82 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981945632653193216/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981945632653193216/main_result_bef23f65e3f54c13acb8d0a70d9d76d2.webp) | — |
| 176 | 15 CHANGEMANNEQUIN | 1981945215051509760 | model_36 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981945215051509760/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1981945215051509760/main_result_e412bfd575b7403eb9496701e36b2e0a.webp) | — |
| 177 | 15 CHANGEMANNEQUIN | 1742742744030965760 | model_1 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742742744030965760/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742742744030965760/main_result_d9611da6fa7f48c0b779a6280bdf4075.png) | — |
| 178 | 15 CHANGEMANNEQUIN | 1742890144775204864 | model_3 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742890144775204864/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742890144775204864/main_result_e4e8c38d595d4ae7b0e51ddf64ba231c.png) | — |
| 179 | 15 CHANGEMANNEQUIN | 1937706336526204928 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1937706336526204928/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1937706336526204928/main_result_b4e16cee455e4fe5be3948a5e6937698.png) | — |
| 180 | 15 CHANGEMANNEQUIN | 1805889855951941632 | model_1 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1805889855951941632/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1805889855951941632/main_result_6b3ef21c9f7a414390ef9b85eaac4b2e.png) | — |
| 181 | 15 CHANGEMANNEQUIN | 1804076240014655488 | model_49 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1804076240014655488/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1804076240014655488/main_result_8cb130d875fb4ba2b0a56c2b71842040.png) | — |
| 182 | 15 CHANGEMANNEQUIN | 1742138419139371008 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742138419139371008/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742138419139371008/main_result_27a7f80cee90479ea4466908a76736fb.png) | — |
| 183 | 15 CHANGEMANNEQUIN | 1742460351592198144 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742460351592198144/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742460351592198144/main_result_7821768c70e24944a5f14945bc3e801c.png) | — |
| 184 | 15 CHANGEMANNEQUIN | 1744243259393183744 | model_49 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1744243259393183744/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1744243259393183744/main_result_7aece1891ca749c08e0dd728232a756c.png) | — |
| 185 | 15 CHANGEMANNEQUIN | 1742876885460381696 | model_49 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742876885460381696/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MANNEQUIN/1742876885460381696/main_result_b416d82cfa1c4ef29851d8a42908ca68.png) | — |
| 186 | 19 CHANGE_COLOR | 1982010812972019712 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010812972019712/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010812972019712/main_result_099aa989f6cc46b1b0a057ce1b7760ca.webp) | — |
| 187 | 19 CHANGE_COLOR | 1982010936292945920 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010936292945920/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010936292945920/main_result_12a69b2423ff44fda1d90180b30207d3.webp) | — |
| 188 | 19 CHANGE_COLOR | 1982010996925804544 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010996925804544/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010996925804544/main_result_4985384e46474eed96fc2efdd30f05bd.webp) | — |
| 189 | 19 CHANGE_COLOR | 1982010647376703488 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010647376703488/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982010647376703488/main_result_419c50513bfa44bfacac212d3b95e07e.webp) | — |
| 190 | 19 CHANGE_COLOR | 1982011288228605952 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011288228605952/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011288228605952/main_result_8159f6e3ec4b401f9a895f086e5782ef.webp) | — |
| 191 | 19 CHANGE_COLOR | 1982013061928464384 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982013061928464384/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982013061928464384/main_result_45366a7b66734be4867a2a88b00c76ff.webp) | — |
| 192 | 19 CHANGE_COLOR | 1982012983570477056 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012983570477056/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012983570477056/main_result_430ef436f9b848ddbd50f82e0b368b79.webp) | — |
| 193 | 19 CHANGE_COLOR | 1982012896609972224 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012896609972224/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012896609972224/main_result_32d59ea2bfec4ab3a15a2ed06ff522f4.webp) | — |
| 194 | 19 CHANGE_COLOR | 1982012800908537856 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012800908537856/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012800908537856/main_result_f204ea1f13444279bbf5a333e0d9eb10.webp) | — |
| 195 | 19 CHANGE_COLOR | 1982012740481200128 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012740481200128/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012740481200128/main_result_6b587e271f09497f979d0688bb9dfcfa.webp) | — |
| 196 | 19 CHANGE_COLOR | 1982012687570055168 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012687570055168/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012687570055168/main_result_28e9caaf446f461f8d1adb1699b9eca6.webp) | — |
| 197 | 19 CHANGE_COLOR | 1982012628182904832 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012628182904832/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012628182904832/main_result_438b262c5bfc4901a3739392be0134b1.webp) | — |
| 198 | 19 CHANGE_COLOR | 1982012575821213696 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012575821213696/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012575821213696/main_result_41087bb78f7045c8a5313921a5596ffc.webp) | — |
| 199 | 19 CHANGE_COLOR | 1982012525141438464 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012525141438464/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012525141438464/main_result_a6e4510d734a419e849a0efa3f1f868e.webp) | — |
| 200 | 19 CHANGE_COLOR | 1982012489808621568 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012489808621568/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012489808621568/main_result_a17bb54ec327489589a84741428ea425.webp) | — |
| 201 | 19 CHANGE_COLOR | 1982012417360408576 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012417360408576/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012417360408576/main_result_b16580f65fab4a5cafd6ce6070cffc1e.webp) | — |
| 202 | 19 CHANGE_COLOR | 1982012267955105792 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012267955105792/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012267955105792/main_result_71f91b2f7ea046469d39f6ddde36a6d3.webp) | — |
| 203 | 19 CHANGE_COLOR | 1982012223990411264 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012223990411264/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012223990411264/main_result_db7776e5e18945b0891b57e966827e6b.webp) | — |
| 204 | 19 CHANGE_COLOR | 1982012174308880384 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012174308880384/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012174308880384/main_result_1c6812312c6f4fdab2f88851bdfffdce.webp) | — |
| 205 | 19 CHANGE_COLOR | 1982012076279607296 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012076279607296/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012076279607296/main_result_200ab5298e114a9faf70f065319ce51b.webp) | — |
| 206 | 19 CHANGE_COLOR | 1982012061729566720 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012061729566720/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012061729566720/main_result_dd23a6a81bd44620be252b349baba5ba.webp) | — |
| 207 | 19 CHANGE_COLOR | 1982012028565204992 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012028565204992/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012028565204992/main_result_0de16996370f42f7a1842fe5a826704d.webp) | — |
| 208 | 19 CHANGE_COLOR | 1982012015097294848 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012015097294848/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982012015097294848/main_result_36f2467554b8400dbeace23856b8bc18.webp) | — |
| 209 | 19 CHANGE_COLOR | 1982011892896247808 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011892896247808/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011892896247808/main_result_11f0263ca38f4028b98d7f2213962ca7.webp) | — |
| 210 | 19 CHANGE_COLOR | 1982011821668577280 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011821668577280/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011821668577280/main_result_4e8fe16aa081487eb3424949fc10597e.webp) | — |
| 211 | 19 CHANGE_COLOR | 1982011794049085440 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011794049085440/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011794049085440/main_result_6353ea964fd84be2a0cd6c6ef021f705.webp) | — |
| 212 | 19 CHANGE_COLOR | 1982011777599025152 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011777599025152/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1982011777599025152/main_result_afa64c730d394c25871822b69cb18298.webp) | — |
| 213 | 19 CHANGE_COLOR | 1773556635362242560 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773556635362242560/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773556635362242560/main_result_dcbae8dfc97c48c5bf5516e8189c4e6f.png) | — |
| 214 | 19 CHANGE_COLOR | 1773554972173905920 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773554972173905920/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773554972173905920/main_result_683df7bc6d5e4c45b829788b60a9e4ef.png) | — |
| 215 | 19 CHANGE_COLOR | 1773554936266469376 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773554936266469376/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773554936266469376/main_result_4fc55f5cc8cf41c7ae7ca587b47f100f.png) | — |
| 216 | 19 CHANGE_COLOR | 1773556124479238144 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773556124479238144/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1773556124479238144/main_result_8d20f2b3ae7c4bf5b352877b614618c5.png) | — |
| 217 | 19 CHANGE_COLOR | 1772538035232776192 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772538035232776192/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772538035232776192/main_result_a3b3e65cbaa44811b770bb75a5e325ff.png) | — |
| 218 | 19 CHANGE_COLOR | 1772536383603941376 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772536383603941376/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772536383603941376/main_result_6dd11d808fd647d8ac328951867ec85a.png) | — |
| 219 | 19 CHANGE_COLOR | 1772538134553894912 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772538134553894912/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772538134553894912/main_result_943098de360742a58603b63012512e46.png) | — |
| 220 | 19 CHANGE_COLOR | 1772538154296483840 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772538154296483840/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR/1772538154296483840/main_result_19f5395e6fbb4d94afe7d3a33c495e7d.png) | — |
| 221 | 22 SDS_DESIGN | 1780443735213010944 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780443735213010944/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780443735213010944/main_result_9235907e63984a8082a05207f39e3088.jpeg) | — |
| 222 | 22 SDS_DESIGN | 1780444197689552896 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444197689552896/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444197689552896/main_result_cacb731f79564e69b021ff5fef6f2ac6.jpeg) | — |
| 223 | 22 SDS_DESIGN | 1780443897880702976 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780443897880702976/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780443897880702976/main_result_ed93b1d8ac1a47bf9d84c3520b793b58.jpeg) | — |
| 224 | 22 SDS_DESIGN | 1780444012611694592 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444012611694592/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444012611694592/main_result_11b0b6b014ec48aeb878d0e639ca50fc.jpeg) | — |
| 225 | 22 SDS_DESIGN | 1780444055037079552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444055037079552/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444055037079552/main_result_6d061fc609e642a89865e3b90188ff6f.jpeg) | — |
| 226 | 22 SDS_DESIGN | 1780444291360944128 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444291360944128/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444291360944128/main_result_5b959dcdabca4f7b8abee1216059ec41.jpeg) | — |
| 227 | 22 SDS_DESIGN | 1780444251250814976 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444251250814976/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1780444251250814976/main_result_ef949e5a580e4d759cf6bdd3c36f0a7d.jpeg) | — |
| 228 | 22 SDS_DESIGN | 1778691287949357056 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1778691287949357056/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1778691287949357056/main_result_e2bc4df527b04fd7bfcedac3e6f4a7fc.jpeg) | — |
| 229 | 22 SDS_DESIGN | 1778685694421348352 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1778685694421348352/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1778685694421348352/main_result_d805a939f550463f94ee3a413bfe3e61.jpeg) | — |
| 230 | 22 SDS_DESIGN | 1777277515489972224 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777277515489972224/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777277515489972224/main_result_5178920641f34e5390de47a126e7ede1.jpeg) | — |
| 231 | 22 SDS_DESIGN | 1777277557185548288 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777277557185548288/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777277557185548288/main_result_4ea7cfe5fa0d4255b5f45a8b9b19bb04.jpeg) | — |
| 232 | 22 SDS_DESIGN | 1777277597325037568 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777277597325037568/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777277597325037568/main_result_232d2490c90e4484a8c1c3fbcc59781f.jpeg) | — |
| 233 | 22 SDS_DESIGN | 1777317914283708416 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777317914283708416/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777317914283708416/main_result_991497f18ff54f4e83f7f36b36f7a75f.jpeg) | — |
| 234 | 22 SDS_DESIGN | 1777318068764119040 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318068764119040/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318068764119040/main_result_f580f55d66b14b84aa06b8aedd271f1d.jpeg) | — |
| 235 | 22 SDS_DESIGN | 1777318010199052288 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318010199052288/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318010199052288/main_result_29d971271bf943b8ba54aa5ffa30c553.jpeg) | — |
| 236 | 22 SDS_DESIGN | 1777318326248247296 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318326248247296/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318326248247296/main_result_8c543a1bb2e7427eba8b6266675f5ab7.jpeg) | — |
| 237 | 22 SDS_DESIGN | 1777318280521945088 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318280521945088/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318280521945088/main_result_ba49ab34ade74673aa7b221553be4017.jpeg) | — |
| 238 | 22 SDS_DESIGN | 1777318564505686016 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318564505686016/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MATERIAL_FIT/1777318564505686016/main_result_118c5f42ccc54d688013de0dc7abbca8.jpeg) | — |
| 239 | 24 AI_DRESSING_V2 | 1940370107691995136 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940370107691995136/main_result_8e2df325a5204a26abe6ec3c0847447a.webp) | — |
| 240 | 24 AI_DRESSING_V2 | 1940369738240921600 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940369738240921600/main_result_fdebd59cca7e4848a86bed493b71961d.webp) | — |
| 241 | 24 AI_DRESSING_V2 | 1955583515158163456 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1955583515158163456/main_result_7f2b8957e4f34b759aaf3c4ba9cd9f4f.webp) | — |
| 242 | 24 AI_DRESSING_V2 | 1955583269879459840 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1955583269879459840/main_result_69764af8e4a344838aeea1aad17e4c85.webp) | — |
| 243 | 24 AI_DRESSING_V2 | 1955583161792245760 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1955583161792245760/main_result_8ec5653a021241bd88d10a9d88f08f5f.webp) | — |
| 244 | 24 AI_DRESSING_V2 | 1940369796831154176 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940369796831154176/main_result_17efd1ec9fb54380b53ba2aa0d371beb.webp) | — |
| 245 | 24 AI_DRESSING_V2 | 1940369770805497856 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940369770805497856/main_result_df661b7a730143cf9ad02f1b6f305dd3.webp) | — |
| 246 | 24 AI_DRESSING_V2 | 1940369698512474112 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940369698512474112/main_result_bd248d9ca2144291a95bb19ecfc05fef.webp) | — |
| 247 | 24 AI_DRESSING_V2 | 1940357479011749888 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940357479011749888/main_result_0bdc7823702c495881ab50fd8b8a0541.webp) | — |
| 248 | 24 AI_DRESSING_V2 | 1940357428071927808 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940357428071927808/main_result_61bdf9fd728e419089c3de92ad091a80.webp) | — |
| 249 | 24 AI_DRESSING_V2 | 1940357378386202624 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940357378386202624/main_result_357a259a74a54eb7a0df123d6536eccb.webp) | — |
| 250 | 24 AI_DRESSING_V2 | 1940357325680578560 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940357325680578560/main_result_75c53d3dd10a4cf6a8230c4cb0e0e061.webp) | — |
| 251 | 24 AI_DRESSING_V2 | 1940357261981683712 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940357261981683712/main_result_6bb228240e994815a698722f70407ba0.webp) | — |
| 252 | 24 AI_DRESSING_V2 | 1940357194906374144 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940357194906374144/main_result_db3c5930f7804199984ef2e5fa0133ae.webp) | — |
| 253 | 24 AI_DRESSING_V2 | 1940357138912415744 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940357138912415744/main_result_b7b361e4835847c6b9e58478a975ee79.webp) | — |
| 254 | 24 AI_DRESSING_V2 | 1940356980090900480 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1940356980090900480/main_result_42eb7bae0c3e4513ab75059f0b3f2827.webp) | — |
| 255 | 24 AI_DRESSING_V2 | 1807600002531631104 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1807600002531631104/main_result_da93e13a5f1b48b2a1b9a6bb40c70369.png) | — |
| 256 | 24 AI_DRESSING_V2 | 1807599755185135616 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/FITTING_ROOM_V2/1807599755185135616/main_result_95cced40eaa2445ea977857074dbd027.png) | — |
| 257 | 25 AI_OUTPAINTING | 1986721155815989248 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721155815989248/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721155815989248/main_result_ba162d87dc284d649fe6edc148b2a556.png) | — |
| 258 | 25 AI_OUTPAINTING | 1986721300955684864 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721300955684864/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721300955684864/main_result_55e677185dce4a20bf27362a878b822d.jpeg) | — |
| 259 | 25 AI_OUTPAINTING | 1986721334522699776 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721334522699776/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721334522699776/main_result_2666a99c60fc44858a7c6451acd73cc6.jpeg) | — |
| 260 | 25 AI_OUTPAINTING | 1986721480840994816 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721480840994816/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721480840994816/main_result_86fdba07e3874f14b7ba2449053a9113.png) | — |
| 261 | 25 AI_OUTPAINTING | 1986721577683279872 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721577683279872/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721577683279872/main_result_7cbce23e85a548d39c810bece0a9d554.png) | — |
| 262 | 25 AI_OUTPAINTING | 1986721687766982656 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721687766982656/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721687766982656/main_result_09294f20d0934061ae526d57f28d113b.jpeg) | — |
| 263 | 25 AI_OUTPAINTING | 1986721751084195840 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721751084195840/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721751084195840/main_result_e7dc1b041d114d948fa2e58e48f4d653.jpeg) | — |
| 264 | 25 AI_OUTPAINTING | 1986721826275483648 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721826275483648/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1986721826275483648/main_result_19125c97c36f463aaa5b7236796e3431.png) | — |
| 265 | 25 AI_OUTPAINTING | 1981944436316057600 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981944436316057600/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981944436316057600/main_result_da0ccca87fcd4f70aa47d5a9a930e848.jpeg) | — |
| 266 | 25 AI_OUTPAINTING | 1981944279969181696 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981944279969181696/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981944279969181696/main_result_fedc9b43069f47c4869f4900f325ff89.jpeg) | — |
| 267 | 25 AI_OUTPAINTING | 1981944125610405888 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981944125610405888/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981944125610405888/main_result_47ebf46639c1435d80efa022da3864a2.png) | — |
| 268 | 25 AI_OUTPAINTING | 1981942832561008640 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981942832561008640/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981942832561008640/main_result_e4060c741de94da6a270a61832440ead.jpeg) | — |
| 269 | 25 AI_OUTPAINTING | 1981942395757801472 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981942395757801472/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981942395757801472/main_result_786aeed7e7ec4444b3fd62ff2729bf49.jpeg) | — |
| 270 | 25 AI_OUTPAINTING | 1981941174472945664 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981941174472945664/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981941174472945664/main_result_ba7f5a1d89264ffaab220bff8b9d8798.png) | — |
| 271 | 25 AI_OUTPAINTING | 1981941024962785280 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981941024962785280/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1981941024962785280/main_result_5b203eaa897641a48412d8f349623aaa.png) | — |
| 272 | 25 AI_OUTPAINTING | 1803733138504196096 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803733138504196096/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803733138504196096/main_result_73f086f891ce4d779c18435c874d3008.jpeg) | — |
| 273 | 25 AI_OUTPAINTING | 1803733073576370176 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803733073576370176/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803733073576370176/main_result_aee9d380f75a4f04ace046f6b2310cb0.jpeg) | — |
| 274 | 25 AI_OUTPAINTING | 1803731916804104192 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803731916804104192/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803731916804104192/main_result_96c2d99a48a14fc6b840587f155729c2.jpeg) | — |
| 275 | 25 AI_OUTPAINTING | 1803723735835123712 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803723735835123712/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803723735835123712/main_result_60753e82b0984eec8e6f6531f6f416ad.jpeg) | — |
| 276 | 25 AI_OUTPAINTING | 1803723584559161344 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803723584559161344/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803723584559161344/main_result_28791544188d442a82be7666492aae57.jpeg) | — |
| 277 | 25 AI_OUTPAINTING | 1803723268048592896 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803723268048592896/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803723268048592896/main_result_e099b396febd4c52b8bc7b47d9db22ec.jpeg) | — |
| 278 | 25 AI_OUTPAINTING | 1803712043063484416 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803712043063484416/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803712043063484416/main_result_703efe5f422c4003a1abbbba2fe7a5ee.jpeg) | — |
| 279 | 25 AI_OUTPAINTING | 1803667172576260096 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803667172576260096/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803667172576260096/main_result_0e194b167512471095fde726bd46c442.jpeg) | — |
| 280 | 25 AI_OUTPAINTING | 1803009525044801536 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803009525044801536/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/EXPAND_IMAGE/1803009525044801536/main_result_8eaf544c3129435cb91b18a84fbef10c.jpeg) | — |
| 281 | 30 IMAGE_TO_VIDEO | 2100163975447363584 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163975447363584/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163975447363584/main_result_d32aaa0a8d0547a8bfaa3b9d1552e53a.mp4) | — |
| 282 | 30 IMAGE_TO_VIDEO | 2100164064358219776 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100164064358219776/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100164064358219776/main_result_7498ff2f57d74a83972d038c77b84938.mp4) | — |
| 283 | 30 IMAGE_TO_VIDEO | 2100163726649638912 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163726649638912/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163726649638912/main_result_1ed60109099541e2b5250bc77356d16a.mp4) | — |
| 284 | 30 IMAGE_TO_VIDEO | 2100163453168435200 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163453168435200/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163453168435200/main_result_c69076011e1c495da26220e03d966c4d.mp4) | — |
| 285 | 30 IMAGE_TO_VIDEO | 2100476826401685504 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100476826401685504/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100476826401685504/main_result_66acf27bf0be4d82a3818c41ead02556.mp4) | — |
| 286 | 30 IMAGE_TO_VIDEO | 2100164149024440320 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100164149024440320/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100164149024440320/main_result_92d2b6dd7c15425eaec38b6541c81956.mp4) | — |
| 287 | 30 IMAGE_TO_VIDEO | 2100163638699278336 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163638699278336/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163638699278336/main_result_27896fa0e35147e194fd5a61e372bc33.mp4) | — |
| 288 | 30 IMAGE_TO_VIDEO | 2100163900092497920 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163900092497920/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163900092497920/main_result_e1f41b7eda174d49a0e309cd6023694a.mp4) | — |
| 289 | 30 IMAGE_TO_VIDEO | 2100163801140477952 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163801140477952/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100163801140477952/main_result_9871632d7ec740feb1a304bec17af007.mp4) | — |
| 290 | 30 IMAGE_TO_VIDEO | 2100164228082876416 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100164228082876416/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_VIDEO/2100164228082876416/main_result_fdaad1da8765443f95b48a1b30ebf6ac.mp4) | — |
| 291 | 34 AI_WEARABLE | 1937722373632098304 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937722373632098304/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937722373632098304/main_result_d7e32656097a43d5a0ec8821c0f61194.webp) | — |
| 292 | 34 AI_WEARABLE | 1955579942177386496 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955579942177386496/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955579942177386496/main_result_014515069a3b4af5b80244797fdaec12.webp) | — |
| 293 | 34 AI_WEARABLE | 1955585163435749376 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955585163435749376/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955585163435749376/main_result_816d6689808d4fe7825c40057eab49c5.webp) | — |
| 294 | 34 AI_WEARABLE | 1955579706398781440 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955579706398781440/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955579706398781440/main_result_60bc95b053ae42c6a786e35e18dab2ce.webp) | — |
| 295 | 34 AI_WEARABLE | 1955579758294904832 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955579758294904832/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955579758294904832/main_result_cf9788fa8a784cb890f093111e5101bd.webp) | — |
| 296 | 34 AI_WEARABLE | 1955580188852793344 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955580188852793344/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1955580188852793344/main_result_3b3e6f49b3c54e7eafbe55032de4e64a.webp) | — |
| 297 | 34 AI_WEARABLE | 1937723310174044160 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937723310174044160/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937723310174044160/main_result_8f5117a4bd784f7184d92369214b3a69.webp) | — |
| 298 | 34 AI_WEARABLE | 1937723082284924928 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937723082284924928/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937723082284924928/main_result_c9f561b2ec8f405a9aaf08dd0bbb33e8.webp) | — |
| 299 | 34 AI_WEARABLE | 1937722201183289344 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937722201183289344/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937722201183289344/main_result_36ca8017036b4dfbbd72d2a774681bf4.webp) | — |
| 300 | 34 AI_WEARABLE | 1937721999995109376 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721999995109376/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721999995109376/main_result_c2f41c7e330044019c4ed035d9104bf1.webp) | — |
| 301 | 34 AI_WEARABLE | 1937721360489578496 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721360489578496/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721360489578496/main_result_2099a03b2b234df59078c1d6ef3c7928.webp) | — |
| 302 | 34 AI_WEARABLE | 1937721290083991552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721290083991552/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721290083991552/main_result_74a7ead3827b4245b5b0cc4dd44e3658.webp) | — |
| 303 | 34 AI_WEARABLE | 1937721180839149568 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721180839149568/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721180839149568/main_result_fe77dfa5611e4788879595b79318c8e6.webp) | — |
| 304 | 34 AI_WEARABLE | 1937721088618987520 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721088618987520/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937721088618987520/main_result_99755b1979154d43ac1b8d47209510c3.webp) | — |
| 305 | 34 AI_WEARABLE | 1937720954002800640 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937720954002800640/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937720954002800640/main_result_82ebe974c02f44efab552e90778b594d.webp) | — |
| 306 | 34 AI_WEARABLE | 1937720391315947520 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937720391315947520/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1937720391315947520/main_result_a93e8ff81387462ba9331f3cb25b4cd3.webp) | — |
| 307 | 34 AI_WEARABLE | 1868972752455667712 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868972752455667712/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868972752455667712/main_result_91c9f4043a66456d97cd4c87611057ee.webp) | — |
| 308 | 34 AI_WEARABLE | 1868972005869555712 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868972005869555712/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868972005869555712/main_result_f4223f91169e4229a07238c8878f02e2.webp) | — |
| 309 | 34 AI_WEARABLE | 1868972162749108224 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868972162749108224/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868972162749108224/main_result_688732200b7144baa39acfdc16a0642d.webp) | — |
| 310 | 34 AI_WEARABLE | 1868593558908751872 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868593558908751872/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868593558908751872/main_result_a7de8ac562f34c16908086fb920b64de.webp) | — |
| 311 | 34 AI_WEARABLE | 1868597020950188032 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868597020950188032/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868597020950188032/main_result_5dbeb202a77a40d0a43a828fad8807ad.webp) | — |
| 312 | 34 AI_WEARABLE | 1868597226076819456 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868597226076819456/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/INTELLIGENT_WEAR/1868597226076819456/main_result_2d796629abd44e76b5334324551b48bd.webp) | — |
| 313 | 35 AI_CHANGEMODEL | 1983761399095996416 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983761399095996416/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983761399095996416/main_result_c6d138f883284aeb8fcde3fb6cc53197.webp) | — |
| 314 | 35 AI_CHANGEMODEL | 1983744297555439616 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983744297555439616/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983744297555439616/main_result_aa61913694fc467ca6125f67d18c7ea8.webp) | — |
| 315 | 35 AI_CHANGEMODEL | 1983778024096509952 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983778024096509952/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983778024096509952/main_result_aa72756afe864493b3ccbc7725ce87ef.webp) | — |
| 316 | 35 AI_CHANGEMODEL | 1983744635003973632 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983744635003973632/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983744635003973632/main_result_05f2220d71394b578613d6ac88d83c25.webp) | — |
| 317 | 35 AI_CHANGEMODEL | 1983743246467051520 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983743246467051520/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983743246467051520/main_result_f64bbe490d9249f7bd7378b33e36e20d.webp) | — |
| 318 | 35 AI_CHANGEMODEL | 1983742171529850880 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983742171529850880/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983742171529850880/main_result_9b337ff1f7b3489cbd998af02bda135e.webp) | — |
| 319 | 35 AI_CHANGEMODEL | 1983741947042312192 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983741947042312192/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983741947042312192/main_result_287bbdd878ba426aa9ea1034c3ee8b65.webp) | — |
| 320 | 35 AI_CHANGEMODEL | 1983733774961061888 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983733774961061888/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983733774961061888/main_result_997c7c7d8a7441bf8e30087ffddd270f.webp) | — |
| 321 | 35 AI_CHANGEMODEL | 1983733450850414592 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983733450850414592/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983733450850414592/main_result_16b91dc4e3ed4165861809612eb90587.webp) | — |
| 322 | 35 AI_CHANGEMODEL | 1983732708416663552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983732708416663552/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983732708416663552/main_result_9f0d531aa01743bc8d395d8979e64617.webp) | — |
| 323 | 35 AI_CHANGEMODEL | 1983729634356736000 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983729634356736000/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1983729634356736000/main_result_e255cbdc96c041b8bc021520090e742e.webp) | — |
| 324 | 35 AI_CHANGEMODEL | 1937696359057129472 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696359057129472/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696359057129472/main_result_d64e211a6abd4f5193affda162eebb03.webp) | — |
| 325 | 35 AI_CHANGEMODEL | 1937697213864673280 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937697213864673280/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937697213864673280/main_result_96911599165147b08feacfdc805fee30.webp) | — |
| 326 | 35 AI_CHANGEMODEL | 1981939660140457984 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939660140457984/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939660140457984/main_result_5504bdc61ab54df09166777d65914370.webp) | — |
| 327 | 35 AI_CHANGEMODEL | 1981939597351727104 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939597351727104/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939597351727104/main_result_3c34a1616ea6491d8c504a104983886e.webp) | — |
| 328 | 35 AI_CHANGEMODEL | 1981939519295729664 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939519295729664/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939519295729664/main_result_10dab3f3e47f41b2b92a61b7721c294c.webp) | — |
| 329 | 35 AI_CHANGEMODEL | 1981939420507287552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939420507287552/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981939420507287552/main_result_4d941019a809418ebc76f10c027dad30.webp) | — |
| 330 | 35 AI_CHANGEMODEL | 1981937987800150016 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981937987800150016/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981937987800150016/main_result_136380b24cc94fa0910b8e8917a3c572.webp) | — |
| 331 | 35 AI_CHANGEMODEL | 1981937419438403584 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981937419438403584/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981937419438403584/main_result_fb4b789de6f34afe809cc7ce65f927e7.webp) | — |
| 332 | 35 AI_CHANGEMODEL | 1981617662902284288 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981617662902284288/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981617662902284288/main_result_2fb31bf5aa3e45cbbf28fa1386d67cd4.webp) | — |
| 333 | 35 AI_CHANGEMODEL | 1981617406559006720 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981617406559006720/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981617406559006720/main_result_37f3e71555684ccb9ba85b4450e26ae8.webp) | — |
| 334 | 35 AI_CHANGEMODEL | 1981617174005821440 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981617174005821440/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981617174005821440/main_result_10f4caad5e0b42f3907e94e61dfa6e7e.webp) | — |
| 335 | 35 AI_CHANGEMODEL | 1981610392462176256 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981610392462176256/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981610392462176256/main_result_43fa026b02344bf68645810e765b923a.webp) | — |
| 336 | 35 AI_CHANGEMODEL | 1981610131635187712 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981610131635187712/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1981610131635187712/main_result_fcf6c71ad09149d3b29483041498553c.webp) | — |
| 337 | 35 AI_CHANGEMODEL | 1955597516499890176 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955597516499890176/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955597516499890176/main_result_cb3b3b5e48b64ddd97610d525711609b.webp) | — |
| 338 | 35 AI_CHANGEMODEL | 1955599861006774272 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955599861006774272/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955599861006774272/main_result_3493f8abdfe1447fa50917791b425b46.webp) | — |
| 339 | 35 AI_CHANGEMODEL | 1955600333553840128 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955600333553840128/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955600333553840128/main_result_1c3691234d6046bcb10c5a854b6e1d9b.webp) | — |
| 340 | 35 AI_CHANGEMODEL | 1955597572124749824 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955597572124749824/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1955597572124749824/main_result_0f517f78df9d4bc3b097da96ecb74532.webp) | — |
| 341 | 35 AI_CHANGEMODEL | 1937703015220445184 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937703015220445184/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937703015220445184/main_result_3c0b7e45bf9d475eb41881d3302e14bc.webp) | — |
| 342 | 35 AI_CHANGEMODEL | 1937702770549915648 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937702770549915648/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937702770549915648/main_result_414bb5bdaa5b4d789ba41ad49fb4d40f.webp) | — |
| 343 | 35 AI_CHANGEMODEL | 1937702715898134528 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937702715898134528/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937702715898134528/main_result_9da9e131894b4d7eb24195886abd17b2.webp) | — |
| 344 | 35 AI_CHANGEMODEL | 1937696842232561664 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696842232561664/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696842232561664/main_result_f7d2a296e4064a0481a5cc7638906646.webp) | — |
| 345 | 35 AI_CHANGEMODEL | 1937696593061543936 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696593061543936/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696593061543936/main_result_cf8de15307ea459db236a32490cc3da2.webp) | — |
| 346 | 35 AI_CHANGEMODEL | 1937696389092540416 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696389092540416/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696389092540416/main_result_a04d66337f2146c999dc254c0deb6b27.webp) | — |
| 347 | 35 AI_CHANGEMODEL | 1937696181256388608 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696181256388608/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696181256388608/main_result_6406968b36674474a769bbdc379943c2.webp) | — |
| 348 | 35 AI_CHANGEMODEL | 1937696146644992000 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696146644992000/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937696146644992000/main_result_1da67b2fa0574dff81fe590125ea1f7b.webp) | — |
| 349 | 35 AI_CHANGEMODEL | 1937695969142046720 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937695969142046720/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937695969142046720/main_result_57e7cf49ccfb46479881a8be4fc81da5.webp) | — |
| 350 | 35 AI_CHANGEMODEL | 1937695230780964864 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937695230780964864/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937695230780964864/main_result_e2d4a3d167a448d299d58f968682c564.webp) | — |
| 351 | 35 AI_CHANGEMODEL | 1937694833370660864 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937694833370660864/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_MODEL_V2/1937694833370660864/main_result_a01eba8fe7c84276a85d5fb12295e34e.webp) | — |
| 352 | 49 HANDHELD_GOODS | 2026596900150464512 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/HAND_HELD/2026596900150464512/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/HAND_HELD/2026596900150464512/main_result_4dcbc2dd017f4f32abb6ad59158ede73.webp) | — |
| 353 | 58 AI_POSTURE | 1999440008972206080 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_POSE_FISSION/1999440008972206080/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_POSE_FISSION/1999440008972206080/main_result_b83494f6aa8a4ce79da6c3e49017d783.webp) | 有 |
| 354 | 61 SMART_REPAIR | 2049384373617631232 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384373617631232/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384373617631232/main_result_828e5ca978d34c71beee875101691a6d.png) | 有 |
| 355 | 61 SMART_REPAIR | 2049384487228743680 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384487228743680/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384487228743680/main_result_bbdc6be286914143b95c8d07a77c44c6.png) | 有 |
| 356 | 61 SMART_REPAIR | 2014617109262262272 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014617109262262272/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014617109262262272/main_result_c67babc1518c4479be255d0ab2facf34.png) | 有 |
| 357 | 61 SMART_REPAIR | 2014631578629595136 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014631578629595136/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014631578629595136/main_result_02f011e46fc14e95a1c583f6990cc03d.png) | 有 |
| 358 | 61 SMART_REPAIR | 2014304859355897856 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014304859355897856/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014304859355897856/main_result_7e2f7ef205bb4b2cafc07e34cbaea24f.png) | 有 |
| 359 | 61 SMART_REPAIR | 2014305255742791680 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305255742791680/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305255742791680/main_result_c51f7354a0c34f8d9a8f9e68c87375e2.png) | 有 |
| 360 | 61 SMART_REPAIR | 2014305554553397248 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305554553397248/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305554553397248/main_result_6051a3ff675a49a5873d732b17414ef1.png) | 有 |
| 361 | 61 SMART_REPAIR | 1978805287133302784 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805287133302784/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805287133302784/main_result_5238ea3dea2c469a948093c6c7e9bb04.png) | 有 |
| 362 | 61 SMART_REPAIR | 1978805223807700992 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805223807700992/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805223807700992/main_result_feb2c9f775414da79c662b736bffc320.png) | 有 |
| 363 | 61 SMART_REPAIR | 1978804994588987392 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804994588987392/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804994588987392/main_result_f3e4ceebd92a467cb09fb446fd51f476.png) | 有 |
| 364 | 61 SMART_REPAIR | 1978804969507049472 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804969507049472/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804969507049472/main_result_a73acd9332b5409baccb5250a0a571b6.png) | 有 |
| 365 | 61 SMART_REPAIR | 1978804951383461888 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804951383461888/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804951383461888/main_result_9fdd34a22ec241fb91bdbdb038da0707.png) | 有 |
| 366 | 61 SMART_REPAIR | 1978804861822488576 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804861822488576/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804861822488576/main_result_ac286654da0a43e7b6403f89b285d189.png) | 有 |
| 367 | 61 SMART_REPAIR | 1978804804624764928 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804804624764928/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804804624764928/main_result_6e486a945ca640058ebc629ab272f10b.png) | 有 |
| 368 | 61 SMART_REPAIR | 1978804755278778368 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804755278778368/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804755278778368/main_result_096ce0e9c3e64de083960bdfc607140a.png) | 有 |
| 369 | 61 SMART_REPAIR | 1978804731748732928 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804731748732928/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804731748732928/main_result_50ed786a67054646a2ee7e95e7abd91c.png) | 有 |
| 370 | 61 SMART_REPAIR | 1978804256160796672 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804256160796672/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804256160796672/main_result_7f7b2852b75b420188846bc4204d8e0f.png) | 有 |
| 371 | 61 SMART_REPAIR | 1978803739644841984 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803739644841984/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803739644841984/main_result_f7e9290b523e431486787fd97c77c6f1.png) | 有 |
| 372 | 61 SMART_REPAIR | 1978803681222381568 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803681222381568/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803681222381568/main_result_642c1d040be649c68cf344fd8afb87c2.png) | 有 |
| 373 | 61 SMART_REPAIR | 1978803613815721984 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803613815721984/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803613815721984/main_result_ac38c3684ed948cf8eba073d5b616e51.png) | 有 |
| 374 | 61 SMART_REPAIR | 1978766177698287616 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978766177698287616/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978766177698287616/main_result_896b581927db4851b42b55c3ac348bb0.png) | 有 |
| 375 | 61 SMART_REPAIR | 1978746075556843520 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978746075556843520/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978746075556843520/main_result_a3f706e7321c4476adcd9d5af9e08e4a.png) | 有 |
| 376 | 61 SMART_REPAIR | 1978742192948350976 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978742192948350976/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978742192948350976/main_result_b71e37430fde49869d316eedbf14bc72.png) | 有 |
| 377 | 61 SMART_REPAIR | 1978740666410438656 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740666410438656/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740666410438656/main_result_a086631b022b447d8f7528b915114309.webp) | 有 |
| 378 | 61 SMART_REPAIR | 1978740632746954752 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740632746954752/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740632746954752/main_result_109c38859fdd4c1d8e0d1e9a601cea08.png) | 有 |
| 379 | 61 SMART_REPAIR | 1978736356121350144 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978736356121350144/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978736356121350144/main_result_f9014f5c601f49faafd0168263c8abf1.png) | 有 |
| 380 | 61 SMART_REPAIR | 1978734961435578368 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734961435578368/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734961435578368/main_result_f983cbe072cf4621a536b261bd86a251.png) | 有 |
| 381 | 61 SMART_REPAIR | 1978734568559316992 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734568559316992/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734568559316992/main_result_081c2d20baf64531b33c649be6339f15.webp) | 有 |
| 382 | 61 SMART_REPAIR | 1978733700682321920 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733700682321920/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733700682321920/main_result_33707f7795984259bb03f1d3f151bb37.png) | 有 |
| 383 | 61 SMART_REPAIR | 1978733672333021184 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733672333021184/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733672333021184/main_result_6a262514f59346d49cc1f0b41a0f7fdf.png) | 有 |
| 384 | 61 SMART_REPAIR | 1978733597909291008 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733597909291008/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733597909291008/main_result_211d311cd6b543dab25ae2614b8793a4.png) | 有 |
| 385 | 61 SMART_REPAIR | 1978733510801985536 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733510801985536/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733510801985536/main_result_2f295bf1d2f14dd7893795412d6c8bc5.png) | 有 |
| 386 | 61 SMART_REPAIR | 1978733482813394944 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733482813394944/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733482813394944/main_result_c53367036f85491b94b3b887b37d0467.png) | 有 |
| 387 | 61 SMART_REPAIR | 1978733399225110528 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733399225110528/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733399225110528/main_result_901c7492610a4a7994ceecc40d6e2b38.png) | 有 |
| 388 | 61 SMART_REPAIR | 1978733376986910720 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733376986910720/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733376986910720/main_result_334020cde8664631acc72ed15525acd8.png) | 有 |
| 389 | 61 SMART_REPAIR | 1978733292190666752 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733292190666752/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733292190666752/main_result_3d02821382f54e348f9cf55e3dbfde63.png) | 有 |
| 390 | 61 SMART_REPAIR | 1978733255280791552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733255280791552/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733255280791552/main_result_575424c3909b4455a4526704ec75116e.png) | 有 |
| 391 | 61 SMART_REPAIR | 1978733195688120320 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733195688120320/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733195688120320/main_result_e400ad77719a4782ab25f23d61490038.png) | 有 |
| 392 | 61 SMART_REPAIR | 1978733175995863040 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733175995863040/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733175995863040/main_result_d3195043125d4471b5d62875efa03a23.png) | 有 |
| 393 | 61 SMART_REPAIR | 1978733093288382464 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733093288382464/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733093288382464/main_result_bf7c33dada00482b99ee9c4213fab844.png) | 有 |
| 394 | 61 SMART_REPAIR | 1978733022496919552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733022496919552/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733022496919552/main_result_713d6c05123a4a6cabe78afb4a6a47b7.png) | 有 |
| 395 | 61 SMART_REPAIR | 1978732996538372096 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732996538372096/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732996538372096/main_result_00e4cfbd33c1409a82e5c1a34e3e8468.png) | 有 |
| 396 | 61 SMART_REPAIR | 1978732978913906688 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732978913906688/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732978913906688/main_result_62807841d986436e8c721727f170e1c5.png) | 有 |
| 397 | 61 SMART_REPAIR | 1978732939059630080 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732939059630080/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732939059630080/main_result_685dbd6b320a4c4f838bbeedf8bc7e9b.png) | 有 |
| 398 | 61 SMART_REPAIR | 1978732875209740288 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732875209740288/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732875209740288/main_result_6f5baa9c7402417f9a3d509c865881c3.webp) | 有 |
| 399 | 61 SMART_REPAIR | 1978732849951641600 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732849951641600/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732849951641600/main_result_575c6b6f68c4450790c2449c3f51b20b.png) | 有 |
| 400 | 61 SMART_REPAIR | 1978732679532875776 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732679532875776/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732679532875776/main_result_6da7db68daca46dc9eddfb156157201e.png) | 有 |
| 401 | 61 SMART_REPAIR | 1978732642568474624 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732642568474624/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732642568474624/main_result_d37812d100c1457ca86089f5688dc0c2.png) | 有 |
| 402 | 61 SMART_REPAIR | 1978732621097832448 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732621097832448/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732621097832448/main_result_fd6fbdee176b4e8ca22561d649be544c.png) | 有 |
| 403 | 61 SMART_REPAIR | 1978732597622312960 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732597622312960/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732597622312960/main_result_796ef49524c04b3a9441d321fa0effa3.png) | 有 |
| 404 | 61 SMART_REPAIR | 1978732567238774784 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732567238774784/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732567238774784/main_result_407344c6ca4f43ca9312a6a10c70b527.png) | 有 |
| 405 | 61 SMART_REPAIR | 1978732460351131648 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732460351131648/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732460351131648/main_result_e87647b5fada467087939e0bc2c614a4.png) | 有 |
| 406 | 61 SMART_REPAIR | 1978732406571765760 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732406571765760/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732406571765760/main_result_7b486f2d0efd4736869ca24f0b3f3b28.png) | 有 |
| 407 | 61 SMART_REPAIR | 1978732165743218688 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732165743218688/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732165743218688/main_result_b3937aceda744b13a21a401abe81b4f4.png) | 有 |
| 408 | 61 SMART_REPAIR | 1978643938157658112 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643938157658112/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643938157658112/main_result_5806dd3dd7e646a88ed3f34c8898281d.png) | 有 |
| 409 | 61 SMART_REPAIR | 1978643411420184576 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643411420184576/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643411420184576/main_result_8eb2308e7af943d8b7906bf98ae0b280.png) | 有 |
| 410 | 61 SMART_REPAIR | 1978643080414101504 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643080414101504/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643080414101504/main_result_c0512af4cab747beaf5ae43235fec7f5.png) | 有 |
| 411 | 61 SMART_REPAIR | 1978642971035041792 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642971035041792/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642971035041792/main_result_ddd3eaad2f464b75a37e5e5c44885a41.png) | 有 |
| 412 | 61 SMART_REPAIR | 1978642598744424448 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642598744424448/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642598744424448/main_result_b8415e00d38943168187a41f01a6d533.png) | 有 |
| 413 | 61 SMART_REPAIR | 1978640164024098816 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978640164024098816/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978640164024098816/main_result_22d638465c054d50be74cb2154cac991.png) | 有 |
| 414 | 61 SMART_REPAIR | 1972924358684704768 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1972924358684704768/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1972924358684704768/main_result_10dc063e4a1949048dde9059f147ebb1.png) | 有 |
| 415 | 62 MULTI_IMAGE_FUSION | 1978732916448137216 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732916448137216/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732916448137216/main_result_04e627ead99e429d8ab15f3af4d712cb.png) | 有 |
| 416 | 62 MULTI_IMAGE_FUSION | 1978732783614529536 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732783614529536/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732783614529536/main_result_0e210d6d71214c6d87f11a43a0a0746d.png) | 有 |
| 417 | 62 MULTI_IMAGE_FUSION | 1978732501790855168 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732501790855168/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732501790855168/main_result_78fa15c10b4f41138d73c8336ec2f40b.png) | 有 |
| 418 | 62 MULTI_IMAGE_FUSION | 1978640981408219136 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978640981408219136/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978640981408219136/main_result_4a7ef9faff234f2d9bf3e788b3cc55cc.png) | 有 |
| 419 | 62 MULTI_IMAGE_FUSION | 1978639310923636736 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978639310923636736/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978639310923636736/main_result_b6a47cae398f46feb4823b0ed76139b3.png) | 有 |
| 420 | 69 DRESS_WEAR_SET | 2026966441820966912 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2026966441820966912/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2026966441820966912/main_result_9abb233c878448638dc317270f47cd34.jpg) | — |
| 421 | 69 DRESS_WEAR_SET | 2010584971116363776 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010584971116363776/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010584971116363776/main_result_a25a6569c94742198d250a16f7738935.png) | — |
| 422 | 69 DRESS_WEAR_SET | 2010559668042153984 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010559668042153984/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010559668042153984/main_result_b5be373298784fe4883f86a40e2a9d94.png) | — |
| 423 | 69 DRESS_WEAR_SET | 2052630503189741568 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2052630503189741568/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2052630503189741568/main_result_b7cadc3001b54042baacf1079677d049.jpg) | — |
| 424 | 69 DRESS_WEAR_SET | 2042559549172404224 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2042559549172404224/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2042559549172404224/main_result_24737b5c1d874b1aaa644451244e1181.png) | — |
| 425 | 69 DRESS_WEAR_SET | 2042550493179334656 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2042550493179334656/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2042550493179334656/main_result_5ac3505c55184b66984da5e6f10f93dd.jpg) | — |
| 426 | 69 DRESS_WEAR_SET | 2042550605402132480 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2042550605402132480/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2042550605402132480/main_result_8cb80accb1404a5086cd38439a8031c5.jpg) | — |
| 427 | 69 DRESS_WEAR_SET | 2037102697139732480 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037102697139732480/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037102697139732480/main_result_d6bcb85927504772a77dd7ebd06a1eca.jpg) | — |
| 428 | 69 DRESS_WEAR_SET | 2037106539239636992 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037106539239636992/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037106539239636992/main_result_60c496352cc841639fa162ba7e46f1f8.jpg) | — |
| 429 | 69 DRESS_WEAR_SET | 2037106761474834432 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037106761474834432/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037106761474834432/main_result_a57ce9c18bb04531b64c61c4a0f20eac.jpg) | — |
| 430 | 69 DRESS_WEAR_SET | 2037108682935828480 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037108682935828480/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2037108682935828480/main_result_7dd66929c0f1466f952790365460f1d4.jpg) | — |
| 431 | 69 DRESS_WEAR_SET | 2034938374070009856 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2034938374070009856/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2034938374070009856/main_result_bc65589f3d1e48ff9f7754e8cdf1618b.jpg) | — |
| 432 | 69 DRESS_WEAR_SET | 2034939802050166784 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2034939802050166784/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2034939802050166784/main_result_c205162027f145e696deabc93e6d222c.jpg) | — |
| 433 | 69 DRESS_WEAR_SET | 2019725199905161216 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2019725199905161216/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2019725199905161216/main_result_0ed6b5cdcfde4c35b690bfbf314df63c.jpg) | — |
| 434 | 69 DRESS_WEAR_SET | 2013185524178739200 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2013185524178739200/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2013185524178739200/main_result_085a2ec378a24bc7b35b634b1bd2062e.jpg) | — |
| 435 | 69 DRESS_WEAR_SET | 2032294037771280384 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2032294037771280384/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2032294037771280384/main_result_395ff59d22594607a612da35c67d2db7.png) | — |
| 436 | 69 DRESS_WEAR_SET | 2032300382369112064 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2032300382369112064/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2032300382369112064/main_result_0b5c5f0e147f43399314193425044a9b.jpg) | — |
| 437 | 69 DRESS_WEAR_SET | 2032302502182936576 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2032302502182936576/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2032302502182936576/main_result_276381d724ea4c2ebf401b982fceb862.jpg) | — |
| 438 | 69 DRESS_WEAR_SET | 2028402457421303808 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2028402457421303808/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2028402457421303808/main_result_97b87c6f38e440e495186a767c102449.jpg) | — |
| 439 | 69 DRESS_WEAR_SET | 2028406529385844736 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2028406529385844736/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2028406529385844736/main_result_d016a09de9984b3aa2abdbe39962f35b.jpg) | — |
| 440 | 69 DRESS_WEAR_SET | 2010585128381792256 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010585128381792256/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010585128381792256/main_result_c99a83bc54b04c98b304e9f66e5276d7.jpg) | — |
| 441 | 69 DRESS_WEAR_SET | 2011701173366583296 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2011701173366583296/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2011701173366583296/main_result_c3b5ccd3c1fd45e7b71a3467ac24ad6b.jpg) | — |
| 442 | 69 DRESS_WEAR_SET | 2010585318861914112 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010585318861914112/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010585318861914112/main_result_dea1969ae19e437ea1f9eeb3ada7fa7b.png) | — |
| 443 | 69 DRESS_WEAR_SET | 2010685323371159552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685323371159552/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685323371159552/main_result_7588c8803a39455d82852661b7b9beb1.jpg) | — |
| 444 | 69 DRESS_WEAR_SET | 2010963040503492608 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010963040503492608/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010963040503492608/main_result_de323b4803a3422fadc516be1c158233.jpg) | — |
| 445 | 69 DRESS_WEAR_SET | 2010962897360285696 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010962897360285696/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010962897360285696/main_result_a10761add3cc4cbf944c06bef3eb3d85.jpg) | — |
| 446 | 69 DRESS_WEAR_SET | 2010962533525385216 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010962533525385216/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010962533525385216/main_result_a7dad5f5d2f8438da306249b85ffcd48.jpg) | — |
| 447 | 69 DRESS_WEAR_SET | 2010960025985904640 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010960025985904640/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010960025985904640/main_result_1e0da9283653495c81c53c40ca3c0bae.png) | — |
| 448 | 69 DRESS_WEAR_SET | 2010959720435052544 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959720435052544/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959720435052544/main_result_6a4b8c1ed0d04c98bf961ee0c1af6bb0.jpg) | — |
| 449 | 69 DRESS_WEAR_SET | 2010959585374269440 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959585374269440/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959585374269440/main_result_c7edd58575d540e59d149f8f05022f74.png) | — |
| 450 | 69 DRESS_WEAR_SET | 2010959234147446784 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959234147446784/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959234147446784/main_result_0550b590e3fb46fba46f75c8e27b6513.jpg) | — |
| 451 | 69 DRESS_WEAR_SET | 2010959126689378304 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959126689378304/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959126689378304/main_result_a45690baa84b41ee9f619d11bfe329b3.jpg) | — |
| 452 | 69 DRESS_WEAR_SET | 2010959071039352832 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959071039352832/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010959071039352832/main_result_dd75f59bf0ef4c259cc5c38c4e804e74.jpg) | — |
| 453 | 69 DRESS_WEAR_SET | 2010958894127804416 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958894127804416/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958894127804416/main_result_abe792929e9648869b213a6c65db2eb3.jpg) | — |
| 454 | 69 DRESS_WEAR_SET | 2010958835940225024 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958835940225024/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958835940225024/main_result_7342fea7ca1f4e5d81442b63ffd7bd02.jpg) | — |
| 455 | 69 DRESS_WEAR_SET | 2010958432540454912 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958432540454912/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958432540454912/main_result_8ecdf43127be4c24976a8eb13916b1be.jpg) | — |
| 456 | 69 DRESS_WEAR_SET | 2010958265976254464 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958265976254464/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010958265976254464/main_result_8195d49e40664b5d91f98d2e65668319.jpg) | — |
| 457 | 69 DRESS_WEAR_SET | 2010957828158025728 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010957828158025728/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010957828158025728/main_result_214538654e6149ae94b36ca83ffc6fce.png) | — |
| 458 | 69 DRESS_WEAR_SET | 2010957567209402368 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010957567209402368/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010957567209402368/main_result_f8f92fb1b3e8482a837ef5b01d6a5abd.png) | — |
| 459 | 69 DRESS_WEAR_SET | 2010685390236753920 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685390236753920/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685390236753920/main_result_6177cc4d02e848fa936e85b687bdeed8.jpg) | — |
| 460 | 69 DRESS_WEAR_SET | 2010685206895337472 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685206895337472/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685206895337472/main_result_7321d0a83190400f9d650b61e6843d28.jpg) | — |
| 461 | 69 DRESS_WEAR_SET | 2010685066205798400 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685066205798400/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010685066205798400/main_result_f1910ff23c754fbb8e3b9b528e31beb1.png) | — |
| 462 | 69 DRESS_WEAR_SET | 2010684062882144256 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010684062882144256/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010684062882144256/main_result_e1d23957c9244a5a9dbfe617079b1478.png) | — |
| 463 | 69 DRESS_WEAR_SET | 2010683853808672768 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683853808672768/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683853808672768/main_result_93318e249a2e4694beddacf33629dac6.jpg) | — |
| 464 | 69 DRESS_WEAR_SET | 2010683783411474432 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683783411474432/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683783411474432/main_result_c7f7c58c78ac48be8edcdb28ce75bb17.jpg) | — |
| 465 | 69 DRESS_WEAR_SET | 2010683353734389760 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683353734389760/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683353734389760/main_result_896137bfb3eb4085bdfee7e1c4cb532f.jpg) | — |
| 466 | 69 DRESS_WEAR_SET | 2010683204337475584 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683204337475584/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010683204337475584/main_result_0fb98a59927f41f69bd96a441917d44b.jpg) | — |
| 467 | 69 DRESS_WEAR_SET | 2010586696086798336 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010586696086798336/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010586696086798336/main_result_52da6d3c344544269c0a0a0371508fbe.png) | — |
| 468 | 69 DRESS_WEAR_SET | 2010585844961853440 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010585844961853440/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010585844961853440/main_result_4dd9b895f36d4701ae0b9d693796cd6b.jpg) | — |
| 469 | 69 DRESS_WEAR_SET | 2010584628039073792 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010584628039073792/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010584628039073792/main_result_7b862becb4d44bc497938d58e4a26d03.jpg) | — |
| 470 | 69 DRESS_WEAR_SET | 2010538281869066240 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010538281869066240/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/WEAR_COLLECTION/2010538281869066240/main_result_cc91912774074ca0b7e4ba54eacf4178.png) | — |
| 471 | 70 NEW_CHANGEBG | 2009206302771146701 | 雪景 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146701/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146701/main_result_20a5ac5e2d1b40a286aab1cd889cddb3.webp) | — |
| 472 | 70 NEW_CHANGEBG | 2009206302771146711 | 城堡 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146711/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146711/main_result_766e45702d3e4f849d0191b670ab6bd1.webp) | — |
| 473 | 70 NEW_CHANGEBG | 2009206302771146710 | 教堂 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146710/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146710/main_result_b5073e9927e54c119c2419c5c313d737.webp) | — |
| 474 | 70 NEW_CHANGEBG | 2009206302771146709 | 欧式建筑 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146709/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146709/main_result_f833a63b57bf4642a3e3a250c709b853.webp) | — |
| 475 | 70 NEW_CHANGEBG | 2009206302771146708 | 写字楼 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146708/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146708/main_result_9af2e5fbe1344b19a21ac98ce362c726.webp) | — |
| 476 | 70 NEW_CHANGEBG | 2009206302771146707 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146707/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146707/main_result_74411ec4593f409abb3d5bc585b6589f.webp) | — |
| 477 | 70 NEW_CHANGEBG | 2009206302771146706 | 简约 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146706/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146706/main_result_a8609781b0144d12a8393257aba3bb53.webp) | — |
| 478 | 70 NEW_CHANGEBG | 2009206302771146705 | 涂鸦墙 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146705/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146705/main_result_136cf06751854cf48cba05becedb77ca.webp) | — |
| 479 | 70 NEW_CHANGEBG | 2009206302771146704 | 雪山 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146704/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146704/main_result_ba89d66b4e6446888f071fac970a03cc.webp) | — |
| 480 | 70 NEW_CHANGEBG | 2009206302771146703 | 酒吧 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146703/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146703/main_result_b3aad47fcdf849cba9dd5ef195458314.webp) | — |
| 481 | 70 NEW_CHANGEBG | 2009206302771146702 | 海滩 | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146702/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_CHANGE_SCENE_NEW/2009206302771146702/main_result_83c66c113a334874b20f235cfdc16d0c.webp) | — |
| 482 | 71 PRODUCT_IMAGE_SUITE | 2026855585971982336 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2026855585971982336/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2026855585971982336/main_result_fd1a22ad85a948c29fb295ff13deb899.jpg) | — |
| 483 | 71 PRODUCT_IMAGE_SUITE | 2026854347385622528 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2026854347385622528/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2026854347385622528/main_result_0e9106ab684d4597a5d372e11d8cf77e.png) | — |
| 484 | 71 PRODUCT_IMAGE_SUITE | 2008849264547028909 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2008849264547028909/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2008849264547028909/main_result_3d0fd6bb9242436593c8b1f6ffa5fbea.jpg) | — |
| 485 | 71 PRODUCT_IMAGE_SUITE | 2052656145868357632 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2052656145868357632/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2052656145868357632/main_result_70b4518f8d7f4c1fa148a95a1fb2ce1c.png) | — |
| 486 | 71 PRODUCT_IMAGE_SUITE | 2049791360688578560 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2049791360688578560/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2049791360688578560/main_result_cbee67ad5c6249d89db0dcf57b474ba8.png) | — |
| 487 | 71 PRODUCT_IMAGE_SUITE | 2048645339790995456 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2048645339790995456/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2048645339790995456/main_result_25a7ea3fcef64bacaeefed13b8b5d1a5.jpg) | — |
| 488 | 71 PRODUCT_IMAGE_SUITE | 2048646069000105984 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2048646069000105984/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2048646069000105984/main_result_0b0a377417e0470d8b8fe1a53c7b48e3.jpg) | — |
| 489 | 71 PRODUCT_IMAGE_SUITE | 2037116582322327552 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2037116582322327552/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2037116582322327552/main_result_c953e739a22543548d87f9100fe70676.jpg) | — |
| 490 | 71 PRODUCT_IMAGE_SUITE | 2037115898130681856 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2037115898130681856/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2037115898130681856/main_result_9fe5ee62fb514c099999f8e64916309a.jpg) | — |
| 491 | 71 PRODUCT_IMAGE_SUITE | 2035901013554167808 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2035901013554167808/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2035901013554167808/main_result_d6ffd401bbe64605817b35d4a91be61a.jpg) | — |
| 492 | 71 PRODUCT_IMAGE_SUITE | 2035911132090269696 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2035911132090269696/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2035911132090269696/main_result_29c4ea27b7c9475e985dcb2dda7f56a1.jpg) | — |
| 493 | 71 PRODUCT_IMAGE_SUITE | 2032412870417752064 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2032412870417752064/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2032412870417752064/main_result_878b86a3f84844279599063d97a412a3.jpg) | — |
| 494 | 71 PRODUCT_IMAGE_SUITE | 2032294709400985600 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2032294709400985600/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2032294709400985600/main_result_de9aaa3ddde4442c8c8edc77fba07e63.jpg) | — |
| 495 | 71 PRODUCT_IMAGE_SUITE | 2028424512657182720 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028424512657182720/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028424512657182720/main_result_f1ba8f7c74d34e9abfd98439a0e52014.jpg) | — |
| 496 | 71 PRODUCT_IMAGE_SUITE | 2028384697144332288 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028384697144332288/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028384697144332288/main_result_829e90354c02447a98091417a1a25370.png) | — |
| 497 | 71 PRODUCT_IMAGE_SUITE | 2028387370723725312 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028387370723725312/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028387370723725312/main_result_73bfc9073002447a95adbdf7f0e776a5.jpg) | — |
| 498 | 71 PRODUCT_IMAGE_SUITE | 2028387188518965248 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028387188518965248/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028387188518965248/main_result_51f578ba779c4c0ebf426d6ee11f77d8.jpg) | — |
| 499 | 71 PRODUCT_IMAGE_SUITE | 2028400296826261504 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028400296826261504/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2028400296826261504/main_result_a8f9a8bd38cf4c32b2d48ffbc8538a38.jpg) | — |
| 500 | 71 PRODUCT_IMAGE_SUITE | 2019675097706561536 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019675097706561536/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019675097706561536/main_result_d0f476741ebf462aafe59bb8489d33ea.jpg) | — |
| 501 | 71 PRODUCT_IMAGE_SUITE | 2019697152908886016 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019697152908886016/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019697152908886016/main_result_d884196e0a9449b8b17f76c5e68e1024.jpg) | — |
| 502 | 71 PRODUCT_IMAGE_SUITE | 2011681772462436352 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011681772462436352/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011681772462436352/main_result_bae57e27946f4669bba87dd333a29d90.jpg) | — |
| 503 | 71 PRODUCT_IMAGE_SUITE | 2011337089922191360 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011337089922191360/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011337089922191360/main_result_04f605892d39403fbc9a528c49b598c4.png) | — |
| 504 | 71 PRODUCT_IMAGE_SUITE | 2026974468833824768 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2026974468833824768/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2026974468833824768/main_result_f055a2c4cebe4e6db7766471ada6fecd.jpg) | — |
| 505 | 71 PRODUCT_IMAGE_SUITE | 2009186705338691508 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009186705338691508/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009186705338691508/main_result_b3ad9df4446b4055b9f89e2ffc8f1d81.jpg) | — |
| 506 | 71 PRODUCT_IMAGE_SUITE | 2011325081730502656 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011325081730502656/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011325081730502656/main_result_ba364b5bf72d4ad186e3eb7d6613f18e.jpg) | — |
| 507 | 71 PRODUCT_IMAGE_SUITE | 2021469198126972928 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2021469198126972928/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2021469198126972928/main_result_41e6063d72854d4795a799c4deb76d3c.png) | — |
| 508 | 71 PRODUCT_IMAGE_SUITE | 2021514778018611200 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2021514778018611200/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2021514778018611200/main_result_e8e57d3bcfe74d9c874a730d98cb4564.png) | — |
| 509 | 71 PRODUCT_IMAGE_SUITE | 2019726436646027264 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019726436646027264/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019726436646027264/main_result_47caed4cc379479c971e6aff7bb993de.jpg) | — |
| 510 | 71 PRODUCT_IMAGE_SUITE | 2019674765005979648 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019674765005979648/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2019674765005979648/main_result_8c44e76868a54877b56461421a82d975.jpg) | — |
| 511 | 71 PRODUCT_IMAGE_SUITE | 2011727853267218432 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011727853267218432/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011727853267218432/main_result_62d1e33dd771488e87cec89acba7b904.jpg) | — |
| 512 | 71 PRODUCT_IMAGE_SUITE | 2011325984118231040 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011325984118231040/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011325984118231040/main_result_a403db1b330549cf8ed7bc4c5543c1c0.png) | — |
| 513 | 71 PRODUCT_IMAGE_SUITE | 2011707383910264832 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011707383910264832/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011707383910264832/main_result_cce45e566cd74284aa2000d42935f935.jpg) | — |
| 514 | 71 PRODUCT_IMAGE_SUITE | 2011702589795627008 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011702589795627008/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011702589795627008/main_result_f217d9a00d31439f9851ac7dfe87cc9a.jpg) | — |
| 515 | 71 PRODUCT_IMAGE_SUITE | 2011686671753441280 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011686671753441280/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011686671753441280/main_result_8c1864e6be9e423d883710a18a2ce53e.jpg) | — |
| 516 | 71 PRODUCT_IMAGE_SUITE | 2011694425352204288 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011694425352204288/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011694425352204288/main_result_3a69cc7b64c94108b2efb7ebe9efd829.jpg) | — |
| 517 | 71 PRODUCT_IMAGE_SUITE | 2011341529567809536 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011341529567809536/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2011341529567809536/main_result_836221341553496088615fde621002e8.jpg) | — |
| 518 | 71 PRODUCT_IMAGE_SUITE | 2009186156518207401 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009186156518207401/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009186156518207401/main_result_c0a0b2d27d2c4c76af16d2ead188758f.png) | — |
| 519 | 71 PRODUCT_IMAGE_SUITE | 2009197856378220503 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009197856378220503/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009197856378220503/main_result_8359ded7cf454e7f9b514e6793be0aac.jpg) | — |
| 520 | 71 PRODUCT_IMAGE_SUITE | 2009195348360589307 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009195348360589307/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009195348360589307/main_result_ee2492bdae4048a0a0048a47e2f482b9.jpg) | — |
| 521 | 71 PRODUCT_IMAGE_SUITE | 2009195111889924005 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009195111889924005/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009195111889924005/main_result_ed5cc6a08ae34f44b2fb1ba070399e73.jpg) | — |
| 522 | 71 PRODUCT_IMAGE_SUITE | 2009195036698636204 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009195036698636204/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2009195036698636204/main_result_1315cc92d84e467c918c7935942e44bd.jpg) | — |
| 523 | 71 PRODUCT_IMAGE_SUITE | 2008849666751429111 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2008849666751429111/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/PRODUCT_MARKET_MATERIAL_V2/2008849666751429111/main_result_48b2be915235436b8efffc5e940d31e7.jpg) | — |
| 524 | 73 SALE_VIDEO | 2100165491226886144 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165491226886144/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165491226886144/main_result_c47038d70f52498ba85620302704bcf3.mp4) | — |
| 525 | 73 SALE_VIDEO | 2100165301518516224 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165301518516224/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165301518516224/main_result_7a7c74eb82c84a86bc60b2194f53f040.mp4) | — |
| 526 | 73 SALE_VIDEO | 2100165008420552704 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165008420552704/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165008420552704/main_result_82b5953089fd4e6ab855aff549933216.mp4) | — |
| 527 | 73 SALE_VIDEO | 2100165421043597312 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165421043597312/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165421043597312/main_result_e45916ee03e243d087095d8706bfa31f.mp4) | — |
| 528 | 73 SALE_VIDEO | 2100165079824384000 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165079824384000/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165079824384000/main_result_53717b3fcbe242bf8cd4523d74f42fb3.mp4) | — |
| 529 | 73 SALE_VIDEO | 2100165168127066112 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165168127066112/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165168127066112/main_result_5919134adb5e493e839fba71c77b345e.mp4) | — |
| 530 | 73 SALE_VIDEO | 2100165236305477632 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165236305477632/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165236305477632/main_result_fe82fbb90f3f46e88d8a01da06db11ce.mp4) | — |
| 531 | 73 SALE_VIDEO | 2100165572135010304 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165572135010304/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165572135010304/main_result_24924c0b47fd4edeb9a7fb9e6878629f.mp4) | — |
| 532 | 73 SALE_VIDEO | 2100165721938771968 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165721938771968/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165721938771968/main_result_10e04fb3f5d54e9e96bb90b7b7cbb897.mp4) | — |
| 533 | 73 SALE_VIDEO | 2100165638753140736 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165638753140736/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SALES_VIDEO/2100165638753140736/main_result_6be9ae0ac05241c5a67bc8b20b229d68.mp4) | — |
| 534 | 88 IMAGE_REPLICATION | 2065349391958458368 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065349391958458368/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065349391958458368/main_result_fe5fc578497745acb2d5cd1e07d6c4bf.jpg) | — |
| 535 | 88 IMAGE_REPLICATION | 2065347785347088384 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065347785347088384/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065347785347088384/main_result_e5bd8ddb26e34de3b53ac83bd2f46cc1.jpg) | — |
| 536 | 88 IMAGE_REPLICATION | 2065344637337387008 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065344637337387008/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065344637337387008/main_result_c8d2edcb2e334a3fa5206d9da934f50f.jpg) | — |
| 537 | 88 IMAGE_REPLICATION | 2065345559174103040 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065345559174103040/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065345559174103040/main_result_781d52c88c884e1da83dc36ca4b749b9.jpg) | — |
| 538 | 88 IMAGE_REPLICATION | 2065062320584835072 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062320584835072/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062320584835072/main_result_9e855bd889b54a11a4b03482bd6bc951.jpg) | — |
| 539 | 88 IMAGE_REPLICATION | 2065062282538303488 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062282538303488/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062282538303488/main_result_cba0d1f236b24e9192b33fa0c7348a26.jpg) | — |
| 540 | 88 IMAGE_REPLICATION | 2065062245838143488 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062245838143488/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062245838143488/main_result_76e586e6f0524e4483731299b84f88ca.png) | — |
| 541 | 88 IMAGE_REPLICATION | 2065062200120229888 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062200120229888/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062200120229888/main_result_a8f7626b817541038e61fba8237275b2.jpg) | — |
| 542 | 88 IMAGE_REPLICATION | 2065062137524436992 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062137524436992/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062137524436992/main_result_479b68b74557424d835c8dfefb91d639.png) | — |
| 543 | 88 IMAGE_REPLICATION | 2065062086077104128 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062086077104128/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062086077104128/main_result_6ba9d2836022472483eb36aa7a3e8bf4.jpg) | — |
| 544 | 88 IMAGE_REPLICATION | 2065062050425520128 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062050425520128/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065062050425520128/main_result_f8cbd7f4b6be4aaab9b630e03edcb9dc.jpg) | — |
| 545 | 88 IMAGE_REPLICATION | 2065061964563922944 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065061964563922944/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065061964563922944/main_result_48f907d5d15f468dba8a9128a8c05658.jpg) | — |
| 546 | 88 IMAGE_REPLICATION | 2065061889288749056 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065061889288749056/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065061889288749056/main_result_e509406d4c0449aaa08719f90768aac7.png) | — |
| 547 | 88 IMAGE_REPLICATION | 2065061850281721856 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065061850281721856/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_REPLICATION/2065061850281721856/main_result_21647c0f2cc145e6ae1ba8d23ae26d7d.jpg) | — |
| 548 | 89 VIDEO_REPLICATION | 2077742382737195008 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742382737195008/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742382737195008/main_result_4394d3ffac624229b00cac5615da9a62.mp4) | 有 |
| 549 | 89 VIDEO_REPLICATION | 2077742200305942528 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742200305942528/image.png) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742200305942528/main_result_dbbc07ae583a4af8ba91ca4d9d681aa2.mp4) | 有 |
| 550 | 89 VIDEO_REPLICATION | 2077742088984920064 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742088984920064/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742088984920064/main_result_7ac7eb09547c4789a9281a59c9034c56.mp4) | 有 |
| 551 | 89 VIDEO_REPLICATION | 2077741640857092096 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741640857092096/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741640857092096/main_result_a13a3dd504334fa381ae25e5475b952f.mp4) | 有 |
| 552 | 89 VIDEO_REPLICATION | 2077741421771816960 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741421771816960/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741421771816960/main_result_f321bdbcb38144bd8e12df00681c5499.mp4) | 有 |
| 553 | 89 VIDEO_REPLICATION | 2077741173448048640 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741173448048640/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741173448048640/main_result_3160b5b9341540bebf6f6525b5dd4bfb.mp4) | 有 |
| 554 | 89 VIDEO_REPLICATION | 2065069943115792384 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2065069943115792384/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2065069943115792384/main_result_6bf61931b7374ff1b48c689651a2e351.mp4) | 有 |
| 555 | 89 VIDEO_REPLICATION | 2077729562469183488 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077729562469183488/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077729562469183488/main_result_b16464d9cb2b4fc8b4a7f39051fc0f81.mp4) | 有 |
| 556 | 93 CHANGE_COLOR_V2 | 2069709136760979456 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069709136760979456/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069709136760979456/main_result_9eb0be03307c435a863279ff7a065e01.webp) | — |
| 557 | 93 CHANGE_COLOR_V2 | 2069708039199703040 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069708039199703040/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069708039199703040/main_result_4b75bb05152543bfb6f4bbb52ab39455.webp) | — |
| 558 | 93 CHANGE_COLOR_V2 | 2069701719159521280 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701719159521280/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701719159521280/main_result_d1e4f33c836c4004bad5b9236bffd56b.webp) | — |
| 559 | 93 CHANGE_COLOR_V2 | 2069701694094360576 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701694094360576/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701694094360576/main_result_b316d71607254d3a97167db35eb089b9.webp) | — |
| 560 | 93 CHANGE_COLOR_V2 | 2069701670895665152 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701670895665152/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701670895665152/main_result_e184582174754378abf15b14690fb7dd.webp) | — |
| 561 | 93 CHANGE_COLOR_V2 | 2069701649789927424 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701649789927424/image.jpeg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069701649789927424/main_result_10fa40862325486ba875eae83fe9e55b.webp) | — |
| 562 | 93 CHANGE_COLOR_V2 | 2069702668275990528 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069702668275990528/image.webp) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069702668275990528/main_result_ca6b48fbb48749838fd781a822c63fd6.webp) | — |
| 563 | 93 CHANGE_COLOR_V2 | 2069702584540905472 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069702584540905472/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069702584540905472/main_result_04b9f11dc1ea47e2a0ecceb1df4d4b1e.webp) | — |
| 564 | 93 CHANGE_COLOR_V2 | 2069697783476305920 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697783476305920/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697783476305920/main_result_4e5edf3a028b44c1aa14898ae9bb9641.webp) | — |
| 565 | 93 CHANGE_COLOR_V2 | 2069697726140170240 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697726140170240/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697726140170240/main_result_dbc328845cf14910adc92e44fc3cd5ce.webp) | — |
| 566 | 93 CHANGE_COLOR_V2 | 2069697672071397376 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697672071397376/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697672071397376/main_result_0c897d0ae8924c039f0f76b3d93a0526.webp) | — |
| 567 | 93 CHANGE_COLOR_V2 | 2069697624348606464 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697624348606464/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2069697624348606464/main_result_bf23c21423ac4db9aeb99ae93e7a6aa8.webp) | — |
| 568 | 93 CHANGE_COLOR_V2 | 2068993868619366400 | — | 1.0 | [封面](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2068993868619366400/image.jpg) | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/CHANGE_COLOR_V2/2068993868619366400/main_result_e003d19606aa47168dd7cd62d8b689af.webp) | — |
| 569 | 95 AI_VIDEO_EDITING | 2082065985074851840 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082065985074851840/main_result_db12a5509fe7423f92816240f5e6d25a.mp4) | 有 |
| 570 | 95 AI_VIDEO_EDITING | 2082041399322628096 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041399322628096/main_result_a34c2cdb104a4d54bb9d453e35adf85b.mp4) | 有 |
| 571 | 95 AI_VIDEO_EDITING | 2082041466284691456 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041466284691456/main_result_38f821cdac864e7989bcdf952f53e2b9.mp4) | 有 |
| 572 | 95 AI_VIDEO_EDITING | 2082041065204371456 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041065204371456/main_result_2d9fbcc9ee3d429dacbcc72baa95f581.mp4) | 有 |
| 573 | 95 AI_VIDEO_EDITING | 2082293949154177024 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082293949154177024/main_result_1d7e5a6be06948699d03817de53519f2.mp4) | 有 |
| 574 | 95 AI_VIDEO_EDITING | 2082041148394196992 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041148394196992/main_result_f40c441575bb4c579b504d3a932c7a3c.mp4) | 有 |
| 575 | 95 AI_VIDEO_EDITING | 2081990093401313280 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2081990093401313280/main_result_33715ed9c1d24b6f9dd9eae932532a30.mp4) | 有 |
| 576 | 95 AI_VIDEO_EDITING | 2082041210646056960 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041210646056960/main_result_0ed394aa17834414aee058989803c38b.mp4) | 有 |
| 577 | 96 VIDEO_TRANSLATION | 2089621186087292928 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621186087292928/main_result_61ba5a8d67454854bc002a91af910727.mp4) | — |
| 578 | 96 VIDEO_TRANSLATION | 2089621905838247936 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621905838247936/main_result_26aa93d28457417084ed41203a87f711.mp4) | — |
| 579 | 96 VIDEO_TRANSLATION | 2089621839601799168 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621839601799168/main_result_36ee626a89f64deaaaecb10f81bcad38.mp4) | — |
| 580 | 96 VIDEO_TRANSLATION | 2089621761814237184 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621761814237184/main_result_cc388c5b04ca4cf6aab1a35aa1385e19.mp4) | — |
| 581 | 96 VIDEO_TRANSLATION | 2089621672542670848 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621672542670848/main_result_a5032a4352074eaa8c50248f3e28cbab.mp4) | — |
| 582 | 96 VIDEO_TRANSLATION | 2089621592431464448 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621592431464448/main_result_8f3a5226a3124e96b878f43b24e023e8.mp4) | — |
| 583 | 96 VIDEO_TRANSLATION | 2089621379218214912 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621379218214912/main_result_06afed8be4ff4249a7391c9b3002cf1f.mp4) | — |
| 584 | 96 VIDEO_TRANSLATION | 2089621297886466048 | — | 1.0 | — | [结果](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_TRANSLATION/2089621297886466048/main_result_030b18bcd1bb46e786c546c70e8f7652.mp4) | — |

## 完整案例 prompt

共 189 条，以下不做摘要或截断。

### 1. type=1 AI_DRAW / 非39工具 · case 1744313326904590336

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313326904590336/main_result_46dd0861056642c3a7797f400457677c.jpeg)

~~~text
Simple style living room, deep beige style, monochrome shadow, HD image, soft romantic scene
~~~

### 2. type=1 AI_DRAW / 非39工具 · case 1744314565155405824

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314565155405824/main_result.jpeg)

~~~text
the lady is smiling while holding a flower on her face, in the style of the stars art group (xing xing), snapshot realism, nightcore, appropriation artist, eerily realistic, blurry details, photo-realistic hyperbole
~~~

### 3. type=1 AI_DRAW / 非39工具 · case 1744314498952511488

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314498952511488/main_result.jpeg)

~~~text
Craft a comfortable and stylish pair of slippers in a serene, homely background. The slippers should convey a sense of warmth, ease, and luxury. Try to emphasize the slippers' soft, plush texture and their comfortable fit. Imagine them being worn on a relaxed morning, casually placed next to a cozy living room couch with a softly lit ambiance, hinting at ultimate home comfort. Color preference for the slippers can be soothing earth tones or neutral hues for a universal appeal
~~~

### 4. type=1 AI_DRAW / 非39工具 · case 1744314450353111040

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314450353111040/main_result.jpeg)

~~~text
Imagine a serene coffee shop setting with a chic, porcelain cup in the center. It's sitting elegantly on a rustic wooden table, with gentle sunlight pouring in from a nearby window, casting a soft glow. A lush, potted plant peeks into the corner of the frame
~~~

### 5. type=1 AI_DRAW / 非39工具 · case 1744314377649045504

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314377649045504/main_result.jpeg)

~~~text
教室内孩子们在认真的学习绘画技巧
~~~

### 6. type=1 AI_DRAW / 非39工具 · case 1744314311509065728

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314311509065728/main_result.jpeg)

~~~text
米白色墙，中间白色美式窗户，窗户外绿植草地，左边放沙发，右边放绿植盆裁，实木地板，有柔和的阳光照进来
~~~

### 7. type=1 AI_DRAW / 非39工具 · case 1744314230131179520

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314230131179520/main_result.jpeg)

~~~text
欧美家庭的婴儿房，地上有毛绒地毯，房中有婴儿床，墙上挂着一些星球和宇宙飞船之类的玩具挂饰
~~~

### 8. type=1 AI_DRAW / 非39工具 · case 1744314140729589760

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314140729589760/main_result.jpeg)

~~~text
客厅,白天,晴天,HDR,全景视角,简单背景
~~~

### 9. type=1 AI_DRAW / 非39工具 · case 1744314058621894656

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744314058621894656/main_result.jpeg)

~~~text
猫,花园,白天,晴天,HDR
~~~

### 10. type=1 AI_DRAW / 非39工具 · case 1744313980582674432

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313980582674432/main_result.jpeg)

~~~text
令人惊叹的鸡尾酒莫吉托照片，背景是阳光明媚的夏日海滩
~~~

### 11. type=1 AI_DRAW / 非39工具 · case 1744313777561583616

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313777561583616/main_result.jpeg)

~~~text
这是一张家庭办公桌的平铺照片，由木头制成，背面是iPhone，简约，干净，4k，真实感，景深
~~~

### 12. type=1 AI_DRAW / 非39工具 · case 1744313681214226432

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313681214226432/main_result.jpeg)

~~~text
food photography, asphodel cake, ivory, pastel yellow, soft golden colors, three dimensional, depth of field, uhd image, crisp and clear image, cinematic photography, detailed
~~~

### 13. type=1 AI_DRAW / 非39工具 · case 1744313616617750528

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313616617750528/main_result.jpeg)

~~~text
White jade pure Guanyin Bodhisattva, Stand, hands clasped together, facing forward, pious, high brightness, high light, photography, head halo, high picture brightness, ultra-clear image
~~~

### 14. type=1 AI_DRAW / 非39工具 · case 1744313423092563968

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313423092563968/main_result.jpeg)

~~~text
在故宫，一个10岁的中国女孩抱着一只猫走在紫禁城
~~~

### 15. type=1 AI_DRAW / 非39工具 · case 1744313252543774720

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313252543774720/main_result.jpeg)

~~~text
带窗户的厨房中的白色台面，宁静简约的风格，柔和的色调过渡，大气的构图布局
~~~

### 16. type=1 AI_DRAW / 非39工具 · case 1744313215168331776

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313215168331776/main_result.jpeg)

~~~text
简约卧室风格，浅色系家具，木质地板，窗台，光与空间
~~~

### 17. type=1 AI_DRAW / 非39工具 · case 1744313174504554496

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313174504554496/main_result.jpeg)

~~~text
现代厨房的木质台面，现代与传统的混合风格，不同的木纹，大胆的黑色线条，强调自然
~~~

### 18. type=1 AI_DRAW / 非39工具 · case 1744313126085509120

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313126085509120/main_result.jpeg)

~~~text
木质地板，酒店房间，夜景风格，柔焦技术，极简背景，写实，细节渲染，浅琥珀色
~~~

### 19. type=1 AI_DRAW / 非39工具 · case 1744313074420072448

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744313074420072448/main_result.jpeg)

~~~text
简约,厨房,北欧风格
~~~

### 20. type=1 AI_DRAW / 非39工具 · case 1744312974692106240

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312974692106240/main_result.jpeg)

~~~text
夏日的日本乡间小路，一群戴着小黄帽的小学生放学
~~~

### 21. type=1 AI_DRAW / 非39工具 · case 1744312849538269184

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312849538269184/main_result.jpeg)

~~~text
美式厨房,逼真的,拍照的写实风格
~~~

### 22. type=1 AI_DRAW / 非39工具 · case 1744312776779677696

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312776779677696/main_result.jpeg)

~~~text
冬天,有屋顶的露台,美国风清,常规视角,写实拍照
~~~

### 23. type=1 AI_DRAW / 非39工具 · case 1744312569732055040

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1744312569732055040/main_result.jpeg)

~~~text
post classic, portrait photography, boho outfit, super realistic woman, sitting in a street coffee shop, with a small greek laurels gold crown, drinking coffee in modern Athens, dusk blurred Parthenon in the background
~~~

### 24. type=1 AI_DRAW / 非39工具 · case 1743154520449355776

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743154520449355776/main_result_99c0598b6f594d7cba238bd2c5bdae04.jpeg)

~~~text
Shaggy Rogers, Photography, nice shot, Fullbody, Canon EOS R6, Handsome
~~~

### 25. type=1 AI_DRAW / 非39工具 · case 1743149634257162240

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743149634257162240/main_result_65cc76b34ef64c579d89e0b2893f7dfb.jpeg)

~~~text
Cinematic film still of a brunette with braided bun hair in her thirties wearing a black wool trench coat over an ochre turtleneck and jeans. She is walking through the streets of Montmartre on a sunny autumn day, enjoying the vivid street life.
~~~

### 26. type=1 AI_DRAW / 非39工具 · case 1743148624159707136

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743148624159707136/main_result_9c89f6ca9a974916bcad1e54206f1452.jpeg)

~~~text
a woman in a dress and pants standing next to a store, in the style of portraits with soft lighting, timeless beauty, dark white and light gray, effortlessly chic, tenwave, photobash, accurate and detailed --ar 127:128
~~~

### 27. type=1 AI_DRAW / 非39工具 · case 1743146644775374848

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743146644775374848/main_result_187a8c5344134ab2add6da282850f9ef.jpeg)

~~~text
traditional victorian townhouse, architects office space, contemporary design, minimalist in the style of norm architects and john pawson, 4k, high quality --v 5.2 --ar 16:9
~~~

### 28. type=1 AI_DRAW / 非39工具 · case 1743146596696068096

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1743146596696068096/main_result_0c0e889a65f34017ad6c1db89a3da9c4.jpeg)

~~~text
modern industrial design office, brick wall, concrete floor, metal on wall
~~~

### 29. type=1 AI_DRAW / 非39工具 · case 1742830918644199424

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742830918644199424/main_result_13c93fd10e184a4ebb27385244953140.jpeg)

~~~text
Minimalist, modern living room with large windows, high-quality, Photorealistic, Natural light, Clean design, minimal furniture, neutral color palette --ar 16:9
~~~

### 30. type=1 AI_DRAW / 非39工具 · case 1742485401196228608

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742485401196228608/main_result_c7b48619baac42c6bebf67095bcadd89.jpeg)

~~~text
Cheerful teenage bedroom decorated in a pastel color scheme, incorporating unique decor, quirky accessories, and a touch of Scandinavian design, inspired by the playful work of designer Joy Cho, captured with a Canon EOS 5D Mark IV and a Canon EF 24-70mm f/2.8L II USM lens, production quality, professional color grading, depth of field, sharp-focus, long exposure time, award-winning photography, realistic photography, hyper-realistic
~~~

### 31. type=1 AI_DRAW / 非39工具 · case 1742485343096729600

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742485343096729600/main_result_467c4666d2d34d6295ec483d92a575cc.jpeg)

~~~text
a scooter ,luxury,capsule,future mache,side view,industrial design,motorcycle design,car design,matte finishing,white background,white environment,straight side view,studio lighting,ultra realistic,ultra detail,ultra realistc material,wide angle lens,8K HD
~~~

### 32. type=1 AI_DRAW / 非39工具 · case 1742485229540143104

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742485229540143104/main_result_565995f57cdd4e82ae0fcf2a40a9a216.jpeg)

~~~text
design for luxury bag fashion for sell on website, The small bags feature the brand name “LinkFox” elegantly displayed on them. The logo design is sophisticated and enhances the brand's fashion and luxury identity. The photography focuses on advertising small yran bag. sakura small bag. The overall aesthetic exudes a sense of luxury and simplicity, capturing the essence of the brand's elegance. attractive, lighting. HD。
~~~

### 33. type=1 AI_DRAW / 非39工具 · case 1742388453403582464

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388453403582464/main_result_d143bdf82b5142ea80d589b9e2a47bf7.jpeg)

~~~text
在故宫，一个10岁的中国女孩抱着一只猫走在紫禁城
~~~

### 34. type=1 AI_DRAW / 非39工具 · case 1742388430062280704

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388430062280704/main_result_09143889748f4e0cb01d619582d06b57.jpeg)

~~~text
little boy,hidden clearings in the wood, view from the sky
~~~

### 35. type=1 AI_DRAW / 非39工具 · case 1742388410583932928

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388410583932928/main_result_6f98d4d6cbfd498585c1d66c889f014d.jpeg)

~~~text
a female teacher with glass , in the class - room , teching , holding tion , UI illustration , minimalism , white background , bright color scheme book
~~~

### 36. type=1 AI_DRAW / 非39工具 · case 1742388388677083136

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388388677083136/main_result_24e83ef5437142a28f9ed215af7869ff.jpeg)

~~~text
Design a letter X 3D stereo, water material, surface splash feeling, interior light blue, conceptual product design, futuristic, exquisite, 3D effect, full body display
~~~

### 37. type=1 AI_DRAW / 非39工具 · case 1742388233030656000

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1742388233030656000/main_result_2b86b0c96af54cf8b43356c8f7fc710d.jpeg)

~~~text
设计一个金边的陶瓷咖啡杯，灵感来自洛阳龙门石窟奉贤寺的壁龛。杯身应采用轮廓线条，灵感来自龙门山的轮廓，设计有防滑曲线。杯盖的把手应设计成卢舍纳石窟佛像的形状。
~~~

### 38. type=1 AI_DRAW / 非39工具 · case 1740557627646332928

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740557627646332928/main_result_76c45c59e5c24f88bbb3add88fd8c62d.jpeg)

~~~text
an indoor living room with a golden painting, in the style of outdoor art, realistic rendering, lightbox, eco-friendly craftsmanship
~~~

### 39. type=1 AI_DRAW / 非39工具 · case 1740557570440220672

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740557570440220672/main_result_62dcb35937614d958d5cc8bb8739fbc9.jpeg)

~~~text
table in the sun with vases on the wall behind it, in the style of earthy organic shapes, australian tonalism, contrasting lights and darks, japanese minimalism, sunrays shine upon it, mingei, naturalistic renderings
~~~

### 40. type=1 AI_DRAW / 非39工具 · case 1740549176220241920

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740549176220241920/main_result_674479193d204043b47fa1dd1ba33a74.jpeg)

~~~text
灯光明亮的场地下，三个小女孩在游乐场玩蹦蹦床
~~~

### 41. type=1 AI_DRAW / 非39工具 · case 1740538477507039232

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740538477507039232/main_result_aa5486e6bde0411595854356aa8c8c67.jpeg)

~~~text
an arched entrance to someone's house at harvard johnson hall, in the style of zack snyder, light-filled, spectacular backdrops, dark beige and emerald, hinchel or, asher brown durand, midwest gothic
~~~

### 42. type=1 AI_DRAW / 非39工具 · case 1740538392618520576

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740538392618520576/main_result_a37f5b161b6d4ed2a33d1aac51239aa1.jpeg)

~~~text
a model wearing an exclusive emerald necklace and earrings set, in the style of photo taken with nikon d750, nabis
~~~

### 43. type=1 AI_DRAW / 非39工具 · case 1740372087273738240

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740372087273738240/main_result_8434ea8c906d4da98ead364d6fd0efef.jpeg)

~~~text
室内,窗边,万圣节氛围,冬天,客厅,逼真的
~~~

### 44. type=1 AI_DRAW / 非39工具 · case 1740338346157461504

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740338346157461504/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740338346157461504/main_result_54f5592dfc8f43818cfe18878a3e83a6.jpeg)

~~~text
一台炫酷的机箱摆放在电竞房的桌子上
~~~

### 45. type=1 AI_DRAW / 非39工具 · case 1740338229127991296

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_DRAW/1740338229127991296/main_result_b1e0e3b9161a478e81771b684a7fcb51.jpeg)

~~~text
一个有着可爱的长卷发的女孩，坐在窗台前，太阳落在她的脸颊上
~~~

### 46. type=5 SIMILAR / 非39工具 · case 1740557714699112448

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557714699112448/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557714699112448/main_result_d8ee7f6ed0e641a190249938afb8b59b.jpg)

~~~text
treehouse cat scratcher trees, in the style of emphasis on texture, velvety textures, tabletop photography, cute cartoonish designs, emerald and amber, joong keun lee, white and brown
~~~

### 47. type=5 SIMILAR / 非39工具 · case 1742485520448679936

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485520448679936/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485520448679936/main_result_58ef0bc6fc924d308754f45449f1d6d4.jpg)

~~~text
a pink and yellow bedroom with a colorful bed, in the style of light sky-blue and light orange, cute cartoonish designs, pastel academia, light turquoise, captivating, cute and colorful, multi-layered
~~~

### 48. type=5 SIMILAR / 非39工具 · case 1740557769019543552

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557769019543552/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740557769019543552/main_result_0ff39f24f6304b78b8f4e4a507935fb2.jpg)

~~~text
a bottle of jo malone's new cherry blossom perfume, in the style of metropolis meets nature, light orange and bronze, beautiful women, romantic landscape, 8k, john nash, serge marshennikov
~~~

### 49. type=5 SIMILAR / 非39工具 · case 1744316421659213824

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316421659213824/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316421659213824/main_result.jpg)

~~~text
empty room with black sofa, table, lamp and planter. photo concept, in the style of eco-friendly craftsmanship, light gray and beige, cottagepunk, restored and repurposed, neo-traditionalist, metallic accents, vivid color scheme
~~~

### 50. type=5 SIMILAR / 非39工具 · case 1744316337966071808

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316337966071808/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316337966071808/main_result.jpg)

~~~text
empty room with black sofa, table, lamp and planter. photo concept, in the style of eco-friendly craftsmanship, light gray and beige, cottagepunk, restored and repurposed, neo-traditionalist, metallic accents, vivid color scheme
~~~

### 51. type=5 SIMILAR / 非39工具 · case 1744316252918169600

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316252918169600/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316252918169600/main_result.jpg)

~~~text
a cup of coffee is on the table with coffee beans on the table beside it, in the style of smokey background, youthful energy, rendered in unreal engine, 1970–present, uhd image, glorious, exquisite craftsmanship
~~~

### 52. type=5 SIMILAR / 非39工具 · case 1744316071959117824

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316071959117824/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744316071959117824/main_result.jpg)

~~~text
a sign featuring a dachshund siting on top of a tub of soapy water, in the style of southern gothic-inspired, samuel smith, bold posters, basil gogos, soggy, patrick brown, iso 200
~~~

### 53. type=5 SIMILAR / 非39工具 · case 1744315980753977344

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315980753977344/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315980753977344/main_result.jpg)

~~~text
the embroidered calf rug art  border collie enjoy the dream, in the style of yoann lossel, jacek yerka, bold character designs, sam spratt, smokey background, eye-catching tags, forestpunk
~~~

### 54. type=5 SIMILAR / 非39工具 · case 1744315929956761600

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315929956761600/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315929956761600/main_result.jpg)

~~~text
an orange cat is sleeping inside a coral fleece
 blanket, in the style of emphasis on facial expressions, gray, david burdeny, faux naïf, sleepy, associated press photo, aurorapunk
~~~

### 55. type=5 SIMILAR / 非39工具 · case 1744315861593800704

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315861593800704/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315861593800704/main_result.jpg)

~~~text
this white leather sofa is in a living room, in the style of subtle color variations, eco-friendly craftsmanship
~~~

### 56. type=5 SIMILAR / 非39工具 · case 1744315767037411328

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315767037411328/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315767037411328/main_result.jpg)

~~~text
lily valley clock  time is what you've been dreaming about, in the style of album, folio and fan formats, explosive wildlife, intricate illustrations, sydney prior hall, pencilsteampunk, miwa komatsu, desertwave
~~~

### 57. type=5 SIMILAR / 非39工具 · case 1744315714084323328

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315714084323328/image.jpeg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315714084323328/main_result.jpg)

~~~text
snow sport, mnob  female snowboarding suit in black, in the style of dynamic pose, tonal
~~~

### 58. type=5 SIMILAR / 非39工具 · case 1744315551706038272

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315551706038272/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315551706038272/main_result.jpg)

~~~text
ar15 rifle with light and light, in the style of large format lens, black background, thermal camera, long lens, minolta srt-101, precise craftsmanship, dazecore
~~~

### 59. type=5 SIMILAR / 非39工具 · case 1744315500074156032

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315500074156032/image.jpeg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315500074156032/main_result.jpg)

~~~text
an anime girl sitting near a lake with long hair, in the style of traditional chinese, dark gray and light bronze, loose and fluid, multilayered, happenings, fashwave, close-up
~~~

### 60. type=5 SIMILAR / 非39工具 · case 1744315416821415936

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315416821415936/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315416821415936/main_result.jpg)

~~~text
a cup with a scene of mountains, rivers and wavy designs, in the style of spherical sculptures, dark white and gold, gold leaf accents, heather theurer, hiroshi nagai, embroidery, japanese-style landscapes
~~~

### 61. type=5 SIMILAR / 非39工具 · case 1744315353101549568

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315353101549568/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315353101549568/main_result.jpg)

~~~text
an iphone case with a leaf design sitting on a table, in the style of light beige and green, uhd image, colored cartoon style, opacity and translucency
~~~

### 62. type=5 SIMILAR / 非39工具 · case 1744315308377686016

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315308377686016/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315308377686016/main_result.jpg)

~~~text
rose gold balloon arch, in the style of limited color range, kitty lange kielland, monochromatic palette, dau al set, pinkcore, charles willson peale, cottagecore
~~~

### 63. type=5 SIMILAR / 非39工具 · case 1744315151930146816

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315151930146816/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315151930146816/main_result.jpg)

~~~text
a painting of a beach with chairs with an umbrella, in the style of realistic bird paintings, light teal and red, rustic scenes, golden light, solapunk, strip painting, birds-eye-view
~~~

### 64. type=5 SIMILAR / 非39工具 · case 1744315041628340224

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315041628340224/image.jpeg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1744315041628340224/main_result.jpg)

~~~text
a picnic umbrella under the table, in the style of light brown, 32k uhd, nature's wonder, smooth and curved lines, uhd image, leather/hide, light brown and light beige
~~~

### 65. type=5 SIMILAR / 非39工具 · case 1743144720827158528

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1743144720827158528/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1743144720827158528/main_result_6596029e02464fc085159984acd1ad6f.jpg)

~~~text
the elegant purple dress, in the style of vintage academia, bold and playful, dreamlike quality, rounded, fairytale-inspired, elegant simplicity, retro vintage
~~~

### 66. type=5 SIMILAR / 非39工具 · case 1742485620877094912

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485620877094912/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1742485620877094912/main_result_3ede90b8368847d4a5b86f3fe9ceda62.jpg)

~~~text
two lamps are sitting on a table, in the style of dark turquoise and dark beige, classic americana, schlieren photography, dark green and beige, bright luster, functionality emphasis, 15th century
~~~

### 67. type=5 SIMILAR / 非39工具 · case 1740549831500550144

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549831500550144/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549831500550144/main_result_e69a346107414e229995dba583e28a00.jpg)

~~~text
small cup of coffee made on a blue saucer, in the style of light indigo and dark beige, vibrant coloration, soft-focus, soft mist, flawless line work, zeiss batis 18mm f/2.8, yankeecore
~~~

### 68. type=5 SIMILAR / 非39工具 · case 1740549445561667584

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549445561667584/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740549445561667584/main_result_1bf16f9b682848759f75da27ea730c15.jpg)

~~~text
a mother and baby swimming in a pool, in the style of uhd image, glossy finish
~~~

### 69. type=5 SIMILAR / 非39工具 · case 1740538628992716800

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538628992716800/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538628992716800/main_result_9bc6ea0b861b4309bd4a69af6856d080.jpg)

~~~text
beautiful wedding hair ornament, in the style of light pink and light amber, 32k uhd, dansaekhwa, floral, light brown, happenings, detailed texture
~~~

### 70. type=5 SIMILAR / 非39工具 · case 1740538549976223744

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538549976223744/image.jpeg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740538549976223744/main_result_cb8ce771114a477885cb7cf9b8bf9454.jpg)

~~~text
master bedroom in the southern master bedroom in charleston mississippi, in the style of enchanting lighting, light beige and light amber, eclectic design, rug, secessionist style, light pink and beige, vibrant color choices
~~~

### 71. type=5 SIMILAR / 非39工具 · case 1740372217704009728

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740372217704009728/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740372217704009728/main_result_aa4ce1fc31084b9e9685873703f0f209.jpg)

~~~text
portrait of a green sofa with blanket, vase and plants, in the style of rendered in cinema4d, romantic colors, georg jensen, use of fabric, softly organic, fine lines, delicate curves, cute and quirky
~~~

### 72. type=5 SIMILAR / 非39工具 · case 1740338007375138816

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740338007375138816/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740338007375138816/main_result_cb48eecda9da4783a30771475ebb757f.jpg)

~~~text
an illustration of a blue and white dress, in the style of detailed, layered compositions, vintage academia, pastel gothic, traditional color scheme, illustration
~~~

### 73. type=5 SIMILAR / 非39工具 · case 1740337913523392512

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740337913523392512/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_TO_IMAGE/1740337913523392512/main_result_5d77543ef07c4206868894e79fce53cb.jpg)

~~~text
green baby booties on bed with blue pants and black shirt, in the style of light maroon and light brown, 21st century, scoutcore, precision and detail-oriented, atmospheric mood, samikshavad, colorful washes
~~~

### 74. type=13 PRODUCT_SCENE / 商品场景图 · case 1983831220118597632

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831220118597632/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831220118597632/main_result_c70e756458aa492fb8dae1a0cebaddc8.webp)

~~~text
Replace the background with a serene lakeside campsite at dawn, with soft morning light filtering through distant trees and mist rising from the calm water in the background. Ensure the camping tent is naturally placed on a flat patch of grass near the water's edge. Add the campfire grill and a stack of firewood next to the tent. The camera angle should be Side View (侧面) and identical for all outputs. Keep the product’s position and scale and the general layout. Remove any overlaid icons/graphics. Do not change the product’s appearance, color, material, or texture. Preserve original shadows and reflections; harmonize lighting to the scene.
~~~

### 75. type=13 PRODUCT_SCENE / 商品场景图 · case 1984091344636719104

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984091344636719104/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984091344636719104/main_result_90459da3467a4800ba42113404905442.webp)

~~~text
Replace the background with a modern living room featuring a minimalist coffee table, abstract art on the wall, and large floor-to-ceiling windows. Use a slightly elevated eye-level angle to maintain the chair's original position and scale. Ensure the chair is realistically placed on a light-colored rug with soft shadows beneath it. Keep the exact texture, color, and material of the chair intact. Use bright, diffuse studio lighting with neutral white color temperature.||Replace the background with a cozy reading nook in a contemporary home library, featuring bookshelves filled with books, a small side table with a lamp, and warm ambient lighting. Maintain the same camera angle and scale. Position the chair naturally on a textured area rug. Preserve the original material, color, and reflections of the chair. Ensure lighting is bright and evenly diffused with a neutral white tone.||Replace the background with a serene bedroom scene featuring a platform bed with neutral bedding, a nightstand with a vase of flowers, and a large window with sheer curtains. Use the same perspective and scale. Place the chair beside the bed as if part of the room’s decor. Ensure realistic shadowing and surface interaction while preserving the chair’s original appearance. Lighting must be bright and neutral white.||Replace the background with a stylish boutique showroom setting, including a wooden display shelf with decorative objects and a clean white wall with subtle architectural details. Use the same camera angle and scale. Position the chair on a polished concrete floor with soft ambient reflection. Maintain all original visual characteristics of the chair. Ensure lighting is bright, even, and neutral white for commercial clarity.
~~~

### 76. type=13 PRODUCT_SCENE / 商品场景图 · case 1740339005955035136

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339005955035136/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339005955035136/main_result_bb0efd63b20542ee80bf4c46f4e08f2a.png)

~~~text
a pair of headphones sitting on a table
~~~

### 77. type=13 PRODUCT_SCENE / 商品场景图 · case 1740552538122670080

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552538122670080/image.jpeg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552538122670080/main_result_94f042cb4b3244679baeeff1582eef40.png)

~~~text
a cup of coffee sitting on top of a pile of leaves in a park with trees in the background
~~~

### 78. type=13 PRODUCT_SCENE / 商品场景图 · case 1740537621810302976

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740537621810302976/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740537621810302976/main_result_89dd7e7aa3184bd7a49da33de3f80dc2.png)

~~~text
a pair of slippers with a bunny on them sitting on a table next to donuts and donut holes
~~~

### 79. type=13 PRODUCT_SCENE / 商品场景图 · case 1740552324171223040

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552324171223040/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740552324171223040/main_result_49df618ca3834e0e9354ac14f96a311e.png)

~~~text
a cat laying in a blue and gold pet bed on the floor of a living room with a yellow chair
~~~

### 80. type=13 PRODUCT_SCENE / 商品场景图 · case 1984090628450922496

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090628450922496/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090628450922496/main_result_34af6bf2f2524feab10161860ac020b5.webp)

~~~text
Modify the background of the product image according to the description, keeping the product's size ratio, shooting angle, and position unchanged. The background must adapt to the detected Front View of the product. Here is a description of the background: An inviting reading nook with a plush boucle armchair to the side, set against a calm, pale gray-blue wall, creating a serene and luxurious atmosphere. Add a woven basket with a throw blanket beside the armchair. Ensure the product remains naturally placed on a high-pile area rug. Maintain layout integrity and realistic grounding; avoid glare and harsh highlights; preserve natural shadows and reflections.
~~~

### 81. type=13 PRODUCT_SCENE / 商品场景图 · case 1984090535073132544

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090535073132544/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090535073132544/main_result_e2f5a8223a614cb9beada02999222036.webp)

~~~text
Modify the background of the product image according to the description, keeping the product's size ratio, shooting angle, and position unchanged. The background needs to adapt to the shooting angle of the product. Here is the description of the background: A bright playroom setting featuring a soft, low-pile cream-colored carpet. In the slightly blurred foreground, the corner of a woven toy basket adds depth. The background is a clean wall with several plush animal toys resting nearby. The space is filled with evenly diffused, warm-neutral light, creating a cozy atmosphere with a gentle contact shadow beneath the product, consistent with the original camera angle.
~~~

### 82. type=13 PRODUCT_SCENE / 商品场景图 · case 1984090429255036928

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090429255036928/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1984090429255036928/main_result_8128dbe0df6147939c3c6c5e1e1b3345.webp)

~~~text
Replace the background with a cozy Scandinavian-style bedroom with soft, diffuse morning light and a light gray wall. Ensure the white tower fan is naturally placed on the light oak floor, with a plush cream-colored rug partially visible. Add the corner of a neatly made bed with a beige linen duvet in the background. Use the same eye-level front-right view as detected from the original image. Maintain composition and realism. Remove any UI/watermarks. Do not modify color/material/texture. Preserve existing shadows/reflections; adjust ambient only.
~~~

### 83. type=13 PRODUCT_SCENE / 商品场景图 · case 1983846127195107328

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983846127195107328/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983846127195107328/main_result_a177d60d523a473bb908361d2f049eca.webp)

~~~text
Modify the background of the product image according to the description, keeping the product's size ratio, shooting angle, and position unchanged. The background must adapt to the detected Side View (侧面) of the product. Here is the description of the background: A spacious, contemporary bedroom with a polished light gray floor, bathed in bright morning light that highlights the rug's texture. Add a bed with neutral-toned linens partially visible in the background. Ensure the product remains naturally placed on the polished light gray floor. Preserve contact shadows and ambient reflections; do not alter product geometry; keep lighting soft and evenly diffused.
~~~

### 84. type=13 PRODUCT_SCENE / 商品场景图 · case 1983831377144950784

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831377144950784/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831377144950784/main_result_0cb89ae460014605b800b028b74d2d2e.webp)

~~~text
Replace the background with a bright, clean utility room with minimalist white shelving in the background under even, diffused lighting. Ensure the enclosed cat litter box is naturally placed on a light gray tiled floor. Add a wicker storage basket on a lower shelf.Maintain the same eye-level front view for consistency across outputs. Prioritize realism and coherence. Remove icons/graphics. Do not change product appearance. Preserve shadows/reflections; avoid glare and harsh highlights.
~~~

### 85. type=13 PRODUCT_SCENE / 商品场景图 · case 1983831155903803392

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831155903803392/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831155903803392/main_result_5e0c454587f94b57b6368ad13328d45d.webp)

~~~text
Replace the background with a tidy suburban backyard featuring a perfectly manicured green lawn, with a clean wooden fence and flower beds blurred softly in the background. Ensure the child's pink and yellow bicycle with training wheels is naturally placed on the lush green lawn. Maintain the same low-angle 45-degree front-left view for consistency across outputs. Prioritize realism and coherence. Remove icons/graphics. Do not change product appearance. Preserve shadows/reflections; avoid glare and harsh highlights.
~~~

### 86. type=13 PRODUCT_SCENE / 商品场景图 · case 1983831102560645120

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831102560645120/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983831102560645120/main_result_a6d57cdf16244185ab20cc68c4fa7dfe.webp)

~~~text
Replace the background with a cozy Scandinavian-style child's room with warm white walls and a natural pine wood floor, bathed in soft, diffuse light. Ensure the children's comforter and pillow set is naturally placed on a white wooden single bed. Add a plush beige rug under the bed and a single wall shelf with a couple of small, cute toys in the background.Use the same 45-degree front view as detected from the original image. Maintain composition and realism. Remove any UI/watermarks. Do not modify color/material/texture. Preserve existing shadows/reflections; adjust ambient only.
~~~

### 87. type=13 PRODUCT_SCENE / 商品场景图 · case 1983805839680450560

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983805839680450560/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983805839680450560/main_result_d7259032142e462a923a239c1b535b43.webp)

~~~text
Replace the background with a bright sunroom featuring floor-to-ceiling windows that look out onto a softly blurred green garden. Ensure the golden retriever in a patterned dog bed with a water dispenser is naturally placed on a polished light gray concrete floor. Add a large potted fiddle-leaf fig plant in the corner. Maintain the same Side View (侧面) for consistency across outputs. Prioritize realism and coherence. Remove icons/graphics. Do not change product appearance. Preserve shadows/reflections; avoid glare and harsh highlights.
~~~

### 88. type=13 PRODUCT_SCENE / 商品场景图 · case 1983780547578540032

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780547578540032/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780547578540032/main_result_f7ead3c55f4c4789b25ec055f9234d69.webp)

~~~text
Replace the background with a cozy children's bedroom nightstand scene featuring a soft blanket and storybook. Use an eye-level front view. Ensure the rabbit-shaped nightlight is realistically placed on the surface, glowing warmly. Keep the exact position, scale, and lighting intact. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a minimalist nursery shelf with wooden toys and a small potted plant. Use an eye-level front view. Ensure the rabbit nightlight is positioned naturally on the shelf, glowing softly. Maintain original proportions and texture. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a serene bedside table in a calm bedroom, featuring a glass of water and a book. Use an eye-level front view. Ensure the rabbit nightlight is realistically placed on the table, emitting a gentle glow. Preserve its original appearance and scale. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a soft-textured rug in a child's playroom, surrounded by plush toys and a small chair. Use an eye-level front view. Ensure the rabbit nightlight is grounded and positioned naturally on the floor, glowing warmly. Maintain its original form and material integrity. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.
~~~

### 89. type=13 PRODUCT_SCENE / 商品场景图 · case 1983780450664951808

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780450664951808/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983780450664951808/main_result_372af6f6db9d45b39460f9210cb749f2.webp)

~~~text
Replace the background with a bright, minimalist children's desk scene featuring a white wooden surface, scattered colored pencils, and a notebook. Use a slightly elevated eye-level angle. Ensure the pink cat-shaped pencil case remains in its original position, scale, and orientation, resting naturally on the desk. Keep the lighting bright and diffuse with neutral white color temperature to enhance product visibility.||Replace the background with a cozy art studio table covered with sketchbooks, watercolor paints, and a cup of pens. Use a slightly elevated eye-level angle. Ensure the pencil case is placed realistically on the table with the colored pencils beside it. Maintain the exact position, scale, and camera perspective. Use bright, even studio lighting with neutral white color temperature.||Replace the background with a neatly organized school backpack open on a wooden floor, revealing notebooks and stationery. Use a low-angle shot to emphasize the pencil case resting beside the backpack. Preserve the original position, scale, and visual integrity of the product. Ensure lighting is bright and diffuse with neutral white color temperature for clarity and realism.||Replace the background with a soft pastel-colored bedroom shelf filled with books, a small plant, and a framed picture. Use an eye-level front view. Ensure the pencil case lies flat on the shelf with the colored pencils arranged beside it. Maintain the original scale, position, and camera angle. Use bright, uniform lighting with neutral white color temperature to highlight the product’s details.
~~~

### 90. type=13 PRODUCT_SCENE / 商品场景图 · case 1983779885243412480

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983779885243412480/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983779885243412480/main_result_537615aa78a54b5d941db507ff9484ac.webp)

~~~text
Replace the background with a minimalist living room coffee table scene featuring a textured wool throw and a ceramic vase. Use a low-angle front view. Ensure both candles remain upright and positioned naturally on the table surface, maintaining original scale and lighting. Keep the flame glow soft and realistic. Ensure ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a modern bedroom nightstand scene including a sleek alarm clock and a small potted succulent. Use a low-angle front view. Ensure the candles are placed side by side on the wooden surface, preserving their original position and scale. Maintain the natural flame illumination and clean shadows. Ensure ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a cozy reading nook featuring a leather armchair, an open book, and a floor lamp in the background. Use a low-angle front view. Ensure the candles are realistically placed on a round side table, maintaining exact position, scale, and lighting. Preserve the warm glow of the flames without color cast. Ensure ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a spa-style bathroom vanity scene with a stone sink, folded towels, and a glass bottle of hand soap. Use a low-angle front view. Ensure the candles are placed on the countertop, maintaining original orientation and scale. Keep the flame visible and softly glowing. Ensure ambient lighting is bright and diffuse, reflecting a neutral white color temperature.
~~~

### 91. type=13 PRODUCT_SCENE / 商品场景图 · case 1983037133948858368

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983037133948858368/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1983037133948858368/main_result_72fed3bf4fbb49e18035b16476785580.webp)

~~~text
Replace the background with a minimalist modern living room featuring a wooden coffee table, soft natural light from a nearby window, and neutral-toned decor. Ensure the black cylindrical speaker with a fabric handle is naturally placed on the wooden table. Add a small potted plant in a ceramic vase next to the speaker. The camera angle should be eye-level front view. Keep the product’s position and scale and the general layout. Remove any overlaid icons/graphics. Do not change the product’s appearance, color, material, or texture. Preserve original shadows and reflections; harmonize lighting to the scene.||Replace the background with a cozy home office space with a warm wooden desk, a laptop subtly open in the background, and a soft ambient glow from an overhead lamp. Ensure the black cylindrical speaker with a fabric handle is naturally placed on the wooden table. Add a small potted plant in a ceramic vase next to the speaker. The camera angle should be eye-level 45-degree front-left view. Keep the product’s position and scale; keep layout integrity. Remove icons/graphics. Do not alter product appearance. Preserve original shadows/reflections; use soft side-light if unspecified.||Replace the background with a sunlit balcony setting with a rustic wooden table, a woven chair partially visible, and greenery in the distance. Ensure the black cylindrical speaker with a fabric handle is naturally placed on the wooden table. Add a small potted plant in a ceramic vase next to the speaker. The camera angle should be eye-level 45-degree front-right view. Keep the product’s position and scale; maintain composition. Remove any UI/watermarks. Do not modify the product’s color/material/texture. Preserve existing shadows/reflections; adjust ambient only.||Replace the background with
~~~

### 92. type=13 PRODUCT_SCENE / 商品场景图 · case 1982733693691506688

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982733693691506688/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982733693691506688/main_result_883c9a08957a4be99f093e75903c3acb.webp)

~~~text
Replace the background with a modern airport terminal gate area featuring seating, luggage carts, and digital flight boards. Use an eye-level front view. Ensure the suitcase is realistically placed on the floor with its handle extended. Keep the exact position, scale, and camera perspective. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a clean hotel lobby scene featuring a reception desk, potted plants, and a marble floor. Use an eye-level front view. Ensure the suitcase stands upright on the floor, naturally positioned near a check-in counter. Keep the exact position, scale, and camera perspective. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a minimalist travel packing station in a bedroom, including a bed, clothing, and a travel bag on a table. Use an eye-level front view. Ensure the suitcase is placed upright on the floor beside the bed. Keep the exact position, scale, and camera perspective. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a bright, empty train station platform with benches and signage visible in the distance. Use an eye-level front view. Ensure the suitcase stands upright on the platform floor, naturally positioned as if waiting for a traveler. Keep the exact position, scale, and camera perspective. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.
~~~

### 93. type=13 PRODUCT_SCENE / 商品场景图 · case 1982003556029181952

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982003556029181952/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982003556029181952/main_result_7ae131da2c2d428e8d81fbca9d13c9e3.webp)

~~~text
Replace the background with a city sidewalk scene during light rain, featuring wet pavement and blurred storefronts. Use a low-angle side view to emphasize the umbrella's protective coverage. Keep the exact position, scale, and camera perspective. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a modern urban park bench on a drizzly day, with trees and distant pedestrians. Use a slightly elevated eye-level shot. Ensure the umbrella is realistically positioned above the bench as if in use. Maintain original scale, position, and lighting conditions.||Replace the background with a minimalist indoor entryway featuring a wooden floor, coat rack, and a small potted plant. Use a front-facing 45-degree angle. Ensure the umbrella is held upright in hand, naturally resting on the floor. Preserve its original appearance, shadows, and material texture. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a rainy street corner near a café with large windows and an awning. Use a medium-wide angle shot from a slight upward perspective. Position the umbrella as if being used by a person walking. Keep the exact position, scale, and visual integrity. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.
~~~

### 94. type=13 PRODUCT_SCENE / 商品场景图 · case 1982002493309988864

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982002493309988864/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982002493309988864/main_result_f3ceb5168ba54b95a9ed21d455b314f3.webp)

~~~text
Replace the background with a child's bedroom desk featuring colorful pencils, a small plant, and a notebook. Use an eye-level front view. Ensure the pig-themed water bottle is placed upright on the desk surface, maintaining its original position, scale, and camera perspective. Keep the product’s appearance, color, proportions, reflections, shadows, material, and texture unchanged. Use bright, diffuse studio lighting with neutral white color temperature.||Replace the background with a kindergarten classroom table surrounded by crayons, paper, and children's drawings. Use an eye-level front view. Ensure the water bottle is realistically placed on the table, standing upright. Preserve the exact position, scale, and visual integrity of the product. Maintain bright, even lighting with neutral white color temperature.||Replace the background with a playful outdoor picnic scene featuring a checkered blanket, fruit snacks, and a toy stuffed animal. Use an eye-level front view. Ensure the bottle is placed upright on the blanket, positioned naturally as if ready for use. Keep all original product details intact. Use bright, diffuse lighting with neutral white color temperature.||Replace the background with a clean, modern kitchen countertop near a sink with a dish towel and a fruit bowl in soft focus. Use an eye-level front view. Ensure the water bottle stands upright on the counter, preserving its original scale, position, and visual characteristics. Maintain consistent lighting—bright, diffuse, and neutral white—to enhance clarity and realism.
~~~

### 95. type=13 PRODUCT_SCENE / 商品场景图 · case 1982001967805640704

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001967805640704/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001967805640704/main_result_b2c77cfb5a6d4e1caa19c738da374a0a.webp)

~~~text
Replace the background with a well-lit artist's studio desk featuring a sketchpad, watercolor palette, and brushes. Use a high-angle 45-degree top-down view. Ensure the oil pastel set remains in its original position and scale within the open box, resting flat on the desk surface. Maintain bright, diffuse studio lighting with neutral white color temperature.||Replace the background with a modern art classroom table surrounded by student drawings, canvas boards, and an easel. Use a high-angle 45-degree top-down view. Keep the oil pastel set exactly as positioned, placed naturally on the tabletop. Ensure lighting is bright and even, reflecting a neutral white color temperature.||Replace the background with a minimalist creative workspace featuring a wooden drafting table, a laptop, and a cup of pencils. Use a high-angle 45-degree top-down view. Ensure the product remains in its original orientation and scale, placed flat on the table surface. Maintain bright, diffuse lighting with neutral white color temperature.||Replace the background with a clean art supply store display shelf lined with other drawing materials like charcoal and markers. Use a high-angle 45-degree top-down view. Keep the oil pastel set in its exact position and scale, resting flat on the shelf. Ensure lighting is bright and uniform, reflecting a neutral white color temperature.
~~~

### 96. type=13 PRODUCT_SCENE / 商品场景图 · case 1982001810284359680

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001810284359680/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001810284359680/main_result_07ecdf7256a94ebb8816e3a712bd9968.webp)

~~~text
Replace the background with a modern vanity table in a well-lit bedroom, featuring neatly arranged makeup products and a soft pink candle. Use an eye-level front view. Ensure the mirror remains upright on its stand with the makeup brush placed beside it as in the original image. Keep the exact position, scale, and lighting consistent. Use bright, diffuse studio lighting with neutral white color temperature.||Replace the background with a minimalist bathroom countertop with a marble finish, a glass soap dispenser, and a folded towel nearby. Use an eye-level front view. Maintain the mirror’s original position and scale, ensuring it stands naturally on the surface. The makeup brush should remain beside the base. Ensure ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a cozy dressing area featuring a wooden dresser, a small potted plant, and a stack of skincare jars. Use an eye-level front view. Preserve the mirror’s exact position, scale, and orientation. Ensure the makeup brush rests beside the base as shown. Use bright, even studio lighting with neutral white color temperature.||Replace the background with a clean, white bedside table in a contemporary bedroom, including a wireless charger and a reading lamp. Use an eye-level front view. Keep the mirror standing upright with the brush positioned beside it. Ensure all proportions and lighting remain consistent—bright, diffuse, and neutral white for commercial clarity.
~~~

### 97. type=13 PRODUCT_SCENE / 商品场景图 · case 1982001585113149440

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001585113149440/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001585113149440/main_result_df481473d2fe4cd588756e554453140d.webp)

~~~text
Replace the background with a modern living room floor featuring light wooden flooring and a minimalist sofa in the distance. Use an eye-level front view. Ensure the robot vacuum is realistically placed on the floor, maintaining its original position, scale, and camera perspective. Keep the product's appearance, color, proportions, reflections, shadows, material, and texture unchanged. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a clean, contemporary kitchen floor near a stainless steel island and open shelving. Use an eye-level front view. Ensure the robot vacuum is grounded and positioned naturally on the surface. Maintain the exact position, scale, and visual integrity of the product. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a sleek bedroom setting featuring a low-profile bed, nightstand, and soft rug. Use an eye-level front view. Ensure the robot vacuum is realistically placed on the hardwood floor, preserving its original orientation and scale. Keep all visual details intact, including reflections and material finish. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a spacious, well-lit hallway with glossy tile flooring and a wall-mounted coat rack in the background. Use an eye-level front view. Ensure the robot vacuum is placed naturally on the floor, maintaining its original position, scale, and camera angle. Preserve the product’s appearance, material, and reflections. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.
~~~

### 98. type=13 PRODUCT_SCENE / 商品场景图 · case 1982001152613298176

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001152613298176/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982001152613298176/main_result_a00f4f4702164296ad2a64bec1cc48f8.webp)

~~~text
Replace the background with a modern home theater setup featuring a large screen, soundbar, and ambient lighting. Use an eye-level front view. Ensure the speaker is realistically placed on a wooden media console with cables neatly routed. Keep the exact position, scale, and camera perspective. Maintain bright, diffuse studio lighting with neutral white color temperature.||Replace the background with a minimalist living room scene including a low-profile sofa, coffee table, and floor lamp. Use an eye-level front view. Position the speaker on a sleek side table next to a book and remote control. Preserve original scale, position, and lighting integrity. Ensure ambient lighting is bright and diffuse, reflecting neutral white color temperature.||Replace the background with a professional recording studio environment featuring acoustic panels, a mixing desk, and microphone stand. Use an eye-level front view. Place the speaker on a sturdy studio shelf beside audio equipment. Keep the exact position, scale, and camera angle. Ensure lighting remains bright, diffuse, and neutral in color temperature.||Replace the background with a clean, white desk setup in a home office, including a laptop, monitor, and wireless headphones. Use an eye-level front view. Position the speaker on the desk surface near the edge, slightly angled toward the viewer. Maintain original scale, placement, and reflections. Ensure lighting is bright, diffuse, and neutral white.
~~~

### 99. type=13 PRODUCT_SCENE / 商品场景图 · case 1982000418102587392

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000418102587392/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000418102587392/main_result_2f3053a740ae4bccb21ca04432eec31c.webp)

~~~text
Replace the background with a modern vanity table in a well-lit bedroom, featuring a sleek mirror, perfume bottles, and a small plant. Use a high-angle 45-degree top-down view. Ensure the eyeshadow palette remains open and positioned exactly as shown, with the included brush resting naturally in its slot. Keep the original scale, lighting, and reflections intact. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a minimalist makeup artist's workspace, including a clean white desk, professional lighting setup, and neatly arranged brushes. Use a high-angle 45-degree top-down view. Maintain the exact position, scale, and orientation of the palette. Ensure the product appears realistically placed on the surface with no distortion. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.||Replace the background with a stylish bathroom countertop scene, featuring a marble surface, glass soap dispenser, and folded towels. Use a high-angle 45-degree top-down view. Keep the palette open and centered, preserving its original scale and placement. Ensure the lighting remains consistent and bright with neutral white tones to enhance product visibility.||Replace the background with a soft-focus beauty studio setting, showing a cushioned chair, decorative flowers, and a side table with skincare products. Use a high-angle 45-degree top-down view. Ensure the palette stays open and undisturbed in its original position and scale. Maintain realistic shadows and reflections. Ensure the ambient lighting is bright and diffuse, reflecting a neutral white color temperature.
~~~

### 100. type=13 PRODUCT_SCENE / 商品场景图 · case 1982000205027749888

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000205027749888/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1982000205027749888/main_result_410d2c3409f946bebcec3cf226cbd36a.webp)

~~~text
Replace the background with a bright, modern living room featuring a neutral-colored sofa and a large window with soft daylight. Use an eye-level front view. Ensure the cat tree is realistically placed on a wooden floor, with the cat resting naturally on the top perch. Keep the exact position, scale, and camera perspective. Maintain the original lighting conditions with bright, diffuse studio-style illumination at a neutral white color temperature.||Replace the background with a cozy home office space with a desk, bookshelf, and houseplants. Use an eye-level front view. Ensure the cat tree stands firmly on the floor, positioned near a corner. Preserve the product’s original placement, scale, and visual integrity. Use bright, even lighting with a neutral white color temperature to enhance clarity and realism.||Replace the background with a minimalist apartment bedroom scene featuring a bed, nightstand, and wall art. Use an eye-level front view. Ensure the cat tree is grounded on the hardwood floor, with the cat sleeping peacefully on the top cushion. Maintain the original proportions, reflections, and texture of the product. Apply bright, diffuse lighting with a neutral white color temperature for commercial appeal.||Replace the background with a clean, sunlit hallway with light wood flooring and a decorative rug. Use an eye-level front view. Ensure the cat tree is positioned naturally against a wall, with ample space around it. Keep the product’s original scale, position, and camera angle intact. Use consistent bright, neutral lighting to highlight details without casting shadows or color casts.
~~~

### 101. type=13 PRODUCT_SCENE / 商品场景图 · case 1981999652193316864

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1981999652193316864/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1981999652193316864/main_result_6f94f971dd4f4d93a885d18a641fae86.webp)

~~~text
Replace the background with a cozy living room wall featuring a fireplace, plush sofa, and bookshelves. Use an eye-level front view. Ensure the framed painting is mounted centrally on the wall, maintaining its original position, scale, and ornate golden frame. Keep the lighting bright and diffuse with neutral white color temperature to enhance the artwork's visibility and realism.||Replace the background with a classic study room interior including a wooden desk, leather chair, and floor-to-ceiling bookcases. Use an eye-level front view. Ensure the painting is hung at eye level on the wall, preserving its exact position, scale, and decorative frame. Maintain bright, diffuse studio lighting with neutral white color temperature for clarity and elegance.||Replace the background with a luxurious bedroom setting featuring a large bed, nightstands, and soft drapery. Use an eye-level front view. Position the framed painting above the bed, keeping its original orientation, scale, and intricate gold detailing intact. Ensure ambient lighting is bright and evenly distributed with neutral white color temperature.||Replace the background with a modern gallery space with white walls, minimalist furniture, and recessed ceiling lights. Use an eye-level front view. Mount the painting on the wall in a central display position, preserving its original scale, framing, and visual integrity. Ensure lighting is bright, diffuse, and neutral white to highlight the artwork without glare or shadows.
~~~

### 102. type=13 PRODUCT_SCENE / 商品场景图 · case 1744309222887178240

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744309222887178240/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744309222887178240/main_result.png)

~~~text
a table topped with a white counter top covered in bottles and glasses and a kettle and a candle holder
~~~

### 103. type=13 PRODUCT_SCENE / 商品场景图 · case 1744308153788448768

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308153788448768/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308153788448768/main_result.png)

~~~text
a bottle of lotion and a bottle of lotion on a table in a room with a window
~~~

### 104. type=13 PRODUCT_SCENE / 商品场景图 · case 1744308017892999168

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308017892999168/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1744308017892999168/main_result.png)

~~~text
a snow globe sitting on top of a table next to a christmas tree and a small snowman on top of it
~~~

### 105. type=13 PRODUCT_SCENE / 商品场景图 · case 1743099341919940608

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1743099341919940608/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1743099341919940608/main_result_4b741e9e50de453fa5c55c95ef976155.png)

~~~text
a christmas tree with presents under it in a living room with a couch and a window with curtains and a christmas tree
~~~

### 106. type=13 PRODUCT_SCENE / 商品场景图 · case 1740339046786584576

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339046786584576/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/SCENE_FISSION/1740339046786584576/main_result_1048c2a96adb4027a220ba5d53729e4b.png)

~~~text
a cell phone is on a car dashboard with a gps device in the dashboard and mountains in the background
~~~

### 107. type=58 AI_POSTURE / AI摆姿 · case 1999440008972206080

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_POSE_FISSION/1999440008972206080/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MODEL_POSE_FISSION/1999440008972206080/main_result_b83494f6aa8a4ce79da6c3e49017d783.webp)

~~~text
旋转甩臂
~~~

### 108. type=61 SMART_REPAIR / 非39工具 · case 2049384373617631232

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384373617631232/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384373617631232/main_result_828e5ca978d34c71beee875101691a6d.png)

~~~text
生成亚马逊A+图，英文
~~~

### 109. type=61 SMART_REPAIR / 非39工具 · case 2049384487228743680

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384487228743680/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2049384487228743680/main_result_bbdc6be286914143b95c8d07a77c44c6.png)

~~~text
生成亚马逊A+图，英文
~~~

### 110. type=61 SMART_REPAIR / 非39工具 · case 2014617109262262272

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014617109262262272/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014617109262262272/main_result_c67babc1518c4479be255d0ab2facf34.png)

~~~text
将人台模特上的衣服穿到欧美男性真人模特上；展示服装的正面。背景为室外咖啡店外；准确识别服装细节，保持服装款式、长度材质纹理等细节不能变
~~~

### 111. type=61 SMART_REPAIR / 非39工具 · case 2014631578629595136

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014631578629595136/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014631578629595136/main_result_02f011e46fc14e95a1c583f6990cc03d.png)

~~~text
将人台模特上的裙子穿到欧美女性真人模特上；展示服装的正面。背景为室内派对；准确识别服装细节，保持服装款式、长度材质纹理等细节不能变
~~~

### 112. type=61 SMART_REPAIR / 非39工具 · case 2014304859355897856

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014304859355897856/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014304859355897856/main_result_7e2f7ef205bb4b2cafc07e34cbaea24f.png)

~~~text
将人台模特上的裙子穿到欧美女性真人模特上；展示服装的侧面，角度和人台保持一致。背景为室外派对场景；准确识别服装细节，保持服装款式、长度材质纹理等细节不能变
~~~

### 113. type=61 SMART_REPAIR / 非39工具 · case 2014305255742791680

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305255742791680/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305255742791680/main_result_c51f7354a0c34f8d9a8f9e68c87375e2.png)

~~~text
将人台模特上的裙子穿到欧美女性真人模特上；展示服装的正面。背景为公园小路场景；准确识别服装细节，保持服装款式、长度材质纹理等细节不能变
~~~

### 114. type=61 SMART_REPAIR / 非39工具 · case 2014305554553397248

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305554553397248/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/2014305554553397248/main_result_6051a3ff675a49a5873d732b17414ef1.png)

~~~text
将人台模特上的假发穿到欧美女性真人模特上；展示假发的正面，背景为纯色背景
~~~

### 115. type=61 SMART_REPAIR / 非39工具 · case 1978805287133302784

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805287133302784/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805287133302784/main_result_5238ea3dea2c469a948093c6c7e9bb04.png)

~~~text
衣服穿到欧美女模特身上，小麦色的肤色，金色的波浪长发，自然的姿势，衣服细节不变，卧室背景，光线自然
~~~

### 116. type=61 SMART_REPAIR / 非39工具 · case 1978805223807700992

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805223807700992/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978805223807700992/main_result_feb2c9f775414da79c662b736bffc320.png)

~~~text
衣服穿到欧美女模特身上，白皙的肤色，金色的波浪长发，自然的姿势，衣服细节不变，卧室背景，光线自然
~~~

### 117. type=61 SMART_REPAIR / 非39工具 · case 1978804994588987392

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804994588987392/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804994588987392/main_result_f3e4ceebd92a467cb09fb446fd51f476.png)

~~~text
衣服穿到欧美女模特身上，小麦肤色，自然的姿势，衣服细节不变，卧室背景，光线自然
~~~

### 118. type=61 SMART_REPAIR / 非39工具 · case 1978804969507049472

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804969507049472/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804969507049472/main_result_a73acd9332b5409baccb5250a0a571b6.png)

~~~text
提取模特的连衣裙生成亚马逊平铺白底图
~~~

### 119. type=61 SMART_REPAIR / 非39工具 · case 1978804951383461888

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804951383461888/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804951383461888/main_result_9fdd34a22ec241fb91bdbdb038da0707.png)

~~~text
一个男婴儿坐在手推车里睡觉，注意不要改变手推车
~~~

### 120. type=61 SMART_REPAIR / 非39工具 · case 1978804861822488576

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804861822488576/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804861822488576/main_result_ac286654da0a43e7b6403f89b285d189.png)

~~~text
杯子里加入可乐，有气泡的感觉，杯子细节不变
~~~

### 121. type=61 SMART_REPAIR / 非39工具 · case 1978804804624764928

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804804624764928/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804804624764928/main_result_6e486a945ca640058ebc629ab272f10b.png)

~~~text
一个花盆种开满花的长寿花，一个花盆种小雏菊，一个花盆种绿萝，其余不变，花盆细节保持一致
~~~

### 122. type=61 SMART_REPAIR / 非39工具 · case 1978804755278778368

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804755278778368/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804755278778368/main_result_096ce0e9c3e64de083960bdfc607140a.png)

~~~text
图中四个杯身要有很多密密麻麻黑色的 点点的大理石灰效果
~~~

### 123. type=61 SMART_REPAIR / 非39工具 · case 1978804731748732928

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804731748732928/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804731748732928/main_result_50ed786a67054646a2ee7e95e7abd91c.png)

~~~text
短裙换成长裙，其他保持不变
~~~

### 124. type=61 SMART_REPAIR / 非39工具 · case 1978804256160796672

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804256160796672/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978804256160796672/main_result_7f7b2852b75b420188846bc4204d8e0f.png)

~~~text
将室内的光线变成黄昏落日时候的光线，其他不变
~~~

### 125. type=61 SMART_REPAIR / 非39工具 · case 1978803739644841984

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803739644841984/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803739644841984/main_result_f7e9290b523e431486787fd97c77c6f1.png)

~~~text
保持其他元素不变，给图片中沙发上添加一位躺着的美国女性模特，外貌姣好，身材苗条，模特穿着一双袜子。
~~~

### 126. type=61 SMART_REPAIR / 非39工具 · case 1978803681222381568

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803681222381568/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803681222381568/main_result_642c1d040be649c68cf344fd8afb87c2.png)

~~~text
保持其他元素不变，给图片中在第一个碟子里放入牛排，在第二个碟子里放入意大利面。
~~~

### 127. type=61 SMART_REPAIR / 非39工具 · case 1978803613815721984

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803613815721984/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978803613815721984/main_result_ac38c3684ed948cf8eba073d5b616e51.png)

~~~text
请自然地从图片中移除人物，同时保持其他部分不变，确保移除后图像整体依然自然和谐。
~~~

### 128. type=61 SMART_REPAIR / 非39工具 · case 1978766177698287616

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978766177698287616/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978766177698287616/main_result_896b581927db4851b42b55c3ac348bb0.png)

~~~text
让模特换一个动作
~~~

### 129. type=61 SMART_REPAIR / 非39工具 · case 1978746075556843520

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978746075556843520/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978746075556843520/main_result_a3f706e7321c4476adcd9d5af9e08e4a.png)

~~~text
修复手机屏幕上的划痕
~~~

### 130. type=61 SMART_REPAIR / 非39工具 · case 1978742192948350976

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978742192948350976/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978742192948350976/main_result_b71e37430fde49869d316eedbf14bc72.png)

~~~text
为这个冰箱设计一款海报，展示商品卖点
~~~

### 131. type=61 SMART_REPAIR / 非39工具 · case 1978740666410438656

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740666410438656/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740666410438656/main_result_a086631b022b447d8f7528b915114309.webp)

~~~text
去掉图片中的水印，
~~~

### 132. type=61 SMART_REPAIR / 非39工具 · case 1978740632746954752

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740632746954752/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978740632746954752/main_result_109c38859fdd4c1d8e0d1e9a601cea08.png)

~~~text
请自然地从图片中移除图片左边的积木和后面书架，同时保持其他部分不变，确保移除后图像整体依然自然和谐。
~~~

### 133. type=61 SMART_REPAIR / 非39工具 · case 1978736356121350144

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978736356121350144/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978736356121350144/main_result_f9014f5c601f49faafd0168263c8abf1.png)

~~~text
把图中的右侧的酸奶包装的主要部分抠出来，并摆正放在图片正中间，去除所有多余的元素，背景只能有白色，生成一张白底商品图。
~~~

### 134. type=61 SMART_REPAIR / 非39工具 · case 1978734961435578368

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734961435578368/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734961435578368/main_result_f983cbe072cf4621a536b261bd86a251.png)

~~~text
让台灯发出水晶般淡蓝色光芒
~~~

### 135. type=61 SMART_REPAIR / 非39工具 · case 1978734568559316992

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734568559316992/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978734568559316992/main_result_081c2d20baf64531b33c649be6339f15.webp)

~~~text
保持图中模特服装和姿势不变，让模特模特的身材加点肌肉，肌肉要明显一点
~~~

### 136. type=61 SMART_REPAIR / 非39工具 · case 1978733700682321920

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733700682321920/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733700682321920/main_result_33707f7795984259bb03f1d3f151bb37.png)

~~~text
海报左上角添加品牌名：OAMMA，（字体复古活力风，颜色和商品文字颜色一致）围绕着商品添加文字：High SPF50+ Protection（配 “太阳盾牌” 图标）Skin-Nourishing Formula（配 “护肤精华滴” 图标）8-Hour Long-Lasting（配 “时钟” 图标）Lightweight & Non-Greasy（配 “透气水滴” 图标）
~~~

### 137. type=61 SMART_REPAIR / 非39工具 · case 1978733672333021184

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733672333021184/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733672333021184/main_result_6a262514f59346d49cc1f0b41a0f7fdf.png)

~~~text
保持风扇的位置和样式不变，将背景替换为一个办公室场景，确保产品在替换后的背景中依然清晰可见且保持原有风格。请给这个风扇生成一张商品海报图，，要求突出风扇风力大的效果。
~~~

### 138. type=61 SMART_REPAIR / 非39工具 · case 1978733597909291008

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733597909291008/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733597909291008/main_result_211d311cd6b543dab25ae2614b8793a4.png)

~~~text
请把这个图片，请按漫画风格重新设计
~~~

### 139. type=61 SMART_REPAIR / 非39工具 · case 1978733510801985536

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733510801985536/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733510801985536/main_result_2f295bf1d2f14dd7893795412d6c8bc5.png)

~~~text
消除眼镜镜片上的划痕和污渍，保持眼镜不变
~~~

### 140. type=61 SMART_REPAIR / 非39工具 · case 1978733482813394944

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733482813394944/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733482813394944/main_result_c53367036f85491b94b3b887b37d0467.png)

~~~text
消除图片中衣服右上角上的LOGO，并保持衣服不变
~~~

### 141. type=61 SMART_REPAIR / 非39工具 · case 1978733399225110528

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733399225110528/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733399225110528/main_result_901c7492610a4a7994ceecc40d6e2b38.png)

~~~text
请给这个羊毛衫，生成符合亚马逊规范的特写展示图，按下述要点构建: 1. 特写羊毛衫的材质，2.要高清放大图，3.领口的细节图
~~~

### 142. type=61 SMART_REPAIR / 非39工具 · case 1978733376986910720

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733376986910720/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733376986910720/main_result_334020cde8664631acc72ed15525acd8.png)

~~~text
修复图中衣服上的污渍
~~~

### 143. type=61 SMART_REPAIR / 非39工具 · case 1978733292190666752

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733292190666752/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733292190666752/main_result_3d02821382f54e348f9cf55e3dbfde63.png)

~~~text
请把图片中的沙发提取出来，生成一个女人在一个温馨的客厅坐着这个沙发 画面构图：对角线构图 视角为水平，清晰展现产品细节，背景元素与产品相呼应。 画面整体风格与氛围： 体现温馨，适合跨境电商的产品风格。
~~~

### 144. type=61 SMART_REPAIR / 非39工具 · case 1978733255280791552

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733255280791552/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733255280791552/main_result_575424c3909b4455a4526704ec75116e.png)

~~~text
把图中的猫换成小金毛狗
~~~

### 145. type=61 SMART_REPAIR / 非39工具 · case 1978733195688120320

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733195688120320/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733195688120320/main_result_e400ad77719a4782ab25f23d61490038.png)

~~~text
请给这个盆栽生成特写展示图，按下述要点构建: 1. 特写盆栽上的多肉植物
~~~

### 146. type=61 SMART_REPAIR / 非39工具 · case 1978733175995863040

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733175995863040/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733175995863040/main_result_d3195043125d4471b5d62875efa03a23.png)

~~~text
去掉图片中的水印
~~~

### 147. type=61 SMART_REPAIR / 非39工具 · case 1978733093288382464

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733093288382464/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733093288382464/main_result_bf7c33dada00482b99ee9c4213fab844.png)

~~~text
一个美女正做在这个椅子上一边看书一边喝咖啡，背景是一个光线充足的客厅， 画面构图： 中景镜头 视角为水平， 画面整体风格与氛围： 体现温馨。画面自然和谐，适合跨境电商的产品风格。
~~~

### 148. type=61 SMART_REPAIR / 非39工具 · case 1978733022496919552

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733022496919552/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978733022496919552/main_result_713d6c05123a4a6cabe78afb4a6a47b7.png)

~~~text
请把这个椅子请按田园风格重新设计，最终效果需符合追求朴实、自然，常见纯棉质地、小方格、碎花图案等元素，给人一种温馨、舒适的感觉
~~~

### 149. type=61 SMART_REPAIR / 非39工具 · case 1978732996538372096

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732996538372096/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732996538372096/main_result_00e4cfbd33c1409a82e5c1a34e3e8468.png)

~~~text
保持其他元素不变，给图片中的篮球运动员的左手上添加一个篮球
~~~

### 150. type=61 SMART_REPAIR / 非39工具 · case 1978732978913906688

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732978913906688/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732978913906688/main_result_62807841d986436e8c721727f170e1c5.png)

~~~text
为商品设计一款海报，将背景设置为一个家具的木地板上，营造温馨的氛围。在图片中央放置上传的商品。围绕着商品添加文字展示商品卖点：智能，续航久
~~~

### 151. type=61 SMART_REPAIR / 非39工具 · case 1978732939059630080

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732939059630080/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732939059630080/main_result_685dbd6b320a4c4f838bbeedf8bc7e9b.png)

~~~text
保持其他元素不变，给图片中吸尘器加一个模特正在使用吸尘器。背景是一个客厅，地板上有一点污渍
~~~

### 152. type=61 SMART_REPAIR / 非39工具 · case 1978732875209740288

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732875209740288/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732875209740288/main_result_6f5baa9c7402417f9a3d509c865881c3.webp)

~~~text
消除掉图片上白色的英文字母
~~~

### 153. type=61 SMART_REPAIR / 非39工具 · case 1978732849951641600

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732849951641600/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732849951641600/main_result_575c6b6f68c4450790c2449c3f51b20b.png)

~~~text
消除掉图片上所有的英文字母
~~~

### 154. type=61 SMART_REPAIR / 非39工具 · case 1978732679532875776

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732679532875776/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732679532875776/main_result_6da7db68daca46dc9eddfb156157201e.png)

~~~text
让一个金发碧眼的欧美模特穿上这件旗袍，身材要高挑，背景是一个复古四合院场景，全景拍摄，要保持衣服的印花图案不变
~~~

### 155. type=61 SMART_REPAIR / 非39工具 · case 1978732642568474624

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732642568474624/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732642568474624/main_result_d37812d100c1457ca86089f5688dc0c2.png)

~~~text
把这图片中的图案变成印花放在一件纯白的T恤
~~~

### 156. type=61 SMART_REPAIR / 非39工具 · case 1978732621097832448

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732621097832448/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732621097832448/main_result_fd6fbdee176b4e8ca22561d649be544c.png)

~~~text
把这件短的牛仔裤改成长款牛仔裤，
~~~

### 157. type=61 SMART_REPAIR / 非39工具 · case 1978732597622312960

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732597622312960/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732597622312960/main_result_796ef49524c04b3a9441d321fa0effa3.png)

~~~text
把这件连体衣改成连衣裙，上身改成细肩带，下身改成裙子，不要加模特
~~~

### 158. type=61 SMART_REPAIR / 非39工具 · case 1978732567238774784

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732567238774784/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732567238774784/main_result_407344c6ca4f43ca9312a6a10c70b527.png)

~~~text
在整张图片上添加水印：photo show，45°斜线
~~~

### 159. type=61 SMART_REPAIR / 非39工具 · case 1978732460351131648

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732460351131648/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732460351131648/main_result_e87647b5fada467087939e0bc2c614a4.png)

~~~text
让男模特穿上这双人字拖，只要人字拖的特写
~~~

### 160. type=61 SMART_REPAIR / 非39工具 · case 1978732406571765760

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732406571765760/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732406571765760/main_result_7b486f2d0efd4736869ca24f0b3f3b28.png)

~~~text
把路上的行人都消除
~~~

### 161. type=61 SMART_REPAIR / 非39工具 · case 1978732165743218688

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732165743218688/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978732165743218688/main_result_b3937aceda744b13a21a401abe81b4f4.png)

~~~text
提取图片中红色包装的薯片，保持包装不变，生成一张只有一包红色薯片的白底图
~~~

### 162. type=61 SMART_REPAIR / 非39工具 · case 1978643938157658112

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643938157658112/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643938157658112/main_result_5806dd3dd7e646a88ed3f34c8898281d.png)

~~~text
为商品设计一款海报，漫画风格，有一只狗拟人竖起大拇指。在图片右侧放置上传的商品。在产品的下方的位置添加文字，展示商品卖点：安全，美味，高蛋白
~~~

### 163. type=61 SMART_REPAIR / 非39工具 · case 1978643411420184576

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643411420184576/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643411420184576/main_result_8eb2308e7af943d8b7906bf98ae0b280.png)

~~~text
请设计一张海报，以蓝色为主色调，展示电动牙刷，保持牙刷不变。画面中需呈现浅蓝配色、背景丰富、牙刷倾斜放置、刷头特写（纯白色刷毛，周围有水珠、气泡及模拟清洁牙齿的动态水流效果）；底部设置几个代表产品功能的简洁图标（涵盖声波震动、刷头样式、模式选择、压力提醒等相关表意的图标）。整体风格追求清新且具科技感，突出产品的清洁效果与智能护龈特性。
~~~

### 164. type=61 SMART_REPAIR / 非39工具 · case 1978643080414101504

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643080414101504/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978643080414101504/main_result_c0512af4cab747beaf5ae43235fec7f5.png)

~~~text
把这件吊带裙的肩带改成蕾丝花边
~~~

### 165. type=61 SMART_REPAIR / 非39工具 · case 1978642971035041792

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642971035041792/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642971035041792/main_result_ddd3eaad2f464b75a37e5e5c44885a41.png)

~~~text
请自然地从图片中移除茶几和茶几上的东西，同时保持其他部分不变，确保移除后图像整体依然自然和谐。
~~~

### 166. type=61 SMART_REPAIR / 非39工具 · case 1978642598744424448

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642598744424448/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978642598744424448/main_result_b8415e00d38943168187a41f01a6d533.png)

~~~text
图中的挂钩左边是张开状态，右边是闭合状态，帮我生成四个挂钩在墙上，2个挂钩是张开的状态，一个挂着女士包包，一个挂着钥匙，另外两个是闭合的
~~~

### 167. type=61 SMART_REPAIR / 非39工具 · case 1978640164024098816

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978640164024098816/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1978640164024098816/main_result_22d638465c054d50be74cb2154cac991.png)

~~~text
请把这个图片，请按漫画风格重新设计
~~~

### 168. type=61 SMART_REPAIR / 非39工具 · case 1972924358684704768

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1972924358684704768/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/IMAGE_EDIT/1972924358684704768/main_result_10dc063e4a1949048dde9059f147ebb1.png)

~~~text
衣服不变，模特换为波浪蓝色长发的欧美女生
~~~

### 169. type=62 MULTI_IMAGE_FUSION / 非39工具 · case 1978732916448137216

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732916448137216/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732916448137216/main_result_04e627ead99e429d8ab15f3af4d712cb.png)

~~~text
请把图二中的扫地机器人放到图一地板上
~~~

### 170. type=62 MULTI_IMAGE_FUSION / 非39工具 · case 1978732783614529536

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732783614529536/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732783614529536/main_result_0e210d6d71214c6d87f11a43a0a0746d.png)

~~~text
把图一中婴儿床的挂式玩具换成图二中的玩具
~~~

### 171. type=62 MULTI_IMAGE_FUSION / 非39工具 · case 1978732501790855168

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732501790855168/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978732501790855168/main_result_78fa15c10b4f41138d73c8336ec2f40b.png)

~~~text
把图一中的牛奶替换成图二中的面霜
~~~

### 172. type=62 MULTI_IMAGE_FUSION / 非39工具 · case 1978640981408219136

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978640981408219136/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978640981408219136/main_result_4a7ef9faff234f2d9bf3e788b3cc55cc.png)

~~~text
确保上传图片元素不变，保持模特的动作，不变上传的图一模特的左手提着图三的包，戴着图二的眼镜
~~~

### 173. type=62 MULTI_IMAGE_FUSION / 非39工具 · case 1978639310923636736

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978639310923636736/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/MULTI_IMAGE_FUSION/1978639310923636736/main_result_b6a47cae398f46feb4823b0ed76139b3.png)

~~~text
把图二和图三中的娃娃批量放进图一的抓娃娃机器中
~~~

### 174. type=89 VIDEO_REPLICATION / 视频复刻 · case 2077742382737195008

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742382737195008/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742382737195008/main_result_4394d3ffac624229b00cac5615da9a62.mp4)

~~~text
[00:00~00:02] In a bright, minimalist pure white home-style space, the presenter, dressed in solid color attire, reveals only their upper body. The camera focuses on a white dining table, where the presenter calmly removes the bubble wrap from a 32oz blue-green gradient motivational water bottle. As the packaging is taken away, the frosted texture and translucent sheen of the bottle are revealed, with the black flip cap standing out prominently. A touch of green plants on the corner of the table creates a harmonious contrast with the pure white wall background. At the top center, bold white subtitles prominently display: "for the FITNESS and HYDRATION fans."  
[00:02~00:08] The camera follows the rhythm of the presenter’s actions, fluid and professional. The presenter first skillfully picks up a taller water bottle, tilting it to showcase its unique silhouette and lines to the camera; then, they elegantly place it side by side on the table, gently resting their hands on both sides of the bottle to emphasize the product's solid texture. The pace slightly quickens as the presenter swiftly brings the two bottles together, accompanied by a light clinking sound, showcasing the product's sturdy quality and sporty vitality. The demonstration is clean and precise, always synchronized with the unchanged subtitle prompt at the top.  
[00:08~00:10] As the demonstration approaches its conclusion, the presenter steadily lifts the two bottles with both hands and moves them to their chest, facing the camera with a confident and approachable smile, capturing a professional presentation stance. The presenter then gracefully and calmly places the bottles back on the table, executing the action crisply and cleanly. The entire demonstration process concludes perfectly at this moment, presenting a simple, high-end, and impactful overall image.
~~~

### 175. type=89 VIDEO_REPLICATION / 视频复刻 · case 2077742200305942528

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742200305942528/image.png)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742200305942528/main_result_dbbc07ae583a4af8ba91ca4d9d681aa2.mp4)

~~~text
[0.0-3.0 seconds] The camera adopts a first-person perspective, looking down at a white bed. A woman's right hand, painted with red nail polish, enters from the bottom of the frame, with her index finger extended, directly pointing at a vintage deep brown floral halter bikini laid out in the center. On the sides of the deep brown bikini set, to the left is a unique coral and turquoise lace woven one-piece swimsuit, and to the right is a Bohemian-style terracotta-colored one-piece swimsuit, all three swimsuits neatly displayed in a row. The bedroom environment includes a light-colored armchair, a wooden dressing table, and a pure black accent wall, with natural light streaming in from the left, softening the indoor lighting. The camera remains still, with the hand maintaining a stable pointing position. Voiceover: "I will never go to the mall to buy expensive swimsuits again." At the top center of the screen, white bold sans-serif font (with black outlines and no background) displays: "I will never go to the mall to buy expensive swimsuits again 🤯".

[3.0-8.0 seconds] The camera adopts a first-person perspective, looking down at the three swimsuits on the bed. A woman's palm, painted with bright red nail polish, spreads out as it glides over the coral woven one-piece swimsuit, the deep brown bikini set, and the terracotta one-piece swimsuit, showcasing the entire set. She then places her flattened palm down, pressing it onto the deep brown bikini set in the middle, gently pressing the smooth and elastic fabric of the swimsuit. Bright sunlight outside casts natural light and shadows on the textured white sheets and the smooth fabric of the swimsuits. The camera remains stable, with hand movements smooth and showcase-like. Voiceover: "Ladies, look at this swimsuit collection I found." At the top center of the screen, white bold sans-serif font (with black outlines and no background) displays: "I will never go to the mall to buy expensive swimsuits again 🤯".

[8.0-11.0 seconds] The camera adopts a first-person perspective, tilting down to focus on the upper part of the deep brown bikini set on the bed. The woman's red manicured hand specifically points to the halter triangle bikini top and touches the fabric near the vintage floral pattern and the deep brown solid halter ties. The left edge faintly shows the coral woven one-piece swimsuit, while the right side reveals the terracotta one-piece swimsuit, all placed on a white blanket. Soft natural light highlights the smooth texture of the deep brown attire. The camera captures the subject steadily, with hand movements methodically highlighting the design details. Voiceover: "The cut is perfect, it's a classic minimalist vintage swimwear style." At the top center of the screen, white bold sans-serif font (with black outlines and no background) displays: "I will never go to the mall to buy expensive swimsuits again 🤯".

[11.0-15.0 seconds] The camera adopts a first-person perspective, looking down at
~~~

### 176. type=89 VIDEO_REPLICATION / 视频复刻 · case 2077742088984920064

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742088984920064/image.webp)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742088984920064/main_result_7ac7eb09547c4789a9281a59c9034c56.mp4)

~~~text
[00:00~00:02] A young woman with red hair in a high ponytail stands in front of a dark multi-panel wooden door. She is wearing a gray cropped hoodie, a black down vest, and light blue wide-leg jeans (with colorful mushroom embroidery on the pants). The camera remains still as she turns to the side, lifts one leg, and smiles playfully at the lens with her mouth closed and a joyful expression. She then faces forward and adjusts the hem of her hoodie with both hands. At the top center of the screen, subtitles in white serif font with a black shadow read: "Wide-leg jeans approved by mom." 
[00:02~00:05] The scene abruptly switches, and the camera angle changes. It now appears to be a full-length mirror selfie, as she holds a pink smartphone to capture her reflection in a large mirror. She is still wearing the same outfit. With her knees slightly bent, she turns to show the fit of the wide-leg jeans and then looks at the phone screen. Her mouth is closed, and her expression is calm. As she holds the phone, there is a slight shake in the camera. At the top center of the screen, subtitles in white serif font with a black shadow read: "Wide-leg jeans approved by mom." 
[00:05~00:07] The image remains on the mirror reflection, with her still holding the pink phone. The camera follows her slight movements. She slightly turns, lifts her right leg, and bends her knee, posing in front of the mirror to showcase the side profile of her outfit. Her face is partially obscured by the phone, but she can be seen smiling with her mouth closed. She holds the pose for a moment. At the top center of the screen, subtitles in white serif font with a black shadow read: "Wide-leg jeans approved by mom." 
[00:07~00:09] Still in the mirror reflection, the camera remains mostly still. She now stands straight and faces forward, holding the phone in one hand while the other arm hangs by her side. She adjusts her posture slightly, showcasing the front view of the hoodie, vest, and jeans while looking at the phone screen. Her mouth is closed with a gentle smile. At the top center of the screen, subtitles in white serif font with a black shadow read: "Wide-leg jeans approved by mom." 
[00:09~00:11] The camera angle cuts back to the initial setup, directly facing the dark wooden door, with the lens remaining still. The woman stands in front of the door again, hands in her jeans pockets. She shrugs and offers a warm smile to the camera, her mouth closed and her smile bright. She sways gently with her steps. At the top center of the screen, subtitles in white serif font with a black shadow read: "Wide-leg jeans approved by mom." 
[00:11~00:15] The still shot continues to face the dark wooden door. The woman lets her hair down, allowing her long red locks to fall naturally over her shoulders. She gently tosses her hair to set it in place. With one hand on her hip, she smiles confidently at the camera, her mouth closed and displaying a confident grin, striking a final pose. At the top c
~~~

### 177. type=89 VIDEO_REPLICATION / 视频复刻 · case 2077741640857092096

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741640857092096/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741640857092096/main_result_a13a3dd504334fa381ae25e5475b952f.mp4)

~~~text
[00:00~00:03] A woman stands in her home, with a gray speckled countertop behind her and a closed white door visible in the background. She holds the top handle of an all-white two-tier metal shelving unit with her right hand and lifts it. The shelving unit is on her right side, and she gestures towards it while speaking. As she explains to the camera, her mouth moves naturally. The camera remains still as she shifts her weight slightly and adjusts her grip on the shelving unit. Voiceover: "You may have seen this all-white two-tier metal shelving unit everywhere." At the bottom center, a white medium-sized sans-serif font subtitle with a slight shadow reads: "You may have seen this all-white two-tier metal shelving unit everywhere."
[00:03~00:06] The woman continues to stand behind the countertop, keeping the all-white shelving unit on her right side. She supports the bottom tier with her left hand while her right hand remains on the top handle. She leans slightly forward, her facial expressions are lively. As she speaks to the camera, her lips move, and her mouth opens and closes naturally with her explanation. The camera is fixed in place. Voiceover: "But I bet you haven't seen one at this price with free shipping." At the bottom center, a white medium-sized sans-serif font subtitle with a slight shadow reads: "But I bet you haven't seen one at this price with free shipping."
[00:06~00:11] She continues holding the shelving unit, pointing with her left hand to the bottom tier and small locking wheels to emphasize her point. The shelving unit hovers above the countertop. The background shows a dimly lit living room space. She opens and closes her mouth while speaking, with subtle facial expressions that match her words. The camera remains in its original position. Voiceover: "This is a sturdy metal shelving unit. It has locking wheels." At the bottom center, white medium-sized sans-serif font subtitles with a slight shadow read: "This is a sturdy metal shelving unit." and "It has locking wheels."
[00:11~00:14] To demonstrate its weight, she lifts the shelving unit slightly and shakes it gently, holding the top handle and the side frame with both hands. The grid pattern of the shelving unit's shelves is clearly visible. She opens and closes her mouth while speaking, emphasizing its stability. The camera remains still, capturing her movements. Voiceover: "It's light, but very sturdy." At the bottom center, a white medium-sized sans-serif font subtitle with a slight shadow reads: "It's light, but very sturdy."
~~~

### 178. type=89 VIDEO_REPLICATION / 视频复刻 · case 2077741421771816960

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741421771816960/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741421771816960/main_result_f321bdbcb38144bd8e12df00681c5499.mp4)

~~~text
[00:00~00:01s] The camera is facing a woman standing indoors, with a white paneled door and a potted artificial olive tree behind her. She is wearing a gray T-shirt and blue jeans, with long black hair resting on her right shoulder. She raises her hands to gather her hair and lift it up, showcasing its length and texture. She is speaking to the camera, her mouth moving naturally as she explains. Her movements are casual and smooth. The voiceover says: "If your hair feels dry and lifeless," there is a white rounded rectangle background at the top center of the screen, with a black sans-serif font title reading: "NATIVE".
[00:01~00:05s] The woman remains in the same indoor setting, now holding two hair care products in her hands. She holds a white matte plastic conditioner in her left hand and a white matte plastic shampoo in her right. She clearly showcases these products to the camera. She is speaking to the camera, her mouth moving naturally as she explains. The camera remains still during the product presentation. The voiceover says: "This complete NATIVE product set can help you." There is a white rounded rectangle background in the top left corner with a black sans-serif font title reading: "NATIVE".
[00:05~00:07s] The woman continues to face the camera indoors, her hands moving slightly. She brings the white matte plastic conditioner bottle in her left hand closer to the camera for emphasis while slightly moving the shampoo bottle in her right hand away. She is speaking to the camera, her mouth moving naturally as she explains. After showcasing the products, she slightly lowers the bottles. The voiceover says: "You will receive this moisturizing conditioner,"
[00:07~00:09s] The camera frame locks onto the woman who is sequentially showcasing the remaining products. First, she raises the white matte plastic shampoo bottle in her left hand towards the camera. Then, she switches hands to display the conditioner bottle. She is speaking to the camera, her mouth moving naturally as she explains. The camera is always focused on her showcasing actions. The voiceover says: "and this moisturizing shampoo."
[00:09~00:16s] The woman returns to her original posture, holding both products again—shampoo in her left hand and conditioner in her right. She makes slight movements with her hands as she delivers the final call to action. Her long hair rests on her right shoulder. She is speaking to the camera, her mouth moving naturally as she explains. At the end of the video, she maintains a steady posture. The voiceover says: "Click the store icon below the video. Grab it before the price goes up."
~~~

### 179. type=89 VIDEO_REPLICATION / 视频复刻 · case 2077741173448048640

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741173448048640/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741173448048640/main_result_3160b5b9341540bebf6f6525b5dd4bfb.mp4)

~~~text
[00:00-00:05s] The camera presents a first-person perspective. A hand holds a pair of deep gray vintage-style German Army Trainers, showcasing their side profile, with a suede upper material. The camera remains fixed as the hand slightly tilts the shoe, revealing the textured black rubber sole. The background features a gray textured carpet and a brown cardboard shoe box, with a simple gray wall in the back. The hand movement is slow and unhurried, clearly displaying the design details of the shoe. The voiceover states: "หากคุณกำลังมองหารองเท้าผ้าใบสวยๆ สักคู่ คุณต้องมีคู่นี้ เป็นรองเท้าผ้าใบหนังกลับสีเทาเข้มคุณภาพสูง" 
[00:05-00:15s] The camera continues to present a first-person perspective. The operator uses their hand to showcase the German Army Trainers, first flipping the shoe over to reveal the textured black rubber sole. The camera remains fixed. Next, the hand tilts the shoe to show the lining and the brand label on the tongue. In the blurred background, the shoe box and the other shoe can be seen. The hand smoothly rotates the shoe to display different angles. The voiceover mentions: "ใส่สบายและมีสไตล์มาก เหมาะสำหรับผู้ที่ใส่ใจในการแต่งตัวในชีวิตประจำวันหรือไปเที่ยวชิลล์ๆ"
~~~

### 180. type=89 VIDEO_REPLICATION / 视频复刻 · case 2065069943115792384

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2065069943115792384/image.jpeg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2065069943115792384/main_result_6bf61931b7374ff1b48c689651a2e351.mp4)

~~~text
你是一个视频脚本适配专家。你的任务是：将原视频分镜脚本中的产品信息替换为新产品，同时最大程度保留原文；根据用户指定的品牌基因（可选）对人物/语言/场景做定点覆盖；根据时长适配指令调整时间码和 Voiceover；并把**屏幕文字（覆盖字幕）**完整传递给生成模型。

## 核心原则（保真向，优先级最高）

1. **非产品相关的句子必须逐词照抄 Step 1 原文**，不允许改写、压缩、合并、省略。包括：
   - 视角/POV 起手句（如 "The camera shows a first-person POV, looking down..." / "A self-filmed overhead shot: the camera is held high..."）
   - 镜头语言、背景环境、光线描述、动作节奏词、连接词
   - 画面里的所有非新产品物品（鞋、包、首饰、帽子、外套、上衣等）的**完整描述**，包括颜色/材质/形态/位置细节
   - 原文里出现的人物外貌（头发、体型）

2. 产品相关的部分需要替换为新产品的信息：产品名称、颜色、品牌、材质、外观特征、卖点关键词、细节特征。

3. 如果原视频的某个展示动作不适用于新产品，替换为新产品的等价展示动作，保持同等描述丰富度和句式风格。

4. **口播必须与原视频对齐**：若原 Shot 口播为 `(纯音乐)` / 空 / `no speech` 等无人声标识，替换后**不输出 Voiceover 字段**。只有原 Shot 有真实口播时才替换并输出 Voiceover。

5. **产品类别/位置守恒**：只替换与新产品**同身体位置且同类别**的物品。永远不要把非同类物品的描述替换成新产品描述。

6. **屏幕文字（覆盖字幕）强制传递 + 产品替换**（v7 修正）：

   **传递规则**：若某 Shot 的 Step 1 输出 `屏幕文字.有无 = yes`，替换后必须在该 Shot 的 prompt 末尾加一句显式的字幕渲染指令。格式：
   `A [style] caption at the [position] reads: "[text]".`
   （若 `有无 = no`，不加任何 caption 指令，也不强行编造字幕）

   **屏幕文字的内容改写规则**（和画面描述采用同一套逻辑）：
   - ✅ **产品相关词必须替换**（原则 2 同样适用于字幕）：
     - 品牌名：`Herman Miller` → 新品牌
     - 产品名/品类：`Aeron chair` → 新产品等价名
     - 价格锚点：若涉及新旧产品价格差异，按新产品调整（如果新产品定位完全不同，可改；如果只是替换品牌但保持同品类同定位，原价格锚点可保留）
     - 产品颜色、材质、卖点关键词
   - ✅ **位置守恒同样适用**：不把字幕里的产品词换成不同类别的产品（如"Herman Miller chair"不能换成"Lululemon yoga pants"）
   - ✅ **非产品内容逐字保留**：字幕里的口号、情绪词、挑战性语句、对比句式、数字（非价格）、emoji，全部原样保留
   - ❌ **不做 Voiceover 时长压缩**（字幕不是口播，没有语速约束，不按 proportional_compress 的 ratio 改写字数）
   - ❌ **不改位置和样式**（除非用户通过品牌基因明确指定）

   **语言 override 下的处理**：若用户指定 `language`，字幕先完成产品替换，再翻译为目标语言（和 Voiceover 并列处理，但不受 ±20% 长度限制）

   **举例说明**：
   - 原字幕：`"I'm not spending 1000+ on a Herman Miller chair"`，新产品是某个平价办公椅品牌 XYZ
   - 正确输出：`"I'm not spending 1000+ on a XYZ chair"` （品牌词替换，其他原样）
   - 错误输出 A：`"I'm not spending 1000+ on a Herman Miller chair"`（品牌没换，是你之前的 bug）
   - 错误输出 B：`"XYZ is super affordable"`（改写句式，违反"非产品内容逐字保留"）

## 品牌基因 Override 规则（可选层，仅在对应字段非空时生效）

若 `brand_dna` 字段全为 `(unspecified, keep original)`，跳过本节，行为等同无 override 版本。字段未指定的维度**完全不动**，保真原则照旧。

### Race Override（人种覆盖）

指定 `race` 时：

- **覆盖**：原文里的种族标识词（Caucasian / East Asian / fair-skinned...）+ 默认发色发质
- **保留**：体型、年龄段、服装、动作、表情、妆容、发型样式（马尾/短发/长发）
- **例外**：强种族绑定发型（dreadlocks / cornrows 等）随人种一起替换
- 原文未提人种时：在人物首次出场处隐式注入一次（如 "A [race] woman..."），后续镜头不重复

### Language Override（语言覆盖）

指定 `language` 时：

- 所有有口播的 Shot 的 `Voiceover:` 文本改写为目标语言，保持语义和节奏
- **屏幕文字也翻译为目标语言**（在完成原则 6 的产品替换之后再翻译，长度不受 ±20% 限制）
- **画面描述仍用英文**（Seedance prompt 语言不变）
- 无口播 Shot 仍按原则 4 不输出 Voiceover

### Scene Override（场景覆盖）

指定 `scene` 时：

- **覆盖**：背景环境（墙面/地面/家具/招牌/地标）改写为目标场景
- **保留**：镜头语言、视角/POV 起手句、光线节奏、人物动作、产品展示动线
- 功能性道具在新场景合理则保留，不合理则替换为新场景的等价物
- **未指定时默认保留原场景**（典型路径）

### 优先级

用户 override > 原视频识别 > 保真默认

## 时长适配规则

根据 `duration_directive` 的模式执行：

### passthrough 模式

时间码和 Voiceover 保持输入原样，不做压缩改写。
（注：若原视频经过前 N 秒截断预处理，本阶段也走此模式，因为截断后已经是目标时长。）

屏幕文字：原样保留（但产品替换仍按原则 6 进行），位置/样式/出现时段都不变。

### proportional_compress 模式

按 `duration_directive` 里给出的 `压缩比` 同时压缩时间码和 Voiceover：

**时间码压缩**（精确）：

- 每个 Shot 的 `[X-Ys]` →
~~~

### 181. type=89 VIDEO_REPLICATION / 视频复刻 · case 2077729562469183488

- 输入/封面：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077729562469183488/image.jpg)
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077729562469183488/main_result_b16464d9cb2b4fc8b4a7f39051fc0f81.mp4)

~~~text
[00:00~00:02] The deep navy blue Sony over-ear wireless headphones are placed on a golden circular base, with a background of soft pink, yellow, and orange geometric shapes. The camera remains still as the product slowly rotates, showcasing its stylish design. The environment is vibrant and playful, with scattered blocks adding a modern aesthetic. The headphones appear to slightly hover above the surface as they rotate, with smooth and fluid motion. Centered on the left side of the screen is a line of bold, white sans-serif subtitles that reads: "INTRODUCING SONY".
[00:02~00:05] The deep navy blue Sony over-ear wireless headphones stand upright, seemingly suspended between two glowing concentric circular rings above the golden base. The camera is fixed while the halos slowly rotate around the headphones, creating a dynamic visual effect. The surrounding pink and yellow geometric blocks add depth to this colorful abstract scene. The motion is smooth and controlled, highlighting the product's modern appeal. In the upper right corner of the screen, there is a line of bold, white sans-serif subtitles, accompanied by a small red box that reads "50H", with the text: "50H UP TO 50H BATTERY WITH QUICK CHARGE".
[00:05~00:07] The deep navy blue Sony over-ear wireless headphones are placed on a pink cubic base, surrounded by intricate yellow geometric block patterns. The camera slowly pushes in on the stationary product. The close-up shot emphasizes the detailed texture of the plush ear cushions and the stylish headband. The slow and deliberate camera movement brings the product's design into clear focus. Centered on the left side of the screen is a line of bold, white sans-serif subtitles with a simple graphic icon above it, reading: "SONY SIGNATURE SOUND".
[00:07~00:09] The close-up shot showcases the side of the deep navy blue Sony over-ear wireless headphones, focusing on the golden Sony logo and control buttons. The camera slowly rotates around the headphones, revealing the fine details of the design. The background is a softly blurred image made up of pink and yellow geometric shapes. The motion is smooth and stable, highlighting the product's craftsmanship. In the lower right corner of the screen, there is a line of bold, white sans-serif subtitles with a microphone icon above it, reading: "HANDS-FREE CALLS".
[00:09~00:12] Multiple pairs of Sony over-ear wireless headphones in different colors are arranged in a grid against a background of yellow isometric blocks. The camera remains fixed while the headphones slowly rotate in sync. The colorful arrangement creates a striking and orderly visual pattern. The synchronized rotating motion emphasizes the variety of available colors. In the lower right corner of the screen, there is a line of bold, white sans-serif subtitles that reads: "FIND ONE THAT MATCHES YOUR STYLE".
[00:12~00:14] The deep navy blue Sony over-ear wireless headphones are displayed on a golden circular base, with a background of colorfu
~~~

### 182. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2082065985074851840

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082065985074851840/main_result_db12a5509fe7423f92816240f5e6d25a.mp4)

~~~text
将视频中的手表替换成参考图中的手表样式
~~~

### 183. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2082041399322628096

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041399322628096/main_result_a34c2cdb104a4d54bb9d453e35adf85b.mp4)

~~~text
把视频中的风衣改成红色的Nike风衣，需要有Nike的logo，人物跟场景跟背景不变。
~~~

### 184. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2082041466284691456

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041466284691456/main_result_38f821cdac864e7989bcdf952f53e2b9.mp4)

~~~text
将视频中方形煎锅替换成参考图中的圆形煎锅，其余保持不变
~~~

### 185. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2082041065204371456

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041065204371456/main_result_2d9fbcc9ee3d429dacbcc72baa95f581.mp4)

~~~text
将视频中的南瓜锅替换成参考图中的清水蓝小锅。
~~~

### 186. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2082293949154177024

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082293949154177024/main_result_1d7e5a6be06948699d03817de53519f2.mp4)

~~~text
把视频中枕头和床单替换成参考图中枕头和床单的样式
~~~

### 187. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2082041148394196992

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041148394196992/main_result_f40c441575bb4c579b504d3a932c7a3c.mp4)

~~~text
将视频中的白色背景换成参考图中的背景，杯子相关动作在参考图中的桌子上完成，其余保持不变。
~~~

### 188. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2081990093401313280

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2081990093401313280/main_result_33715ed9c1d24b6f9dd9eae932532a30.mp4)

~~~text
把视频中男生的墨镜改成图中的蓝色墨镜，人物、场景、背景、动作均保持不变。
~~~

### 189. type=95 AI_VIDEO_EDITING / AI视频剪辑 · case 2082041210646056960

- 输入/封面：—
- 主结果：[打开](https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/AI_VIDEO_EDITING/2082041210646056960/main_result_0ed394aa17834414aee058989803c38b.mp4)

~~~text
将视频中模特穿着的蓝色运动服换成参考图中的棕色瑜伽服，其余保持不变
~~~
