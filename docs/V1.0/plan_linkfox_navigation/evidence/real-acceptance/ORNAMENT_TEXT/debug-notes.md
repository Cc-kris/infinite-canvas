# ORNAMENT_TEXT 非视觉补验 排查记录（2026-10-29）

## 已确认事实
1. UI 标「效果描述（可选）」，但 web/src/features/tools/adapters/ornament-text.ts:126 audit 要求 effect 必填进 prompt
   → 默认空值提交被拦，页面提示「prompt 未带上 effect 参数」，不落任务。（真实缺陷候选）
2. design19-9-nonvisual.mjs 原不注入渠道；3000 origin 持久化配置只有无 key 的 default(api.openai.com)
   → 提交后上游 ETIMEDOUT。已改为 import provider.mjs/applyProviderConfig 注入 keychain CCAI 渠道。
3. keychain 有凭据：ccai_image2_api_key(67) base=https://api.cc-ai.xyz model=gpt-image-2；sf key(51)。
4. 注入后 store 里 imageModel=ccai-accept::gpt-image-2，resolveModelChannel → ccai-accept / cc-ai.xyz（实测 OK）
5. 但真实 POST 仍打 http://127.0.0.1:23210/https://api.openai.com/v1/images/generations → 502。
   即 requestGeneration 拿到的 requestConfig.baseUrl 不是 store 的渠道 base。（待定位 resolveModelRequestConfig）
6. 任务在失败后才落库（早期 40s ETIMEDOUT 后才出现历史任务），故 waitResult 需容忍首条任务延迟。

## 下一步
- 定位 resolveModelRequestConfig（services/api/image.ts）为何给出 api.openai.com。
- 若确认是代码缺陷，记录到报告；验收上直接给页面注入能解析到 cc-ai 的 config。
