# PROBE NOTES · R7 design19 历史取证（2026-10-29）

## 复用给后来者的坑（都已实测）

1. **TMWebDriver.execute_js 的 session_id 必须传 `str`**
   - 传 `int` 会被当成非法会话 → **静默回落到该 driver 的默认标签**（本次回落到了别的 worker 的
     `video-replication` 标签，导致一次误采，已删数据重采）。
   - 正确写法：`driver.execute_js(js, timeout=60, session_id="1709629220")`。
   - 用 `location.pathname` 探针确认命中自己的标签后再动手，别信默认会话。

2. **本机请求要清代理**：环境里 `HTTP(S)_PROXY=…:7890` 会让 `127.0.0.1:3000` 打不通。
   探针脚本开头统一 `pop` 掉 proxy 变量并设 `NO_PROXY=127.0.0.1,localhost`。

3. **不要在 `/tmp` 跑 Python**：`/private/tmp/tokenize.py` 会遮蔽标准库，
   `import requests` 直接 `SyntaxError: no binding for nonlocal 'n' found`。

4. **`Page.close` 之后 `get_all_sessions()` 可能仍缓存**：判定关没关要用**新建 driver** 复读列表。

5. **PRODUCT_SCENE 的历史不在页底 dock**：它在 `WORKSPACE_OWN_HISTORY`（`tool-page.tsx:419-426`），
   历史是工作区右栏第三个页签（`scene-fission.tsx:856-860` 自渲染 `ToolHistoryDock`）。
   直接查 `[data-testid="tool-history-dock"]` 会得到「不存在」的假结论——必须先点
   `[data-testid="scene-tab-history"]` 再查，否则会把「页签未激活」误判成「没有历史面板」。

## 历史面板取数口径

- 空态由 `tool-history-dock-empty` 给出，计数由 `tool-history-dock-count` 给出（形如 `0 条`）。
- 展开行 `aria-expanded=true` 后才有 `tool-history-dock-detail`，行内才有结果项与动作按钮。
- 任务真源是 localStorage 的任务表（本次 53 条），面板计数与之一致才算过。
