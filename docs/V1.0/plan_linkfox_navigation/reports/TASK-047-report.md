# TASK-047 报告：全工具 Provider 能力与真实生成 A/B

- 分支：`feat/linkfox-v1-real`
- 时间：2026-10-28
- 任务：TASK-047（依赖 TASK-008~TASK-046）
- DoD：能力不符禁用；TC-010 / AC-010；真实结果证据
- 结论：**kernel 层完成并真实跑通（4/4 A/B 用例 PASS）；工作区 UI 接线未做 → AC-010 判 `KERNEL_VERIFIED_UI_ENTRY_BLOCKED`，不得据此判 AC-010 PASS**

---

## 1. 改了什么

### 1.1 新增 `web/src/features/tools/capabilities.ts`（能力矩阵 + 提交闸门）

39 个工具的表单字段（蒙版、多图、参考视频、口型、时长、分辨率、出片数量……）并不等于每个 Provider 通道都真支持。这一层把“字段”翻译成“能力需求”，再拿通道证据去判定，把静默丢参变成显式禁用或显式降级。

| 导出 | 作用 |
| --- | --- |
| `capabilityRequirementsForSpec(spec)` | 从 `ToolSpec` 的字段推导能力需求（`required` 决定是否阻断，可选能力走降级） |
| `toolCapabilityRequirements(toolId)` | 按工具 id 取需求，未知工具直接抛错 |
| `providerCapabilities(provider)` | 通道证据矩阵：`openai` / `gemini` / `http`（按请求体模板占位符）/ `plugin`；未知通道一律 `unknown`，**不默认放行** |
| `evaluateToolProvider(toolId, provider)` | 纯判定（无副作用），UI 提示与提交闸门共用同一份语义 |
| `canSubmitTool(...)` / `assertToolProvider(...)` | 提交闸门：不开替代确认就不许提交；抛错带工具 id 与能力键，可定位 |
| `capabilityCoverage()` | 覆盖率自检：39/39 工具都能推导出需求 |

设计要点：`capabilities.ts` 只用 **type-only** import 引 `capability-notice.tsx`，避免纯逻辑模块被 React 组件依赖污染（node/bun 端可直接跑）。

### 1.2 `web/src/services/api/video.ts`（+130 / −22）真实结果校验

上游“已完成”不等于“有视频”。真实踩过的坑：`/videos/{id}/content` 在 Cloudflare/中转异常时返回 HTML 错误页、JSON 错误体，甚至 200 空体，旧逻辑只判 `type` 含 json，HTML/空体被当成成果 → 假成功。

新增导出：`VideoPayloadError`、`isVideoPayloadError`、`isPlayableVideoPayload`、`assertPlayableVideoBlob`、`ensurePlayableVideoResult`。

- 按容器魔数判“可播放”（mp4/webm/mov/mkv…），判不出来就判失败；
- HTML → `html-video-payload`、JSON → `json-video-payload`、空体 → `empty-video-payload`；
- 相对路径 `/v1/videos/<id>/content` 拼回 `baseUrl`；
- **本轮真实运行发现的额外 bug**：Node/Bun 下 axios 会忽略 `responseType: "blob"`，把二进制当 latin1 字符串返回，旧代码 `blob.slice(0,64).arrayBuffer()` 直接崩。已改为 `readPayloadBytes()` 兼容 `Blob | string | Uint8Array | ArrayBuffer` 并归一成 `Blob`（生产浏览器路径不变，等于多一层适配韧性）。

### 1.3 `web/src/services/api/image.ts`（+24）

新增 `isUsableImageSource()`：只放行 `data:image/*`、`http(s)`、`blob:`、`gs://`；HTML 错误页与 JSON 片段直接判不可用。`resolveImageSource`、`parseImagePayload`、`parseGeminiImagePayload` 三处出口统一过滤，避免把错误页写进历史记录、到画布渲染才炸。

### 1.4 新增 `web/src/features/tools/capabilities.test.ts`（20 用例 / 288 断言）

39 工具全覆盖、能力键合法性、蒙版降级 vs 阻断、口型缺证据、http 模板占位符、通道证据矩阵、提交闸门 A/B、HTML/JSON/空体/空结果假成功拦截、非 Blob 载荷归一。

---

## 2. 如何验证

### 2.1 真实 A/B（真请求、真字节、真失败）

脚本：`docs/V1.0/plan_linkfox_navigation/evidence/task047-ab-harness.ts`
方式：起本地真实上游（`Bun.serve`）+ axios 真实往返，驱动 `services/api/video.ts` 的 create → poll → `/content` 全链路，以及 `capabilities.ts` 的提交闸门。**不是 mock 返回值。**

| 用例 | 结论 | 关键证据 |
| --- | --- | --- |
| A 支持通道 | PASS | 真实 3 个请求 `POST /v1/videos` → `GET /v1/videos/vid-1` → `GET /v1/videos/vid-1/content`；拿回 32 字节真 mp4，首 12 字节 `000000186674797069736f6d`，sha256 `224dc1959674edd3…` |
| B 上游谎报 | PASS | 谎报 completed + `/content` 返回 HTML → 判失败：`VideoTaskFailed: 服务返回了 HTML 错误页面`，未产出假成果 |
| C 闸门阻断 | PASS | 同一工具 `IMAGE_TO_VIDEO` 换到 http 通道（模板无 `{{images}}`）→ blockedKeys `aspectRatio` / `imageEdit`，**上游 0 请求** |
| C2 对照 | PASS | 同一工具换回 openai 视频通道 → 无阻断，证明拦截来自能力判定而非无差别拦截 |

证据文件：`docs/V1.0/plan_linkfox_navigation/evidence/AC-010.json`

### 2.2 测试与类型检查

| 项目 | 结果 |
| --- | --- |
| `bun test src/features/tools/capabilities.test.ts` | 20 pass / 0 fail / 288 expect() |
| 已跟踪测试全量（48 files） | **1079 pass / 0 fail** |
| 全量 `bun test`（含他人未跟踪文件） | 1173 pass / 4 fail —— 4 个失败全部来自其他 worker 未跟踪的 `ai-video-editing.test.ts`、`video-replication.test.ts`，与本任务 4 个文件无关 |
| `tsc --noEmit`（本任务 3 个实现文件） | 0 error |

---

## 3. 未完成 / 风险

1. **AC-010 的“从实际入口验证”仍 BLOCKED**：`grep` 确认 39 个 workspace 中**没有一处** import `capabilities.ts`。闸门目前是可复用 kernel，UI 绑定要由各工作区任务接线（提交按钮消费 `evaluateToolProvider` / `canSubmitTool` + UI 证据）后才能解除。因此 AC-010 判 `KERNEL_VERIFIED_UI_ENTRY_BLOCKED`，**不得**据此判 AC-010 PASS。
2. **真实模型 A/B 未做**：本轮 A/B 是真实 HTTP 链路 + 真实字节，但上游是本地可控服务，没有消耗真实 Provider 额度（本环境无 Provider 凭证）。真实模型出片证据仍需在有 key 的环境补一次。
3. **全量测试 4 个失败**归属其他 worker 的未跟踪文件，未纳入本次提交，也未修改。
4. `plugin` / `http` 通道的能力证据是白名单 + 模板占位符推导，不是运行时探测；模板写法变体（如 `{{ image }}` 带空格）可能漏判，保守方向是判“不支持”（宁拦不放）。

## 4. 使用入口

```ts
import { canSubmitTool, assertToolProvider, evaluateToolProvider } from "@/features/tools/capabilities";

// 1) 渲染提示（纯判定，无副作用）
const verdict = evaluateToolProvider("IMAGE_TO_VIDEO", { kind: "video", apiFormat: "http", httpBodyTemplate });
verdict.evaluation.blockedKeys;   // 必填但不支持 → 阻断
verdict.evaluation.degradations;  // 可选但不支持 → 需用户确认降级

// 2) 提交前放行判断
if (!canSubmitTool(toolId, provider, acceptedDegradations)) return;

// 3) 服务端兜底（抛错带工具与能力键）
assertToolProvider(toolId, provider, acceptedDegradations);
```

视频结果落库前统一过一道：

```ts
import { ensurePlayableVideoResult } from "@/services/api/video";
ensurePlayableVideoResult(result); // 打不开的载荷一律抛错，不产出假成功
```

图片结果落库前统一过 `isUsableImageSource()`（`@/services/api/image`）。
