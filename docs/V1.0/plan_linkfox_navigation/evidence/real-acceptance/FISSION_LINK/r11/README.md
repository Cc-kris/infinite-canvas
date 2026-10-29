# FISSION_LINK r11 — 复用真实 task 的重载/字节/三动作复验

- 复用已有真实任务 **task-mvt18lrt-rsnifn**（`succeeded`，storageKey `tool-result:SVZBd-stlKJhjHtE0ng8F`）；本轮**未新建 task、未注入结果、未改业务源码**。
- 入口：`http://127.0.0.1:3000/tools/product-design/fission-link`（新标签 → CDP `Page.reload`）
- 驱动：`.tmp_r11/round_trip.py`（TMWebDriver + 真实点击 + IndexedDB 读取）

## 结论

| 项 | 结论 | 证据 |
|---|---|---|
| fresh reload 后历史恢复 | VERIFIED（navType=`reload`、sessionStorage marker 保留、dock 中 task-mvt18lrt-rsnifn 仍在） | `round-trip.json` → `after_reload` |
| 字节（IndexedDB `media_files` Blob → SHA-256） | VERIFIED：1988694B，sha256 `bbc0ca08…ff76a4`（与存储一致，见 `bytes.json`） | `result.png`、`result.png.json`、`round-trip.json` → `bytes` |
| 动作 save（存入资产） | VERIFIED：点击 `tool-history-dock-save`，`image_files` 84→85、`image_previews` 84→85 | `round-trip.json` → `actions.save` |
| 动作 canvas（发送画布） | VERIFIED：点击 `tool-history-dock-canvas`，`image_files` 85→86、`image_previews` 85→86 | `round-trip.json` → `actions.canvas` |
| 动作 download | **UNVERIFIED（保留 PARTIAL）**：`tool-history-dock-download` 未点到 —— 展开 toggle 点击后 React 尚未提交（首轮 `expanded:false`），第二轮复点时机又落在 dock 重渲染窗口（`dock item missing`）；无落盘文件，不虚报 | `round-trip.json` → `actions.download` |

## 复现

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
python3 .tmp_r11/collect_r11.py &            # 127.0.0.1:34568 字节捕获
python3 .tmp_r11/round_trip.py --tool FISSION_LINK \
  --route /tools/product-design/fission-link --task task-mvt18lrt-rsnifn \
  --outdir docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/FISSION_LINK/r11
```

## 已知限制

下载动作的点击需在 dock 行展开后再触发，且展开是异步渲染；本轮 40 轮预算内未重跑成功，故不改判定为 PASS。
