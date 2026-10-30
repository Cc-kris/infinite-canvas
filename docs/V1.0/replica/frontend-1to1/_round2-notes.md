# 1:1 对齐 · 第二轮进展笔记（2026-10-30）

## 实测链路（已跑通，务必用这套）
```
cd /Users/mac/Documents/Dev/infinite-canvas/.verify-tools/frontend-diff
node cap6v.mjs        # 抓 6 个 AI 视频页 → local-dom2/*.json（等待 ≥4.5s，太短会抓到白页）
python3 check6.py     # 逐工具打印 MISS/EXTRA（复用 spec3 的 norm/lines_of/local_content_texts）
```

## 判定要点（spec3.py）
- 只统计落在「最大内容区（MAIN）」首屏矩形内的文本：本地 cb = MAIN x209 y166 w1694 h656（底 ≈822）。
- 文本是叶子节点 innerText；`<select>` 的 option 文本不进 DOM → 用 select 呈现的选项一律算缺失（已改按钮组）。
- SHELL 正则过滤掉含 LinkFox.*、结尾 ljq_driver、免责声明、操作咨询等行（两侧同规则）。

## 当前实测（本轮）
| 工具 | orig | local | MISS | EXTRA |
|---|---|---|---|---|
| VIDEO_REPLICATION | 63 | 59 | 5 | 1 |
| SALE_VIDEO | 59 | 21 | 30 | 0 |
| IMAGE_TO_VIDEO | 69 | 47 | 26 | 6 |
| AI_VIDEO_EDITING | 35 | 19 | 18 | 1 |
| VIDEO_TRANSLATION | 31 | 22 | 13 | 2 |
| VIDEO_CONCAT | 23 | 22 | 9 | 7 |

REPLICATION 本轮 38 → 5。

## 已做改动（仅 3 个 workspace 文件）
- `video.tsx` 新增 `AiVideoFamilyNav`（6 工具切换条 + 批量生成/NEW + 算力 250 chip + `ljq_driver: 已连接`），目前只在 VideoReplicationWorkspace(≈2098) 里挂载。
- VIDEO_REPLICATION 改三列：`lg:grid-cols-[minmax(220px,250px)_minmax(240px,280px)_minmax(0,1fr)]`，参数列 `data-testid=video-replication-params`，国家/语言从 `<select>` 换成按钮组（radiogroup）。
- 两个素材卡加 `compact`（min-h 249→152）。

## 坑
- `cap6v.mjs` 不要用 heredoc 写（会被截断/串到旧内容），用 file_write。
- 旧的 `capture6.mjs` 是别的工具集合（颜色类），输出 local-dom3，别混用。
- ToolResult 空态文案来自 i18n（`emptyHint`），想消除 EXTRA 需给 ToolResult 传 `emptyHint` prop。

## 待办
1. 把 `AiVideoFamilyNav` 挂到 SaleVideo(503)/VideoConcat(1143)/AiVideoEditing(1591)/image-to-video(133)/video-translation(153)。
2. 这 5 个页面内容大量落在 y>822：按 replication 模式改多列 / 压缩卡片高度。
3. EXTRA 清理（VIDEO_CONCAT 7、IMAGE_TO_VIDEO 6）。
