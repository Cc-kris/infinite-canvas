/** 文本 / 视觉问答：OpenAI Responses、chat/completions 回落与 Gemini streamGenerateContent。 */
import { randomUUID } from "node:crypto";

import { buildApiUrl, fetchUpstream, geminiApiUrl, geminiHeaders, isRecord, openAiHeaders, readApiErrorMessage, readResponseText, statusMessage, UpstreamError } from "./shared.mjs";

class ResponsesEndpointUnsupportedError extends Error {
    constructor(message) {
        super(message);
        this.name = "ResponsesEndpointUnsupportedError";
        this.code = "responses-endpoint-unsupported";
    }
}

/** 已判定不支持 /responses 的上游（按 baseUrl+apiFormat 记），避免每次都多打一次 404。 */
const responsesUnsupportedUpstreams = new Set();

function responsesUpstreamKey(config) {
    return `${String(config.baseUrl || "").trim().replace(/\/+$/, "")}|${config.apiFormat}`;
}

function withSystemMessage(config, messages) {
    const systemPrompt = String(config.systemPrompt || "").trim();
    return systemPrompt ? [{ role: "system", content: systemPrompt }, ...messages] : messages;
}

function toResponseContent(content) {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? { type: "input_text", text: item.text } : { type: "input_image", image_url: item.image_url?.url || "" }));
}

function toResponseInput(messages) {
    return messages.flatMap((message) => {
        if ("type" in message) return [message];
        if (message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
        return [{ role: message.role, content: toResponseContent(message.content || "") }];
    });
}

function toResponseTool(tool) {
    return { type: "function", name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters, strict: tool.function.strict };
}

function parseToolResponse(payload) {
    const output = payload?.output || [];
    const content =
        payload?.output_text ||
        output
            .flatMap((item) => (item.type === "message" ? item.content || [] : []))
            .map((item) => item.text || "")
            .join("");
    const toolCalls = output
        .filter((item) => item.type === "function_call")
        .map((item) => ({ id: item.call_id || item.id || "", type: "function", function: { name: item.name || "", arguments: item.arguments || "{}" } }))
        .filter((item) => item.id && item.function.name);
    return { content, toolCalls };
}

function validateResponsePayload(payload) {
    if (typeof payload?.code === "number" && payload.code !== 0) throw new UpstreamError(payload.msg || "文本请求失败");
    if (payload?.error?.message) throw new UpstreamError(payload.error.message);
}

function responseErrorMessage(value) {
    if (!isRecord(value)) return "";
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    return String(value.msg || error?.message || responseError?.message || "");
}

function validateGeminiPayload(payload) {
    if (payload?.error?.message) throw new UpstreamError(payload.error.message);
    if (payload?.promptFeedback?.blockReason) throw new UpstreamError(`Gemini 拒绝了该提示词（${payload.promptFeedback.blockReason}）`);
}

function consumeResponseStreamBlock(block, state, onDelta) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    let event;
    try {
        event = JSON.parse(data);
    } catch {
        return;
    }
    const type = String(event.type || "");
    const errorMessage = responseErrorMessage(event);
    if (errorMessage) state.error = errorMessage;
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
        state.text += event.delta;
        onDelta?.(state.text);
    }
    if (type === "response.output_text.done" && !state.text && typeof event.text === "string") {
        state.text = event.text;
        onDelta?.(state.text);
    }
    if (type === "response.completed" && isRecord(event.response)) state.payload = event.response;
    else if (Array.isArray(event.output)) state.payload = event;
}

function consumeStreamText(state, text, consumeBlock) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeBlock(state.buffer.slice(0, index));
        state.buffer = state.buffer.slice(index + match[0].length);
    }
}

async function requestStreamingResponse(ctx, config, body, { tools, toolChoice, signal, onDelta }) {
    const requestTools = tools?.length ? tools.map(toResponseTool) : undefined;
    const payloadBody = {
        ...body,
        stream: true,
        ...(requestTools ? { tools: requestTools } : {}),
        ...(requestTools && toolChoice ? { tool_choice: toolChoice } : {}),
    };
    const { response, scope } = await fetchUpstream(
        ctx,
        buildApiUrl(config.baseUrl, "/responses"),
        { method: "POST", headers: { ...openAiHeaders(config, "application/json"), Accept: "text/event-stream" }, body: JSON.stringify(payloadBody) },
        { signal },
    );
    try {
        if (!response.ok) {
            const text = await readResponseText(response);
            const message = readApiErrorMessage(text) || statusMessage(response.status) || "文本请求失败";
            if (response.status === 404 || response.status === 405) throw new ResponsesEndpointUnsupportedError(message);
            throw new UpstreamError(message, response.status, text.slice(0, 300));
        }
        if (!response.body) {
            const payload = await response.json();
            validateResponsePayload(payload);
            return parseToolResponse(payload);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const state = { buffer: "", text: "", payload: undefined, error: "" };
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            consumeStreamText(state, decoder.decode(value, { stream: true }), (block) => consumeResponseStreamBlock(block, state, onDelta));
            if (state.error) throw new UpstreamError(state.error);
        }
        consumeStreamText(state, decoder.decode(), (block) => consumeResponseStreamBlock(block, state, onDelta));
        if (state.buffer.trim()) consumeResponseStreamBlock(state.buffer, state, onDelta);
        if (state.error) throw new UpstreamError(state.error);
        if (!state.payload) return { content: state.text, toolCalls: [] };
        validateResponsePayload(state.payload);
        const result = parseToolResponse(state.payload);
        return { ...result, content: state.text || result.content };
    } finally {
        scope.dispose();
    }
}

function toChatCompletionMessages(messages) {
    const result = [];
    for (const message of messages) {
        if ("type" in message) {
            if (message.type === "function_call") result.push({ role: "assistant", content: message.arguments || "" });
            continue;
        }
        if (message.role === "tool") {
            result.push({ role: "user", content: message.content || "" });
            continue;
        }
        const content = message.content || "";
        if (typeof content === "string") {
            result.push({ role: message.role, content });
            continue;
        }
        result.push({
            role: message.role,
            content: content.map((item) => (item.type === "text" ? { type: "text", text: item.text } : { type: "image_url", image_url: { url: item.image_url?.url || "" } })),
        });
    }
    return result;
}

function chatCompletionText(value) {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    return value.map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : "")).join("");
}

async function requestChatCompletions(ctx, config, messages, { tools, toolChoice, signal, onDelta }) {
    const requestTools = tools?.length ? tools.map((tool) => ({ type: "function", function: tool.function })) : undefined;
    const body = JSON.stringify({
        model: config.model,
        messages: toChatCompletionMessages(messages),
        stream: true,
        ...(requestTools ? { tools: requestTools } : {}),
        ...(requestTools && toolChoice ? { tool_choice: toolChoice } : {}),
    });
    const send = () =>
        fetchUpstream(
            ctx,
            buildApiUrl(config.baseUrl, "/chat/completions"),
            { method: "POST", headers: { ...openAiHeaders(config, "application/json"), Accept: "text/event-stream" }, body },
            { signal },
        );
    let { response, scope } = await send();
    try {
        if (!response.ok) {
            const contentType = String(response.headers.get("content-type") || "").toLowerCase();
            const retryableHtml = contentType.includes("text/html") && (response.status === 400 || response.status === 408 || response.status === 429 || response.status >= 500);
            if (retryableHtml) {
                await readResponseText(response);
                scope.dispose();
                await new Promise((resolve) => setTimeout(resolve, 300));
                ({ response, scope } = await send());
            }
        }
        if (!response.ok) throw new UpstreamError(readApiErrorMessage(await readResponseText(response)) || statusMessage(response.status) || "文本请求失败", response.status);
        if (!response.body) {
            const payload = await response.json();
            if (payload?.error?.message) throw new UpstreamError(payload.error.message);
            const content = chatCompletionText(payload?.choices?.[0]?.message?.content);
            if (content) onDelta?.(content);
            return { content, toolCalls: [] };
        }

        let text = "";
        let errorMessage = "";
        const state = { buffer: "" };
        const consumeBlock = (block) => {
            const data = block
                .split(/\r?\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).replace(/^ /, ""))
                .join("\n")
                .trim();
            if (!data || data === "[DONE]") return;
            let event;
            try {
                event = JSON.parse(data);
            } catch {
                return;
            }
            const message = responseErrorMessage(event);
            if (message) errorMessage = message;
            const delta = chatCompletionText(event.choices?.[0]?.delta?.content);
            if (delta) {
                text += delta;
                onDelta?.(text);
            }
            const fallbackContent = chatCompletionText(event.choices?.[0]?.message?.content);
            if (!delta && fallbackContent) {
                text += fallbackContent;
                onDelta?.(text);
            }
        };
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            consumeStreamText(state, decoder.decode(value, { stream: true }), consumeBlock);
            if (errorMessage) throw new UpstreamError(errorMessage);
        }
        consumeStreamText(state, decoder.decode(), consumeBlock);
        if (state.buffer.trim()) consumeBlock(state.buffer);
        if (errorMessage) throw new UpstreamError(errorMessage);
        if (!text) throw new UpstreamError("上游没有返回文本内容");
        return { content: text, toolCalls: [] };
    } finally {
        scope.dispose();
    }
}

function geminiTextContent(content) {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? item.text : item.image_url?.url || "")).join("\n");
}

function jsonValue(value) {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function jsonObject(value) {
    const parsed = jsonValue(value);
    return isRecord(parsed) ? parsed : {};
}

function toGeminiImagePart(url) {
    const match = String(url || "").match(/^data:([^;,]+);base64,(.+)$/s);
    if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
    return { fileData: { fileUri: url, mimeType: "image/png" } };
}

function toGeminiParts(content) {
    if (!Array.isArray(content)) return [{ text: String(content || "") }];
    return content.map((item) => (item.type === "text" ? { text: item.text } : toGeminiImagePart(item.image_url?.url || "")));
}

function toGeminiContents(messages) {
    const callNameById = new Map();
    return messages.flatMap((message) => {
        if ("type" in message) {
            callNameById.set(message.call_id, message.name);
            return [{ role: "model", parts: [{ functionCall: { id: message.call_id, name: message.name, args: jsonObject(message.arguments) }, ...(message.thoughtSignature ? { thoughtSignature: message.thoughtSignature } : {}) }] }];
        }
        if (message.role === "tool") {
            const name = callNameById.get(message.tool_call_id) || "tool_result";
            return [{ role: "user", parts: [{ functionResponse: { id: message.tool_call_id, name, response: { result: jsonValue(message.content) } } }] }];
        }
        return [{ role: message.role === "assistant" ? "model" : "user", parts: toGeminiParts(message.content) }];
    });
}

function toGeminiToolOptions(tools, toolChoice) {
    if (!tools?.length) return {};
    const functionDeclarations = tools.map((tool) => ({ name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters }));
    const functionCallingConfig =
        typeof toolChoice === "object" ? { mode: "ANY", allowedFunctionNames: [toolChoice.name] } : { mode: toolChoice === "required" ? "ANY" : "AUTO" };
    return { tools: [{ functionDeclarations }], toolConfig: { functionCallingConfig } };
}

function toGeminiBody(config, messages, extra) {
    const systemText = [String(config.systemPrompt || "").trim(), ...messages.flatMap((message) => (!("type" in message) && message.role === "system" ? [geminiTextContent(message.content)] : []))]
        .filter(Boolean)
        .join("\n\n");
    const contents = toGeminiContents(messages.filter((message) => ("type" in message ? true : message.role !== "system")));
    return { contents, ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}), ...extra };
}

function parseGeminiToolResponse(payload) {
    validateGeminiPayload(payload);
    const parts = payload?.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const content = parts.map((part) => part.text || "").join("");
    const toolCalls = parts
        .map((part) => part.functionCall)
        .filter((call) => Boolean(call?.name))
        .map((call) => {
            const part = parts.find((item) => item.functionCall === call);
            const thoughtSignature = part?.thoughtSignature || part?.thought_signature;
            return { id: call.id || randomUUID(), type: "function", function: { name: call.name || "", arguments: JSON.stringify(call.args || {}) }, ...(thoughtSignature ? { thoughtSignature } : {}) };
        });
    return { content, toolCalls };
}

function consumeGeminiStreamBlock(block, state, onDelta) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    let payload;
    try {
        payload = JSON.parse(data);
    } catch {
        return;
    }
    const result = parseGeminiToolResponse(payload);
    if (result.content) {
        state.text += result.content;
        onDelta?.(state.text);
    }
    state.toolCalls.push(...result.toolCalls);
}

async function requestGeminiStreamingResponse(ctx, config, body, { signal, onDelta }) {
    const { response, scope } = await fetchUpstream(
        ctx,
        `${geminiApiUrl(config, "streamGenerateContent")}?alt=sse`,
        { method: "POST", headers: geminiHeaders(config), body: JSON.stringify(body) },
        { signal },
    );
    try {
        if (!response.ok) throw new UpstreamError(readApiErrorMessage(await readResponseText(response)) || statusMessage(response.status) || "文本请求失败", response.status);
        if (!response.body) return parseGeminiToolResponse(await response.json());
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const state = { buffer: "", text: "", toolCalls: [] };
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            consumeStreamText(state, decoder.decode(value, { stream: true }), (block) => consumeGeminiStreamBlock(block, state, onDelta));
        }
        consumeStreamText(state, decoder.decode(), (block) => consumeGeminiStreamBlock(block, state, onDelta));
        if (state.buffer.trim()) consumeGeminiStreamBlock(state.buffer, state, onDelta);
        return { content: state.text, toolCalls: state.toolCalls };
    } finally {
        scope.dispose();
    }
}

export async function callTextModel(ctx, config, messages, options = {}) {
    const { signal, onDelta, tools = [], toolChoice = "auto" } = options;
    if (config.apiFormat === "gemini") {
        return requestGeminiStreamingResponse(ctx, config, toGeminiBody(config, messages, toGeminiToolOptions(tools, toolChoice)), { signal, onDelta });
    }
    const messagesWithSystem = withSystemMessage(config, messages);
    const body = {
        model: config.model,
        input: toResponseInput(messagesWithSystem),
        ...(config.reasoningEffort === "auto" ? {} : { reasoning: { effort: config.reasoningEffort } }),
    };
    const upstream = responsesUpstreamKey(config);
    let answer = "";
    if (!responsesUnsupportedUpstreams.has(upstream)) {
        try {
            return await requestStreamingResponse(ctx, config, body, { tools, toolChoice, signal, onDelta });
        } catch (error) {
            if (!(error instanceof ResponsesEndpointUnsupportedError)) throw error;
            responsesUnsupportedUpstreams.add(upstream);
            answer = "";
        }
    }
    if (responsesUnsupportedUpstreams.has(upstream)) {
        const result = await requestChatCompletions(ctx, config, messagesWithSystem, { tools, toolChoice, signal, onDelta });
        return { ...result, content: answer || result.content };
    }
    return { content: answer, toolCalls: [] };
}

export { validateGeminiPayload };
