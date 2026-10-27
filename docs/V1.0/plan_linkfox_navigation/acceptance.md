> 状态：文档基线，**本轮未修改代码**。日期：2026-10-27。  
> 事实来源：`schema_final.json`、真实 `workbench-0vHvVyx6.js`、五类页面 DOM；推断与补充关系均单独标注。

# 验收方案｜五类导航与 39 工具

节点评分：2。当前状态：**文档验收可执行，产品功能全部待实施/待验证**。

## 1. 验收环境与角色

验收人 A 按 PRD 从顶部入口走真实路径；验收人 B 对照 UI/技术方案独立复核。记录 commit、环境、模型、浏览器、资产 ID、任务 ID；不能用开发者口头说明替代。

## 2. 验收门禁

G0 文档专家 PASS + 依赖/Playwright 环境可用；G1 registry/导航/壳；G2 每类真实样板链路；G3 39 工具逐页；G4 批量/恢复/异常；G5 桌面移动/无障碍/回归；G6 独立验证 VERDICT: PASS。任何阻塞都不得写整体验收通过。

| 验收 ID | 对应 REQ/TC | 真实用户路径 | 通过标准 | 证据 | 当前 |
|---|---|---|---|---|---|
| AC-001 | REQ-001 / TC-001 | 从实际入口验证“五类一级菜单顺序、键盘/触屏操作与激活态完整。” | 满足需求且异常路径安全 | `evidence/AC-001.json` | 待实施 |
| AC-002 | REQ-002 / TC-002 | 从实际入口验证“39 个 type 无重复无遗漏，均有独立标题、布局、字段和路由。” | 满足需求且异常路径安全 | `evidence/AC-002.json` | 待实施 |
| AC-003 | REQ-003 / TC-003 | 从实际入口验证“分类页为左工具栏+右内容；原站关系与补充关系可辨识。” | 满足需求且异常路径安全 | `evidence/AC-003.json` | 待实施 |
| AC-004 | REQ-004 / TC-004 | 从实际入口验证“上传支持本地/资产库，校验格式/大小/尺寸，展示进度与取消。” | 满足需求且异常路径安全 | `evidence/AC-004.json` | 待实施 |
| AC-005 | REQ-005 / TC-005 | 从实际入口验证“表单由真实 ToolSpec 驱动，禁止无效字段和静默丢参。” | 满足需求且异常路径安全 | `evidence/AC-005.json` | 待实施 |
| AC-006 | REQ-006 / TC-006 | 从实际入口验证“任务具备 draft/ready/queued/running/succeeded/failed/canceled 状态。” | 满足需求且异常路径安全 | `evidence/AC-006.json` | 待实施 |
| AC-007 | REQ-007 / TC-007 | 从实际入口验证“刷新/断网恢复任务；不得重复提交或重复扣费。” | 满足需求且异常路径安全 | `evidence/AC-007.json` | 待实施 |
| AC-008 | REQ-008 / TC-008 | 从实际入口验证“结果支持预览、下载、保存资产、发送画布；视频支持播放。” | 满足需求且异常路径安全 | `evidence/AC-008.json` | 待实施 |
| AC-009 | REQ-009 / TC-009 | 从实际入口验证“批量支持行级预检、并发上限、部分成功、单行重试和导出报告。” | 满足需求且异常路径安全 | `evidence/AC-009.json` | 待实施 |
| AC-010 | REQ-010 / TC-010 | 从实际入口验证“Provider 不支持参考视频/蒙版/口型等时明确禁用或替代确认。” | 满足需求且异常路径安全 | `evidence/AC-010.json` | 待实施 |
| AC-011 | REQ-011 / TC-011 | 从实际入口验证“Prompt 区分可见输入、模板变量、隐藏编排，不伪造服务端黑盒。” | 满足需求且异常路径安全 | `evidence/AC-011.json` | 待实施 |
| AC-012 | REQ-012 / TC-012 | 从实际入口验证“桌面、平板、移动布局无溢出，键盘焦点和对比度合格。” | 满足需求且异常路径安全 | `evidence/AC-012.json` | 待实施 |
| AC-013 | REQ-013 / TC-013 | 从实际入口验证“既有画布、图片、视频、资产、设置路由不回归。” | 满足需求且异常路径安全 | `evidence/AC-013.json` | 待实施 |
| AC-014 | REQ-014 / TC-014 | 从实际入口验证“所有异常有用户可理解提示、诊断 ID 和安全重试路径。” | 满足需求且异常路径安全 | `evidence/AC-014.json` | 待实施 |
| AC-015 | REQ-015 / TC-015 | 从实际入口验证“原站素材仅作开发基准；生产资产遵守授权和签名 URL 生命周期。” | 满足需求且异常路径安全 | `evidence/AC-015.json` | 待实施 |
| AC-016 | REQ-T01 / TC-016 | 顶部→电商套图→商品套图→输入→配置→任务→结果→资产 | 上传后选择套图组合；结果按视角分组，可单张重做或整组入库；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-016-product-image-suite.json` | 待实施 |
| AC-017 | REQ-T02 / TC-017 | 顶部→电商套图→服装套图→输入→配置→任务→结果→资产 | 服装上传→平台/地区/语言→品牌信息→场景与比例→整组生成；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-017-dress-wear-set.json` | 待实施 |
| AC-018 | REQ-T03 / TC-018 | 顶部→电商套图→套图换色→输入→配置→任务→结果→资产 | 先选套图，再在对比区统一预览；逐张微调不能破坏整组一致性；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-018-change-color-v2.json` | 待实施 |
| AC-019 | REQ-T04 / TC-019 | 顶部→电商套图→批量翻译→输入→配置→任务→结果→资产 | 源/目标语言联动；逐文本框校对；确认后批量应用；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-019-image-translation.json` | 待实施 |
| AC-020 | REQ-T05 / TC-020 | 顶部→电商套图→高清放大→输入→配置→任务→结果→资产 | 倍率、面部增强、质量增强即时反映输出尺寸与限制；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-020-scale-up.json` | 待实施 |
| AC-021 | REQ-T06 / TC-021 | 顶部→电商套图→智能扩图→输入→配置→任务→结果→资产 | 拖拽扩图边界；原图锁定；比例、尺寸与蒙版同步；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-021-ai-outpainting.json` | 待实施 |
| AC-022 | REQ-T07 / TC-022 | 顶部→智能修图→局部重绘→输入→配置→任务→结果→资产 | 画笔/橡皮/羽化；原图与结果并排；可撤销蒙版笔画；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-022-area-repair.json` | 待实施 |
| AC-023 | REQ-T08 / TC-023 | 顶部→智能修图→局部消除→输入→配置→任务→结果→资产 | 仅显示消除所需控件；涂抹预览与前后对比；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-023-remove-pen.json` | 待实施 |
| AC-024 | REQ-T09 / TC-024 | 顶部→智能修图→一键换色→输入→配置→任务→结果→资产 | 区域选择→目标色→光照/重绘选项→对比；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-024-change-color.json` | 待实施 |
| AC-025 | REQ-T10 / TC-025 | 顶部→智能修图→图片裁剪→输入→配置→任务→结果→资产 | 裁剪框、平台预设、自由比例和输出尺寸同步；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-025-image-crop.json` | 待实施 |
| AC-026 | REQ-T11 / TC-026 | 顶部→智能修图→商品精修→输入→配置→任务→结果→资产 | 精修强度、去背景、比例与色彩配置集中显示；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-026-product-refine.json` | 待实施 |
| AC-027 | REQ-T12 / TC-027 | 顶部→智能修图→色差修复→输入→配置→任务→结果→资产 | 选择修复区域，版本与分割结果可追溯；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-027-fix-color.json` | 待实施 |
| AC-028 | REQ-T13 / TC-028 | 顶部→智能修图→印花修复→输入→配置→任务→结果→资产 | 定位印花→修复强度/旋转缩放→局部对比；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-028-printing-repair.json` | 待实施 |
| AC-029 | REQ-T14 / TC-029 | 顶部→智能修图→手部修复→输入→配置→任务→结果→资产 | 人物类型、手部蒙版、输出数量；标注原站即将下架；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-029-hand-repair.json` | 待实施 |
| AC-030 | REQ-T15 / TC-030 | 顶部→商品图设计→商品图→输入→配置→任务→结果→资产 | 商品上传→抠图确认→场景模板或自定义→结果网格；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-030-new-replace-bg-v2.json` | 待实施 |
| AC-031 | REQ-T16 / TC-031 | 顶部→商品图设计→商品替换→输入→配置→任务→结果→资产 | 目标商品与新商品双输入；位置、缩放、旋转和蒙版可视化；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-031-replace-goods.json` | 待实施 |
| AC-032 | REQ-T17 / TC-032 | 顶部→商品图设计→场景裂变→输入→配置→任务→结果→资产 | 模式、场景词、强度、尺寸、Provider 能力与输出数量联动；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-032-product-scene.json` | 待实施 |
| AC-033 | REQ-T18 / TC-033 | 顶部→商品图设计→手持商品→输入→配置→任务→结果→资产 | 模特/场景/商品类别选择，商品与目标区域双预览；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-033-handheld-goods.json` | 待实施 |
| AC-034 | REQ-T19 / TC-034 | 顶部→商品图设计→AI穿衣→输入→配置→任务→结果→资产 | 分步选择服装部位；原图/蒙版/结果状态可回溯；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-034-ai-dressing-v2.json` | 待实施 |
| AC-035 | REQ-T20 / TC-035 | 顶部→商品图设计→姿势裂变→输入→配置→任务→结果→资产 | 人物上传→姿势/标签→Prompt→多结果选择；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-035-ai-posture.json` | 待实施 |
| AC-036 | REQ-T21 / TC-036 | 顶部→商品图设计→AI穿戴→输入→配置→任务→结果→资产 | 穿戴部位、品类、模特与目标蒙版联动；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-036-ai-wearable.json` | 待实施 |
| AC-037 | REQ-T22 / TC-037 | 顶部→商品图设计→POD素材→输入→配置→任务→结果→资产 | 模式/风格/平铺/自动Prompt/变化强度分组配置；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-037-ai-text.json` | 待实施 |
| AC-038 | REQ-T23 / TC-038 | 顶部→商品图设计→饰品文字→输入→配置→任务→结果→资产 | 文字内容、字体、字号和左右区域参数实时预览；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-038-ornament-text.json` | 待实施 |
| AC-039 | REQ-T24 / TC-039 | 顶部→商品图设计→素材贴合→输入→配置→任务→结果→资产 | 商品与素材多选；贴合对象和输出预览一一对应；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-039-sds-design.json` | 待实施 |
| AC-040 | REQ-T25 / TC-040 | 顶部→商品图设计→印花提取→输入→配置→任务→结果→资产 | 透明背景开关与原图/提取结果对比；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-040-print-extract.json` | 待实施 |
| AC-041 | REQ-T26 / TC-041 | 顶部→商品图设计→AI姿势生成→输入→配置→任务→结果→资产 | 场景 Prompt 列表与主 Prompt 分层编辑；补充工具标识；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-041-ai-pose-generator.json` | 待实施 |
| AC-042 | REQ-T27 / TC-042 | 顶部→商品图设计→AI试衣XSY→输入→配置→任务→结果→资产 | 步骤条、服装/模特输入、Provider 与版本能力检查；补充工具；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-042-ai-dressing-xsy.json` | 待实施 |
| AC-043 | REQ-T28 / TC-043 | 顶部→商品图设计→场景裂变链接→输入→配置→任务→结果→资产 | 单图输入和数量控制；与 PRODUCT_SCENE 区分，不混用契约；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-043-fission-link.json` | 待实施 |
| AC-044 | REQ-T29 / TC-044 | 顶部→商品图设计→图片文字编辑→输入→配置→任务→结果→资产 | 画布文本框选择、内容编辑、尺寸保持和结果回写；补充工具；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-044-image-text-edit.json` | 待实施 |
| AC-045 | REQ-T30 / TC-045 | 顶部→商品图设计→上装换料→输入→配置→任务→结果→资产 | 上装与材质分类联动；抠图开关和数量配置；补充工具；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-045-material-upper-body.json` | 待实施 |
| AC-046 | REQ-T31 / TC-046 | 顶部→商品图设计→商品图设计器→输入→配置→任务→结果→资产 | 设计器宿主、返回/完成回调、草稿恢复；不是普通生成表单；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-046-new-designer.json` | 待实施 |
| AC-047 | REQ-T32 / TC-047 | 顶部→商品图设计→商品营销素材→输入→配置→任务→结果→资产 | 平台、销售地区、品牌、A+比例与模板组合；补充工具；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-047-product-market-material.json` | 待实施 |
| AC-048 | REQ-T33 / TC-048 | 顶部→商品图设计→场景迁移→输入→配置→任务→结果→资产 | 商品图+风格参考图双输入，相似度连续调节；补充工具；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-048-scene-transfer.json` | 待实施 |
| AC-049 | REQ-T34 / TC-049 | 顶部→AI视频→图转视频→输入→配置→任务→结果→资产 | 首帧/首尾帧、参考素材、时长/比例/清晰度/音频分步配置；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-049-image-to-video.json` | 待实施 |
| AC-050 | REQ-T35 / TC-050 | 顶部→AI视频→带货口播→输入→配置→任务→结果→资产 | 商品信息、可见Prompt、隐藏Prompt、语言/地区与视频参数；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-050-sale-video.json` | 待实施 |
| AC-051 | REQ-T36 / TC-051 | 顶部→AI视频→视频复刻→输入→配置→任务→结果→资产 | 视频上传→片段裁剪→分析→替换素材→目标语言与输出；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-051-video-replication.json` | 待实施 |
| AC-052 | REQ-T37 / TC-052 | 顶部→AI视频→视频编辑→输入→配置→任务→结果→资产 | 源视频、参考图、编辑Prompt、时长和视频类型联动；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-052-ai-video-editing.json` | 待实施 |
| AC-053 | REQ-T38 / TC-053 | 顶部→AI视频→视频翻译→输入→配置→任务→结果→资产 | 源/目标语言、口型同步能力检查、输出数量和播放器对比；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-053-video-translation.json` | 待实施 |
| AC-054 | REQ-T39 / TC-054 | 顶部→AI视频→视频拼接→输入→配置→任务→结果→资产 | 时间线排序、片段裁剪、封面、比例与总时长；补充工具；无丢参；失败可恢复；enabled=true 时真实结果入库；enabled=false 时本项 BLOCKED 且禁止整体验收 PASS | `evidence/AC-054-video-concat.json` | 待实施 |
| AC-055 | REQ-002 / TC-055 | 非法路由与跨类激活：访问非法 category/toolId，再切换合法工具 | 404 可恢复；菜单/侧栏/面包屑一致 | `evidence/AC-055.json` | 待实施 |
| AC-056 | REQ-010 / TC-056 | Provider 缺参考视频能力：选择不支持参考视频的模型并上传参考视频 | 明确禁用或确认替代，不上传后静默丢弃 | `evidence/AC-056.json` | 待实施 |
| AC-057 | REQ-007 / TC-057 | 提交超时防重复：模拟请求已到达但响应超时，刷新页面 | 先恢复/查询原任务，不重复创建 | `evidence/AC-057.json` | 待实施 |
| AC-058 | REQ-009 / TC-058 | 批量部分失败：真实批量样本含合法与非法行 | 合法行完成、非法行预检；失败行独立重试 | `evidence/AC-058.json` | 待实施 |
| AC-059 | REQ-012 / TC-059 | 移动与键盘：375/768/1440 宽度与纯键盘遍历 | 无横向溢出；焦点返回；Drawer 可关闭 | `evidence/AC-059.json` | 待实施 |
| AC-060 | REQ-005 / TC-060 | 空字段契约阻断：对 NEW_REPLACE_BG_V2 未回查动态契约时尝试提交 | 不得按空 payload 提交，显示能力未准备 | `evidence/AC-060.json` | 待实施 |
| AC-061 | REQ-006 / TC-061 | 设计器宿主恢复：NEW_DESIGNER 编辑后关闭/恢复 | onDone/onClose 与草稿恢复明确，不伪装成生成任务 | `evidence/AC-061.json` | 待实施 |
| AC-062 | REQ-004 / TC-062 | 套图文件大小边界：准备 0B、10MB、10MB+1B 三个本地 PNG | 0B 与 10MB+1B 拒绝并说明；10MB 进入尺寸校验 | `evidence/AC-062.json` | 待实施 |
| AC-063 | REQ-004 / TC-063 | 套图尺寸边界：准备 383×384、384×384、4096×4096、4097×4096 PNG | 仅满足 384–4096 像素范围进入下一步；边界外可定位错误 | `evidence/AC-063.json` | 待实施 |
| AC-064 | REQ-007 / TC-064 | 多标签恢复与心跳：两个标签打开同一任务；阻断心跳 90s 后恢复 | 单标签负责写；状态 unknown 后先查询；无重复任务 | `evidence/AC-064.json` | 待实施 |

## 3. 视觉验收清单

五类顺序、二级菜单、184px 侧栏、配置/结果双栏、39 页差异化、无限画布令牌、深色模式、375/768/1440 宽度、键盘焦点、文本溢出、空/加载/失败/成功。无真实页面证据不得声明 UI 完成。

## 4. 文档交付验收（本轮）

- [x] PRD/UI/技术/测试/验收/任务清单齐全。
- [ ] 独立专家 R2 最新审核全部 PASS（report 文件和 document_review.md 均有 VERDICT）。
- [ ] 自动校验 39 唯一、39 路由、39 PRD/UI/TECH 章节、REQ/TC/AC 覆盖、链接有效。

## 5. 最终交付声明模板

只有所有 AC 有证据且独立验证 PASS，才能声明“39 工具复刻完成”。否则逐项列出未接 Provider、BLOCKED、UI 差异和后续任务。
- [x] 文档 R2：产品/UI 与技术/测试独立审核均 PASS；报告和本索引均可追溯。
