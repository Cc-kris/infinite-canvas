# R13 HAND_REPAIR 三动作真实回执（2026-10-29）

## 结论
F 缺口（R7 `F_note="仅 download 字节；存资产/发画布未取得回执"`）已用**真实任务 + 真实图片**补齐：
fresh reload 后点击历史坞三个真实按钮，三处字节互证一致。

- 真实任务：`task-mvtbe5rp-0maafh`（toolId=HAND_REPAIR，status=succeeded，result item = `task-mvtbe5rp-0maafh-0`，storageKey `tool-result:MJlcLXl2-O1DnKd-NUgg2`）
- 结果字节：**2153466 B**，sha256 `a34cea718...800e20`（= 已提交产物 `evidence/edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png`）
- 本轮**未调用上游生成接口**，**未向 localStorage/IndexedDB 写入任务或结果**（无新生成、无注入）

## 三动作（真实点击，testid 取自 tool-history-dock）
| 动作 | testid | 真实回执 | 字节校验 |
|---|---|---|---|
| 下载 | `tool-history-dock-download` | 「已下载 hand-repair-result-1.png」→ `~/Downloads/hand-repair-result-1.png` | 2153466 B，`shasum -a 256` = a34cea71… ✅ |
| 存资产 | `tool-history-dock-save` | 「已存入资产库（image · qVZbf4pJUvsoYXGe04jvD）」 | IDB `image_files` `image:IAOrghYuVoJCEN-EQwcJb` = 2153466 B / 同 sha ✅；资产记录 metadata `{toolId:HAND_REPAIR, taskId:task-mvtbe5rp-0maafh, resultItemId:…-0}` |
| 发画布 | `tool-history-dock-canvas` | 「已发送到画布（b35kvRaZb6zdwcOT_Yn2i / image-1793281461613-pl9uk）」 | IDB `image_files` `image:88r6ZLKnLPxyB8hci62eW` = 2153466 B / 同 sha ✅；项目 `HAND_REPAIR 历史结果` 节点 bytes=2153466 |

回执文件：`evidence/real-acceptance/HAND_REPAIR/r13-three-actions-real.json`

## 取证环境（重要）
- 该真实任务的持久化 state 只存在于**用户默认 Chrome 会话**（origin `http://127.0.0.1:3000`）里；
  `.tmp_r13/profile-r13`、`temp/xsy-profile-20261029` 两个 Playwright profile 与 Galley 数据目录均**不含**该 task。
- 因此本轮用真实浏览器标签（`web_execute_js`）做：整页 fresh 导航 → 展开历史坞 → 点三个真实按钮 → 现场 `crypto.subtle` 算 sha + IDB 读记录 + `shasum` 复核落盘文件。
- 页面内脚本 bug：`JSON.stringify(undefined)` 返回 `undefined`，做 `.includes()` 前必须 `String()` 兜底。

## 代码修复
无需改源码：三动作功能本身可用（无缺失功能、无根因缺陷），本轮仅补证据。

## 验证
- `web`: `tsc --noEmit` → 0 错误
- `web`: `bun test tool-history-dock / tool-result-actions.deps / tool-result-actions.hydration / registry` → **34 pass / 0 fail**
