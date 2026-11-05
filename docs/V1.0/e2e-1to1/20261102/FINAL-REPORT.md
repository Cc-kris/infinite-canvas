# LinkFox 39 工具 1:1 验收 · 总报告

生成时间：2026-11-04（第 40 轮，目标轮次用尽）
适用范围：`/tools/*` 工具工作区（不含全局壳层、账号、计费）

---

## 一、结论先说

**目标未达成。** 39 个工具中，只有 20 个存在可对照的原站页面；其中完成双端视觉比对的为 **0 个**（受登录态阻塞）。当前可复现验证覆盖的是：布局几何、首屏可达性、字段契约、基线可信度，以及 1 个工具的真实生成闭环。

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
| 首屏可达性 | 见"三、可达性" | **39 页主操作按钮全部首屏可见**（扫描对 2 页报出的 OFFSCREEN 系文案匹配误报，已逐页实测按钮 y931 / y956 在首屏内） |
| 字段契约 | `node scripts/real-acceptance/spec-field-parity.mjs` | **18/39 一致，0 差异**；21 页无检测来源 |
| 原站基线可信度 | `node scripts/real-acceptance/original-baseline-audit.mjs` | **20/39 可对照**；错配基线 0（已隔离 17 张） |
| 裁剪真实闭环 | `node scripts/real-acceptance/crop-functional-accept.mjs` | **8/8 通过** |

---

## 三、首屏可达性（本轮重点）

对 39 页逐页测量主操作按钮的 `getBoundingClientRect()`，修复了 6 个页面：

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

**图转视频（真实上游，跑通一次）**：`200 POST /v1/videos` → 任务 `task_FrRxKLvqfXhAFGLcU3jUhrvCDfDx8fA8` → 轮询 200 → 约 220s 出片（`<video src="blob:...">`）。证据 `IMAGE_TO_VIDEO/real-generation.md`。

**图像类工具无法验证（环境阻塞）**：本机测试账号 `GET /v1/models` 仅返回 `MiniMax-H3`（视频），无任何图像模型。注入凭据后图像请求被上游拒绝：`404 Model "gpt-image-2" is not available for this group`。页面行为正确（标失败、不自动重试），但这属于**环境能力缺失**，不是代码缺陷。

---

## 五、基线可信度（重要发现）

判据三条，缺一不可：

1. `tool_specs.json` 的 `origin === "original"`；
2. `GET /draw/<slug>` 响应体 > 8KB（原站是 SPA，任何路径都返回 200，不存在时仅约 1.2KB 空壳）；
3. 页面规格的证据级别不是 `permission_redirect_home`。

结果：**仅 20/39 可做真正的 1:1 对照**。

- 9 个工具原站不存在（`supplemental`）：AI姿势生成、AI试衣XSY、场景裂变链接、图片文字编辑、上装换料、商品图设计器、商品营销素材、场景迁移、视频拼接；
- 6 个工具原站无此页面：服装套图、高清放大、色差修复、商品图、商品替换、AI穿衣、图转视频；
- 2 个本账号被重定向首页：AI_TEXT、ORNAMENT_TEXT。

这 17 页此前的 `original.png` 均为错配截图（实际是站点首页、404 页、AI自由绘图页），已移入 `_INVALID-BASELINE/` 并在原目录留 `BASELINE-INVALID.md`。

---

## 六、仍未完成

1. **20 页的双端视觉比对为 0**：需 LinkFox 登录态。实测无登录的独立浏览器与 /tmp 用户目录的 CDP 浏览器均被重定向首页；AGENTS.md 禁止干扰用户已打开的浏览器。
2. **3 页缺原站基线**：SALE_VIDEO、VIDEO_REPLICATION、VIDEO_TRANSLATION。
3. **21 页字段契约无检测来源**：既无字段常量，也无可无副作用调用的 `build*Fields`。
4. **图像类工具真实生成不可验证**：账号无图像模型。
5. **17 个不可对照工具的验收标准未定义**：需要产品决策。
6. **图转视频的三个结果动作**（保存/下载/发画布）未逐一验证。
7. 工作区仍有大量未提交变更，不是干净发布快照。

---

## 七、为什么目标仍未达成（明确阻塞条件）

轮次用尽时，唯一阻塞项是**原站登录态**：

- 无登录的独立浏览器访问 `https://www.linkfox.com/draw/ornament-text` → 被重定向回首页；
- 本机 CDP（9333，user-data-dir 在 /tmp）同样未登录；
- AGENTS.md 明确禁止干扰用户已打开的浏览器，因此不操作用户 Chrome 会话。

在该条件解除前，20 个可对照工具的双端视觉比对无法进行，"与原站一致"无法证伪，因此不标记完成。

## 八、本轮修正的自身错误（避免误导）

验收过程中我多次误判，均已更正并记录：

- 把"生成失败"归因于本地 Agent 未连接（实际工具网关不依赖 Agent，是没注入凭据）；
- 把"结果区大片空白"记为缺陷（实际是截图早于视频挂载）；
- 判定"印花提取提交中任务未落库"（实际是探针读取了另一个模块实例）；
- 用 HTTP 200 判断原站工具存在（SPA 全部返回 200，必须看响应体长度）；
- 用 `includes` 匹配规格文件名（`change-color` 命中 `change-color-v2`）；
- 条件字段被误判为缺失（`if (...) fields.x = ...` 是按需提交）。

---

## 九、交付物索引

- `00-INDEX.md`：总索引
- `SCREENSHOT-INDEX.md`：39 页截图与几何
- `BASELINE-AUDIT.md`：原站基线可信度
- `FIELD-PARITY.md`：字段契约一致性
- `IMAGE_CROP/functional-accept.md`：裁剪真实闭环
- `IMAGE_TO_VIDEO/real-generation.md`：真实视频生成
- `<TOOL>/report.md`：每工具验收记录
