import { describe, expect, test } from "bun:test";

import { isBlobImageUrl, isRemoteImageUrl, isUploadedImageReady, isUsableUploadedImageUrl, pickRemoteImageUrl, pickUploadedImageUrl, sourceReferenceUrls } from "./source-asset";

/**
 * P0 回归（2026-10-28）：工具素材库上传后的资产记录当次会话只有 `blob:` 地址，
 * 判定若漏掉 `blob:` 就会出现「上传成功、提交按钮永久禁用 / 仍提示请先上传」。
 * 这里锁住共享口径，再在下面用 6 个真实工具的门禁函数逐一验证同样能吃 blob 源图。
 */

const DATA_URL = "data:image/png;base64,AAAA";
const BLOB_URL = "blob:http://127.0.0.1:3000/7b1c9c1e-0000-4000-8000-000000000000";
const REMOTE_URL = "https://cdn.example.com/product.png";

describe("source-asset 判定口径", () => {
    test("data: / blob: / http(s) 都算可用来源", () => {
        expect(isUsableUploadedImageUrl(DATA_URL)).toBe(true);
        expect(isUsableUploadedImageUrl(BLOB_URL)).toBe(true);
        expect(isUsableUploadedImageUrl(REMOTE_URL)).toBe(true);
    });

    test("空串、空白、相对路径、上游报错串一律不可用", () => {
        for (const value of ["", "   ", "/tools/a.png", "not-a-url", '{"error":"bad gateway"}', undefined, null]) {
            expect(isUsableUploadedImageUrl(value)).toBe(false);
        }
    });

    test("blob / remote 分类互不串味", () => {
        expect(isBlobImageUrl(BLOB_URL)).toBe(true);
        expect(isBlobImageUrl(REMOTE_URL)).toBe(false);
        expect(isRemoteImageUrl(REMOTE_URL)).toBe(true);
        expect(isRemoteImageUrl(BLOB_URL)).toBe(false);
    });

    test("只有 blob 地址时（dataUrl 为空）依然判为已上传", () => {
        const source = { dataUrl: "", url: BLOB_URL };
        expect(pickUploadedImageUrl(source)).toBe(BLOB_URL);
        expect(isUploadedImageReady(source)).toBe(true);
    });

    test("dataUrl 与 url 同时存在时优先 dataUrl", () => {
        expect(pickUploadedImageUrl({ dataUrl: DATA_URL, url: REMOTE_URL })).toBe(DATA_URL);
    });

    test("reference 归一化：dataUrl 保存原始地址，非 data: 时并存 url（blob 由 imageToDataUrl 发送前转换）", () => {
        expect(sourceReferenceUrls({ dataUrl: DATA_URL })).toEqual({ dataUrl: DATA_URL });
        expect(sourceReferenceUrls({ dataUrl: "", url: BLOB_URL })).toEqual({ dataUrl: BLOB_URL, url: BLOB_URL });
        expect(sourceReferenceUrls({ url: REMOTE_URL })).toEqual({ dataUrl: REMOTE_URL, url: REMOTE_URL });
        expect(sourceReferenceUrls({ dataUrl: "  ", url: "" })).toBeNull();
    });

    test("realImageUrl 只接受服务端可达的远端地址（blob 服务端取不到）", () => {
        expect(pickRemoteImageUrl({ dataUrl: DATA_URL, url: REMOTE_URL })).toBe(REMOTE_URL);
        expect(pickRemoteImageUrl({ url: BLOB_URL })).toBe("");
        expect(pickRemoteImageUrl({ url: DATA_URL })).toBe("");
    });
});
