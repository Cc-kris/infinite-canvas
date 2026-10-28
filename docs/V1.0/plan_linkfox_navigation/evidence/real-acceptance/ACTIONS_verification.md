# 结果区三个动作（下载 / 存入资产 / 发送画布）验证记录

日期：2026-10-28 21:50–22:25
环境：http://127.0.0.1:3000 （feat/linkfox-v1-real，bun 1.4.2）

## 1) 真实 UI 里按钮确实渲染（DOM 文本证据）

HANDHELD_GOODS 真实出图后（POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits → 200），结果区文本实测：

```
生成结果 | 已生成 1 张
已回填输出字段：imageResultUrl / targetResultUrl
第 1 张 | 最近一次上游返回 | 已完成 | 共 1 个结果 · 图片 1 | 下载 | 存入资产 | 发送画布
```

按钮 disabled 条件（tool-result.tsx ResultTile）：`dropped || busy`；`dropped = !src || item.payloadDropped`。
即：有 dataUrl/url 时三个动作可点，字节被剥离时按钮禁用并提示原因。

## 2) 点击链路的行为：可执行单测（真实执行，非读码）

```
cd web && bun test src/components/tools/tool-result-actions.deps.test.ts src/components/tools/tool-result.test.tsx
→ 25 pass / 0 fail / 121 expect() calls / 89ms
```

其中与三个动作直接对应的用例：

| 用例 | 覆盖点 |
| --- | --- |
| downloads through the injected saver with a derived filename | 下载：文件名由真实 mime/data URL 推导（`<toolId>-result-<n>.<ext>`） |
| saves an image into the asset library with real storage keys | 存入资产：uploadImage → storageKey/宽高/字节 → addAsset 进资产库 |
| stores video bytes before creating a video asset | 存入资产（视频分支） |
| refuses to save stripped payloads instead of faking success | 字节被剥离时明确报错，不伪造成功 |
| appends a real node to the chosen canvas project | 发送画布：在当前项目追加真实节点（node 位置 = 既有节点右侧 +160px） |
| creates a project when none is chosen and rejects unknown projects | 无 projectId（/tools 路由场景）时自动建项目；projectId 非法时报 project-not-found |

结论修正：此前记录“发送画布在 /tools 路由不可用（缺陷 D3）”与当前代码不符——`sendResultItemToCanvas` 在未选项目时会 `createProject()` 再写节点，测试已覆盖。旧结论应作废。

## 3) 未完成的验证（诚实边界）

- **鼠标真点这三个按钮**这一层未能在本次环境里跑完：点击前页面被外部重载/窗口被关，随后 Chrome 出现两个窗口、tmwebdriver 扩展只上报另一个窗口的 5 个旧标签，我的验收标签无法再被扩展注入（AppleScript 侧确认标签仍在且 URL 正确；Chrome 的“允许 Apple Events 中的 JavaScript”为关闭状态，无法绕过）。
- 因此状态记为：**动作逻辑 = 单测真实执行通过；端到端点击 = 未执行**。若要补齐，需要：关掉多余 Chrome 窗口后重开一个标签，或开启上述 AppleScript 开关。

## 4) 复现步骤（补齐端到端时用）

1. `osascript -e 'tell application "Google Chrome" to open location "http://127.0.0.1:3000/tools/product-design/handheld-goods"'`
2. 上传任意商品图 → 点“开始生成” → 等结果区出现“下载 / 存入资产 / 发送画布”
3. 依次点击，观察 toast：`已保存到资产库（<assetId>）` / `已发送到画布（<projectId>）` / `已下载 <fileName>`
