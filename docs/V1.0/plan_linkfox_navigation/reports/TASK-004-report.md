# TASK-004 实施报告：上传 / 草稿 / 多标签基础设施

- 分支：`feat/linkfox-v1-real`
- 依赖：TASK-003（共享 ToolShell）
- 验收对应：TC-004 / AC-004 / REQ-004（上传支持本地/资产库，校验格式/大小/尺寸，展示进度与取消）；附带 REQ-006 中草稿恢复与多标签一致性所需的基础设施
- 结论：**通过的项全部有真实运行证据**（浏览器 IndexedDB 计数、DOM 结构、单测断言）；未通过/未覆盖的项列在 §4，不掩饰

## 1. 改了什么

| 文件 | 作用 |
| --- | --- |
| `web/src/services/api/tools/assets.ts` | 资产层：魔数嗅探、格式/大小/像素/时长校验、真实分块读取（真实字节进度）、取消与回滚、IndexedDB 记录索引、资产库选取 |
| `web/src/stores/use-tool-draft-store.ts` | 草稿层：`tool-draft:v1:<toolId>`、500ms 防抖落盘、revision CAS 冲突检测、BroadcastChannel 跨标签同步、版本不符隔离 |
| `web/src/components/tools/tool-asset-input.tsx` | UI：本地文件选择/拖拽、逐项状态（uploading/ready/error）、真实进度条、取消、移除回滚、冷启动恢复、资产库选择入口 |
| `web/src/services/api/tools/assets.test.ts` | 26 条单测（注入落库实现，覆盖校验矩阵、进度、取消回滚、索引恢复、草稿刷新恢复与冲突） |

### 关键设计取舍（必须交代事实边界）

1. **“上传”目前落在本地持久层，不是远端**：本阶段没有服务端上传端点（gateway 属 TASK-005）。因此上传实现为复用既有 `web/src/services/file-storage.ts`（localforage → IndexedDB，库 `infinite-canvas`，store `media_files`，键 `tool-asset:<nanoid>`），并在 `tool_assets` 里写索引记录。接入 gateway 后只替换 `deps.store`，`onProgress` / `AbortSignal` 契约不变。
2. **进度是真实字节进度，不是定时器伪造的百分比**：读 `Blob.stream()` 的真实 `loaded/total`，符合 ui_brief「进度用任务状态，不伪造百分比」。本地读取很快，所以 UI 上常常一帧就跳到 100%——这是真实情况，不是没做进度。
3. **校验以文件头为准**：`File.type` 可伪造/可为空，代码用魔数嗅探（PNG/JPEG/WebP/GIF/MP4/MOV/WebM）解析真实类型，与声明类型不符直接拒绝（实测「改名的 GIF」被拒）。
4. **草稿 CAS 非原子**：写盘前「读-比-写」，`revision >= 本页` 且内容不同即判冲突、不覆盖；真正的原子事务留给后续 IndexedDB 事务层。版本不符（`draftVersion !== 1`）不迁移，搬到 `tool-draft:v1:quarantine:<toolId>` 隔离，避免旧结构污染新表单。

## 2. 如何验证

### 2.1 单测（可复现）

```bash
cd web
bun test src/services/api/tools/assets.test.ts
```

实测输出：

```
26 pass
0 fail
100 expect() calls
Ran 26 tests across 1 file.
```

覆盖点：空文件/超大/不支持格式/MIME 篡改/尺寸像素越界/解码失败/视频时长上限/数量上限；上传进度单调递增且终值 ratio=1；取消后库中无残留（回滚）；记录索引按 id 恢复且缺失记录被跳过；草稿 persist→load 往返一致；版本不符进隔离键；revision 冲突不覆盖。

### 2.2 类型检查

```bash
cd web && bun ./node_modules/typescript/bin/tsc --noEmit
```

本任务 4 个文件 **零错误**（`grep` 无命中）。仓库仍有 46 条**既有**错误（其他目录/配置文件，属既有技术债，未在本任务范围内修改）。

### 2.3 真实浏览器验收（localhost:3000，开发服务器）

以临时 harness 在应用页内挂载真实组件，走真实 `DataTransfer` 投放文件，读真实 IndexedDB：

- 投放 640×640 真实 PNG → 条目状态 `ready`，只显示 `14 KB · 640×640 · image/png` 与缩略图（缩略图来自库中 Blob 的 objectURL，说明解出的是真字节）
- IndexedDB 计数变化：`media_files` 2 → 3（Blob 真落库）、`tool_assets` 0 → 1（索引真落库）、`app_state` 2 → 3（草稿真落盘）
- 草稿内容：`{toolId:"PROBE_TOOL", revision:2, assetIds:["SJ7SsbheWPZET0XELIlux"]}`
- 投放「改名 GIF 冒充 png」→ 条目 `error`，提示 `文件内容与扩展名不符（实际为 image/gif），已拒绝`
- **刷新页面后重新挂载**：条目从 IndexedDB 恢复为 `ready`，`14 KB · 640×640 · image/png` 与缩略图俱在 → 冷启动恢复链路真实可用
- 验收后已清理：移除探针 DOM、`reset('PROBE_TOOL')` 删草稿、`removeToolAsset` 删记录与 Blob，删除临时 harness 目录 `web/src/__probe__`（未进提交）

## 3. 使用入口

```tsx
import { ToolAssetInput } from "@/components/tools/tool-asset-input";

<ToolAssetInput
  toolId="SCALE_UP"
  title="上传商品图"
  maxCount={4}
  constraints={{ kind: "image", mimeTypes: ["image/png", "image/jpeg"], maxBytes: 20 * 1024 * 1024, maxWidth: 4096, maxHeight: 4096 }}
  // 资产库条目由外部从 use-asset-store 适配后传入；不传则不显示「从资产库选择」
  library={libraryItems}
  onChange={(assetIds, records) => setAssetIds(assetIds)}
/>
```

- `onChange` 签名是 `(assetIds: string[], records: ToolAssetRecord[])`，顺序即用户选择顺序；失败项不进 `records`。
- 上游：`uploadToolAsset` / `validateToolAsset` / `loadToolAssetRecords` / `removeToolAsset` / `adoptLibraryAsset`
- 草稿：`useToolDraftStore`（`patch` / `flush` / `resolveConflict` / `reset`）+ `flushToolDrafts()`（卸载或切工具时立即落盘，避免 500ms 窗口丢数据）

## 4. 未完成 / 风险

1. **远端上传未接**：真正的网络传输（多部分、断点、服务端校验）要等 TASK-005 gateway；当前进度只覆盖本地读取阶段。接入时需补 `Content-Length` 与真实网络进度，并让服务端再校验一次文件头（不信任前端）。
2. **组件级 UI 测试缺失**：仓库无 `happy-dom` / `@testing-library/react`，本次 UI 证据来自临时 harness + 真实浏览器 DOM 抓取，未固化为可回归的组件测试。建议 TASK-006 或独立任务补测试环境。
3. **草稿跨标签一致性只做「检测 + 交用户选择」**：不自动合并，也没有真正的原子 CAS（读-比-写存在 TOCTOU 窗口）。高频并发编辑场景需要 IndexedDB 事务或服务端版本号。
4. **配额与清理**：`tool_assets` / `media_files` 随使用增长，未接 `cleanupUnusedMedia` 的回收策略；大图/视频可能撞 IndexedDB 配额（默认数百 MB 级），失败路径目前表现为条目 `error`，没有配额专项提示。
5. **图片解码**：尺寸依赖 `createImageBitmap` / `Image` 解码，个别畸形文件在这两个实现下行为不同，已按「解码失败 → 拒绝」处理，但未穷举样本。
6. **`tsc` 既有 46 条错误未修**：不在本任务文件内，未触碰；但会让 CI 的 `typecheck` 显示红，需要单独排期。
