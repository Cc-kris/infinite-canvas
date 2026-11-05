import type { ToolCase } from "@/components/tools/tool-cases";

/**
 * 「视频复刻」优秀案例（真实数据，非伪造）。
 *
 * 来源：LinkFox 原站 `/image/make-case/list?type=89` 真实回包
 *   → `docs/analysis/assets/linkfox/make_cases.json.gz` key "89"（tool=VIDEO_REPLICATION, total=8）。
 * 覆盖图 `result` 与成片 `videoSrc` 直连原站公网 CDN
 *   （实测 2026-11-01：8/8 条 cover 与 main_result HEAD 全部 HTTP 200）。
 *
 * 诚实边界：案例的输入素材（refImageList / imageList / refVideoUrl）是 OSS 签名 URL，
 *   实测已 403 过期；因此「做同款」只回填真实脚本 + 真实比例/分辨率/时长，
 *   不拿别的图/视频顶替参考输入，与 image-to-video-cases-data.ts 同一口径。
 */

export type VideoReplicationCaseApply = {
    /** 原站真实分镜脚本（promptTranslation，英文） */
    prompt: string;
    /** 原站 aspectRatio（extendFields.ratio），如 9:16 */
    ratio: string;
    /** 原站 resolution（extendFields.resolution），如 720P */
    resolution: string;
    /** 原站 videoTime（秒，extendFields.videoTime） */
    videoTime: string;
};

export type VideoReplicationCase = ToolCase & { apply: VideoReplicationCaseApply };

type RawCase = {
    id: string;
    imageUrl: string;
    mainResultUrl: string;
    promptTranslation?: string;
    extendFields?: { ratio?: string; resolution?: string; videoTime?: number };
};

function toCase(raw: RawCase): VideoReplicationCase {
    return {
        id: raw.id,
        result: raw.imageUrl,
        video: true,
        videoSrc: raw.mainResultUrl,
        params: [],
        apply: {
            prompt: raw.promptTranslation ?? "",
            ratio: raw.extendFields?.ratio ?? "9:16",
            resolution: raw.extendFields?.resolution ?? "720P",
            videoTime: String(raw.extendFields?.videoTime ?? 15),
        },
    };
}

/* 逐字取自 make_cases.json key "89"（8 条全部收录；顺序即原站 sort）。 */
const RAW_CASES: RawCase[] = [
    {
        id: "2077742382737195008",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742382737195008/image.jpg",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742382737195008/main_result_4394d3ffac624229b00cac5615da9a62.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
    {
        id: "2077742200305942528",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742200305942528/image.png",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742200305942528/main_result_dbbc07ae583a4af8ba91ca4d9d681aa2.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
    {
        id: "2077742088984920064",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742088984920064/image.webp",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077742088984920064/main_result_7ac7eb09547c4789a9281a59c9034c56.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
    {
        id: "2077741640857092096",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741640857092096/image.jpg",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741640857092096/main_result_a13a3dd504334fa381ae25e5475b952f.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
    {
        id: "2077741421771816960",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741421771816960/image.jpg",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741421771816960/main_result_f321bdbcb38144bd8e12df00681c5499.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
    {
        id: "2077741173448048640",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741173448048640/image.jpg",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077741173448048640/main_result_3160b5b9341540bebf6f6525b5dd4bfb.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
    {
        id: "2065069943115792384",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2065069943115792384/image.jpeg",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2065069943115792384/main_result_6bf61931b7374ff1b48c689651a2e351.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
    {
        id: "2077729562469183488",
        imageUrl: "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077729562469183488/image.jpg",
        mainResultUrl:
            "https://file-ai.linkfox.com/UPLOAD/MANAGE/CASE/VIDEO_RECLONE/2077729562469183488/main_result_b16464d9cb2b4fc8b4a7f39051fc0f81.mp4",
        extendFields: { ratio: "9:16", resolution: "720P", videoTime: 15 },
    },
];

/** 原站该接口路径与 type（回归守卫 case-module-copy.test.ts 锁定的功能字段）。 */
export const VIDEO_REPLICATION_CASE_SOURCE = "/image/make-case/list?type=89" as const;

export const VIDEO_REPLICATION_CASES: VideoReplicationCase[] = RAW_CASES.map(toCase);
