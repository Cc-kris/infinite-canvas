# TASK-042 带货口播 SALE_VIDEO 实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`7f2468c` feat(tools): SALE_VIDEO 带货口播工作区（registry + adapter + 视频页 + 18 项测试）
- 变更规模：4 文件 / +1694 行（全部新建）
- 证据级别：`workspace_dom`（原站 `https://www.linkfox.com/draw/sale-video`）

## 1. 交付物

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/sale-video.ts` | 432 | 页面契约：状态模型、11 国 → 口播语言联动、7 种比例、3 档时长、2 种分辨率、4000 字校验、确定性隐藏提示词、提交快照、草稿序列化、能力/成本口径 |
| `web/src/features/tools/adapters/sale-video.ts` | 342 | 运行适配：商品图规则校验、提交前断言、12 字段落齐、gateway 入参组装、真实 `runTool` 调用、结果视图与过期判定 |
| `web/src/components/tools/workspaces/video.tsx` | 558 | 工作区 UI：六个真实区域 + 结果区（非「上传 + 提示词 + 生成」空壳） |
| `web/src/features/tools/adapters/sale-video.test.ts` | 362 | 18 个 bun 用例（registry 9 / adapter 8 / workspace 1） |

注册表接线（`registry/index.ts` 的 `SALE_VIDEO` 条目、`/tools/ai-video/sale-video` 路由）已在 HEAD 中，本任务未改动共享文件。

## 2. 页面结构（对齐 page-spec §1，六区域）

1. **商品多图**：`ToolAssetInput`，≤9 张 / 10MB / 384²–4096² / 宽高比 0.4–2.5 / png·jpeg·webp，规则与文案单点定义在 `SALE_VIDEO_SOURCE_RULE`。
2. **口播提示词**：4000 字上限、实时 `n / 4000` 计数、超限拒绝提交；「AI帮写」按国家/语言/张数生成确定性口播草稿，按钮旁明标「模板帮写」——不冒充模型输出。
3. **国家/语言**：11 个目标市场，切换国家自动联动默认口播语言（US → `英语（English）`），语言仍可手动改。
4. **视频模型 + 分辨率**：`ModelPicker` 读真实 `config.videoModel`（无模型时提示去配置，不硬编码型号）；480P / 720P 分段控件。
5. **时长 + 比例**：5 / 10 / 15 秒三档；自适应、9:16、16:9、1:1、4:3、3:4、21:9 共 7 种，与原站 DOM 实测一致。
6. **结果区**：`ToolResult` 原生渲染 `<video controls>`，空 / 生成中 / 成功 / 失败 / 取消 / 未知六态；快照与当前配置不一致时标「来自旧版本」。

无算力区（原站「645 算力」属其计费口径，本仓库不复刻）；改为产物说明「1 条 · N 秒 · 分辨率」。

## 3. 关键行为（真实边界，不造数据）

1. **提交前五道断言**：缺模型 / 缺图 / 提示词空或超 4000 / 时长非法 / 比例非法 → 各自明确错误码，不发空请求。
2. **参考图必须真有字节**：提交时按 `storageKey` 取回 Blob 转 dataUrl，取不到就报「素材本地数据不可用」；若记录里只有 `dataUrl` 则直接用，绝不用名字冒充图片。
3. **12 个字段一次落齐**：`buildSaleVideoFields` 覆盖 registry 声明的全部字段（`imageUrl` 取第一张，`imageList` 全量），便于指纹与审计。
4. **隐藏提示词不含用户自由文本**：`buildSaleVideoHiddenPrompt` 只拼市场/语言/时长/比例/素材数量等结构化约束；用户脚本单独以「【口播脚本（用户可见，可编辑）】」段落追加，避免可编辑内容偷渡进不可见指令。
5. **结果全部来自 `task.result.items`**：本模块不产生占位视频；上游无产物时如实报 empty。
6. **旧结果可见降级**：模型 / 语言 / 提示词 / 素材任一变化 → 快照不匹配 → 打 stale 标记。

## 4. 验证证据

```
$ cd web && bun test src/features/tools/adapters/sale-video.test.ts
18 pass
0 fail
108 expect() calls
Ran 18 tests across 1 file.

$ cd web && bunx tsc --noEmit
（0 行输出；grep -c 'error TS' → 0）
```

覆盖要点：
- registry：工具身份/路由/布局、7 比例·3 时长·2 分辨率枚举、国家→语言联动、4000 字边界（4000 通过 / 4001 拒绝）、隐藏提示词纯净性、模板帮写确定性且不编造价格、快照随四类输入变化、草稿往返与非法值回落。
- adapter：大小/尺寸/宽高比/格式四类单图问题、超 9 张批量问题、五道提交断言、12 字段落齐、gateway 入参（prompt = 隐藏模板 + 用户脚本，references 数量与素材一致）、无 dataUrl 拒绝提交、六态结果视图、stale 判定。
- workspace：`renderToStaticMarkup` 首屏渲染出六个区域与关键控件文案，提交按钮在缺图/缺模型时禁用。

## 5. 偏差与遗留风险

1. **页面路由尚未 dispatch 到本工作区**：`tool-page.tsx` 目前没有 `toolId → 组件` 映射表，该文件是共享文件且同步注明「由负责人接线」，不在本任务允许改动清单内。集成只需一行：
   ```ts
   SALE_VIDEO: lazy(() => import("@/components/tools/workspaces/video")),
   ```
   否则从 `/tools/ai-video/sale-video` 进入仍是占位符。
2. **「AI帮写」不是模型调用**：实现为确定性模板（按国家/语言/张数拼口播骨架），界面明标「模板帮写」。若要接真模型，需新增一次 text 能力请求，属新决策点。
3. **原站型号不可硬编码**：原站实测默认 `Seedance 2.0 fast`，本实现改用用户 `config.videoModel` + `ModelPicker`，因此默认型号取决于用户配置，不复刻原站品牌型号。
4. **国家/语言枚举不全**：11 个主要市场，原站下拉全量未抓取到（DOM 证据里只有 `US（美国）`）；新增市场只需往 `SALE_VIDEO_COUNTRIES` 追加一项。
5. **时长控件是按钮组而非拖拽滑块**：3 档取值与原站一致，交互形态简化，未做拖动轨迹。

## 6. 集成入口

```ts
// tool-page.tsx（或对应 dispatch 处）
SALE_VIDEO: lazy(() => import("@/components/tools/workspaces/video")),
```

- 路由：`/tools/ai-video/sale-video`
- 单文件自测：`cd web && bun test src/features/tools/adapters/sale-video.test.ts`
