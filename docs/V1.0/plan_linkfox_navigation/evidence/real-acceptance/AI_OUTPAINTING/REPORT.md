# AI_OUTPAINTING（智能扩图）真实运行验收

- 时间：2026-10-29 00:22–00:31 +08:00
- 应用：http://127.0.0.1:3000（v0.27.0，vite dev），分支 `feat/linkfox-v1-real`
- 渠道：`ccai-tmp`（localStorage 内 id=`default`，`https://api.cc-ai.xyz`）· 模型 `gpt-image-2`（capability=image）
- 素材：`http://127.0.0.1:8977/product_watch.jpg`（1024×744），经「上传原图」按钮真实上传
- 结论：**PASS**（真实出图 + 资产库落库 + 发送画布全链路实测）；本页另有 1 个 UI 缺陷已修（BUG-OUTPAINT-A）

## 1. 实测主链路

| 步骤 | 操作 | 观测 |
|---|---|---|
| 1 | 上传原图 | 「已载入原图 1024 × 744，画布按原图尺寸 1:1 摆放」 |
| 2 | 点画布比例 `1:1` | 画布 1024×1024，`新增 下 280px`，原图锁定（只扩画布不拉伸） |
| 3 | 填「新增区域内容」 | 38/4000；未填时按钮禁用且有必填提示（修复后） |
| 4 | 生成数量选 `1 张` → 提交 | `已提交，等待上游真实返回…` → 约 44s 后 `生成完成：1 张` |
| 5 | 结果卡 | `已完成 · 共 1 个结果 · 图片 1`，图片为 https OSS URL |
| 6 | 存入资产 | 资产库新增「AI_OUTPAINTING 结果 1」（1024×1024 PNG，929,476 B） |
| 7 | 发送画布 | Toast `已发送到画布（5S4iu3U6GcJwI0Q3Il7-n）`，画布内含 1024×1024 图片节点 |

任务：`task-mvsbp9c8-y8q5vf` → `succeeded`，耗时 43.9s，`transientFailures=0`，结果项 `task-mvsbp9c8-y8q5vf-0`。

结果图：`02-result.png`，1024×1024 PNG，929,476 B，sha256 `8680a047…f152b0`（与页面内 fetch 到的字节数/尺寸一致）。

## 2. 修掉的缺陷：BUG-OUTPAINT-A（按钮静默禁用）

**现象**：上传原图并选好比例（画布已有 280px 外扩）后，「生成 1 张扩图」按钮 `disabled`，而界面（含头部阻塞提示区）**没有任何原因说明**，看起来像功能坏了。

**根因**：
- `outpaint.tsx` `submitReady = canSubmitOutpaint(values)`，而 `canSubmitOutpaint` 要求 `validateOutpaint(values)` 无 issue；
- `validateOutpaint`（`web/src/features/tools/registry/ai-outpainting.ts`）对空提示词产出 `prompt-required`；
- 同一文件的 `blocking = issues.filter(i => i.field !== "prompt")` 把 prompt 类 issue 从可见提示区**过滤掉**，于是「禁用 + 无提示」。

**修复**（`web/src/components/tools/workspaces/outpaint.tsx`）：
1. 新增 `promptIssue` memo，在输入框下方内联显示必填错误，并补 `required` / `aria-invalid` / `aria-describedby`；
2. 分区标题改为「3 · 新增区域内容（必填）」；
3. 新增 `submitBlockedReason`，作为侧栏主按钮 `outpaint-submit` 与内联按钮 `outpaint-submit-inline` 的 `title`，禁用时悬停即见原因。

**实测**（修复后，页面内读取 DOM）：
- 清空提示词：`promptError=请描述扩展区域要补什么（自动文案服务未接入，此项必填）`，`submitDisabled=true`，`submitTitle` 同文案；
- 填回提示词：`promptError=null`，`submitDisabled=false`，`title=null`。

**回归**：新增 `outpaint.test.tsx > 新增区域内容为空时，必填提示内联可见，且禁用按钮带原因（不会静默禁用）`；`bun test` 57 pass / 0 fail（outpaint + adapters/ai-outpainting），`tsc --noEmit` 通过。

## 3. 与原站的差异（PARTIAL 项，非阻塞）

| 项目 | 原站 | 本仓库现状 |
|---|---|---|
| 从作品库选择 | 有 | 有，文案为「从资产库选择（n）」（`ToolAssetInput` details），功能等价 |
| 默认尺寸 | 有 | 以「原图比例」+ 尺寸档（1024/1536/2048）表达 |
| 单结果重试 | 有 | 仅失败/未知任务由 `TaskStatusPanel` 提供 `onRetry`；成功结果卡无逐张重试 |
| 历史记录 / 优秀案例 | 有 | 未实现（任务记录存于 task store，本页无独立列表） |
| 算力显示 | 有（40 算力） | 按规格不复制 |
| 刷新恢复 | 保留结果 | 只恢复草稿（几何/提示词/数量/源图）；结果 payload 按设计从 localStorage 裁剪，刷新后结果面板为空，已存资产库的结果可从资产库取回 |

## 4. 证据文件

- `01-run.json`：任务、配置快照、渠道、结果 URL/尺寸/sha256
- `02-result.png`：真实结果图（1024×1024，929,476 B）
- `03-dom-after.txt`：结果区 DOM（`data-view=succeeded`、summary、结果 URL、发送画布 toast）
- `04-result-actions.json`：存入资产（IDB `tool_assets`）与发送画布（IDB `app_state.projects`）的落库证据
- `05-ui-fix-prompt-gate.json`：缺陷根因、修复点、修复前后 DOM 实测、回归结果
- `result.json`：机器可读总结（含历史 BLOCKED 记录）
