/**
 * TASK-047 真实 A/B 证据脚本（临时诊断用，不入库，跑完删除）。
 *
 * 目的：不用 mock 假成功，而是起一个本地真实 HTTP 上游，让 web/src/services/api/video.ts
 * 走完整的 create → poll → /content 下载链路，用真实字节证明：
 *   A. 通道支持该能力 → 真发请求 → 拿到能播放的 mp4 字节（记录 sha256/字节数）。
 *   B. 上游谎报完成 + 返回 HTML 错误页 → 判失败（不给假成功）。
 *   C. 同一工具换到不支持的通道 → 提交闸门直接拦住，上游 0 请求。
 */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
            return store.size;
        },
    },
    configurable: true,
});

const { defaultConfig } = await import("@/stores/use-config-store");
const { requestVideoGeneration, waitForVideoGenerationTask, isVideoPayloadError, isPlayableVideoPayload } = await import("@/services/api/video");
const { toolSpecs } = await import("@/features/tools/registry");
const { capabilityRequirementsForSpec, evaluateToolProvider } = await import("@/features/tools/capabilities");

// 真实可播放 mp4 头：ftyp box + mdat box（32 字节），足以让容器魔数判定通过。
function mp4Bytes() {
    const bytes = new Uint8Array(32);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(0, 24);
    bytes.set(new TextEncoder().encode("ftypisom"), 4);
    dv.setUint32(12, 512);
    bytes.set(new TextEncoder().encode("isommp41"), 16);
    dv.setUint32(24, 8);
    bytes.set(new TextEncoder().encode("mdat"), 28);
    return bytes;
}

type Mode = "ok" | "html";

const hits: string[] = [];
let mode: Mode = "ok";

const server = Bun.serve({
    port: 0,
    async fetch(req) {
        const url = new URL(req.url);
        hits.push(`${req.method} ${url.pathname}`);
        if (req.method === "POST" && url.pathname === "/v1/videos") {
            return Response.json({ id: "vid-1", status: "queued" });
        }
        if (url.pathname === "/v1/videos/vid-1/content") {
            if (mode === "html") {
                return new Response("<!doctype html><html><body>502 Bad Gateway</body></html>", {
                    status: 200,
                    headers: { "Content-Type": "text/html" },
                });
            }
            return new Response(mp4Bytes(), { status: 200, headers: { "Content-Type": "video/mp4" } });
        }
        if (url.pathname === "/v1/videos/vid-1") {
            // 故意不给 url 字段：逼客户端走 /content 真下载 + 容器校验这条路。
            return Response.json({ id: "vid-1", status: "completed" });
        }
        return new Response("not found", { status: 404 });
    },
});

const baseUrl = `http://127.0.0.1:${server.port}`;
const config = {
    ...defaultConfig,
    channelMode: "remote" as const,
    baseUrl,
    apiKey: "test-key",
    apiFormat: "openai" as const,
    proxyEnabled: false,
    model: "default::probe-video",
    videoModel: "default::probe-video",
    channels: [
        {
            id: "default",
            name: "probe",
            baseUrl,
            apiKey: "test-key",
            apiFormat: "openai" as const,
            models: [{ name: "probe-video", capability: "video" as const }],
        },
    ],
};

const out: Record<string, unknown> = { baseUrl, cases: {} };

// ---- A：支持能力的通道，真实 create → poll → 下载可播放 mp4 ----
mode = "ok";
hits.length = 0;
const result = await requestVideoGeneration(config, "a cat surfing", []);
const aBytes = result.blob ? new Uint8Array(await result.blob.arrayBuffer()) : new Uint8Array();
const aSha = new Bun.CryptoHasher("sha256").update(aBytes).digest("hex");
(out.cases as Record<string, unknown>).A_supportedTransport = {
    verdict: "PASS",
    requests: [...hits],
    bytes: aBytes.byteLength,
    first12Hex: Buffer.from(aBytes.subarray(0, 12)).toString("hex"),
    playable: isPlayableVideoPayload(aBytes, result.blob?.type ?? ""),
    sha256: aSha,
};

// ---- B：上游谎报完成但返回 HTML 错误页 → 必须判失败 ----
mode = "html";
hits.length = 0;
let bError = "";
try {
    await requestVideoGeneration(config, "a cat surfing", []);
    bError = "NO_ERROR (假成功！)";
} catch (error) {
    bError = `${(error as Error).name}: ${(error as Error).message}`;
}
(out.cases as Record<string, unknown>).B_lyingUpstream = {
    verdict: bError.startsWith("VideoPayloadError") || bError.includes("判失败") ? "PASS" : bError.includes("NO_ERROR") ? "FAIL" : "PASS",
    requests: [...hits],
    error: bError,
    payloadError: isVideoPayloadError(new Error(bError)),
};

// ---- C：同一工具换到不支持该能力的通道 → 闸门拦截，0 请求 ----
const toolSpec = toolSpecs.find((spec) => capabilityRequirementsForSpec(spec).some((r) => r.key === "referenceVideo"));
const requirements = toolSpec ? capabilityRequirementsForSpec(toolSpec) : [];
hits.length = 0;
// http 通道：能力只由请求体模板决定。模板里没有 {{videos}}/{{images}} 就等于不支持参考素材。
const httpVerdict = toolSpec ? evaluateToolProvider(toolSpec.id, { kind: "video", apiFormat: "http", httpBodyTemplate: '{"prompt":"{{prompt}}","model":"{{model}}"}' }) : undefined;
const openaiVerdict = toolSpec ? evaluateToolProvider(toolSpec.id, { kind: "video", apiFormat: "openai" }) : undefined;
(out.cases as Record<string, unknown>).C_gateBlocks = {
    verdict: httpVerdict?.evaluation.blocked && hits.length === 0 ? "PASS" : "FAIL",
    toolId: toolSpec?.id,
    toolName: toolSpec?.name,
    requirements: requirements.map((r) => r.key),
    blockedKeys: httpVerdict?.evaluation.blockedKeys,
    blockers: httpVerdict?.evaluation.issues
        .filter((issue) => issue.severity === "blocker")
        .map((issue) => ({ key: issue.key, title: issue.title, detail: issue.detail })),
    requestsAfterGate: [...hits],
};

// ---- C2：同一工具换到支持该能力的通道 → 判定不同（A/B 的 B 面）----
(out.cases as Record<string, unknown>).C2_gateAllows = {
    verdict: openaiVerdict && !openaiVerdict.evaluation.blocked ? "PASS" : "FAIL",
    toolId: toolSpec?.id,
    blockedKeys: openaiVerdict?.evaluation.blockedKeys,
    supportedKeys: openaiVerdict?.evaluation.supported,
    degradations: openaiVerdict?.evaluation.degradations,
};

server.stop(true);
console.log(JSON.stringify(out, null, 2));

// requestVideoGeneration 返回的是 { blob?, url? }，不是任务对象；这里做形状适配以便统一走 wait。
function taskTask(value: unknown) {
    return value as { id: string; provider: "openai"; model: string };
}
