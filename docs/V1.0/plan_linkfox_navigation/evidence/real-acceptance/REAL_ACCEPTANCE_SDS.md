# 电商套图 6 工具真实运行验收（worker: SDS）

日期 2026-10-28，应用 http://127.0.0.1:3000（v0.27.0，vite dev），分支 feat/linkfox-v1-real。
素材：http://127.0.0.1:8977/product_watch.jpg（1024×744 JPEG），UI 全程通过「从本地上传」按钮真实上传。
模型渠道：localStorage `infinite-canvas:ai_config_store` 的 `ccai-tmp::gpt-image-2`（见 FINDINGS-worker-pod.md）。

## 结论表

| 工具 | 路由 | 状态 | 实测结果 |
|---|---|---|---|
| SCALE_UP（图片放大） | /tools/ecommerce-suite/scale-up | **PASS** | 输出 1024×752，`https://` 结果 URL，UI 出现结果卡 |
| PRODUCT_IMAGE_SUITE（商品图套图） | /tools/ecommerce-suite/product-image-suite | **PASS** | 场景图 ×1，返回 data-URL PNG 1024×1024 |
| IMAGE_TRANSLATION（批量翻译） | /tools/ecommerce-suite/image-translation | PARTIAL | 见下（提交前全链路实测通过，结果因通道失效未取回） |
| DRESS_WEAR_SET（服装套图） | /tools/ecommerce-suite/dress-wear-set | PARTIAL | 见下（表单校验卡点已定位，点击后通道失效） |
| CHANGE_COLOR_V2（套图换色） | /tools/ecommerce-suite/change-color-v2 | BLOCKED | 未提交（环境饱和） |
| AI_OUTPAINTING（智能扩图） | /tools/ecommerce-suite/ai-outpainting | BLOCKED | 未提交（环境饱和） |

## 疑似缺陷（已定位，可复现）

**BUG-A：适配器把「已上传」判定为只认 data:/http(s):，不认 blob:。**

工具素材库 `ToolAssetRecord.url` 按设计就是 `blob:`（当次会话对象 URL，见类型注释），
但 `scale-up.ts` 与 `product-image-suite.ts` 的 source-ready 判定只允许 `data:image/ | http:// | https://`，
导致素材明明已上传、按钮仍被判定为「缺图」而禁用。

- 位置：`web/src/features/tools/adapters/scale-up.ts:56-58`、`web/src/features/tools/adapters/product-image-suite.ts:60-61`
- 修复：把 `blob:` 一并视为已上传（两处同改），已提交 `073d7da fix(tools): accept uploaded blob sources in suite and scale-up`
- 验证：修复后上述两个工具首次真实跑通（PASS），此前必被按钮禁用拦截。
- 建议：其余同族适配器（图片类 20+ 个）应统一走同一个 `isReadySource()` 工具函数，避免逐个漏改。

**DRESS_WEAR_SET 的必填校验（不是 bug，但易卡人）**

「平台 / 销售地区 / 语言」不是原生 select，而是 `<input list="dress-platform|dress-region|dress-language">` 的 datalist 输入框；
未填时「开始生成」禁用并提示「智能品牌基因需要先选择平台 / 销售地区 / 语言」。
实测填 `亚马逊 / 美国 / 英语` 后提示消失、按钮可用；产出为「2 张 / 2 组」（各分组计数均 ≥1，每组单独发起一次真实请求）。

## 环境事实（本轮最大阻塞）

从点击 DRESS_WEAR_SET「开始生成」之后，CDP / TMWebDriver 的 JS 评估通道在**所有** `:3000` 标签页上失效：

- load average 100→162 持续 60 分钟以上；6 个 Chrome Renderer 各占 ~100% CPU，累计 CPU 时间 57~82 分钟。
- `:3000` 上有 48 条已建立 TCP 连接（dev 模式多 worker 多标签）。
- 单次 `Runtime.evaluate` 在 180s 内不返回；`Target.createTarget` 偶发可用（说明扩展与浏览器进程仍活）；
  driver 自身 HTTP 端口可达（`GET /` 快速返回 426）。
- `curl` 到 `:3000` 同样需要 26s 才 200 —— 说明是整机 CPU 饥饿，而不是应用崩溃。
- 期间 `git status` 里 `.worker-*` 目录众多，机器上并行运行 5+ 个 worker。

结论：**失败是环境资源枯竭导致，不是这 4 个工具的功能缺陷**；已把每个工具的观察结果落盘，待环境恢复后可直接续跑。

## 续跑方法（环境恢复后）

1. `cd web && pnpm dev`（若未起）；确认 `curl -m 5 http://127.0.0.1:3000/` 秒回。
2. 每个工具单开一个标签页，逐个跑，避免并行：
   - DRESS_WEAR_SET：填 亚马逊/美国/英语 → 各组计数 1 → 上传 → 开始生成（预计 2 组）
   - CHANGE_COLOR_V2：上传 → 选目标色 → 生成
   - IMAGE_TRANSLATION：上传 → 目标语言勾「英语」→ 开始批量翻译（注意：无文字图片会得到 0 框 0 字）
   - AI_OUTPAINTING：上传 → 选扩展方向/比例 → 生成
3. 每个工具补 `01-net.json`（CDP Network 抓请求）+ `02-result.png`（结果图落盘）+ `03-dom-after.txt`（结果区 DOM 文本）。

## 证据文件

`evidence/real-acceptance/{SCALE_UP,PRODUCT_IMAGE_SUITE,DRESS_WEAR_SET,CHANGE_COLOR_V2,IMAGE_TRANSLATION,AI_OUTPAINTING}/`
