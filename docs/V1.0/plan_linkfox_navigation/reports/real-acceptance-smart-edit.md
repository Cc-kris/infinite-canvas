# 真实 UI 验收：智能编辑 / 商品修图批次（6 个工具）

- 分支：`feat/linkfox-v1-real`
- 环境：dev server `http://127.0.0.1:3000`（真 Chrome，非 headless mock）、本机 canvas-proxy `127.0.0.1:23210`、模型 `gpt-image-2`
- 执行器：`web/scripts/real-acceptance/run-one.mjs <TOOL>`（真点击、真 `setInputFiles` 上传真实 JPG、真提交）
- 结论一句话：**6 个工具的 UI 链路（上传 → 参数 → 校验 → 提交发请求）已用真实浏览器验证通过；唯一阻断是 provider 凭据缺失（环境级），因此没有任何一张真实生成图。**

## 1. 逐工具结果（evidence/real-acceptance/<TOOL>/run.json）

| 工具 | 路由 | 提交按钮 | 真实 POST | 结果图 | 判定 |
| --- | --- | --- | --- | --- | --- |
| CHANGE_COLOR | `/tools/smart-edit/change-color` | `change-color-generate` | `POST :23210/https://api.openai.com/v1/images/edits` → 502 | 无 | BLOCKED（凭据/上游） |
| FIX_COLOR | `/tools/smart-edit/fix-color` | `fix-color-submit` | 同上 → 502 | 无 | BLOCKED |
| REMOVE_PEN | `/tools/smart-edit/remove-pen` | `remove-pen-submit` | 同上 → 502 | 无 | BLOCKED |
| PRODUCT_REFINE | `/tools/product-design/product-refine` | `refine-generate` | 同上 → 502 | 无 | BLOCKED |
| PRINTING_REPAIR | `/tools/smart-edit/printing-repair` | `printing-repair-submit` | 同上 → 502 | 无 | BLOCKED |
| HAND_REPAIR | `/tools/smart-edit/hand-repair` | `hand-repair-submit` | 同上 → 502 | 无 | BLOCKED |

证据要点：

- 每个工具的 `run.json` 都记录了真实网络记录（`network[].status`），不是"没点成功"的空跑；
- 失败文案来自应用自身：`无法连接 api.openai.com：连接超时（UND_ERR_CONNECT_TIMEOUT）… 诊断码：timeout-or-network`；
- 换用另一个连通的代理实例（`node canvas-proxy/index.js --port 23299`，走 macOS 系统代理 7890）后，上游变成可达，但请求返回
  `Missing bearer authentication in header`（AREA_REPAIR 那次是 `Incorrect API key provided: ''`）——
  即应用侧 `defaultConfig.channels[].apiKey` 为空字符串，请求没有可用的 bearer。

**因此"真实出图"这一步在本环境不可完成**：脚本按纪律不写任何密钥，环境里也没有可复用的 key（应用 localStorage 配置里 `hasKey=false`）。这与 `real-acceptance-smart-edit-mask-loop.md` §7 记录的凭据缺口一致，本次是把结论从 2 个工具扩展到 6 个工具。

## 2. 过程中发现并修复的产品缺陷（P0）

**CHANGE_COLOR 上传成功但永远不能提交。**

- 现象：上传 `apparel-print.jpg` 后，源图预览已显示（`1024×1024 · JPEG`），但生成按钮 `disabled=true`，issues 仍提示"请先上传需要换色的图片。"——用户无法使用该工具。
- 根因：`ToolAssetInput` 上传后本地资产记录的 `url` 是 **`blob:`** 对象 URL（探针实测 `blob:http://127.0.0.1:3000/040b517e-…`），而
  `isChangeColorSourceUsable()` 只接受 `data:image/` 与 `http(s)://`，于是 `sourceReady=false` → `validateChangeColorState` 判定 `source-required` → 永久禁用。
- 下游其实支持 blob：`services/api/image.ts` 的 `isUsableImageSource()` 已放行 `blob:`，`imageToDataUrl()` 会在发请求前把 blob 抓成 `data:` 再发给 provider。
  同仓库其它 adapter（`product-refine` / `scale-up` / `ai-wearable` / `sds-design` / `product-scene` 等）都已经是 `|| src.startsWith("blob:")`——change-color 是漏网的那一个。
- 修复：`isChangeColorSourceUsable()` 增加 `blob:` 分支（`web/src/features/tools/adapters/change-color.ts`）。
- 真实 UI 前后对比（`evidence/real-acceptance/CHANGE_COLOR/ui-state-before-after.json`，同一个探针 `probe-color.mjs`）：

| | 上传后按钮 | issues |
| --- | --- | --- |
| 修复前（13:45Z） | `disabled = true` | `请先上传需要换色的图片。` |
| 修复后（13:50Z） | `disabled = false` | `null` |

## 3. 验收脚本自身的假阳性修复（重要，避免假证据）

上一轮 5 个工具（FIX_COLOR / REMOVE_PEN / PRINTING_REPAIR / HAND_REPAIR / AREA_REPAIR）的 `run.json` 都写着 `ok: true`、`resultSaved: true`，
但哈希比对显示 **`result.png` 与上传的源图逐字节相同**（如 FIX_COLOR/REMOVE_PEN/AREA_REPAIR 均为 `43ede96e…` = `product-watch.jpg`）。

原因：`grabResult()` 用"提交前已有图片 src 前缀"做排除，而上传后源图预览换成了新的 `blob:` URL，于是被当成"新结果图"抓走；`ok` 只看"抓到图没有"。

修复（`web/scripts/real-acceptance/run-one.mjs`）：

1. 优先只在 `<tool>-result(s)` 结果区容器里取图，取不到才退回全局启发式，且按整 URL 排除提交前的图；
2. 落盘后做 sha256 校验：`结果图哈希 === 源图哈希` 记为 `bogusSourceEcho: true`，删除 `result.png` 并强制 `ok=false`；
3. CHANGE_COLOR 配方选择器纠正为 `[data-testid=change-color-workspace] input[type=file]`（原 `change-color-source` 不存在，导致上传失败 → 按钮 disabled → 点击超时）。

修复后重跑，5 个工具全部诚实变成 `ok=false`，并且都留下了真实的 POST 记录。

## 4. 复现 / 拿到 key 后怎么继续

```bash
cd web
# 前提：dev server :3000；canvas-proxy 需带系统代理（否则上游直接超时）
node canvas-proxy/index.js --port 23210 --host 127.0.0.1   # 或让桌面端自动起
node scripts/real-acceptance/run-one.mjs CHANGE_COLOR      # 单个
node scripts/real-acceptance/run-one.mjs all               # 8 个顺序跑
# 只需 UI 状态（不依赖 provider）：node scripts/real-acceptance/probe-color.mjs
```

拿到可用 `baseUrl + apiKey` 后（应用支持 `?baseUrl=...&apiKey=...` 注入），按同一脚本重跑即可把上面 6 个 BLOCKED 变成真实出图验收；
脚本已内建"结果图必须≠源图"的哈希闸门，不会再出现假阳性。

## 5. 未完成 / 风险

- **未验证真实出图效果**（颜色是否按目标色改写、笔迹去除是否干净、手部修复是否自然）：无凭据，无法取证，**不宣称通过**。
- `AREA_REPAIR` / `IMAGE_CROP` 的旧证据仍由别的 worker 维护；本次未重跑（其中 AREA_REPAIR 的 result.png 同样是源图回声，建议按第 3 节同一闸门重跑）。
- 一致性问题：`product-market-material.ts` 的源图校验仍未接受 `blob:`，与 change-color 是同一类隐患，未在本批次修改（不在本次负责范围）。
