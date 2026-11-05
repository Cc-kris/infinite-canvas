# 登录态下原站可达性复核（egolite）

复核时间：使用用户本机已登录 LinkFox 的 egolite 浏览器（账号「用户6991」）实测。

## 一、为什么要复核

此前受「无原站登录态」阻塞，只能用 HTTP 响应体长度做间接判断，并据此把 20/39 定为「可 1:1 对照」。拿到登录态后必须直接复核，不能沿用间接推断。

## 二、登录态已确认

egolite 中访问原站，导航栏显示「免费得算力 350」「用户6991」「个人账号」，确认处于登录状态。

## 三、逐页实测结果

对 8 个此前判为「原站无此页面」的路径，登录后直接访问并等待 7 秒充分渲染：

| slug | 跳转路径 | 页面文本 | 判定 |
|---|---|---|---|
| dress-wear-set | `/draw/dress-wear-set` | 页面不存在 | **确认不存在** |
| scale-up | `/draw/scale-up` | 页面不存在 | **确认不存在** |
| fix-color | `/draw/fix-color` | 页面不存在 | **确认不存在** |
| new-replace-bg-v2 | `/draw/new-replace-bg-v2` | 页面不存在 | **确认不存在** |
| replace-goods | `/draw/replace-goods` | 页面不存在 | **确认不存在** |
| ai-dressing-v2 | `/draw/ai-dressing-v2` | 页面不存在 | **确认不存在** |
| image-to-video | `/draw/image-to-video` | 页面不存在 | **确认不存在** |
| ai-video-editing | `/draw/ai-video-editing` | 页面不存在 | **确认不存在** |

另有 2 个此前判为「本账号被重定向首页」的路径，登录后行为不变：

| slug | 结果 |
|---|---|
| ai-text | 跳转 `/home`，显示首页内容 |
| ornament-text | 跳转 `/home`，显示首页内容 |

同时验证 8 个此前判为「可对照」的路径（product-image-suite / change-color-v2 / image-translation / ai-outpainting / area-repair / remove-pen / change-color / image-crop）登录后可正常进入 `/draw/*` 并渲染工具界面（以 image-crop 为例，页面出现「图片裁剪」「上传图片，裁剪图片为任何尺寸/比例」「亚马逊 1600 × 1600」等真实控件）。

## 四、结论

**此前的「20/39 可 1:1 对照」结论成立，不因登录态改变。**

需要特别说明两点，避免后续误读：

1. 这 8 个「不存在」的页面，登录后**不重定向**，而是停在原 URL 并渲染「页面不存在」页。仅看 URL 或 HTTP 状态会误判为可用，必须读取页面文本。
2. `ai-text` / `ornament-text` 是**重定向**回首页，与「页面不存在」是两种不同的失败形态，判据不能混用。

## 五、仍未完成

- 登录态已具备，但**20 页的双端视觉比对尚未执行**：需要按页采集原站截图并与本地截图配对比较，是一项独立工作。
- 图像上游账号（`https://api.cc-ai.xyz`）尚未接入验证。**该 key 已在对话中明文出现，建议尽快轮换**；本仓库不保存该 key。
