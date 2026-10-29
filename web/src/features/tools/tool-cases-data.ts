import type { ToolCase } from "@/components/tools/tool-cases";

/**
 * B6｜优秀案例数据（AI_OUTPAINTING）。
 *
 * 事实边界：
 * - 唯一一条案例来自本仓库 2026-10-28 的一次真实扩图产物
 *   `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_OUTPAINTING/02-result.png`
 *   （已复制到 `web/public/__acc/cases/`，同源同字节，可 `shasum` 校验）；
 * - 输入参数缩略图同样是该次运行真实上传的 fixture（`web/public/__acc/product-watch.jpg`）；
 * - 提示词/几何取自同次运行的 `01-run.json`，不是编造文案；
 * - 不 clone 原站（LinkFox）案例图：那是别家版权素材，也不能离线持久化。原站案例区**布局/样式/文案/交互**按原站实测 1:1，
 *   **案例内容**用我们自己的真实产物 —— 这一条差异在验收报告里明确标 PARTIAL。
 */
export const AI_OUTPAINTING_CASES: ToolCase[] = [
    {
        id: "local-run-20261028-01",
        result: "/__acc/cases/outpaint-result-1.png",
        params: [{ label: "原图", src: "/__acc/product-watch.jpg" }],
        apply: {
            prompt: "延续灰色水泥地面与柔和侧光，在下方补出完整的产品阴影与投影，保持商品主体不变",
            ratio: "1:1",
            sizePreset: "1024",
            outputNum: 1,
        },
    },
];
