# FIX_COLOR 历史恢复实测（2026-10-29）

复用既有真实任务，**不重新生成**：只做「刷新页面 → 从历史坞恢复结果」这条链路。

## 操作路径（可复现）

1. 新建标签打开 `http://127.0.0.1:3000/tools/smart-edit/fix-color`（首次导航，`performance.navigation.type === navigate`）。
2. 读历史坞：`2 条`，两条均为 `succeeded`。
3. 在同一标签执行 `location.reload()`（`performance.navigation.type === reload`），复验历史坞与结果字节。

## 恢复结果（reload 后实测）

| 任务 | 状态 | 历史坞缩略图 | 恢复后 fetch 字节 | 尺寸 | sha256 |
| --- | --- | --- | --- | --- | --- |
| `task-mvt9r1lg-ab8tqn`（16:15，size=1:1 旧缺陷跑） | succeeded | 1024×1024 | 1,218,527 | 1024×1024 | `83ef17c2…d92d900` |
| `task-mvta1kkg-t8y1yo`（16:24，下发原图尺寸） | succeeded | 1024×752 | 1,003,673 | 1024×752 | `a5958a77…c89339525` |

两个字节数与 sha256 与仓库已提交产物 `result-real-20261029.png` / `result-real-run2-20261029.png` **完全一致**（见 `input-diff.json` 的 `bytes`/`sha256` 字段）。

### 关键证据：媒体是重新取回的，不是内存里残留的 blob

`localStorage` 快照里存的是旧 blob URL；reload 后页面重新生成**新的** blob URL 才能取到同样字节：

| 阶段 | run1 blob | run2 blob |
| --- | --- | --- |
| 持久化快照（写入时） | `blob:…/9f342154-…` | `blob:…/3420e8a9-…` |
| 新标签首次加载后恢复 | `blob:…/f8573df4-…` | `blob:…/4ff410a9-…` |
| 整页 reload 后恢复 | `blob:…/b2dfe6cb-…` | `blob:…/ed63bb8e-…` |

即媒体从 `storageKey`（`tool-result:PIvAsueZHgZNHS9_77Fw8` / `tool-result:qQAR2JMo3arS4IRSr9C_i`）重新解析，字节可完整还原。

## 结果行动作实测

| 动作 | 结果 |
| --- | --- |
| 下载 | 点 run1 结果行「下载」→ 提示「已下载 fix-color-result-1.png」，落盘 `~/Downloads/fix-color-result-1.png` = **1,218,527 bytes / sha256 `83ef17c2…d900`**，与产物文件一致 |
| 存入资产 | 点「存入资产」→ 提示「已存入资产库（image · `OIRBFLPZFZt5hjgOZL3sV`）」，说明恢复出的字节可重新入库 |
| 发送到画布 | 按钮存在且可用（本次未点击，避免改动画布状态） |

## 与输入的真实差异（复算，不是引用旧数字）

输入 `product-watch.jpg` 1024×744（31,860 bytes，sha256 `43ede96e…dc19be3`），产物 LANCZOS 还原到 1024×744 后逐像素比较 RGB：

| 跑次 | mean_abs_diff | >12 灰度差占比 | >30 占比 | 与原图完全相同 |
| --- | --- | --- | --- | --- |
| run1（size=1:1） | 17.62 | 24.32% | 19.38% | 否 |
| run2（size=1024×752） | 14.75 | 17.80% | 16.00% | 否 |

## 已知限制（如实记录）

- 刷新后结果区本身是空态，结果只从历史坞取；**fix-color 页的历史坞没有「查看结果」按钮**（那是 `ToolTaskHistory`，被套图/场景/扩图/视频翻译等工作区使用），恢复只在历史坞内完成下载/存资产/发画布。
- 历史恢复不还原前后对比视图（对比视图取 run，历史走 task，属既有边界）。
- 环境无 CDP 截图通道（`Page.captureScreenshot` 在本机 ego lite 通道不可用），本地证据以 DOM 快照 + 字节/sha 为准。

## 文件清单

- `probe-fresh-load.json`：新标签首次加载探针（导航类型、历史坞行、恢复后 blob 字节/尺寸/sha、展开后的配置快照）
- `probe-after-reload.json`：整页 reload 后同一套探针
- `dock-dom.html`：历史坞展开后的 DOM 快照（blob src 已脱敏成 `<blob:uuid>`）
- `actions-save-to-assets.json`：存入资产回执（assetId）与结果行动作可用性
- `actions-download.json`：下载回执、落盘字节与 sha、与产物一致性判定
- `input-diff.json`：输入素材指纹 + 两跑次差异复算
