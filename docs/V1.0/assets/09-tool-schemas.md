# 资产 09｜39 工具提交契约

> **资产来源**：[`schema_final.json`](../../analysis/assets/linkfox/schema_final.json) / [`schema_clean.json`](../../analysis/assets/linkfox/schema_clean.json) / [`tool_types_and_coverage.json`](../../analysis/assets/linkfox/tool_types_and_coverage.json)
> **应用位置**：`ToolSpec` 注册表、动态表单、zod 校验、`buildRequest` 请求构造
> **数据范围**：39 个工具契约
> **使用边界**：仅用于复刻开发与内部 A/B 基准；原站图片、模板及文案不直接进入商用资产库。

---

## 怎么用

- 每个工具的表单、默认值、必填校验和请求构造都以本契约为准。
- `type` 是原站协议编号，仅用于对照；本地执行不携带 LinkFox type，也不调用原站 create。
- `fields_clean` 为 create 顶层字段；`sub` 为重要嵌套字段。

## AI_DRESSING_V2 · type=24

**顶层字段（20）**

~~~text
[
  "coverList",
  "downImageUrl",
  "downMaskUrl",
  "downOriginUrl",
  "genOriRes",
  "images",
  "isSecondOperate",
  "modelPose",
  "modelPoseList",
  "modelType",
  "name",
  "outputNum",
  "provider",
  "suitImageUrl",
  "suitMaskUrl",
  "suitOriginUrl",
  "upperImageUrl",
  "upperMaskUrl",
  "upperOriginUrl",
  "version"
]
~~~

**嵌套字段**

~~~text
[
  "coverList",
  "downImageUrl",
  "downMaskUrl",
  "downOriginUrl",
  "genOriRes",
  "images",
  "isSecondOperate",
  "modelPose",
  "modelPoseList",
  "modelType",
  "outputNum",
  "provider",
  "suitImageUrl",
  "suitMaskUrl",
  "suitOriginUrl",
  "t",
  "type",
  "upperImageUrl",
  "upperMaskUrl",
  "upperOriginUrl",
  "version"
]
~~~

## AI_DRESSING_XSY · type=39

**顶层字段（17）**

~~~text
[
  "downImageUrl",
  "downMaskUrl",
  "downOriginUrl",
  "modelImageUrl",
  "modelPose",
  "modelStyle",
  "modelType",
  "outputNum",
  "provider",
  "step",
  "suitImageUrl",
  "suitMaskUrl",
  "suitOriginUrl",
  "upperImageUrl",
  "upperMaskUrl",
  "upperOriginUrl",
  "version"
]
~~~

**嵌套字段**

~~~text
[
  "downImageUrl",
  "downMaskUrl",
  "downOriginUrl",
  "modelImageUrl",
  "modelPose",
  "modelStyle",
  "modelType",
  "provider",
  "step",
  "suitImageUrl",
  "suitMaskUrl",
  "suitOriginUrl",
  "type",
  "upperImageUrl",
  "upperMaskUrl",
  "upperOriginUrl",
  "version"
]
~~~

## AI_OUTPAINTING · type=25

**顶层字段（19）**

~~~text
[
  "config",
  "editFlag",
  "height",
  "imageConfig",
  "imageExpandUrl",
  "imageName",
  "imageUrl",
  "maskUrl",
  "originImageUrl",
  "outputNum",
  "prompt",
  "ratio",
  "sizeSetHeight",
  "sizeSetName",
  "sizeSetType",
  "sizeSetValue",
  "sizeSetWidth",
  "stageConfig",
  "width"
]
~~~

**嵌套字段**

~~~text
[
  "config",
  "editFlag",
  "height",
  "imageConfig",
  "imageExpandUrl",
  "maskUrl",
  "originImageUrl",
  "ratio",
  "sizeSetHeight",
  "sizeSetName",
  "sizeSetType",
  "sizeSetValue",
  "sizeSetWidth",
  "stageConfig",
  "width"
]
~~~

## AI_POSE_GENERATOR · type=57

**顶层字段（2）**

~~~text
[
  "prompt",
  "scenePrompts"
]
~~~

**嵌套字段**

~~~text
[
  "scenePrompts"
]
~~~

## AI_POSTURE · type=58

**顶层字段（4）**

~~~text
[
  "imageTags",
  "imageUrl",
  "outputNum",
  "prompt"
]
~~~

**嵌套字段**

~~~text
[
  "imageTags"
]
~~~

## AI_TEXT · type=14

**顶层字段（14）**

~~~text
[
  "aiSimpleTextPrompt",
  "imageUrl",
  "isCase",
  "mode",
  "outputNum",
  "prompt",
  "ratio",
  "requestId",
  "responseId",
  "styles",
  "stylesCn",
  "tilingPreset",
  "useAutopromptOption",
  "variationStrength"
]
~~~

**嵌套字段**

~~~text
[
  "aiSimpleTextPrompt",
  "isCase",
  "mode",
  "prompt",
  "ratio",
  "requestId",
  "responseId",
  "styles",
  "stylesCn",
  "tilingPreset",
  "useAutopromptOption",
  "variationStrength"
]
~~~

## AI_VIDEO_EDITING · type=95

**顶层字段（7）**

~~~text
[
  "duration",
  "outputNum",
  "prompt",
  "refImageUrls",
  "sourceVideoDuration",
  "sourceVideoUrl",
  "videoType"
]
~~~

**嵌套字段**

~~~text
[
  "F",
  "duration",
  "prompt",
  "refImageUrls",
  "sourceVideoDuration",
  "sourceVideoUrl",
  "videoType"
]
~~~

## AI_WEARABLE · type=34

**顶层字段（13）**

~~~text
[
  "checkType",
  "imageMaskUrl",
  "imageResultUrl",
  "imageUrl",
  "isSecondOperate",
  "modelId",
  "modelTabType",
  "outputNum",
  "productCategory",
  "sceneTabType",
  "targetMaskUrl",
  "targetOriginUrl",
  "targetResultUrl"
]
~~~

**嵌套字段**

~~~text
[
  "checkType",
  "imageMaskUrl",
  "imageResultUrl",
  "isSecondOperate",
  "modelId",
  "modelTabType",
  "productCategory",
  "sceneTabType",
  "targetMaskUrl",
  "targetOriginUrl",
  "targetResultUrl"
]
~~~

## AREA_REPAIR · type=32

**顶层字段（6）**

~~~text
[
  "autoExpand",
  "imageName",
  "imageUrl",
  "maskUrl",
  "outputNum",
  "prompt"
]
~~~

**嵌套字段**

~~~text
[
  "autoExpand",
  "maskUrl"
]
~~~

## CHANGE_COLOR · type=19

**顶层字段（16）**

~~~text
[
  "adjustLight",
  "colorParams",
  "coverList",
  "doInpaint",
  "imageFormat",
  "imageHeight",
  "imageMaskUrl",
  "imageName",
  "imageSegUrl",
  "imageSize",
  "imageTagData",
  "imageUrl",
  "imageWidth",
  "images",
  "name",
  "sourceImageUrl"
]
~~~

**嵌套字段**

~~~text
[
  "adjustLight",
  "colorParams",
  "coverList",
  "doInpaint",
  "imageFormat",
  "imageHeight",
  "imageMaskUrl",
  "imageSegUrl",
  "imageSize",
  "imageTagData",
  "imageWidth",
  "images",
  "sourceImageUrl"
]
~~~

## CHANGE_COLOR_V2 · type=93

**顶层字段（2）**

~~~text
[
  "imageName",
  "imageUrl"
]
~~~

## DRESS_WEAR_SET · type=69

**顶层字段（16）**

~~~text
[
  "aspectRatio",
  "brandDNA",
  "brandKey",
  "brandName",
  "coverList",
  "imageUrl",
  "images",
  "language",
  "name",
  "needIntelligent",
  "outputNum",
  "platform",
  "provider",
  "quality",
  "resolution",
  "salesRegion"
]
~~~

**嵌套字段**

~~~text
[
  "aspectRatio",
  "brandDNA",
  "brandKey",
  "brandName",
  "coverList",
  "images",
  "language",
  "needIntelligent",
  "platform",
  "provider",
  "quality",
  "resolution",
  "salesRegion"
]
~~~

## FISSION_LINK · type=83

**顶层字段（2）**

~~~text
[
  "imageUrl",
  "outputNum"
]
~~~

## FIX_COLOR · type=26

**顶层字段（7）**

~~~text
[
  "fixColorSegUrl",
  "fixColorUrl",
  "imageName",
  "imageResultUrl",
  "imageSegUrl",
  "imageUrl",
  "version"
]
~~~

**嵌套字段**

~~~text
[
  "fixColorSegUrl",
  "fixColorUrl",
  "imageResultUrl",
  "imageSegUrl",
  "version"
]
~~~

## HANDHELD_GOODS · type=49

**顶层字段（11）**

~~~text
[
  "checkType",
  "imageMaskUrl",
  "imageResultUrl",
  "imageUrl",
  "modelId",
  "modelTabType",
  "outputNum",
  "sceneTabType",
  "targetMaskUrl",
  "targetOriginUrl",
  "targetResultUrl"
]
~~~

**嵌套字段**

~~~text
[
  "checkType",
  "imageMaskUrl",
  "imageResultUrl",
  "modelId",
  "modelTabType",
  "sceneTabType",
  "targetMaskUrl",
  "targetOriginUrl",
  "targetResultUrl"
]
~~~

## HAND_REPAIR · type=31

**顶层字段（5）**

~~~text
[
  "imageName",
  "imageUrl",
  "maskUrl",
  "outputNum",
  "personType"
]
~~~

**嵌套字段**

~~~text
[
  "imageUrl",
  "maskUrl",
  "personType"
]
~~~

## IMAGE_CROP · type=67

**顶层字段（12）**

~~~text
[
  "activeTab",
  "contentUrl",
  "imageCropUrl",
  "imageFormat",
  "imageHeight",
  "imageSize",
  "imageUrl",
  "imageWidth",
  "platform",
  "platformTitle",
  "ratio",
  "selectedMode"
]
~~~

**嵌套字段**

~~~text
[
  "activeTab",
  "contentUrl",
  "imageCropUrl",
  "imageFormat",
  "imageHeight",
  "imageSize",
  "imageWidth",
  "platform",
  "platformTitle",
  "ratio",
  "selectedMode"
]
~~~

## IMAGE_TEXT_EDIT · type=78

**顶层字段（8）**

~~~text
[
  "boxes",
  "imageFormat",
  "imageHeight",
  "imageName",
  "imageSize",
  "imageUrl",
  "imageWidth",
  "resultImageUrl"
]
~~~

**嵌套字段**

~~~text
[
  "boxes",
  "imageFormat",
  "imageHeight",
  "imageSize",
  "imageWidth",
  "resultImageUrl"
]
~~~

## IMAGE_TO_VIDEO · type=30

**顶层字段（27）**

~~~text
[
  "aspectRatio",
  "duration",
  "extension",
  "fileKey",
  "fileName",
  "imageInputMode",
  "imageList",
  "imageUrl",
  "isPro",
  "language",
  "lastFrameImageUrl",
  "productInfo",
  "productUrl",
  "prompt",
  "promptOptimizer",
  "referenceAudios",
  "referenceDocument",
  "referenceVideo",
  "saleCountry",
  "size",
  "sourceImageUrl",
  "templateKey",
  "templateName",
  "thumbUrl",
  "url",
  "videoTime",
  "videoType"
]
~~~

**嵌套字段**

~~~text
[
  "O",
  "Rn",
  "aspectRatio",
  "c",
  "duration",
  "extension",
  "fileKey",
  "fileName",
  "imageInputMode",
  "imageList",
  "isPro",
  "language",
  "lastFrameImageUrl",
  "productInfo",
  "productUrl",
  "prompt",
  "promptOptimizer",
  "referenceAudios",
  "referenceDocument",
  "referenceVideo",
  "saleCountry",
  "size",
  "sourceImageUrl",
  "templateKey",
  "templateName",
  "thumbUrl",
  "url",
  "videoTime",
  "videoType"
]
~~~

## IMAGE_TRANSLATION · type=45

**顶层字段（5）**

~~~text
[
  "imageName",
  "imageSegUrl",
  "imageUrl",
  "sourceLanguage",
  "targetLanguage"
]
~~~

**嵌套字段**

~~~text
[
  "imageSegUrl",
  "sourceLanguage",
  "targetLanguage"
]
~~~

## MATERIAL_UPPER_BODY · type=16

**顶层字段（7）**

~~~text
[
  "categoryIds",
  "categoryName",
  "imageName",
  "imageUrl",
  "isMatting",
  "outputNum",
  "subType"
]
~~~

**嵌套字段**

~~~text
[
  "categoryIds",
  "categoryName",
  "isMatting"
]
~~~

## NEW_DESIGNER · type=99

**顶层字段（6）**

~~~text
[
  "designerId",
  "imageUrl",
  "isDesignerUse",
  "onClose",
  "onDone",
  "open"
]
~~~

**嵌套字段**

~~~text
[
  "designerId",
  "isDesignerUse"
]
~~~

## NEW_REPLACE_BG_V2 · type=28

**顶层字段（0）**

~~~text
[]
~~~

## ORNAMENT_TEXT · type=17

**顶层字段（5）**

~~~text
[
  "fontSize",
  "fontname",
  "left",
  "prompt",
  "right"
]
~~~

**嵌套字段**

~~~text
[
  "fontSize",
  "fontname",
  "left",
  "right"
]
~~~

## PRINTING_REPAIR · type=29

**顶层字段（13）**

~~~text
[
  "config",
  "height",
  "imageResultUrl",
  "imageUrl",
  "point",
  "rotate",
  "scale",
  "stampingFlowerSegUrl",
  "stampingFlowerUrl",
  "targetConfig",
  "url",
  "version",
  "width"
]
~~~

**嵌套字段**

~~~text
[
  "config",
  "height",
  "imageResultUrl",
  "point",
  "rotate",
  "scale",
  "stampingFlowerSegUrl",
  "stampingFlowerUrl",
  "targetConfig",
  "type",
  "url",
  "version",
  "width",
  "x",
  "y"
]
~~~

## PRINT_EXTRACT · type=60

**顶层字段（2）**

~~~text
[
  "imageUrl",
  "isTransparent"
]
~~~

**嵌套字段**

~~~text
[
  "isTransparent"
]
~~~

## PRODUCT_IMAGE_SUITE · type=71

**顶层字段（2）**

~~~text
[
  "imageUrl",
  "outputNum"
]
~~~

## PRODUCT_MARKET_MATERIAL · type=64

**顶层字段（15）**

~~~text
[
  "APlusAspectRatio",
  "aspectRatio",
  "brandDNA",
  "brandKey",
  "brandName",
  "coverList",
  "images",
  "isCustomAspectRatio",
  "language",
  "name",
  "platform",
  "provider",
  "quality",
  "resolution",
  "salesRegion"
]
~~~

**嵌套字段**

~~~text
[
  "APlusAspectRatio",
  "aspectRatio",
  "brandDNA",
  "brandKey",
  "brandName",
  "coverList",
  "images",
  "isCustomAspectRatio",
  "language",
  "platform",
  "provider",
  "quality",
  "resolution",
  "salesRegion"
]
~~~

## PRODUCT_REFINE · type=56

**顶层字段（8）**

~~~text
[
  "color",
  "imageOutputLength",
  "imageSegUrl",
  "imageUrl",
  "imgTransform",
  "isRmBg",
  "ratio",
  "realImageUrl"
]
~~~

**嵌套字段**

~~~text
[
  "color",
  "imageOutputLength",
  "imageSegUrl",
  "imgTransform",
  "isRmBg",
  "ratio",
  "realImageUrl"
]
~~~

## PRODUCT_SCENE · type=13

**顶层字段（15）**

~~~text
[
  "cutoutProvider",
  "imageName",
  "imageOutputHeight",
  "imageOutputWidth",
  "imageUrl",
  "mode",
  "originImageUrl",
  "outputNum",
  "prompt",
  "provider",
  "ratio",
  "sceneKeyword",
  "segImageUrl",
  "sizeType",
  "strength"
]
~~~

**嵌套字段**

~~~text
[
  "I",
  "P",
  "cutoutProvider",
  "imageOutputHeight",
  "imageOutputWidth",
  "mode",
  "originImageUrl",
  "provider",
  "sceneKeyword",
  "segImageUrl",
  "sizeType",
  "strength"
]
~~~

## REMOVE_PEN · type=23

**顶层字段（4）**

~~~text
[
  "eraseImageUrl",
  "imageName",
  "imageUrl",
  "maskImageUrl"
]
~~~

**嵌套字段**

~~~text
[
  "eraseImageUrl",
  "maskImageUrl"
]
~~~

## REPLACE_GOODS · type=12

**顶层字段（22）**

~~~text
[
  "config",
  "cutoutProvider",
  "denoiseStrength",
  "height",
  "imageName",
  "imageOutputHeight",
  "imageOutputWidth",
  "imageUrl",
  "lockImageUrl",
  "maskUrl",
  "outputNum",
  "point",
  "ratio",
  "rotate",
  "scale",
  "sourceImageUrl",
  "sourceOriginUrl",
  "targetConfig",
  "targetImageUrl",
  "targetOriginUrl",
  "url",
  "width"
]
~~~

**嵌套字段**

~~~text
[
  "config",
  "cutoutProvider",
  "denoiseStrength",
  "height",
  "imageOutputHeight",
  "imageOutputWidth",
  "lockImageUrl",
  "maskUrl",
  "point",
  "rotate",
  "scale",
  "sourceImageUrl",
  "sourceOriginUrl",
  "targetConfig",
  "targetImageUrl",
  "targetOriginUrl",
  "type",
  "url",
  "width"
]
~~~

## SALE_VIDEO · type=73

**顶层字段（12）**

~~~text
[
  "aspectRatio",
  "hiddenPrompt",
  "imageList",
  "imageUrl",
  "isPro",
  "language",
  "prompt",
  "resolution",
  "saleCountry",
  "videoTime",
  "videoType",
  "visiblePrompt"
]
~~~

**嵌套字段**

~~~text
[
  "aspectRatio",
  "hiddenPrompt",
  "imageList",
  "isPro",
  "language",
  "prompt",
  "q",
  "resolution",
  "saleCountry",
  "videoTime",
  "videoType",
  "visiblePrompt"
]
~~~

## SCALE_UP · type=7

**顶层字段（7）**

~~~text
[
  "enhanceFace",
  "enhanceQuality",
  "imageName",
  "imageOutputHeight",
  "imageOutputWidth",
  "imageUrl",
  "magnification"
]
~~~

**嵌套字段**

~~~text
[
  "M",
  "P",
  "ee",
  "enhanceFace",
  "enhanceQuality",
  "ge",
  "imageOutputHeight",
  "imageOutputWidth",
  "magnification",
  "me",
  "y"
]
~~~

## SCENE_TRANSFER · type=63

**顶层字段（4）**

~~~text
[
  "imageStyleUrl",
  "imageUrl",
  "segImageUrl",
  "similarity"
]
~~~

**嵌套字段**

~~~text
[
  "imageStyleUrl",
  "segImageUrl",
  "similarity"
]
~~~

## SDS_DESIGN · type=22

**顶层字段（5）**

~~~text
[
  "imageList",
  "imageName",
  "imageUrl",
  "materialList",
  "productId"
]
~~~

**嵌套字段**

~~~text
[
  "imageList",
  "materialList",
  "productId"
]
~~~

## VIDEO_CONCAT · type=52

**顶层字段（10）**

~~~text
[
  "editType",
  "imageFormat",
  "imageHeight",
  "imageSize",
  "imageUrl",
  "imageWidth",
  "videoCoverUrl",
  "videoList",
  "videoRatio",
  "videoTime"
]
~~~

**嵌套字段**

~~~text
[
  "editType",
  "imageFormat",
  "imageHeight",
  "imageSize",
  "imageWidth",
  "videoCoverUrl",
  "videoList",
  "videoRatio",
  "videoTime"
]
~~~

## VIDEO_REPLICATION · type=89

**顶层字段（27）**

~~~text
[
  "analyzeRedisKey",
  "aspectRatio",
  "clipEnd",
  "clipMode",
  "clipStart",
  "coverUrl",
  "duration",
  "imageSegUrl",
  "imageUrl",
  "isPro",
  "originalVideoId",
  "originalVideoUrl",
  "prompt",
  "promptOptimizer",
  "ratio",
  "refImageList",
  "refVideoName",
  "refVideoUrl",
  "resolution",
  "saleCountry",
  "sourceVideoDuration",
  "sourceVideoUrl",
  "targetLanguage",
  "videoCoverType",
  "videoSource",
  "videoTime",
  "videoType"
]
~~~

**嵌套字段**

~~~text
[
  "analyzeRedisKey",
  "aspectRatio",
  "clipEnd",
  "clipMode",
  "clipStart",
  "coverUrl",
  "duration",
  "imageSegUrl",
  "isPro",
  "originalVideoId",
  "originalVideoUrl",
  "prompt",
  "promptOptimizer",
  "ratio",
  "refImageList",
  "refVideoName",
  "refVideoUrl",
  "resolution",
  "saleCountry",
  "sourceVideoDuration",
  "sourceVideoUrl",
  "targetLanguage",
  "videoCoverType",
  "videoSource",
  "videoTime",
  "videoType"
]
~~~

## VIDEO_TRANSLATION · type=96

**顶层字段（7）**

~~~text
[
  "lipSync",
  "outputNum",
  "sourceLanguage",
  "sourceVideoName",
  "sourceVideoUrl",
  "targetLanguage",
  "videoType"
]
~~~

**嵌套字段**

~~~text
[
  "lipSync",
  "sourceLanguage",
  "sourceVideoName",
  "sourceVideoUrl",
  "targetLanguage",
  "videoType"
]
~~~
