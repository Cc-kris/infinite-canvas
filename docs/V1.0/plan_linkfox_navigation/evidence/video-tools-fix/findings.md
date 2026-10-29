# VIDEO_TRANSLATION / VIDEO_CONCAT 修复取证（2026-10-28）

## 环境事实
- bun 在 `~/.bun/bin/bun`（不在 PATH）；node/npm 不可用。
- 基线：`bun test src/features/tools` = 1073 pass / 0 fail。

## 缺陷 1：视频翻译「永久禁用」门禁（已用脚本实证）
`web/src/features/tools/capabilities.ts` 从 registry 静态推导能力需求：
`registry/index.ts` 中 VIDEO_TRANSLATION.lipSync 是 `REQUIRED`，而 `providerCapabilities()` 对 **所有** 通道
（openai / http / plugin / gemini）都返回 `lipSync: "unsupported"`（这些通道确实没有口型同步参数）。

实测（脚本 evaluateToolProvider / canSubmitTool）：
```
openai  blocked=true [lipSync, outputNum]  canSubmit=false
plugin  blocked=true [lipSync]             canSubmit=false
http    blocked=true [lipSync, outputNum]  canSubmit=false
gemini  blocked=true [lipSync, outputNum]  canSubmit=false
```
即：不管页面上「口型同步」开关是开还是关，全局能力门禁恒为 false —— 与用户当前值无关，
无法通过关闭开关解禁，也无法路由到「配音+字幕」路径。这就是「默认口型同步导致永久禁用」。

同时 `registry/index.ts` 的 lipSync `defaultValue: false` 与页面事实（page-specs/38「口型同步默认开启」、
registry/video-translation.ts 默认 true）冲突，是同一门禁的第二处真相来源。

## 缺陷 2：VIDEO_CONCAT 缺口
- 工作台/时间线排序/裁剪/封面/比例/时长/输入校验（`assertVideoConcatInput`）已存在；
- `ToolResult`（下载/保存资产/发送画布/重试）已接；
- **缺** LinkFox 1:1 的「历史复用」：没有 `ToolTaskHistory`，无法从历史任务回填本次配置。

## 测试注意
`capabilities.test.ts:167-169` 断言的是「无值时静态按 spec 必需能力判定」，与新语义
（传入当前表单值后按值判定）需并存：无值上下文仍保持拦截，有值上下文才放行。
