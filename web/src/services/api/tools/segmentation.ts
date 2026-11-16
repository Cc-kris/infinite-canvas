/**
 * 图像分割与蒙版算法服务（BE-SEG01 自动前景抠图 / BE-SEG02 交互式点选分割）
 *
 * 渲染层只负责把源图上传给本地服务，像素运算在主进程完成；
 * 对外仍然返回 PNG File + data URL，调用方无需感知迁移。
 */

import {
    requestAutoSegment,
    requestPointSegment,
    uploadImageSource,
} from "@/services/api/desktop/capabilities/imaging";

export interface SegmentationPoint {
    /** 归一化坐标 0..1 */
    x: number;
    y: number;
    mode: "keep" | "exclude";
}

export interface AutoMattingResult {
    maskFile: File;
    maskDataUrl: string;
    cutoutDataUrl: string;
    width: number;
    height: number;
}

export interface PointSegmentResult {
    maskFile: File;
    maskDataUrl: string;
    coveragePercent: number;
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
    try {
        const blob = await (await fetch(dataUrl)).blob();
        return new File([blob], fileName, { type: "image/png" });
    } catch {
        throw new Error("无法导出分割蒙版 PNG。");
    }
}

/**
 * BE-SEG01：自动主体分割（Auto Matting）
 * 上传图片后自动生成前景黑白蒙版（白=保留主体，黑=背景）以及透明通道抠图预览。
 */
export async function autoSegmentSubjectMask(sourceUrl: string, fileName = "auto-mask.png"): Promise<AutoMattingResult> {
    const source = await uploadImageSource(sourceUrl, "segment-source.png");
    const result = await requestAutoSegment(source.id, fileName);
    return {
        maskFile: await dataUrlToFile(result.maskDataUrl, fileName),
        maskDataUrl: result.maskDataUrl,
        cutoutDataUrl: result.cutoutDataUrl,
        width: result.width,
        height: result.height,
    };
}

/**
 * BE-SEG02：交互式点选分割（点选抠图 / 点选换色）
 * 支持保留点（keep）与排除点（exclude），按颜色连通域实时生成选区蒙版。
 */
export async function interactivePointSegmentMask(input: {
    sourceUrl: string;
    points: SegmentationPoint[];
    tolerance?: number;
    fileName?: string;
}): Promise<PointSegmentResult> {
    const fileName = input.fileName ?? "point-segment-mask.png";
    const source = await uploadImageSource(input.sourceUrl, "point-segment-source.png");
    const result = await requestPointSegment(source.id, input.points, input.tolerance ?? 38);
    return {
        maskFile: await dataUrlToFile(result.maskDataUrl, fileName),
        maskDataUrl: result.maskDataUrl,
        coveragePercent: result.coveragePercent,
    };
}
