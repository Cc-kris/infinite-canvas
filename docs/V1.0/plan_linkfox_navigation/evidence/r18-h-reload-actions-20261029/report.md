# R18：PRODUCT_SCENE / HANDHELD_GOODS 机器 reload 后三动作回执

- 目的：补齐 R15 判定 H 腿缺失的「机器 reload 标记 + 刷新后观测 + 三动作字节」，不改源码、不新生成、不注入。
- 时间：2026-10-29 22:20–22:22 +0800；环境：`http://127.0.0.1:3000`（vite dev）
- 方法：ego lite `web_execute_js`（DOM + IndexedDB 真字节 + `crypto.subtle` SHA-256）；每个工具独立新标签，先 `?fresh=` 首载，再 `location.reload()` 真实刷新。

## 机器结果

| 工具 | taskId | nav | 字节 | sha256 | assetId | canvasNodeId | projectId | 三动作同字节 |
|---|---|---|---|---|---|---|---|---|
| PRODUCT_SCENE | `task-mvtly3vu-fdqgy7` | reload | 2,398,828 | `fa5ee380ab79ae8b924e1481136cbcfe4f23473926246c79129fc0c59093f9e2` | `KY0av0CXhd3-OFulLII_O` | `image-1793283628325-tasuh` | `OCk3x2ThYr5Fom6sRbdg8` | PASS |
| HANDHELD_GOODS | `task-mvtm8p59-8qkp5s` | reload | 1,455,193 | `29c1afcd7bdad71b369664a756b2825395aea9c7e6634a6e23360ba9682cae84` | `92UtEzWXt3YLL1uf-aSej` | `image-1793283697520-vnm7b` | `dRgYk58nWI5L7qH36F9Q7` | PASS |

## 关键点

1. 刷新后结果面板的图片字节不是内存缓存：脚本 `fetch()` 面板 `<img data-testid=tool-result-image>` 的 blob 后实算 SHA-256，与已提交 PNG 完全一致。
2. 存资产写入 `infinite-canvas/image_files/<storageKey>`，画布节点写入 `app_state:infinite-canvas:canvas_store` 的 project.nodes；两者字节同样实算复核（同尺寸同 sha）。
3. 任务本身未被重跑：`task.updatedAt` 动作前后一致（PRODUCT_SCENE 1793282295219、HANDHELD_GOODS 1793282780051），工具任务数未变化。
4. 下载落盘：`~/Downloads/product-scene-result-1 (1).png`（2,398,828B）、`~/Downloads/handheld-goods-result-1 (1).png`（1,455,193B），mtime 与点击时刻一致。

## 复算

```bash
shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/r16-scene-real-20261029/PRODUCT_SCENE-result-1.png
shasum -a 256 docs/V1.0/plan_linkfox_navigation/evidence/r17-handheld-real-20261029/HANDHELD_GOODS-result-1.png
```

两份 PNG 的实算 sha 与两个回执内 `byteAgreement` / `reload.postReloadPanel` / `actions.*` 字段逐一相等。

## 对 R15 的意义

R15 对这两格 H 的缺口是「回执为刷新前证据、无机器 reload 标记、刷新后无观测、存资产/发画布仅元数据」。本轮四类字段均已具备机器可核证据（`reload.navigationType=reload`、刷新后面板字节、assetId+storageKey 字节、canvasNodeId+projectId+字节），且能由 HEAD 内已提交 PNG 复算。
