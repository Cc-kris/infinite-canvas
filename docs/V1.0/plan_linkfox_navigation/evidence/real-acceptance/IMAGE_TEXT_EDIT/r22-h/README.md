# R22-H IMAGE_TEXT_EDIT 真实浏览器验收（结果→下载→资产→画布→刷新）

- 日期：2026-10-30 | 分支：`feat/linkfox-v1-real` | 站点：`http://127.0.0.1:3000`（tab 1709629368）
- 任务：`task-mvufj9u8-wefie4`（IMAGE_TEXT_EDIT，succeeded，1 个结果）
- 结论：**PASS**。五条链路的字节与同一 sha256 完全一致；另记录 1 条跨标签并发写风险（非阻断）。
- 方式：真实 UI 点击 + Chrome IndexedDB 实读 + 磁盘文件 sha256 三方对账，未做接口直写或事件伪造，未触发新生成。

## 基准字节

| 项 | 值 |
|---|---|
| bytes | 1050148 |
| mime / 尺寸 | image/png / 1024×1024 |
| sha256 | `5665d2900a368cb5a1705969f102e8d3ce611d697b44763dc18f2403af3975d0` |

## 五条链路（详见 `r22h-bytes-and-propagation-20261030.json`）

1. **结果字节**：`media_files` 键 `tool-result:task-mvufj9u8-wefie4:0:gnSkfmpmjijI5cCFQJGS0` → 1050148B，sha 一致。
2. **工具面板「下载」**：点击 → `~/Downloads/image-text-edit-result-1 (2).png`，sha 一致（未重编码）。
3. **「存入资产」**：toast `已保存到资产库（9RxX8ji3nn80hmtgbq-Ph）`；`asset_store` 62→63；`data.storageKey=image:94vpOfstmK6HXUe37yoYG`，blob 1050148B/sha 一致；刷新后仍在。
4. **「发送画布」**：工程 `Epr65m3gtsi2nEcf-Z5Qu`、节点 `image-1793332227385-qf9gq`，`metadata.storageKey=image:LnKmlw15v4qAf18WRNZrY`，bytes/尺寸/png 正确，blob sha 一致。
5. **/assets 资产卡 + 卡片下载**：卡片文案 `1024x1024 · 1.0 MB · image/png`；点「下载」得 `IMAGE_TEXT_EDIT 结果 1 (1).png` 1050148B，sha 一致（资产卡导出原始字节）。

刷新标记：CDP `Page.reload` 后 `performance.navigation.type = reload`；刷新后 asset_store 63 条、画布工程/节点与两处 blob 字节仍全等。

## 风险与误报

- **风险（非阻断）**：首次保存于 03:48:28 返回 id `FlN6q3WKSxazLNSDb1hrj`，但持久化 `asset_store` 中检索不到该 id（`idInRaw=-1`），也无 bytes=1050148 的资产；当时最新资产是另一标签 03:49:01 写入的视频资产。**推测**为多标签各自持有旧快照回写导致的 last-write-wins 覆盖（未做受控双标签实验，故不作定论）。同页重试保存正常且刷新后稳定，说明写入链路本身可用。建议后续单独修复（写入前 re-read + merge 或 BroadcastChannel 同步）。
- **误报**：一次连续点击未落盘，系 Chrome 对连续自动下载的拦截（无 toast、无 .crdownload）；刷新后单次点击即成功，非产品缺陷。
- **易错点**：资产卡 1050148B 显示为「1.0 MB」，历史资产 844613B 显示为「825 KB」，同名卡片需按尺寸区分；对照件保留在 `artifacts/older-asset-card-844613-e7b260e7.png`。

## 产物

- `r22h-bytes-and-propagation-20261030.json`：全量对账证据
- `dom-asset-cards.json`：/assets 卡片 DOM 快照（3 张同名卡片的尺寸区分依据）
- `artifacts/tool-download-1050148-5665d290.png`、`artifacts/asset-card-download-1050148-5665d290.png`、`artifacts/older-asset-card-844613-e7b260e7.png`

## 复现入口

1. `cd web && pnpm dev`（或既有 127.0.0.1:3000 实例）
2. 打开 `/tools/product-design/image-text-edit`，结果面板依次点 下载 / 存入资产 / 发送画布
3. 打开 `/assets` 按 `1024x1024 · 1.0 MB` 定位卡片并点 下载
4. 校验：`shasum -a 256 ~/Downloads/image-text-edit-result-1*.png ~/Downloads/IMAGE_TEXT_EDIT*.png` 应均为 `5665d290…`
