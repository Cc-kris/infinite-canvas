# IMAGE_CROP 真实功能闭环验收

脚本：`web/scripts/real-acceptance/crop-functional-accept.mjs`（纯本地 canvas 渲染，不调用上游模型、不消耗算力）

## 验收链

1. 用页面自身生成 1200×800 渐变 PNG，走真实 `<input type=file>` 上传
2. 断言画布与裁剪框出现、输出摘要为 `1200×800`
3. 切到平台预设（amazon），摘要跟随为 `1024×1024`
4. 点「下载图片」，捕获真实 download 事件
5. 读取落盘文件 PNG IHDR，宽度/高度必须等于所选预设

## 结果（2026-11-03 实跑）

```
PASS  上传后出现可裁剪画布
PASS  上传后输出摘要显示原图尺寸
PASS  平台预设可选（≥20 项）
PASS  切换预设后摘要跟随
PASS  下载文件名与预设一致
PASS  下载字节是真实 PNG
PASS  PNG 头尺寸与预设一致
PASS  无页面错误

8/8 通过
```

下载实测：`crop-1024x1024.png`，28518 字节，PNG 头 1024×1024。

## 复现

```bash
cd web
node scripts/real-acceptance/crop-functional-accept.mjs
```
