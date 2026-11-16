/** 视觉商品分析与 AI 文案：提示词、JSON 解析与无模型兜底都在主进程完成。 */
import { callTextModel } from "../providers/text.mjs";

function hasTextModel(config) {
    return Boolean(String(config?.model || "").trim() && String(config?.baseUrl || "").trim() && String(config?.apiKey || "").trim());
}

function parseVisionAnswer(raw) {
    const cleaned = String(raw || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
        const parsed = JSON.parse(cleaned);
        const productName = typeof parsed.productName === "string" ? parsed.productName.trim() : "";
        const sellingPoints = Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.map((item) => String(item).trim()).filter(Boolean) : [];
        const audience = typeof parsed.audience === "string" ? parsed.audience.trim() : "";
        const marketLanguage = typeof parsed.marketLanguage === "string" ? parsed.marketLanguage.trim() : "中文";
        const categoryId = typeof parsed.categoryId === "string" ? parsed.categoryId.trim() : undefined;
        const formattedLines = [
            productName ? `产品名称：${productName}` : "",
            sellingPoints.length ? `核心卖点：${sellingPoints.join("；")}` : "",
            audience ? `适用人群：${audience}` : "",
            marketLanguage ? `目标市场语言：${marketLanguage}` : "",
        ].filter(Boolean);
        return { productName, categoryId, sellingPoints, audience, marketLanguage, formattedText: formattedLines.join("\n") || String(raw).trim() };
    } catch {
        if (!String(raw || "").trim()) return null;
        return { productName: "", sellingPoints: [String(raw).trim()], audience: "", marketLanguage: "中文", formattedText: String(raw).trim() };
    }
}

function fallbackVision(input) {
    const text = String(input.currentText || "").trim();
    const lines = text.split(/[\n。；;，,]+/).map((line) => line.trim()).filter(Boolean);
    const sellingPoints = lines.slice(0, 4);
    const matchedCategory = input.categories?.find((category) => text.includes(category.label))?.id ?? input.categories?.[0]?.id;
    const formattedLines = [
        lines[0] ? `产品名称：${lines[0]}` : "产品名称：主推商品",
        sellingPoints.length ? `核心卖点：${sellingPoints.join("；")}` : "核心卖点：质感细节展示；核心功能突出；多场景适用",
        "适用人群：品质生活及电商目标消费群体",
        "目标市场语言：中文",
    ];
    return {
        productName: lines[0] ?? "主推商品",
        categoryId: matchedCategory,
        sellingPoints: sellingPoints.length ? sellingPoints : ["质感细节展示", "核心功能突出", "多场景适用"],
        audience: "品质生活及电商目标消费群体",
        marketLanguage: "中文",
        formattedText: formattedLines.join("\n"),
    };
}

export async function analyzeVision(ctx, input, signal) {
    const config = input.config || {};
    if (!hasTextModel(config)) return fallbackVision(input);

    const categoryHint = input.categories?.length
        ? `可选类目枚举（categoryId 只能从中选最接近的一项）：${input.categories.map((category) => `${category.id}=${category.label}`).join("、")}。`
        : "";
    const systemPrompt = [
        "你是资深跨境电商视觉与选品分析师。请观察用户上传的商品图片（及已填写的补充信息），识别商品特征并输出严格 JSON 对象，不要包含代码块标记：",
        '{"productName":"商品名称","categoryId":"匹配的类目id","sellingPoints":["核心卖点1","核心卖点2","核心卖点3"],"audience":"适用人群","marketLanguage":"目标市场语言（如中文/英文）"}',
        categoryHint,
    ]
        .filter(Boolean)
        .join("\n");

    const userContent = [
        {
            type: "text",
            text: input.currentText?.trim() ? `请结合这张商品图与以下已有描述分析商品信息：\n${input.currentText.trim()}` : "请分析这张商品图的名称、类目、核心卖点、适用人群与目标市场语言。",
        },
    ];
    if (String(input.imageUrl || "").trim()) userContent.push({ type: "image_url", image_url: { url: String(input.imageUrl).trim() } });

    const result = await callTextModel(
        ctx,
        config,
        [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
        ],
        { signal },
    );
    return parseVisionAnswer(result.content) ?? fallbackVision(input);
}

export async function writeMarketingCopy(ctx, input, signal) {
    const config = input.config || {};
    const instructions = {
        "sale-script": `请根据商品信息生成一段约 ${input.durationSeconds ?? 15} 秒的${input.language ?? "中文"}电商带货短视频口播脚本与分镜画面提示词（含黄金前3秒痛点引入、核心卖点展示、使用场景与收尾转化引导）。直接输出脚本正文，不要寒暄。`,
        "video-prompt": `请将以下视频创意或画面描述优化为专业、细节丰富的 AI 视频生成提示词（包含主体动作、镜头运镜、光影氛围与材质细节，输出语言：${input.language ?? "中文"}）。直接输出优化后的提示词正文。`,
        "outpainting-prompt": "请根据原图画面与补充词，生成适合智能扩图（Outpainting）的四周延展背景与光影衔接描述词。直接输出精炼提示词。",
    };

    if (hasTextModel(config)) {
        const userText = [input.productInfo?.trim(), input.currentDraft?.trim()].filter(Boolean).join("\n") || "电商主推商品展示";
        const content = [{ type: "text", text: `${instructions[input.mode]}\n\n【输入信息】\n${userText}` }];
        if (String(input.imageUrl || "").trim()) content.push({ type: "image_url", image_url: { url: String(input.imageUrl).trim() } });
        const result = await callTextModel(
            ctx,
            config,
            [
                { role: "system", content: "你是专业的电商视觉导演与 AI 提示词工程师。直接输出最终可用的脚本或提示词文本。" },
                { role: "user", content },
            ],
            { signal },
        );
        if (result.content?.trim()) return result.content.trim();
    }

    const seed = [input.productInfo?.trim(), input.currentDraft?.trim()].filter(Boolean).join("，") || "精选电商好物";
    if (input.mode === "sale-script") {
        return `【0-3s 吸睛开场】近景特写展示${seed}细节，自然光柔和打亮主体。\n【3-10s 卖点演绎】中景多角度展示核心卖点与真实使用状态，运镜平稳推进。\n【10-${input.durationSeconds ?? 15}s 转化收尾】全身/全景定格展示整体质感，引导下单体验。`;
    }
    if (input.mode === "outpainting-prompt") {
        return `${seed}，自然延展画面边缘环境与桌面光影，保持透视与色调一致，高清细节`;
    }
    return `${seed}，商业摄影级布光，主体清晰稳定，平稳推轨镜头，自然景深，高画质细节呈现`;
}
