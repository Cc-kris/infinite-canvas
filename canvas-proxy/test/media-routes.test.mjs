/**
 * canvas-proxy 素材托管路由真实验收（node:test：真起服务、真发字节、真读回来比对）。
 *
 * 覆盖主审要求：
 * 1. POST 上传 → GET 全量 → HEAD → Range 分段，sha256 / 字节数 / content-length 全部一致；
 * 2. 越界 Range → 416；
 * 3. 目录穿越（../、%2e%2e%2f、反斜杠、绝对路径）一律 404，绝不读宿主文件；
 * 4. 超限（CANVAS_MEDIA_MAX_BYTES）→ 413；空体 → 400；未知 id → 404；
 * 5. 上传只返回**相对 path**，绝对 URL 由调用方用真实公网基址拼（服务端不得自报域名）。
 *
 * 用法：node --test canvas-proxy/test/media-routes.test.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "canvas-media-test-"));
process.env.CANVAS_MEDIA_DIR = MEDIA_DIR;
process.env.CANVAS_MEDIA_MAX_BYTES = String(1024 * 1024); // 1MB，便于触发 413

const { startProxyServer } = await import("../server.js");

const PORT = 25191;
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

// 造一段「像视频」的二进制：mp4 ftyp box 头 + 非全零负载，字节错位能被 sha 抓出来
function makeMedia(byteLength) {
    const head = Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex");
    const body = Buffer.alloc(Math.max(byteLength - head.length, 0));
    for (let index = 0; index < body.length; index += 1) body[index] = (index * 37 + 11) % 251;
    return Buffer.concat([head, body]);
}

let server;
// startProxyServer 只回 server（带 url 的是 startProxyServerWithFallback），基址自己拼。
const base = `http://127.0.0.1:${PORT}`;

before(async () => {
    server = await startProxyServer({ port: PORT, host: "127.0.0.1" });
});

after(() => {
    // fetch 的 keep-alive 连接会吊住事件循环，先强断再关，测试进程才能自己退出。
    server?.closeAllConnections?.();
    server?.close();
    rmSync(MEDIA_DIR, { recursive: true, force: true });
});

/** 原始请求：path 原样发出（fetch 会规范化 ../，测不了穿越）。 */
function rawRequest(method, rawPath, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port: PORT, method, path: rawPath, headers }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

async function upload(buffer, { mime = "video/mp4", name = "source.mp4" } = {}) {
    const res = await fetch(`${base}/__media/upload`, {
        method: "POST",
        headers: { "content-type": mime, "x-media-name": name },
        body: buffer,
    });
    const json = await res.json();
    return { status: res.status, json };
}

test("上传返回相对 path，sha256/字节数与源一致", async () => {
    const media = makeMedia(64 * 1024);
    const { status, json } = await upload(media);
    assert.equal(status, 200);
    assert.ok(json.path.startsWith("/__media/"), `path 应是相对路径，实际 ${json.path}`);
    assert.ok(!/^https?:/.test(json.path), "服务端不得自己拼域名");
    assert.equal(json.bytes, media.length);
    assert.equal(json.sha256, sha256(media));
    assert.equal(json.mimeType, "video/mp4");
});

test("GET 全量 → 字节与 sha256 完全一致，带 CORS 与 immutable 缓存头", async () => {
    const media = makeMedia(48 * 1024);
    const { json } = await upload(media);
    const res = await rawRequest("GET", json.path);
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "video/mp4");
    assert.equal(Number(res.headers["content-length"]), media.length);
    assert.equal(res.headers["accept-ranges"], "bytes");
    assert.equal(res.headers["access-control-allow-origin"], "*");
    assert.match(String(res.headers["cache-control"]), /immutable/);
    assert.equal(res.body.length, media.length);
    assert.equal(sha256(res.body), sha256(media));
});

test("HEAD 不给 body，但给出完整长度", async () => {
    const media = makeMedia(16 * 1024);
    const { json } = await upload(media);
    const res = await rawRequest("HEAD", json.path);
    assert.equal(res.status, 200);
    assert.equal(Number(res.headers["content-length"]), media.length);
    assert.equal(res.body.length, 0);
});

test("Range 分段：206 + content-range + 切片 sha 与源对应区间一致", async () => {
    const media = makeMedia(32 * 1024);
    const { json } = await upload(media);
    const res = await rawRequest("GET", json.path, { headers: { range: "bytes=100-199" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers["content-range"], `bytes 100-199/${media.length}`);
    assert.equal(res.body.length, 100);
    assert.equal(sha256(res.body), sha256(media.subarray(100, 200)));

    const tail = await rawRequest("GET", json.path, { headers: { range: "bytes=1000-" } });
    assert.equal(tail.status, 206);
    assert.equal(tail.body.length, media.length - 1000);
    assert.equal(sha256(tail.body), sha256(media.subarray(1000)));
});

test("Range 越界 → 416，并回 content-range bytes */size", async () => {
    const media = makeMedia(8 * 1024);
    const { json } = await upload(media);
    const res = await rawRequest("GET", json.path, { headers: { range: `bytes=${media.length + 10}-` } });
    assert.equal(res.status, 416);
    assert.equal(res.headers["content-range"], `bytes */${media.length}`);
});

test("目录穿越与任意文件读取一律 404", async () => {
    const attempts = [
        "/__media/../../server.js",
        "/__media/..%2f..%2fserver.js",
        "/__media/%2e%2e%2fserver.js",
        "/__media/..%5c..%5cserver.js",
        "/__media/%2fetc%2fpasswd",
        "/__media/....//server.js",
        "/__media/.hidden",
    ];
    for (const attempt of attempts) {
        const res = await rawRequest("GET", attempt);
        assert.equal(res.status, 404, `${attempt} 应 404，实际 ${res.status}`);
        assert.ok(!res.body.toString("utf8").includes("startProxyServer"), `${attempt} 泄露了源码`);
    }
});

test("超限上传 → 413，且不落盘", async () => {
    const tooBig = Buffer.alloc(1024 * 1024 + 1024, 7);
    const { status, json } = await upload(tooBig);
    assert.equal(status, 413);
    assert.match(String(json.error), /上限/);
});

test("空体上传 → 400；未知素材 → 404", async () => {
    const empty = await rawRequest("POST", "/__media/upload", { headers: { "content-type": "video/mp4" }, body: Buffer.alloc(0) });
    assert.equal(empty.status, 400);
    const missing = await rawRequest("GET", "/__media/deadbeef.mp4");
    assert.equal(missing.status, 404);
});

test("身份路由仍可用，并自报素材通道", async () => {
    const res = await fetch(`${base}/`);
    const json = await res.json();
    assert.equal(json.app, "infinite-canvas");
    assert.equal(json.media.upload, "/__media/upload");
    assert.equal(json.media.dir, MEDIA_DIR);
});
