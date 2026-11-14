import { compositeSubjectImage, type PixelCompositor } from "@/services/api/tools/local-pixel";
import { createTaskRecord, transitionTask, type ToolTask, type ToolTaskResultItem } from "@/services/api/tools/task-machine";
import { PIXEL_TOOL_META, pixelInputSnapshot, type PixelAsset, type PixelMaskSource, type PixelToolId } from "@/features/tools/registry/local-pixel";

export type PixelRunInput = {
    toolId: PixelToolId;
    assets: PixelAsset[];
    masks: Record<string, { id?: string; url: string; source: PixelMaskSource }>;
    draftRevision?: number | null;
    at?: number;
};

/** 本地逐张处理，不经过生图网关；失败不会返回半批成功结果。 */
export async function runLocalPixelTask(input: PixelRunInput, deps: { compositor?: PixelCompositor; persist?: (task: ToolTask) => void } = {}): Promise<ToolTask> {
    const at = input.at ?? Date.now();
    const background = PIXEL_TOOL_META[input.toolId].background;
    const maskIds = Object.fromEntries(input.assets.flatMap((asset) => {
        const mask = input.masks[asset.id];
        return mask?.source === "mask" && mask.id ? [[asset.id, mask.id]] : [];
    }));
    let task = createTaskRecord({
        toolId: input.toolId,
        capability: "image",
        prompt: PIXEL_TOOL_META[input.toolId].action,
        configSnapshot: { capability: "image", model: "local-mask-compositor", count: String(input.assets.length) },
        sourceAssetIds: input.assets.map((asset) => asset.id),
        draftRevision: input.draftRevision,
        inputSnapshot: pixelInputSnapshot(input.toolId, input.assets, maskIds),
        at,
    });
    const save = (next: ToolTask) => { task = next; deps.persist?.(task); };
    save(transitionTask(task, "validating", { at }));
    save(transitionTask(task, "submitting", { at }));
    save(transitionTask(task, "running", { at }));
    const items: ToolTaskResultItem[] = [];
    try {
        for (const asset of input.assets) {
            const mask = input.masks[asset.id];
            const blob = await compositeSubjectImage({ sourceUrl: asset.url, maskUrl: mask?.source === "mask" ? mask.url : undefined, background }, deps.compositor);
            const url = URL.createObjectURL(blob);
            items.push({ id: `${task.id}-${items.length}`, kind: "image", url, blob, mimeType: "image/png", bytes: blob.size, payloadDropped: false });
        }
    } catch (error) {
        for (const item of items) if (item.url) URL.revokeObjectURL(item.url);
        save(transitionTask(task, "failed", { error: { code: "mask-required", message: `${assetName(input, items.length)}：${error instanceof Error ? error.message : "图片处理失败"}`, retryable: false }, at: Date.now() }));
        return task;
    }
    if (!items.length) {
        save(transitionTask(task, "failed", { error: { code: "source-missing", message: "请先上传图片。", retryable: false }, at: Date.now() }));
        return task;
    }
    save(transitionTask(task, "succeeded", { result: { items, receivedAt: Date.now() }, at: Date.now() }));
    return task;
}

function assetName(input: PixelRunInput, index: number) {
    return input.assets[index]?.name ?? "图片";
}
