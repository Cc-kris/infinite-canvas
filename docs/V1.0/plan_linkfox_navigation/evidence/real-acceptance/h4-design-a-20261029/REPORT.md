# H 维 4 工具（NEW_REPLACE_BG_V2 / REPLACE_GOODS / PRODUCT_SCENE / HANDHELD_GOODS）真实取证报告

环境：`http://127.0.0.1:3000`，用户真实 Chrome（Galley TMWebDriver，自建标签，收工即关）。
约束：不注入任务快照、不做新的上游生成。
做法：每工具独立标签 → 记录刷新前坞状态 → `location.reload()`（`performance.navigation.type=reload` 复核）→ 读历史坞 + localStorage 真实任务扫描。

## 结论：4 个工具 H 维全部 BLOCKED（无可用真实任务，按约束不新生成）

| 工具 | reload 复核 | 真实任务扫描 | 历史坞 | 结果字节 / 三动作 | 判决 |
|---|---|---|---|---|---|
| NEW_REPLACE_BG_V2 | navType=reload | 0 条 | 挂载，0 项 | 无 / 不可用 | BLOCKED(no-real-task) |
| REPLACE_GOODS | navType=reload | 0 条 | 挂载，0 项 | 无 / 不可用 | BLOCKED(no-real-task) |
| PRODUCT_SCENE | navType=reload | 0 条 | 「历史记录」Tab 内挂载，0 项（文案「历史任务 0 条」） | 无 / 不可用 | BLOCKED(no-real-task) |
| HANDHELD_GOODS | navType=reload | 1 条 `task-mvs5p8g8-or3oim` failed，0 产物 | 挂载，1 项 failed | 无 / 不可用 | BLOCKED(failed-task-no-bytes) |

## 为什么不能「复用真实 task」
1. 全 origin（127.0.0.1:3000）localStorage 共 64 条真实任务（25 个 toolId），其中这 4 个工具只有 HANDHELD_GOODS 1 条 **failed**；
2. 磁盘上所有 Chrome/Chromium profile 的 Local Storage leveldb 均无这 4 个 toolId 的任务键；
3. IndexedDB 只有 `app_state` 草稿（HANDHELD_GOODS / REPLACE_GOODS 的配置草稿）与 54 条 `tool_assets`（无 toolId/无来源 taskId）；
4. design_a 的真实生成跑在 Playwright 临时 profile（`playwright_chromiumdev_profile-*`，已随会话销毁），任务快照与字节未落到用户 profile；
5. 证据目录与 design_a 日志（`runtime/lf_real_design_a/launcher.log`）中均无 `task-mv*` 记录可回溯。

## 解锁条件
- 授权每个工具跑 1 次真实上游生成（产生真实 `task-mv*` + 字节）后按同一脚本复测；或
- 若必须零新生成：需先修一轮「任务/字节落盘与恢复」链路（含 HANDHELD_GOODS 失败原因），再等待真实任务自然积累。

## 附：本轮真实 reload 的结构性观察
- 3 个工具（NEW_REPLACE_BG_V2 / REPLACE_GOODS / HANDHELD_GOODS）历史坞常驻可见；PRODUCT_SCENE 的历史坞在「历史记录」Tab 内，需切 Tab 才能看到（与另 3 页交互不一致，建议统一）。
