# 应用图标来源核查（2026-10-21）

用户反馈「界面 icon 换了，但 mac 应用 logo 还是旧版」。

## 实测结论（像素比对，非猜测）
- `desktop/build/icon.png`（1024，旧版）：**内容确实是 v2 图案**，但是 macOS 官方网格构图——图案缩到 824×824、居中、四周留 100px 透明边、自带圆角。
  - 裁板后与 v2 对比 MAE = 4.05，与 UI logo 对比 3.34 → 图案 = v2，只是缩小了 20%。
- `desktop/build/icon.ico`（256）：**满幅 v2**，与 v2 对比 MAE = 0.32。
- `icon.icns` 由上述 icon.png 生成，md5 `1e118b65…`；仓库已跟踪（commit `1f4d0a9`），0.23/0.24/0.25 三个 tag 都含；本地 `release/mac-arm64` 包内 icns md5 与仓库一致。
- 旧图标（commit `0c622fc`）与当前图标 MAE = 54.4 → 确实换过。
- CI `.github/workflows/desktop-release.yml` 在 `desktop/` 目录跑 electron-builder，读取 `build/icon.icns`，路径正确。
- 本机 `/Applications` 无该 app（只有本地构建产物 `desktop/release/mac-arm64`），系统 macOS 26.3。

## 判断
包内图标本来就是 v2。用户看到的「旧」有两个可能：① 安装的 app 版本早于 `1f4d0a9`（0.22 及以前）；② macOS 图标缓存（同路径原位覆盖安装不刷新）。
同时，824 内缩构图在 macOS 26 上被系统再套一层 squircle，视觉上比界面 logo 小一圈，容易被当成「不是新图」。

## 本次修正
按 v2 母图（`GAdocs/generated_images/infinite-canvas-logo-v2.png`, 1254²）重做：
- `build/icon.png` = 1024 满幅（无内缩、无额外留白）
- `build/icon.iconset/` 10 个尺寸 → `iconutil` 生成 `icon.icns`（1.87MB）
- `build/icon.ico` 16/24/32/48/64/128/256，同源生成
- 校验：icns 512/1024 内容与 v2 MAE 0.45–0.60；ico 256 MAE 0.21
