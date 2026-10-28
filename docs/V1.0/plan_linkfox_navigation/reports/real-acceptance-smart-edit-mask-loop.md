# 智能修图（AREA_REPAIR / REMOVE_PEN）真实 UI 验收阻塞：蒙版涂抹被清空的根因

日期：2026-10-28　分支：`feat/linkfox-v1-real`　验收方式：真 Chrome + 真实鼠标事件（Playwright `channel: chrome`）

## 1. 现象（可复现）

`/tools/smart-edit/area-repair` 上传真实 JPG 后在蒙版画布上按住拖动：

- 拖动过程中**确实在画**（canvas 像素采样 3 个采样点非空）；
- 松开鼠标瞬间 `strokes` 被压入历史（React fiber 读到 `present = 1`）；
- **150ms 后**历史被清空回 `present = 0`，UI 显示「0 笔 · 覆盖 尚未涂抹」，提交按钮保持禁用。

因此提交永远被前置校验挡住，工具无法进入真实 provider 环节。

## 2. 排查链路（逐层证伪）

| 假设 | 探针 | 结论 |
| --- | --- | --- |
| 事件被祖先吞掉（stopPropagation） | probe-mask4：canvas 冒泡监听 + 直接调用 React props | 否。事件到达 document，`__reactProps.onPointerDown/Move/Up` 均存在 |
| 处理器提前返回（`!imageRef.current \|\| busy`） | probe-mask5：包装 `setPointerCapture` 观测调用 | 否。`setPointerCapture` 被调用，说明已通过守卫 |
| 真实鼠标画不上 | probe-mask7：down/move 分步像素采样 + 命中元素 | 否。`elementFromPoint` = `mask-canvas`，move 后有 3 个采样点被绘制 |
| 撤销/重做逻辑丢笔画 | probe-mask8：各阶段读 React fiber hook | 否。pointerup 当帧 `present=1`，**150ms 后**变 0（有代码在事后清空） |
| 组件重挂载 | probe-mask9：比较 canvas DOM 节点身份 | 否。同一节点（`sameCanvas: true`），非重挂载 |
| 草稿 store 被高频写 | probe-mask9：包装 `store.patch` 计数 | **是**。空闲状态下 438 次/秒，草稿 revision 从 1342 暴涨到 2166 |
| 谁在调 `patch` | probe-mask10：深栈 + `hydrate` 计数 | `persist` ← `adoptImage`（mask.tsx 的 draft 恢复 effect）；`hydrate` 每秒 343 次，调用点 = `tool-asset-input.tsx` 的恢复 effect |

## 3. 根因：`onChange` 内联箭头 → effect 依赖抖动 → 自激循环

调用链（每一环都由上一环的 re-render 触发）：

1. `MaskWorkspace` 渲染 `<ToolAssetInput onChange={(_ids, records) => void adoptImage(record)} />`，**箭头函数每次渲染都是新引用**；
2. `ToolAssetInput` 内 `emit = useCallback(..., [onChange])` 因此每次渲染都换新引用；
3. 资产恢复 effect 依赖 `emit`：`useEffect(..., [emit, hydrateDraft, patchDraft, toolId])` → **每次渲染都重跑**；
4. effect 重跑 → `hydrate` → `setItems(restored)` → `emit(restored)` → 触发父组件 `onChange` → `adoptImage(record)`；
5. `adoptImage` 为「换图」语义，**无条件清空笔画**（`createMaskHistory()` + `setState({...strokes: []})`），并 `persist()`；
6. `persist` → `patchDraft` → zustand 更新 → 父组件重渲染 → 回到第 1 步。

净效果：一个约 3ms 周期的事件循环（CPU 空转 + 草稿 revision 爆炸），用户刚画的一笔在下一次循环里被 `adoptImage` 的清空逻辑抹掉。

这条链同时解释了另一处隐患：同一张图被反复「重新采纳」，草稿被高频写盘。

## 4. 修复

1. `tool-asset-input.tsx`：`onChange` 收进 ref（`onChangeRef`），`emit` 依赖改为 `[]`。父组件内联箭头不再能推动子组件 effect 重跑。
2. `mask.tsx`：`adoptImage` 增加**同 id 幂等**早退——已经采纳过的同一资产再次回调时直接返回，不再清空笔画、不再写草稿。

## 5. 验证

- 复跑 probe-mask9：空闲 1s 内 `patch` 次数应从 438 降到 0；涂抹后 `present` 保持 1、覆盖率 > 0、提交按钮解除禁用。
- 再用真实鼠标完成 AREA_REPAIR / REMOVE_PEN 的真实 provider 出图（证据见 `evidence/real-acceptance/<TOOL_ID>/`）。
