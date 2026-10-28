# TASK-027 姿势裂变（AI_POSTURE）实施报告

- 分支：`feat/linkfox-v1-real`
- 代码提交：`631f48a` feat(tools): AI_POSTURE 姿势裂变工作区与逐姿势执行链路
- 路由：`/tools/product-design/ai-posture`（layout = `model`，makeType 58）
- 页面规格：`docs/V1.0/plan_linkfox_navigation/page-specs/20-ai-posture.md`
- 原站实测文案：`图片规则 / 拖拽、粘贴 或 上传模特姿势图 / 姿势库 / 自定义 / 选择姿势（可选）/ 选择生成张数 / 立即生成`

## 改了什么

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `web/src/features/tools/registry/ai-posture.ts` | 801 | 姿势库数据与文本模型；双档输入（库/自定义）互不覆盖的状态机；1–4 张按姿势摊平算法；4 字段快照 + hash + 失效判定；校验原因码；草稿序列化/反序列化；结果按来源姿势分组 |
| `web/src/features/tools/adapters/ai-posture.ts` | 474 | 逐姿势请求单元构造与提交守卫；真实 gateway 执行/单组重试/结果映射（空结果判失败、不补图）；结果视图（分组 + 过期标记） |
| `web/src/components/tools/workspaces/model.tsx` | 749 | `ReferenceModelPicker` + `PoseOrCategorySelect` + `OutputCountControl` + 分组结果区；提交按钮实时列出全部拦截原因 |
| `web/src/features/tools/adapters/ai-posture.test.ts` | 403 | 23 例（170 个断言）：契约、姿势库、草稿往返、状态联动、张数摊平、校验、单元/结果、SSR 首屏渲染 |

### 1. 页面不是「上传 + 提示词 + 结果」空壳

本页真实独有的三块区域，全部带 testid 可验收：

- **ReferenceModelPicker**（`ai-posture-upload` / `ai-posture-tags*`）：单张模特图 + 可增删的图片标签（标签走 `imageTags` 字符串拼接，与原站 upload/text 型一致）。
- **PoseOrCategorySelect**（`ai-posture-tab-library` / `ai-posture-tab-custom` / `ai-posture-pose-*` / `ai-posture-category-*` / `ai-posture-custom`）：姿势库卡片按 **站姿 / 角度 / 动态 / 坐姿** 四类分组，分类切换只改可见集合；切到「自定义」Tab 不丢姿势库已选，反之亦然（两档各自持久化在同一个草稿里）。
- **OutputCountControl**（`ai-posture-count-*`）：1–4 张，右侧实时显示「每个姿势分到几张」，与摊平算法同源。

### 2. 「N 种姿势」是 N 个真实请求，不是一个 count=N 的请求

`resolveAiPosturePlan` 决定本次真正发的姿势集合：

| 状态 | 计划来源 | 说明 |
| --- | --- | --- |
| 选了卡片 | `library` | 只发选中的姿势，每姿势 1 个单元 |
| 只写了自定义文本 | `custom` | 1 个单元，姿势指令 = 用户文本 |
| 都没填（姿势可选） | `auto` | 按张数自动裂变，从姿势库按序取未选的姿势 |

`distributePostureOutputs` 把总张数摊到各姿势，**总和恒等于 `outputNum`**（有余数时前置补偿），保证「一张模特图生成 N 种姿势」的语义不被张数偷换。

### 3. 失败、空结果与过期

- 每个单元独立成败：某姿势失败只把该组标 `failed` 并给出原因码，其他组的结果不受影响，重试只重发失败单元（`failedAiPostureUnits`）。
- 上游 `succeeded` 但没有图 → `failed(empty-result)`，不补占位图。
- 提交时锁定 `snapshotHash`；改配置后再看旧结果 → 组上标「来自旧版本」（`stale`），不静默当成当前配置的产出。
- 提交前本机守卫 `assertAiPostureInput`：缺参考图 / 空 prompt / 字段缺失 / 张数越界直接抛错，不发空请求。

## 如何验证

```bash
cd web
PATH=$HOME/.bun/bin:/usr/local/bin:$PATH bun test src/features/tools/adapters/ai-posture.test.ts
# 23 pass / 0 fail, 170 expect() calls

PATH=$HOME/.bun/bin:/usr/local/bin:$PATH bunx tsc --noEmit
# 与本人文件相关的诊断为空（当时工作区里其它任务的 ai-dressing-v2.ts 正在被另一 worker 写入，
# 全量 tsc 会报该文件语法错，与本任务无关）
```

测试覆盖的硬断言（节选）：

1. 注册表契约：toolId / route / layout=`model` / makeType=58 / 4 字段与 `AI_POSTURE_FIELD_KEYS` 逐项对齐。
2. 姿势库：每个姿势都有结构化英文指令（写进 prompt）与中文标签（只用于 UI），分类筛选不改变已选。
3. 草稿往返：库选择、自定义文本、标签、张数、描述往返不丢；`tool-draft:v1:AI_POSTURE`。
4. 状态联动：切 Tab 不互相覆盖；张数变化只改摊平结果，不动姿势选择。
5. 张数：UI setter 钳制到 1–4；绕过 setter 的非法快照（如旧草稿 `outputNum: 9`）仍被校验拦截。
6. 单元：一姿势一单元、摊平总数 = `outputNum`、`draftRevision` 按仓库约定放在 `fields` 里。
7. 结果：空结果判失败、失败任务带原因、部分失败可定位到具体组、改配置后标过期。
8. SSR 首屏：独有区域与控件真实渲染；未上传源图时提交按钮 `disabled` 并列出拦截原因。

## 未完成与风险

1. **路由未接线（已知的全局缺口，不是本任务引入）**：`web/src/features/tools/tool-page.tsx:395` 对所有工具统一渲染 `WorkspacePlaceholder`，仓库里没有任何 layout→workspace 的动态映射（`replace.tsx`、`scene-fission.tsx` 等历史工作区同样未被引用）。本页组件与契约已就绪，但要真的打开 `/tools/product-design/ai-posture` 看到工作区，需要先在 `tool-page.tsx` 加一层 dispatcher（`layout === "model"` → `workspaces/model.tsx`）。该文件不在本任务改动授权内，故未动。
2. **未跑真实 provider 端到端**：适配器走共享 `TaskGateway`（真实边界），测试只覆盖单元构造/结果映射（注入假 gateway），没有真正调用上游出图；`auto` 裂变的姿势从姿势库按序取，若上游对「同一张图 + 相邻姿势」有去重策略，需要在真机上复验。
3. **响应式与深色模式只做了结构级保证**：SSR 断言证明控件存在与禁用态，但 1920/1440/1024/768/390px 的实际折叠与键盘可达性未做截图级验收。

## 使用入口

- 代码：`web/src/features/tools/registry/ai-posture.ts`、`web/src/features/tools/adapters/ai-posture.ts`、`web/src/components/tools/workspaces/model.tsx`
- 测试：`web/src/features/tools/adapters/ai-posture.test.ts`
- 页面（接线后）：`/tools/product-design/ai-posture`
