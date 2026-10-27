# R1 技术设计 / 测试用例 / 验收标准 / 任务清单 — 独立审核报告

- 审核角色：独立资深全栈架构师 + 测试专家（只审文档，未修改被审文档，未改代码）
- 审核日期：2026-10-27
- 轮次：R1

## 1. 读取路径

目录前缀：`/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/`

- `technical_design.md`（415 行）
- `test_cases.md`（81 行，61 条 `TC-*` 记录）
- `acceptance.md`（85 行，54 条 `AC-*` 记录）
- `task_list.md`（63 行，46 条任务）
- `prd.md`（445 行）
- `tool_specs.json`、`document_validation.json`、`validate_documents.py`
- 对照：`/Users/mac/Documents/Dev/infinite-canvas/docs/analysis/assets/linkfox/schema_final.json`
- 对照仓库：`/Users/mac/Documents/Dev/infinite-canvas/web/src`、`AGENTS.md`

`validate_documents.py` 跑出 `status: PASS`，`document_validation.json` 中各文档 sha256 与磁盘一致。但该脚本仅做结构性检查（39 个工具唯一、origin 30:9、路由唯一、`batchReferences`==12、各文档含 39 个小节/39 个 id 子串、任务估算不超 200、`tool_tasks_39` 用子串匹配而非精确匹配），**不检查字段类型、AC↔TC 一致性、任务依赖正确性、代码路径真实性**，PASS 不代表文档可直接进入实施。

## 2. 严重级别问题（H = 阻断实施，M = 中等，L = 轻微）

### H1. 请求契约粒度不足以生成类型安全代码

`technical_design.md` 每个 `### TECH-Txx` 小节的"契约"行只列字段名（如 `` `autoExpand`、`imageName`、`imageUrl`、`maskUrl`、`outputNum`、`prompt` ``），没有类型、是否必填、枚举值、数值范围。第 2 节声明 "zod schema 分 UI 字段与上游字段"（第 38 行附近），但契约本身不含可供 zod 推导的信息，`buildRequest` 无法做到"类型安全、显式映射"。

`schema_final.json` 中 `fields_clean`（= `fields` 去掉 `extendFields` 和 `type`）与多个工具的 TD 契约完全对应（已核对 `AREA_REPAIR`、`CHANGE_COLOR_V2`、`SCENE_TRANSFER`、`VIDEO_TRANSLATION`），但 TD 全文只对 `NEW_REPLACE_BG_V2`（空字段）和 `NEW_DESIGNER`（第 188 行附近，契约实际是 `open`/`onClose`/`onDone` 等组件 props，不是请求字段）两个工具单独说明了"回查原 chunk"的必要性，其余工具没有说明 `extendFields`/`type` 是否需要在 adapter 中处理，实施时逐工具都要回查 schema，TD 本身不足以独立指导编码。

### H2. 测试基础设施未定义，与仓库实际不匹配

`web/package.json` 的 `test` 脚本为 `bun test`，依赖列表中没有 `zod`、`vitest`、`happy-dom`、`@testing-library/*`、`playwright` 等包。但 `technical_design.md`、`test_cases.md`、`task_list.md` 大量引用 `.test.tsx`、"integration"、"e2e/UI"（`test_cases.md` 第 72、75、76 行："不 mock 关键依赖"、"五类菜单、39 页面..."），全文没有任何一处说明用什么 runner、如何起 e2e 浏览器。61 条 TC 要求"真实浏览器/本地持久化"级别的证据，基础设施缺口会直接卡住 TASK 落地。

### H3. 幂等与重试设计存在逻辑漏洞

`technical_design.md` 第 9 节附近描述断网/刷新恢复，但在拿到上游 `upstreamTaskId` 之前发生超时，前端没有可查询的键，无法判断"原任务是否已创建"，`test_cases.md` 的 `TC-057`（"模拟请求已到达但响应超时，刷新页面"→"先恢复/查询原任务，不重复创建"）在没有 mock 的"真实"测试环境下无法构造这个时序，与 H2 的"不 mock"要求直接冲突。`acceptance.md` 的 `AC-007`（断网恢复、不得重复扣费）也没有给出"扣费"的可验证来源（真实网关还是本地模拟计费）。

### H4. 技术设计引用的代码路径与真实仓库结构不一致

逐一核对 `web/src` 后确认：
- TD 提到的 `saveImage`/`saveVideo` 函数名在仓库中不存在；真实上传方法是 `services/image-storage.ts` 里的 `uploadImage`。
- TD 提到的 `lib/upload-image.ts`、`config/features.ts`、`features/tools/`、`services/tool-gateway/` 目录均不存在；仓库实际是 `src/constant/navigation-tools.ts`（导航配置）、`src/stores/`、`src/services/api/`。
- `AGENTS.md` 明确要求服务层放在 `services/api/`、禁止写"纯转发"组件、UI 文案用中文、且该项目未上线不需要版本迁移兼容逻辑；但 TD 设计了 `specVersion` 迁移机制，与仓库约定矛盾。
- `task_list.md` 的 `TASK-002`（五类顶部菜单与移动 Drawer）影响文件列表里没有 `constant/navigation-tools.ts` 和 `i18n/locales/{zh-CN,en-US}`，而真实的 `components/layout/mobile-nav-drawer.tsx` 用 `useTranslation` 读取的文案就在这些 i18n 文件里，任务范围遗漏了必改文件。

### H5. 测试用例与验收标准缺少可判定的数值边界，且存在孤儿测试

- `test_cases.md` 中约 15 条（`TC-001~TC-015`）用近乎一致的模板化步骤描述，对期望结果没有量化判据；全文搜索未发现任何 MB/px/秒/并发数等数值边界。
- `test_cases.md` 共 61 条（`TC-001~TC-061`），`acceptance.md` 只到 `AC-054`；已用正则核对 `AC-xxx | REQ-xxx / TC-xxx` 与 `TC-xxx | REQ-xxx` 的 REQ 字段，54 条全部一致（没有错配），但 `TC-055~TC-061`（7 条）没有任何 AC 引用它们，这 7 条测试没有验收标准兜底，谁来判定通过/失败不明确。
- `acceptance.md` 中大量"真实结果或明确 BLOCKED"式判据（如第 47 行 `AC-030`）不可证伪：审核者无法区分"真的做不到所以 BLOCKED"还是"懒得做"。
- `document_validation.json` 的 `status` 为 PASS，但对应的 `document_review.md` 内容只有 6 行占位文字，没有实际逐条审查记录，"PASS" 的含金量存疑。

### H6. 任务拆分的工作量估算、依赖与组件归属存在系统性缺口

- 46 条任务中 43 条估算值完全相同（190），只有 `TASK-001`（150）、`TASK-004`（180）、`TASK-006`（170）不同；39 个工具页复杂度差异很大（如纯换背景 vs 视频翻译+口型同步），用统一估算无法反映真实工作量。
- `task_list.md` 中出现 6 次的"视频任务样板"是多个视频类任务依赖的交付物，但该词在 `technical_design.md` 和 `prd.md` 中均搜索不到（已确认两处均为 `False`），这个"样板"从未被定义，依赖它的任务无法验收。
- `TASK-008` 及之后的逐工具任务依赖项只写 `TASK-006`，没有包含 `TASK-005`（批量/状态机基础设施任务），但 TD 第 48 行描述的批量编排（BatchTask/预检/并发/部分成功）明显是逐工具任务要用到的能力，依赖关系缺失。
- 16 个在 `task_list.md` 中出现过的组件名（`AssetUploader`、`CapabilityNotice`、`DesignerHost`、`DraftRecovery`、`ImageResultGrid`、`InteractiveCanvas`、`MaskEditor`、`ModelCapabilitySelect`、`PromptComposer`、`SizeRatioControl`、`VideoTimeline`、`VideoResultPlayer` 等）中，只有 `CapabilityNotice` 被明确分配到某条任务的"影响文件"里，其余组件没有指定由哪个任务创建，39 个工具任务共享这些组件会导致职责不清、重复实现的风险。

## 3. 中等问题（M）

- `ToolAdapter`、`TaskState`、`BatchTask`、`FieldSpec` 等类型在 `technical_design.md` 中反复被引用（如第 26、34 行附近），但全文没有给出这些类型的字段定义，实施者需要自行设计。
- TD 第 11 节（"实施顺序与回滚"）只给出一句话级别的回滚策略（feature flag / registry enabled），没有描述回滚对已产生的草稿、已提交任务的数据影响；第 12 节"非目标与未决验证"把 `NEW_REPLACE_BG_V2` 空字段、`NEW_DESIGNER` 宿主契约等关键不确定性都列为"未核实"，等于承认部分设计还没做完就进入任务拆分阶段。
- 轮询间隔、退避策略、超时阈值、并发数上限均没有给出具体数值，`prd.md` 第 61-62 行 `REQ-009` 只写"并发上限"但不给数字，留给实施者自由发挥会导致不同工具行为不一致。
- localforage 草稿在多标签页并发写入时的冲突策略、配额超限行为、`blob:` URL 的生命周期管理（何时 revoke）均未设计，TD 第 54 行只提到"对象 URL 及时 revoke"但没有说明触发时机。
- SSRF 防护、`imageUrl` 来源白名单、签名 URL 的 TTL 均没有设计，考虑到该系统会接受用户输入的图片/视频 URL 并转发给上游服务，这是需要在实施前明确的安全点。
- `ToolLayout` 枚举在 TD 中只列出约 10 种并以注释省略号收尾，但 `tool_specs.json` 中实际出现的 `layout` 取值超过这个数量，枚举未完整定义。

## 4. 轻微问题（L）

- `validate_documents.py` 的 `tool_tasks_39` 检查用的是"工具 id 字符串是否出现在 task_list.md 全文中"的子串匹配，不是"该工具被某条任务的影响文件/描述显式覆盖"，如果未来有工具 id 是另一个工具 id 的子串，该检查会产生误判（目前 39 个 id 两两互不包含，暂未触发，但验证脚本本身的设计有脆弱性，建议后续改为精确匹配）。
- `document_validation.json` 中 sha256 与当前磁盘文件内容一致，说明自上次跑校验脚本以来 7 个文档没有被再编辑过；但这只证明"文档没变"，不证明"文档内容正确"，不应把这个 PASS 当作内容审核通过的证据。

## 5. 已排查但确认不成立的怀疑（记录以避免重复排查）

- 曾怀疑 `AREA_REPAIR`（`bizType=28`）与 `NEW_REPLACE_BG_V2`（`bizType=28`）在提交时 `makeType` 会冲突；核实后 TD 两处 `makeType` 实际取自 `schema_final.json` 的 `type_final` 字段（`AREA_REPAIR=32`，`NEW_REPLACE_BG_V2=28`），两者不同，**不存在冲突**，此怀疑不成立。

## 6. 结论

字段清单、路由唯一性、`origin` 30:9 分布、layout→workspace 对应、batch 标记这几项数量层面的核对是合格的，这部分可以信任。但本次审核在契约粒度、测试基础设施、幂等设计、代码路径真实性、任务拆分质量五个方向发现 6 条 H 级问题，其中 H2（测试运行器缺失）和 H4（代码路径不存在）会在实施第一步就卡住，H1（契约粒度）和 H6（任务估算/依赖/组件归属）会导致后续 39 个工具任务在执行中不断返工。这些问题不修改文档无法进入实施。

需要修改的文档：
- `technical_design.md`：补全每个工具的字段类型/必填/枚举/范围，统一说明 `extendFields`/`type` 处理方式，补齐 `ToolAdapter`/`TaskState`/`BatchTask`/`FieldSpec` 的类型定义，修正与仓库不一致的路径引用，去掉未使用的迁移机制或改为"不做迁移"，补充轮询/退避/超时/并发数值。
- `test_cases.md`：为 `TC-055~TC-061` 补充对应验收标准或说明其验收归属，补充数值化的期望结果。
- `acceptance.md`：把"真实结果或 BLOCKED"类判据改为可核查的具体条件。
- `task_list.md`：拆分统一的 190 估算、补上 `TASK-005` 依赖、为未分配的组件明确归属任务、补上 `constant/navigation-tools.ts` 与 `i18n/locales` 等遗漏文件、定义"视频任务样板"的产出物。
- `document_review.md`：补充实际的逐条审查记录，不能只是占位文字。

修改后需重新生成 R2，并重新跑 `validate_documents.py` 和本轮人工核查。

VERDICT: FAIL
