# 资产 08｜模型能力与工具映射

> **资产来源**：[`models_catalog.json`](../../analysis/assets/linkfox/models_catalog.json)
> **应用位置**：模型选择器、参数裁剪、能力路由与原站成本参考
> **数据范围**：24 个去重模型，169 条工具映射
> **使用边界**：仅用于复刻开发与内部 A/B 基准；原站图片、模板及文案不直接进入商用资产库。

---

## 怎么用

- 建 `ModelSpec` 注册表：模型能力、比例、分辨率、参考图上限、计费参考都来自这里。
- `pricing` 是原站积分参考，**不是**无限画布的扣费规则；V1.0 不做计费，仅展示本地成本提示。
- 原站模型名用于能力对齐；实际执行映射到用户已配置的 provider/model，不伪称同模型。

## 去重模型能力

### LF全能模型 2.1 · `GEMINI_NANO_BANANA_2_1`

- apiCode：`BANANA_2_1`
- 说明：2.0 升级版，文字排版与多轮编辑一致性全面提升
- 比例：`1:1, 2:3, 3:4, 4:5, 9:16, 16:9, 5:4, 4:3, 3:2, 21:9, 1464:600, 970:600, 600:450`
- 分辨率：`1K, 2K, 4K`
- 参考图上限：14；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": 40, "2K": 50, "4K": 60}}`

### 换色-智能 G-2.5 · `GPT_2_5_IMAGE`

- apiCode：`GPT_2_5_IMAGE`
- 说明：—
- 比例：`—`
- 分辨率：`2K`
- 参考图上限：0；默认：True；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"2K": {"high": 150, "low": 15, "medium": 50}}}`

### LF智能模型 G-2.5 Flare · `GPT_2_5_F_IMAGE`

- apiCode：`GPT_2_5_F_IMAGE`
- 说明：日常生图更快出效果
- 比例：`1:1, 2:3, 3:4, 4:5, 9:16, 16:9, 5:4, 4:3, 3:2, 21:9, 1464:600, 970:600, 600:450, 9:21`
- 分辨率：`1K, 2K, 4K`
- 参考图上限：16；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": {"medium": 30}, "2K": {"medium": 50}, "4K": {"medium": 80}}}`

### LF智能模型 G-2 · `GPT_2_IMAGE`

- apiCode：`GPT_2_IMAGE`
- 说明：更适合生成图文排版
- 比例：`1:1, 2:3, 3:4, 4:5, 9:16, 16:9, 5:4, 4:3, 3:2, 21:9, 1464:600, 970:600, 600:450`
- 分辨率：`1K, 2K, 4K`
- 参考图上限：16；默认：False；维护中：False
- pricing 参考：`{"stable": {"1K": {"medium": 30}, "2K": {"medium": 50}, "4K": {"medium": 80}}}`

### LF全能模型 Pro · `GEMINI_FLASH_PRO`

- apiCode：`BANANA_PRO`
- 说明：图片生成最强模型，高质量图片，对指令理解能力更强
- 比例：`1:1, 2:3, 3:4, 4:5, 9:16, 16:9, 5:4, 4:3, 3:2, 21:9, 1464:600, 970:600, 600:450`
- 分辨率：`1K, 2K, 4K`
- 参考图上限：14；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": 50, "2K": 60, "4K": 80}}`

### LF全能模型 Lite · `GEMINI_31_FLASH_LITE`

- apiCode：`BANANA_2_LITE`
- 说明：高性价比轻量模型，兼顾速度与成本
- 比例：`1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, 1464:600, 970:600, 600:450`
- 分辨率：`1K`
- 参考图上限：14；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": 15}}`

### LF全能模型 · `GEMINI_FLASH`

- apiCode：`BANANA`
- 说明：普通质量图片，适用于想省点的用户使用，仅支持生成1K图
- 比例：`1:1, 16:9, 9:16, 3:4, 4:3, 3:2, 2:3, 4:5, 5:4, 21:9`
- 分辨率：`1K`
- 参考图上限：3；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": 40}}`

### Wan 2.7 · `WAN2_7`

- apiCode：`WAN2_7`
- 说明：生成速度快，图片排版能力佳
- 比例：`1:1, 1:4, 4:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 16:9, 9:16, 21:9`
- 分辨率：`1K, 2K`
- 参考图上限：9；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": 30, "2K": 30}}`

### Seedream 5.0 Pro · `SEEDREAM5_PRO`

- apiCode：`SEEDREAM5_PRO`
- 说明：国产高质量模型，画面更出彩
- 比例：`1:1, 3:4, 4:3, 9:16, 16:9, 3:2, 2:3, 21:9, 1464:600, 970:600, 600:450`
- 分辨率：`1K, 2K`
- 参考图上限：10；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": 20, "2K": 40}}`

### Linkfox-Image-1 · `AIDRAW_EDIT`

- apiCode：`AIDRAW_EDIT`
- 说明：自研生图模型
- 比例：`1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9`
- 分辨率：`2K`
- 参考图上限：4；默认：False；维护中：False
- pricing 参考：`{"stable": {"2K": 20}}`

### Qwen 3.0 Pro · `QWEN_IMAGE_3_PRO`

- apiCode：`None`
- 说明：生成速度快，图片排版能力佳，限时半价特惠至 9.30
- 比例：`1:1, 1:4, 4:1, 1:8, 8:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 16:9, 9:16, 21:9, 9:21`
- 分辨率：`1K, 2K`
- 参考图上限：3；默认：False；维护中：False
- pricing 参考：`{"eco": {}, "stable": {"1K": 25, "2K": 40}}`

### MiniMax H3 · `AIGC_MINIMAX_H3`

- apiCode：`minimax-h3-lite`
- 说明：极高性价比，批量生成更划算
- 比例：`9:16, 16:9, 1:1, 3:4`
- 分辨率：`768P, 1080P`
- 参考图上限：9；默认：False；维护中：False
- pricing 参考：`{"1080P": {"5": 40, "10": 80, "15": 120}, "2K": {"5": 40, "10": 80, "15": 120}, "768P": {"5": 30, "10": 60, "15": 90}}`

### Vidu Q4 · `VIDU_Q4_PREVIEW`

- apiCode：`None`
- 说明：极致一致性，商品还原更精准
- 比例：`9:16, 16:9, 1:1, 3:4, 4:3`
- 分辨率：`720P, 1080P, 2K`
- 参考图上限：15；默认：False；维护中：False
- pricing 参考：`{"1080P": {"5": 105, "10": 210, "15": 315}, "2K": {"5": 165, "10": 330, "15": 495}, "720P": {"5": 80, "10": 160, "15": 240}}`

### 万相3.0 · `WAN3`

- apiCode：`None`
- 说明：一句话改视频，精准丝滑编辑
- 比例：`16:9, 4:3, 1:1, 3:4, 9:16`
- 分辨率：`720P`
- 参考图上限：10；默认：False；维护中：False
- pricing 参考：`{"points": 35}`

### Seedance 2.5 · `SEED_V25`

- apiCode：`doubao-seedance-2-5`
- 说明：原生30秒直出，全模态参考一镜到底
- 比例：`9:16, 16:9, 1:1, 4:3, 3:4, 21:9`
- 分辨率：`480P, 720P, 1080P`
- 参考图上限：30；默认：True；维护中：False
- pricing 参考：`{"1080P": {"4": 1296, "5": 1620, "6": 1944, "7": 2268, "8": 2592, "9": 2916, "10": 3240, "11": 3564, "12": 3888, "13": 4212, "14": 4536, "15": 4860, "16": 5184, "17": 5508, "18": 5832, "19": 6156, "20": 6480, "21": 6804, "22": 7128, "23": 7452, "24": 7776, "25": 8100, "26": 8424, "27": 8748, "28": 9072, "29": 9396, "30": 9720}, "480P": {"4": 212, "5": 265, "6": 318, "7": 371, "8": 424, "9": 477, "10": 530, "11": 583, "12": 636, "13": 689, "14": 742, "15": 795, "16": 848, "17": 901, "18": 954, "19": 1007, "20": 1060, "21": 1113, "22": 1166, "23": 1219, "24": 1272, "25": 1325, "26": 1378, "27": 1431, "28": 1484, "29": 1537, "30": 1590}, "720P": {"4": 476, "5": 595, "6": 714, "7": 833, "8": 952, "9": 1071, "10": 1190, "11": 1309, "12": 1428, "13": 1547, "14": 1666, "15": 1785, "16": 1904, "17": 2023, "18": 2142, "19": 2261, "20": 2380, "21": 2499, "22": 2618, "23": 2737, "24": 2856, "25": 2975, "26": 3094, "27": 3213, "28": 3332, "29": 3451, "30": 3570}}`

### HappyHorse 1.1 · `HAPPY_HORSE`

- apiCode：`None`
- 说明：视觉与动态全面进化，角色一致性大幅提升
- 比例：`9:16, 16:9, 1:1, 4:3, 3:4, 21:9`
- 分辨率：`720P, 1080P`
- 参考图上限：9；默认：False；维护中：False
- pricing 参考：`{"1080P": {"5": 500, "10": 1000, "15": 1500}, "720P": {"5": 300, "10": 600, "15": 900}}`

### Seedance 2.0 fast · `SEED_FAST`

- apiCode：`None`
- 说明：兼具质量与性价比
- 比例：`9:16, 16:9, 1:1, 4:3, 3:4, 21:9`
- 分辨率：`480P, 720P`
- 参考图上限：9；默认：True；维护中：False
- pricing 参考：`{"480P": {"5": 105, "10": 210, "15": 315}, "720P": {"5": 215, "10": 430, "15": 645}}`

### Seedance 2.0 mini · `SEED_MINI`

- apiCode：`doubao-seedance-2-0-mini`
- 说明：极速低成本，批量出片更省心
- 比例：`9:16, 16:9, 1:1`
- 分辨率：`480P, 720P`
- 参考图上限：9；默认：False；维护中：False
- pricing 参考：`{"480P": {"5": 35, "10": 70, "15": 105}, "720P": {"5": 70, "10": 140, "15": 210}}`

### Seedance 2.0 · `SEED`

- apiCode：`None`
- 说明：极致拟真的视听稳定性，仅支持非真人内容
- 比例：`9:16, 16:9, 1:1, 4:3, 3:4, 21:9`
- 分辨率：`480P, 720P, 1080P`
- 参考图上限：9；默认：False；维护中：False
- pricing 参考：`{"1080P": {"5": 1500, "10": 3000, "15": 4500}, "480P": {"5": 200, "10": 400, "15": 600}, "720P": {"5": 400, "10": 800, "15": 1200}}`

### Omni Flash 1.1 · `GEMINI_OMNI_FLASH_1_1`

- apiCode：`None`
- 说明：一句话改商品视频，参考图精准还原不跑样
- 比例：`16:9, 9:16`
- 分辨率：`—`
- 参考图上限：10；默认：False；维护中：False
- pricing 参考：`{"points": 33}`

### 可灵2.6 · `MODEL_V2_6`

- apiCode：`kling-v2-6`
- 说明：适合上传模特图展示，人物动作更丝滑
- 比例：`—`
- 分辨率：`720P, 1080P`
- 参考图上限：2；默认：False；维护中：False
- pricing 参考：`{"1080P": 80, "720P": 40}`

### 可灵Omni · `MODEL`

- apiCode：`None`
- 说明：全能参考，超强一致性
- 比例：`1:1, 9:16, 16:9`
- 分辨率：`720P, 1080P`
- 参考图上限：7；默认：False；维护中：False
- pricing 参考：`{"1080P": {"3": 240, "4": 320, "5": 400, "6": 480, "7": 560, "8": 640, "9": 720, "10": 800, "11": 880, "12": 960, "13": 1040, "14": 1120, "15": 1200}, "720P": {"3": 180, "4": 240, "5": 300, "6": 360, "7": 420, "8": 480, "9": 540, "10": 600, "11": 660, "12": 720, "13": 780, "14": 840, "15": 900}}`

### 万相2.6 · `WAN`

- apiCode：`wan-2-6`
- 说明：支持多分镜视频，比较擅长口播，十分稳定
- 比例：`—`
- 分辨率：`—`
- 参考图上限：0；默认：False；维护中：False
- pricing 参考：`{"1080P": 80, "720P": 60}`

### 海螺2.3 · `PRODUCT`

- apiCode：`hailuo-2-3`
- 说明：对运镜描述又更强表现力
- 比例：`—`
- 分辨率：`768P, 1080P`
- 参考图上限：0；默认：False；维护中：False
- pricing 参考：`{"1080P": 50, "768P": 35}`

## 工具 → 模型映射

| 媒体 | type / 工具 | 模型 | code | 默认 |
|---|---|---|---|---|
| image | 61 SMART_REPAIR | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 61 SMART_REPAIR | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 61 SMART_REPAIR | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 61 SMART_REPAIR | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 61 SMART_REPAIR | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 61 SMART_REPAIR | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 61 SMART_REPAIR | LF全能模型 | `GEMINI_FLASH` | False |
| image | 61 SMART_REPAIR | Wan 2.7 | `WAN2_7` | False |
| image | 61 SMART_REPAIR | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 61 SMART_REPAIR | Linkfox-Image | `AIDRAW_EDIT` | False |
| image | 61 SMART_REPAIR | Qwen 3.0 Pro | `QWEN_IMAGE_3_PRO` | False |
| image | 62 MULTI_IMAGE_FUSION | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 62 MULTI_IMAGE_FUSION | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 62 MULTI_IMAGE_FUSION | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 62 MULTI_IMAGE_FUSION | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 62 MULTI_IMAGE_FUSION | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 62 MULTI_IMAGE_FUSION | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 62 MULTI_IMAGE_FUSION | LF全能模型 | `GEMINI_FLASH` | False |
| image | 62 MULTI_IMAGE_FUSION | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 62 MULTI_IMAGE_FUSION | Linkfox-Image | `AIDRAW_EDIT` | False |
| image | 62 MULTI_IMAGE_FUSION | Qwen 3.0 Pro | `QWEN_IMAGE_3_PRO` | False |
| image | 62 MULTI_IMAGE_FUSION | Wan 2.7 | `WAN2_7` | False |
| image | 69 DRESS_WEAR_SET | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 69 DRESS_WEAR_SET | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 69 DRESS_WEAR_SET | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 69 DRESS_WEAR_SET | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 69 DRESS_WEAR_SET | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 69 DRESS_WEAR_SET | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 69 DRESS_WEAR_SET | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 69 DRESS_WEAR_SET | Wan 2.7 | `WAN2_7` | False |
| image | 71 PRODUCT_IMAGE_SUITE | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 71 PRODUCT_IMAGE_SUITE | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 71 PRODUCT_IMAGE_SUITE | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 71 PRODUCT_IMAGE_SUITE | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 71 PRODUCT_IMAGE_SUITE | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 71 PRODUCT_IMAGE_SUITE | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 71 PRODUCT_IMAGE_SUITE | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 71 PRODUCT_IMAGE_SUITE | Wan 2.7 | `WAN2_7` | False |
| image | 71 PRODUCT_IMAGE_SUITE | Linkfox-Image | `AIDRAW_EDIT` | False |
| image | 77 非39工具 | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 77 非39工具 | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 77 非39工具 | Wan 2.7 | `WAN2_7` | False |
| image | 77 非39工具 | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 77 非39工具 | LF全能模型 | `GEMINI_FLASH` | False |
| image | 77 非39工具 | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 77 非39工具 | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 77 非39工具 | Linkfox-Image-1 | `AIDRAW_EDIT` | False |
| image | 77 非39工具 | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 77 非39工具 | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 83 FISSION_LINK | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 83 FISSION_LINK | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 85 REPLICATE_LINK | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 86 AGENTOS_IMAGE_GEN | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 86 AGENTOS_IMAGE_GEN | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 86 AGENTOS_IMAGE_GEN | Wan 2.7 | `WAN2_7` | False |
| image | 87 AGENTOS_VIDEO_GEN | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 87 AGENTOS_VIDEO_GEN | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 87 AGENTOS_VIDEO_GEN | Wan 2.7 | `WAN2_7` | False |
| image | 100 AGENT_DESIGN | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 100 AGENT_DESIGN | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 100 AGENT_DESIGN | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 100 AGENT_DESIGN | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 100 AGENT_DESIGN | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 100 AGENT_DESIGN | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 100 AGENT_DESIGN | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 100 AGENT_DESIGN | LF全能模型 | `GEMINI_FLASH` | False |
| image | 100 AGENT_DESIGN | Wan 2.7 | `WAN2_7` | False |
| image | 101 AGENT_DESIGN_MULTI | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 101 AGENT_DESIGN_MULTI | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 101 AGENT_DESIGN_MULTI | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 101 AGENT_DESIGN_MULTI | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 101 AGENT_DESIGN_MULTI | LF全能模型 | `GEMINI_FLASH` | False |
| image | 101 AGENT_DESIGN_MULTI | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 101 AGENT_DESIGN_MULTI | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 101 AGENT_DESIGN_MULTI | Wan 2.7 | `WAN2_7` | False |
| image | 101 AGENT_DESIGN_MULTI | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 102 AGENT_CLOTH_COLLECTION | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | False |
| image | 102 AGENT_CLOTH_COLLECTION | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 102 AGENT_CLOTH_COLLECTION | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 102 AGENT_CLOTH_COLLECTION | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 102 AGENT_CLOTH_COLLECTION | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 102 AGENT_CLOTH_COLLECTION | LF全能模型 Pro | `GEMINI_FLASH_PRO` | True |
| image | 102 AGENT_CLOTH_COLLECTION | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 103 AGENT_PRODUCT_COLLECTION | LF智能模型 G-2.5 Sunburst | `GPT_2_5_IMAGE` | True |
| image | 103 AGENT_PRODUCT_COLLECTION | LF全能模型 2.1 | `GEMINI_NANO_BANANA_2_1` | False |
| image | 103 AGENT_PRODUCT_COLLECTION | LF智能模型 G-2.5 Flare | `GPT_2_5_F_IMAGE` | False |
| image | 103 AGENT_PRODUCT_COLLECTION | LF智能模型 G-2 | `GPT_2_IMAGE` | False |
| image | 103 AGENT_PRODUCT_COLLECTION | LF全能模型 Lite | `GEMINI_31_FLASH_LITE` | False |
| image | 103 AGENT_PRODUCT_COLLECTION | LF全能模型 Pro | `GEMINI_FLASH_PRO` | False |
| image | 103 AGENT_PRODUCT_COLLECTION | Seedream 5.0 Pro | `SEEDREAM5_PRO` | False |
| image | 107 非39工具 | 换色-智能 G-2.5 | `GPT_2_5_IMAGE` | True |
| video | 30 IMAGE_TO_VIDEO | MiniMax H3 | `AIGC_MINIMAX_H3` | True |
| video | 30 IMAGE_TO_VIDEO | Vidu Q4 | `VIDU_Q4_PREVIEW` | False |
| video | 30 IMAGE_TO_VIDEO | 万相3.0 | `WAN3` | False |
| video | 30 IMAGE_TO_VIDEO | Seedance 2.5 | `SEED_V25` | False |
| video | 30 IMAGE_TO_VIDEO | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 30 IMAGE_TO_VIDEO | Seedance 2.0 fast | `SEED_FAST` | False |
| video | 30 IMAGE_TO_VIDEO | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 30 IMAGE_TO_VIDEO | Seedance 2.0 | `SEED` | False |
| video | 30 IMAGE_TO_VIDEO | Omni Flash 1.1 | `GEMINI_OMNI_FLASH_1_1` | False |
| video | 30 IMAGE_TO_VIDEO | 可灵2.6 | `MODEL_V2_6` | False |
| video | 30 IMAGE_TO_VIDEO | 可灵Omni | `MODEL` | False |
| video | 73 SALE_VIDEO | MiniMax H3 | `AIGC_MINIMAX_H3` | False |
| video | 73 SALE_VIDEO | Vidu Q4 | `VIDU_Q4_PREVIEW` | False |
| video | 73 SALE_VIDEO | 万相3.0 | `WAN3` | False |
| video | 73 SALE_VIDEO | Seedance 2.5 | `SEED_V25` | False |
| video | 73 SALE_VIDEO | Seedance 2.0 fast | `SEED_FAST` | False |
| video | 73 SALE_VIDEO | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 73 SALE_VIDEO | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 73 SALE_VIDEO | Seedance 2.0 | `SEED` | False |
| video | 87 AGENTOS_VIDEO_GEN | Seedance 2.0 | `SEED` | False |
| video | 87 AGENTOS_VIDEO_GEN | Seedance 2.0 fast | `SEED_FAST` | False |
| video | 87 AGENTOS_VIDEO_GEN | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 87 AGENTOS_VIDEO_GEN | 可灵Omni | `MODEL` | False |
| video | 87 AGENTOS_VIDEO_GEN | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 87 AGENTOS_VIDEO_GEN | 万相2.6 | `WAN` | False |
| video | 87 AGENTOS_VIDEO_GEN | Seedance 2.5 | `SEED_V25` | False |
| video | 88 IMAGE_REPLICATION | Seedance 2.5 | `SEED_V25` | True |
| video | 88 IMAGE_REPLICATION | 万相3.0 | `WAN3` | False |
| video | 88 IMAGE_REPLICATION | Seedance 2.0 fast | `SEED_FAST` | False |
| video | 88 IMAGE_REPLICATION | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 88 IMAGE_REPLICATION | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 88 IMAGE_REPLICATION | Omni Flash 1.1 | `GEMINI_OMNI_FLASH_1_1` | False |
| video | 88 IMAGE_REPLICATION | Seedance 2.0 | `SEED` | False |
| video | 88 IMAGE_REPLICATION | MiniMax H3 | `AIGC_MINIMAX_H3` | False |
| video | 88 IMAGE_REPLICATION | 海螺2.3 | `PRODUCT` | False |
| video | 88 IMAGE_REPLICATION | 可灵2.6 | `MODEL_V2_6` | False |
| video | 88 IMAGE_REPLICATION | 可灵Omni | `MODEL` | False |
| video | 88 IMAGE_REPLICATION | 万相2.6 | `WAN` | False |
| video | 89 VIDEO_REPLICATION | MiniMax H3 | `AIGC_MINIMAX_H3` | False |
| video | 89 VIDEO_REPLICATION | Vidu Q4 | `VIDU_Q4_PREVIEW` | False |
| video | 89 VIDEO_REPLICATION | 万相3.0 | `WAN3` | False |
| video | 89 VIDEO_REPLICATION | Seedance 2.5 | `SEED_V25` | False |
| video | 89 VIDEO_REPLICATION | Seedance 2.0 fast | `SEED_FAST` | False |
| video | 89 VIDEO_REPLICATION | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 89 VIDEO_REPLICATION | Seedance 2.0 | `SEED` | False |
| video | 89 VIDEO_REPLICATION | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 94 非39工具 | Seedance 2.0 fast | `SEED_FAST` | True |
| video | 94 非39工具 | 万相3.0 | `WAN3` | False |
| video | 94 非39工具 | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 94 非39工具 | Seedance 2.0 | `SEED` | False |
| video | 94 非39工具 | Seedance 2.5 | `SEED_V25` | False |
| video | 94 非39工具 | 可灵Omni | `MODEL` | False |
| video | 94 非39工具 | MiniMax H3 | `AIGC_MINIMAX_H3` | False |
| video | 94 非39工具 | 可灵2.6 | `MODEL_V2_6` | False |
| video | 94 非39工具 | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 94 非39工具 | 万相2.6 | `WAN` | False |
| video | 94 非39工具 | 海螺2.3 | `PRODUCT` | False |
| video | 95 AI_VIDEO_EDITING | Seedance 2.5 | `SEED_V25` | True |
| video | 95 AI_VIDEO_EDITING | Omni Flash 1.1 | `GEMINI_OMNI_FLASH_1_1` | False |
| video | 95 AI_VIDEO_EDITING | HappyHorse 1.0 | `HAPPY_HORSE` | False |
| video | 95 AI_VIDEO_EDITING | 万相3.0 | `WAN3` | False |
| video | 95 AI_VIDEO_EDITING | 可灵 3.0 Omni | `MODEL` | False |
| video | 95 AI_VIDEO_EDITING | Seedance 2.0 | `SEED` | False |
| video | 96 VIDEO_TRANSLATION | HappyHorse 1.0 | `HAPPY_HORSE` | False |
| video | 96 VIDEO_TRANSLATION | Seedance 2.5 | `SEED_V25` | True |
| video | 104 非39工具 | Seedance 2.5 | `SEED_V25` | True |
| video | 104 非39工具 | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 104 非39工具 | Seedance 2.0 fast | `SEED_FAST` | False |
| video | 104 非39工具 | Seedance 2.0 | `SEED` | False |
| video | 104 非39工具 | 可灵Omni | `MODEL` | False |
| video | 104 非39工具 | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 105 非39工具 | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 105 非39工具 | Seedance 2.0 fast | `SEED_FAST` | True |
| video | 105 非39工具 | Seedance 2.0 | `SEED` | False |
| video | 105 非39工具 | HappyHorse 1.1 | `HAPPY_HORSE` | False |
| video | 106 BATCH_GENERATE_VIDEOS | MiniMax H3 | `AIGC_MINIMAX_H3` | False |
| video | 106 BATCH_GENERATE_VIDEOS | Seedance 2.0 mini | `SEED_MINI` | False |
| video | 106 BATCH_GENERATE_VIDEOS | Vidu Q4 | `VIDU_Q4_PREVIEW` | False |
