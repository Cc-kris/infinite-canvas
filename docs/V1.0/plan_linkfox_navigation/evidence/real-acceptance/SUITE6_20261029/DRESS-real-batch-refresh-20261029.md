# DRESS_WEAR_SET 真实批量 + 刷新回填（2026-10-29 15:02）

环境：本地 dev http://127.0.0.1:3000，真实上游 gpt-image 通道，真实扣点。
路由：/tools/ecommerce-suite/dress-wear-set（渲染 `dress-suite.tsx`，走 useToolTaskStore.runTool）

## 批量
配置：商品图（案例服装图 linkfox-case-2026966441820966912-source.jpeg）+ 模特图×1 + 白底图×1，
投放目标 亚马逊｜美国｜英语，预计产出 2 张 / 2 组。

| 观测 | 值 |
|---|---|
| 提交后结果区 | 共 2 组 · 成功 2 · 失败 0 · 进行中 0 |
| 产物 | 2 张（模特图 1、白底图 1） |
| 历史坞 | 2 条，均「已完成」，带 1024 缩略图 |

## 刷新（Page.reload）后发现缺陷
刷新前：产物 2 张。刷新后：**共 2 组 · 成功 2 但「产物 0 张」**，两组都显示「等待上游返回…」。

根因：`sanitizeTaskForPersist` 落盘剥离 dataUrl；hydrate 时 `restoreResultMediaUrls`
只用 storageKey 把字节还原成对象 URL 写进 `item.url`。而 `groupDressTasks` /
`summarizeDressTasks` 只认 `item.dataUrl` → 图源存在却被判为空。

## 修复
`adapters/dress-wear-set.ts`：新增 `resultItemSrc(item) = item.dataUrl ?? item.url`，
分组 images 与产物计数统一使用。提交 ef…（见 git log）。

## 修复后复验（同一批真实任务，再次刷新）
| 观测 | 值 |
|---|---|
| 结果区 | 共 2 组 · 成功 2 · 失败 0 · 进行中 0 |
| 产物 | **2 张** |
| 组内渲染 | 模特图 成功 · 1 张；白底图 成功 · 1 张，各含 1024 结果图（blob 对象 URL） |
| 操作 | 存入资产 / 发送画布 / 下载 均在位 |
