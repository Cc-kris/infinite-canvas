# FIX_COLOR 真实生成 + 历史恢复：进展备注（2026-10-29）

## 已完成的真实运行（不是模拟）
- 页面：http://127.0.0.1:3000/tools/smart-edit/fix-color （标签 1709629199，agent 自开）
- 输入：`fixtures/fix-color/product-watch.jpg` 1024×744，31,860 bytes，
  sha256=`43ede96e7ce885098df793143b215e2c7d2ea7558af711ec5c46975a0dc19be3`
- 涂抹：8 笔（合成 PointerEvent，覆盖率 ~1.5%+），区域色 #B79A7C → 目标色 #A8896A（ΔE 6.5）
- 提交：仅 1 次真实请求 → `task-mvt9r1lg-ab8tqn`
  - model `default::gpt-image-2`，通道 ccai-tmp（`https://api.cc-ai.xyz`，经本地 23210 代理）
  - status=`succeeded`，duration 24s，1 个结果
  - 结果：PNG，1,218,527 bytes，sha256=`83ef17c23f33eb25593f48aac97db9c4b8797f898fc530c12d80871bbd92d900`
  - storageKey `tool-result:PIvAsueZHgZNHS9_77Fw8`（IndexedDB 落库）
  - 与输入不同图（hash 不同、字节差 38×）
- 证据：`result-real-20261029.png`（原始字节落盘）、`result-b64-20261029.json`（含校验元数据）

## 发现的真实缺陷（本地字段/schema）
- prompt 明确要求「输出与原图相同尺寸」，但请求 configSnapshot.size 用的是全局配置 `1:1`
  → 结果 1024×1024 ≠ 原图 1024×744（画面被改比例，UI 对比也失真）。
- 根因：FIX_COLOR 适配器 `buildFixColorInput` 未下发 `size`，网关 `buildToolConfig` 回落到用户全局 imageSize。
- 修复方案（仅改 FIX_COLOR 自身文件）：
  - `web/src/features/tools/adapters/fix-color.ts`
    - 新增 `fixColorOutputSize(width, height)`：按原图比例算出请求尺寸，边长吸附 `IMAGE_SIZE_STEP=16`，
      并夹在 `image.ts` 的像素/边长约束内（maxEdge 3840 / maxPixels 8294400 / minPixels 655360）。
    - `FixColorUnit` 增 `size?: string`；`buildFixColorUnit` 用 `snapshot.imageWidth/imageHeight` 计算；
      `buildFixColorInput` 透传 `size`（网关侧 `input.size` 优先于全局 config.size）。
  - 测试：`fix-color.test.ts` 断言 1024×744 → `1024x736`，且 16 步进/限幅/缺失尺寸回退。
- 上游接受任意 WxH 的旁证：AI_TEXT 真实运行 `size=720x960` 得 200（gpt-image-2 非标准尺寸），
  见 `evidence/real-acceptance/AI_TEXT/result.json`。

## 旧 BLOCKED 的真实根因（本轮复现结论）
- 旧记录的失败：通道打 api.openai.com（不可达）+ Playwright 独立 profile 的 defaultConfig，
  与当前用户 ccai-tmp 配置不同；不是工具逻辑缺陷。

## 待办
1. 实施 size 修复 + 单测；typecheck。
2. 修复后如需再验一次尺寸，允许 1 次真实提交（用户已支付 1 次，谨慎）。
3. fresh reload 验历史恢复（历史任务 + 结果图仍在）。
4. 只提交 FIX_COLOR 相关文件（工作区有他人改动）。

## 第 2 次真实提交（修复后复验，2026-10-29 16:24）
- taskId `task-mvta1kkg-t8y1yo`，41s，status=succeeded
- configSnapshot.size = **1024x752**（原图 1024×744；16 步进吸附），model default::gpt-image-2，channelId default
- 结果 1,003,673 bytes PNG，1024×752，sha256 `a5958a770e8f630649e57a8849858ab2b8c72f72f344673f77e22f2c89339525`
  → evidence/real-acceptance/FIX_COLOR/result-real-run2-20261029.png
- 与输入差异（还原到 1024×744 后逐像素）：mean_abs_diff 14.75，>12 灰度差占 17.80%，>30 占 16.00%
  → 真实改图，不是回传原图。
- 对比第 1 跑（size=1:1，1024×1024）：mean_abs_diff 17.62，>12 占 24.32%。

## 遗留（如实记录）
- 16 步进吸附使输出比原图最多差 8px（如 744→752，纵向 1.08%），比例误差 ≈1%；
  这是上游尺寸约束（IMAGE_SIZE_STEP=16）导致的折中，已由 `fixColorOutputSize` 单测固化。
