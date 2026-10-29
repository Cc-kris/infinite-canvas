# PRODUCT_IMAGE_SUITE — R13 真实复验（真实 task + 刷新回填 + 三动作）

日期：2026-10-29（本地时区，浏览器 ego lite (Galley)，127.0.0.1:3000 开发栈）
状态：**F（PARTIAL → 仍为 PARTIAL，缺口已修：保存现在真入作品库）**

## 1. 复用的真实 task（未新生成、未注入）

localStorage `tool-task:v1:task-mvt6vpdn-17qby2`：

| 字段 | 值 |
| --- | --- |
| id | task-mvt6vpdn-17qby2 |
| toolId | PRODUCT_IMAGE_SUITE |
| status | succeeded |
| createdAt | 1793256938555（2026-10-29 20:15 左右本地） |
| configSnapshot | `{"apiFormat":"openai","capability":"image","channelId":"default","count":"1","model":"default::gpt-image-2","quality":"auto","size":"1:1"}` |
| sourceAssetIds | `["70lReR7mxWpud9zm3vzwh"]`（1 张商品图，真实素材字段） |
| 结果 item | id `task-mvt6vpdn-17qby2-0`，storageKey `tool-result:FRr_uTcG6mZmHzzEJ2rYx`，bytes **2,785,837** |
| prompt | “基于上传的商品图生成 A+ 详情页模块（高级A+）第 1/1 屏 … 输出比例 1:1，分辨率 2K，品质 高品质。无文字模式 …” |

请求字段核对结论：
- configSnapshot 落到 `size=1:1`（画幅）、`count=1`（数量）、`quality=auto`，与 draft 选择一致；
- 布局（suiteModule/suiteLayoutMode）只体现在 prompt 文本（“高级A+ … 第 1/1 屏”），**task 记录里没有把 suiteModule/suiteLayoutMode/suiteUnitId 作为字段持久化**（仅 fingerprint），这是 PARTIAL 的保留原因之一；
- 素材字段 sourceAssetIds 有真实值（1 个资产），非空占位。

## 2. fresh reload 结果面板回填（真实 DOM 证据）

刷新 `/tools/ecommerce-suite/product-image-suite` 后：
- 结果区文本含 `共 2 张`；两张结果各自带 `保存 / 发送画布 / 下载` 三按钮（按钮总数 2×3）。

## 3. 三动作真实回执

| 动作 | 回执证据 |
| --- | --- |
| 保存 | 按钮文案变 `已存作品库`；作品库 `infinite-canvas:asset_store` 新增真实资产：`id=iWK4VVTJEg96zsnpGmGFA`，`title=商品套图 结果 1`，`bytes=2840825`，`1024×1024`，`storageKey=image:VKkekbX4rq2p68tvwbyOW`（assets 总数 45） |
| 发送画布 | 按钮文案变 `已发送画布`；画布项目库新增项目 `Y8Og23eXg0atwd4BdFmTB`，`title=商品套图结果`，`createdAt=2026-10-29T13:34:45.441Z`，含 1 个 image 节点 `image-1793280885550-zk9ly` |
| 下载 | `~/Downloads/product-image-suite-result-1 (2).png`，**2,785,837 字节**（与任务 item bytes 完全一致），1024×1024，sha256 `6f9dec2af872e9e97f26830b63f3126fd462a71ff8106bfbc3f67c43ae22c6a4` |

## 4. 本轮最小修复

`web/src/components/tools/workspaces/suite.tsx`

- 修复前：结果项“保存”调用 `saveSuiteResultItem()`——只把字节上传到媒体存储并返回 storageKey，**并未写入作品库**，按钮却显示“已存作品库”（假回执）。
- 修复后：改为公共依赖 `saveResultItemToAssets(item, itemIndex, { toolId, title: '商品套图 结果 N' })`，真实写 `asset_store` 并返回 `assetId`；`savedKeys` 存 assetId。同时移除仅供旧实现使用的 `saveSuiteResultItem` 导入。
- 未改动发送画布/下载实现（两者本身已是真实实现，回执已本文件第 3 节取证）。

## 5. 回归

- `npm run typecheck`（web）：通过，exit 0。
- `~/.bun/bin/bun test src/components/tools/workspaces/suite.test.tsx src/features/tools/adapters/product-image-suite.test.ts`：**29 pass / 0 fail**，141 expect。

## 6. 剩余 PARTIAL 项（未在 R13 范围修复）

1. suiteModule / suiteLayoutMode / suiteLayoutId / suiteUnitId 未作为字段持久化，只进 prompt 与 fingerprint → 审计侧无法从 task 结构化核对“布局”，需后续把 `inputSnapshot` 或 fields 落库。
2. “从作品库选择 / 从商品库选择”仍为 disabled（商品库未接入，PARTIAL 既有标注）。
3. 未做真实跨项目切换（发送画布固定新建项目，无“选择已有画布”入口）。
