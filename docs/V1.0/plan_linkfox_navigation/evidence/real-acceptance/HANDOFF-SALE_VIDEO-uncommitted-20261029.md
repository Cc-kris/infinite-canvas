# 交棒说明：工作区未提交的 SALE_VIDEO 改动（2026-10-29）

按指令 SALE_VIDEO 已由 `lf_sale_video_real_close` 接管，以下改动**未暂存、未提交**，留在工作区供接管者自行复核/采用/丢弃：

## 1. `web/src/features/tools/adapters/sale-video.ts`（已改）

```diff
+import { computeVideoSize } from "@/lib/media-size";
 ...
       fields: buildSaleVideoFields(input),
+      /* 页内「画幅 / 时长 / 分辨率」必须真的进请求：此前只写进 prompt 文本，
+       * 请求沿用了全局配置（6 秒 · 1:1），成片与页面选择不一致。 */
+      videoRatio: input.state.aspectRatio,
+      videoSeconds: String(input.state.videoTime),
+      size: computeVideoSize(input.state.resolution, input.state.aspectRatio),
```

## 2. `web/src/features/tools/adapters/sale-video.test.ts`（已改）

对应断言：构建出的 BrowserToolInput 必须携带 `videoRatio` / `videoSeconds` / `size`。

## 3. 判定依据（VIDEO_CONCAT 侧同款实证，可直接复用）

对 VIDEO_CONCAT 抓包证明：只要 adapter 在 BrowserToolInput 里给出 `videoRatio` / `videoSeconds` / `size`，
网关真实请求即带

```
seconds=10&size=720x1280&ratio=9:16&resolution_name=720p
```

即该三个字段是「页内选择 → 真实请求」的唯一通路，SALE_VIDEO 的缺口与之同源。

## 4. 未验证项（接管者注意）

- 上述 SALE_VIDEO 改动**只做了字段构造层**，尚未跑真实生成（真实出片由接管者负责）。
- 若接管者另有实现，请以对方为准，直接 `git checkout --` 覆盖即可，无其它依赖。
