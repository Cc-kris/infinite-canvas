# 给语言组（VIDEO_TRANSLATION）：真实中文语音测试素材已就绪 — r27

**绝对路径（直接当源片上传用）**

```
/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/fixtures/zh-speech-r27/zh-speech-djibouti-7s.mp4
```

- 7.400s，1280×720，h264 + aac，104,361 B（约 102KB）
- sha256 `7e4ab7c205efcf37fca50fdc719a919f2745b7ea7d749811df22ccb96f049ec9`
- 内容：**真人中文朗读**（Wikimedia Commons「吉布提」中文有声条目，CC BY-SA 4.0，作者 Carrotkit），画面为纯色静态帧、**无任何文字**，避免画面文字干扰音轨判定。

## 已实测证据（可直接引用）

| 检查 | 结果 |
|---|---|
| Silero VAD 语音覆盖 | **0.934**（段 [0.16,5.40] + [5.73,7.40]，最大间隙 0.33s） |
| 语种识别 | zh，**p = 1.000** |
| ASR 转写 | `暴震的人類發展指數在全世界186個國家和地區之中外列165位` → 规范化为「吉布提的人类发展指数在全世界186个国家和地区之中位列第165位」 |
| 原文交叉核对 | zh.wikipedia「吉布提」§医疗：「…吉人类发展指数在全世界186个国家和地区中列第165位」→ 186/165 完全吻合，证明是真人朗读而非合成 |
| 画面恒定 | t=1s 与 t=5s 帧 md5 相同 `1f749cee0dd5b9e788f2500cb881e615` |

## 与你们 r26 的关系（不重复劳动）

- 你们 r26 用 `evidence/real-acceptance/SALE_VIDEO/r12-downloaded.mp4`（**英文**真人声 6.592s）验「语言契约是否压住朗读提示词」，最新产出 `reports/vt-language-r26/artifacts/04-result.mp4` 实测音轨仍为英文 TTS。
- 我已扫描仓库全部 17 个唯一 mp4（结果见本目录 `repo-scan.json`）：**没有任何一段是真人中文语音**（中文音轨全是模型把提示词当台词念的胡话）。故本 fixture 是新增补充，不是重复下载。

## 建议用法与判据

1. 源片用本 fixture，目标语言选 `en-US`（或 ja-JP 做第二例）。
2. 期望：成片音轨为目标语言，语义对应上面那句（含 186 / 165 两个数字）；**不得**保留中文原声、**不得**朗读提示词、**不得**出现画面文字。
3. 反向判据（任一命中即语言契约失效）：成片仍是中文 / 仍是提示词内容 / 只复述画面描述 / 静音。
4. 归因：若在报告里引用，请保留来源与许可（File:Djibouti - Chinese spoken article (3 out of 3).ogg, Carrotkit, CC BY-SA 4.0）+ 本仓库做了「截取 140.65–148.05s + 重采样 + 配静态帧」的改动说明。

细节与复现命令见同目录 `REPORT.md` / `manifest.json`。
