/** 商品页读取与链接解析：主进程 fetch + linkedom，渲染层不再持有 HTML 解析实现。 */
import { parseHTML } from "linkedom";

import { HttpError } from "../http.mjs";
import { fetchUpstream, upstreamErrorFromResponse } from "../providers/shared.mjs";

function requireHttpUrl(raw, message) {
    let parsed;
    try {
        parsed = new URL(String(raw || "").trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
        throw new HttpError(400, "invalid-link", message);
    }
    return parsed;
}

async function loadHtml(ctx, rawUrl, signal) {
    const parsed = requireHttpUrl(rawUrl, "商品链接需以 http:// 或 https:// 开头");
    let response;
    let scope;
    try {
        ({ response, scope } = await fetchUpstream(ctx, parsed.href, { headers: { accept: "text/html,application/xhtml+xml" } }, { signal }));
    } catch (error) {
        if (signal?.aborted) throw new HttpError(499, "aborted", "已取消商品链接读取");
        throw new HttpError(502, "page-unreadable", "商品页面读取失败：请改用可公开访问的页面");
    }
    try {
        if (!response.ok) {
            const detail = await upstreamErrorFromResponse(response, "商品页面读取失败");
            throw new HttpError(502, "page-unreadable", `商品页面读取失败（HTTP ${response.status}）：${detail.message}`);
        }
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) {
            throw new HttpError(422, "page-not-html", `链接返回的不是商品网页（${contentType}），请粘贴商品详情页地址`);
        }
        return { html: await response.text(), finalUrl: response.url || parsed.href };
    } finally {
        scope?.dispose();
    }
}

export async function readPage(ctx, input) {
    const { html, finalUrl } = await loadHtml(ctx, input.url, input.signal);
    const { document } = parseHTML(html);
    const structured = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map((node) => node.textContent?.trim() ?? "")
        .filter(Boolean)
        .join("\n");
    document.querySelectorAll("script,style,noscript,svg,template,nav,footer").forEach((node) => node.remove());
    const content = `${structured}\n${document.body?.textContent ?? ""}`.replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!content) throw new HttpError(422, "page-empty", "商品页面没有可读取的正文；登录页、验证码或动态渲染页面需改用可公开访问的链接");
    return { title: document.querySelector("title")?.textContent?.trim() ?? "", content, finalUrl };
}

export async function parseProductLink(ctx, input) {
    const { html, finalUrl } = await loadHtml(ctx, input.url, input.signal);
    const { document } = parseHTML(html);

    const toAbsUrl = (raw) => {
        const trimmed = String(raw ?? "").trim();
        if (!trimmed || trimmed.startsWith("data:image/svg")) return null;
        try {
            const resolved = new URL(trimmed, finalUrl);
            if (resolved.protocol === "http:" || resolved.protocol === "https:") return resolved.href;
        } catch {
            return null;
        }
        return null;
    };

    const images = new Set();
    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach((meta) => {
        const absolute = toAbsUrl(meta.getAttribute("content"));
        if (absolute) images.add(absolute);
    });

    document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
        try {
            const data = JSON.parse(node.textContent ?? "");
            const rawImage = data?.image;
            if (typeof rawImage === "string") {
                const absolute = toAbsUrl(rawImage);
                if (absolute) images.add(absolute);
            } else if (Array.isArray(rawImage)) {
                rawImage.forEach((entry) => {
                    if (typeof entry !== "string") return;
                    const absolute = toAbsUrl(entry);
                    if (absolute) images.add(absolute);
                });
            }
        } catch {
            /* 结构不合法就跳过，不因此让整页解析失败 */
        }
    });

    document.querySelectorAll("img").forEach((node) => {
        const absolute = toAbsUrl(node.getAttribute("data-old-hires") || node.getAttribute("data-src") || node.getAttribute("src"));
        if (absolute && !/sprite|icon|logo|avatar|pixel/i.test(absolute)) images.add(absolute);
    });

    const sellingPoints = [];
    document.querySelectorAll("#feature-bullets li, .a-unordered-list .a-list-item, ul li").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (text.length >= 8 && text.length <= 240 && sellingPoints.length < 8 && !sellingPoints.includes(text)) sellingPoints.push(text);
    });

    const title =
        document.querySelector("#productTitle, h1")?.textContent?.replace(/\s+/g, " ").trim() ||
        document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
        document.querySelector("title")?.textContent?.trim() ||
        "商品详情";

    return { title, sellingPoints, images: Array.from(images).slice(0, 16), finalUrl };
}
