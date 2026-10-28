# AREA_REPAIR 收尾结论：PASS（真实出图 + 三动作真实点通）

日期：2026-10-29 · 分支 `feat/linkfox-v1-real` · 环境：dev server `127.0.0.1:3000` + canvas-proxy `127.0.0.1:23210`

## 1. 代码改动（本次唯一代码改动）

`web/src/components/tools/workspaces/mask.tsx`（未提交前 15 行差异）

1. `runAreaRepairUnits(units, { concurrency: 2 })` → `concurrency: 1`：
   实测并发 2 时两个单元都停在 `submitting`、互相拖住，整批 90s 内无结果（见 `FINDINGS.md`）。
2. 新增 `onOutcome`：每张完成即 `setOutcomes` 回流，不再等 `runAreaRepairUnits` 全部结束。
   修前现象 = 单张成功也不渲染，用户侧「卡住」；修后 = 第 1 张到即显示。

## 2. 修复后真实复测（同一份 `mask.tsx`，修改时间 2026-10-29 00:06:59，取证 00:08）

| 门禁 | 结果 |
| --- | --- |
| 上游调用 | `POST /v1/images/edits` **200 / 36270ms**，**200 / 36342ms**（`result.json.upstream`） |
| 出图数 | 2/2，均 1024×1024（`result.png` 943932B、`result-2.png` 907235B） |
| 非回显 | sha `3cf14369ab4539a9` / `c1731841bb091051` ≠ 源图 |
| 下载 | `area-repair-download-1` → href=OSS 地址，filename `product-watch-repainted.png` |
| 存库 | 真点击 `area-repair-save-1` → assetId `U_TaBRV2fBhWCEm-hu6Ug`（source `area-repair`），`assets.png` 回验可见 |
| 发画布 | 真点击 `area-repair-send-1` → projectId `bzQ2ePN7UDxTFI1nbkfWy`，`canvas.png` 回验见新节点 |

选择器与代码一致性已核对：`run-area-repair.mjs` 点击的 `area-repair-save-1 / -send-1 / -download-1`
在 `mask.tsx` 结果卡（第 107–153 行，含 `saveResultItemToAssets` / `sendResultItemToCanvas`）中真实存在，
不是脚本自己造的返回值。

## 3. 聚焦测试 + 类型检查

```
cd web && bun test src/components/tools/workspaces/mask.test.tsx \
  src/features/tools/adapters/area-repair.test.ts \
  src/features/tools/adapters/hand-repair.test.ts \
  src/components/tools/workspaces/printing-repair-result-actions.test.tsx
→ 65 pass / 0 fail / 313 expect() calls / 4 files

cd web && npx tsc --noEmit
→ EXIT=0（无输出）
```

## 4. 与 LinkFox 对照

见 `LINKFOX_COMPARE.md`（控件级 1:1 表 + 差异说明）。

## 5. 风险 / 未覆盖

- 响应式断点（1920/1440/1024/768/390）与深色模式本轮未取证。
- 单结果重试、输入快照查看未点击取证。
- `AREA_REPAIR/run.json` 已删除：它是**源图回显假阳性**那次的记录（`bogusSourceEcho: true`），
  保留会与 `result.json` 的真实结论冲突；删除理由见 `FINDINGS.md`。
- `run-area.json` 保留为修复前的失败快照（`ok: false`），用于证明「并发 2 会互相拖住」这一结论。
