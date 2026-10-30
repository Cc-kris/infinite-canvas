# 四闸复验（c72d6dc6 · VT 语言硬契约）

- PIN：`c72d6dc6` fix(video-translation): BCP-47 语言硬契约 + 禁止朗读提示词/编造旁白
- 分支：`feat/linkfox-v1-real`
- 执行：主会话本机直跑（非 worker），日志见 `gate.log`

## 结果

| 闸 | 命令 | 结果 |
| --- | --- | --- |
| 1 单测 | `cd web && bun test` | **1582 pass / 0 fail**，8681 expect，95 文件，11.74s |
| 2 类型 | `cd web && bun run typecheck` | **通过**（`tsc --noEmit` 无输出） |
| 3 构建 | `cd web && bun run build` | **通过**，`✓ built in 2m 53s`；仅 chunk >500kB 提示（既有） |
| 4 定向 | `bun test src/features/tools/adapters/video-translation.test.ts` | **43 pass / 0 fail** |

## 矩阵状态（继承 R31 `2b52ba02`）

39 工具 × 六维 = 234 单元，非全绿仍为 **1 项**：`VIDEO_TRANSLATION.F`。

原因（本轮实测补强，见 `project_memory.md` 2026-10-30 r33 段）：
- 上游 `/v1/videos` **无 `target_language` 字段**，语言只能靠提示词约束 → 已用 BCP-47 硬契约 + 禁朗读规则收窄；
- LinkFox 真实链路走 **SEED_V25** 视频翻译模型，**本机已配置渠道均未开通**：CCAI 仅 3 个图像模型；SiliconFlow 98 个模型中无视频翻译模型。
- 因此 `F`（功能真实可用）无法在现有渠道下取得真实译制成片，属外部能力阻断，不是代码缺陷。

## 可选的收口路径（待决策）

1. **保持现状**：工具在渠道缺模型时诚实阻断并给出说明；矩阵 233/234 PASS。
2. **本地兜底译制**：SiliconFlow 已具备 ASR（Qwen3-ASR/SenseVoice）+ MT（Hunyuan-MT-7B）+ TTS（CosyVoice2），可在浏览器内用 `decodeAudioData` 取音轨、`OfflineAudioContext` 拼译音、`canvas.captureStream + MediaRecorder` 重编码出片；音色与口型不等同原产品。
3. **等渠道开通 SEED_V25**：仅需在设置里换用支持该模型的 key/中转，代码侧已就绪（`video-translation-seed-v25.ts` + 网关闸门 + JSON 提交）。
