# AI 视频 6 工具 · 1:1 E2E 分组摘要（第二轮补跑）

- 批次目录：`docs/V1.0/e2e-1to1/20261102/`
- 视口：双端 CDP 固定 1600×1000，DPR=1
- 验收时间：2026-11-02
- 只读验收：未改源码、未提交任何生成/购买/删除、未操作既有用户标签
- 每个工具均已补齐 `report.md`（首轮只有截图，无报告）

## 原站入口核对（6/6 均 200，无 404、无重定向）

| 工具 | 原站 URL | 标题 | 本地 URL |
|---|---|---|---|
| IMAGE_TO_VIDEO | /draw/video | 商品视频 - LinkFox | /tools/ai-video/image-to-video |
| SALE_VIDEO | /draw/sale-video | 带货视频 - LinkFox | /tools/ai-video/sale-video |
| VIDEO_REPLICATION | /draw/video-replication | 视频复刻 - LinkFox | /tools/ai-video/video-replication |
| AI_VIDEO_EDITING | /draw/ai-video-edit | 视频编辑 - LinkFox | /tools/ai-video/**ai-video-editing** |
| VIDEO_TRANSLATION | /draw/video-translation | 视频翻译 - LinkFox | /tools/ai-video/video-translation |
| VIDEO_CONCAT | /draw/video-concat | 视频拼接 - LinkFox | /tools/ai-video/video-concat |

## 总判定矩阵

| 工具 | 视觉 | 布局 | 交互 | 功能 | 最严重问题 |
|---|---|---|---|---|---|
| IMAGE_TO_VIDEO | PARTIAL | PASS(P2) | PASS | NOT_RUN | P1 商品链接不解析；P1 缺「普通/高级模式」 |
| SALE_VIDEO | PASS/PARTIAL | PASS(P2) | PASS | NOT_RUN | P1 商品链接分析 disabled；P1 AI帮写为本地模板 |
| VIDEO_REPLICATION | PARTIAL | PASS(P1) | PASS | NOT_RUN | P1 TikTok 链接解析代码级拒绝；P1 三栏 vs 两栏 |
| AI_VIDEO_EDITING | PASS/PARTIAL | PARTIAL | PARTIAL | NOT_RUN | P1 参考图必填严于原站；P1 资产库 63 项撑爆首屏 |
| VIDEO_TRANSLATION | PARTIAL | PASS(P2) | PASS | NOT_RUN | P1 翻译通道未接入；P1 口型同步置灰阻断 |
| VIDEO_CONCAT | PARTIAL | PASS(P2) | PASS | NOT_RUN | P1 非确定性拼接（模型重生成）；P1 封面必填 |

**没有任何一个工具被判功能 PASS**——本轮全部未提交生成任务，功能判定统一为 `NOT_RUN`。页面里出现的历史「已完成」结果均为既有记录，未作为通过证据。

## 五个重点核清项结论

1. **视频翻译专用通道 / 口型**：都不存在。`adapters/video-translation.ts:160-166` 明确上游只吃 prompt；`lipSyncSupported=false` → 开关 `aria-checked=false` 且 `disabled`，提交不带该字段；语言只进提示词。页面用整块黄警示 +「AI 视频重生成」徽标如实披露，未伪装翻译成功。
2. **视频拼接是否确定性**：否。本地只保证「字段装配 + 提示词指令」确定性（`registry/video-concat.ts:15,412`），成片由上游模型按多段 `video[]` 重生成，页面自述「多段是否被上游采用仍取决于中转实现」。无 ffmpeg 本地合成。另：registry 允许 2–10 段，页面文案写 2~4（不一致）。
3. **视频复刻链接解析与脚本分析**：链接解析走 `parsePublicVideoLink`，tiktok/douyin/kuaishou 一律返回 `link-unresolved`（「需服务端解析，当前未接入，请填 .mp4/.mov 直链」），「解析」按钮空值态 disabled。脚本分析能力存在（`analyzeRedisKey` 允许为空，prompt 强校验脚本段），但只能靠手动上传视频触发，原站「粘贴链接→解析→自动分析」主链路断裂。
4. **视频编辑参考图必填差异**：确有差异且已披露。原站「参考图（选填）」，registry `refImageUrls` 非必填；本地 `adapters/ai-video-editing.ts:170` 运行时强制 ≥1 张，抛 `no-reference`；页面校验条原文「本地网关对本工具要求至少 1 张参考图（原站标注选填，当前链路必须 1 张以上）」。
5. **图转视频模式切换**：三来源 tab（参考素材 / 首尾帧 / 商品链接）互切有完整前后差异，必填字段随模式切换（`imageUrl` / `sourceImageUrl` / `productUrl`，且商品链接模式仍需 ≥1 张参考图）；但**原站的「普通模式 / 高级模式」一级切换在本地完全缺失**，被「1.素材/2.配置/3.结果」步骤条替代。

## 跨工具共性缺陷

1. **商品链接分析能力缺失**（IMAGE_TO_VIDEO / SALE_VIDEO 同源）：两页都有输入框 +「分析」按钮，但按钮 disabled 或仅做格式校验，不做抓取解析。
2. **顶栏高 165 vs 原站 110**：6/6 工具本地可用高度少 55px。
3. **实现态泄漏**：面包屑 + 完整路由串、`ljq_driver: 已连接`、内部模型 id（`sub2::MiniMax-H3`、`MiniMax-H3（sub2api）`）、通道名（`通道 openai`）、协议调查记录（`r27 协议调查（提交 1ef24fba）`）直接展示给用户。
4. **壳层缺失**：促销条、算力 350/购买、学习中心、操作咨询/产品教程、水印分组（仅 CONCAT 原站有）在本地全部缺失，另加自造图标组与右侧 Agent 面板。
5. **首屏状态污染**：4/6 工具首屏结果区直接展示历史失败记录（含 S3 404 原文、`provider-failed` 诊断码），观感偏离原站空态。

## 截图索引

每个工具目录下：`orig-01-entry.png`（原站 1600×1000）、`local-01-entry.png`（本地基线）、`local-ix-NN-*.png`（零费用控件点击前后）。
