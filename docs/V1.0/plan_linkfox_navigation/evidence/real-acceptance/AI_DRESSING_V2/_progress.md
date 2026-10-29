# AI_DRESSING_V2 真实生成现场记录 (2026-10-29)

- 浏览器: 常驻 profile, tab 1709629263, http://127.0.0.1:3000/tools/product-design/ai-dressing-v2
- 上传(DataTransfer -> 真实 input, 走应用自身校验):
  - 模特 model-portrait.png 720x960 819224B
  - 上装 apparel-print.jpg 1024x1024 88526B
  - 下装 apparel-print-ref.jpg 768x768 42356B
  - fixture 由 127.0.0.1:8811 静态服务(CORS *) 提供真实字节
- 蒙版: 点「整件」-> 蒙版覆盖 100% / 100%; dressing-blocked 消失; submit 可用
- taskId: task-mvtgeodr-5vx7tw (clientOperationId cd262fbb-0e7b-4a0a-8870-1b0dc0c8552b)
- 上游: POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits -> HTTP 200
- 模型: default::gpt-image-2 / capability image / size 1:1
- 结果: status succeeded, finishedAt 1793272982280, 1 item
  - storageKey tool-result:q4bPZX5vTN4iHB0rXuXBt
  - bytes 2115031, mimeType image/png, 1024x1024
  - sha256 860007f212c813591b72c2463d898c99e4517e43479493caac783a1918e5ac38
