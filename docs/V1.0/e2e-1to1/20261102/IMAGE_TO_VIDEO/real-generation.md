# IMAGE_TO_VIDEO 真实生成验收（2026-11-03）

本页是当前环境下**唯一可完成真实生成闭环**的工具：本机测试账号只有一个可用模型 `MiniMax-H3`（视频）。

## 环境事实

```
GET /v1/models  →  {"data":[{"id":"MiniMax-H3","object":"model","owned_by":"xai"}]}
```

仅 1 个视频模型，**无任何图像模型**。因此图像类工具的真实生成在当前环境下不可完成（实测被上游拒绝：`404 Model "gpt-image-2" is not available for this group`）。

## 真实调用链（实测）

凭据来自本机测试密钥服务 `http://127.0.0.1:18472/`，以 `probe-real` 渠道注入页面配置（不改用户浏览器配置、不写死密钥到仓库）。

| 步骤 | 实测 |
|---|---|
| 注入渠道 | `videoModel = probe-real::MiniMax-H3` |
| 上传参考图 | 1200×800 真实 PNG，页面显示 `crop-src.png 4.7 KB · 1200×800 · image/png` |
| 填提示词 | `产品缓慢旋转展示` |
| 点「立即生成」 | 提交成功，源配置锁定，步骤条进入「生成中」 |
| 网络 | `200 POST /v1/videos` → `200 GET /v1/videos/task_FrRxKLvqfXhAFGLcU3jUhrvCDfDx8fA8`（持续轮询 200） |
| 约 220s 后 | 结果区出现 `<video src="blob:...">`，任务完成 |

无 pageerror、无 console error。

## 截图

![真实生成结果](real-generation.png)

空态复查（结果区 1108×233，标题/引导/图标齐全）：

![空态复查](empty-state-recheck.png)

## 仍存在的差异（如实记录）

1. ~~完成任务后结果区大片空白~~ **该判断已撤回**：复查空态实测结果区 1108×233，标题、引导文案、图标齐全（见 `/tmp/i2v-empty.png` 复核）。上一轮截图里的空白是截取时机早于视频元素挂载造成的观察假象，不是布局缺陷。
2. 生成耗时约 220s，期间无进度百分比，只有「生成中」文案。
3. 结果区的保存/下载/发画布动作仍未逐一验证（需要再次消耗真实生成后才能复现结果，本轮未做）。

## 复现方式

```bash
# 前提：canvas-proxy 在 23210，密钥服务在 18472
node /tmp/i2v-wait.mjs   # 脚本逻辑：注入 probe-real 渠道 → 上传 → 提交 → 轮询到完成
```

该脚本非仓库内脚本（一次性探针）；如需长期回归，应移入 `web/scripts/real-acceptance/`。
