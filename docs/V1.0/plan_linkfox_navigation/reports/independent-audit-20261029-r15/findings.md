# r15 findings — I2V「发画布」点击超时归因与最小修复

## 1. 复现基线（复用的真实任务，不重生成/不注入）
- 任务：`task-mvtjhbcg-e8lnin`（IMAGE_TO_VIDEO，上游 `task_KOkmL8wCOOmL5AdPyeGwQhAZyIBdMvPR`，终态 succeeded，结果 1266723B / ftyp / sha256 `fe5c85f8…`）
- r14 原始报错（`/tmp/ic_r14/I2V/run.log`）：
  `发画布失败: TimeoutError: locator.click: Timeout 60000ms exceeded.`
  `waiting for locator('[data-testid="tool-result-canvas-0"]').first()` → `locator resolved to <button type="button" data-testid="to…`
  同批次下载（1266723B）与存资产（`已保存到资产库（C1BDmN9PzlfeXw5HHc6_T）`）均成功。
- 结论：按钮存在且 enabled，卡在 Playwright actionability（元素反复被替换/重渲染导致点击无法落地），不是文件/网络/接口问题。

## 2. 现场复测（同一 profile/task，只点真实 UI 控件）
- 冷启动直接点「发送画布」→ 成功（`已发送到画布（MPX3zz7kSFzUQUl5aH6TS）`）
- 完整序列 下载 → 存资产 → 发画布 → 成功（`已保存到资产库（9axpBbwn3c8h2x-xJizUQ）`、`已发送到画布（MPX3zz7kSFzUQUl5aH6TS）`）
- 说明：超时是**时序/环境相关**，不是稳定失败。r14 现场 console 里同时存在：
  1. `Cannot update a component (ImageToVideoWorkspace) while rendering a different component` —— 渲染期 setState；
  2. `Failed to reload /src/components/tools/workspaces/extract.tsx (500)` ×2 —— dev 侧模块编译失败触发整页 HMR 重载。

## 3. 根因
1. **渲染期副作用（应用侧真 bug）**：`web/src/components/tools/workspaces/image-to-video.tsx` 的 `update()` 把
   `patchDraft()` / `setLinkNotice()` 写在 `setValues(previous => …)` 的 updater 里。React 可在渲染阶段调用 updater，
   于是别的组件（同一工作区）在渲染期被 setState → 额外渲染轮回、React 告警；配合本页频繁状态更新，
   结果面板按钮所在子树被反复重挂载，Playwright 的「element stable / receives events」校验反复失败，
   点击一直重试到 60s 超时（同批次前两个动作因触发时序不同而未命中该窗口）。
2. **dev 侧整页重载（环境侧放大项）**：r14 时工作区有未提交改动使 `extract.tsx` 编译 500，Vite 触发全量 reload，
   页面重载会直接让已定位的按钮 detach。当前该文件已恢复 200（本次 `curl` 实测），不再复现。

## 4. 最小修复
`image-to-video.tsx`：
- 新增 `valuesRef`（`useRef(values)` + 同步 effect）保存最新表单值；
- `update()` 改为纯计算：`linkImageToVideoValues(valuesRef.current, patch)` → 同步 ref → `patchDraft` → `setValues(linked.values)` → `setLinkNotice`。
- 语义不变（联动结果、草稿落盘、提示文案一致），去掉了 updater 内副作用。

## 5. 修复后验收（真实回执，未重生成）
| 动作 | 结果 |
|---|---|
| 下载 | 1266723 bytes，magic `ftyp` |
| 存资产 | `已保存到资产库（66QROnionVYl_YYgCex3S）` |
| 发画布 | `已发送到画布（ZEMIi3QSB_NHNU5bOYx3L）` |
| 画布落库 | IndexedDB `infinite-canvas/app_state` 项目 `ZEMIi3QSB_NHNU5bOYx3L` 标题「IMAGE_TO_VIDEO 结果」，nodes=1，videoNodes=1，lastNode=`video` |
| console | 渲染期 setState 告警消失（仅剩无关的 `ERR_CONNECTION_REFUSED`） |

## 6. 质量门
- `npx tsc -p tsconfig.json --noEmit` → exit 0
- `bun test src/components/tools/tool-result.test.tsx` → 30 pass / 0 fail
- `bun test src/features/tools/image-to-video-cases.test.ts src/features/tools/adapters/image-to-video.test.ts` → 29 pass / 0 fail

## 7. 复现命令
```bash
cd /tmp/ic_r14 && node probe_seq.mjs      # 下载→存资产→发画布（只点真实控件）
cd /tmp/ic_r14 && node probe_canvas_nodes.mjs  # 读 IndexedDB 校验画布节点
```
