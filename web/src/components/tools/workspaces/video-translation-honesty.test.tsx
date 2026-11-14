import { renderToStaticMarkup } from "react-dom/server";

import { VideoTranslationDraftBadge, VideoTranslationHonestyNotice, videoTranslationHonestyCopy } from "./video-translation-honesty";

const copy = {
    ...videoTranslationHonestyCopy(),
    noticeTitle: "原片译制：只替换音轨并保留字幕时间轴",
    noticeBody: "ASR 转录、文本模型逐句翻译、TTS 配音，原视频画面复制后重新封装。",
    noticeBasis: "ASR、文本模型、TTS 任一未配置或失败都会停止，不返回伪结果。",
    resultBadge: "原片译制 · 请核对译文与配音",
};

describe("视频翻译原片管线能力说明", () => {
    test("区分原片译制与 AI 重生成", () => {
        const html = renderToStaticMarkup(<VideoTranslationHonestyNotice copy={copy} />);
        expect(html).toContain('data-capability="source-preserving-translation"');
        expect(html).toContain("ASR 转录");
        expect(html).toContain("原视频画面");
        expect(html).toContain("失败都会停止");
        expect(html).not.toContain("未验证翻译");
    });

    test("结果要求人工校对，不宣称口型同步", () => {
        const html = renderToStaticMarkup(<VideoTranslationDraftBadge copy={copy} />);
        expect(html).toContain('data-capability="source-preserving-translation-result"');
        expect(html).toContain("请核对译文与配音");
        expect(html).not.toContain("已对口型");
    });
});
