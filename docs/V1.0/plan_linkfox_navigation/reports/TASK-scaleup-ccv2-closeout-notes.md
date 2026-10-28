# 收尾实测记录（2026-10-29 00:20–00:45）

## SCALE_UP（高清放大）
- 复用 1709628096 标签内既有真实结果（1024×752，blob），未重新生成。
- 下载 → ~/Downloads/scale-up-result-1.png（1,152,074 B），已拷为 05-downloaded.png
- 存入资产 → `已保存到资产库（AzmBB3Km3nlGYqUY4POms）`；IDB 直读确认 bytes=1152074 / 1024×752 / storageKey=image:ZGoJmi2_gBeofwfV5S5fB
- 发送画布 → `已发送到画布（aFEdKzyxmfug5VRJNTkWN）`；canvas_store 直读确认 project title=「SCALE_UP 结果」nodes=1（image-1793204985747-k7zvh）
- 证据：06-result-actions.json / 07-result-actions-verified.json / 08-linkfox-dom.json / 09-site-config-dom.json

## CHANGE_COLOR_V2（套图换色）
- 任务历史：task-mvsb41o4-obzwag、task-mvsb41o9-hv2vqo 均 unknown（unclassified 请求失败，代理崩溃期，00:06 提交）→ 01-task-history.json
- 上游可达性：https://api.cc-ai.xyz/v1/models 无 key 返回 401/1.5s；经 23210 代理同样 401 → 网络链路正常
- 00:34:38 对单元 1（apparel-print.jpg）单权重试 → 00:35:08 成功，真实产物 `https://oss-us.dimenoss.com/images/2026/10/29/1793205308_f2532a74dca46886316b645`（1024×1024，task-mvsc4fyg-qobp8k status=succeeded）
- 下载成功：~/Downloads/1793205308_f2532a74dca46886316b645a820d05c7.png（1,115,668 B）→ 05-unit1-result.png
- 00:37:13 对单元 2 重试（task-mvsc7s58-2rrnqz）；00:38:41 页面被重置（整套结果回到「尚未生成」，任务记录停在 submitting），单元 2 结果无法回收；任务记录 result item `payloadDropped:true` → 会话内结果不可再操作（存资产/发画布无按钮）
- 结论：CCV2 = PARTIAL（1/2 单元真实出图并下载；2 单元未定）

## 环境备忘
- 页面在 16:38:41Z（00:38:41 CST）发生整页重置，导致 CCV2 结果面板清空；提交中任务卡在 submitting
