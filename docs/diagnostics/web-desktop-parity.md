# 网页端 / 客户端一致性诊断

## 2026-10-26 根因定案：网页端缺本地代理
硬证据（在 3000 端口页面内直接实测）：
- 页面内 `fetch("https://sub2api.1006000.xyz/v1/models")` → `TypeError: Failed to fetch`（CORS 阻断）
- 页面内 `fetch("http://127.0.0.1:23210/https://sub2api.../v1/models")` → **200**，返回 `{"data":[{"id":"MiniMax-H3"...}]}`
- `proxyEnabled` 在 web/src 的 tsx 中完全不存在 → 网页端没有代理开关，只有桌面端外壳强制 `proxyEnabled: isDesktopApp()`

修复（已上，tsc clean，页面实测）：
1. `stores/use-config-store.ts`：新增 `detectLocalProxy(url)`（探 GET `{proxy}/` 拿 `{"app":"infinite-canvas"}`）、
   `LOCAL_PROXY_MANUAL_OFF_KEY` + `rememberLocalProxyChoice(enabled)`、`localProxyDisabledByUser()`
2. `components/layout/client-root-init.tsx`：非桌面端时启动探测默认代理，可用且用户未手动关闭 → 自动置 `proxyEnabled=true`
3. `components/layout/app-config-modal.tsx` + i18n(zh-CN/en-US)：偏好设置新增「网络代理」开关 + 代理地址输入 + 说明

效果验证：刷新页面后 localStorage `proxyEnabled:true, proxyUrl:http://127.0.0.1:23210`；
配置页「拉取模型列表」由「请求失败」变为「已拉取 1 个模型（MiniMax-H3）」。

## 生图慢（6分23秒）
用户实测一次生图耗时 6m23s，上游已扣费且最终出图；日志里失败项无 error 字段，属超时/重试慢路径，待单独定位。
