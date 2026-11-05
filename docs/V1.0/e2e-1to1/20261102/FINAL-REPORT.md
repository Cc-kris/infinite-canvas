# LinkFox 39 工具 1:1 验收 · 总报告

更新时间：2026-11-05
适用范围：`/tools/*` 工具工作区（不含全局壳层、账号、计费）

---

## 一、结论先说

**目标未达成。** 39 个工具中，**31 个存在可对照的原站页面且有基线截图**；但这 31 页的**双端视觉比对尚未执行**（完成数为 0）。

当前可复现验证覆盖：布局几何、首屏可达性、字段契约、基线可达性，以及 1 个工具的真实生成闭环。

不以"功能等价"替代 1:1，因此不标记完成。

---

## 二、可复现的验证结果

全部命令在 `web/` 目录下执行，均可重复运行。

| 验证项 | 命令 | 结果 |
|---|---|---|
| 单元/集成测试 | `bun test` | **1616 pass / 0 fail**（98 文件） |
| 类型检查 | `bun run typecheck` | **0 error** |
| 39 页布局门禁 | `node scripts/real-acceptance/tools-layout-check.mjs` | **39/39 通过** |
| 39 页当前截图 | `node scripts/real-acceptance/tools-screenshot-audit.mjs` | **39/39 覆盖**，均 1600×1000、无水平溢出 |
| 首屏可达性 | 见第三节 | **39 页主操作按钮全部首屏可见** |
| 字段契约 | `node scripts/real-acceptance/spec-field-parity.mjs` | **18/39 一致，0 差异**；21 页无检测来源 |
| 原站基线可达性 | `node scripts/real-acceptance/original-baseline-audit.mjs` | **31/39 可对照，缺基线 0** |
| 裁剪真实闭环 | `node scripts/real-acceptance/crop-functional-accept.mjs` | **8/8 通过** |

---

## 三、首屏可达性

对 39 页逐页测量主操作按钮的 `getBoundingClientRect()`，修复了 9 个页面：

| 页面 | 改前 | 改后 | 根因 |
|---|---|---|---|
| PRODUCT_IMAGE_SUITE | y1101 | y956 | 提交区嵌在滚动容器内 |
| HANDHELD_GOODS | y970 | y884 | 配置列无内部滚动 |
| IMAGE_TO_VIDEO | y1514 | y902 | 配置列 1474px 无滚动 |
| VIDEO_TRANSLATION | y1388 | y842 | 配置列 1383px 整页滚动 |
| SCENE_TRANSFER | y1051 | y960 | 三个上传卡堆叠 |
| AI_TEXT | y1365 | y928 | 配置列 1359px |
| ORNAMENT_TEXT | y1477 | y146 | 生成按钮埋在结果分区 |
| DRESS_WEAR_SET | y2139 | y875 | 配置列 2164px 无滚动 |
| AI_DRESSING_XSY | y3689 | y931 | 四步向导全展开 3716px |

---

## 四、真实生成闭环

**图片裁剪（零算力，完整通过）**：上传 1200×800 → 切 amazon 预设 → 下载 `crop-1024x1024.png`（28518 字节，PNG 头 1024×1024）。8/8 断言通过。

**图转视频（真实上游，跑通一次）**：`200 POST /v1/videos` → 任务 `task_FrRxKLvqfXhAFGLcU3jUhrvCDfDx8fA8` → 轮询 200 → 约 220s 出片。证据 `IMAGE_TO_VIDEO/real-generation.md`。

**图像类工具真实生成未验证**：此前因账号无图像模型失败（`404 Model "gpt-image-2" is not available for this group`）。用户已提供新的上游账号，尚未接入验证。

---

## 五、原站基线可达性

判据是**登录态下逐页读页面正文**，而不是拼 URL 或看 HTTP 状态。

| 分类 | 数量 | 工具 |
|---|---|---|
| 可做 1:1 对照 | **31** | 见 `BASELINE-AUDIT.md` 路由表 |
| 本账号不可见（blocked） | 3 | AI_TEXT、ORNAMENT_TEXT、PRODUCT_MARKET_MATERIAL |
| 原站无独立页面（no-page） | 5 | AI_POSE_GENERATOR、AI_DRESSING_XSY、FISSION_LINK、MATERIAL_UPPER_BODY、SCENE_TRANSFER |

**重要更正**：原站路由与本地 slug 不是同一套命名（如服装套图是 `/draw/clothing-image-suite`，不是 `/draw/dress-wear-set`）。我此前用本地 slug 拼接探测，把 11 页误判为"原站不存在"，并据此错误隔离了它们的基线。现已在登录态逐页复核更正，恢复了 9 张误隔离的基线。详见 `LOGIN-RECHECK.md`。

---

## 六、仍未完成

1. **31 页双端视觉比对已执行（2026-11-05），未达 1:1**：结果与差异清单见 `../20261105/VISUAL-PARITY.md`。已修跨页缺陷（自造切换条、调试文案、一键换色重叠、素材贴合挤压、主区底色），空态案例轮播、示例图与 4 个结构不同的页面仍待做。
2. **21 页字段契约无检测来源**：既无字段常量，也无可无副作用调用的 `build*Fields`。
3. **图像类工具真实生成部分完成（2026-11-05）**：钥匙串图像渠道已有 7 个图像模型，7 个修图工具真实出图，见 `../20261105/real-generation/`；套图、穿衣、穿戴、商品图等页面尚无配方。
4. **8 个不可对照工具的验收标准未定义**：3 个 blocked + 5 个 no-page，需要产品决策。
5. **图转视频的三个结果动作**（保存/下载/发画布）未逐一验证。
6. 工作区仍有未提交的他人历史笔记，不是干净发布快照。

---

## 七、本轮修正的自身错误（避免误导）

验收过程中我多次误判，均已更正并记录：

- **用本地 slug 拼 `/draw/<slug>` 探测原站** → 11 页被误判"原站不存在"，并错误隔离其基线。这是本轮最严重的错误，已在登录态逐页复核更正；
- 用 HTTP 200 判断原站工具存在（SPA 全部返回 200，必须看响应体长度）；
- 用 `includes` 匹配规格文件名（`change-color` 命中 `change-color-v2`）；
- 条件字段被误判为缺失（`if (...) fields.x = ...` 是按需提交）；
- 把"生成失败"归因于本地 Agent 未连接（实际是没注入凭据）；
- 把"结果区大片空白"记为缺陷（实际是截图早于视频挂载）；
- 判定"印花提取提交中任务未落库"（实际是探针读取了另一个模块实例）。

---

## 八、交付物索引

- `00-INDEX.md`：总索引
- `BASELINE-AUDIT.md`：原站基线可达性（含真实路由表）
- `LOGIN-RECHECK.md`：登录态复核与 slug 误判更正
- `FIELD-PARITY.md`：字段契约一致性
- `SCREENSHOT-INDEX.md`：39 页截图与几何
- `IMAGE_CROP/functional-accept.md`：裁剪真实闭环
- `IMAGE_TO_VIDEO/real-generation.md`：真实视频生成
- `<TOOL>/report.md`：每工具验收记录

## 九、本地提交

已完成两个本地提交（未推送）：

| commit | 内容 |
|---|---|
| `2148bb2f` | 9 个工具页首屏可达性修复 + 验收报告（133 文件） |
| `47aac2af` | 核验脚本、原站 DOM 证据、总报告（193 文件） |

提交后验证：`bun test` 1616 pass / 0 fail、`tsc --noEmit` 0 error、布局门禁 39/39。

验收截图（471 张、约 120MB）未入库，已在 `.gitignore` 排除，仍保留在本地。
